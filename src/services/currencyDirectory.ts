import { Flight, Trip, TripStop, TransportLeg } from '../types/models';
import { deriveTripGeography } from './travelGeography';

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  keywords: string;
}

/**
 * Curated global currency directory for instant 1-tap chips and live search
 * across Smart Magic Scan and manual Spend / Stay / Transport forms.
 */
export const CURRENCY_DIRECTORY: CurrencyInfo[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', keywords: 'india rupee rs inr' },
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', keywords: 'usa united states dollar usd' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', keywords: 'europe euro eur italy france germany spain portugal netherlands austria greece' },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧', keywords: 'uk britain england london pound sterling gbp' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', flag: '🇨🇭', keywords: 'switzerland swiss franc sfr chf' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Złoty', flag: '🇵🇱', keywords: 'poland polish zloty zl pln warsaw krakow' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', keywords: 'japan japanese yen jpy tokyo kyoto' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', flag: '🇦🇪', keywords: 'uae dubai abu dhabi dirham dhs aed' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬', keywords: 'singapore dollar sgd' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', flag: '🇹🇭', keywords: 'thailand thai baht thb bangkok phuket' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', keywords: 'australia australian dollar aud' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦', keywords: 'canada canadian dollar cad' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', flag: '🇳🇿', keywords: 'new zealand kiwi dollar nzd' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', flag: '🇰🇷', keywords: 'korea korean won krw seoul' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', flag: '🇭🇰', keywords: 'hong kong dollar hkd' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', flag: '🇲🇾', keywords: 'malaysia ringgit rm myr kuala lumpur' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', flag: '🇮🇩', keywords: 'indonesia bali rupiah rp idr' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', flag: '🇻🇳', keywords: 'vietnam dong vnd hanoi saigon' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', flag: '🇵🇭', keywords: 'philippines peso php manila' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳', keywords: 'china yuan renminbi rmb cny' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar', flag: '🇹🇼', keywords: 'taiwan dollar twd taipei' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', flag: '🇨🇿', keywords: 'czech prague koruna kc czk' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', flag: '🇭🇺', keywords: 'hungary budapest forint huf' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', flag: '🇸🇪', keywords: 'sweden stockholm krona sek' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', flag: '🇳🇴', keywords: 'norway oslo krone nok' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', flag: '🇩🇰', keywords: 'denmark copenhagen krone dkk' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', flag: '🇹🇷', keywords: 'turkey turkiye istanbul lira try' },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna', flag: '🇮🇸', keywords: 'iceland reykjavik krona isk' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu', flag: '🇷🇴', keywords: 'romania bucharest leu ron' },
  { code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal', flag: '🇶🇦', keywords: 'qatar doha riyal qar' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦', keywords: 'saudi arabia riyadh riyal sar' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani Rial', flag: '🇴🇲', keywords: 'oman muscat rial omr' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', flag: '🇱🇰', keywords: 'sri lanka colombo rupee lkr' },
  { code: 'NPR', symbol: 'Rs', name: 'Nepalese Rupee', flag: '🇳🇵', keywords: 'nepal kathmandu rupee npr' },
  { code: 'MVR', symbol: 'Rf', name: 'Maldivian Rufiyaa', flag: '🇲🇻', keywords: 'maldives male rufiyaa mvr' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', flag: '🇲🇽', keywords: 'mexico peso mxn cancun' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷', keywords: 'brazil rio real brl' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', flag: '🇿🇦', keywords: 'south africa cape town rand zar' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', flag: '🇪🇬', keywords: 'egypt cairo pound egp' },
  { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham', flag: '🇲🇦', keywords: 'morocco marrakech dirham mad' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel', flag: '🇮🇱', keywords: 'israel tel aviv shekel ils' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', flag: '🇰🇪', keywords: 'kenya nairobi shilling kes' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol', flag: '🇵🇪', keywords: 'peru lima cusco sol pen' },
  { code: 'COP', symbol: 'COP', name: 'Colombian Peso', flag: '🇨🇴', keywords: 'colombia bogota peso cop' },
];

export const CURRENCY_BY_CODE: Record<string, CurrencyInfo> = Object.fromEntries(
  CURRENCY_DIRECTORY.map((c) => [c.code, c])
);

/**
 * ISO-2 Country code -> Primary local ISO-4217 currency code.
 */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // Eurozone
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR',
  FI: 'EUR', FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR',
  LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR',
  SI: 'EUR', SK: 'EUR', AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR',
  ME: 'EUR', XK: 'EUR',
  // Non-Euro Europe
  CH: 'CHF', LI: 'CHF', GB: 'GBP', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', IS: 'ISK', TR: 'TRY', RO: 'RON',
  // South & Southeast & East Asia
  IN: 'INR', JP: 'JPY', SG: 'SGD', TH: 'THB', MY: 'MYR', ID: 'IDR',
  VN: 'VND', PH: 'PHP', KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD',
  LK: 'LKR', NP: 'NPR', MV: 'MVR',
  // Middle East
  AE: 'AED', QA: 'QAR', SA: 'SAR', OM: 'OMR', IL: 'ILS',
  // Americas & Oceania & Africa
  US: 'USD', PR: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', PE: 'PEN', CO: 'COP',
  AU: 'AUD', NZ: 'NZD', ZA: 'ZAR', EG: 'EGP', MA: 'MAD', KE: 'KES',
};

export function getCurrencyForCountry(iso2?: string | null): string | null {
  const code = (iso2 || '').trim().toUpperCase();
  if (!code || code.length !== 2) return null;
  return COUNTRY_TO_CURRENCY[code] ?? null;
}

export function getCurrenciesForCountries(countryCodes: string[]): string[] {
  const out: string[] = [];
  for (const iso of countryCodes) {
    const curr = getCurrencyForCountry(iso);
    if (curr && !out.includes(curr)) {
      out.push(curr);
    }
  }
  return out;
}

/**
 * Returns the distinct local currencies spanned by a trip (e.g. ['INR'] for Mysore,
 * ['EUR', 'PLN', 'CHF'] for a multi-country Europe trip).
 */
export function resolveTripCurrencies(
  trip: Trip | undefined | null,
  flights: Flight[],
  transports: TransportLeg[],
  stops: TripStop[]
): string[] {
  if (!trip) return [];
  const geo = deriveTripGeography(trip, flights, transports, stops);
  const visitedCodes = geo.visitedCountries.map((c) => c.code);
  const currencies = getCurrenciesForCountries(visitedCodes);
  if (currencies.length > 0) return currencies;

  // Fallback to trip-level countryCode when no flights/stops have been logged yet
  const fromTrip = getCurrencyForCountry(trip.countryCode);
  return fromTrip ? [fromTrip] : [];
}

/**
 * Resolves the smart default currency for a scanned document:
 * 1. If OCR detected a currency with high confidence -> use it.
 * 2. Else if the assigned trip has exactly 1 destination currency -> use that trip's currency.
 * 3. Else if the assigned trip spans 2+ currencies (multi-currency trip) -> return ''
 *    and flag `needsManualPick: true` so the user taps the right currency instead of guessing.
 * 4. Else (no trip country resolved yet) -> fall back to homeCurrency.
 */
export function resolveSmartScanCurrency(params: {
  ocrCurrency: string | null;
  ocrConfident: boolean;
  tripCurrencies: string[];
  homeCurrency: string;
}): { currency: string; needsManualPick: boolean } {
  const { ocrCurrency, ocrConfident, tripCurrencies, homeCurrency } = params;
  if (ocrConfident && ocrCurrency && ocrCurrency.trim().length === 3) {
    return { currency: ocrCurrency.trim().toUpperCase(), needsManualPick: false };
  }
  if (tripCurrencies.length === 1) {
    return { currency: tripCurrencies[0], needsManualPick: false };
  }
  if (tripCurrencies.length > 1) {
    return { currency: '', needsManualPick: true };
  }
  return { currency: (homeCurrency || 'USD').toUpperCase(), needsManualPick: false };
}

/**
 * Builds ranked 1-tap currency suggestions:
 * trip currencies first -> home currency -> common travel currencies.
 */
export function buildSuggestedCurrencies(
  tripCurrencies: string[] = [],
  homeCurrency?: string,
  maxChips = 6
): CurrencyInfo[] {
  const codes: string[] = [];
  const push = (c?: string) => {
    const clean = (c || '').trim().toUpperCase();
    if (clean.length === 3 && !codes.includes(clean)) {
      codes.push(clean);
    }
  };

  for (const tc of tripCurrencies) push(tc);
  push(homeCurrency);
  for (const fallback of ['USD', 'EUR', 'INR', 'GBP', 'JPY', 'CHF', 'AED']) {
    if (codes.length >= maxChips) break;
    push(fallback);
  }

  return codes.slice(0, maxChips).map(
    (code) =>
      CURRENCY_BY_CODE[code] ?? {
        code,
        symbol: code,
        name: code,
        flag: '💱',
        keywords: code.toLowerCase(),
      }
  );
}

/**
 * Live search across global currencies by ISO code, currency name, symbol, or country.
 */
export function searchCurrencies(
  query: string,
  prioritizedCodes: string[] = [],
  maxResults = 6
): CurrencyInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return buildSuggestedCurrencies(prioritizedCodes, undefined, maxResults);
  }

  const prioritySet = new Set(prioritizedCodes.map((c) => c.toUpperCase()));
  const scored: Array<{ info: CurrencyInfo; score: number }> = [];

  for (const info of CURRENCY_DIRECTORY) {
    const codeLower = info.code.toLowerCase();
    const nameLower = info.name.toLowerCase();
    const symLower = info.symbol.toLowerCase();
    let score = 0;

    if (codeLower === q) score = 100;
    else if (codeLower.startsWith(q)) score = 80;
    else if (symLower === q) score = 75;
    else if (nameLower.startsWith(q)) score = 60;
    else if (nameLower.includes(q) || info.keywords.includes(q)) score = 40;

    if (score > 0) {
      if (prioritySet.has(info.code)) score += 15;
      scored.push({ info, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.info.code.localeCompare(b.info.code));
  return scored.slice(0, maxResults).map((s) => s.info);
}
