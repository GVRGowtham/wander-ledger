import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { extractPhotoCapturedAt, extractPhotoGps } from './photoMetadata';

export interface ProcessedPhotoResult {
  photoUri: string;
  thumbUri?: string;
  capturedAt?: string;
  lat?: number;
  lng?: number;
}

const BASE_DIR = FileSystem.documentDirectory ?? '';

async function ensureDir(subDir: string): Promise<string> {
  const dir = `${BASE_DIR}${subDir}/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // Fallback if filesystem API differs
  }
  return dir;
}

/**
 * Picks or captures a memory photo, extracts EXIF timestamp & GPS before stripping,
 * and compresses on-device to lightweight WebP (~200 KB display + ~25 KB thumbnail)
 * so 45,000+ vacation photos fit in Cloudflare R2's 10 GB Free Tier.
 */
export async function pickAndOptimizeMemoryPhoto(
  tripId: string,
  source: 'camera' | 'library'
): Promise<ProcessedPhotoResult | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!perm.granted) {
    return null;
  }

  // Pass quality: 1 so Android does NOT re-encode and strip EXIF tags before ImagePicker reads them
  const pickerResult =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 1,
          exif: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          exif: true,
        });

  if (pickerResult.canceled || !pickerResult.assets?.[0]) {
    return null;
  }

  const asset = pickerResult.assets[0];
  const exif = (asset.exif ?? {}) as Record<string, unknown>;
  const capturedAt = extractPhotoCapturedAt({
    exif,
    fileName: asset.fileName,
    uri: asset.uri,
  });
  const { lat, lng } = extractPhotoGps(exif);

  return optimizeAndPersistPhoto(asset.uri, `memories/${tripId}`, 1600, 0.8, true, {
    capturedAt,
    lat,
    lng,
  });
}

/**
 * Picks a crisp full-resolution document/screenshot from the photo library for OCR first.
 */
export async function pickRawDocumentFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const pickerResult = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });

  if (pickerResult.canceled || !pickerResult.assets?.[0]) {
    return null;
  }
  return pickerResult.assets[0].uri;
}

/**
 * Compresses an already-captured/picked document photo into a compact private WebP
 * saved strictly under `receipts/{tripId}/`.
 */
export async function compressAndSaveReceiptUri(
  sourceUri: string,
  tripId: string
): Promise<string> {
  const res = await optimizeAndPersistPhoto(
    sourceUri,
    `receipts/${tripId}`,
    1200,
    0.7,
    false
  );
  return res.photoUri;
}

/**
 * Captures or picks a scanned receipt/hotel confirmation image and compresses it
 * into an ultra-compact (~60–90 KB) private WebP saved strictly under `receipts/`.
 */
export async function pickAndOptimizeReceiptPhoto(
  tripId: string,
  source: 'camera' | 'library'
): Promise<string | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!perm.granted) return null;

  const pickerResult =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });

  if (pickerResult.canceled || !pickerResult.assets?.[0]) {
    return null;
  }

  return compressAndSaveReceiptUri(pickerResult.assets[0].uri, tripId);
}

export async function optimizeAndPersistPhoto(
  sourceUri: string,
  subDir: string,
  maxWidth: number,
  compress: number,
  makeThumb: boolean,
  meta?: { capturedAt?: string; lat?: number; lng?: number }
): Promise<ProcessedPhotoResult> {
  try {
    const display = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: maxWidth } }],
      { compress, format: ImageManipulator.SaveFormat.WEBP }
    );

    const id = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const dir = await ensureDir(subDir);
    const destUri = `${dir}${id}.webp`;

    if (BASE_DIR) {
      await FileSystem.copyAsync({ from: display.uri, to: destUri });
    }

    let thumbUri: string | undefined;
    if (makeThumb) {
      const thumb = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: 400 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP }
      );
      const thumbDest = `${dir}${id}_thumb.webp`;
      if (BASE_DIR) {
        await FileSystem.copyAsync({ from: thumb.uri, to: thumbDest });
        thumbUri = thumbDest;
      } else {
        thumbUri = thumb.uri;
      }
    }

    return {
      photoUri: BASE_DIR ? destUri : display.uri,
      thumbUri,
      capturedAt: meta?.capturedAt,
      lat: meta?.lat,
      lng: meta?.lng,
    };
  } catch {
    return {
      photoUri: sourceUri,
      capturedAt: meta?.capturedAt,
      lat: meta?.lat,
      lng: meta?.lng,
    };
  }
}

/**
 * Permanently deletes one or more local app-storage photo/thumbnail files (memories or receipts).
 */
export async function deleteLocalPhotoFiles(uris: Array<string | undefined>): Promise<void> {
  for (const uri of uris) {
    if (!uri) continue;
    // Only delete files inside local app storage (never remote URLs)
    if (!uri.startsWith('file://') && !uri.startsWith('/')) continue;
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // Ignore already-deleted or inaccessible files
    }
  }
}

/**
 * Removes all locally stored memory photos and private receipt files for a deleted trip.
 */
export async function deleteLocalTripMediaDir(tripId: string): Promise<void> {
  if (!BASE_DIR) return;
  for (const sub of [`memories/${tripId}`, `receipts/${tripId}`]) {
    try {
      await FileSystem.deleteAsync(`${BASE_DIR}${sub}`, { idempotent: true });
    } catch {
      // Ignore missing directory
    }
  }
}
