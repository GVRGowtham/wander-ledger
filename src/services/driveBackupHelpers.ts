import { LocalBackupSnapshot, shouldAcceptRemoteRecord } from './cloudSyncMappers';
import {
  Expense,
  Flight,
  LoyaltyAccount,
  Memory,
  Stay,
  TransportLeg,
  Trip,
  TripStop,
} from '../types/models';

export const DRIVE_APP_DATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const DRIVE_MANIFEST_NAME = 'wanderers_ledger_manifest.json';
export const DRIVE_MEDIA_PREFIX = 'wl_media__';
export const DRIVE_BACKUP_SCHEMA_VERSION = 3 as const;

export type DriveMediaKind = 'memory' | 'thumb' | 'receipt' | 'cover';

export interface DriveMediaEntry {
  relPath: string;
  driveFileName: string;
  kind: DriveMediaKind;
  sizeBytes?: number;
}

export interface LocalMediaRef extends DriveMediaEntry {
  localUri: string;
}

export interface DriveRemoteFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
}

export interface DriveBackupSummary {
  tripsCount: number;
  flightsCount: number;
  transportsCount: number;
  staysCount: number;
  expensesCount: number;
  memoriesCount: number;
  mediaCount: number;
  totalMediaBytes: number;
}

export interface DriveBackupManifest {
  schemaVersion: typeof DRIVE_BACKUP_SCHEMA_VERSION;
  app: "Wanderer's Ledger";
  appVersion: string;
  updatedAt: string;
  summary: DriveBackupSummary;
  snapshot: LocalBackupSnapshot;
  mediaFiles: DriveMediaEntry[];
}

export interface DriveBackupMetadata {
  exists: boolean;
  manifestFileId?: string;
  updatedAt?: string;
  appVersion?: string;
  tripsCount: number;
  flightsCount: number;
  memoriesCount: number;
  mediaCount: number;
  totalMediaBytes: number;
}

export interface IncrementalMediaPlan {
  toUpload: LocalMediaRef[];
  toDelete: DriveRemoteFile[];
  alreadyUploadedCount: number;
}

function normalizeBaseDir(baseDir: string): string {
  if (!baseDir) return '';
  return baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
}

/**
 * Converts a device-specific local file URI (e.g., `file:///data/.../files/memories/trip_1/img.webp`)
 * into a portable relative path (`memories/trip_1/img.webp`) safe across reinstalls & Android/iOS.
 */
export function toRelativeMediaPath(
  uri: string | undefined | null,
  baseDir: string
): string | undefined {
  if (!uri || typeof uri !== 'string') return undefined;
  const trimmed = uri.trim();
  if (!trimmed) return undefined;

  // Already portable relative path
  if (/^(memories|receipts)\/[^/]+\/[^/?#]+$/.test(trimmed)) {
    return trimmed;
  }

  // Strip known app documentDirectory prefix if present
  const normBase = normalizeBaseDir(baseDir);
  if (normBase && trimmed.startsWith(normBase)) {
    const rest = trimmed.slice(normBase.length).replace(/^\/+/, '');
    if (/^(memories|receipts)\/[^/]+\/[^/?#]+$/.test(rest)) {
      return rest;
    }
  }

  // Fallback pattern match for sandboxed file paths across platforms/reinstalls
  const match = trimmed.match(/\/((?:memories|receipts)\/[^/]+\/[^/?#]+)$/);
  if (match?.[1]) {
    return match[1];
  }

  return undefined;
}

/**
 * Reconstructs an absolute device file URI from a portable relative media path.
 */
export function fromRelativeMediaPath(
  relPath: string | undefined | null,
  baseDir: string
): string | undefined {
  if (!relPath || typeof relPath !== 'string') return undefined;
  const trimmed = relPath.trim();
  if (!trimmed) return undefined;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const normalizedRel = toRelativeMediaPath(trimmed, baseDir);
  if (!normalizedRel) return undefined;

  const normBase = normalizeBaseDir(baseDir);
  if (!normBase) return normalizedRel;
  return `${normBase}${normalizedRel}`;
}

/**
 * Encodes a relative media path (`memories/trip_1/img_1.webp`) into a flat filename
 * suitable for Google Drive's `appDataFolder`.
 */
export function encodeDriveMediaFileName(relPath: string): string {
  const safe = relPath.replace(/^\/+/, '').replace(/\//g, '__');
  return `${DRIVE_MEDIA_PREFIX}${safe}`;
}

export function isDriveMediaFileName(name: string): boolean {
  return typeof name === 'string' && name.startsWith(DRIVE_MEDIA_PREFIX);
}

/**
 * Produces a portable copy of a LocalBackupSnapshot (with all local media URIs rewritten
 * to relative `memories/...` and `receipts/...` paths) alongside a deduplicated list of
 * local media files to back up.
 */
export function extractPortableSnapshotAndMedia(
  snapshot: LocalBackupSnapshot,
  baseDir: string
): {
  portableSnapshot: LocalBackupSnapshot;
  localMedia: LocalMediaRef[];
} {
  const mediaByRel = new Map<string, LocalMediaRef>();

  const registerMedia = (
    rawUri: string | undefined,
    kind: DriveMediaKind
  ): string | undefined => {
    const relPath = toRelativeMediaPath(rawUri, baseDir);
    if (!relPath || !rawUri) return undefined;
    if (!mediaByRel.has(relPath)) {
      const localUri =
        rawUri.startsWith('file://') || rawUri.startsWith('/')
          ? rawUri
          : fromRelativeMediaPath(relPath, baseDir) ?? rawUri;
      mediaByRel.set(relPath, {
        relPath,
        driveFileName: encodeDriveMediaFileName(relPath),
        kind,
        localUri,
      });
    }
    return relPath;
  };

  const portableTrips: Trip[] = snapshot.trips.map((t) => ({
    ...t,
    coverPhotoUri: registerMedia(t.coverPhotoUri, 'cover'),
  }));

  const portableStays: Stay[] = snapshot.stays.map((s) => ({
    ...s,
    receiptUri: registerMedia(s.receiptUri, 'receipt'),
  }));

  const portableExpenses: Expense[] = snapshot.expenses.map((e) => ({
    ...e,
    receiptUri: registerMedia(e.receiptUri, 'receipt'),
  }));

  const portableMemories: Memory[] = snapshot.memories.map((m) => ({
    ...m,
    photoUri: registerMedia(m.photoUri, 'memory'),
    thumbUri: registerMedia(m.thumbUri, 'thumb'),
  }));

  const portableSnapshot: LocalBackupSnapshot = {
    ...snapshot,
    trips: portableTrips,
    stays: portableStays,
    expenses: portableExpenses,
    memories: portableMemories,
  };

  return {
    portableSnapshot,
    localMedia: Array.from(mediaByRel.values()),
  };
}

/**
 * Resolves portable relative media paths in a restored snapshot back into absolute
 * paths inside the current device's `FileSystem.documentDirectory`.
 * If `availableRelPaths` is supplied, only files confirmed present on disk are linked.
 */
export function remapSnapshotMediaToDevice(
  portableSnapshot: LocalBackupSnapshot,
  baseDir: string,
  availableRelPaths?: Set<string>
): LocalBackupSnapshot {
  const resolveUri = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    const rel = toRelativeMediaPath(raw, baseDir);
    if (!rel) return undefined;
    if (availableRelPaths && !availableRelPaths.has(rel)) {
      return undefined;
    }
    return fromRelativeMediaPath(rel, baseDir);
  };

  return {
    ...portableSnapshot,
    trips: portableSnapshot.trips.map((t) => ({
      ...t,
      coverPhotoUri: resolveUri(t.coverPhotoUri),
    })),
    stays: portableSnapshot.stays.map((s) => ({
      ...s,
      receiptUri: resolveUri(s.receiptUri),
    })),
    expenses: portableSnapshot.expenses.map((e) => ({
      ...e,
      receiptUri: resolveUri(e.receiptUri),
    })),
    memories: portableSnapshot.memories.map((m) => ({
      ...m,
      photoUri: resolveUri(m.photoUri),
      thumbUri: resolveUri(m.thumbUri),
    })),
  };
}

/**
 * Computes an incremental diff between local `.webp` media files and existing files
 * in Google Drive `appDataFolder`:
 * - Uploads ONLY files not yet present on Drive
 * - Marks unreferenced `wl_media__*` files on Drive for orphan pruning
 */
export function computeIncrementalMediaPlan(
  localMedia: LocalMediaRef[],
  remoteFiles: DriveRemoteFile[]
): IncrementalMediaPlan {
  const remoteNames = new Set(remoteFiles.map((f) => f.name));
  const desiredNames = new Set(localMedia.map((m) => m.driveFileName));

  const toUpload: LocalMediaRef[] = [];
  let alreadyUploadedCount = 0;

  for (const item of localMedia) {
    if (remoteNames.has(item.driveFileName)) {
      alreadyUploadedCount += 1;
    } else {
      toUpload.push(item);
    }
  }

  const toDelete = remoteFiles.filter(
    (rf) => isDriveMediaFileName(rf.name) && !desiredNames.has(rf.name)
  );

  return {
    toUpload,
    toDelete,
    alreadyUploadedCount,
  };
}

/**
 * Non-destructive Smart Merge between a device's existing local travelogue and a restored
 * Google Drive snapshot. Preserves all unique records from both sides, resolves Trip & Loyalty
 * conflicts via Last-Write-Wins (`updatedAt`), and recovers missing media URIs cleanly.
 */
export function mergeBackupSnapshots(
  local: LocalBackupSnapshot,
  remote: LocalBackupSnapshot
): LocalBackupSnapshot {
  const tripMap = new Map<string, Trip>();
  for (const t of local.trips) {
    if (t?.id) tripMap.set(t.id, t);
  }
  for (const rt of remote.trips) {
    if (!rt?.id) continue;
    const existing = tripMap.get(rt.id);
    if (!existing || shouldAcceptRemoteRecord(existing.updatedAt, rt.updatedAt)) {
      tripMap.set(rt.id, {
        ...rt,
        coverPhotoUri: rt.coverPhotoUri || existing?.coverPhotoUri,
      });
    } else if (!existing.coverPhotoUri && rt.coverPhotoUri) {
      tripMap.set(rt.id, { ...existing, coverPhotoUri: rt.coverPhotoUri });
    }
  }

  const mergeById = <T extends { id: string }>(
    localArr: T[],
    remoteArr: T[],
    hydrate?: (existing: T, incoming: T) => T
  ): T[] => {
    const map = new Map<string, T>();
    for (const item of localArr) {
      if (item?.id) map.set(item.id, item);
    }
    for (const incoming of remoteArr) {
      if (!incoming?.id) continue;
      const existing = map.get(incoming.id);
      if (!existing) {
        map.set(incoming.id, incoming);
      } else if (hydrate) {
        map.set(incoming.id, hydrate(existing, incoming));
      }
    }
    return Array.from(map.values());
  };

  const flights = mergeById<Flight>(local.flights, remote.flights);
  const transports = mergeById<TransportLeg>(local.transports, remote.transports);
  const stops = mergeById<TripStop>(local.stops, remote.stops);
  const stays = mergeById<Stay>(local.stays, remote.stays, (ex, inc) => ({
    ...ex,
    receiptUri: ex.receiptUri || inc.receiptUri,
  }));
  const expenses = mergeById<Expense>(local.expenses, remote.expenses, (ex, inc) => ({
    ...ex,
    receiptUri: ex.receiptUri || inc.receiptUri,
  }));
  const memories = mergeById<Memory>(local.memories, remote.memories, (ex, inc) => ({
    ...ex,
    photoUri: ex.photoUri || inc.photoUri,
    thumbUri: ex.thumbUri || inc.thumbUri,
  }));

  const loyaltyMap = new Map<string, LoyaltyAccount>();
  for (const l of local.loyaltyAccounts) {
    if (l?.id) loyaltyMap.set(l.id, l);
  }
  for (const rl of remote.loyaltyAccounts) {
    if (!rl?.id) continue;
    const existing = loyaltyMap.get(rl.id);
    if (!existing || shouldAcceptRemoteRecord(existing.updatedAt, rl.updatedAt)) {
      loyaltyMap.set(rl.id, rl);
    }
  }

  const fxSnapshots: Record<string, Record<string, number>> = {
    ...(remote.fxSnapshots ?? {}),
    ...(local.fxSnapshots ?? {}),
  };

  return {
    schemaVersion: 2,
    app: "Wanderer's Ledger",
    exportedAt: new Date().toISOString(),
    trips: Array.from(tripMap.values()),
    flights,
    transports,
    stops,
    stays,
    expenses,
    memories,
    loyaltyAccounts: Array.from(loyaltyMap.values()),
    fxSnapshots,
  };
}

/**
 * Formats a byte count into a clean human-readable label (e.g., `420 KB`, `3.4 MB`).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/**
 * Extracts a friendly first name from Google profile fields for Passport display.
 */
export function formatDriveFirstName(
  givenName?: string | null,
  fullName?: string | null,
  email?: string | null
): string {
  const given = givenName?.trim();
  if (given) return given;

  const full = fullName?.trim();
  if (full) {
    const firstWord = full.split(/\s+/)[0];
    if (firstWord) return firstWord;
  }

  const emailPrefix = email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (emailPrefix) {
    const firstPart = emailPrefix.split(/\s+/)[0];
    if (firstPart) {
      return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
    }
  }

  return 'Wanderer';
}

/**
 * Determines whether local data has changed since the last completed Google Drive backup.
 */
export function hasLocalChangesSinceBackup(
  lastChangeAt: string | null | undefined,
  lastBackupAt: string | null | undefined
): boolean {
  if (!lastBackupAt) return true;
  if (!lastChangeAt) return false;
  const changeMs = Date.parse(lastChangeAt);
  const backupMs = Date.parse(lastBackupAt);
  if (Number.isNaN(changeMs) || Number.isNaN(backupMs)) return true;
  return changeMs > backupMs;
}
