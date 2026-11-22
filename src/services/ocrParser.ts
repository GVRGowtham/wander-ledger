import {
  ExpenseCategory,
  ParsedHotelConfirmation,
  ParsedReceipt,
  ScanResult,
} from '../types/models';

const CURRENCY_PATTERNS: Array<{ regex: RegExp; code: string }> = [
  { regex: /¥|JPY/i, code: 'JPY' },
  { regex: /€|EUR/i, code: 'EUR' },
  { regex: /£|GBP/i, code: 'GBP' },
  { regex: /₹|INR|RS\.?/i, code: 'INR' },
  { regex: /CHF/i, code: 'CHF' },
  { regex: /₩|KRW/i, code: 'KRW' },
  { regex: /฿|THB/i, code: 'THB' },
  { regex: /S\$|SGD/i, code: 'SGD' },
  { regex: /A\$|AUD/i, code: 'AUD' },
  { regex: /C\$|CAD/i, code: 'CAD' },
  { regex: /AED/i, code: 'AED' },
  { regex: /\$|USD/i, code: 'USD' },
];

export function detectCurrency(text: string, fallback = 'USD'): string {
  for (const item of CURRENCY_PATTERNS) {
    if (item.regex.test(text)) {
      return item.code;
    }
  }
  return fallback;
}

function parseNumber(numStr: string): number {
  const cleaned = numStr.replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function extractTotalAmount(text: string): number {
  const lines = text.split(/\r?\n/);

  // 1. Prioritize lines mentioning TOTAL / AMOUNT PAID / GRAND TOTAL / BALANCE DUE
  const totalRegex =
    /(?:grand\s*total|total\s*paid|amount\s*paid|total|sum|balance\s*due|合計)[^\d¥$€£₹]*[¥$€£₹]?\s*([\d,]+(?:\.\d{1,2})?)/i;

  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(totalRegex);
    if (m && m[1]) {
      const val = parseNumber(m[1]);
      if (val > 0) return val;
    }
  }

  // 2. Fallback: largest currency-prefixed number in the document
  const moneyMatches = text.matchAll(/[¥$€£₹]\s*([\d,]+(?:\.\d{1,2})?)/g);
  let maxVal = 0;
  for (const m of moneyMatches) {
    const val = parseNumber(m[1]);
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
  const iso = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  // Oct 17, 2026 or 17 Oct 2026
  const namedFirst = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i
  );
  if (namedFirst) {
    const mon = MONTH_MAP[namedFirst[1].slice(0, 3).toLowerCase()];
    return `${namedFirst[3]}-${mon}-${namedFirst[2].padStart(2, '0')}`;
  }

  const dayFirst = text.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/i
  );
  if (dayFirst) {
    const mon = MONTH_MAP[dayFirst[2].slice(0, 3).toLowerCase()];
    return `${dayFirst[3]}-${mon}-${dayFirst[1].padStart(2, '0')}`;
  }

  return null;
}

export function inferExpenseCategory(text: string): ExpenseCategory {
  const q = text.toLowerCase();
  if (/(hotel|resort|inn|suites|ryokan|airbnb|check-in|nights)/.test(q)) return 'lodging';
  if (/(ramen|cafe|coffee|matcha|restaurant|bistro|bar|pizza|sushi|burger|bakery|dining|kitchen|grill|tavern|tea|gyoza)/.test(q)) {
    return 'dining';
  }
  if (/(shinkansen|train|metro|subway|uber|taxi|lyft|rail|transit|bus|jr\s|suica|pass|ferry)/.test(q)) {
    return 'transit';
  }
  if (/(airline|flight|airways|boarding|airport)/.test(q)) return 'flights';
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
    /reservation|booking\s*confirmed|confirmation\s*#?/,
    /hotel|resort|ryokan|suites|airbnb|hostel/,
  ].filter((r) => r.test(q)).length;
  return hits >= 2;
}

export function parseDocumentOcrText(
  rawText: string,
  defaultCurrency = 'USD',
  imageUri?: string
): ScanResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const currency = detectCurrency(rawText, defaultCurrency);
  const totalAmount = extractTotalAmount(rawText);
  const today = new Date().toISOString().slice(0, 10);

  if (isHotelConfirmationText(rawText)) {
    const checkInLine = lines.find((l) => /check[\s-]?in/i.test(l)) ?? '';
    const checkOutLine = lines.find((l) => /check[\s-]?out/i.test(l)) ?? '';
    const checkIn = parseDateFromString(checkInLine) ?? parseDateFromString(rawText) ?? today;
    const checkOut = parseDateFromString(checkOutLine) ?? addDays(checkIn, 2);

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
      rawText.match(/#([A-Z0-9-]{4,14})\b/i) ??
      rawText.match(
        /(?:confirmation|booking(?:\s+confirmed)?|ref(?:erence)?)\s*(?:no\.?|number|id|code|#|:)*\s*#?([A-Z0-9-]*\d[A-Z0-9-]{2,13})\b/i
      );
    const hotelNameLine =
      lines.find(
        (l) =>
          /(hotel|resort|ryokan|inn|suites|thousand|marriott|hilton|hyatt|airbnb|villa|house)/i.test(
            l
          ) && !/booking\s*confirmed/i.test(l)
      ) ??
      lines.find((l) => !/booking\s*confirmed|confirmation/i.test(l)) ??
      'Scanned Stay';

    const addressLine = lines.find((l) =>
      /(ward|street|st\.|ave|road|rd\.|ku,|kyoto|tokyo|lisbon|rome|address)/i.test(l)
    );

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

  lisbonCafe: `PASTEIS DE BELEM LISBOA
2026-05-06 09:15
Pastel de Nata x4   €5.60
Galao Coffee x2     €3.40
TOTAL               €9.00`,
};
