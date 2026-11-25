import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getDb } from '../db/database';
import { hasLocalChangesSinceBackup } from './driveBackupHelpers';
import {
  getLastDriveBackupAt,
  getLastLocalDataModifiedAt,
  getStoredAutoBackupEnabled,
  isPendingWifiDriveBackup,
  runGoogleDriveBackup,
  setPendingWifiDriveBackup,
  setStoredAutoBackupEnabled,
} from './googleDriveBackupService';

export const DRIVE_DAILY_BACKUP_TASK = 'wanderledger-drive-daily-backup';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Must be called at module top-level so headless Android WorkManager / iOS BGTaskScheduler
// wakeups always find the task registered before React mounts.
try {
  if (!TaskManager.isTaskDefined(DRIVE_DAILY_BACKUP_TASK)) {
    TaskManager.defineTask(DRIVE_DAILY_BACKUP_TASK, async () => {
      try {
        getDb();
        if (!getStoredAutoBackupEnabled()) {
          return BackgroundTask.BackgroundTaskResult.Success;
        }
        const res = await runGoogleDriveBackup({
          skipIfUnchanged: true,
          allowCellularOverride: false,
        });
        if (res.status === 'success' || res.status === 'up_to_date') {
          setPendingWifiDriveBackup(false);
          return BackgroundTask.BackgroundTaskResult.Success;
        }
        if (res.status === 'wifi_required' || res.status === 'offline') {
          // Mark pending so backup resumes automatically as soon as Wi-Fi connects
          setPendingWifiDriveBackup(true);
          return BackgroundTask.BackgroundTaskResult.Failed;
        }
        return BackgroundTask.BackgroundTaskResult.Failed;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  }
} catch {
  // Ignore in Node/Jest environments where TaskManager native bridge is absent
}

export function isDailyDriveBackupEnabled(): boolean {
  return getStoredAutoBackupEnabled();
}

export async function enableDailyDriveBackup(): Promise<{ enabled: boolean; reason?: string }> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      // Still store user preference so foreground catch-up runs daily when app opens
      setStoredAutoBackupEnabled(true);
      return {
        enabled: true,
        reason:
          'Background tasks are restricted by system battery settings — backup will still run daily whenever you open the app on Wi-Fi.',
      };
    }

    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(DRIVE_DAILY_BACKUP_TASK);
    if (!alreadyRegistered) {
      await BackgroundTask.registerTaskAsync(DRIVE_DAILY_BACKUP_TASK, {
        minimumInterval: 60 * 24, // 24 hours (in minutes)
      });
    }
    setStoredAutoBackupEnabled(true);
    return { enabled: true };
  } catch {
    setStoredAutoBackupEnabled(true);
    return {
      enabled: true,
      reason: 'Scheduled daily foreground catch-up backup.',
    };
  }
}

export async function disableDailyDriveBackup(): Promise<void> {
  setStoredAutoBackupEnabled(false);
  setPendingWifiDriveBackup(false);
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(DRIVE_DAILY_BACKUP_TASK);
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(DRIVE_DAILY_BACKUP_TASK);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Silent foreground catch-up / Wi-Fi resume backup:
 * Runs when EITHER:
 * 1) A previous backup was deferred waiting for Wi-Fi (`isPendingWifiDriveBackup()`), OR
 * 2) Daily Auto-Backup is ON, >24h have elapsed since last backup, and local data changed.
 *
 * Always respects the user's Wi-Fi-only preference (`allowCellularOverride: false`).
 * If still on mobile data while Wi-Fi-only is ON, flags `pendingWifiBackup = true` so
 * the live Wi-Fi listener can resume it the instant Wi-Fi connects!
 */
export async function maybeRunForegroundCatchUpBackup(): Promise<
  'ran' | 'waiting_wifi' | 'skipped'
> {
  const pendingWifi = isPendingWifiDriveBackup();
  const autoEnabled = getStoredAutoBackupEnabled();

  if (!pendingWifi && !autoEnabled) {
    return 'skipped';
  }

  const lastBackupAt = getLastDriveBackupAt();
  const lastChangeAt = getLastLocalDataModifiedAt();

  if (!pendingWifi && lastBackupAt) {
    const elapsed = Date.now() - Date.parse(lastBackupAt);
    if (!Number.isNaN(elapsed) && elapsed < ONE_DAY_MS) {
      return 'skipped';
    }
    if (!hasLocalChangesSinceBackup(lastChangeAt, lastBackupAt)) {
      return 'skipped';
    }
  }

  const res = await runGoogleDriveBackup({
    skipIfUnchanged: !pendingWifi,
    allowCellularOverride: false,
  });

  if (res.status === 'success') {
    setPendingWifiDriveBackup(false);
    return 'ran';
  }
  if (res.status === 'up_to_date') {
    setPendingWifiDriveBackup(false);
    return 'skipped';
  }
  if (res.status === 'wifi_required') {
    setPendingWifiDriveBackup(true);
    return 'waiting_wifi';
  }
  return 'skipped';
}
