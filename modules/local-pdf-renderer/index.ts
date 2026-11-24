import { requireOptionalNativeModule } from 'expo-modules-core';

export interface PickedNativeDocument {
  uri: string;
  mimeType?: string;
  name?: string;
}

interface LocalPdfRendererNative {
  pickDocumentAsync(): Promise<PickedNativeDocument | null>;
  renderPagesAsync(uri: string, maxPages: number, maxWidth: number): Promise<string[]>;
}

const NativePdfRenderer =
  requireOptionalNativeModule<LocalPdfRendererNative>('LocalPdfRenderer');

export async function pickDocumentNative(): Promise<PickedNativeDocument | null> {
  if (!NativePdfRenderer) {
    throw new Error('Native file picker is only available in iOS/Android development or release builds.');
  }
  return NativePdfRenderer.pickDocumentAsync();
}

export async function renderPdfPagesNative(
  uri: string,
  maxPages = 3,
  maxWidth = 1600
): Promise<string[]> {
  if (!NativePdfRenderer) {
    throw new Error('Native PDF renderer is only available in iOS/Android development or release builds.');
  }
  return NativePdfRenderer.renderPagesAsync(uri, maxPages, maxWidth);
}
