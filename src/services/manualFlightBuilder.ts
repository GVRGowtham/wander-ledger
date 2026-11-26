import {
  AIRPORTS_BY_RANK,
  AirportInfo,
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  lookupAirline,
  lookupAirport,
  lookupAirportByCity,
  normalizeSearchText,
} from '../db/airportsData';
import { Flight } from '../types/models';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface ManualFlightInput {
  tripId: string;
  flightNumber?: string;
  airlineName?: string;
  originInput?: string;
  destInput?: string;
  flightDate?: string; // YYYY-MM-DD
  departureTimeHm?: string; // HH:MM (optional)
  arrivalTimeHm?: string; // HH:MM (optional)
  cabinClass?: string;
  seat?: string;
  pnr?: string;
  terminal?: string;
  gate?: string;
  aircraft?: string;
  milesEarned?: string | number;
  frequentFlyerNumber?: string;
  loyaltyProgram?: string;
  fallbackDestCity?: string;
}

export interface ParsedFlightNumber {
  airlineCode: string;
  flightNumber: string;
  airlineName: string;
  loyaltyProgram: string;
}

export interface ResolvedLocation {
  iata: string;
  city: string;
  airport?: AirportInfo;
}

/**
 * Search bundled offline airports (5,300+ global commercial airports) by IATA code,
 * city, airport name, or country — accent-insensitive and ranked with major hubs first.
 */
export function searchAirports(query: string, limit = 5): AirportInfo[] {
  const q = normalizeSearchText(query);
  if (!q) return [];

  const scored: Array<{ ap: AirportInfo; score: number }> = [];

  for (const ap of AIRPORTS_BY_RANK) {
    const iata = ap.iata.toLowerCase();
    const city = normalizeSearchText(ap.city);
    const name = normalizeSearchText(ap.name);
    const country = normalizeSearchText(ap.country);
    // Boost major international hubs above tiny regional airfields
    const hubBoost = ap.sizeRank * 6;

    if (iata === q) {
      scored.push({ ap, score: 200 + hubBoost });
    } else if (city === q) {
      scored.push({ ap, score: 170 + hubBoost });
    } else if (iata.startsWith(q)) {
      scored.push({ ap, score: 140 + hubBoost });
    } else if (city.startsWith(q)) {
      scored.push({ ap, score: 120 + hubBoost });
    } else if (city.includes(q) || name.includes(q)) {
      scored.push({ ap, score: 90 + hubBoost });
    } else if (country.startsWith(q) || country.includes(q)) {
      scored.push({ ap, score: 60 + hubBoost });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.ap.iata.localeCompare(b.ap.iata))
    .slice(0, limit)
    .map((s) => s.ap);
}

/**
 * Resolve user-entered airport code or city text into an IATA code + display city.
 * Never fails — gracefully accepts custom regional cities not in the bundled DB.
 */
export function resolveAirportOrCity(raw?: string): ResolvedLocation | null {
  const clean = (raw || '').trim();
  if (!clean) return null;

  // 1. Explicit "BLR - Bengaluru" or "WAW (Warsaw)" leading uppercase 3-letter IATA format
  const leadingExplicitCode = clean.match(/^([A-Z]{3})\s*(?:[-·,(]|$)/);
  if (leadingExplicitCode) {
    const exact = lookupAirport(leadingExplicitCode[1]);
    if (exact) {
      return { iata: exact.iata, city: exact.city, airport: exact };
    }
  }

  // 2. Exact city match FIRST for multi-word / lowercase city names (prevents "San Francisco" -> SAN or "Los Angeles" -> LOS or "New York" -> NEW)
  const exactCity = lookupAirportByCity(clean);
  if (exactCity && !/^[A-Z]{3}$/.test(clean)) {
    return { iata: exactCity.iata, city: exactCity.city, airport: exactCity };
  }

  // 3. Exact 3-letter IATA lookup (case-insensitive, e.g. "waw" or "FCO")
  if (/^[A-Za-z]{3}$/.test(clean)) {
    const exact = lookupAirport(clean);
    if (exact) {
      return { iata: exact.iata, city: exact.city, airport: exact };
    }
  }

  // 4. Accent-insensitive match against city/airport name (e.g. "Krakow", "Warsaw Modlin")
  const matches = searchAirports(clean, 1);
  if (matches.length > 0) {
    const best = matches[0];
    const qNorm = normalizeSearchText(clean);
    const cityNorm = normalizeSearchText(best.city);
    const nameNorm = normalizeSearchText(best.name);
    if (
      cityNorm.includes(qNorm) ||
      qNorm.includes(cityNorm) ||
      nameNorm.includes(qNorm)
    ) {
      return { iata: best.iata, city: best.city, airport: best };
    }
  }

  // 5. Unknown 3-letter IATA code
  if (/^[A-Za-z]{3}$/.test(clean)) {
    return { iata: clean.toUpperCase(), city: clean.toUpperCase() };
  }

  // 6. Custom city fallback (e.g. "Coorg", "Interlaken")
  const letters = clean.replace(/[^A-Za-z]/g, '').toUpperCase();
  const pseudoIata = (letters.slice(0, 3) || 'DST').padEnd(3, 'X');
  return { iata: pseudoIata, city: clean };
}

/**
 * Parse a user-typed flight number like "NH 105", "6E412", "UA-875", or "BA 117".
 */
export function parseFlightNumberInput(raw?: string): ParsedFlightNumber | null {
  const clean = (raw || '').trim().toUpperCase();
  if (!clean) return null;

  const match = clean.match(/^([A-Z0-9]{2})\s*[-]?\s*(\d{1,4}[A-Z]?)$/);
  if (!match) return null;

  const airlineCode = match[1];
  const numberPart = match[2];
  const airline = lookupAirline(airlineCode);

  return {
    airlineCode,
    flightNumber: `${airlineCode} ${numberPart}`,
    airlineName: airline.name,
    loyaltyProgram: airline.loyaltyProgram,
  };
}

function normalizeTimeHm(hm?: string): string | null {
  const clean = (hm || '').trim();
  if (!clean) return null;
  const m = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Build a complete Flight record from whatever partial or full details the user remembers.
 */
export function buildManualFlight(input: ManualFlightInput): Flight {
  const parsedNum = parseFlightNumberInput(input.flightNumber);
  const origin = resolveAirportOrCity(input.originInput);
  const dest =
    resolveAirportOrCity(input.destInput) ??
    (input.fallbackDestCity ? resolveAirportOrCity(input.fallbackDestCity) : null);

  const airlineCode =
    parsedNum?.airlineCode ||
    (input.airlineName?.trim().slice(0, 2).toUpperCase() || 'FL');
  const airlineName =
    input.airlineName?.trim() ||
    parsedNum?.airlineName ||
    'Manual Flight';
  const flightNumber =
    parsedNum?.flightNumber ||
    input.flightNumber?.trim().toUpperCase() ||
    'Flight';

  const distanceMiles =
    origin?.airport && dest?.airport
      ? calculateDistanceMiles(
          origin.airport.lat,
          origin.airport.lng,
          dest.airport.lat,
          dest.airport.lng
        )
      : 0;
  const durationMinutes =
    distanceMiles > 0 ? estimateFlightDurationMinutes(distanceMiles) : 0;

  const dateStr =
    input.flightDate && /^\d{4}-\d{2}-\d{2}$/.test(input.flightDate.trim())
      ? input.flightDate.trim()
      : new Date().toISOString().slice(0, 10);

  const depHm = normalizeTimeHm(input.departureTimeHm);
  const arrHm = normalizeTimeHm(input.arrivalTimeHm);

  const departureTime = depHm ? `${dateStr}T${depHm}:00` : `${dateStr}T00:00:00`;
  let arrivalTime = arrHm ? `${dateStr}T${arrHm}:00` : departureTime;
  if (!arrHm && depHm && durationMinutes > 0) {
    const depMs = new Date(`${dateStr}T${depHm}:00Z`).getTime();
    if (!Number.isNaN(depMs)) {
      arrivalTime = new Date(depMs + durationMinutes * 60000).toISOString().slice(0, 19);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const status: Flight['status'] = dateStr < today ? 'completed' : 'scheduled';

  const explicitMiles =
    input.milesEarned !== undefined && String(input.milesEarned).trim() !== ''
      ? parseInt(String(input.milesEarned).replace(/[^0-9]/g, ''), 10)
      : NaN;
  const milesEarned =
    !Number.isNaN(explicitMiles) && explicitMiles >= 0
      ? explicitMiles
      : distanceMiles;

  const loyaltyProgram =
    input.loyaltyProgram?.trim() ||
    parsedNum?.loyaltyProgram ||
    (airlineName !== 'Manual Flight' ? `${airlineName} Loyalty` : undefined);

  return {
    id: generateId('flt'),
    tripId: input.tripId,
    airlineCode,
    airlineName,
    flightNumber,
    pnr: input.pnr?.trim().toUpperCase() || undefined,
    originIata: origin?.iata || 'TBD',
    originCity: origin?.city || 'Origin TBD',
    destIata: dest?.iata || 'TBD',
    destCity: dest?.city || 'Destination TBD',
    departureTime,
    arrivalTime,
    durationMinutes,
    seat: input.seat?.trim().toUpperCase() || undefined,
    cabinClass: input.cabinClass?.trim() || undefined,
    terminal: input.terminal?.trim() || undefined,
    gate: input.gate?.trim().toUpperCase() || undefined,
    aircraft: input.aircraft?.trim() || undefined,
    status,
    distanceMiles,
    milesEarned,
    loyaltyProgram,
    frequentFlyerNumber: input.frequentFlyerNumber?.trim() || undefined,
    enrichedOnline: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a matching return leg by swapping origin & destination of an outbound flight.
 */
export function buildReturnFlight(
  outbound: Flight,
  returnDate: string,
  returnFlightNumber?: string
): Flight {
  const parsedReturn = parseFlightNumberInput(returnFlightNumber);
  const dateStr =
    returnDate && /^\d{4}-\d{2}-\d{2}$/.test(returnDate.trim())
      ? returnDate.trim()
      : outbound.departureTime.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return {
    ...outbound,
    id: generateId('flt'),
    airlineCode: parsedReturn?.airlineCode || outbound.airlineCode,
    airlineName: parsedReturn?.airlineName || outbound.airlineName,
    flightNumber:
      parsedReturn?.flightNumber ||
      returnFlightNumber?.trim().toUpperCase() ||
      outbound.flightNumber,
    originIata: outbound.destIata,
    originCity: outbound.destCity,
    destIata: outbound.originIata,
    destCity: outbound.originCity,
    departureTime: `${dateStr}T00:00:00`,
    arrivalTime: `${dateStr}T00:00:00`,
    seat: undefined,
    gate: undefined,
    status: dateStr < today ? 'completed' : 'scheduled',
    createdAt: new Date().toISOString(),
  };
}
