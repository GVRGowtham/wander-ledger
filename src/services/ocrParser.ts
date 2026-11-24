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
  ParsedFlightLeg,
  ParsedHotelConfirmation,
  ParsedReceipt,
  ParsedTransport,
  ScanResult,
} from '../types/models';

const CURRENCY_PATTERNS: Array<{ regex: RegExp; code: string }> = [
  { regex: /¥|\bJPY(?=\b|\d)/i, code: 'JPY' },
  { regex: /€|\bEUR(?=\b|\d)/i, code: 'EUR' },
  { regex: /£|\bGBP(?=\b|\d)/i, code: 'GBP' },
  { regex: /₹|\bINR(?=\b|\d)|\bRS\.?\s*\d/i, code: 'INR' },
  { regex: /\bCHF(?=\b|\d)|\bSFr\.?/i, code: 'CHF' },
  { regex: /₩|\bKRW(?=\b|\d)/i, code: 'KRW' },
  { regex: /฿|\bTHB(?=\b|\d)/i, code: 'THB' },
  { regex: /S\$|\bSGD(?=\b|\d)/i, code: 'SGD' },
  { regex: /A\$|\bAUD(?=\b|\d)/i, code: 'AUD' },
  { regex: /C\$|\bCAD(?=\b|\d)/i, code: 'CAD' },
  { regex: /NZ\$|\bNZD(?=\b|\d)/i, code: 'NZD' },
  { regex: /HK\$|\bHKD(?=\b|\d)/i, code: 'HKD' },
  { regex: /\bAED(?=\b|\d)|\bDHS\.?\s*\d/i, code: 'AED' },
  { regex: /\bQAR(?=\b|\d)/i, code: 'QAR' },
  { regex: /\bSAR(?=\b|\d)/i, code: 'SAR' },
  { regex: /\bMYR(?=\b|\d)|\bRM\s*\d/i, code: 'MYR' },
  { regex: /\bMXN(?=\b|\d)/i, code: 'MXN' },
  { regex: /\$|\bUSD(?=\b|\d)/i, code: 'USD' },
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
  '(?:INR|USD|EUR|GBP|JPY|CHF|SFr\\.?|SGD|AUD|CAD|NZD|HKD|AED|DHS\\.?|QAR|SAR|THB|KRW|MYR|MXN|RS\\.?)';
const AMOUNT_TOKEN = "([\\d,.'’]+(?:[.,]\\d{1,3})?)";

const NON_MONEY_LINE_RX =
  /\b(?:baggage|luggage|checked\s*bag|cabin\s*bag|carry[\s-]?on|weight|allowance|duration|flying\s*time|flight\s*time|travel\s*time|layover|transit\s*time|stops?|passengers?|guests?|adults?|children|infants?|pieces?|terminal|gate|ticket\s*(?:no\.?|number)|e-?ticket\s*(?:no\.?|number)|frequent\s*flyer|membership|tier\s*miles|guest\s*miles|distance|kilometers?|miles)\b/i;

const FEE_PENALTY_LINE_RX =
  /\b(?:change\s*fee|cancellation\s*fee|cancel\s*fee|no[\s-]?show|penalty|refund\s*fee|rebooking\s*fee|baggage\s*fee|excess\s*baggage|upgrade\s*fee)\b/i;

const TAX_OR_SUBTOTAL_LINE_RX =
  /\b(?:tax(?:es)?|carrier[\s-]?imposed|surcharges?|fuel\s*surcharge|sub[\s-]?total|subtotal|base\s*fare|air\s*fare\s*only|equivalent\s*fare|exchange\s*rate|\broe\b|cgst|sgst|igst|user\s*development\s*fee|passenger\s*service\s*fee|\bvat\b|\bgst\b)\b/i;

const INCLUSIVE_GRAND_TOTAL_RX =
  /\b(?:grand\s*total|final\s*total|total\s*(?:calculated\s*)?fare|total\s*(?:amount\s*)?paid|total\s*price|total\s*payable|net\s*payable|amount\s*paid|total\s*\(?tax\s*incl\.?\)?|incl(?:uding)?\.?\s*(?:all\s*)?(?:taxes?|gst|vat)|tax(?:es)?\s*incl(?:uded|\.?))\b/i;

const NON_MONEY_UNIT_FOLLOW_RX =
  /^\s*(?:kg|kgs|lb|lbs|gm|cm|mm|km|mi|hrs?|hours?|mins?|minutes?|sec|%|pieces?|pcs|bags?|nights?|days?|pax|passengers?|stops?)\b/i;

const MONETARY_HINT_RX = new RegExp(
  `(?:[¥$€£₹₩฿]|\\b(?:${CURRENCY_TOKEN}|fare|price|amount|paid|payable|payment|charged|cost|charges|invoice|receipt)\\b)`,
  'i'
);

function isTaxOrSubtotalOnlyLine(line: string): boolean {
  return TAX_OR_SUBTOTAL_LINE_RX.test(line) && !INCLUSIVE_GRAND_TOTAL_RX.test(line);
}

function isPlausibleMoneyToken(rawToken: string, trailingText: string): boolean {
  if (!rawToken || !/\d/.test(rawToken)) return false;
  // Reject dotted dates/versions like 31.10.2025 or 1.2.3
  if (/\d\.\d{1,2}\.\d/.test(rawToken)) return false;
  // Reject values immediately followed by physical/time/count units (e.g. "30 kg", "4 hrs", "2 bags")
  if (NON_MONEY_UNIT_FOLLOW_RX.test(trailingText)) return false;
  const val = parseNumber(rawToken);
  if (val <= 0 || val > 9_999_999) return false;
  // Reject >7 integer digits (e.g. 10-digit phone numbers, 13-digit e-ticket numbers)
  const intDigits = String(Math.floor(val)).length;
  if (intDigits > 7) return false;
  return true;
}

function matchAmountOnLine(
  line: string,
  prefixPattern: string
): { amount: number; currency: string | null } | null {
  // Pattern A: Label ... [CurrencySymbol/Code] Amount [optional CurrencyCode]
  const rxA = new RegExp(
    `(?:${prefixPattern})[^\\d¥$€£₹₩฿]*?(?:([¥$€£₹₩฿])|(${CURRENCY_TOKEN}))?\\s*${AMOUNT_TOKEN}(?:\\s*(${CURRENCY_TOKEN}))?`,
    'i'
  );
  const m = line.match(rxA);
  if (m && m[3]) {
    const rawNum = m[3];
    const matchEnd = (m.index ?? 0) + m[0].length;
    const trailing = line.slice(matchEnd);
    if (isPlausibleMoneyToken(rawNum, trailing)) {
      const currencyToken = m[1] || m[2] || m[4] || '';
      const lineCurrency = currencyToken
        ? detectCurrency(currencyToken, '')
        : detectCurrency(line, '');
      return {
        amount: parseNumber(rawNum),
        currency: lineCurrency || null,
      };
    }
  }
  return null;
}

function matchStandaloneMoneyLine(line: string): { amount: number; currency: string | null } | null {
  const rx = new RegExp(
    `(?:([¥$€£₹₩฿])|(${CURRENCY_TOKEN}))?\\s*${AMOUNT_TOKEN}(?:\\s*(${CURRENCY_TOKEN}))?`,
    'i'
  );
  const m = line.match(rx);
  if (m && m[3]) {
    const matchEnd = (m.index ?? 0) + m[0].length;
    if (isPlausibleMoneyToken(m[3], line.slice(matchEnd))) {
      const currStr = m[1] || m[2] || m[4] || line;
      return {
        amount: parseNumber(m[3]),
        currency: detectCurrency(currStr, '') || null,
      };
    }
  }
  return null;
}

export interface DetectedMoneyCandidate {
  amount: number;
  currency: string;
}

export function extractTotalWithCurrency(
  text: string,
  defaultCurrency = 'USD'
): { amount: number; currency: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const fallbackCurrency = detectCurrency(text, defaultCurrency);

  // 1. High-priority explicit monetary total labels (checked bottom-up)
  const strongTotalLabels =
    'grand\\s*total|final\\s*total|total\\s*(?:calculated\\s*)?fare(?:\\s*paid)?|calculated\\s*fare|fare\\s*total|total\\s*airfare|airfare\\s*total|total\\s*ticket(?:\\s*price|\\s*cost|\\s*fare)?|ticket\\s*total|total\\s*(?:amount\\s*)?paid|total\\s*payment|total\\s*price|total\\s*cost|total\\s*charges|total\\s*stay|total\\s*due|total\\s*charged|total\\s*billed|amount\\s*paid|amount\\s*charged|total\\s*amount(?:\\s*paid)?|net\\s*payable|balance\\s*due|total\\s*\\(?tax\\s*incl\\.?\\)?|total\\s*incl\\.?[^\\d]*|total\\s*ttc|gesamt(?:betrag)?|合計';

  const strongHeaderOnlyRx =
    /^(?:grand\s*total|final\s*total|total\s*(?:calculated\s*)?fare(?:\s*paid)?|calculated\s*fare|fare\s*total|total\s*airfare|ticket\s*total|total\s*(?:amount\s*)?paid|total\s*payment|total\s*price|total\s*cost|total\s*charges|total\s*stay|total\s*due|amount\s*paid|total\s*amount(?:\s*paid)?|net\s*payable|balance\s*due|total\s*ttc|gesamt(?:betrag)?)(?:\s*\([^)]*\))?[:\s-]*$/i;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (NON_MONEY_LINE_RX.test(line) && !MONETARY_HINT_RX.test(line)) continue;
    if (FEE_PENALTY_LINE_RX.test(line)) continue;
    if (isTaxOrSubtotalOnlyLine(line)) continue;

    const hit = matchAmountOnLine(line, strongTotalLabels);
    if (hit) {
      return { amount: hit.amount, currency: hit.currency ?? fallbackCurrency };
    }

    // Two-column PDF / Booking.com screenshot layout: label on line i, amount on line i+1 (or i+2 if a parenthetical subtitle sits in between)
    if (strongHeaderOnlyRx.test(line)) {
      for (const offset of [1, 2]) {
        if (i + offset >= lines.length) break;
        const nextLine = lines[i + offset];
        if (NON_MONEY_LINE_RX.test(nextLine) || isTaxOrSubtotalOnlyLine(nextLine)) continue;
        // Don't jump past a completely unrelated label line if offset === 2
        if (offset === 2 && !/^\(?incl|tax|fee|all\b/i.test(lines[i + 1])) break;
        const nextHit = matchStandaloneMoneyLine(nextLine);
        if (nextHit) {
          return {
            amount: nextHit.amount,
            currency: nextHit.currency ?? (detectCurrency(line, '') || fallbackCurrency),
          };
        }
      }
    }
  }

  // 2. Generic TOTAL / SUM lines (strictly skipping baggage/duration/stops/penalty/tax/subtotal lines)
  const genericTotalHeaderRx = /^(?:total|sum)(?:\s*\([^)]*\))?[:\s-]*$/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (NON_MONEY_LINE_RX.test(line) || FEE_PENALTY_LINE_RX.test(line)) continue;
    if (isTaxOrSubtotalOnlyLine(line)) continue;

    const hit = matchAmountOnLine(line, '\\btotal\\b|\\bsum\\b');
    if (hit) {
      return { amount: hit.amount, currency: hit.currency ?? fallbackCurrency };
    }

    if (i + 1 < lines.length && genericTotalHeaderRx.test(line)) {
      const nextLine = lines[i + 1];
      if (!NON_MONEY_LINE_RX.test(nextLine) && !isTaxOrSubtotalOnlyLine(nextLine)) {
        const nextHit = matchStandaloneMoneyLine(nextLine);
        if (nextHit) {
          return {
            amount: nextHit.amount,
            currency: nextHit.currency ?? (detectCurrency(line, '') || fallbackCurrency),
          };
        }
      }
    }
  }

  // 3. Fallback: largest currency-prefixed or currency-suffixed number on non-penalty, non-tax lines
  const moneyRegex = new RegExp(
    `(?:(?:([¥$€£₹₩฿])|(${CURRENCY_TOKEN}))\\s*${AMOUNT_TOKEN}|${AMOUNT_TOKEN}\\s*(${CURRENCY_TOKEN}))`,
    'gi'
  );
  let maxVal = 0;
  let maxCurrency: string | null = null;

  for (const skipTax of [true, false]) {
    for (const line of lines) {
      if (NON_MONEY_LINE_RX.test(line) || FEE_PENALTY_LINE_RX.test(line)) continue;
      if (skipTax && isTaxOrSubtotalOnlyLine(line)) continue;
      for (const m of line.matchAll(moneyRegex)) {
        const rawNum = m[3] || m[4];
        if (!rawNum) continue;
        const matchEnd = (m.index ?? 0) + m[0].length;
        if (!isPlausibleMoneyToken(rawNum, line.slice(matchEnd))) continue;
        const val = parseNumber(rawNum);
        if (val > maxVal) {
          maxVal = val;
          const currStr = m[1] || m[2] || m[5] || '';
          maxCurrency = detectCurrency(currStr, '') || null;
        }
      }
    }
    if (maxVal > 0) break;
  }

  return {
    amount: maxVal,
    currency: maxCurrency ?? fallbackCurrency,
  };
}

/**
 * Extracts up to 4 distinct plausible monetary amounts from OCR text so users can
 * 1-tap swap the detected fare/total on multi-number airline e-tickets & hotel folios.
 */
export function extractMoneyCandidates(
  text: string,
  defaultCurrency = 'USD',
  maxCount = 4
): DetectedMoneyCandidate[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const fallbackCurrency = detectCurrency(text, defaultCurrency);

  const results: DetectedMoneyCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (amount: number, currency: string) => {
    if (!(amount > 0)) return;
    const rounded = Math.round(amount * 100) / 100;
    const curr = (currency || fallbackCurrency).toUpperCase();
    const key = `${curr}:${rounded}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ amount: rounded, currency: curr });
  };

  // Primary auto-detected total goes first
  const primary = extractTotalWithCurrency(text, defaultCurrency);
  if (primary.amount > 0) {
    pushCandidate(primary.amount, primary.currency);
  }

  // Scan currency-tagged and total/fare labeled lines (preferring non-tax lines first)
  const moneyRegex = new RegExp(
    `(?:(?:([¥$€£₹₩฿])|(${CURRENCY_TOKEN}))\\s*${AMOUNT_TOKEN}|${AMOUNT_TOKEN}\\s*(${CURRENCY_TOKEN}))`,
    'gi'
  );

  for (const allowTaxLines of [false, true]) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (NON_MONEY_LINE_RX.test(line) && !MONETARY_HINT_RX.test(line)) continue;
      if (FEE_PENALTY_LINE_RX.test(line)) continue;
      if (!allowTaxLines && isTaxOrSubtotalOnlyLine(line)) continue;

      let foundTagged = false;
      for (const m of line.matchAll(moneyRegex)) {
        const rawNum = m[3] || m[4];
        if (!rawNum) continue;
        const matchEnd = (m.index ?? 0) + m[0].length;
        if (!isPlausibleMoneyToken(rawNum, line.slice(matchEnd))) continue;
        const currStr = m[1] || m[2] || m[5] || '';
        const curr = detectCurrency(currStr, '') || fallbackCurrency;
        pushCandidate(parseNumber(rawNum), curr);
        foundTagged = true;
        if (results.length >= maxCount) return results;
      }

      if (!foundTagged && /\b(?:total|fare|paid|amount|price|payable|balance)\b/i.test(line)) {
        const unlabeled = matchAmountOnLine(
          line,
          '\\b(?:total|fare|paid|amount|price|payable|balance)\\b'
        );
        if (unlabeled) {
          pushCandidate(unlabeled.amount, unlabeled.currency ?? fallbackCurrency);
          if (results.length >= maxCount) return results;
        }
      }
    }
  }

  return results;
}

export function extractTotalAmount(text: string): number {
  return extractTotalWithCurrency(text, 'USD').amount;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function isValidDayMonth(day: number, month: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

export function parseDateFromString(text: string): string | null {
  // YYYY-MM-DD or YYYY/MM/DD
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    const mon = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    if (isValidDayMonth(day, mon)) {
      return `${iso[1]}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Oct 17, 2026 or Oct 17 2026
  const namedFirst = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i
  );
  if (namedFirst) {
    const mon = MONTH_MAP[namedFirst[1].slice(0, 3).toLowerCase()];
    const day = parseInt(namedFirst[2], 10);
    if (isValidDayMonth(day, parseInt(mon, 10))) {
      return `${namedFirst[3]}-${mon}-${String(day).padStart(2, '0')}`;
    }
  }

  // 17 Oct 2026, 17-Oct-2026, 31OCT2025, or 17 Oct, 2026
  const dayFirst = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?[\s-]*(20\d{2})\b/i
  );
  if (dayFirst) {
    const mon = MONTH_MAP[dayFirst[2].slice(0, 3).toLowerCase()];
    const day = parseInt(dayFirst[1], 10);
    if (isValidDayMonth(day, parseInt(mon, 10))) {
      return `${dayFirst[3]}-${mon}-${String(day).padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (common in India/Europe confirmations)
  const dmy = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (dmy) {
    const a = parseInt(dmy[1], 10);
    const b = parseInt(dmy[2], 10);
    const day = b > 12 ? b : a;
    const month = b > 12 ? a : b;
    if (isValidDayMonth(day, month)) {
      return `${dmy[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 17 Oct '26, 17 Oct 26, 31OCT25, or 31-OCT-25 (MakeMyTrip / Goibibo / airline e-tickets)
  const dayFirstShortYr = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?[\s-]*['’]?(\d{2})\b/i
  );
  if (dayFirstShortYr) {
    const mon = MONTH_MAP[dayFirstShortYr[2].slice(0, 3).toLowerCase()];
    const day = parseInt(dayFirstShortYr[1], 10);
    if (isValidDayMonth(day, parseInt(mon, 10))) {
      return `20${dayFirstShortYr[3]}-${mon}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Parses year-less airline dates like "31 Oct", "31OCT", or "Oct 31" using a reference year
 * (and optional issueDate so a flight booked in Nov 2025 for Jan 2026 rolls forward cleanly).
 */
function parseDayMonthWithYear(
  text: string,
  referenceYear: number,
  minIsoDate?: string | null
): string | null {
  let day = 0;
  let monStr = '';

  const mDayFirst = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i
  );
  if (mDayFirst) {
    day = parseInt(mDayFirst[1], 10);
    monStr = MONTH_MAP[mDayFirst[2].slice(0, 3).toLowerCase()];
  } else {
    const mMonFirst = text.match(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
    );
    if (mMonFirst) {
      monStr = MONTH_MAP[mMonFirst[1].slice(0, 3).toLowerCase()];
      day = parseInt(mMonFirst[2], 10);
    }
  }

  if (!monStr || !isValidDayMonth(day, parseInt(monStr, 10))) return null;

  let candidate = `${referenceYear}-${monStr}-${String(day).padStart(2, '0')}`;
  if (minIsoDate && candidate < minIsoDate) {
    candidate = `${referenceYear + 1}-${monStr}-${String(day).padStart(2, '0')}`;
  }
  return candidate;
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
  if (
    /(petrol|diesel|unleaded|gas\s*station|fuel|shell\b|\bbp\b|indianoil|indian\s*oil|hpcl|bpcl|bharat\s*petroleum|hindustan\s*petroleum|chevron|exxon|mobil|texaco|supercharger|ev\s*charging|fastag|highway\s*toll|toll\s*plaza|\blitres?\b|\bliters?\b|\bgallons?\b)/.test(
      q
    )
  ) {
    return 'fuel';
  }
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

export function isTransportConfirmationText(text: string): boolean {
  const q = text.toLowerCase();

  // Car Rental detection (Sixt, Hertz, Avis, Enterprise, Europcar, Zoomcar, etc.)
  const carRentalVendor =
    /\b(sixt|hertz|avis|enterprise|europcar|alamo|budget\s*rent|national\s*car|zoomcar|revv|myles|turo|rentalcars)\b/.test(
      q
    );
  const carRentalSignals = [
    /pick[\s-]?up|pickup\s*date|pickup\s*location/,
    /drop[\s-]?off|return\s*date|return\s*location/,
    /rental\s*agreement|car\s*rental|vehicle\s*group|reservation|booking\s*(?:id|ref|number)/,
  ].filter((r) => r.test(q)).length;
  if (carRentalVendor && carRentalSignals >= 1) return true;
  if (carRentalSignals >= 2 && /\b(car|vehicle|suv|sedan|hatchback|automatic|rental)\b/.test(q)) {
    return true;
  }

  // Train / Bus / Ferry e-ticket detection (IRCTC, SBB, Eurostar, Shinkansen, Amtrak, RedBus, FlixBus, etc.)
  const railBusVendor =
    /\b(irctc|indian\s*railways|vande\s*bharat|shatabdi|rajdhani|sbb\s*cff|sbb|eurostar|shinkansen|jr\s*east|jr\s*west|amtrak|trenitalia|italo|sncf|tgv|deutsche\s*bahn|db\s*bahn|eurail|swiss\s*travel\s*pass|redbus|flixbus|greyhound|national\s*express|ksrtc|ferry\s*ticket|blue\s*star\s*ferries)\b/.test(
      q
    );
  const railSignals = [
    /\b(train\s*no|train\s*number|coach|berth|platform|wagon|car\s*\d+|seat\s*no|boarding\s*station|from\s*station|to\s*station)\b/,
    /\b(pnr|booking\s*ref|ticket\s*no|e-?ticket|electronic\s*reservation|confirmation)\b/,
    /\b(bus\s*operator|boarding\s*point|dropping\s*point|sleeper|ferry|port\s*of\s*departure)\b/,
  ].filter((r) => r.test(q)).length;

  if (railBusVendor && (railSignals >= 1 || /→|->|\bto\b/i.test(text))) return true;
  if (railSignals >= 2 && !/\b(airline|airways|flight\s*no|airport)\b/.test(q)) return true;

  return false;
}

function parseTransportConfirmationOcr(
  rawText: string,
  currency: string,
  totalAmount: number,
  imageUri?: string
): ParsedTransport {
  const q = rawText.toLowerCase();
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);

  let mode: ParsedTransport['mode'] = 'train';
  if (
    /\b(sixt|hertz|avis|enterprise|europcar|alamo|budget\s*rent|zoomcar|turo|car\s*rental|rental\s*agreement|pick[\s-]?up.*drop[\s-]?off)\b/i.test(
      rawText
    )
  ) {
    mode = 'rental_car';
  } else if (/\b(redbus|flixbus|greyhound|national\s*express|ksrtc|bus\s*ticket|bus\s*operator|boarding\s*point)\b/i.test(rawText)) {
    mode = 'bus';
  } else if (/\b(ferry|catamaran|hydrofoil|port\s*of\s*departure)\b/i.test(rawText)) {
    mode = 'ferry';
  }

  // Operator detection
  const knownOperators: Array<{ rx: RegExp; name: string }> = [
    { rx: /\birctc|indian\s*railways/i, name: 'IRCTC / Indian Railways' },
    { rx: /\bsbb\s*cff|\bsbb\b/i, name: 'SBB Swiss Railways' },
    { rx: /\beurostar\b/i, name: 'Eurostar' },
    { rx: /\bshinkansen|\bjr\s*(?:east|west|central)/i, name: 'JR Shinkansen' },
    { rx: /\bamtrak\b/i, name: 'Amtrak' },
    { rx: /\btrenitalia\b/i, name: 'Trenitalia' },
    { rx: /\bsncf|\btgv\b/i, name: 'SNCF TGV' },
    { rx: /\bdeutsche\s*bahn|\bdb\s*bahn\b/i, name: 'Deutsche Bahn' },
    { rx: /\bredbus\b/i, name: 'RedBus' },
    { rx: /\bflixbus\b/i, name: 'FlixBus' },
    { rx: /\bsixt\b/i, name: 'Sixt Car Rental' },
    { rx: /\bhertz\b/i, name: 'Hertz' },
    { rx: /\bavis\b/i, name: 'Avis' },
    { rx: /\benterprise\b/i, name: 'Enterprise' },
    { rx: /\beuropcar\b/i, name: 'Europcar' },
    { rx: /\bzoomcar\b/i, name: 'Zoomcar' },
  ];
  const matchedOp = knownOperators.find((op) => op.rx.test(rawText));
  const operatorName =
    matchedOp?.name ??
    lines.find((l) => /[A-Za-z]{3,}/.test(l) && l.length <= 42) ??
    (mode === 'rental_car' ? 'Car Rental' : mode === 'bus' ? 'Bus' : mode === 'ferry' ? 'Ferry' : 'Train');

  // Extract origin & destination
  let origin = '';
  let destination = '';
  const fromMatch = rawText.match(
    /(?:from(?:\s*station)?|boarding(?:\s*point|\s*station)?|pick[\s-]?up(?:\s*location)?|departure\s*station)[\s:]+([^\n\r,|]{2,36})/i
  );
  const toMatch = rawText.match(
    /(?:to(?:\s*station)?|dropping(?:\s*point)?|drop[\s-]?off(?:\s*location)?|arrival\s*station|destination)[\s:]+([^\n\r,|]{2,36})/i
  );
  if (fromMatch) origin = fromMatch[1].trim();
  if (toMatch) destination = toMatch[1].trim();

  if (!origin || !destination) {
    const arrowLine = lines.find((l) => /([A-Za-z][A-Za-z\s.]{1,24})\s*(?:→|->|—|–)\s*([A-Za-z][A-Za-z\s.]{1,24})/.test(l));
    if (arrowLine) {
      const am = arrowLine.match(/([A-Za-z][A-Za-z\s.]{1,24})\s*(?:→|->|—|–)\s*([A-Za-z][A-Za-z\s.]{1,24})/);
      if (am) {
        origin = origin || am[1].trim();
        destination = destination || am[2].trim();
      }
    }
  }
  origin = origin || 'Start';
  destination = destination || (mode === 'rental_car' ? origin : 'Destination');

  // Dates
  const allDates: string[] = [];
  for (const line of lines) {
    const d = parseDateFromString(line);
    if (d && !allDates.includes(d)) allDates.push(d);
  }
  const startDate = allDates[0] ?? today;
  const endDate = allDates.find((d) => d > startDate);

  // Reference / PNR / Booking ID (must contain at least 1 digit so words like "SLIP" never match)
  const pnrMatch = rawText.match(/\bpnr\b[\s:#-]*([A-Z0-9-]*\d[A-Z0-9-]{3,13})\b/i);
  const refMatch =
    pnrMatch ??
    rawText.match(
      /(?:\bbooking\s*(?:id|ref(?:erence)?|no\.?|number)?\b|\breservation\s*(?:id|no\.?|code|#|:)\b|\bticket\s*(?:no\.?|number|#)\b|\btrain\s*(?:no\.?|number)\b)[\s:#-]*([A-Z0-9-]*\d[A-Z0-9-]{2,13})\b/i
    );
  const referenceCode = refMatch ? refMatch[1].toUpperCase() : undefined;

  // Seat / Coach / Vehicle
  const vehicleMatch =
    mode === 'rental_car'
      ? rawText.match(/(?:vehicle|car\s*model|group|model)[\s:]+([^\n\r]{3,32})/i)
      : rawText.match(/(?:coach|berth|seat|class|wagon|car)[\s:#-]*([A-Z0-9/\s-]{2,20})/i);
  const seatOrVehicle = vehicleMatch ? vehicleMatch[1].trim() : undefined;

  return {
    kind: 'transport',
    mode,
    operatorName: toTitleCaseIfUpper(operatorName),
    origin: toTitleCaseIfUpper(origin),
    destination: toTitleCaseIfUpper(destination),
    startDate,
    endDate,
    referenceCode,
    seatOrVehicle,
    totalAmount,
    currency,
    rawText,
    imageUri,
  };
}

export function isHotelConfirmationText(text: string): boolean {
  const q = text.toLowerCase();
  const hasCheckIn = /check[\s-]?in/.test(q);
  const hasCheckOut = /check[\s-]?out/.test(q);
  const hasNights = /\b\d+\s*nights?\b/.test(q);
  const hasBookingKeyword =
    /reservation|booking\s*confirmed|booking\s*id|hotel\s*voucher|confirmation\s*#?|itinerary/.test(
      q
    );
  const hasRoomType =
    /\b(?:room\s*type|deluxe\s*room|twin\s*room|king\s*room|queen\s*room|double\s*room|single\s*room|breakfast\s*included|property\s*address|hotel\s*voucher|stay\s*summary|number\s*of\s*rooms)\b/.test(
      q
    );
  const hasLodgingProperty =
    /\b(?:hotel|resort|ryokan|suites|airbnb|hostel|villa|homestay|guesthouse|chalet|lodge|marriott|hilton|hyatt|taj|oberoi|radisson|oyo|lemon\s*tree|ginger|itc|vivanta|trident|treebo|fabhotel|zostel|agoda|makemytrip|goibibo|ixigo|cleartrip|booking\.com|expedia)\b/.test(
      q
    );

  // Require at least one true lodging-only signal (check-out, nights count, or room-type/voucher)
  // so airline e-tickets mentioning airport "Check-in" + "Itinerary" (or stopover hotel ads) never qualify.
  if (hasCheckOut && (hasCheckIn || hasNights || hasLodgingProperty || hasBookingKeyword)) {
    return true;
  }
  if (hasNights && (hasLodgingProperty || hasBookingKeyword)) {
    return true;
  }
  if (hasRoomType && hasLodgingProperty) {
    return true;
  }
  return false;
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
    'BAG', 'HRS', 'MIN', 'SEC', 'EST', 'IST', 'PST', 'UTC', 'GMT', 'YES', 'NOT',
    'ONE', 'TWO', 'DAY', 'PER', 'REF', 'WEB', 'APP', 'PDF', 'VIA', 'OUT', 'NEW',
    'PAY', 'ETD', 'ETA', 'STD', 'STA', 'ADT', 'CHD', 'INF', 'DOC', 'TKT', 'TTL',
    'NET', 'VAT', 'GST', 'ROE', 'NUC', 'END', 'INT', 'DOM', 'ECO', 'BUS', 'FIR',
    'KGS', 'LBS', 'PCS',
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

  // 3. Fallback: match known airport city names in order of appearance (e.g. "Bengaluru ... Abu Dhabi")
  const cityHits: Array<{ iata: string; index: number }> = [];
  const seenCityIatas = new Set<string>(foundCodes);
  for (const ap of Object.values(AIRPORTS)) {
    const primaryCity = ap.city.split('/')[0].trim();
    if (primaryCity.length < 4 || seenCityIatas.has(ap.iata)) continue;
    const escaped = primaryCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cm = text.match(new RegExp(`\\b${escaped}\\b`, 'i'));
    if (cm && cm.index !== undefined) {
      cityHits.push({ iata: ap.iata, index: cm.index });
      seenCityIatas.add(ap.iata);
    }
  }
  cityHits.sort((a, b) => a.index - b.index);
  const combined = [...foundCodes, ...cityHits.map((h) => h.iata)];
  if (combined.length >= 2 && combined[0] !== combined[1]) {
    return { originIata: combined[0], destIata: combined[1] };
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

const ISSUE_METADATA_DATE_RX =
  /\b(?:date\s*of\s*issue|issue\s*date|issued\s*(?:on|date|at)?|booking\s*date|booked\s*on|date\s*booked|printed\s*(?:on)?|print\s*date|invoice\s*date|receipt\s*date|created\s*(?:on)?|date\s*of\s*birth|dob|passport\s*expir|valid\s*(?:until|thru|through))\b/i;

function extractFlightDepartureDate(
  rawText: string,
  lines: string[],
  flightNumber: string,
  originIata: string,
  today: string
): string {
  // 1. Identify any PDF issue / booking / print metadata date so we skip it (and use its year as reference)
  let issueDate: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (ISSUE_METADATA_DATE_RX.test(lines[i])) {
      issueDate =
        parseDateFromString(lines[i]) ??
        (i + 1 < lines.length ? parseDateFromString(lines[i + 1]) : null);
      if (issueDate) break;
    }
  }

  const yearMatch = issueDate?.slice(0, 4) ?? rawText.match(/\b(20\d{2})\b/)?.[1];
  const referenceYear = yearMatch ? parseInt(yearMatch, 10) : parseInt(today.slice(0, 4), 10);

  const isMetadataLine = (idx: number): boolean => {
    if (idx < 0 || idx >= lines.length) return true;
    if (ISSUE_METADATA_DATE_RX.test(lines[idx])) return true;
    // Also skip the value line right after a bare "Date of issue" header
    if (
      idx > 0 &&
      ISSUE_METADATA_DATE_RX.test(lines[idx - 1]) &&
      !parseDateFromString(lines[idx - 1])
    ) {
      return true;
    }
    return false;
  };

  const scanWindow = (indices: number[], allowYearless: boolean): string | null => {
    for (const idx of indices) {
      if (isMetadataLine(idx)) continue;
      const full = parseDateFromString(lines[idx]);
      if (full) return full;
    }
    if (allowYearless) {
      for (const idx of indices) {
        if (isMetadataLine(idx)) continue;
        const dm = parseDayMonthWithYear(lines[idx], referenceYear, issueDate);
        if (dm) return dm;
      }
    }
    return null;
  };

  // Priority 1: Explicit Departure / Outbound / Onward / Flight Date label (same line or next 2 lines)
  const depLabelRx =
    /\b(?:depart(?:ure|ing)?(?:\s*date)?|flight\s*date|travel\s*date|journey\s*date|onward|outbound)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (isMetadataLine(i)) continue;
    if (depLabelRx.test(lines[i])) {
      const hit = scanWindow([i, i + 1, i + 2], true);
      if (hit) return hit;
    }
  }

  // Priority 2: Lines containing the flight number (e.g. "EY 217" / "EY217") or origin IATA (e.g. "BLR")
  const compactFlt = flightNumber.replace(/\s+/g, '');
  const fltRx =
    compactFlt.length >= 3 && !flightNumber.endsWith('Flight')
      ? new RegExp(
          `\\b${flightNumber
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\s+/g, '\\s*[-]?\\s*')}\\b`,
          'i'
        )
      : null;
  const originRx =
    originIata && originIata !== 'TBD' ? new RegExp(`\\b${originIata}\\b`) : null;

  for (let i = 0; i < lines.length; i++) {
    if (isMetadataLine(i)) continue;
    if ((fltRx && fltRx.test(lines[i])) || (originRx && originRx.test(lines[i]))) {
      const hit = scanWindow([i, i - 1, i + 1, i + 2], true);
      if (hit) return hit;
    }
  }

  // Priority 3: First non-metadata full date in the document (preferring one >= issueDate)
  const nonMetaDates: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isMetadataLine(i)) continue;
    const d = parseDateFromString(lines[i]);
    if (d && !nonMetaDates.includes(d)) nonMetaDates.push(d);
  }
  if (nonMetaDates.length > 0) {
    if (issueDate) {
      const afterIssue = nonMetaDates.find((d) => d >= issueDate);
      if (afterIssue) return afterIssue;
    }
    return nonMetaDates[0];
  }

  // Priority 4: First non-metadata year-less date (e.g. "31 Oct" / "31OCT")
  for (let i = 0; i < lines.length; i++) {
    if (isMetadataLine(i)) continue;
    const dm = parseDayMonthWithYear(lines[i], referenceYear, issueDate);
    if (dm) return dm;
  }

  return issueDate ?? today;
}

interface FlightSegmentAnchor {
  lineIdx: number;
  airlineCode: string;
  flightNumber: string;
}

const FARE_CALC_OR_NOISE_LINE_RX =
  /\b(?:nuc\b|end\s*roe\b|fare\s*calc(?:ulation)?|ticket\s*(?:no\.?|number)|e-?ticket\s*(?:no\.?|number)|document\s*number|membership\s*(?:no\.?|number)|frequent\s*flyer)\b/i;

const ITINERARY_FOOTER_HEADER_RX =
  /^(?:baggage\s*allowance|fare\s*(?:details|breakdown|summary|calculation)|payment\s*(?:details|summary)|receipt\s*summary|conditions\s*of\s*carriage|important\s*information|terms\s*(?:&|and)\s*conditions|fare\s*rules)\b/i;

const SECTION_SUMMARY_LINE_RX =
  /^(?:outbound|return|inbound|onward|itinerary|journey|trip\s*summary|flight\s*summary)\b/i;

const SEGMENT_DIVIDER_RX =
  /\b(?:layover|stopover|transit\s*time|change\s*planes?|connecting\s*time|return\s*:|inbound\s*:|outbound\s*:)\b/i;

const DURATION_ONLY_LINE_RX =
  /\b(?:duration|flying\s*time|flight\s*time|travel\s*time|layover|stopover|transit)\b/i;

/**
 * Extracts a 24-hour clock time (HH:MM) from a line, supporting both 24h ("22:00", "02:25")
 * and 12h ("10:00 PM", "2:25 AM") formats while skipping duration/metadata lines.
 */
export function parseClockTimeHm(line: string): string | null {
  if (!line || ISSUE_METADATA_DATE_RX.test(line)) return null;
  // 12-hour format: e.g. 10:15 PM, 2:25AM, 10.15 PM
  const m12 = line.match(/\b(1[0-2]|0?[1-9])[:.]([0-5]\d)\s*(AM|PM)\b/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = m12[2];
    const meridiem = m12[3].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }

  // Skip lines that are purely flight duration (e.g. "Duration: 04:20", "Flying time 02:15 hrs")
  if (DURATION_ONLY_LINE_RX.test(line) && !/\b(?:depart|dep\b|arrive|arr\b|[A-Z]{3})\b/.test(line)) {
    return null;
  }

  // 24-hour format: e.g. 22:00, 02:25, 06:45 hrs, 14:30HRS, 22:00 IST
  // (Rejects seconds like 10:20:30 and explicit duration words like "02:30 hours" or "02:30 mins")
  const m24 = line.match(/(?<!\d:)(\b[01]?\d|2[0-3]):([0-5]\d)(?!:\d{2})(?!\s*(?:hours?|mins?))/i);
  if (m24) {
    const h = parseInt(m24[1], 10);
    return `${String(h).padStart(2, '0')}:${m24[2]}`;
  }

  // Dot-separated 24-hour format with time marker: e.g. "06.45 hrs", "22.15 IST"
  const mDot = line.match(/\b([01]?\d|2[0-3])\.([0-5]\d)\s*(?:hrs?|IST|UTC|GMT|CET|CEST|EST|PST|GST|SGT)\b/i);
  if (mDot) {
    const h = parseInt(mDot[1], 10);
    return `${String(h).padStart(2, '0')}:${mDot[2]}`;
  }

  // Compact 4-digit airline time with explicit hrs/timezone suffix: e.g. "0645 hrs", "2215 HRS"
  const mCompact = line.match(/\b([01]\d|2[0-3])([0-5]\d)\s*(?:hrs?|IST|UTC|GMT|CET|CEST|GST)\b/i);
  if (mCompact) {
    return `${mCompact[1]}:${mCompact[2]}`;
  }

  return null;
}

function extractDepartureTimeHm(zoneLines: string[], originIata?: string): string | undefined {
  const originRx =
    originIata && originIata !== 'TBD' ? new RegExp(`\\b${originIata}\\b`) : null;
  const depHintRx = /\b(?:depart(?:ure|ing)?|dep\b|take-?off|boarding)\b/i;

  // 1. Prefer clock time on (or immediately below) a line mentioning departure or origin IATA
  for (let i = 0; i < zoneLines.length; i++) {
    const line = zoneLines[i];
    if (ISSUE_METADATA_DATE_RX.test(line)) continue;
    if (depHintRx.test(line) || (originRx && originRx.test(line))) {
      const sameLine = parseClockTimeHm(line);
      if (sameLine) return sameLine;
      const nextLine = zoneLines[i + 1];
      if (nextLine && !ISSUE_METADATA_DATE_RX.test(nextLine)) {
        const below = parseClockTimeHm(nextLine);
        if (below) return below;
      }
    }
  }

  // 2. Fallback: first clock time top-to-bottom inside this leg's exclusive zone
  for (const line of zoneLines) {
    if (ISSUE_METADATA_DATE_RX.test(line) || SECTION_SUMMARY_LINE_RX.test(line)) continue;
    const t = parseClockTimeHm(line);
    if (t) return t;
  }

  return undefined;
}

function buildParsedFlightLeg(
  airlineCode: string,
  flightNumber: string,
  originIata: string,
  destIata: string,
  flightDate: string,
  cabinClass: string,
  seat?: string,
  departureTimeHm?: string
): ParsedFlightLeg {
  const airlineInfo = lookupAirline(airlineCode);
  const originAp = lookupAirport(originIata);
  const destAp = lookupAirport(destIata);
  const distanceMiles =
    originAp && destAp
      ? calculateDistanceMiles(originAp.lat, originAp.lng, destAp.lat, destAp.lng)
      : 0;
  const estimatedDurationMin =
    distanceMiles > 0 ? estimateFlightDurationMinutes(distanceMiles) : 120;

  return {
    airlineCode: airlineInfo.code,
    airlineName: airlineInfo.name,
    flightNumber,
    originIata,
    destIata,
    flightDate,
    departureTimeHm,
    seat: seat || undefined,
    cabinClass,
    distanceMiles,
    estimatedDurationMin,
    loyaltyProgram: airlineInfo.loyaltyProgram,
  };
}

function findAllFlightSegmentAnchors(lines: string[]): FlightSegmentAnchor[] {
  const knownCodes = Object.keys(AIRLINES)
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  // Case-sensitive for bare airline codes so lowercase prose ("as 30 kg") never false-matches
  const bareCarrierRx = new RegExp(`\\b(${knownCodes})\\s*[-]?\\s*(\\d{2,4})\\b`, 'g');
  const explicitFlightRx =
    /\bflight\s*(?:no\.?|number|#|:)?\s*([A-Z0-9]{2})\s*[-]?\s*(\d{1,4})\b/gi;
  const nonFlightTrailingRx = /^\s*(?:kg|kgs|lb|lbs|cm|km|mi|hrs?|mins?|%|:\d{2})\b/i;

  const anchors: FlightSegmentAnchor[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Once we've already captured flight legs and hit Baggage Allowance / Payment / Fare footer, stop!
    if (anchors.length > 0 && ITINERARY_FOOTER_HEADER_RX.test(line)) {
      break;
    }
    if (FARE_CALC_OR_NOISE_LINE_RX.test(line)) continue;

    const lineHits: Array<{ airlineCode: string; flightNumber: string }> = [];
    for (const m of line.matchAll(bareCarrierRx)) {
      const end = (m.index ?? 0) + m[0].length;
      if (nonFlightTrailingRx.test(line.slice(end))) continue;
      const ac = m[1].toUpperCase();
      const fn = `${ac} ${m[2]}`;
      if (!lineHits.some((h) => h.flightNumber === fn)) {
        lineHits.push({ airlineCode: ac, flightNumber: fn });
      }
    }

    if (lineHits.length === 0) {
      for (const m of line.matchAll(explicitFlightRx)) {
        const end = (m.index ?? 0) + m[0].length;
        if (nonFlightTrailingRx.test(line.slice(end))) continue;
        const ac = m[1].toUpperCase();
        const fn = `${ac} ${m[2]}`;
        if (!lineHits.some((h) => h.flightNumber === fn)) {
          lineHits.push({ airlineCode: ac, flightNumber: fn });
        }
      }
    }

    for (const hit of lineHits) {
      anchors.push({ lineIdx: i, ...hit });
    }
  }

  return anchors;
}

function extractMultiLegFlights(
  rawText: string,
  lines: string[],
  defaultCabin: string,
  today: string
): ParsedFlightLeg[] {
  // Determine document issueDate & referenceYear once for year-less leg dates
  let issueDate: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (ISSUE_METADATA_DATE_RX.test(lines[i])) {
      issueDate =
        parseDateFromString(lines[i]) ??
        (i + 1 < lines.length ? parseDateFromString(lines[i + 1]) : null);
      if (issueDate) break;
    }
  }
  const yearMatch = issueDate?.slice(0, 4) ?? rawText.match(/\b(20\d{2})\b/)?.[1];
  const referenceYear = yearMatch ? parseInt(yearMatch, 10) : parseInt(today.slice(0, 4), 10);

  const isMetadataLine = (idx: number): boolean => {
    if (idx < 0 || idx >= lines.length) return true;
    if (ISSUE_METADATA_DATE_RX.test(lines[idx])) return true;
    if (
      idx > 0 &&
      ISSUE_METADATA_DATE_RX.test(lines[idx - 1]) &&
      !parseDateFromString(lines[idx - 1])
    ) {
      return true;
    }
    return false;
  };

  const anchors = findAllFlightSegmentAnchors(lines);
  if (anchors.length <= 1) {
    return [];
  }

  // Detect PDF card orientation so Leg k NEVER steals Leg k+1's route/date/time!
  // 1. INLINE: route sits on the same line as the flight number (e.g. "31 Oct  EY 217  22:00 BLR -> 00:50 AUH")
  // 2. HEADER_ABOVE: route/date/time sit ABOVE the flight number (common on Etihad/Amadeus stacked cards)
  // 3. FLIGHT_TOP: flight number sits at the top of the card, route/date/time sit BELOW it
  const inlineCount = anchors.filter((a) => Boolean(extractAirportRouteFromText(lines[a.lineIdx]))).length;
  let cardMode: 'inline' | 'header_above' | 'flight_top' = 'flight_top';

  if (inlineCount >= Math.ceil(anchors.length / 2)) {
    cardMode = 'inline';
  } else {
    const scoreSlice = (from: number, to: number): number => {
      if (from > to) return 0;
      const cleanLines: string[] = [];
      for (let i = from; i <= to; i++) {
        if (isMetadataLine(i) || SECTION_SUMMARY_LINE_RX.test(lines[i])) continue;
        cleanLines.push(lines[i]);
      }
      if (cleanLines.length === 0) return 0;
      const joined = cleanLines.join('\n');
      let score = 0;
      if (extractAirportRouteFromText(joined)) score += 3;
      if (cleanLines.some((l) => Boolean(parseClockTimeHm(l)))) score += 2;
      if (cleanLines.some((l) => Boolean(parseDateFromString(l)))) score += 1;
      return score;
    };

    const a0 = anchors[0].lineIdx;
    const a1 = anchors[1].lineIdx;
    // Check lines directly above anchor 0 (capped at 4 lines) vs lines directly below anchor 0 (before divider or anchor 1)
    let belowLimit = Math.min(a1 - 1, a0 + 4);
    for (let i = a0 + 1; i <= belowLimit; i++) {
      if (SEGMENT_DIVIDER_RX.test(lines[i]) || SECTION_SUMMARY_LINE_RX.test(lines[i])) {
        belowLimit = i - 1;
        break;
      }
    }
    const aboveScore = scoreSlice(Math.max(0, a0 - 4), a0 - 1);
    const belowScore = scoreSlice(a0 + 1, belowLimit);
    cardMode = aboveScore > belowScore ? 'header_above' : 'flight_top';
  }

  // Partition exclusive, non-overlapping [zoneStart, zoneEnd] boundaries for every anchor
  const zones: Array<{ start: number; end: number }> = anchors.map((anchor, k) => {
    const prevIdx = k > 0 ? anchors[k - 1].lineIdx : -1;
    const nextIdx = k + 1 < anchors.length ? anchors[k + 1].lineIdx : lines.length;

    if (cardMode === 'inline') {
      // Check for an explicit divider between anchors, else stay tightly scoped around anchor line
      let zStart = Math.max(prevIdx + 1, anchor.lineIdx - 1);
      let zEnd = Math.min(nextIdx - 1, anchor.lineIdx + 1);
      // Never overlap with previous anchor's end
      if (k > 0) {
        const mid = Math.floor((prevIdx + anchor.lineIdx) / 2);
        zStart = Math.max(zStart, mid + 1);
      }
      if (k + 1 < anchors.length) {
        const mid = Math.floor((anchor.lineIdx + nextIdx) / 2);
        zEnd = Math.min(zEnd, mid);
      }
      return { start: Math.min(zStart, anchor.lineIdx), end: Math.max(zEnd, anchor.lineIdx) };
    }

    if (cardMode === 'header_above') {
      // Card info sits ABOVE anchor.lineIdx; stop strictly at anchor.lineIdx (plus optional 1 metadata-only line if no route yet)
      let zStart = Math.max(prevIdx + 1, anchor.lineIdx - 5);
      // If there's a layover/return divider between prevIdx and anchor.lineIdx, start right after it
      for (let i = anchor.lineIdx - 1; i >= zStart; i--) {
        if (SEGMENT_DIVIDER_RX.test(lines[i])) {
          zStart = i + 1;
          break;
        }
      }
      return { start: Math.min(zStart, anchor.lineIdx), end: anchor.lineIdx };
    }

    // cardMode === 'flight_top': Card info sits AT/BELOW anchor.lineIdx; stop before next card's header or divider
    let zEnd = Math.min(nextIdx - 1, anchor.lineIdx + 5);
    for (let i = anchor.lineIdx + 1; i <= zEnd; i++) {
      if (
        SEGMENT_DIVIDER_RX.test(lines[i]) ||
        SECTION_SUMMARY_LINE_RX.test(lines[i]) ||
        ITINERARY_FOOTER_HEADER_RX.test(lines[i])
      ) {
        zEnd = i - 1;
        break;
      }
    }
    return { start: anchor.lineIdx, end: Math.max(zEnd, anchor.lineIdx) };
  });

  const legs: ParsedFlightLeg[] = [];
  const seenKey = new Set<string>();
  const seenFlightNumsWithRoute = new Set<string>();
  let prevLegDate: string | null = null;

  for (let k = 0; k < anchors.length; k++) {
    const anchor = anchors[k];
    const { start: zoneStart, end: zoneEnd } = zones[k];

    const zoneLines: string[] = [];
    const nonHeaderZoneLines: string[] = [];
    for (let i = zoneStart; i <= zoneEnd; i++) {
      if (isMetadataLine(i)) continue;
      zoneLines.push(lines[i]);
      if (!SECTION_SUMMARY_LINE_RX.test(lines[i])) {
        nonHeaderZoneLines.push(lines[i]);
      }
    }

    const selfText = lines[anchor.lineIdx];
    const cleanZoneText = nonHeaderZoneLines.join('\n');
    const fullZoneText = zoneLines.join('\n');

    // Prefer route on anchor line itself, then non-section-header zone lines, then full zone
    const route =
      extractAirportRouteFromText(selfText) ??
      extractAirportRouteFromText(cleanZoneText) ??
      extractAirportRouteFromText(fullZoneText);

    // Skip repeated mentions of an already-parsed flight (e.g. in a baggage allowance table)
    if (!route && seenFlightNumsWithRoute.has(anchor.flightNumber)) {
      continue;
    }

    const originIata = route?.originIata ?? 'TBD';
    const destIata = route?.destIata ?? 'TBD';

    // Scan zone TOP-TO-BOTTOM so Departure Date always beats Arrival Date (+1 day)!
    const dateCandidates = nonHeaderZoneLines.length > 0 ? nonHeaderZoneLines : zoneLines;
    let legDate: string | null = null;
    for (const line of dateCandidates) {
      const full = parseDateFromString(line);
      if (full) {
        legDate = full;
        break;
      }
    }
    if (!legDate) {
      const minDate = prevLegDate ?? issueDate;
      for (const line of dateCandidates) {
        const dm = parseDayMonthWithYear(line, referenceYear, minDate);
        if (dm) {
          legDate = dm;
          break;
        }
      }
    }
    const finalDate: string = legDate ?? prevLegDate ?? issueDate ?? today;

    // Extract departure time (HH:MM) for this specific leg
    const departureTimeHm = extractDepartureTimeHm(dateCandidates, originIata);

    // Deduplicate identical flight segments repeated across itinerary + receipt summary sections
    const dedupKey = `${anchor.flightNumber}|${originIata}|${destIata}`;
    if (seenKey.has(dedupKey)) continue;
    if (!route && legs.some((l) => l.originIata !== 'TBD' && l.destIata !== 'TBD')) {
      continue;
    }

    const seatMatch = fullZoneText.match(/\bseat[\s:#-]*(\d{1,2}[A-K])\b/i);
    const leg = buildParsedFlightLeg(
      anchor.airlineCode,
      anchor.flightNumber,
      originIata,
      destIata,
      finalDate,
      defaultCabin,
      seatMatch ? seatMatch[1].toUpperCase() : undefined,
      departureTimeHm
    );

    seenKey.add(dedupKey);
    if (route) seenFlightNumsWithRoute.add(anchor.flightNumber);
    prevLegDate = finalDate;
    legs.push(leg);
    if (legs.length >= 8) break;
  }

  return legs.length >= 2 ? legs : [];
}

/**
 * Formats multi-leg chains concisely:
 * e.g. [BLR->AUH, AUH->ZRH, FRA->AUH, AUH->BLR] => "BLR → AUH → ZRH • FRA → AUH → BLR"
 */
export function formatFlightItinerarySummary(legs: ParsedFlightLeg[]): string {
  if (legs.length === 0) return '';
  const chains: string[][] = [];
  for (const leg of legs) {
    const lastChain = chains[chains.length - 1];
    if (
      lastChain &&
      lastChain[lastChain.length - 1] === leg.originIata &&
      leg.originIata !== 'TBD'
    ) {
      lastChain.push(leg.destIata);
    } else {
      chains.push([leg.originIata, leg.destIata]);
    }
  }
  return chains.map((c) => c.join(' → ')).join(' • ');
}

/**
 * Infers the primary trip destination airport from multi-leg flights so auto-created trips
 * pick the actual destination (e.g. ZRH) instead of a short layover hub (e.g. AUH).
 */
export function inferPrimaryDestinationFromLegs(legs: ParsedFlightLeg[]): string {
  if (legs.length === 0) return 'TBD';
  if (legs.length === 1) return legs[0].destIata;

  let bestIata = legs[legs.length - 1].destIata;
  let maxGapDays = -1;

  for (let i = 0; i < legs.length - 1; i++) {
    const cur = legs[i];
    const next = legs[i + 1];
    if (cur.destIata === 'TBD') continue;
    const t1 = new Date(`${cur.flightDate}T00:00:00Z`).getTime();
    const t2 = new Date(`${next.flightDate}T00:00:00Z`).getTime();
    const gapDays =
      !Number.isNaN(t1) && !Number.isNaN(t2) ? Math.max(0, Math.round((t2 - t1) / 86400000)) : 0;
    // Open-jaw break (arriving ZRH, departing FRA later) or multi-day turnaround stay beats same-day layover hub
    const openJawBonus = cur.destIata !== next.originIata ? 2 : 0;
    const score = gapDays + openJawBonus;
    if (gapDays >= 2 || (cur.destIata !== next.originIata && gapDays >= 1)) {
      if (score > maxGapDays) {
        maxGapDays = score;
        bestIata = cur.destIata;
      }
    }
  }

  return bestIata;
}

function parseFlightConfirmationOcr(
  rawText: string,
  currency: string,
  totalAmount: number,
  imageUri?: string
): ParsedBoardingPass {
  const today = new Date().toISOString().slice(0, 10);
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // PNR / Booking Reference (5–8 alphanumeric chars)
  const pnrMatch = rawText.match(
    /(?:\bpnr\b|\bbooking\s*ref(?:erence)?\b|\brecord\s*locator\b|\bconfirmation\s*(?:code|no\.?|number|#)?\b|\bref(?:erence)?\s*(?:code|no\.?|#)\b)\s*(?:\([^)]*\))?[\s:#-]*([A-Z0-9]{5,8})\b/i
  );
  const pnr = pnrMatch ? pnrMatch[1].toUpperCase() : '';

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

  // Try multi-leg extraction first (round-trips, 1-stop connections, open-jaw itineraries)
  const multiLegs = extractMultiLegFlights(rawText, lines, cabinClass, today);
  if (multiLegs.length >= 2) {
    const first = multiLegs[0];
    return {
      kind: 'boarding_pass',
      source: 'ocr',
      passengerName,
      pnr,
      originIata: first.originIata,
      destIata: first.destIata,
      airlineCode: first.airlineCode,
      airlineName: first.airlineName,
      flightNumber: first.flightNumber,
      flightDate: first.flightDate,
      departureTimeHm: first.departureTimeHm,
      cabinClass,
      seat: first.seat ?? '',
      distanceMiles: first.distanceMiles,
      estimatedDurationMin: first.estimatedDurationMin,
      loyaltyProgram: first.loyaltyProgram,
      rawBarcode: '',
      ticketAmount: totalAmount > 0 ? totalAmount : undefined,
      ticketCurrency: totalAmount > 0 ? currency : undefined,
      legs: multiLegs,
      rawText,
      imageUri,
    };
  }

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

  // Seat
  const seatMatch = rawText.match(/\bseat[\s:#-]*(\d{1,2}[A-K])\b/i);
  const seat = seatMatch ? seatMatch[1].toUpperCase() : '';

  const flightDate = extractFlightDepartureDate(rawText, lines, flightNumber, originIata, today);
  const departureTimeHm = extractDepartureTimeHm(lines, originIata);

  const singleLeg = buildParsedFlightLeg(
    airlineCode,
    flightNumber,
    originIata,
    destIata,
    flightDate,
    cabinClass,
    seat,
    departureTimeHm
  );

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
    departureTimeHm,
    cabinClass,
    seat,
    distanceMiles,
    estimatedDurationMin,
    loyaltyProgram: airlineInfo.loyaltyProgram,
    rawBarcode: '',
    ticketAmount: totalAmount > 0 ? totalAmount : undefined,
    ticketCurrency: totalAmount > 0 ? currency : undefined,
    legs: [singleLeg],
    rawText,
    imageUri,
  };
}

export function parseDocumentOcrText(
  rawText: string,
  defaultCurrency = 'USD',
  imageUri?: string,
  forceKind?: 'flight' | 'transport' | 'hotel' | 'receipt'
): ScanResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const { amount: totalAmount, currency } = extractTotalWithCurrency(rawText, defaultCurrency);
  const today = new Date().toISOString().slice(0, 10);

  const hasExplicitHotelStay =
    /check[\s-]?out/i.test(rawText) && /\b\d+\s*nights?\b/i.test(rawText);
  const hasExplicitRailOrCarHeader =
    /\b(?:irctc|indian\s*railways|sbb\s*cff|train\s*no\.?|train\s*number|car\s*rental|rental\s*agreement|pick[\s-]?up\s*location)\b/i.test(
      rawText
    );

  // Evaluate Flight BEFORE Hotel/Transport when strong aviation signals exist
  // (unless the document is clearly a hotel stay with Check-out + Nights or an explicit train/car rental).
  const isFlight =
    forceKind === 'flight' ||
    (!forceKind &&
      !hasExplicitHotelStay &&
      !hasExplicitRailOrCarHeader &&
      isFlightConfirmationText(rawText));

  const isHotel =
    forceKind === 'hotel' ||
    (!forceKind && !isFlight && isHotelConfirmationText(rawText));

  const isTransport =
    forceKind === 'transport' ||
    (!forceKind && !isFlight && !isHotel && isTransportConfirmationText(rawText));

  if (isTransport) {
    return parseTransportConfirmationOcr(rawText, currency, totalAmount, imageUri);
  }

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
