import { TripVibe } from '../types/models';
import rawAirports from './airportsCatalog.json';
import rawCountries from './countriesCatalog.json';
import rawAirlines from './airlinesCatalog.json';

export interface AirportInfo {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  lat: number;
  lng: number;
  vibe: TripVibe;
  /** 2 = major international hub, 1 = medium commercial, 0 = small scheduled */
  sizeRank: number;
}

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  lat: number;
  lng: number;
}

export interface AirlineInfo {
  code: string;
  name: string;
  loyaltyProgram: string;
}

type RawAirportTuple = [
  iata: string,
  name: string,
  city: string,
  countryCode: string,
  lat: number,
  lng: number,
  sizeRank: number,
];

/**
 * Converts a 2-letter ISO 3166-1 alpha-2 country code (e.g. "PL") into its flag emoji ("🇵🇱").
 */
export function isoCodeToFlag(countryCode: string): string {
  const cc = (countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🌍';
  return String.fromCodePoint(
    0x1f1e6 + (cc.charCodeAt(0) - 65),
    0x1f1e6 + (cc.charCodeAt(1) - 65)
  );
}

/**
 * Normalizes diacritics and special Latin letters (e.g. "Kraków" -> "krakow",
 * "Gdańsk" -> "gdansk", "İstanbul" -> "istanbul", "Zürich" -> "zurich") for
 * forgiving offline airport, city, and country search.
 */
export function normalizeSearchText(raw: string): string {
  return (raw || '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ø/g, 'o')
    .replace(/Ø/g, 'O')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const COUNTRY_VIBE_MAP: Record<string, TripVibe> = {
  JP: 'japan',
  CH: 'alpine',
  AT: 'alpine',
  IS: 'alpine',
  NO: 'alpine',
  NP: 'alpine',
  BT: 'alpine',
  NZ: 'alpine',
  PE: 'alpine',
  CL: 'alpine',
  CA: 'alpine',
  IT: 'coastal',
  PT: 'coastal',
  ES: 'coastal',
  GR: 'coastal',
  HR: 'coastal',
  CY: 'coastal',
  MT: 'coastal',
  IE: 'coastal',
  AU: 'coastal',
  ZA: 'coastal',
  AE: 'desert',
  QA: 'desert',
  SA: 'desert',
  OM: 'desert',
  BH: 'desert',
  KW: 'desert',
  JO: 'desert',
  EG: 'desert',
  MA: 'desert',
  TN: 'desert',
  TR: 'desert',
  NA: 'desert',
  TH: 'tropical',
  ID: 'tropical',
  MY: 'tropical',
  SG: 'tropical',
  VN: 'tropical',
  PH: 'tropical',
  MV: 'tropical',
  LK: 'tropical',
  SC: 'tropical',
  MU: 'tropical',
  FJ: 'tropical',
  BR: 'tropical',
  CR: 'tropical',
  MX: 'tropical',
  JM: 'tropical',
  DO: 'tropical',
  BS: 'tropical',
  CU: 'tropical',
  PR: 'tropical',
};

const AIRPORT_VIBE_OVERRIDES: Record<string, TripVibe> = {
  CTS: 'alpine',
  DEL: 'desert',
  HYD: 'desert',
  JAI: 'desert',
  BOM: 'coastal',
  MAA: 'coastal',
  GOI: 'tropical',
  GOX: 'tropical',
  COK: 'tropical',
  EDI: 'alpine',
  NCE: 'coastal',
  MUC: 'alpine',
  MXP: 'alpine',
  LAX: 'coastal',
  SFO: 'coastal',
  SEA: 'alpine',
  DEN: 'alpine',
  MIA: 'tropical',
  DFW: 'desert',
  BOS: 'coastal',
  HNL: 'tropical',
  LAS: 'desert',
  YYZ: 'city',
  MEX: 'desert',
};

function inferAirportVibe(iata: string, countryCode: string): TripVibe {
  return AIRPORT_VIBE_OVERRIDES[iata] ?? COUNTRY_VIBE_MAP[countryCode] ?? 'city';
}

// Hydrate all 249 ISO countries & territories
export const COUNTRIES: Record<string, CountryInfo> = {};
for (const [code, tuple] of Object.entries(
  rawCountries as unknown as Record<string, [string, number, number]>
)) {
  COUNTRIES[code] = {
    code,
    name: tuple[0],
    flag: isoCodeToFlag(code),
    lat: tuple[1],
    lng: tuple[2],
  };
}

// Hydrate all 5,333 scheduled commercial IATA airports worldwide
export const AIRPORTS: Record<string, AirportInfo> = {};
const AIRPORTS_LIST: AirportInfo[] = [];

for (const tuple of rawAirports as unknown as RawAirportTuple[]) {
  const [iata, name, city, countryCode, lat, lng, sizeRank] = tuple;
  const countryInfo = COUNTRIES[countryCode];
  const ap: AirportInfo = {
    iata,
    name,
    city,
    country: countryInfo?.name ?? countryCode,
    countryCode,
    flag: countryInfo?.flag ?? isoCodeToFlag(countryCode),
    lat,
    lng,
    vibe: inferAirportVibe(iata, countryCode),
    sizeRank,
  };
  AIRPORTS[iata] = ap;
  AIRPORTS_LIST.push(ap);
}

// Pre-sorted airports list (major hubs first, then medium, then small) for instant ranked search
export const AIRPORTS_BY_RANK: ReadonlyArray<AirportInfo> = [...AIRPORTS_LIST].sort(
  (a, b) => b.sizeRank - a.sizeRank || a.iata.localeCompare(b.iata)
);

// Fast O(1) normalized city -> flagship hub airport index (large hubs win ties over tiny airfields)
const CITY_INDEX = new Map<string, AirportInfo>();
// Well-known primary hubs for multi-airport metros
const METRO_PRIMARY_AIRPORTS: Record<string, string> = {
  london: 'LHR',
  paris: 'CDG',
  rome: 'FCO',
  milan: 'MXP',
  tokyo: 'HND',
  osaka: 'KIX',
  seoul: 'ICN',
  'new york': 'JFK',
  chicago: 'ORD',
  washington: 'IAD',
  houston: 'IAH',
  dallas: 'DFW',
  bangkok: 'BKK',
  istanbul: 'IST',
  warsaw: 'WAW',
  moscow: 'SVO',
  beijing: 'PEK',
  shanghai: 'PVG',
  buenosaires: 'EZE',
  'buenos aires': 'EZE',
  'sao paulo': 'GRU',
  'rio de janeiro': 'GIG',
  dubai: 'DXB',
  goa: 'GOI',
  brussels: 'BRU',
  stockholm: 'ARN',
  oslo: 'OSL',
  belfast: 'BFS',
  glasgow: 'GLA',
  bucharest: 'OTP',
  taipei: 'TPE',
  jakarta: 'CGK',
};

for (const [cityKey, iata] of Object.entries(METRO_PRIMARY_AIRPORTS)) {
  if (AIRPORTS[iata]) {
    CITY_INDEX.set(cityKey, AIRPORTS[iata]);
  }
}

for (const ap of AIRPORTS_BY_RANK) {
  const parts = ap.city.split('/').map((p) => normalizeSearchText(p));
  for (const part of parts) {
    if (part.length >= 2 && !CITY_INDEX.has(part)) {
      CITY_INDEX.set(part, ap);
    }
  }
}

// Fast O(1) normalized country name & common alias -> CountryInfo index
const COUNTRY_INDEX = new Map<string, CountryInfo>();
for (const c of Object.values(COUNTRIES)) {
  COUNTRY_INDEX.set(normalizeSearchText(c.name), c);
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US',
  'u.s.a.': 'US',
  'u.s.': 'US',
  'united states of america': 'US',
  america: 'US',
  uk: 'GB',
  'u.k.': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  britain: 'GB',
  'great britain': 'GB',
  'united arab emirates': 'AE',
  emirates: 'AE',
  'czech republic': 'CZ',
  holland: 'NL',
  'the netherlands': 'NL',
  turkiye: 'TR',
  'republic of korea': 'KR',
  korea: 'KR',
  'viet nam': 'VN',
  'russian federation': 'RU',
  burma: 'MM',
  'ivory coast': 'CI',
  swaziland: 'SZ',
  'cabo verde': 'CV',
  'bosnia': 'BA',
  'trinidad': 'TT',
  'antigua': 'AG',
  'st lucia': 'LC',
  'saint lucia': 'LC',
  'st kitts': 'KN',
  'hong kong sar': 'HK',
  macao: 'MO',
  'chinese taipei': 'TW',
};

for (const [alias, cc] of Object.entries(COUNTRY_ALIASES)) {
  if (COUNTRIES[cc]) {
    COUNTRY_INDEX.set(alias, COUNTRIES[cc]);
  }
}

// Hydrate all 988 active commercial IATA airlines worldwide
export const AIRLINES: Record<string, AirlineInfo> = {};
for (const [code, tuple] of Object.entries(
  rawAirlines as unknown as Record<string, [string, string]>
)) {
  AIRLINES[code] = {
    code,
    name: tuple[0],
    loyaltyProgram: tuple[1] || tuple[0],
  };
}

/**
 * Curated major commercial airline 2-letter codes safe for bare (unlabelled) OCR flight-number
 * scanning without false-matching common 2-letter English prose words (like "IN 20", "TO 10", "AT 30").
 * Explicit "Flight XX 123" labels and manual entry still resolve against ALL 988 airlines in `AIRLINES`.
 */
export const MAJOR_OCR_AIRLINE_CODES: ReadonlyArray<string> = [
  'UA', 'DL', 'AA', 'AS', 'B6', 'WN', 'NK', 'F9', 'HA', 'MX', 'XP', 'AC', 'WS', 'PD', 'TS', 'AM', 'Y4', 'VB',
  'BA', 'VS', 'U2', 'FR', 'RK', 'EI', 'LH', 'EW', '4Y', 'DE', 'AF', 'HV', 'KL', 'LX', 'WK', 'OS', 'SN',
  'LO', 'W6', 'W4', 'W9', 'AZ', 'IB', 'I2', 'VY', 'UX', 'TP', 'SK', 'DY', 'D8', 'AY', 'FI', 'OG', 'N0',
  'A3', 'OA', 'OU', 'JU', 'RO', 'BT', 'LG', 'KM', 'TK', 'PC', 'XQ',
  'EK', 'EY', 'FZ', 'G9', 'QR', 'SV', 'XY', 'WY', 'GF', 'KU', 'J9', 'RJ', 'LY',
  '6E', 'AI', 'IX', 'QP', 'SG', 'UK', '9I', 'UL', 'PK', 'BG', 'RA', 'KB',
  'NH', 'JL', 'MM', 'ZG', 'KE', 'OZ', '7C', 'LJ', 'TW', 'CX', 'HX', 'UO', 'BR', 'CI', 'JX',
  'CA', 'MU', 'CZ', 'HU', 'ZH', 'MF', 'SQ', 'TR', 'TG', 'PG', 'FD', 'AK', 'D7', 'MH', 'OD',
  'VN', 'VJ', 'QH', 'GA', 'JT', 'QG', 'PR', '5J',
  'QF', 'JQ', 'VA', 'NZ', 'FJ',
  'LA', 'JJ', 'G3', 'AD', 'AV', 'CM', 'AR', 'H2', 'BW',
  'ET', 'KQ', 'SA', '4Z', 'MS', 'TU', 'AH', 'WB', 'MK', 'HM',
];

export function lookupAirport(iata: string): AirportInfo | undefined {
  return AIRPORTS[iata.trim().toUpperCase()];
}

export function lookupAirportByCity(cityQuery: string): AirportInfo | undefined {
  const norm = normalizeSearchText(cityQuery);
  if (!norm) return undefined;
  return CITY_INDEX.get(norm);
}

export function lookupCountry(countryQuery: string): CountryInfo | undefined {
  const norm = normalizeSearchText(countryQuery);
  if (!norm) return undefined;
  if (norm.length === 2) {
    const byCode = COUNTRIES[norm.toUpperCase()];
    if (byCode) return byCode;
  }
  return COUNTRY_INDEX.get(norm);
}

/**
 * Fast token-based lookup of a known airport city or country inside free-form text
 * (e.g. "Warsaw Centralna", "Zurich HB", "Hotel in Kraków, Poland") in O(words) time.
 */
export function findCityAirportInText(rawText: string, minCityLen = 3): AirportInfo | null {
  const norm = normalizeSearchText(rawText);
  if (!norm || norm.length < minCityLen) return null;

  const exact = CITY_INDEX.get(norm);
  if (exact) return exact;

  // Tokenize words and test 3-word, 2-word, then 1-word n-grams (handles "New York", "Abu Dhabi", "Ho Chi Minh City", "Warsaw")
  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
  for (let n = Math.min(4, tokens.length); n >= 1; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const phrase = tokens.slice(i, i + n).join(' ');
      if (phrase.length < minCityLen) continue;
      const hit = CITY_INDEX.get(phrase);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Finds all matching airport cities in free-form OCR text in order of appearance
 * using fast O(words) n-gram lookups instead of 5,000+ regex passes.
 */
export function findCityAirportsInOrder(
  rawText: string,
  minCityLen = 4
): Array<{ iata: string; index: number }> {
  const norm = normalizeSearchText(rawText);
  if (!norm) return [];

  // Track word start offsets
  const words: Array<{ word: string; index: number }> = [];
  const rx = /[a-z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(norm)) !== null) {
    words.push({ word: m[0], index: m.index });
  }

  const hits: Array<{ iata: string; index: number }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(3, words.length - i); n >= 1; n--) {
      const phrase = words
        .slice(i, i + n)
        .map((w) => w.word)
        .join(' ');
      if (phrase.length < minCityLen) continue;
      const ap = CITY_INDEX.get(phrase);
      if (ap && !seen.has(ap.iata)) {
        seen.add(ap.iata);
        hits.push({ iata: ap.iata, index: words[i].index });
        break;
      }
    }
  }
  return hits;
}

/**
 * Fast O(words) lookup of any of the 249 ISO countries (or common aliases) inside free-form text.
 */
export function findCountryInText(rawText: string, minLen = 3): CountryInfo | null {
  const norm = normalizeSearchText(rawText);
  if (!norm || norm.length < minLen) return null;

  const exact = COUNTRY_INDEX.get(norm);
  if (exact) return exact;

  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
  for (let n = Math.min(4, tokens.length); n >= 1; n--) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const phrase = tokens.slice(i, i + n).join(' ');
      if (phrase.length < minLen) continue;
      const hit = COUNTRY_INDEX.get(phrase);
      if (hit) return hit;
    }
  }
  return null;
}

export function lookupAirline(code: string): AirlineInfo {
  const clean = code.trim().toUpperCase();
  return (
    AIRLINES[clean] ?? {
      code: clean,
      name: `${clean} Airlines`,
      loyaltyProgram: `${clean} Frequent Flyer`,
    }
  );
}

/**
 * Great-circle distance between two coordinates using the Haversine formula (in statute miles).
 */
export function calculateDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function estimateFlightDurationMinutes(distanceMiles: number): number {
  if (distanceMiles <= 0) return 90;
  // Average jet cruise ~500 mph + 35 min taxi/climb/descent overhead
  return Math.max(45, Math.round((distanceMiles / 500) * 60 + 35));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function inferDestinationVibe(destinationText: string): {
  vibe: TripVibe;
  flag: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
} {
  const trimmed = (destinationText || '').trim();
  const q = normalizeSearchText(trimmed);

  // 1. Exact uppercase 3-letter IATA code (avoids mixed-case city names like "Goa" colliding with Genoa "GOA")
  if (/^[A-Z]{3}$/.test(trimmed)) {
    const byCode = lookupAirport(trimmed);
    if (byCode) {
      return {
        vibe: byCode.vibe,
        flag: byCode.flag,
        country: byCode.country,
        countryCode: byCode.countryCode,
        lat: byCode.lat,
        lng: byCode.lng,
      };
    }
  }

  // 2. Match any known airport city
  const cityHit = findCityAirportInText(trimmed, 3);
  if (cityHit) {
    return {
      vibe: cityHit.vibe,
      flag: cityHit.flag,
      country: cityHit.country,
      countryCode: cityHit.countryCode,
      lat: cityHit.lat,
      lng: cityHit.lng,
    };
  }

  // 3. Match any of the 249 countries
  const countryHit = findCountryInText(trimmed, 3);
  if (countryHit) {
    return {
      vibe: COUNTRY_VIBE_MAP[countryHit.code] ?? 'city',
      flag: countryHit.flag,
      country: countryHit.name,
      countryCode: countryHit.code,
      lat: countryHit.lat,
      lng: countryHit.lng,
    };
  }

  if (/(kyoto|tokyo|osaka|japan|fuji|sapporo)/.test(q)) {
    return { vibe: 'japan', flag: '🇯🇵', country: 'Japan', countryCode: 'JP', lat: 35.6762, lng: 139.6503 };
  }
  if (/(swiss|alps|zurich|nepal|banff|aspen|iceland|mountain|snow|ski)/.test(q)) {
    return { vibe: 'alpine', flag: '🇨🇭', country: 'Switzerland', countryCode: 'CH', lat: 46.8182, lng: 8.2275 };
  }
  if (/(bali|goa|maldives|hawaii|phuket|beach|island|cancun|tropical)/.test(q)) {
    return { vibe: 'tropical', flag: '🏝️', country: 'Tropical Escape', countryCode: 'ID', lat: -8.4095, lng: 115.1889 };
  }
  if (/(dubai|jaipur|morocco|egypt|desert|doha|india|jordan)/.test(q)) {
    return { vibe: 'desert', flag: '🐪', country: 'Desert Journey', countryCode: 'AE', lat: 25.2048, lng: 55.2708 };
  }
  if (/(italy|rome|amalfi|lisbon|portugal|greece|santorini|spain|barcelona|coast)/.test(q)) {
    return { vibe: 'coastal', flag: '🇮🇹', country: 'Italy', countryCode: 'IT', lat: 41.9028, lng: 12.4964 };
  }
  return { vibe: 'city', flag: '🌍', country: destinationText || 'World Adventure', countryCode: 'US', lat: 40.7128, lng: -74.006 };
}
