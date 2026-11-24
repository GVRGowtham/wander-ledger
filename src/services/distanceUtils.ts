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

export interface FlightChain {
  originIata: string;
  originCity: string;
  destIata: string;
  destCity: string;
  viaIatas: string[];
  departureTime: string;
  arrivalTime: string;
  legs: Flight[];
}

export interface JourneyRouteNode {
  city: string;
  iata?: string;
  kind: 'flight_origin' | 'flight_dest' | 'stop' | 'transport';
  viaIatas?: string[];
  modeEmoji?: string;
}

export interface StructuredJourneyRoute {
  flightChains: FlightChain[];
  nodes: JourneyRouteNode[];
  compactTrail: string | null;
}

const CITY_SYNONYM_MAP: Record<string, string> = {
  bangalore: 'bengaluru',
  bombay: 'mumbai',
  calcutta: 'kolkata',
  madras: 'chennai',
  venezia: 'venice',
  luzern: 'lucerne',
  zurich: 'zurich',
  geneve: 'geneva',
  munchen: 'munich',
  firenze: 'florence',
  roma: 'rome',
  milano: 'milan',
  wien: 'vienna',
};

function normalizeCityKey(raw?: string | null): string {
  if (!raw) return '';
  let s = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  // Strip common station/airport suffixes so "Zurich HB" matches "Zurich"
  s = s
    .replace(
      /\b(?:hb|hauptbahnhof|central|centrale|station|airport|intl|international|gare\s+de\s+\w+|santa\s+lucia|stazione|terminal)\b/g,
      ' '
    )
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return CITY_SYNONYM_MAP[s] ?? s;
}

function cleanDisplayCity(raw?: string | null, fallbackIata?: string): string {
  const s = (raw || '').trim();
  if (!s || s.toUpperCase() === 'TBD') return fallbackIata || '';
  return s;
}

function parseIsoMillis(isoLike?: string | null): number | null {
  if (!isoLike) return null;
  const normalized =
    isoLike.length === 10
      ? `${isoLike}T12:00:00Z`
      : isoLike.endsWith('Z')
        ? isoLike
        : `${isoLike.slice(0, 19)}Z`;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Groups connecting flight legs (same intermediate IATA within <=24h layover,
 * unless the user explicitly added that intermediate city as a real TripStop).
 * Example: BLR -> AUH (Oct 31) + AUH -> ZRH (Nov 1) => BLR -> ZRH (via AUH).
 */
export function groupConnectingFlights(
  flights: Flight[],
  stops: TripStop[] = []
): FlightChain[] {
  if (flights.length === 0) return [];
  const stopKeys = new Set(stops.map((s) => normalizeCityKey(s.cityName)).filter(Boolean));
  const sorted = [...flights].sort((a, b) =>
    normalizeTimelineSortKey(a.departureTime, '08:00').sortKey.localeCompare(
      normalizeTimelineSortKey(b.departureTime, '08:00').sortKey
    )
  );

  const chains: FlightChain[] = [];
  for (const f of sorted) {
    const prev = chains[chains.length - 1];
    if (prev && prev.destIata && f.originIata && prev.destIata !== 'TBD') {
      const sameHub = prev.destIata.toUpperCase() === f.originIata.toUpperCase();
      const hubCityKey = normalizeCityKey(prev.destCity || prev.destIata);
      const isExplicitStop = hubCityKey && stopKeys.has(hubCityKey);

      const prevEndMs = parseIsoMillis(prev.arrivalTime) ?? parseIsoMillis(prev.departureTime);
      const nextStartMs = parseIsoMillis(f.departureTime);
      const gapHours =
        prevEndMs !== null && nextStartMs !== null
          ? (nextStartMs - prevEndMs) / 3600000
          : 999;

      // Stitch if same connecting hub, not an explicit Stop, and layover is <= 24h (allowing date-only midnight gap <= 30h)
      const hasExactTimes =
        prev.departureTime.length >= 16 &&
        !prev.departureTime.slice(11, 16).startsWith('00:00') &&
        f.departureTime.length >= 16 &&
        !f.departureTime.slice(11, 16).startsWith('00:00');
      const maxLayoverHours = hasExactTimes ? 24 : 30;

      if (sameHub && !isExplicitStop && gapHours >= -4 && gapHours <= maxLayoverHours) {
        prev.viaIatas.push(prev.destIata.toUpperCase());
        prev.destIata = f.destIata;
        prev.destCity = cleanDisplayCity(f.destCity, f.destIata);
        prev.arrivalTime = f.arrivalTime || f.departureTime;
        prev.legs.push(f);
        continue;
      }
    }

    chains.push({
      originIata: f.originIata,
      originCity: cleanDisplayCity(f.originCity, f.originIata),
      destIata: f.destIata,
      destCity: cleanDisplayCity(f.destCity, f.destIata),
      viaIatas: [],
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime || f.departureTime,
      legs: [f],
    });
  }

  return chains;
}

/**
 * Builds a chronologically accurate, revisit-preserving journey route combining:
 * - Connecting flight chains (e.g. BLR -> ZRH via AUH, CDG -> BLR via AUH)
 * - Ground/sea transport legs (e.g. Zurich -> Venice)
 * - Multi-hop TripStops (preserving hub revisits like Zurich -> Lucerne -> Zurich!)
 *
 * Only collapses *adjacent* duplicate cities (Zurich -> Zurich => Zurich),
 * never dropping intentional revisits (Zurich -> Lucerne -> Zurich).
 */
export function buildStructuredJourneyRoute(
  flights: Flight[],
  transports: TransportLeg[],
  stops: TripStop[]
): StructuredJourneyRoute {
  const flightChains = groupConnectingFlights(flights, stops);

  type RouteEvent =
    | { sortKey: string; order: number; kind: 'flight'; chain: FlightChain }
    | { sortKey: string; order: number; kind: 'transport'; transport: TransportLeg }
    | { sortKey: string; order: number; kind: 'stop'; stop: TripStop };

  const events: RouteEvent[] = [];
  let seq = 0;

  for (const chain of flightChains) {
    const sk = normalizeTimelineSortKey(chain.departureTime, '06:00').sortKey;
    events.push({ sortKey: sk, order: seq++, kind: 'flight', chain });
  }

  for (const t of transports) {
    const sk = normalizeTimelineSortKey(t.startDate, '10:00').sortKey;
    events.push({ sortKey: sk, order: seq++, kind: 'transport', transport: t });
  }

  // Dated stops sort directly on the timeline; undated stops slot cleanly after the
  // outbound arrival and before the final return flight in their user-defined sortOrder.
  const firstArrivalDate =
    flightChains[0]?.arrivalTime?.slice(0, 10) ||
    flightChains[0]?.departureTime?.slice(0, 10) ||
    transports[0]?.startDate?.slice(0, 10) ||
    '0000-01-01';

  const orderedStops = [...stops].sort((a, b) => {
    if (a.startDate && b.startDate && a.startDate !== b.startDate) {
      return a.startDate.localeCompare(b.startDate);
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });

  orderedStops.forEach((s, idx) => {
    const sortKey = s.startDate
      ? `${s.startDate.slice(0, 10)}T12:00:${String(idx).padStart(2, '0')}`
      : `${firstArrivalDate}T18:${String(idx).padStart(2, '0')}`;
    events.push({ sortKey, order: seq++, kind: 'stop', stop: s });
  });

  events.sort((a, b) =>
    a.sortKey !== b.sortKey ? a.sortKey.localeCompare(b.sortKey) : a.order - b.order
  );

  // Build revisit-preserving city node sequence (collapse ONLY consecutive duplicates)
  const nodes: JourneyRouteNode[] = [];
  const pushNode = (node: JourneyRouteNode) => {
    const key = normalizeCityKey(node.city);
    if (!key) return;
    const last = nodes[nodes.length - 1];
    if (last && normalizeCityKey(last.city) === key) {
      // Upgrade metadata if incoming node has IATA or flight info
      if (!last.iata && node.iata) last.iata = node.iata;
      return;
    }
    nodes.push(node);
  };

  // Also build compact hop strings for the UI pill strip
  const hopStrings: string[] = [];
  let lastHopCityKey = '';

  const pushCityHop = (emoji: string, display: string, cityKeyOverride?: string) => {
    const key = cityKeyOverride ?? normalizeCityKey(display);
    if (!key || key === lastHopCityKey) return;
    hopStrings.push(`${emoji} ${display}`);
    lastHopCityKey = key;
  };

  for (const ev of events) {
    if (ev.kind === 'flight') {
      const c = ev.chain;
      const viaSuffix = c.viaIatas.length > 0 ? ` (via ${c.viaIatas.join(', ')})` : '';
      pushNode({
        city: c.originCity || c.originIata,
        iata: c.originIata,
        kind: 'flight_origin',
        modeEmoji: '✈️',
      });
      pushNode({
        city: c.destCity || c.destIata,
        iata: c.destIata,
        kind: 'flight_dest',
        viaIatas: c.viaIatas.length > 0 ? c.viaIatas : undefined,
        modeEmoji: '✈️',
      });
      hopStrings.push(`✈️ ${c.originIata} → ${c.destIata}${viaSuffix}`);
      lastHopCityKey = normalizeCityKey(c.destCity || c.destIata);
    } else if (ev.kind === 'stop') {
      const label = ev.stop.cityName.trim();
      if (!label) continue;
      pushNode({ city: label, kind: 'stop', modeEmoji: '📍' });
      pushCityHop('📍', label);
    } else {
      const t = ev.transport;
      const icon = getTransportModeEmoji(t.mode);
      const originKey = normalizeCityKey(t.origin);
      const destKey = normalizeCityKey(t.destination);
      const alreadyHasConsecutivePair =
        nodes.length >= 2 &&
        normalizeCityKey(nodes[nodes.length - 2].city) === originKey &&
        normalizeCityKey(nodes[nodes.length - 1].city) === destKey;

      if (!alreadyHasConsecutivePair) {
        if (t.origin && t.origin.toLowerCase() !== 'start') {
          pushNode({ city: t.origin.trim(), kind: 'transport', modeEmoji: icon });
        }
        if (t.destination) {
          pushNode({ city: t.destination.trim(), kind: 'transport', modeEmoji: icon });
        }
      }

      if (t.destination && destKey !== lastHopCityKey) {
        const leg =
          t.origin && originKey !== lastHopCityKey && t.origin.toLowerCase() !== 'start'
            ? `${t.origin.trim()} → ${t.destination.trim()}`
            : t.destination.trim();
        hopStrings.push(`${icon} ${leg}`);
        lastHopCityKey = destKey;
      }
    }
  }

  return {
    flightChains,
    nodes,
    compactTrail: hopStrings.length > 0 ? hopStrings.join('  ▸  ') : null,
  };
}

/**
 * Builds a compact visual route trail like:
 * "✈️ BLR → ZRH (via AUH)  ▸  📍 Lucerne  ▸  📍 Zurich  ▸  📍 Venice  ▸  ✈️ CDG → BLR (via AUH)"
 */
export function buildJourneyRouteTrail(
  flights: Flight[],
  transports: TransportLeg[],
  stops: TripStop[]
): string | null {
  return buildStructuredJourneyRoute(flights, transports, stops).compactTrail;
}
