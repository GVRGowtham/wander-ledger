/**
 * On-device Google ML Kit Text Recognition wrapper ($0, 100% offline on Android).
 * Safely degrades if invoked in a non-native environment (e.g. Jest or Expo Go).
 */
export async function recognizeTextFromImage(imageUri: string): Promise<string | null> {
  try {
    // Dynamic require avoids crashing Jest/non-native test runners
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TextRecognition = require('@react-native-ml-kit/text-recognition').default;
    if (!TextRecognition?.recognize) return null;
    const result = await TextRecognition.recognize(imageUri);
    if (result?.text && typeof result.text === 'string' && result.text.trim().length > 0) {
      return result.text.trim();
    }
    return null;
  } catch {
    return null;
  }
}
