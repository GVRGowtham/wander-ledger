import { Share as NativeTextShare } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';

export interface ShareImageWithCaptionInput {
  imageUri: string;
  caption: string;
  title?: string;
  mimeType?: string;
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
  const { imageUri, caption, title = 'WanderLedger Postcard', mimeType = 'image/png' } = input;
  const normalizedUrl =
    imageUri.startsWith('file://') || imageUri.startsWith('content://')
      ? imageUri
      : `file://${imageUri}`;

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
      await RNShare.open({
        title,
        subject: title,
        message: caption,
        url: normalizedUrl,
        type: mimeType,
        failOnCancel: false,
      });
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
      await Sharing.shareAsync(normalizedUrl, {
        mimeType,
        dialogTitle: `${title} (Caption copied!)`,
      });
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
