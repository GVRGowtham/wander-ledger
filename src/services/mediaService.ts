import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface ProcessedPhotoResult {
  photoUri: string;
  thumbUri?: string;
  capturedAt?: string;
  lat?: number;
  lng?: number;
}

const BASE_DIR = (FileSystem as unknown as { documentDirectory?: string }).documentDirectory ?? '';

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

  const pickerResult =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          exif: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          exif: true,
        });

  if (pickerResult.canceled || !pickerResult.assets?.[0]) {
    return null;
  }

  const asset = pickerResult.assets[0];
  const exif = (asset.exif ?? {}) as Record<string, unknown>;
  const capturedAt = parseExifDate(exif.DateTimeOriginal as string | undefined);
  const lat = typeof exif.GPSLatitude === 'number' ? exif.GPSLatitude : undefined;
  const lng = typeof exif.GPSLongitude === 'number' ? exif.GPSLongitude : undefined;

  return optimizeAndPersistPhoto(asset.uri, `memories/${tripId}`, 1600, 0.8, true, {
    capturedAt,
    lat,
    lng,
  });
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

  const res = await optimizeAndPersistPhoto(
    pickerResult.assets[0].uri,
    `receipts/${tripId}`,
    1200,
    0.7,
    false
  );
  return res.photoUri;
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

function parseExifDate(exifDate?: string): string | undefined {
  if (!exifDate) return undefined;
  // EXIF format: "2026:10:18 06:45:12"
  const m = exifDate.match(/(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`;
}
