import * as FileSystem from 'expo-file-system/legacy';
import {
  clearAllLocalData,
  getAppMeta,
  setAppMeta,
} from '../db/database';
import {
  buildLocalBackupSnapshot,
  restoreFromBackupSnapshot,
  validateBackupSnapshot,
} from './cloudSyncService';
import {
  computeIncrementalMediaPlan,
  DRIVE_APP_DATA_SCOPE,
  DRIVE_BACKUP_SCHEMA_VERSION,
  DRIVE_MANIFEST_NAME,
  DriveBackupManifest,
  DriveBackupMetadata,
  DriveMediaEntry,
  DriveRemoteFile,
  evaluateBackupNetworkPolicy,
  extractPortableSnapshotAndMedia,
  fromRelativeMediaPath,
  hasLocalChangesSinceBackup,
  isDriveMediaFileName,
  mergeBackupSnapshots,
  remapSnapshotMediaToDevice,
} from './driveBackupHelpers';

const APP_VERSION = '0.8.0';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const META_LAST_BACKUP_AT = 'drive_last_backup_at_v1';
const META_LAST_BACKUP_SUMMARY = 'drive_last_backup_summary_v1';
const META_LAST_LOCAL_CHANGE_AT = 'drive_last_local_change_at_v1';
const META_AUTO_BACKUP_ENABLED = 'drive_auto_backup_enabled_v1';
const META_WIFI_ONLY_BACKUP = 'drive_wifi_only_v1';
const META_PENDING_WIFI_BACKUP = 'drive_pending_wifi_backup_v1';

export interface DriveProgress {
  phase: 'checking' | 'uploading_media' | 'saving_manifest' | 'cleaning' | 'downloading_manifest' | 'downloading_media' | 'restoring_db' | 'deleting';
  completed: number;
  total: number;
  label: string;
}

export interface DriveBackupLocalSummary {
  updatedAt: string;
  tripsCount: number;
  flightsCount: number;
  memoriesCount: number;
  mediaCount: number;
  totalBytes: number;
}

export interface GoogleDriveUserInfo {
  id: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  name: string | null;
  photo: string | null;
}

export type GoogleDriveSignInResult =
  | {
      status: 'success';
      user: GoogleDriveUserInfo;
      accessToken: string;
    }
  | {
      status: 'cancelled';
    }
  | {
      status: 'error';
      message: string;
    };

export interface DriveBackupRunResult {
  status: 'success' | 'up_to_date' | 'signed_out' | 'offline' | 'wifi_required' | 'error';
  updatedAt?: string;
  tripsCount?: number;
  memoriesCount?: number;
  mediaUploaded?: number;
  mediaSkipped?: number;
  mediaPruned?: number;
  totalBytes?: number;
  error?: string;
}

export interface DriveRestoreRunResult {
  status: 'success' | 'no_backup' | 'signed_out' | 'error';
  tripsRestored?: number;
  itemsRestored?: number;
  mediaDownloaded?: number;
  mediaSkipped?: number;
  updatedAt?: string;
  error?: string;
}

class DriveHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'DriveHttpError';
    this.status = status;
  }
}

let googleConfigured = false;

function getGoogleSigninModule(): typeof import('@react-native-google-signin/google-signin') | null {
  try {
    // Lazy require so Node-only Jest unit tests never fail loading native modules
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
}

function getExpoNetworkModule(): typeof import('expo-network') | null {
  try {
    // Lazy require so Node-only Jest tests never fail loading native Expo modules
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-network');
  } catch {
    return null;
  }
}

export function configureGoogleDriveAuth(): boolean {
  const mod = getGoogleSigninModule();
  if (!mod?.GoogleSignin) return false;
  if (!googleConfigured) {
    try {
      mod.GoogleSignin.configure({
        scopes: [DRIVE_APP_DATA_SCOPE],
      });
      googleConfigured = true;
    } catch {
      return false;
    }
  }
  return true;
}

// ============================================================================
// Persistent Local Backup Metadata Helpers
// ============================================================================

export function getLastDriveBackupAt(): string | null {
  return getAppMeta(META_LAST_BACKUP_AT);
}

export function getLastDriveBackupSummary(): DriveBackupLocalSummary | null {
  try {
    const raw = getAppMeta(META_LAST_BACKUP_SUMMARY);
    if (!raw) return null;
    return JSON.parse(raw) as DriveBackupLocalSummary;
  } catch {
    return null;
  }
}

export function markLocalDataModified(): void {
  try {
    setAppMeta(META_LAST_LOCAL_CHANGE_AT, new Date().toISOString());
  } catch {
    // Ignore if DB not initialized yet
  }
}

export function getLastLocalDataModifiedAt(): string | null {
  try {
    return getAppMeta(META_LAST_LOCAL_CHANGE_AT);
  } catch {
    return null;
  }
}

export function getStoredAutoBackupEnabled(): boolean {
  try {
    return getAppMeta(META_AUTO_BACKUP_ENABLED) === '1';
  } catch {
    return false;
  }
}

export function setStoredAutoBackupEnabled(enabled: boolean): void {
  try {
    setAppMeta(META_AUTO_BACKUP_ENABLED, enabled ? '1' : '0');
  } catch {
    // Non-fatal
  }
}

export function getStoredWifiOnlyBackup(): boolean {
  try {
    const val = getAppMeta(META_WIFI_ONLY_BACKUP);
    // Default to true (protect roaming mobile data unless explicitly disabled)
    return val === null ? true : val === '1';
  } catch {
    return true;
  }
}

export function setStoredWifiOnlyBackup(wifiOnly: boolean): void {
  try {
    setAppMeta(META_WIFI_ONLY_BACKUP, wifiOnly ? '1' : '0');
  } catch {
    // Non-fatal
  }
}

export function isPendingWifiDriveBackup(): boolean {
  try {
    return getAppMeta(META_PENDING_WIFI_BACKUP) === '1';
  } catch {
    return false;
  }
}

export function setPendingWifiDriveBackup(pending: boolean): void {
  try {
    setAppMeta(META_PENDING_WIFI_BACKUP, pending ? '1' : '0');
  } catch {
    // Non-fatal
  }
}

export async function checkCurrentNetworkForBackup(options?: {
  wifiOnly?: boolean;
  allowCellularOverride?: boolean;
}) {
  const wifiOnly = options?.wifiOnly ?? getStoredWifiOnlyBackup();
  const net = getExpoNetworkModule();
  if (!net?.getNetworkStateAsync) {
    return { allowed: true as const };
  }
  try {
    const state = await net.getNetworkStateAsync();
    return evaluateBackupNetworkPolicy({
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
      wifiOnly,
      allowCellularOverride: options?.allowCellularOverride,
    });
  } catch {
    // If native network query fails unexpectedly, allow attempt and let fetch handle errors
    return { allowed: true as const };
  }
}

// ============================================================================
// Native Google Sign-In + Token Management (Works Foreground & Background)
// ============================================================================

export async function signInWithGoogleDrive(): Promise<GoogleDriveSignInResult> {
  const mod = getGoogleSigninModule();
  if (!mod?.GoogleSignin) {
    return {
      status: 'error',
      message: 'Google Sign-In is only available in a native Android or iOS build.',
    };
  }

  configureGoogleDriveAuth();

  try {
    await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await mod.GoogleSignin.signIn();

    if (mod.isCancelledResponse(response)) {
      return { status: 'cancelled' };
    }
    if (!mod.isSuccessResponse(response)) {
      return { status: 'cancelled' };
    }

    let userPayload = response.data;
    const grantedScopes = userPayload.scopes ?? [];
    if (!grantedScopes.includes(DRIVE_APP_DATA_SCOPE)) {
      const scopeRes = await mod.GoogleSignin.addScopes({
        scopes: [DRIVE_APP_DATA_SCOPE],
      });
      if (scopeRes && mod.isSuccessResponse(scopeRes)) {
        userPayload = scopeRes.data;
      }
    }

    const tokens = await mod.GoogleSignin.getTokens();
    if (!tokens?.accessToken) {
      return {
        status: 'error',
        message: 'Could not retrieve Google Drive permission token. Please try signing in again.',
      };
    }

    return {
      status: 'success',
      user: {
        id: userPayload.user.id,
        email: userPayload.user.email,
        givenName: userPayload.user.givenName,
        familyName: userPayload.user.familyName,
        name: userPayload.user.name,
        photo: userPayload.user.photo,
      },
      accessToken: tokens.accessToken,
    };
  } catch (err: unknown) {
    if (mod.isErrorWithCode(err)) {
      if (err.code === mod.statusCodes.SIGN_IN_CANCELLED) {
        return { status: 'cancelled' };
      }
      if (err.code === mod.statusCodes.IN_PROGRESS) {
        return { status: 'error', message: 'Google Sign-In is already in progress.' };
      }
      if (err.code === mod.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          status: 'error',
          message: 'Google Play Services is unavailable or needs an update on this device.',
        };
      }
      return {
        status: 'error',
        message: `Google Sign-In failed (${err.code}): ${err.message}`,
      };
    }
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unable to complete Google Sign-In.',
    };
  }
}

export async function signOutGoogleDrive(): Promise<void> {
  const mod = getGoogleSigninModule();
  if (!mod?.GoogleSignin) return;
  try {
    configureGoogleDriveAuth();
    await mod.GoogleSignin.signOut();
  } catch {
    // Ignore offline sign-out errors; local state still signs out cleanly
  }
}

/**
 * Silently obtains a valid Google Drive OAuth access token.
 * Safe to call both in foreground and inside headless Android WorkManager background tasks.
 */
export async function getValidDriveAccessToken(options?: {
  clearToken?: string;
}): Promise<string | null> {
  const mod = getGoogleSigninModule();
  if (!mod?.GoogleSignin) return null;

  configureGoogleDriveAuth();

  try {
    if (options?.clearToken) {
      try {
        await mod.GoogleSignin.clearCachedAccessToken(options.clearToken);
      } catch {
        // Non-fatal
      }
    }

    if (!mod.GoogleSignin.hasPreviousSignIn()) {
      const silent = await mod.GoogleSignin.signInSilently();
      if (silent.type !== 'success') {
        return null;
      }
    }

    const tokens = await mod.GoogleSignin.getTokens();
    return tokens?.accessToken || null;
  } catch {
    // Try one silent sign-in fallback if cached account was stale
    try {
      const silent = await mod.GoogleSignin.signInSilently();
      if (silent.type !== 'success') return null;
      const tokens = await mod.GoogleSignin.getTokens();
      return tokens?.accessToken || null;
    } catch {
      return null;
    }
  }
}

async function withDriveTokenRetry<T>(
  providedToken: string | undefined,
  action: (token: string) => Promise<T>
): Promise<T> {
  const initialToken = providedToken || (await getValidDriveAccessToken());
  if (!initialToken) {
    throw new DriveHttpError(401, 'Not signed in to Google Drive.');
  }

  try {
    return await action(initialToken);
  } catch (err) {
    if (err instanceof DriveHttpError && err.status === 401) {
      const refreshed = await getValidDriveAccessToken({ clearToken: initialToken });
      if (!refreshed) {
        throw err;
      }
      return action(refreshed);
    }
    throw err;
  }
}

// ============================================================================
// Google Drive v3 REST API (Strictly scoped to hidden `appDataFolder`)
// ============================================================================

async function listAppDataFiles(accessToken: string): Promise<DriveRemoteFile[]> {
  const all: DriveRemoteFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: 'nextPageToken,files(id,name,size,modifiedTime)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      throw new DriveHttpError(res.status, `Drive list failed (${res.status})`);
    }
    const data = (await res.json()) as {
      files?: DriveRemoteFile[];
      nextPageToken?: string;
    };
    if (Array.isArray(data.files)) {
      all.push(...data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return all;
}

async function downloadDriveJson<T>(fileId: string, accessToken: string): Promise<T> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new DriveHttpError(res.status, `Drive download failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function uploadDriveJsonFile(
  fileName: string,
  jsonPayload: string,
  accessToken: string,
  existingFileId?: string
): Promise<string> {
  if (existingFileId) {
    const res = await fetch(
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(existingFileId)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonPayload,
      }
    );
    if (!res.ok) {
      throw new DriveHttpError(res.status, `Manifest update failed (${res.status})`);
    }
    const body = (await res.json()) as { id?: string };
    return body.id || existingFileId;
  }

  const boundary = `wl_boundary_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  });
  const multipartBody =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${jsonPayload}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  if (!res.ok) {
    throw new DriveHttpError(res.status, `Manifest create failed (${res.status})`);
  }
  const body = (await res.json()) as { id?: string };
  return body.id || '';
}

/**
 * Streams a local binary `.webp` file directly to Google Drive `appDataFolder` using
 * Drive's resumable upload session + `FileSystem.uploadAsync` (zero Base64 RAM overhead).
 */
async function uploadDriveBinaryFile(
  localUri: string,
  driveFileName: string,
  accessToken: string
): Promise<void> {
  const initRes = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'image/webp',
    },
    body: JSON.stringify({
      name: driveFileName,
      parents: ['appDataFolder'],
    }),
  });
  if (!initRes.ok) {
    throw new DriveHttpError(initRes.status, `Media upload init failed (${initRes.status})`);
  }

  const uploadUrl = initRes.headers.get('location') || initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not return a resumable upload location.');
  }

  const uploadRes = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': 'image/webp',
    },
  });

  if (uploadRes.status === 401) {
    throw new DriveHttpError(401, 'Upload token expired');
  }
  if (uploadRes.status < 200 || uploadRes.status >= 300) {
    throw new DriveHttpError(uploadRes.status, `Media upload failed (${uploadRes.status})`);
  }
}

async function downloadDriveBinaryFile(
  fileId: string,
  destUri: string,
  accessToken: string
): Promise<boolean> {
  const lastSlash = destUri.lastIndexOf('/');
  if (lastSlash > 0) {
    const parentDir = destUri.slice(0, lastSlash + 1);
    try {
      const dirInfo = await FileSystem.getInfoAsync(parentDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
      }
    } catch {
      // Non-fatal
    }
  }

  const dl = await FileSystem.downloadAsync(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
    destUri,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (dl.status === 401) {
    throw new DriveHttpError(401, 'Download token expired');
  }
  return dl.status >= 200 && dl.status < 300;
}

async function deleteDriveFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 404) return;
  if (!res.ok) {
    throw new DriveHttpError(res.status, `Delete failed (${res.status})`);
  }
}

// ============================================================================
// High-Level Backup, Check, Restore & Delete Workflows
// ============================================================================

/**
 * Checks the signed-in user's private Google Drive `appDataFolder` for an existing
 * Wanderer's Ledger backup manifest and returns its lightweight summary.
 */
export async function checkDriveBackupMetadata(
  providedToken?: string
): Promise<DriveBackupMetadata> {
  try {
    return await withDriveTokenRetry(providedToken, async (token) => {
      const files = await listAppDataFiles(token);
      const manifestFile = files.find((f) => f.name === DRIVE_MANIFEST_NAME);
      if (!manifestFile) {
        return {
          exists: false,
          tripsCount: 0,
          flightsCount: 0,
          memoriesCount: 0,
          mediaCount: 0,
          totalMediaBytes: 0,
        };
      }

      const manifest = await downloadDriveJson<Partial<DriveBackupManifest>>(
        manifestFile.id,
        token
      );
      const summary = manifest.summary;
      return {
        exists: true,
        manifestFileId: manifestFile.id,
        updatedAt: manifest.updatedAt || manifestFile.modifiedTime,
        appVersion: manifest.appVersion,
        tripsCount: summary?.tripsCount ?? manifest.snapshot?.trips?.length ?? 0,
        flightsCount: summary?.flightsCount ?? manifest.snapshot?.flights?.length ?? 0,
        memoriesCount: summary?.memoriesCount ?? manifest.snapshot?.memories?.length ?? 0,
        mediaCount: summary?.mediaCount ?? manifest.mediaFiles?.length ?? 0,
        totalMediaBytes: summary?.totalMediaBytes ?? 0,
      };
    });
  } catch {
    return {
      exists: false,
      tripsCount: 0,
      flightsCount: 0,
      memoriesCount: 0,
      mediaCount: 0,
      totalMediaBytes: 0,
    };
  }
}

/**
 * Runs an atomic, incremental Google Drive backup:
 * 1. Scans local SQLite snapshot + existing `.webp` memory/receipt files.
 * 2. Uploads ONLY new `.webp` files not yet in `appDataFolder` (Media-First).
 * 3. Writes/patches `wanderers_ledger_manifest.json` LAST so Drive is never half-written.
 * 4. Prunes orphaned `.webp` files no longer referenced by the manifest.
 */
export async function runGoogleDriveBackup(options?: {
  accessToken?: string;
  skipIfUnchanged?: boolean;
  wifiOnly?: boolean;
  allowCellularOverride?: boolean;
  onProgress?: (progress: DriveProgress) => void;
}): Promise<DriveBackupRunResult> {
  const onProgress = options?.onProgress;

  if (options?.skipIfUnchanged) {
    const lastBackupAt = getLastDriveBackupAt();
    const lastChangeAt = getLastLocalDataModifiedAt();
    if (lastBackupAt && !hasLocalChangesSinceBackup(lastChangeAt, lastBackupAt)) {
      setPendingWifiDriveBackup(false);
      return {
        status: 'up_to_date',
        updatedAt: lastBackupAt,
      };
    }
  }

  const netPolicy = await checkCurrentNetworkForBackup({
    wifiOnly: options?.wifiOnly,
    allowCellularOverride: options?.allowCellularOverride,
  });
  if (!netPolicy.allowed) {
    if (netPolicy.reason === 'offline') {
      return {
        status: 'offline',
        error: 'You are currently offline. Connect to the internet to back up to Google Drive.',
      };
    }
    return {
      status: 'wifi_required',
      error: 'Wi-Fi only backup is enabled — waiting for Wi-Fi to protect your mobile data.',
    };
  }

  try {
    return await withDriveTokenRetry(options?.accessToken, async (token) => {
      onProgress?.({
        phase: 'checking',
        completed: 0,
        total: 1,
        label: 'Checking your Google Drive backup…',
      });

      const baseDir = FileSystem.documentDirectory ?? '';
      const rawSnapshot = buildLocalBackupSnapshot();
      const { portableSnapshot, localMedia } = extractPortableSnapshotAndMedia(
        rawSnapshot,
        baseDir
      );

      // Verify which local media files actually exist on disk and collect their sizes
      const existingLocalMedia = [];
      let totalMediaBytes = 0;
      for (const item of localMedia) {
        try {
          const info = await FileSystem.getInfoAsync(item.localUri);
          if (info.exists) {
            const sizeBytes = 'size' in info && typeof info.size === 'number' ? info.size : 0;
            totalMediaBytes += sizeBytes;
            existingLocalMedia.push({ ...item, sizeBytes });
          }
        } catch {
          // Skip unreadable file
        }
      }

      const remoteFiles = await listAppDataFiles(token);
      const existingManifestFile = remoteFiles.find((f) => f.name === DRIVE_MANIFEST_NAME);
      const plan = computeIncrementalMediaPlan(existingLocalMedia, remoteFiles);

      // Step 1: Media-First incremental upload
      let mediaUploaded = 0;
      const totalUploads = plan.toUpload.length;
      for (let i = 0; i < totalUploads; i += 1) {
        const file = plan.toUpload[i];
        onProgress?.({
          phase: 'uploading_media',
          completed: i + 1,
          total: totalUploads,
          label: `Backing up photos & receipts (${i + 1}/${totalUploads})…`,
        });
        await uploadDriveBinaryFile(file.localUri, file.driveFileName, token);
        mediaUploaded += 1;
      }

      // Step 2: Manifest-Last atomic commit
      onProgress?.({
        phase: 'saving_manifest',
        completed: 1,
        total: 1,
        label: 'Saving travelogue snapshot…',
      });

      const updatedAt = new Date().toISOString();
      const mediaEntries: DriveMediaEntry[] = existingLocalMedia.map((m) => ({
        relPath: m.relPath,
        driveFileName: m.driveFileName,
        kind: m.kind,
        sizeBytes: m.sizeBytes,
      }));

      const manifest: DriveBackupManifest = {
        schemaVersion: DRIVE_BACKUP_SCHEMA_VERSION,
        app: "Wanderer's Ledger",
        appVersion: APP_VERSION,
        updatedAt,
        summary: {
          tripsCount: portableSnapshot.trips.length,
          flightsCount: portableSnapshot.flights.length,
          transportsCount: portableSnapshot.transports.length,
          staysCount: portableSnapshot.stays.length,
          expensesCount: portableSnapshot.expenses.length,
          memoriesCount: portableSnapshot.memories.length,
          mediaCount: mediaEntries.length,
          totalMediaBytes,
        },
        snapshot: portableSnapshot,
        mediaFiles: mediaEntries,
      };

      const manifestJson = JSON.stringify(manifest);
      const totalBytes = totalMediaBytes + manifestJson.length;
      await uploadDriveJsonFile(
        DRIVE_MANIFEST_NAME,
        manifestJson,
        token,
        existingManifestFile?.id
      );

      // Step 3: Best-effort orphan pruning so Drive storage stays tidy
      let mediaPruned = 0;
      if (plan.toDelete.length > 0) {
        onProgress?.({
          phase: 'cleaning',
          completed: 0,
          total: plan.toDelete.length,
          label: 'Cleaning up removed photos from Drive…',
        });
        for (const stale of plan.toDelete) {
          try {
            await deleteDriveFile(stale.id, token);
            mediaPruned += 1;
          } catch {
            // Non-fatal — will be pruned on next backup
          }
        }
      }

      const localSummary: DriveBackupLocalSummary = {
        updatedAt,
        tripsCount: manifest.summary.tripsCount,
        flightsCount: manifest.summary.flightsCount,
        memoriesCount: manifest.summary.memoriesCount,
        mediaCount: manifest.summary.mediaCount,
        totalBytes,
      };
      setAppMeta(META_LAST_BACKUP_AT, updatedAt);
      setAppMeta(META_LAST_BACKUP_SUMMARY, JSON.stringify(localSummary));
      setPendingWifiDriveBackup(false);

      return {
        status: 'success',
        updatedAt,
        tripsCount: manifest.summary.tripsCount,
        memoriesCount: manifest.summary.memoriesCount,
        mediaUploaded,
        mediaSkipped: plan.alreadyUploadedCount,
        mediaPruned,
        totalBytes,
      };
    });
  } catch (err) {
    if (err instanceof DriveHttpError && err.status === 401) {
      return {
        status: 'signed_out',
        error: 'Google Drive session expired. Please sign in again to back up.',
      };
    }
    return {
      status: 'error',
      error:
        err instanceof Error
          ? err.message
          : 'Could not reach Google Drive right now. Your local travelogue is safe.',
    };
  }
}

/**
 * Restores a user's travelogue + WebP photos & receipts from Google Drive `appDataFolder`.
 * Supports both `'replace'` (fresh device / clean restore) and `'merge'` (Smart Merge with local trips).
 */
export async function runGoogleDriveRestore(
  mode: 'merge' | 'replace',
  options?: {
    accessToken?: string;
    onProgress?: (progress: DriveProgress) => void;
  }
): Promise<DriveRestoreRunResult> {
  const onProgress = options?.onProgress;

  try {
    return await withDriveTokenRetry(options?.accessToken, async (token) => {
      onProgress?.({
        phase: 'downloading_manifest',
        completed: 0,
        total: 1,
        label: 'Reading your Google Drive backup…',
      });

      const remoteFiles = await listAppDataFiles(token);
      const manifestFile = remoteFiles.find((f) => f.name === DRIVE_MANIFEST_NAME);
      if (!manifestFile) {
        return { status: 'no_backup' };
      }

      const manifest = await downloadDriveJson<DriveBackupManifest>(manifestFile.id, token);
      const validSnapshot = validateBackupSnapshot(manifest?.snapshot);
      if (!validSnapshot) {
        return {
          status: 'error',
          error: 'Your Drive backup manifest appears incomplete or incompatible.',
        };
      }

      const baseDir = FileSystem.documentDirectory ?? '';
      const remoteByName = new Map(remoteFiles.map((f) => [f.name, f]));
      const mediaList = Array.isArray(manifest.mediaFiles) ? manifest.mediaFiles : [];
      const availableRelPaths = new Set<string>();

      let mediaDownloaded = 0;
      let mediaSkipped = 0;

      for (let i = 0; i < mediaList.length; i += 1) {
        const entry = mediaList[i];
        if (!entry?.relPath || !entry?.driveFileName) continue;
        const destUri = fromRelativeMediaPath(entry.relPath, baseDir);
        if (!destUri) continue;

        // Skip downloading if file is already present locally on disk
        try {
          const existingInfo = await FileSystem.getInfoAsync(destUri);
          if (existingInfo.exists) {
            availableRelPaths.add(entry.relPath);
            mediaSkipped += 1;
            continue;
          }
        } catch {
          // Proceed to download
        }

        const remoteFile = remoteByName.get(entry.driveFileName);
        if (!remoteFile) continue;

        onProgress?.({
          phase: 'downloading_media',
          completed: i + 1,
          total: mediaList.length,
          label: `Restoring photos & receipts (${i + 1}/${mediaList.length})…`,
        });

        try {
          const ok = await downloadDriveBinaryFile(remoteFile.id, destUri, token);
          if (ok) {
            availableRelPaths.add(entry.relPath);
            mediaDownloaded += 1;
          }
        } catch (dlErr) {
          if (dlErr instanceof DriveHttpError && dlErr.status === 401) {
            throw dlErr;
          }
          // Skip a single unreadable photo rather than aborting entire restore
        }
      }

      onProgress?.({
        phase: 'restoring_db',
        completed: 1,
        total: 1,
        label: 'Restoring trips, bookings & memories…',
      });

      const remappedRemote = remapSnapshotMediaToDevice(
        validSnapshot,
        baseDir,
        availableRelPaths
      );

      let tripsRestored = 0;
      let itemsRestored = 0;

      if (mode === 'replace') {
        clearAllLocalData();
        const res = restoreFromBackupSnapshot(remappedRemote);
        tripsRestored = res.tripsRestored;
        itemsRestored = res.itemsRestored;
      } else {
        const localCurrent = buildLocalBackupSnapshot();
        const merged = mergeBackupSnapshots(localCurrent, remappedRemote);
        const res = restoreFromBackupSnapshot(merged);
        tripsRestored = res.tripsRestored;
        itemsRestored = res.itemsRestored;
      }

      const restoredAt = manifest.updatedAt || new Date().toISOString();
      const summary: DriveBackupLocalSummary = {
        updatedAt: restoredAt,
        tripsCount: manifest.summary?.tripsCount ?? validSnapshot.trips.length,
        flightsCount: manifest.summary?.flightsCount ?? validSnapshot.flights.length,
        memoriesCount: manifest.summary?.memoriesCount ?? validSnapshot.memories.length,
        mediaCount: manifest.summary?.mediaCount ?? mediaList.length,
        totalBytes: manifest.summary?.totalMediaBytes ?? 0,
      };
      setAppMeta(META_LAST_BACKUP_AT, restoredAt);
      setAppMeta(META_LAST_BACKUP_SUMMARY, JSON.stringify(summary));

      return {
        status: 'success',
        tripsRestored,
        itemsRestored,
        mediaDownloaded,
        mediaSkipped,
        updatedAt: restoredAt,
      };
    });
  } catch (err) {
    if (err instanceof DriveHttpError && err.status === 401) {
      return {
        status: 'signed_out',
        error: 'Google Drive session expired. Please sign in again to restore.',
      };
    }
    return {
      status: 'error',
      error:
        err instanceof Error
          ? err.message
          : 'Could not restore from Google Drive right now. Your local data is untouched.',
    };
  }
}

/**
 * Deletes Wanderer's Ledger backup files from Google Drive `appDataFolder` ONLY.
 * Never deletes any local trips, bookings, expenses, or photos on the user's phone.
 */
export async function deleteGoogleDriveBackup(
  onProgress?: (progress: DriveProgress) => void
): Promise<{ status: 'success' | 'signed_out' | 'error'; deletedCount?: number; error?: string }> {
  try {
    return await withDriveTokenRetry(undefined, async (token) => {
      const files = await listAppDataFiles(token);
      const targets = files.filter(
        (f) => f.name === DRIVE_MANIFEST_NAME || isDriveMediaFileName(f.name)
      );

      for (let i = 0; i < targets.length; i += 1) {
        onProgress?.({
          phase: 'deleting',
          completed: i + 1,
          total: targets.length,
          label: `Removing cloud backup (${i + 1}/${targets.length})…`,
        });
        await deleteDriveFile(targets[i].id, token);
      }

      setAppMeta(META_LAST_BACKUP_AT, '');
      setAppMeta(META_LAST_BACKUP_SUMMARY, '');

      return { status: 'success', deletedCount: targets.length };
    });
  } catch (err) {
    if (err instanceof DriveHttpError && err.status === 401) {
      return { status: 'signed_out', error: 'Please sign in to delete your cloud backup.' };
    }
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unable to delete Google Drive backup right now.',
    };
  }
}
