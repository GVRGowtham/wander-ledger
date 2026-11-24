import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  DistanceUnit,
  Flight,
  Memory,
  Stay,
  TransportLeg,
  Trip,
  TripStop,
} from '../types/models';
import { buildTripKeepsakeHtml } from './keepsakePdfBuilder';

export interface ExportKeepsakePdfOptions {
  trip: Trip;
  flights: Flight[];
  transports: TransportLeg[];
  stops: TripStop[];
  stays: Stay[];
  memories: Memory[];
  distanceUnit: DistanceUnit;
}

function inferImageMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/webp';
}

async function readLocalImageAsDataUri(uri?: string): Promise<string | undefined> {
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
 * so both Android & iOS render identically) and opens the native Share sheet.
 */
export async function exportTripKeepsakePdf(
  options: ExportKeepsakePdfOptions
): Promise<{ uri: string; fileName: string }> {
  const { trip, memories } = options;

  // Inline cover photo + memory photos as base64 data URIs (required for iOS WKWebView print)
  const coverDataUri = await readLocalImageAsDataUri(trip.coverPhotoUri);
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
    coverDataUri,
    photoDataUriMap,
  });

  // A4 at 72 PPI = 595 x 842
  const { uri: rawPdfUri } = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
  });

  const fileName = `WanderersLedger_${slugifyTitle(trip.title)}_Keepsake.pdf`;
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

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(finalUri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `${trip.title} — Keepsake PDF`,
    });
  }

  return { uri: finalUri, fileName };
}
