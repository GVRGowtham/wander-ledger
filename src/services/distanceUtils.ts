import { DistanceUnit, Flight, Stay, TransportLeg, TransportMode, TripStop } from '../types/models';

export const KM_PER_MILE = 1.60934;

export function milesToKm(miles: number): number {
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  return Math.round(miles * KM_PER_MILE);
}

export function kmToMiles(km: number): number {
  if (!Number.isFinite(km) || km <= 0) return 0;
  return Math.round(km / KM_PER_MILE);
}

export function convertToKm(value: number, inputUnit: DistanceUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return inputUnit === 'mi' ? Math.round(value * KM_PER_MILE) : Math.round(value);
}

export function formatDistanceValue(distanceKm: number, unit: DistanceUnit): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return unit === 'mi' ? kmToMiles(distanceKm) : Math.round(distanceKm);
}

export function formatDistance(
  distanceKm: number,
  unit: DistanceUnit = 'km',
  opts?: { compact?: boolean; uppercase?: boolean }
): string {
  const val = formatDistanceValue(distanceKm, unit);
  const label = opts?.uppercase ? (unit === 'mi' ? 'MI' : 'KM') : unit;
  if (opts?.compact && val >= 1000) {
    return `${(val / 1000).toFixed(1)}k ${label}`;
  }
  return `${val.toLocaleString()} ${label}`;
}

export function formatFlightDistance(
  distanceMiles: number,
  unit: DistanceUnit = 'km',
  opts?: { compact?: boolean; uppercase?: boolean }
): string {
  return formatDistance(milesToKm(distanceMiles), unit, opts);
}

export function getUnitLabel(unit: DistanceUnit, long = false): string {
  if (long) return unit === 'mi' ? 'MILES' : 'KM';
  return unit === 'mi' ? 'mi' : 'km';
}

export function getTransportModeEmoji(mode: TransportMode): string {
  switch (mode) {
    case 'train':
      return '🚆';
    case 'bus':
      return '🚌';
    case 'ferry':
      return '⛴️';
    case 'rental_car':
      return '🚗';
    case 'own_car':
      return '🚘';
  }
}

export function getTransportModeLabel(mode: TransportMode): string {
  switch (mode) {
    case 'train':
      return 'Train';
    case 'bus':
      return 'Bus';
    case 'ferry':
      return 'Ferry';
    case 'rental_car':
      return 'Rental Car';
    case 'own_car':
      return 'Own Car';
  }
}

/**
 * Matches an ISO date (or YYYY-MM-DDTHH:mm timestamp) against a trip's stops.
 * Prefers the narrowest matching date range if multiple stops overlap on a transition day.
 */
export function matchStopForDate(
  stops: TripStop[],
  isoDateOrTimestamp?: string
): TripStop | undefined {
  if (!isoDateOrTimestamp || stops.length === 0) return undefined;
  const day = isoDateOrTimestamp.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;

  const candidates = stops.filter((s) => {
    if (!s.startDate) return false;
    const end = s.endDate || s.startDate;
    return day >= s.startDate && day <= end;
  });

  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  // Prefer the stop whose startDate matches exact day (arrival day), else narrowest span
  const exactStart = candidates.find((s) => s.startDate === day);
  if (exactStart) return exactStart;

  return [...candidates].sort((a, b) => {
    const spanA =
      new Date(`${(a.endDate || a.startDate)!}T00:00:00Z`).getTime() -
      new Date(`${a.startDate!}T00:00:00Z`).getTime();
    const spanB =
      new Date(`${(b.endDate || b.startDate)!}T00:00:00Z`).getTime() -
      new Date(`${b.startDate!}T00:00:00Z`).getTime();
    return spanA - spanB;
  })[0];
}

export interface SuggestedStop {
  cityName: string;
  startDate?: string;
  endDate?: string;
  sourceLabel: string;
}

/**
 * Suggests missing TripStops from existing flights, transports, and stays so
 * multi-hop trips take zero manual typing to organize!
 */
export function suggestStopsFromBookings(
  flights: Flight[],
  transports: TransportLeg[],
  stays: Stay[],
  existingStops: TripStop[]
): SuggestedStop[] {
  const existingKeys = new Set(
    existingStops.map((s) => s.cityName.trim().toLowerCase())
  );
  const suggestions = new Map<string, SuggestedStop>();

  const register = (rawCity: string | undefined, startDate?: string, endDate?: string, sourceLabel = '') => {
    const clean = (rawCity || '').trim();
    if (!clean || clean.length < 2) return;
    const key = clean.toLowerCase();
    if (existingKeys.has(key)) return;
    const prev = suggestions.get(key);
    if (!prev) {
      suggestions.set(key, {
        cityName: clean,
        startDate: startDate?.slice(0, 10),
        endDate: endDate?.slice(0, 10),
        sourceLabel,
      });
    } else if (startDate && (!prev.startDate || startDate.slice(0, 10) < prev.startDate)) {
      prev.startDate = startDate.slice(0, 10);
      if (endDate) prev.endDate = endDate.slice(0, 10);
    }
  };

  for (const f of flights) {
    if (f.destCity && f.destCity !== f.destIata) {
      register(f.destCity, f.arrivalTime || f.departureTime, undefined, `✈️ ${f.flightNumber}`);
    }
  }
  for (const t of transports) {
    register(t.destination, t.startDate, t.endDate, `${getTransportModeEmoji(t.mode)} ${t.title}`);
  }
  for (const s of stays) {
    if (s.address) {
      const firstPart = s.address.split(',')[0]?.trim();
      if (firstPart && firstPart.length >= 3 && firstPart.length <= 28 && !/\d{3,}/.test(firstPart)) {
        register(firstPart, s.checkIn, s.checkOut, `🏨 ${s.name}`);
      }
    }
  }

  return Array.from(suggestions.values()).slice(0, 6);
}

export type JourneyTimelineItem =
  | { kind: 'flight'; sortKey: string; dateLabel: string; timeLabel?: string; flight: Flight }
  | { kind: 'transport'; sortKey: string; dateLabel: string; timeLabel?: string; transport: TransportLeg }
  | { kind: 'stay'; sortKey: string; dateLabel: string; timeLabel?: string; stay: Stay };

function normalizeTimelineSortKey(isoLike: string, fallbackHm: string): {
  sortKey: string;
  dateLabel: string;
  timeLabel?: string;
} {
  const datePart = (isoLike || '').slice(0, 10);
  const rawTime = isoLike.includes('T') && isoLike.length >= 16 ? isoLike.slice(11, 16) : '';
  const hasExplicitTime = /^\d{2}:\d{2}$/.test(rawTime) && rawTime !== '00:00';
  const sortTime = hasExplicitTime ? rawTime : fallbackHm;
  return {
    sortKey: `${datePart}T${sortTime}`,
    dateLabel: datePart,
    timeLabel: hasExplicitTime ? rawTime : undefined,
  };
}

/**
 * Merges flights, ground/sea transport legs, and stays into one clean
 * chronological journey timeline (sorted earliest → latest by date & time).
 */
export function buildJourneyTimeline(
  flights: Flight[],
  transports: TransportLeg[],
  stays: Stay[]
): JourneyTimelineItem[] {
  const items: JourneyTimelineItem[] = [];

  for (const f of flights) {
    const { sortKey, dateLabel, timeLabel } = normalizeTimelineSortKey(f.departureTime, '08:00');
    items.push({
      kind: 'flight',
      sortKey,
      dateLabel,
      timeLabel,
      flight: f,
    });
  }

  for (const t of transports) {
    const { sortKey, dateLabel, timeLabel } = normalizeTimelineSortKey(t.startDate, '09:00');
    items.push({
      kind: 'transport',
      sortKey,
      dateLabel,
      timeLabel,
      transport: t,
    });
  }

  for (const s of stays) {
    const { sortKey, dateLabel } = normalizeTimelineSortKey(s.checkIn, '14:00');
    items.push({
      kind: 'stay',
      sortKey,
      dateLabel,
      stay: s,
    });
  }

  return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/**
 * Builds a compact visual route trail like "✈️ BLR → ZRH  ▸  🚆 Lucerne  ▸  🚆 Interlaken"
 */
export function buildJourneyRouteTrail(
  flights: Flight[],
  transports: TransportLeg[],
  stops: TripStop[]
): string | null {
  const hops: string[] = [];

  if (flights.length > 0) {
    const first = [...flights].sort((a, b) => a.departureTime.localeCompare(b.departureTime))[0];
    hops.push(`✈️ ${first.originIata} → ${first.destIata}`);
  }

  if (stops.length > 0) {
    for (const s of stops) {
      const label = s.cityName.trim();
      if (!label) continue;
      if (!hops.some((h) => h.toLowerCase().includes(label.toLowerCase()))) {
        hops.push(`📍 ${label}`);
      }
    }
  } else if (transports.length > 0) {
    const sorted = [...transports].sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (const t of sorted.slice(0, 4)) {
      const icon = getTransportModeEmoji(t.mode);
      const leg = t.origin && t.destination ? `${t.origin} → ${t.destination}` : t.destination || t.title;
      hops.push(`${icon} ${leg}`);
    }
  }

  if (hops.length === 0) return null;
  return hops.slice(0, 5).join('  ▸  ');
}
