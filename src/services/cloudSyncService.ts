import * as FileSystem from 'expo-file-system/legacy';
import {
  clearSyncQueueIds,
  getAppMeta,
  insertExpense,
  insertFlight,
  insertMemory,
  insertStay,
  insertTransport,
  insertTrip,
  insertTripStop,
  listExpenses,
  listFlights,
  listLoyaltyAccounts,
  listMemories,
  listStays,
  listSyncQueue,
  listTransports,
  listTrips,
  listTripStops,
  setAppMeta,
  upsertLoyaltyAccount,
} from '../db/database';
import { getSupabaseClient, isCloudConfigured } from './authService';
import { deleteEntityFromCloud, deleteMemoryFromCloud, deleteTripFromCloud } from './cloudDeleteService';
import { CoTravelerRole, UserProfile } from '../types/models';
import {
  buildTripMemberRows,
  isLocalOwnerId,
  normalizeCoTravelerKey,
} from './sharingHelpers';
import {
  cloudRowToExpense,
  cloudRowToFlight,
  cloudRowToLoyalty,
  cloudRowToMemory,
  cloudRowToStay,
  cloudRowToStop,
  cloudRowToTransport,
  cloudRowToTrip,
  expenseToCloudRow,
  flightToCloudRow,
  LocalBackupSnapshot,
  loyaltyToCloudRow,
  memoryToCloudRow,
  shouldAcceptRemoteRecord,
  stayToCloudRow,
  stopToCloudRow,
  transportToCloudRow,
  tripToCloudRow,
  validateBackupSnapshot,
} from './cloudSyncMappers';

export {
  cloudRowToExpense,
  cloudRowToFlight,
  cloudRowToLoyalty,
  cloudRowToMemory,
  cloudRowToStay,
  cloudRowToStop,
  cloudRowToTransport,
  cloudRowToTrip,
  expenseToCloudRow,
  flightToCloudRow,
  LocalBackupSnapshot,
  loyaltyToCloudRow,
  memoryToCloudRow,
  shouldAcceptRemoteRecord,
  stayToCloudRow,
  stopToCloudRow,
  transportToCloudRow,
  tripToCloudRow,
  validateBackupSnapshot,
};

const MEDIA_KEY_MAP_META = 'r2_media_key_map_v1';
const LAST_SYNCED_AT_META = 'last_synced_at_v1';
const BASE_DIR = FileSystem.documentDirectory ?? '';

export type CloudSyncStatus =
  | 'offline_only'
  | 'signed_out'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'error';

export interface CloudSyncResult {
  status: 'unconfigured' | 'signed_out' | 'synced' | 'error';
  pushedRows: number;
  pulledRows: number;
  deletedRows: number;
  mediaUploaded: number;
  mediaDownloaded: number;
  syncedAt?: string;
  error?: string;
}

// ============================================================================
// Cloudflare R2 Presigned Media Upload / Download Helpers
// ============================================================================

interface MediaKeyMap {
  localToKey: Record<string, string>;
  keyToLocal: Record<string, string>;
}

function loadMediaKeyMap(): MediaKeyMap {
  try {
    const raw = getAppMeta(MEDIA_KEY_MAP_META);
    if (!raw) return { localToKey: {}, keyToLocal: {} };
    const parsed = JSON.parse(raw) as Partial<MediaKeyMap>;
    return {
      localToKey: parsed.localToKey ?? {},
      keyToLocal: parsed.keyToLocal ?? {},
    };
  } catch {
    return { localToKey: {}, keyToLocal: {} };
  }
}

function saveMediaKeyMap(map: MediaKeyMap): void {
  setAppMeta(MEDIA_KEY_MAP_META, JSON.stringify(map));
}

function extractFileIdFromUri(uri: string, fallbackId: string): string {
  const seg = uri.split('/').pop() || fallbackId;
  return seg.replace(/\.(webp|jpg|jpeg|png)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_') || fallbackId;
}

async function ensureLocalSubDir(subDir: string): Promise<string> {
  const dir = `${BASE_DIR}${subDir}/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // Non-fatal
  }
  return dir;
}

async function uploadLocalMediaToR2(
  localUri: string | undefined,
  tripId: string,
  mediaKind: 'memory' | 'receipt' | 'shared_receipt' | 'cover',
  fallbackId: string,
  accessToken: string,
  keyMap: MediaKeyMap
): Promise<{ objectKey: string | null; uploaded: boolean }> {
  if (!localUri || (!localUri.startsWith('file://') && !localUri.startsWith('/'))) {
    return { objectKey: null, uploaded: false };
  }

  // Already uploaded previously
  if (keyMap.localToKey[localUri]) {
    return { objectKey: keyMap.localToKey[localUri], uploaded: false };
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { objectKey: null, uploaded: false };

  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) return { objectKey: null, uploaded: false };

    const fileId = extractFileIdFromUri(localUri, fallbackId);
    const presignRes = await fetch(`${supabaseUrl}/functions/v1/r2-presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ tripId, mediaKind, fileId, action: 'put' }),
    });
    if (!presignRes.ok) return { objectKey: null, uploaded: false };

    const data = (await presignRes.json()) as { uploadUrl?: string; objectKey?: string };
    if (!data.uploadUrl || !data.objectKey) return { objectKey: null, uploaded: false };

    const uploadRes = await FileSystem.uploadAsync(data.uploadUrl, localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'image/webp' },
    });

    if (uploadRes.status >= 200 && uploadRes.status < 300) {
      keyMap.localToKey[localUri] = data.objectKey;
      keyMap.keyToLocal[data.objectKey] = localUri;
      return { objectKey: data.objectKey, uploaded: true };
    }
    return { objectKey: null, uploaded: false };
  } catch {
    // R2 optional or temporarily offline — Postgres row still syncs cleanly
    return { objectKey: null, uploaded: false };
  }
}

async function downloadCloudMediaFromR2(
  objectKey: string | null | undefined,
  tripId: string,
  mediaKind: 'memory' | 'receipt' | 'shared_receipt' | 'cover',
  accessToken: string,
  keyMap: MediaKeyMap
): Promise<{ localUri?: string; downloaded: boolean }> {
  if (!objectKey || !BASE_DIR) return { downloaded: false };

  // Reuse cached local file if it still exists on disk
  const cachedLocal = keyMap.keyToLocal[objectKey];
  if (cachedLocal) {
    try {
      const info = await FileSystem.getInfoAsync(cachedLocal);
      if (info.exists) return { localUri: cachedLocal, downloaded: false };
    } catch {
      // Re-download below
    }
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { downloaded: false };

  try {
    const presignRes = await fetch(`${supabaseUrl}/functions/v1/r2-presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ tripId, mediaKind, objectKey, action: 'get' }),
    });
    if (!presignRes.ok) return { downloaded: false };

    const data = (await presignRes.json()) as { downloadUrl?: string };
    if (!data.downloadUrl) return { downloaded: false };

    const folder =
      mediaKind === 'receipt' || mediaKind === 'shared_receipt'
        ? `receipts/${tripId}`
        : `memories/${tripId}`;
    const dir = await ensureLocalSubDir(folder);
    const fileName = objectKey.split('/').pop() || `dl_${Date.now()}.webp`;
    const destUri = `${dir}${fileName}`;

    const dl = await FileSystem.downloadAsync(data.downloadUrl, destUri);
    if (dl.status >= 200 && dl.status < 300) {
      keyMap.keyToLocal[objectKey] = dl.uri;
      keyMap.localToKey[dl.uri] = objectKey;
      return { localUri: dl.uri, downloaded: true };
    }
    return { downloaded: false };
  } catch {
    return { downloaded: false };
  }
}

// ============================================================================
// Main Bidirectional Cloud Sync Engine
// ============================================================================

export function getLastSyncedAt(): string | null {
  return getAppMeta(LAST_SYNCED_AT_META);
}

/**
 * Runs a complete two-way Push + Pull sync between local SQLite and Supabase Postgres + Cloudflare R2.
 *
 * Guarantees:
 * - Zero network calls & immediate graceful exit when Supabase env vars are not configured.
 * - Flushes queued deletes first so removed items never resurrect on pull.
 * - Upserts in strict foreign-key order (trips -> children + loyalty + preferences).
 * - Merges remote data without clobbering newer local edits or double-crediting loyalty miles.
 */
export async function runFullCloudSync(
  profile: UserProfile | null,
  options?: { uploadMedia?: boolean }
): Promise<CloudSyncResult> {
  if (!isCloudConfigured()) {
    return {
      status: 'unconfigured',
      pushedRows: 0,
      pulledRows: 0,
      deletedRows: 0,
      mediaUploaded: 0,
      mediaDownloaded: 0,
    };
  }

  const sb = getSupabaseClient();
  if (!sb || !profile || profile.authMode !== 'google') {
    return {
      status: 'signed_out',
      pushedRows: 0,
      pulledRows: 0,
      deletedRows: 0,
      mediaUploaded: 0,
      mediaDownloaded: 0,
    };
  }

  try {
    const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
    const session = sessionData?.session;
    if (sessionErr || !session?.user || !session.access_token) {
      return {
        status: 'signed_out',
        pushedRows: 0,
        pulledRows: 0,
        deletedRows: 0,
        mediaUploaded: 0,
        mediaDownloaded: 0,
      };
    }

    const userId = session.user.id;
    const accessToken = session.access_token;
    const shouldUploadMedia = options?.uploadMedia ?? true;
    const keyMap = loadMediaKeyMap();

    let pushedRows = 0;
    let pulledRows = 0;
    let deletedRows = 0;
    let mediaUploaded = 0;
    let mediaDownloaded = 0;

    // ------------------------------------------------------------------
    // 1. Flush queued DELETES first (prevents resurrecting deleted items)
    // ------------------------------------------------------------------
    const queue = listSyncQueue();
    const pendingDeletes = queue.filter((q) => q.action === 'delete');
    const deletedSet = new Set<string>();
    const flushedQueueIds: string[] = [];

    for (const item of pendingDeletes) {
      let synced = false;
      if (item.entity === 'trips') {
        const res = await deleteTripFromCloud(item.entityId, []);
        synced = res.synced;
      } else if (item.entity === 'memories') {
        const tripId = String(item.payload?.tripId || '');
        if (tripId) {
          const res = await deleteMemoryFromCloud({
            id: item.entityId,
            tripId,
            photoUri: item.payload?.photoUri as string | undefined,
            thumbUri: item.payload?.thumbUri as string | undefined,
          });
          synced = res.synced;
        } else {
          const { error } = await sb.from('memories').delete().eq('id', item.entityId);
          synced = !error;
        }
      } else if (
        item.entity === 'flights' ||
        item.entity === 'transports' ||
        item.entity === 'trip_stops' ||
        item.entity === 'stays' ||
        item.entity === 'expenses'
      ) {
        const res = await deleteEntityFromCloud(item.entity, item.entityId);
        synced = res.synced;
      }

      if (synced) {
        deletedRows += 1;
        deletedSet.add(`${item.entity}:${item.entityId}`);
        flushedQueueIds.push(item.id);
      }
    }

    // ------------------------------------------------------------------
    // 2. Push local records to Supabase Postgres (+ optional R2 media)
    // ------------------------------------------------------------------
    const localTrips = listTrips();
    const localFlights = listFlights();
    const localTransports = listTransports();
    const localStops = listTripStops();
    const localStays = listStays();
    const localExpenses = listExpenses();
    const localMemories = listMemories();
    const localLoyalty = listLoyaltyAccounts();

    // Build set of trips where the current user is strictly a 'viewer' (never push writes for those)
    const myEmail = normalizeCoTravelerKey(session.user.email || profile.email || '');
    const viewerTripIds = new Set<string>();
    const ownedTrips = localTrips.filter((t) => {
      const owned = isLocalOwnerId(t.ownerId) || t.ownerId === userId;
      if (!owned && myEmail && t.coTravelerRoles?.[myEmail] === 'viewer') {
        viewerTripIds.add(t.id);
      }
      return owned;
    });

    // 2a. Owned Trips first (FK parent for all children, trip_members & R2 membership check)
    if (ownedTrips.length > 0) {
      const tripRows = ownedTrips.map((t) =>
        tripToCloudRow(t, userId, t.coverPhotoUri ? keyMap.localToKey[t.coverPhotoUri] ?? null : null)
      );
      const { error } = await sb.from('trips').upsert(tripRows, { onConflict: 'id' });
      if (error) throw new Error(`Trips sync failed: ${error.message}`);
      pushedRows += tripRows.length;

      // Sync trip_members table (upserts invited emails+roles and prunes removed members)
      const desiredMembers = ownedTrips.flatMap((t) => buildTripMemberRows(t));
      if (desiredMembers.length > 0) {
        const { error: memUpsertErr } = await sb
          .from('trip_members')
          .upsert(desiredMembers, { onConflict: 'trip_id,invited_email' });
        if (memUpsertErr) {
          throw new Error(`Trip members sync failed: ${memUpsertErr.message}`);
        }
      }
      const ownedIds = ownedTrips.map((t) => t.id);
      const desiredSet = new Set(
        desiredMembers.map((m) => `${m.trip_id}:${m.invited_email}`)
      );
      const { data: existingCloudMembers } = await sb
        .from('trip_members')
        .select('trip_id, invited_email')
        .in('trip_id', ownedIds);
      for (const cm of (existingCloudMembers ?? []) as Array<{
        trip_id: string;
        invited_email: string;
      }>) {
        const normEmail = normalizeCoTravelerKey(cm.invited_email || '');
        if (!desiredSet.has(`${cm.trip_id}:${normEmail}`)) {
          await sb
            .from('trip_members')
            .delete()
            .eq('trip_id', cm.trip_id)
            .eq('invited_email', cm.invited_email);
        }
      }

      // Upload any new trip cover photos now that trip rows exist in RLS
      if (shouldUploadMedia) {
        for (const t of ownedTrips) {
          if (t.coverPhotoUri && !keyMap.localToKey[t.coverPhotoUri]) {
            const up = await uploadLocalMediaToR2(
              t.coverPhotoUri,
              t.id,
              'cover',
              `cover_${t.id}`,
              accessToken,
              keyMap
            );
            if (up.objectKey) {
              if (up.uploaded) mediaUploaded += 1;
              await sb.from('trips').update({ cover_photo_key: up.objectKey }).eq('id', t.id);
            }
          }
        }
      }
    }

    // 2b. Flights (skip viewer-only trips)
    const editableFlights = localFlights.filter((f) => !viewerTripIds.has(f.tripId));
    if (editableFlights.length > 0) {
      const rows = editableFlights.map(flightToCloudRow);
      const { error } = await sb.from('flights').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Flights sync failed: ${error.message}`);
      pushedRows += rows.length;
    }

    // 2c. Transports (Train / Bus / Ferry / Car)
    const editableTransports = localTransports.filter((t) => !viewerTripIds.has(t.tripId));
    if (editableTransports.length > 0) {
      const rows = editableTransports.map(transportToCloudRow);
      const { error } = await sb.from('transports').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Transports sync failed: ${error.message}`);
      pushedRows += rows.length;
    }

    // 2d. Trip Stops
    const editableStops = localStops.filter((s) => !viewerTripIds.has(s.tripId));
    if (editableStops.length > 0) {
      const rows = editableStops.map(stopToCloudRow);
      const { error } = await sb.from('trip_stops').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Stops sync failed: ${error.message}`);
      pushedRows += rows.length;
    }

    // 2e. Stays (+ optional receipt R2 upload)
    const editableStays = localStays.filter((s) => !viewerTripIds.has(s.tripId));
    if (editableStays.length > 0) {
      const rows: Record<string, unknown>[] = [];
      for (const s of editableStays) {
        let receiptKey = s.receiptUri ? keyMap.localToKey[s.receiptUri] ?? null : null;
        if (shouldUploadMedia && s.receiptUri && !receiptKey) {
          const up = await uploadLocalMediaToR2(
            s.receiptUri,
            s.tripId,
            'receipt',
            `stay_${s.id}`,
            accessToken,
            keyMap
          );
          if (up.uploaded) mediaUploaded += 1;
          receiptKey = up.objectKey;
        }
        rows.push(stayToCloudRow(s, receiptKey));
      }
      const { error } = await sb.from('stays').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Stays sync failed: ${error.message}`);
      pushedRows += rows.length;
    }

    // 2f. Expenses authored by this user:
    //     - Personal (isShared = false): receipt goes under receipts/{tripId}/{userId}/
    //     - Shared   (isShared = true):  receipt goes under shared-receipts/{tripId}/ (viewable by Editors)
    const myEditableExpenses = localExpenses.filter(
      (e) =>
        !viewerTripIds.has(e.tripId) &&
        (!e.authorId || isLocalOwnerId(e.authorId) || e.authorId === userId)
    );
    if (myEditableExpenses.length > 0) {
      const rows: Record<string, unknown>[] = [];
      for (const e of myEditableExpenses) {
        const expectedPrefix = e.isShared
          ? `shared-receipts/${e.tripId}/`
          : `receipts/${e.tripId}/${userId}/`;
        let receiptKey = e.receiptUri ? keyMap.localToKey[e.receiptUri] ?? null : null;
        if (receiptKey && !receiptKey.startsWith(expectedPrefix)) {
          receiptKey = null;
        }
        if (shouldUploadMedia && e.receiptUri && !receiptKey) {
          const up = await uploadLocalMediaToR2(
            e.receiptUri,
            e.tripId,
            e.isShared ? 'shared_receipt' : 'receipt',
            `exp_${e.id}`,
            accessToken,
            keyMap
          );
          if (up.uploaded) mediaUploaded += 1;
          receiptKey = up.objectKey;
        }
        rows.push(expenseToCloudRow(e, userId, receiptKey));
      }
      const { error } = await sb.from('expenses').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Expenses sync failed: ${error.message}`);
      pushedRows += rows.length;
    }

    // 2g. Memories (+ WebP photo & thumbnail R2 upload)
    const editableMemories = localMemories.filter((m) => !viewerTripIds.has(m.tripId));
    if (editableMemories.length > 0) {
      const rows: Record<string, unknown>[] = [];
      for (const m of editableMemories) {
        let photoKey = m.photoUri ? keyMap.localToKey[m.photoUri] ?? null : null;
        let thumbKey = m.thumbUri ? keyMap.localToKey[m.thumbUri] ?? null : null;
        if (shouldUploadMedia && m.photoUri && !photoKey) {
          const up = await uploadLocalMediaToR2(
            m.photoUri,
            m.tripId,
            'memory',
            `mem_${m.id}`,
            accessToken,
            keyMap
          );
          if (up.uploaded) mediaUploaded += 1;
          photoKey = up.objectKey;
        }
        if (shouldUploadMedia && m.thumbUri && !thumbKey) {
          const up = await uploadLocalMediaToR2(
            m.thumbUri,
            m.tripId,
            'memory',
            `mem_${m.id}_thumb`,
            accessToken,
            keyMap
          );
          if (up.uploaded) mediaUploaded += 1;
          thumbKey = up.objectKey;
        }
        rows.push(memoryToCloudRow(m, userId, photoKey, thumbKey));
      }
      const { error } = await sb.from('memories').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Memories sync failed: ${error.message}`);
      pushedRows += rows.length;
    }

    // 2h. Loyalty Accounts & User Preferences
    if (localLoyalty.length > 0) {
      const rows = localLoyalty.map((acc) => loyaltyToCloudRow(acc, userId));
      const { error } = await sb.from('loyalty_accounts').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Loyalty sync failed: ${error.message}`);
      pushedRows += rows.length;
    }

    await sb.from('user_preferences').upsert(
      {
        user_id: userId,
        display_name: profile.displayName,
        home_currency: profile.homeCurrency,
        distance_unit: profile.distanceUnit,
        wifi_only_photo_sync: profile.wifiOnlyPhotoSync,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    // ------------------------------------------------------------------
    // 3. Pull & Merge remote rows from Supabase into local SQLite
    // ------------------------------------------------------------------
    const localTripById = new Map(localTrips.map((t) => [t.id, t]));
    const localFlightIds = new Set(localFlights.map((f) => f.id));
    const localTransportIds = new Set(localTransports.map((t) => t.id));
    const localStopIds = new Set(localStops.map((s) => s.id));
    const localStayIds = new Set(localStays.map((s) => s.id));
    const localExpenseIds = new Set(localExpenses.map((e) => e.id));
    const localMemoryById = new Map(localMemories.map((m) => [m.id, m]));
    const localLoyaltyById = new Map(localLoyalty.map((l) => [l.id, l]));

    const [
      remoteTripsRes,
      remoteMembersRes,
      remoteFlightsRes,
      remoteTransportsRes,
      remoteStopsRes,
      remoteStaysRes,
      remoteExpensesRes,
      remoteMemoriesRes,
      remoteLoyaltyRes,
    ] = await Promise.all([
      sb.from('trips').select('*'),
      sb.from('trip_members').select('trip_id, invited_email, role'),
      sb.from('flights').select('*'),
      sb.from('transports').select('*'),
      sb.from('trip_stops').select('*'),
      sb.from('stays').select('*'),
      sb.from('expenses').select('*'),
      sb.from('memories').select('*'),
      sb.from('loyalty_accounts').select('*'),
    ]);

    const memberRolesByTrip: Record<string, Record<string, CoTravelerRole>> = {};
    for (const m of (remoteMembersRes.data ?? []) as Array<{
      trip_id: string;
      invited_email: string;
      role: string;
    }>) {
      const tid = String(m.trip_id || '');
      const email = normalizeCoTravelerKey(String(m.invited_email || ''));
      if (!tid || !email) continue;
      if (!memberRolesByTrip[tid]) memberRolesByTrip[tid] = {};
      memberRolesByTrip[tid][email] = m.role === 'viewer' ? 'viewer' : 'editor';
    }

    for (const row of (remoteTripsRes.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.id);
      if (deletedSet.has(`trips:${id}`)) continue;
      const existing = localTripById.get(id);
      if (!existing || shouldAcceptRemoteRecord(existing.updatedAt, row.updated_at as string)) {
        let coverUri = existing?.coverPhotoUri;
        if (!coverUri && row.cover_photo_key) {
          const dl = await downloadCloudMediaFromR2(
            String(row.cover_photo_key),
            id,
            'cover',
            accessToken,
            keyMap
          );
          if (dl.downloaded) mediaDownloaded += 1;
          coverUri = dl.localUri;
        }
        insertTrip(cloudRowToTrip(row, coverUri, memberRolesByTrip[id]), { skipSyncQueue: true });
        pulledRows += 1;
      }
    }

    for (const row of (remoteFlightsRes.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.id);
      if (deletedSet.has(`flights:${id}`)) continue;
      if (!localFlightIds.has(id)) {
        insertFlight(cloudRowToFlight(row), { skipSyncQueue: true });
        pulledRows += 1;
      }
    }

    for (const row of (remoteTransportsRes.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.id);
      if (deletedSet.has(`transports:${id}`)) continue;
      if (!localTransportIds.has(id)) {
        insertTransport(cloudRowToTransport(row), { skipSyncQueue: true });
        pulledRows += 1;
      }
    }

    for (const row of (remoteStopsRes.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.id);
      if (deletedSet.has(`trip_stops:${id}`)) continue;
      if (!localStopIds.has(id)) {
        insertTripStop(cloudRowToStop(row), { skipSyncQueue: true });
        pulledRows += 1;
      }
    }

    for (const row of (remoteStaysRes.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.id);
      if (deletedSet.has(`stays:${id}`)) continue;
      if (!localStayIds.has(id)) {
        let receiptUri: string | undefined;
        if (row.receipt_r2_key) {
          const dl = await downloadCloudMediaFromR2(
            String(row.receipt_r2_key),
            String(row.trip_id),
            'receipt',
            accessToken,
            keyMap
          );
          if (dl.downloaded) mediaDownloaded += 1;
          receiptUri = dl.localUri;
        }
        insertStay(cloudRowToStay(row, receiptUri), { skipSyncQueue: true });
        pulledRows += 1;
      }
    }

    for (const row of (remoteExpensesRes.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.id);
      if (deletedSet.has(`expenses:${id}`)) continue;
      if (!localExpenseIds.has(id)) {
        let receiptUri: string | undefined;
        if (row.receipt_r2_key) {
          const r2Key = String(row.receipt_r2_key);
          const isSharedReceipt =
            Boolean(row.is_shared) || r2Key.startsWith('shared-receipts/');
          const dl = await downloadCloudMediaFromR2(
            r2Key,
            String(row.trip_id),
            isSharedReceipt ? 'shared_receipt' : 'receipt',
            accessToken,
            keyMap
          );
          if (dl.downloaded) mediaDownloaded += 1;
          receiptUri = dl.localUri;
        }
        insertExpense(cloudRowToExpense(row, receiptUri), { skipSyncQueue: true });
        pulledRows += 1;
      }
    }

    for (const row of (remoteMemoriesRes.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.id);
      if (deletedSet.has(`memories:${id}`)) continue;
      const existing = localMemoryById.get(id);
      if (!existing) {
        let photoUri: string | undefined;
        let thumbUri: string | undefined;
        if (row.photo_r2_key) {
          const dl = await downloadCloudMediaFromR2(
            String(row.photo_r2_key),
            String(row.trip_id),
            'memory',
            accessToken,
            keyMap
          );
          if (dl.downloaded) mediaDownloaded += 1;
          photoUri = dl.localUri;
        }
        if (row.thumb_r2_key) {
          const dl = await downloadCloudMediaFromR2(
            String(row.thumb_r2_key),
            String(row.trip_id),
            'memory',
            accessToken,
            keyMap
          );
          if (dl.downloaded) mediaDownloaded += 1;
          thumbUri = dl.localUri;
        }
        insertMemory(cloudRowToMemory(row, photoUri, thumbUri), { skipSyncQueue: true });
        pulledRows += 1;
      }
    }

    for (const row of (remoteLoyaltyRes.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.id);
      const existing = localLoyaltyById.get(id);
      if (!existing || shouldAcceptRemoteRecord(existing.updatedAt, row.updated_at as string)) {
        upsertLoyaltyAccount(cloudRowToLoyalty(row), { skipSyncQueue: true });
        pulledRows += 1;
      }
    }

    // Clear all flushed upsert & delete mutations from the queue
    const upsertIds = queue.filter((q) => q.action === 'upsert').map((q) => q.id);
    clearSyncQueueIds([...flushedQueueIds, ...upsertIds]);
    saveMediaKeyMap(keyMap);

    const syncedAt = new Date().toISOString();
    setAppMeta(LAST_SYNCED_AT_META, syncedAt);

    return {
      status: 'synced',
      pushedRows,
      pulledRows,
      deletedRows,
      mediaUploaded,
      mediaDownloaded,
      syncedAt,
    };
  } catch (err) {
    return {
      status: 'error',
      pushedRows: 0,
      pulledRows: 0,
      deletedRows: 0,
      mediaUploaded: 0,
      mediaDownloaded: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Portable Offline JSON Backup & Restore (Works Today Without Cloud Keys!)
// ============================================================================

export function buildLocalBackupSnapshot(): LocalBackupSnapshot {
  return {
    schemaVersion: 2,
    app: "Wanderer's Ledger",
    exportedAt: new Date().toISOString(),
    trips: listTrips(),
    flights: listFlights(),
    transports: listTransports(),
    stops: listTripStops(),
    stays: listStays(),
    expenses: listExpenses(),
    memories: listMemories(),
    loyaltyAccounts: listLoyaltyAccounts(),
  };
}

export function restoreFromBackupSnapshot(snapshot: LocalBackupSnapshot): {
  tripsRestored: number;
  itemsRestored: number;
} {
  let tripsRestored = 0;
  let itemsRestored = 0;

  for (const t of snapshot.trips) {
    if (!t?.id) continue;
    insertTrip(t, { skipSyncQueue: true });
    tripsRestored += 1;
  }
  for (const f of snapshot.flights) {
    if (!f?.id) continue;
    insertFlight(f, { skipSyncQueue: true });
    itemsRestored += 1;
  }
  for (const trn of snapshot.transports) {
    if (!trn?.id) continue;
    insertTransport(trn, { skipSyncQueue: true });
    itemsRestored += 1;
  }
  for (const s of snapshot.stops) {
    if (!s?.id) continue;
    insertTripStop(s, { skipSyncQueue: true });
    itemsRestored += 1;
  }
  for (const st of snapshot.stays) {
    if (!st?.id) continue;
    insertStay(st, { skipSyncQueue: true });
    itemsRestored += 1;
  }
  for (const e of snapshot.expenses) {
    if (!e?.id) continue;
    insertExpense(e, { skipSyncQueue: true });
    itemsRestored += 1;
  }
  for (const m of snapshot.memories) {
    if (!m?.id) continue;
    insertMemory(m, { skipSyncQueue: true });
    itemsRestored += 1;
  }
  for (const l of snapshot.loyaltyAccounts) {
    if (!l?.id) continue;
    upsertLoyaltyAccount(l, { skipSyncQueue: true });
    itemsRestored += 1;
  }

  return { tripsRestored, itemsRestored };
}
