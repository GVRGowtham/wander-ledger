import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getDb } from '../db/database';
import { hasLocalChangesSinceBackup } from './driveBackupHelpers';
import {
  getLastDriveBackupAt,
  getLastLocalDataModifiedAt,
  getStoredAutoBackupEnabled,
  runGoogleDriveBackup,
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
        const res = await runGoogleDriveBackup({ skipIfUnchanged: true });
        if (res.status === 'success' || res.status === 'up_to_date') {
          return BackgroundTask.BackgroundTaskResult.Success;
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
        reason: 'Background tasks are restricted by system battery settings — backup will still run daily whenever you open the app.',
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
 * Silent foreground catch-up backup: if Daily Auto-Backup is ON, >24h have elapsed since
 * the last backup, and local data changed (e.g., if Android battery saver skipped a night),
 * silently back up in the background without interrupting the user.
 */
export async function maybeRunForegroundCatchUpBackup(): Promise<boolean> {
  if (!getStoredAutoBackupEnabled()) return false;

  const lastBackupAt = getLastDriveBackupAt();
  const lastChangeAt = getLastLocalDataModifiedAt();

  if (lastBackupAt) {
    const elapsed = Date.now() - Date.parse(lastBackupAt);
    if (!Number.isNaN(elapsed) && elapsed < ONE_DAY_MS) {
      return false;
    }
    if (!hasLocalChangesSinceBackup(lastChangeAt, lastBackupAt)) {
      return false;
    }
  }

  const res = await runGoogleDriveBackup({ skipIfUnchanged: true });
  return res.status === 'success';
}
