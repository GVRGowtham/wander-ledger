import { requireOptionalNativeModule } from 'expo-modules-core';

interface LocalPdfRendererNative {
  renderPagesAsync(uri: string, maxPages: number, maxWidth: number): Promise<string[]>;
}

const NativePdfRenderer =
  requireOptionalNativeModule<LocalPdfRendererNative>('LocalPdfRenderer');

export async function renderPdfPagesNative(
  uri: string,
  maxPages = 3,
  maxWidth = 1600
): Promise<string[]> {
  if (!NativePdfRenderer) {
    throw new Error('Native PDF renderer is only available in Android development/release builds.');
  }
  return NativePdfRenderer.renderPagesAsync(uri, maxPages, maxWidth);
}
