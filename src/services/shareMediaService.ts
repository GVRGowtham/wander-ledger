import { AppState, AppStateStatus, Share as NativeTextShare } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';

export interface ShareImageWithCaptionInput {
  imageUri: string;
  caption: string;
  title?: string;
  mimeType?: string;
}

export interface ShareLocalFileInput {
  fileUri: string;
  mimeType: string;
  title: string;
  uti?: string;
}

function normalizeFileUrl(uri: string): string {
  return uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`;
}

/**
 * Guards a native Android/iOS share Promise against dropped `onActivityResult` callbacks
 * (e.g., when a user selects a `singleTask` target app in the Android Share Sheet and hits Back).
 * If the app leaves foreground and returns to `'active'` while the native Promise is still hanging,
 * resolves gracefully after a short 900ms grace window so the UI spinner never deadlocks.
 */
function raceWithForegroundResume<T>(promise: Promise<T>): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    let settled = false;
    let leftForeground = false;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
      sub.remove();
    };

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        leftForeground = true;
        if (resumeTimer) {
          clearTimeout(resumeTimer);
          resumeTimer = null;
        }
      } else if (nextState === 'active' && leftForeground && !settled) {
        resumeTimer = setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(undefined);
          }
        }, 900);
      }
    });

    promise.then(
      (val) => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(val);
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      }
    );
  });
}

/**
 * Deadlock-proof local file sharing (PDF, JSON backup, CSV, etc.):
 * - Primary: `react-native-share` (uses Android's TargetChosenReceiver IntentSender so it resolves
 *   immediately when any target app is chosen — never deadlocking on `singleTask` apps + Back).
 * - Fallback: `expo-sharing` (only if react-native-share isn't available in the runtime).
 * - Always guarded by `raceWithForegroundResume` so UI spinners can never hang.
 */
export async function shareLocalFileSafely(input: ShareLocalFileInput): Promise<boolean> {
  const { fileUri, mimeType, title, uti } = input;
  const normalizedUrl = normalizeFileUrl(fileUri);

  // Primary path: react-native-share (TargetChosenReceiver avoids expo-sharing's pendingPromise deadlock)
  try {
    const RNShare = require('react-native-share').default as {
      open: (options: Record<string, unknown>) => Promise<unknown>;
    };
    if (RNShare && typeof RNShare.open === 'function') {
      await raceWithForegroundResume(
        RNShare.open({
          title,
          subject: title,
          url: normalizedUrl,
          type: mimeType,
          failOnCancel: false,
        })
      );
      return true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (/cancel|dismiss/i.test(msg)) {
      return true;
    }
  }

  // Fallback: expo-sharing guarded by foreground resume
  try {
    if (await Sharing.isAvailableAsync()) {
      await raceWithForegroundResume(
        Sharing.shareAsync(normalizedUrl, {
          mimeType,
          UTI: uti,
          dialogTitle: title,
        })
      );
      return true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (/cancel|dismiss|SharingInProgress/i.test(msg)) {
      return true;
    }
  }

  return false;
}

/**
 * Shares a local image file together with a caption in a SINGLE native Android/iOS
 * share sheet message (so WhatsApp, Telegram, Messages, Gmail, etc. receive both
 * the collage image AND the Route Stats text as one message).
 *
 * Also copies the caption to the clipboard for apps like Instagram that ignore EXTRA_TEXT,
 * and falls back gracefully to expo-sharing / text Share if react-native-share is unavailable.
 */
export async function shareImageWithCaption(
  input: ShareImageWithCaptionInput
): Promise<'combined' | 'image_only' | 'text_only'> {
  const { imageUri, caption, title = "Wanderer's Ledger Postcard", mimeType = 'image/png' } = input;
  const normalizedUrl = normalizeFileUrl(imageUri);

  // Always copy caption so apps that strip EXTRA_TEXT (e.g. Instagram) can paste in 1 tap
  if (caption.trim()) {
    try {
      await Clipboard.setStringAsync(caption);
    } catch {
      // Non-fatal
    }
  }

  // Primary path: react-native-share sends ACTION_SEND with BOTH EXTRA_STREAM + EXTRA_TEXT
  try {
    const RNShare = require('react-native-share').default as {
      open: (options: Record<string, unknown>) => Promise<unknown>;
    };
    if (RNShare && typeof RNShare.open === 'function') {
      await raceWithForegroundResume(
        RNShare.open({
          title,
          subject: title,
          message: caption,
          url: normalizedUrl,
          type: mimeType,
          failOnCancel: false,
        })
      );
      return 'combined';
    }
  } catch (err: unknown) {
    // Ignore user cancellation; otherwise fall back below
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (/cancel|dismiss/i.test(msg)) {
      return 'combined';
    }
  }

  // Fallback 1: expo-sharing (image file; caption is already on clipboard)
  try {
    if (await Sharing.isAvailableAsync()) {
      await raceWithForegroundResume(
        Sharing.shareAsync(normalizedUrl, {
          mimeType,
          dialogTitle: `${title} (Caption copied!)`,
        })
      );
      return 'image_only';
    }
  } catch {
    // Fall through to text share
  }

  // Fallback 2: plain text share
  await NativeTextShare.share({
    title,
    message: caption,
  });
  return 'text_only';
}
