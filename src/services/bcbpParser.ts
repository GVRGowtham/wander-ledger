import {
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  lookupAirline,
  lookupAirport,
} from '../db/airportsData';
import { ParsedBoardingPass } from '../types/models';

const CABIN_MAP: Record<string, string> = {
  F: 'First',
  A: 'First',
  J: 'Business',
  C: 'Business',
  D: 'Business',
  I: 'Business',
  W: 'Premium Economy',
  Y: 'Economy',
  B: 'Economy',
  M: 'Economy',
  H: 'Economy',
  K: 'Economy',
  L: 'Economy',
  Q: 'Economy',
  V: 'Economy',
  S: 'Economy',
  N: 'Economy',
  O: 'Economy',
  G: 'Economy',
  E: 'Economy',
};

/**
 * Converts an IATA 3-digit Julian day-of-year (001..366) to a YYYY-MM-DD calendar date.
 * Chooses the nearest plausible year around `referenceDate`.
 */
export function julianDayToIsoDate(
  julianDay: number,
  referenceDate: Date = new Date()
): string {
  const safeDay = Math.max(1, Math.min(366, julianDay));
  const year = referenceDate.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, 0, safeDay));
  const diffDays =
    (candidate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);

  // If the Julian date is more than 200 days in the past, it likely belongs to next year
  // (e.g. scanning a Jan boarding pass in December).
  const adjustedYear =
    diffDays < -200 ? year + 1 : diffDays > 250 ? year - 1 : year;
  const finalDate = new Date(Date.UTC(adjustedYear, 0, safeDay));
  return finalDate.toISOString().slice(0, 10);
}

/**
 * Parses a standard IATA Resolution 792 Bar Coded Boarding Pass (BCBP) string
 * extracted from PDF417, Aztec, or QR codes completely offline.
 *
 * Mandatory 60-char layout:
 * [0]     Format code ('M')
 * [1]     Number of legs ('1'..'9')
 * [2..21] Passenger Name (20 chars, LAST/FIRST)
 * [22]    Electronic Ticket Indicator ('E' or ' ')
 * [23..29] PNR / Operating Carrier PNR Code (7 chars)
 * [30..32] Origin Airport IATA (3 chars)
 * [33..35] Destination Airport IATA (3 chars)
 * [36..38] Operating Carrier Designator (3 chars, e.g. 'NH ' or '6E ')
 * [39..43] Flight Number (5 chars, e.g. '0105 ')
 * [44..46] Date of Flight in Julian Days (3 chars, e.g. '287')
 * [47]     Compartment/Cabin Code (1 char, e.g. 'Y', 'J', 'F')
 * [48..51] Seat Number (4 chars, e.g. '024A')
 * [52..56] Check-in Sequence Number (5 chars)
 * [57]     Passenger Status (1 char)
 * [58..59] Field size of variable conditional data (2 hex chars)
 */
export function parseIataBcbp(
  rawInput: string,
  referenceDate: Date = new Date()
): ParsedBoardingPass | null {
  if (!rawInput) return null;
  const raw = rawInput.replace(/\r?\n/g, '');
  if (raw.length < 58 || raw[0] !== 'M') {
    return null;
  }

  const legCount = parseInt(raw[1], 10);
  if (Number.isNaN(legCount) || legCount < 1 || legCount > 9) {
    return null;
  }

  const rawName = raw.slice(2, 22).trim();
  const passengerName = formatPassengerName(rawName);
  const pnr = raw.slice(23, 30).trim();
  const originIata = raw.slice(30, 33).trim().toUpperCase();
  const destIata = raw.slice(33, 36).trim().toUpperCase();
  const airlineCode = raw.slice(36, 39).trim().toUpperCase();
  const rawFlightNum = raw.slice(39, 44).trim().replace(/^0+/, '') || '0';
  const julianStr = raw.slice(44, 47).trim();
  const cabinCode = raw.slice(47, 48).trim().toUpperCase();
  const rawSeat = raw.slice(48, 52).trim().replace(/^0+/, '');

  if (!/^[A-Z]{3}$/.test(originIata) || !/^[A-Z]{3}$/.test(destIata)) {
    return null;
  }

  const julianNum = parseInt(julianStr, 10);
  const flightDate = Number.isNaN(julianNum)
    ? referenceDate.toISOString().slice(0, 10)
    : julianDayToIsoDate(julianNum, referenceDate);

  // Extract optional Frequent Flyer info from conditional tail (best-effort)
  const tail = raw.slice(60);
  let frequentFlyerAirline: string | undefined;
  let frequentFlyerNumber: string | undefined;

  // Common pattern near end of BCBP conditional data: 2-3 char carrier + 7-12 digit FF number
  const ffMatch = tail.match(/([A-Z0-9]{2})\s+([0-9]{6,12})\s*$/);
  if (ffMatch) {
    frequentFlyerAirline = ffMatch[1].trim();
    frequentFlyerNumber = ffMatch[2].trim();
  }

  const airlineInfo = lookupAirline(airlineCode);
  const originAp = lookupAirport(originIata);
  const destAp = lookupAirport(destIata);

  const distanceMiles =
    originAp && destAp
      ? calculateDistanceMiles(originAp.lat, originAp.lng, destAp.lat, destAp.lng)
      : 1200;

  const estimatedDurationMin = estimateFlightDurationMinutes(distanceMiles);

  return {
    kind: 'boarding_pass',
    passengerName,
    pnr: pnr || 'CONFIRMED',
    originIata,
    destIata,
    airlineCode,
    airlineName: airlineInfo.name,
    flightNumber: `${airlineCode} ${rawFlightNum}`,
    flightDate,
    cabinClass: CABIN_MAP[cabinCode] ?? 'Economy',
    seat: rawSeat || 'TBD',
    frequentFlyerAirline,
    frequentFlyerNumber,
    distanceMiles,
    estimatedDurationMin,
    loyaltyProgram: airlineInfo.loyaltyProgram,
    rawBarcode: raw,
  };
}

function formatPassengerName(raw: string): string {
  if (!raw) return 'Traveler';
  if (raw.includes('/')) {
    const [last, first] = raw.split('/').map((s) => s.trim());
    const cap = (w: string) =>
      w
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    return `${cap(first || '')} ${cap(last || '')}`.trim();
  }
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sample realistic IATA BCBP strings so users can test the scanner pipeline on-device
 * even when they don't have a paper boarding pass handy.
 */
export const SAMPLE_BCBP_STRINGS = {
  tokyo:
    'M1JORDAN/ALEX         E7X9K2P LAXHNDNH 0105 287Y024A0042 147>5180WW6287BNH 000000000000029NH 882194012',
  lisbon:
    'M1JORDAN/ALEX         EK4M9Q1 JFKLISTP 0208 124J004F0018 147>5180WW6124BTP 000000000000029TP 551092341',
  goa:
    'M1JORDAN/ALEX         ER8V2N4 BLRGOI6E 0412 012Y014C0088 147>5180WW6012B6E 0000000000000296E 903441208',
};
