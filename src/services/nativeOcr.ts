/**
 * On-device Google ML Kit Text Recognition wrapper ($0, 100% offline on Android).
 * Safely degrades if invoked in a non-native environment (e.g. Jest or Expo Go).
 */
export interface OcrRecognitionResult {
  text: string | null;
  error?: string;
}

function normalizeImageUri(imageUri: string): string {
  const trimmed = imageUri.trim();
  if (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  return `file://${trimmed}`;
}

export async function recognizeTextWithDiagnostics(
  imageUri: string
): Promise<OcrRecognitionResult> {
  try {
    // Dynamic require avoids crashing Jest/non-native test runners
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-ml-kit/text-recognition');
    const TextRecognition = mod?.default ?? mod;
    if (!TextRecognition?.recognize) {
      return { text: null, error: 'On-device OCR module not available in this build.' };
    }

    const normalizedUri = normalizeImageUri(imageUri);
    const result = await TextRecognition.recognize(normalizedUri);
    if (result?.text && typeof result.text === 'string' && result.text.trim().length > 0) {
      return { text: result.text.trim() };
    }
    return { text: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: null, error: msg };
  }
}

export async function recognizeTextFromImage(imageUri: string): Promise<string | null> {
  const res = await recognizeTextWithDiagnostics(imageUri);
  return res.text;
}
