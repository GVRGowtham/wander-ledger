/**
 * Pure, offline photo capture-date extractor.
 * Checks EXIF tags first (DateTimeOriginal, DateTimeDigitized, DateTime, GPSDateStamp),
 * then falls back to common Android/iOS camera & WhatsApp filename timestamps
 * (PXL_YYYYMMDD, IMG_YYYYMMDD, IMG-YYYYMMDD-WA, Screenshot_YYYY-MM-DD, etc.).
 */

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1995 || year > 2035) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export function parseExifDateString(raw?: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Standard EXIF: "2026:10:18 06:45:12" or ISO "2026-10-18T06:45:12" / "2026-10-18 06:45:12"
  const full = trimmed.match(
    /(\d{4})[:\-/](\d{2})[:\-/](\d{2})(?:[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!full) return undefined;

  const year = parseInt(full[1], 10);
  const month = parseInt(full[2], 10);
  const day = parseInt(full[3], 10);
  if (!isValidYmd(year, month, day)) return undefined;

  const hh = full[4] ?? '12';
  const mm = full[5] ?? '00';
  const ss = full[6] ?? '00';
  return `${full[1]}-${full[2]}-${full[3]}T${hh}:${mm}:${ss}`;
}

export function parseDateFromFilename(fileNameOrUri?: string | null): string | undefined {
  if (!fileNameOrUri) return undefined;
  const base = fileNameOrUri.split('/').pop() ?? fileNameOrUri;

  // Pattern 1: Dashed/underscored YYYY-MM-DD (e.g. Screenshot_2025-08-14-15-30-12.png)
  const dashed = base.match(/(?:^|[^0-9])(20\d{2}|199\d)[-_](0[1-9]|1[0-2])[-_](0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/);
  if (dashed) {
    const y = parseInt(dashed[1], 10);
    const m = parseInt(dashed[2], 10);
    const d = parseInt(dashed[3], 10);
    if (isValidYmd(y, m, d)) {
      return `${dashed[1]}-${dashed[2]}-${dashed[3]}T12:00:00`;
    }
  }

  // Pattern 2: Compact YYYYMMDD with optional _HHMMSS[mmm] (Pixel PXL_, Samsung IMG_, WhatsApp IMG-...-WA)
  const compact = base.match(
    /(?:^|[^0-9])(20\d{2}|199\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[_-]([01]\d|2[0-3])([0-5]\d)([0-5]\d)\d{0,4})?(?:[^0-9]|$)/
  );
  if (compact) {
    const y = parseInt(compact[1], 10);
    const m = parseInt(compact[2], 10);
    const d = parseInt(compact[3], 10);
    if (isValidYmd(y, m, d)) {
      const hh = compact[4] ?? '12';
      const mm = compact[5] ?? '00';
      const ss = compact[6] ?? '00';
      return `${compact[1]}-${compact[2]}-${compact[3]}T${hh}:${mm}:${ss}`;
    }
  }

  return undefined;
}

/**
 * Extracts capture date/time from an Expo ImagePicker asset's EXIF dictionary,
 * falling back to filename patterns when Android strips EXIF on downloaded/shared photos.
 */
export function extractPhotoCapturedAt(input: {
  exif?: Record<string, unknown> | null;
  fileName?: string | null;
  uri?: string | null;
}): string | undefined {
  const exif = input.exif ?? {};

  // Check EXIF date fields in priority order (both standard & nested iOS/Android keys)
  const candidates: unknown[] = [
    exif.DateTimeOriginal,
    exif.DateTimeDigitized,
    exif.DateTime,
    exif.CreateDate,
    exif.GPSDateStamp,
    exif['{Exif}'] && typeof exif['{Exif}'] === 'object'
      ? (exif['{Exif}'] as Record<string, unknown>).DateTimeOriginal
      : undefined,
    exif['{Exif}'] && typeof exif['{Exif}'] === 'object'
      ? (exif['{Exif}'] as Record<string, unknown>).DateTimeDigitized
      : undefined,
    exif['{TIFF}'] && typeof exif['{TIFF}'] === 'object'
      ? (exif['{TIFF}'] as Record<string, unknown>).DateTime
      : undefined,
  ];

  for (const c of candidates) {
    const parsed = parseExifDateString(c);
    if (parsed) return parsed;
  }

  // Fallback to filename / URI date pattern (Pixel, Samsung, WhatsApp, Screenshots)
  return parseDateFromFilename(input.fileName) ?? parseDateFromFilename(input.uri);
}

export function extractPhotoGps(
  exif?: Record<string, unknown> | null
): { lat?: number; lng?: number } {
  if (!exif) return {};
  let lat = typeof exif.GPSLatitude === 'number' ? exif.GPSLatitude : undefined;
  let lng = typeof exif.GPSLongitude === 'number' ? exif.GPSLongitude : undefined;

  if (lat !== undefined && exif.GPSLatitudeRef === 'S' && lat > 0) {
    lat = -lat;
  }
  if (lng !== undefined && exif.GPSLongitudeRef === 'W' && lng > 0) {
    lng = -lng;
  }
  return { lat, lng };
}
