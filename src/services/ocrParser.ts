import {
  AIRLINES,
  AIRPORTS,
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  lookupAirline,
  lookupAirport,
} from '../db/airportsData';
import {
  ExpenseCategory,
  ParsedBoardingPass,
  ParsedHotelConfirmation,
  ParsedReceipt,
  ScanResult,
} from '../types/models';

const CURRENCY_PATTERNS: Array<{ regex: RegExp; code: string }> = [
  { regex: /¥|JPY/i, code: 'JPY' },
  { regex: /€|EUR/i, code: 'EUR' },
  { regex: /£|GBP/i, code: 'GBP' },
  { regex: /₹|\bINR\b|\bRS\.?\s*\d/i, code: 'INR' },
  { regex: /\bCHF\b|\bSFr\.?/i, code: 'CHF' },
  { regex: /₩|\bKRW\b/i, code: 'KRW' },
  { regex: /฿|\bTHB\b/i, code: 'THB' },
  { regex: /S\$|\bSGD\b/i, code: 'SGD' },
  { regex: /A\$|\bAUD\b/i, code: 'AUD' },
  { regex: /C\$|\bCAD\b/i, code: 'CAD' },
  { regex: /NZ\$|\bNZD\b/i, code: 'NZD' },
  { regex: /HK\$|\bHKD\b/i, code: 'HKD' },
  { regex: /\bAED\b/i, code: 'AED' },
  { regex: /\bMYR\b|\bRM\s*\d/i, code: 'MYR' },
  { regex: /\bMXN\b/i, code: 'MXN' },
  { regex: /\$|\bUSD\b/i, code: 'USD' },
];

export function detectCurrency(text: string, fallback = 'USD'): string {
  for (const item of CURRENCY_PATTERNS) {
    if (item.regex.test(text)) {
      return item.code;
    }
  }
  return fallback;
}

/**
 * Handles US/UK ('1,450.50'), Swiss ("1'450.50"), and European ('1.450,50' or '18,50') number formats.
 */
function parseNumber(numStr: string): number {
  let cleaned = numStr.replace(/['’\s]/g, '').trim();
  // European format: e.g. 1.450,50 or 18,50
  if (/,\d{2}$/.test(cleaned) && (!cleaned.includes('.') || cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.'))) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const CURRENCY_TOKEN =
  '(?:INR|USD|EUR|GBP|JPY|CHF|SFr\\.?|SGD|AUD|CAD|NZD|HKD|AED|THB|KRW|MYR|MXN|RS\\.?)';
const AMOUNT_TOKEN = "([\\d,.'’]+(?:[.,]\\d{1,2})?)";

export function extractTotalAmount(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Prioritize lines mentioning TOTAL / AMOUNT PAID / GRAND TOTAL / BALANCE DUE / FARE / TOTAL CHARGES / GESAMT
  const totalRegex = new RegExp(
    `(?:grand\\s*total|total\\s*paid|total\\s*price|total\\s*charges|total\\s*stay|total\\s*fare|amount\\s*paid|amount\\s*charged|total\\s*amount|net\\s*payable|balance\\s*due|total\\s*incl\\.?[^\\d]*|total\\s*ttc|gesamt(?:betrag)?|total|sum|合計)[^\\d¥$€£₹₩฿]*[¥$€£₹₩฿]?\\s*${CURRENCY_TOKEN}?\\s*${AMOUNT_TOKEN}`,
    'i'
  );

  // Check from bottom up (grand total is typically near the bottom of receipts & folios)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(totalRegex);
    if (m && m[1]) {
      const val = parseNumber(m[1]);
      if (val > 0) return val;
    }
    // Two-column PDF / Booking.com screenshot layout: label on line i, amount on line i+1
    if (
      i + 1 < lines.length &&
      /^(?:grand\s*total|total\s*paid|total\s*price|total\s*charges|amount\s*paid|total\s*amount|balance\s*due|total\s*\(?.*\)?|gesamt)/i.test(
        lines[i]
      )
    ) {
      const nextValMatch = lines[i + 1].match(
        new RegExp(`(?:[¥$€£₹₩฿]|${CURRENCY_TOKEN})?\\s*${AMOUNT_TOKEN}`, 'i')
      );
      if (nextValMatch && nextValMatch[1]) {
        const val = parseNumber(nextValMatch[1]);
        if (val > 0) return val;
      }
    }
  }

  // 2. Fallback: largest currency-prefixed or currency-suffixed number in the document
  const moneyRegex = new RegExp(
    `(?:(?:[¥$€£₹₩฿]|${CURRENCY_TOKEN})\\s*${AMOUNT_TOKEN}|${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN})`,
    'gi'
  );
  let maxVal = 0;
  for (const m of text.matchAll(moneyRegex)) {
    const rawNum = m[1] || m[2];
    if (!rawNum) continue;
    const val = parseNumber(rawNum);
    if (val > maxVal) maxVal = val;
  }
  return maxVal;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export function parseDateFromString(text: string): string | null {
  // YYYY-MM-DD or YYYY/MM/DD
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  // Oct 17, 2026 or Oct 17 2026
  const namedFirst = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i
  );
  if (namedFirst) {
    const mon = MONTH_MAP[namedFirst[1].slice(0, 3).toLowerCase()];
    return `${namedFirst[3]}-${mon}-${namedFirst[2].padStart(2, '0')}`;
  }

  // 17 Oct 2026 or 17 Oct, 2026
  const dayFirst = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/i
  );
  if (dayFirst) {
    const mon = MONTH_MAP[dayFirst[2].slice(0, 3).toLowerCase()];
    return `${dayFirst[3]}-${mon}-${dayFirst[1].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY (common in India/Europe confirmations)
  const dmy = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (dmy) {
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    const day = b > 12 ? b : a;
    const month = b > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${dmy[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 17 Oct '26 or 17 Oct 26 (common on MakeMyTrip / Goibibo / Ixigo cards)
  const dayFirstShortYr = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+['’]?(\d{2})\b/i
  );
  if (dayFirstShortYr) {
    const mon = MONTH_MAP[dayFirstShortYr[2].slice(0, 3).toLowerCase()];
    return `20${dayFirstShortYr[3]}-${mon}-${dayFirstShortYr[1].padStart(2, '0')}`;
  }

  return null;
}

/**
 * Extracts compact date ranges like 'Nov 1 – 5, 2025' or '1 - 5 Nov 2025' from booking emails.
 */
export function parseDateRangeFromString(text: string): { start: string; end: string } | null {
  // e.g. Nov 1 - 5, 2025 or Nov 1 - Nov 5, 2025
  const m1 = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\s*(?:[-–—]|to)\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(\d{1,2}),?\s+(20\d{2})\b/i
  );
  if (m1) {
    const mon1 = MONTH_MAP[m1[1].slice(0, 3).toLowerCase()];
    const mon2 = m1[3] ? MONTH_MAP[m1[3].slice(0, 3).toLowerCase()] : mon1;
    return {
      start: `${m1[5]}-${mon1}-${m1[2].padStart(2, '0')}`,
      end: `${m1[5]}-${mon2}-${m1[4].padStart(2, '0')}`,
    };
  }

  // e.g. 1 - 5 Nov 2025
  const m2 = text.match(
    /\b(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/i
  );
  if (m2) {
    const mon = MONTH_MAP[m2[3].slice(0, 3).toLowerCase()];
    return {
      start: `${m2[4]}-${mon}-${m2[1].padStart(2, '0')}`,
      end: `${m2[4]}-${mon}-${m2[2].padStart(2, '0')}`,
    };
  }

  return null;
}

/**
 * Merges OCR text from multiple screenshots, PDF pages, or top/bottom halves of a long receipt.
 */
export function mergeOcrTexts(pages: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const page of pages) {
    for (const rawLine of page.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      // Avoid duplicate overlap lines when snapping top + bottom half of the same paper receipt
      const key = line.toLowerCase();
      if (line.length > 10 && seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out.join('\n');
}

export function inferExpenseCategory(text: string): ExpenseCategory {
  const q = text.toLowerCase();
  if (/(hotel|resort|inn|suites|ryokan|airbnb|check-in|nights|homestay|villa)/.test(q)) return 'lodging';
  if (/(ramen|cafe|coffee|matcha|restaurant|bistro|bar|pizza|sushi|burger|bakery|dining|kitchen|grill|tavern|tea|gyoza)/.test(q)) {
    return 'dining';
  }
  if (/(shinkansen|train|metro|subway|uber|taxi|lyft|rail|transit|bus|jr\s|suica|pass|ferry)/.test(q)) {
    return 'transit';
  }
  if (/(airline|flight|airways|boarding|airport|pnr|e-?ticket)/.test(q)) return 'flights';
  if (/(museum|temple|shrine|ticket|tour|cruise|park|aquarium|entry|admission)/.test(q)) {
    return 'activities';
  }
  if (/(shop|store|mart|souvenir|boutique|uniqlo|mall|duty\s*free)/.test(q)) {
    return 'shopping';
  }
  return 'dining';
}

export function isHotelConfirmationText(text: string): boolean {
  const q = text.toLowerCase();
  const hits = [
    /check[\s-]?in/,
    /check[\s-]?out/,
    /\b\d+\s*nights?\b/,
    /reservation|booking\s*confirmed|booking\s*id|hotel\s*voucher|confirmation\s*#?|itinerary/,
    /hotel|resort|ryokan|suites|airbnb|hostel|villa|homestay|guesthouse|chalet|lodge|marriott|hilton|hyatt|taj|oberoi|radisson|oyo|lemon\s*tree|ginger|itc|vivanta|trident|treebo|fabhotel|zostel|agoda|makemytrip|goibibo|ixigo|cleartrip|booking\.com|expedia/,
  ].filter((r) => r.test(q)).length;
  return hits >= 2;
}

interface ExtractedRoute {
  originIata: string;
  destIata: string;
}

function extractAirportRouteFromText(text: string): ExtractedRoute | null {
  // 1. Explicit arrow / dash / "to" between two 3-letter IATA codes (e.g. BLR -> GOI, LAX - HND, SFO to NRT)
  const routePattern = /\b([A-Z]{3})\s*(?:→|->|—|–|-|\bto\b)\s*([A-Z]{3})\b/g;
  for (const m of text.matchAll(routePattern)) {
    const o = lookupAirport(m[1]);
    const d = lookupAirport(m[2]);
    if (o && d && o.iata !== d.iata) {
      return { originIata: o.iata, destIata: d.iata };
    }
  }

  // 2. Parenthesized or standalone known IATA airport codes in order of appearance (e.g. "Bengaluru (BLR) ... Goa (GOI)")
  const foundCodes: string[] = [];
  const tokenRegex = /\(([A-Z]{3})\)|\b([A-Z]{3})\b/g;
  // Common 3-letter non-airport English/travel words to skip when scanning bare tokens
  const STOP_WORDS = new Set([
    'THE', 'AND', 'FOR', 'YOU', 'ARE', 'ALL', 'AIR', 'PNR', 'TAX', 'FEE', 'USD',
    'INR', 'EUR', 'GBP', 'JPY', 'AED', 'AUD', 'CAD', 'SGD', 'CHF', 'KRW', 'THB',
    'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'JAN', 'FEB', 'MAR', 'APR',
    'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'DEP', 'ARR', 'NON',
    'BAG', 'HRS', 'MIN', 'EST', 'IST', 'PST', 'UTC', 'GMT', 'YES', 'NOT', 'ONE',
    'TWO', 'DAY', 'PER', 'REF', 'WEB', 'APP', 'PDF', 'VIA', 'OUT', 'NEW', 'PAY',
  ]);

  for (const m of text.matchAll(tokenRegex)) {
    const code = m[1] || m[2];
    if (!code || STOP_WORDS.has(code)) continue;
    if (AIRPORTS[code] && !foundCodes.includes(code)) {
      foundCodes.push(code);
      if (foundCodes.length >= 2) break;
    }
  }

  if (foundCodes.length >= 2) {
    return { originIata: foundCodes[0], destIata: foundCodes[1] };
  }
  return null;
}

function extractFlightNumberFromText(text: string): { airlineCode: string; flightNumber: string } | null {
  const knownCodes = Object.keys(AIRLINES);

  // 1. Look for known airline codes followed by 1–4 digits (e.g. "6E 412", "NH105", "AI-506", "UA 875")
  for (const code of knownCodes) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`\\b(${escaped})\\s*[-]?\\s*(\\d{2,4})\\b`, 'i');
    const m = text.match(rx);
    if (m) {
      return {
        airlineCode: code.toUpperCase(),
        flightNumber: `${code.toUpperCase()} ${m[2]}`,
      };
    }
  }

  // 2. Look after explicit "Flight" label (e.g. "Flight: SG 192" or "Flight No. UK 811")
  const explicit = text.match(/\bflight\s*(?:no\.?|number|#|:)?\s*([A-Z0-9]{2})\s*[-]?\s*(\d{1,4})\b/i);
  if (explicit) {
    const ac = explicit[1].toUpperCase();
    return { airlineCode: ac, flightNumber: `${ac} ${explicit[2]}` };
  }

  return null;
}

function extractAirlineByName(text: string): string | null {
  const lower = text.toLowerCase();
  for (const info of Object.values(AIRLINES)) {
    const primaryWord = info.name.split('(')[0].trim().toLowerCase();
    if (primaryWord.length >= 3 && lower.includes(primaryWord)) {
      return info.code;
    }
  }
  return null;
}

export function isFlightConfirmationText(text: string): boolean {
  const q = text.toLowerCase();
  const route = extractAirportRouteFromText(text);
  const flightNum = extractFlightNumberFromText(text);
  const airlineByName = extractAirlineByName(text);

  // Strong aviation signals
  const keywordHits = [
    /\b(?:flight|e-?ticket|boarding|airline|airways|departure|arrival|non-?stop|layover|terminal|gate|baggage|cabin)\b/,
    /\b(?:pnr|booking\s*ref(?:erence)?|record\s*locator|confirmation\s*(?:code|number|#))\b/,
    /\b(?:passenger|traveller|traveler|economy|business\s*class|first\s*class)\b/,
  ].filter((r) => r.test(q)).length;

  if (route && (flightNum || airlineByName || keywordHits >= 1)) return true;
  if (flightNum && keywordHits >= 1) return true;
  if (airlineByName && keywordHits >= 2) return true;
  return false;
}

function parseFlightConfirmationOcr(
  rawText: string,
  currency: string,
  totalAmount: number,
  imageUri?: string
): ParsedBoardingPass {
  const today = new Date().toISOString().slice(0, 10);
  const route = extractAirportRouteFromText(rawText);
  const flightNum = extractFlightNumberFromText(rawText);
  const namedAirlineCode = extractAirlineByName(rawText);

  const airlineCode = flightNum?.airlineCode ?? namedAirlineCode ?? 'FL';
  const airlineInfo = lookupAirline(airlineCode);
  const flightNumber = flightNum?.flightNumber ?? `${airlineCode} Flight`;

  const originIata = route?.originIata ?? 'TBD';
  const destIata = route?.destIata ?? 'TBD';
  const originAp = lookupAirport(originIata);
  const destAp = lookupAirport(destIata);

  const distanceMiles =
    originAp && destAp
      ? calculateDistanceMiles(originAp.lat, originAp.lng, destAp.lat, destAp.lng)
      : 0;
  const estimatedDurationMin =
    distanceMiles > 0 ? estimateFlightDurationMinutes(distanceMiles) : 120;

  // PNR / Booking Reference (5–8 alphanumeric chars)
  const pnrMatch = rawText.match(
    /(?:\bpnr\b|\bbooking\s*ref(?:erence)?\b|\brecord\s*locator\b|\bconfirmation\s*(?:code|no\.?|number|#)?\b|\bref(?:erence)?\s*(?:code|no\.?|#)\b)\s*(?:\([^)]*\))?[\s:#-]*([A-Z0-9]{5,8})\b/i
  );
  const pnr = pnrMatch ? pnrMatch[1].toUpperCase() : '';

  // Seat
  const seatMatch = rawText.match(/\bseat[\s:#-]*(\d{1,2}[A-K])\b/i);
  const seat = seatMatch ? seatMatch[1].toUpperCase() : '';

  // Cabin
  let cabinClass = 'Economy';
  if (/first\s*class/i.test(rawText)) cabinClass = 'First';
  else if (/business/i.test(rawText)) cabinClass = 'Business';
  else if (/premium\s*eco/i.test(rawText)) cabinClass = 'Premium Economy';

  // Passenger name (optional)
  const paxMatch = rawText.match(
    /(?:passenger|traveller|traveler|name)[\s:]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/i
  );
  const passengerName = paxMatch ? paxMatch[1].trim() : 'Traveler';

  // Prefer date on a line mentioning departure / flight / date, else first date in doc
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const depLine = lines.find((l) => /(?:depart|flight\s*date|travel\s*date|onward|outbound|date)/i.test(l)) ?? '';
  const flightDate = parseDateFromString(depLine) ?? parseDateFromString(rawText) ?? today;

  return {
    kind: 'boarding_pass',
    source: 'ocr',
    passengerName,
    pnr,
    originIata,
    destIata,
    airlineCode,
    airlineName: airlineInfo.name,
    flightNumber,
    flightDate,
    cabinClass,
    seat,
    distanceMiles,
    estimatedDurationMin,
    loyaltyProgram: airlineInfo.loyaltyProgram,
    rawBarcode: '',
    ticketAmount: totalAmount > 0 ? totalAmount : undefined,
    ticketCurrency: totalAmount > 0 ? currency : undefined,
    rawText,
    imageUri,
  };
}

export function parseDocumentOcrText(
  rawText: string,
  defaultCurrency = 'USD',
  imageUri?: string,
  forceKind?: 'flight' | 'hotel' | 'receipt'
): ScanResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const currency = detectCurrency(rawText, defaultCurrency);
  const totalAmount = extractTotalAmount(rawText);
  const today = new Date().toISOString().slice(0, 10);

  const isHotel =
    forceKind === 'hotel' ||
    (!forceKind && isHotelConfirmationText(rawText));

  const isFlight =
    forceKind === 'flight' ||
    (!forceKind && !isHotel && isFlightConfirmationText(rawText));

  if (isFlight) {
    return parseFlightConfirmationOcr(rawText, currency, totalAmount, imageUri);
  }

  if (isHotel) {
    // Support both single-line ("Check-in: Oct 17, 2026") and 2-line ("Check-in\nSat, Oct 17, 2026") Booking.com/Airbnb formats
    const findLabeledDate = (labelRx: RegExp): string | null => {
      for (let i = 0; i < lines.length; i++) {
        if (labelRx.test(lines[i])) {
          const sameLine = parseDateFromString(lines[i]);
          if (sameLine) return sameLine;
          if (i + 1 < lines.length) {
            const nextLine = parseDateFromString(lines[i + 1]);
            if (nextLine) return nextLine;
          }
          if (i + 2 < lines.length) {
            const next2 = parseDateFromString(lines[i + 2]);
            if (next2) return next2;
          }
        }
      }
      return null;
    };

    const dateRange = parseDateRangeFromString(rawText);
    const labeledIn = findLabeledDate(/check[\s-]?in|arrival\s*date/i);
    const labeledOut = findLabeledDate(/check[\s-]?out|departure\s*date/i);

    // Fallback: collect all distinct dates in document order
    const allDates: string[] = [];
    for (const line of lines) {
      const d = parseDateFromString(line);
      if (d && !allDates.includes(d)) allDates.push(d);
    }

    const checkIn = labeledIn ?? dateRange?.start ?? allDates[0] ?? today;
    const checkOut =
      labeledOut ??
      dateRange?.end ??
      (allDates.find((d) => d > checkIn) ?? addDays(checkIn, 2));

    const nightsMatch = rawText.match(/(\d+)\s*nights?/i);
    const computedNights = Math.max(
      1,
      Math.round(
        (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    const nights = nightsMatch ? parseInt(nightsMatch[1], 10) : computedNights;

    const confMatch =
      rawText.match(/#([A-Z0-9-]{4,16})\b/i) ??
      rawText.match(
        /(?:confirmation|booking(?:\s+confirmed)?|reservation|trip\s*id|voucher|pin\s*code|ref(?:erence)?)\s*(?:no\.?|number|id|code|#|:)*\s*#?([A-Z0-9-]*\d[A-Z0-9-]{2,15})\b/i
      );
    const otaHeaderNoise =
      /^(?:booking\.com|agoda|makemytrip|goibibo|ixigo|cleartrip|yatra|expedia|hotels\.com|trip\.com|airbnb|hotel\s*voucher|e-?voucher|booking\s*voucher|booking\s*confirmed|reservation\s*confirmed|confirmation|itinerary|tax\s*invoice)\b/i;
    const hotelNameLine =
      lines.find(
        (l) =>
          /(hotel|resort|ryokan|inn|suites|thousand|marriott|hilton|hyatt|airbnb|villa|house|taj|oberoi|radisson|sheraton|westin|ibis|novotel|accor|chalet|lodge|oyo|lemon\s*tree|ginger|itc|vivanta|trident|treebo|fabhotel|zostel|homestay|guesthouse)/i.test(
            l
          ) && !otaHeaderNoise.test(l)
      ) ??
      lines.find((l) => !otaHeaderNoise.test(l) && /[A-Za-z]{3,}/.test(l)) ??
      'Scanned Stay';

    const addressLine = lines.find((l) =>
      /(ward|street|st\.|strasse|straße|ave|road|rd\.|ku,|kyoto|tokyo|lisbon|rome|paris|zurich|lucerne|interlaken|geneva|zermatt|address|bengaluru|mumbai|goa|delhi|london|new york)/i.test(l)
    );

    // Infer destination city from known travel cities (word-boundary match so 'Goa' matches cleanly)
    const lowerAll = rawText.toLowerCase();
    let cityHint: string | undefined;
    for (const ap of Object.values(AIRPORTS)) {
      if (ap.city.length >= 3) {
        const escaped = ap.city.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(lowerAll)) {
          cityHint = ap.city;
          break;
        }
      }
    }
    if (!cityHint) {
      for (const ap of Object.values(AIRPORTS)) {
        if (ap.country.length >= 4) {
          const escaped = ap.country.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`\\b${escaped}\\b`, 'i').test(lowerAll)) {
            cityHint = ap.country;
            break;
          }
        }
      }
    }

    const parsed: ParsedHotelConfirmation = {
      kind: 'hotel',
      hotelName: toTitleCaseIfUpper(hotelNameLine),
      confirmationCode: confMatch ? confMatch[1] : undefined,
      checkIn,
      checkOut,
      nights,
      totalAmount,
      currency,
      address: addressLine,
      cityHint,
      rawText,
      imageUri,
    };
    return parsed;
  }

  const merchantLine =
    lines.find((l) => /[A-Za-z]/.test(l) && !/^\d{4}[-/]/.test(l) && !/^receipt$/i.test(l)) ??
    'Scanned Expense';

  const date = parseDateFromString(rawText) ?? today;
  const category = inferExpenseCategory(rawText);

  const receipt: ParsedReceipt = {
    kind: 'receipt',
    merchant: toTitleCaseIfUpper(merchantLine),
    amount: totalAmount,
    currency,
    date,
    category,
    rawText,
    imageUri,
  };
  return receipt;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toTitleCaseIfUpper(str: string): string {
  if (str === str.toUpperCase()) {
    return str
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return str;
}

export const SAMPLE_OCR_TEXTS = {
  ramenReceipt: `MENBA KAWATOMI KYOTO
2026/10/18 19:42
Duck Shoyu Ramen   ¥1,450
Gyoza (6pc)          ¥400
TOTAL (TAX INCL)   ¥1,850
CARD: SUICA / AMEX`,

  hotelConfirmation: `BOOKING CONFIRMED #TK-88412
THE THOUSAND KYOTO
570 Higashishiokojicho, Shimogyo Ward, Kyoto
Check-in: Oct 17, 2026 (15:00)
Check-out: Oct 21, 2026 (11:00)
4 Nights • Deluxe Twin Room
Total Paid: $1,450.00 USD`,

  flightConfirmation: `FLIGHT BOOKING CONFIRMED
IndiGo • Flight 6E 412
Booking Reference (PNR): R8V2N4
Bengaluru (BLR) → Goa (GOI)
Departure Date: 14 Oct 2026
Cabin: Economy • Seat 14C
Total Fare Paid: ₹6,450 INR`,

  lisbonCafe: `PASTEIS DE BELEM LISBOA
2026-05-06 09:15
Pastel de Nata x4   €5.60
Galao Coffee x2     €3.40
TOTAL               €9.00`,
};
