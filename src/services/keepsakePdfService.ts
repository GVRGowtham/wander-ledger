import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Print from 'expo-print';
import {
  DistanceUnit,
  Flight,
  Memory,
  Stay,
  TransportLeg,
  Trip,
  TripStop,
} from '../types/models';
import { ImageDimensions, PhotoCrop } from './igStudioHelpers';
import {
  buildTripKeepsakeHtml,
  KEEPSAKE_A4_HEIGHT,
  KEEPSAKE_A4_WIDTH,
  KeepsakeTemplateId,
} from './keepsakePdfBuilder';
import { shareLocalFileSafely } from './shareMediaService';

export interface ExportKeepsakePdfOptions {
  trip: Trip;
  flights: Flight[];
  transports: TransportLeg[];
  stops: TripStop[];
  stays: Stay[];
  memories: Memory[];
  distanceUnit: DistanceUnit;
  templateId?: KeepsakeTemplateId;
  /** undefined = use trip.coverPhotoUri (or first photo memory); null = no cover photo (art cover); string = specific URI */
  coverPhotoUriOverride?: string | null;
  coverDimensions?: ImageDimensions;
  coverCrop?: PhotoCrop;
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function inferImageMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/webp';
}

function measureImageSize(uri?: string | null): Promise<ImageDimensions | undefined> {
  if (!uri) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(undefined);
      }
    }, 3000);

    Image.getSize(
      uri,
      (width, height) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (width > 0 && height > 0) resolve({ width, height });
        else resolve(undefined);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(undefined);
      }
    );
  });
}

/**
 * Downscales and compresses a local photo into a compact JPEG data URI for fast, reliable
 * Android/iOS WebView PDF rendering (~15x smaller HTML payload than raw camera photos,
 * preventing Android PrintPDFRenderTask stalls and keeping WhatsApp PDFs crisp & lightweight).
 */
async function encodePhotoForPdf(
  uri: string | null | undefined,
  maxWidth: number,
  compress: number,
  knownDims?: ImageDimensions
): Promise<{ dataUri?: string; dims?: ImageDimensions }> {
  if (!uri) return {};
  if (uri.startsWith('data:image/')) {
    return { dataUri: uri, dims: knownDims };
  }
  if (!uri.startsWith('file://') && !uri.startsWith('/')) {
    return {};
  }

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return {};

    // Resize only if image is wider than maxWidth (or unknown width) so we never upscale small images
    const actions: ImageManipulator.Action[] =
      !knownDims || knownDims.width > maxWidth ? [{ resize: { width: maxWidth } }] : [];

    const manipulated = await withTimeout(
      ImageManipulator.manipulateAsync(uri, actions, {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }),
      6000,
      'Image resize timeout'
    );

    if (manipulated.base64) {
      return {
        dataUri: `data:image/jpeg;base64,${manipulated.base64}`,
        dims:
          manipulated.width > 0 && manipulated.height > 0
            ? { width: manipulated.width, height: manipulated.height }
            : knownDims,
      };
    }
  } catch {
    // Fall back to direct base64 read if manipulator fails on this file
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return {};
    const dims = knownDims ?? (await measureImageSize(uri));
    return {
      dataUri: `data:${inferImageMimeType(uri)};base64,${base64}`,
      dims,
    };
  } catch {
    return {};
  }
}

function slugifyTitle(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36) || 'Trip'
  );
}

/**
 * Generates an A4 magazine-style Keepsake PDF completely offline (with optimized base64-inlined
 * photos, exact WYSIWYG cover crop coordinates, and strict print/share timeouts) and opens Share.
 */
export async function exportTripKeepsakePdf(
  options: ExportKeepsakePdfOptions
): Promise<{ uri: string; fileName: string }> {
  const {
    trip,
    memories,
    templateId = 'magazine',
    coverPhotoUriOverride,
    coverDimensions,
    coverCrop,
  } = options;

  const resolvedCoverUri =
    coverPhotoUriOverride === null
      ? undefined
      : coverPhotoUriOverride ||
        trip.coverPhotoUri ||
        memories.find((m) => m.photoUri)?.photoUri;

  const coverEncoded = await encodePhotoForPdf(
    resolvedCoverUri,
    1200,
    0.82,
    coverDimensions
  );

  const photoDataUriMap: Record<string, string> = {};
  for (const m of memories) {
    const srcUri = m.photoUri || m.thumbUri;
    if (!srcUri) continue;
    const encoded = await encodePhotoForPdf(srcUri, 800, 0.78);
    if (encoded.dataUri) {
      photoDataUriMap[m.id] = encoded.dataUri;
    }
  }

  const html = buildTripKeepsakeHtml({
    ...options,
    templateId,
    coverDataUri: coverEncoded.dataUri,
    coverDimensions: coverEncoded.dims ?? coverDimensions,
    coverCrop,
    photoDataUriMap,
  });

  // A4 at 72 PPI = 595 x 842; strict 20s timeout guarantees WebView cold-start stalls never lock UI
  const { uri: rawPdfUri } = await withTimeout(
    Print.printToFileAsync({
      html,
      width: KEEPSAKE_A4_WIDTH,
      height: KEEPSAKE_A4_HEIGHT,
    }),
    20000,
    'The PDF renderer took too long to respond. Please tap Export again.'
  );

  const fileName = `WanderersLedger_${slugifyTitle(trip.title)}_${templateId}.pdf`;
  const cacheDir = (FileSystem as unknown as { cacheDirectory?: string }).cacheDirectory ?? '';
  let finalUri = rawPdfUri;

  if (cacheDir) {
    try {
      const targetUri = `${cacheDir}${fileName}`;
      const existing = await FileSystem.getInfoAsync(targetUri);
      if (existing.exists) {
        await FileSystem.deleteAsync(targetUri, { idempotent: true });
      }
      await FileSystem.moveAsync({ from: rawPdfUri, to: targetUri });
      finalUri = targetUri;
    } catch {
      finalUri = rawPdfUri;
    }
  }

  await shareLocalFileSafely({
    fileUri: finalUri,
    mimeType: 'application/pdf',
    uti: 'com.adobe.pdf',
    title: `${trip.title} — Keepsake PDF`,
  });

  return { uri: finalUri, fileName };
}
