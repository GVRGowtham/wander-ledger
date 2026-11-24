import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
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

function inferImageMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/webp';
}

async function readLocalImageAsDataUri(uri?: string | null): Promise<string | undefined> {
  if (!uri) return undefined;
  if (uri.startsWith('data:image/')) return uri;
  if (!uri.startsWith('file://') && !uri.startsWith('/')) return undefined;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return undefined;
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return undefined;
    return `data:${inferImageMimeType(uri)};base64,${base64}`;
  } catch {
    return undefined;
  }
}

function measureImageSize(uri?: string | null): Promise<ImageDimensions | undefined> {
  if (!uri) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) resolve({ width, height });
        else resolve(undefined);
      },
      () => resolve(undefined)
    );
  });
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
 * Generates an A4 magazine-style Keepsake PDF completely offline (with base64-inlined photos
 * and exact WYSIWYG cover crop coordinates so Android & iOS render identically) and opens Share.
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

  const [coverDataUri, measuredCoverDims] = await Promise.all([
    readLocalImageAsDataUri(resolvedCoverUri),
    coverDimensions ? Promise.resolve(coverDimensions) : measureImageSize(resolvedCoverUri),
  ]);

  const photoDataUriMap: Record<string, string> = {};
  for (const m of memories) {
    const srcUri = m.photoUri || m.thumbUri;
    if (!srcUri) continue;
    const dataUri = await readLocalImageAsDataUri(srcUri);
    if (dataUri) {
      photoDataUriMap[m.id] = dataUri;
    }
  }

  const html = buildTripKeepsakeHtml({
    ...options,
    templateId,
    coverDataUri,
    coverDimensions: measuredCoverDims,
    coverCrop,
    photoDataUriMap,
  });

  // A4 at 72 PPI = 595 x 842
  const { uri: rawPdfUri } = await Print.printToFileAsync({
    html,
    width: KEEPSAKE_A4_WIDTH,
    height: KEEPSAKE_A4_HEIGHT,
  });

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
