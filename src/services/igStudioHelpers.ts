import { DistanceUnit, Flight, Memory, TransportLeg, Trip } from '../types/models';
import { formatDistanceValue, milesToKm } from './distanceUtils';

export type IgFormat = 'story' | 'feed' | 'carousel';
export type IgTemplate = 'scrapbook' | 'route' | 'postcard';
export type IgPaletteId = 'sunlit' | 'alpine' | 'sage' | 'midnight';
export type RouteOverlayMode = 'minimal' | 'top' | 'center' | 'bottom';

export type CollageLayoutId =
  | 'single'
  | 'side_by_side'
  | 'stacked'
  | 'hero_inset'
  | 'hero_top'
  | 'portrait_left'
  | 'hero_bottom'
  | 'triptych'
  | 'grid_2x2'
  | 'hero_top_3'
  | 'tall_left_3';

export interface PhotoCrop {
  /** Normalized horizontal pan in [-1, 1]; +1 aligns left edge, -1 aligns right edge */
  offsetX: number;
  /** Normalized vertical pan in [-1, 1]; +1 aligns top edge (faces), -1 aligns bottom edge */
  offsetY: number;
  /** Zoom multiplier in [1, 2.5] */
  zoom: number;
}

export const DEFAULT_PHOTO_CROP: PhotoCrop = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CroppedImageRect {
  width: number;
  height: number;
  left: number;
  top: number;
  maxShiftX: number;
  maxShiftY: number;
}

export interface LayoutOption {
  id: CollageLayoutId;
  label: string;
  icon: string;
}

export interface IgPaletteSpec {
  id: IgPaletteId;
  label: string;
  swatch: string;
  dark: boolean;
  scrapGradient: [string, string, string];
  carouselMemGradient: [string, string];
  postcardBg: string;
  postcardBorder: string;
  polaroidBg: string;
  polaroidBorder: string;
  ink: string;
  inkMuted: string;
  accent: string;
  accentSoft: string;
  noteBg: string;
  tapeColor: string;
  stampColor: string;
  stampBg: string;
}

export const IG_PALETTES: IgPaletteSpec[] = [
  {
    id: 'sunlit',
    label: 'Sunlit',
    swatch: '#FDE68A',
    dark: false,
    scrapGradient: ['#FFF9F2', '#FEF3C7', '#FFE4E6'],
    carouselMemGradient: ['#FFF9F2', '#FFEDD5'],
    postcardBg: '#FFFDF9',
    postcardBorder: '#E7E5E4',
    polaroidBg: '#FFFFFF',
    polaroidBorder: '#FED7AA',
    ink: '#1C1917',
    inkMuted: '#57534E',
    accent: '#EA580C',
    accentSoft: 'rgba(249, 115, 22, 0.14)',
    noteBg: '#FFF7ED',
    tapeColor: 'rgba(253, 224, 71, 0.72)',
    stampColor: '#E11D48',
    stampBg: '#FFF1F2',
  },
  {
    id: 'alpine',
    label: 'Alpine',
    swatch: '#BAE6FD',
    dark: false,
    scrapGradient: ['#F8FAFC', '#E0F2FE', '#E0E7FF'],
    carouselMemGradient: ['#F8FAFC', '#E0F2FE'],
    postcardBg: '#F8FAFC',
    postcardBorder: '#CBD5E1',
    polaroidBg: '#FFFFFF',
    polaroidBorder: '#BAE6FD',
    ink: '#0F172A',
    inkMuted: '#475569',
    accent: '#0284C7',
    accentSoft: 'rgba(2, 132, 199, 0.13)',
    noteBg: '#EFF6FF',
    tapeColor: 'rgba(125, 211, 252, 0.65)',
    stampColor: '#0369A1',
    stampBg: '#F0F9FF',
  },
  {
    id: 'sage',
    label: 'Sage',
    swatch: '#BBF7D0',
    dark: false,
    scrapGradient: ['#F7FEE7', '#ECFDF5', '#FEF9C3'],
    carouselMemGradient: ['#F7FEE7', '#D1FAE5'],
    postcardBg: '#FAFDF7',
    postcardBorder: '#D9F99D',
    polaroidBg: '#FFFFFF',
    polaroidBorder: '#BBF7D0',
    ink: '#14532D',
    inkMuted: '#4D7C0F',
    accent: '#059669',
    accentSoft: 'rgba(5, 150, 105, 0.13)',
    noteBg: '#ECFDF5',
    tapeColor: 'rgba(134, 239, 172, 0.65)',
    stampColor: '#047857',
    stampBg: '#ECFDF5',
  },
  {
    id: 'midnight',
    label: 'Film',
    swatch: '#1E1B4B',
    dark: true,
    scrapGradient: ['#18181B', '#1E1B4B', '#0F172A'],
    carouselMemGradient: ['#18181B', '#1E1B4B'],
    postcardBg: '#18181B',
    postcardBorder: '#3F3F46',
    polaroidBg: '#27272A',
    polaroidBorder: '#52525B',
    ink: '#FAFAFA',
    inkMuted: '#D4D4D8',
    accent: '#FBBF24',
    accentSoft: 'rgba(251, 191, 36, 0.18)',
    noteBg: 'rgba(255, 255, 255, 0.08)',
    tapeColor: 'rgba(251, 191, 36, 0.55)',
    stampColor: '#FBBF24',
    stampBg: 'rgba(251, 191, 36, 0.12)',
  },
];

export function getPaletteSpec(id: IgPaletteId): IgPaletteSpec {
  return IG_PALETTES.find((p) => p.id === id) ?? IG_PALETTES[0];
}

export const ROUTE_OVERLAY_OPTIONS: Array<{
  id: RouteOverlayMode;
  label: string;
  emoji: string;
}> = [
  { id: 'minimal', label: 'Clean', emoji: '✨' },
  { id: 'top', label: 'Top Seal', emoji: '⬆️' },
  { id: 'center', label: 'Center', emoji: '🎯' },
  { id: 'bottom', label: 'Bottom', emoji: '⬇️' },
];

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseIsoYmd(raw?: string): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Formats an ISO date string like '2025-11-01' -> 'Nov 1, 2025'.
 */
export function formatShortDate(dateStr?: string): string {
  const p = parseIsoYmd(dateStr);
  if (!p) return dateStr ?? '';
  return `${MONTHS_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}

/**
 * Formats an ISO date string for rubber passport stamps: '2025-11-01' -> 'NOV 2025'.
 */
export function formatStampMonthYear(dateStr?: string): string {
  const p = parseIsoYmd(dateStr);
  if (!p) return (dateStr ?? '').slice(0, 7).toUpperCase();
  return `${MONTHS_SHORT[p.month - 1].toUpperCase()} ${p.year}`;
}

/**
 * Formats a trip date range into clean editorial typography:
 * - Same day: 'Nov 1, 2025'
 * - Same month: 'Nov 1 – 5, 2025'
 * - Same year: 'Nov 28 – Dec 3, 2025'
 * - Cross year: 'Dec 29, 2025 – Jan 3, 2026'
 */
export function formatEditorialDateRange(startDate?: string, endDate?: string): string {
  const s = parseIsoYmd(startDate);
  const e = parseIsoYmd(endDate);
  if (!s && !e) return '';
  if (s && !e) return formatShortDate(startDate);
  if (!s && e) return formatShortDate(endDate);
  if (!s || !e) return '';

  const sMon = MONTHS_SHORT[s.month - 1];
  const eMon = MONTHS_SHORT[e.month - 1];

  if (s.year === e.year && s.month === e.month && s.day === e.day) {
    return `${sMon} ${s.day}, ${s.year}`;
  }
  if (s.year === e.year && s.month === e.month) {
    return `${sMon} ${s.day} – ${e.day}, ${s.year}`;
  }
  if (s.year === e.year) {
    return `${sMon} ${s.day} – ${eMon} ${e.day}, ${s.year}`;
  }
  return `${sMon} ${s.day}, ${s.year} – ${eMon} ${e.day}, ${e.year}`;
}

/**
 * Deduplicates city & country labels so 'Switzerland' + 'Switzerland' never prints twice.
 */
export function formatLocationLabel(city?: string, country?: string): string {
  const c = (city ?? '').trim();
  const co = (country ?? '').trim();
  if (!c) return co;
  if (!co) return c;
  if (c.toLowerCase() === co.toLowerCase()) return c;
  return `${c}, ${co}`;
}

export function getTripDaysCount(startDate: string, endDate: string): number {
  const s = new Date(`${startDate}T00:00:00Z`).getTime();
  const e = new Date(`${endDate}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 1;
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

const GENERIC_NOTE_PATTERNS = [
  'a favorite moment from the journey',
  'favorite moment from the journey',
];

export function isGenericPlaceholderNote(note?: string): boolean {
  const cleaned = (note ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return true;
  return GENERIC_NOTE_PATTERNS.some((p) => cleaned === p);
}

export function getDefaultPostcardNote(trip: Trip, memories: Memory[]): string {
  const realNote = memories.find((m) => !isGenericPlaceholderNote(m.note))?.note?.trim();
  if (realNote) return realNote;
  const place = trip.destinationCity?.trim() || trip.destinationCountry?.trim() || 'paradise';
  return `Wishing you were here in ${place} ✨`;
}

export interface RouteStatItem {
  value: string;
  label: string;
}

/**
 * Computes balanced Route Recap stats with ZERO duplicate labels
 * (fixes the '5 DAYS | 5 DAYS | 3 MEMORIES' bug when a trip has no logged flights).
 */
export function getRouteStatsItems(
  trip: Trip,
  memories: Memory[],
  flights: Flight[],
  transports: TransportLeg[] = [],
  distanceUnit: DistanceUnit = 'km'
): RouteStatItem[] {
  const days = getTripDaysCount(trip.startDate, trip.endDate);
  const flightMiles = flights.reduce((sum, f) => sum + (f.distanceMiles || 0), 0);
  const totalDistanceKm =
    milesToKm(flightMiles) +
    transports.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
  const displayDistance = formatDistanceValue(totalDistanceKm, distanceUnit);
  const memCount = memories.length;

  const uniquePlaces = new Set(
    memories
      .map((m) => m.placeName?.trim().toLowerCase())
      .filter((p): p is string => Boolean(p && p.length > 0))
  ).size;

  if (displayDistance > 0) {
    const isFlightOnly = flightMiles > 0 && transports.every((t) => !t.distanceKm);
    const label =
      distanceUnit === 'mi'
        ? isFlightOnly
          ? 'MILES FLOWN'
          : 'MILES TRAVELED'
        : isFlightOnly
        ? 'KM FLOWN'
        : 'KM TRAVELED';
    return [
      { value: displayDistance.toLocaleString(), label },
      { value: String(days), label: days === 1 ? 'DAY' : 'DAYS' },
      { value: String(Math.max(1, memCount)), label: memCount === 1 ? 'MEMORY' : 'MEMORIES' },
    ];
  }

  if (uniquePlaces >= 2) {
    return [
      { value: String(days), label: days === 1 ? 'DAY' : 'DAYS' },
      { value: String(uniquePlaces), label: 'PLACES' },
      { value: String(Math.max(1, memCount)), label: memCount === 1 ? 'MEMORY' : 'MEMORIES' },
    ];
  }

  return [
    { value: String(days), label: days === 1 ? 'DAY' : 'DAYS' },
    { value: String(Math.max(1, memCount)), label: memCount === 1 ? 'MEMORY' : 'MEMORIES' },
  ];
}

export function getAvailableLayouts(photoCount: number): LayoutOption[] {
  if (photoCount <= 1) {
    return [{ id: 'single', label: 'Single', icon: '▢' }];
  }
  if (photoCount === 2) {
    return [
      { id: 'side_by_side', label: 'Side by Side', icon: '◫' },
      { id: 'stacked', label: 'Stacked', icon: '⊟' },
      { id: 'hero_inset', label: 'Hero + Small', icon: '◩' },
    ];
  }
  if (photoCount === 3) {
    return [
      { id: 'hero_top', label: 'Hero Top', icon: '⬒' },
      { id: 'portrait_left', label: 'Tall Left', icon: '◧' },
      { id: 'hero_bottom', label: 'Hero Bottom', icon: '⬓' },
      { id: 'triptych', label: '3 Columns', icon: '⫼' },
    ];
  }
  return [
    { id: 'grid_2x2', label: '2×2 Grid', icon: '⊞' },
    { id: 'hero_top_3', label: 'Hero + 3', icon: '⬒' },
    { id: 'tall_left_3', label: 'Tall Left', icon: '◧' },
  ];
}

export function resolveLayoutForCount(
  photoCount: number,
  preferred?: CollageLayoutId
): CollageLayoutId {
  const options = getAvailableLayouts(photoCount);
  if (preferred && options.some((o) => o.id === preferred)) {
    return preferred;
  }
  return options[0].id;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function sanitizeCrop(crop?: Partial<PhotoCrop>): PhotoCrop {
  return {
    offsetX: clamp(crop?.offsetX ?? 0, -1, 1),
    offsetY: clamp(crop?.offsetY ?? 0, -1, 1),
    zoom: clamp(crop?.zoom ?? 1, 1, 2.5),
  };
}

/**
 * Computes exact pixel placement for an image inside a clipped slot container
 * using normalized pan offsets [-1, 1] and zoom [1, 2.5].
 * Guarantees WYSIWYG parity between preview, Reframe modal, and 1080p export,
 * and never exposes empty gaps inside the slot.
 */
export function computeCroppedImageLayout(
  slotWidth: number,
  slotHeight: number,
  imgWidth: number,
  imgHeight: number,
  rawCrop?: Partial<PhotoCrop>
): CroppedImageRect {
  const sw = Math.max(1, slotWidth);
  const sh = Math.max(1, slotHeight);
  const iw = Math.max(1, imgWidth);
  const ih = Math.max(1, imgHeight);
  const crop = sanitizeCrop(rawCrop);

  const coverScale = Math.max(sw / iw, sh / ih);
  const width = iw * coverScale * crop.zoom;
  const height = ih * coverScale * crop.zoom;

  const maxShiftX = Math.max(0, (width - sw) / 2);
  const maxShiftY = Math.max(0, (height - sh) / 2);

  const left = (sw - width) / 2 + crop.offsetX * maxShiftX;
  const top = (sh - height) / 2 + crop.offsetY * maxShiftY;

  return { width, height, left, top, maxShiftX, maxShiftY };
}

/**
 * Computes the export canvas width in dp so the native Android bitmap is ALWAYS >= 1080px wide
 * without blurry upscaling or excessive RAM use.
 */
export function computeNativeExportCanvasWidth(pixelRatio: number): number {
  const safePr = Math.max(1, pixelRatio || 2);
  return Math.max(360, Math.min(540, Math.ceil(1080 / safePr)));
}
