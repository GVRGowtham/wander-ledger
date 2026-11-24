export type FxRatesMap = Record<string, number>; // Base USD = 1.0
export type FxRateSnapshotsMap = Record<string, FxRatesMap>; // Keyed by YYYY-MM-DD

/**
 * Bundled offline fallback exchange rates (relative to 1 USD).
 * Automatically refreshed daily from the free Frankfurter (ECB) API when online.
 */
export const DEFAULT_USD_RATES: FxRatesMap = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.2,
  INR: 84.1,
  CHF: 0.88,
  AUD: 1.52,
  CAD: 1.38,
  SGD: 1.33,
  THB: 34.5,
  AED: 3.67,
  KRW: 1380.0,
  MXN: 19.8,
  NZD: 1.66,
};

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  usdRates: FxRatesMap = DEFAULT_USD_RATES
): { converted: number; rate: number } {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) {
    return { converted: roundTwo(amount), rate: 1 };
  }

  const fromRate = usdRates[from] ?? DEFAULT_USD_RATES[from] ?? 1;
  const toRate = usdRates[to] ?? DEFAULT_USD_RATES[to] ?? 1;

  // amount in USD = amount / fromRate; amount in target = (amount / fromRate) * toRate
  const rate = toRate / fromRate;
  const converted = roundTwo(amount * rate);
  return { converted, rate: Number(rate.toFixed(6)) };
}

function roundTwo(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Fetches fresh daily European Central Bank rates via the free, open-source Frankfurter API.
 * Gracefully falls back to cached/bundled rates when offline.
 */
export async function fetchLatestUsdRates(): Promise<{
  rates: FxRatesMap;
  source: 'live' | 'fallback';
  updatedAt: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.frankfurter.app/latest?from=USD', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
    if (data?.rates) {
      return {
        rates: { ...DEFAULT_USD_RATES, USD: 1.0, ...data.rates },
        source: 'live',
        updatedAt: data.date ?? new Date().toISOString().slice(0, 10),
      };
    }
  } catch {
    // Offline or timeout — silently return bundled fallback
  }

  return {
    rates: { ...DEFAULT_USD_RATES },
    source: 'fallback',
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Fetches historical European Central Bank rates for a specific past date (YYYY-MM-DD)
 * via the free Frankfurter API (weekends/holidays automatically snap to the prior business day).
 * Returns null if offline, timed out, or if dateYmd is invalid/in the future.
 */
export async function fetchHistoricalUsdRates(dateYmd: string): Promise<{
  rates: FxRatesMap;
  effectiveDate: string;
  source: 'live';
} | null> {
  const clean = (dateYmd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  if (clean < '1999-01-04') return null;

  const today = new Date().toISOString().slice(0, 10);
  if (clean > today) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5500);
    const url =
      clean === today
        ? 'https://api.frankfurter.app/latest?from=USD'
        : `https://api.frankfurter.app/${clean}?from=USD`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
    if (data?.rates) {
      return {
        rates: { ...DEFAULT_USD_RATES, USD: 1.0, ...data.rates },
        effectiveDate: data.date ?? clean,
        source: 'live',
      };
    }
  } catch {
    // Offline or timeout — caller keeps fallback/cached rates
  }
  return null;
}
