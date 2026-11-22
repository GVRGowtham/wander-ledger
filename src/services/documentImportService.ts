import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { renderPdfPagesNative } from '../../modules/local-pdf-renderer';
import { compressAndSaveReceiptUri } from './mediaService';
import { recognizeTextWithDiagnostics } from './nativeOcr';
import { mergeOcrTexts } from './ocrParser';

export interface PickedDocumentResult {
  imageUris: string[];
  isPdf: boolean;
  fileName?: string;
}

export interface MultiOcrOutcome {
  mergedText: string;
  savedReceiptUri?: string;
  pagesScanned: number;
  error?: string;
}

/**
 * Lets the user select 1 to 3 screenshots (e.g. top + bottom of a long hotel/flight
 * confirmation email) from their photo library at full resolution for crisp offline OCR.
 */
export async function pickMultipleDocumentImages(maxCount = 3): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: maxCount,
    quality: 1,
  });

  if (result.canceled || !result.assets?.length) {
    return [];
  }
  return result.assets
    .map((a) => a.uri)
    .filter((uri): uri is string => Boolean(uri))
    .slice(0, maxCount);
}

/**
 * Renders up to `maxPages` pages of a local PDF (file:// or content://) into crisp
 * 1600px white-backed JPEGs using Android's built-in PdfRenderer so offline ML Kit OCR
 * reads BOTH digital confirmation PDFs and scanned paper folios.
 */
export async function renderPdfPagesToJpegs(
  pdfUri: string,
  maxPages = 3
): Promise<string[]> {
  return renderPdfPagesNative(pdfUri, maxPages, 1600);
}

/**
 * Opens the system file picker for PDFs or images (airline e-tickets, Booking.com /
 * Airbnb / Marriott confirmations in Downloads or Google Drive).
 */
export async function pickPdfOrImageFile(): Promise<PickedDocumentResult | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (res.canceled || !res.assets?.[0]) {
    return null;
  }

  const asset = res.assets[0];
  const isPdf =
    asset.mimeType === 'application/pdf' ||
    asset.name?.toLowerCase().endsWith('.pdf') ||
    asset.uri.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const pageUris = await renderPdfPagesToJpegs(asset.uri, 3);
    return {
      imageUris: pageUris,
      isPdf: true,
      fileName: asset.name,
    };
  }

  return {
    imageUris: [asset.uri],
    isPdf: false,
    fileName: asset.name,
  };
}

/**
 * Runs offline ML Kit OCR across 1 or more images/PDF pages, merges the extracted text
 * in reading order (deduplicating overlap lines), and saves page 1 as a compact private WebP.
 */
export async function runMultiImageOcrAndSave(
  imageUris: string[],
  tripId: string,
  onProgress?: (msg: string) => void
): Promise<MultiOcrOutcome> {
  if (imageUris.length === 0) {
    return { mergedText: '', pagesScanned: 0, error: 'No document pages to scan.' };
  }

  const pageTexts: string[] = [];
  let lastError: string | undefined;

  for (let i = 0; i < imageUris.length; i++) {
    onProgress?.(
      imageUris.length > 1
        ? `Reading page ${i + 1} of ${imageUris.length} (offline OCR)…`
        : 'Reading document text (offline OCR)…'
    );
    const ocr = await recognizeTextWithDiagnostics(imageUris[i]);
    if (ocr.text) {
      pageTexts.push(ocr.text);
    } else if (ocr.error) {
      lastError = ocr.error;
    }
  }

  let savedReceiptUri: string | undefined;
  try {
    savedReceiptUri = await compressAndSaveReceiptUri(imageUris[0], tripId || 'unassigned');
  } catch {
    savedReceiptUri = imageUris[0];
  }

  return {
    mergedText: mergeOcrTexts(pageTexts),
    savedReceiptUri,
    pagesScanned: imageUris.length,
    error: pageTexts.length === 0 ? lastError : undefined,
  };
}
