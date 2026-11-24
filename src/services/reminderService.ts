import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getAppMeta, setAppMeta } from '../db/database';
import { Flight, Stay, TransportLeg, Trip } from '../types/models';
import { buildTravelReminders } from './reminderPlanner';

const REMINDERS_ENABLED_META = 'travel_reminders_enabled_v1';
const CHANNEL_ID = 'travel-reminders';

export function getTravelRemindersEnabled(): boolean {
  try {
    return getAppMeta(REMINDERS_ENABLED_META) === 'true';
  } catch {
    return false;
  }
}

export function setTravelRemindersEnabledMeta(enabled: boolean): void {
  try {
    setAppMeta(REMINDERS_ENABLED_META, enabled ? 'true' : 'false');
  } catch {
    // Non-fatal
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Travel Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#F43F5E',
      description: 'Offline reminders for flight check-in, departures, and hotel check-in.',
    });
  } catch {
    // Non-fatal
  }
}

export async function requestReminderPermissions(): Promise<boolean> {
  try {
    await ensureAndroidChannel();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return Boolean(requested.granted);
  } catch {
    return false;
  }
}

export async function cancelAllTravelReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Non-fatal
  }
}

/**
 * Rebuilds the phone's offline scheduled travel reminders cleanly from current SQLite bookings.
 * Uses 'bestEffort' DATE triggers (zero SCHEDULE_EXACT_ALARM requirement on Android 14+).
 */
export async function syncTravelReminders(input: {
  trips: Trip[];
  flights: Flight[];
  stays: Stay[];
  transports: TransportLeg[];
}): Promise<{ scheduledCount: number; enabled: boolean }> {
  const enabled = getTravelRemindersEnabled();
  if (!enabled) {
    await cancelAllTravelReminders();
    return { scheduledCount: 0, enabled: false };
  }

  try {
    await ensureAndroidChannel();
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) {
      return { scheduledCount: 0, enabled: false };
    }

    await Notifications.cancelAllScheduledNotificationsAsync();
    const planned = buildTravelReminders(input);

    let scheduledCount = 0;
    for (const item of planned) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: item.key,
          content: {
            title: item.title,
            body: item.body,
            sound: 'default',
            data: { tripId: item.tripId, kind: item.kind },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: item.fireAt,
            channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
          },
        });
        scheduledCount += 1;
      } catch {
        // Skip any single malformed item
      }
    }

    return { scheduledCount, enabled: true };
  } catch {
    return { scheduledCount: 0, enabled };
  }
}
