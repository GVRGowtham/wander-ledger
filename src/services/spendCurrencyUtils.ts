import {
  Expense,
  ExpenseCategory,
  Stay,
  TransportLeg,
} from '../types/models';
import {
  convertCurrency,
  DEFAULT_USD_RATES,
  FxRatesMap,
  FxRateSnapshotsMap,
} from './fxService';

export type SpendFxRateSource =
  | 'same_currency'
  | 'date_locked'
  | 'live_pending'
  | 'live_fallback';

export interface SpendLedgerItem {
  id: string;
  source: 'expense' | 'transport' | 'stay';
  tripId: string;
  title: string;
  category: ExpenseCategory;
  date: string; // YYYY-MM-DD (travel / receipt date)
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  preferredCurrency: string;
  fxDate?: string; // YYYY-MM-DD locked payment/booking rate date (undefined when payLater pending)
  payLater?: boolean;
  rateSource: SpendFxRateSource;
  fxRateUsed: number;
  isShared: boolean;
  authorName?: string;
  subtitle?: string;
  receiptUri?: string;
  receiptRawText?: string;
}

export interface TripSpendLedger {
  items: SpendLedgerItem[];
  totalSpentPreferred: number;
  categoryTotals: Record<string, number>;
  preferredCurrency: string;
}

const YMD_RX = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function normalizeYmdDate(input?: string | null): string | null {
  if (!input) return null;
  const sliced = String(input).trim().slice(0, 10);
  return YMD_RX.test(sliced) ? sliced : null;
}

export function getTodayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Smart default FX payment date:
 * 1. If an explicit past/today booking/issue date is known (e.g. airline e-ticket PDF), lock to that date.
 * 2. If the travel / receipt date is today or in the past (backfilling an old trip), lock to that date.
 * 3. If the travel date is in the future (paying today for a future flight/train/stay), lock to TODAY.
 */
export function resolveDefaultFxDate(
  travelDate?: string | null,
  todayYmd?: string,
  bookingDate?: string | null
): string {
  const today = normalizeYmdDate(todayYmd) ?? getTodayYmd();
  const cleanBooking = normalizeYmdDate(bookingDate);
  if (cleanBooking && cleanBooking <= today) {
    return cleanBooking;
  }
  const cleanTravel = normalizeYmdDate(travelDate);
  if (cleanTravel && cleanTravel <= today) {
    return cleanTravel;
  }
  return today;
}

/**
 * Resolves the effective FX rate date for an existing item:
 * - If payLater is true and travel date is still in the future -> use live rate (pending).
 * - If payLater is true and travel date has arrived/passed -> lock to travel date.
 * - If explicit fxDate is saved -> lock to fxDate.
 * - Legacy items (pre-v0.6.2 without fxDate): past travel dates lock to travelDate;
 *   future travel dates lock to createdAt date (or today).
 */
export function resolveItemFxRateDate(
  item: {
    date?: string | null;
    fxDate?: string | null;
    payLater?: boolean;
    createdAt?: string | null;
  },
  todayYmd?: string
): { fxDate: string | null; isLivePending: boolean } {
  const today = normalizeYmdDate(todayYmd) ?? getTodayYmd();
  const cleanTravel = normalizeYmdDate(item.date);

  if (item.payLater) {
    if (cleanTravel && cleanTravel > today) {
      return { fxDate: null, isLivePending: true };
    }
    return { fxDate: cleanTravel ?? today, isLivePending: false };
  }

  const cleanExplicit = normalizeYmdDate(item.fxDate);
  if (cleanExplicit) {
    return { fxDate: cleanExplicit, isLivePending: false };
  }

  if (cleanTravel && cleanTravel <= today) {
    return { fxDate: cleanTravel, isLivePending: false };
  }

  const cleanCreated = normalizeYmdDate(item.createdAt);
  if (cleanCreated && cleanCreated <= today) {
    return { fxDate: cleanCreated, isLivePending: false };
  }

  return { fxDate: today, isLivePending: false };
}

/**
 * Formats a YYYY-MM-DD rate date concisely for spend subtitles (e.g., "24 Nov" or "12 May '25").
 */
export function formatShortRateDate(ymd?: string | null, referenceYear?: number): string {
  const clean = normalizeYmdDate(ymd);
  if (!clean) return '';
  const year = parseInt(clean.slice(0, 4), 10);
  const monthIdx = parseInt(clean.slice(5, 7), 10) - 1;
  const day = parseInt(clean.slice(8, 10), 10);
  const mon = SHORT_MONTHS[monthIdx] ?? clean.slice(5, 7);
  const refYear = referenceYear ?? new Date().getFullYear();
  return year === refYear ? `${day} ${mon}` : `${day} ${mon} '${String(year).slice(-2)}`;
}

/**
 * Collects all unique historical/today FX rate dates needed across all expenses,
 * priced transports, and priced stays so AppContext can fetch & cache them once in SQLite.
 */
export function collectRequiredFxDates(input: {
  expenses: Expense[];
  transports: TransportLeg[];
  stays: Stay[];
  todayYmd?: string;
}): string[] {
  const today = normalizeYmdDate(input.todayYmd) ?? getTodayYmd();
  const dates = new Set<string>();

  for (const e of input.expenses) {
    const resolved = resolveItemFxRateDate(
      { date: e.expenseDate, fxDate: e.fxDate, payLater: e.payLater, createdAt: e.createdAt },
      today
    );
    if (resolved.fxDate && resolved.fxDate <= today) {
      dates.add(resolved.fxDate);
    }
  }

  for (const t of input.transports) {
    if (!t.costAmount || t.costAmount <= 0) continue;
    const resolved = resolveItemFxRateDate(
      { date: t.startDate, fxDate: t.fxDate, payLater: t.payLater, createdAt: t.createdAt },
      today
    );
    if (resolved.fxDate && resolved.fxDate <= today) {
      dates.add(resolved.fxDate);
    }
  }

  for (const s of input.stays) {
    if (!s.costCash || s.costCash <= 0) continue;
    const resolved = resolveItemFxRateDate(
      { date: s.checkIn, fxDate: s.fxDate, payLater: s.payLater, createdAt: s.createdAt },
      today
    );
    if (resolved.fxDate && resolved.fxDate <= today) {
      dates.add(resolved.fxDate);
    }
  }

  return Array.from(dates).sort();
}

export function convertAmountToPreferred(
  amount: number,
  fromCurrency: string | undefined | null,
  preferredCurrency: string,
  fxRates: FxRatesMap = DEFAULT_USD_RATES
): { amount: number; rate: number } {
  const cleanAmount = Number(amount || 0);
  const target = (preferredCurrency || 'USD').trim().toUpperCase();
  const source = (fromCurrency || target).trim().toUpperCase();
  if (!cleanAmount || source === target) {
    return { amount: Math.round(cleanAmount * 100) / 100, rate: 1 };
  }
  const { converted, rate } = convertCurrency(cleanAmount, source, target, fxRates);
  return { amount: converted, rate };
}

function convertWithHistoricalSnapshot(
  origAmt: number,
  origCurr: string,
  preferred: string,
  resolved: { fxDate: string | null; isLivePending: boolean },
  liveRates: FxRatesMap,
  fxSnapshots?: FxRateSnapshotsMap
): { converted: number; rate: number; rateSource: SpendFxRateSource } {
  if (origCurr === preferred) {
    return {
      converted: Math.round(origAmt * 100) / 100,
      rate: 1,
      rateSource: 'same_currency',
    };
  }

  if (resolved.isLivePending) {
    const { amount, rate } = convertAmountToPreferred(origAmt, origCurr, preferred, liveRates);
    return { converted: amount, rate, rateSource: 'live_pending' };
  }

  const snapshot = resolved.fxDate ? fxSnapshots?.[resolved.fxDate] : undefined;
  if (snapshot) {
    const { amount, rate } = convertAmountToPreferred(origAmt, origCurr, preferred, snapshot);
    return { converted: amount, rate, rateSource: 'date_locked' };
  }

  const { amount, rate } = convertAmountToPreferred(origAmt, origCurr, preferred, liveRates);
  return { converted: amount, rate, rateSource: 'live_fallback' };
}

/**
 * Builds a unified multi-currency spend ledger for a trip by combining:
 * - Expenses (manual spend, scanned receipts, flight fares)
 * - Priced ground/sea Transports (trains, buses, ferries, car rentals)
 * - Priced Stays (hotels, Airbnbs, resorts)
 *
 * Every item retains its original payment currency and converts using its date-locked
 * historical FX snapshot (from fxDate), or live rates if marked payLater for a future date.
 */
export function buildTripSpendLedger(input: {
  expenses: Expense[];
  transports: TransportLeg[];
  stays: Stay[];
  preferredCurrency: string;
  fallbackCurrency?: string;
  fxRates?: FxRatesMap;
  fxSnapshots?: FxRateSnapshotsMap;
  todayYmd?: string;
}): TripSpendLedger {
  const preferred = (input.preferredCurrency || input.fallbackCurrency || 'USD')
    .trim()
    .toUpperCase();
  const fallback = (input.fallbackCurrency || preferred).trim().toUpperCase();
  const liveRates = input.fxRates ?? DEFAULT_USD_RATES;
  const snapshots = input.fxSnapshots;
  const today = normalizeYmdDate(input.todayYmd) ?? getTodayYmd();

  const items: SpendLedgerItem[] = [];

  for (const e of input.expenses) {
    const origCurr = (e.localCurrency || e.homeCurrency || fallback).trim().toUpperCase();
    const origAmt = Number(e.localAmount ?? e.homeAmount ?? 0);
    const resolved = resolveItemFxRateDate(
      { date: e.expenseDate, fxDate: e.fxDate, payLater: e.payLater, createdAt: e.createdAt },
      today
    );
    const { converted, rate, rateSource } = convertWithHistoricalSnapshot(
      origAmt,
      origCurr,
      preferred,
      resolved,
      liveRates,
      snapshots
    );
    items.push({
      id: e.id,
      source: 'expense',
      tripId: e.tripId,
      title: e.merchant,
      category: e.category || 'other',
      date: (e.expenseDate || e.createdAt || '').slice(0, 10),
      originalAmount: origAmt,
      originalCurrency: origCurr,
      convertedAmount: converted,
      preferredCurrency: preferred,
      fxDate: resolved.fxDate ?? undefined,
      payLater: Boolean(e.payLater),
      rateSource,
      fxRateUsed: rate,
      isShared: Boolean(e.isShared),
      authorName: e.authorName,
      receiptUri: e.receiptUri,
      receiptRawText: e.receiptRawText,
    });
  }

  for (const t of input.transports) {
    const origAmt = Number(t.costAmount ?? 0);
    if (origAmt <= 0) continue;
    const origCurr = (t.currency || fallback).trim().toUpperCase();
    const resolved = resolveItemFxRateDate(
      { date: t.startDate, fxDate: t.fxDate, payLater: t.payLater, createdAt: t.createdAt },
      today
    );
    const { converted, rate, rateSource } = convertWithHistoricalSnapshot(
      origAmt,
      origCurr,
      preferred,
      resolved,
      liveRates,
      snapshots
    );
    const modeLabel =
      t.mode === 'train'
        ? '🚆 Train'
        : t.mode === 'bus'
          ? '🚌 Bus'
          : t.mode === 'ferry'
            ? '⛴️ Ferry'
            : t.mode === 'rental_car'
              ? '🚗 Rental'
              : '🚙 Car';
    items.push({
      id: t.id,
      source: 'transport',
      tripId: t.tripId,
      title: t.title || `${modeLabel} to ${t.destination}`,
      category: 'transit',
      date: (t.startDate || t.createdAt || '').slice(0, 10),
      originalAmount: origAmt,
      originalCurrency: origCurr,
      convertedAmount: converted,
      preferredCurrency: preferred,
      fxDate: resolved.fxDate ?? undefined,
      payLater: Boolean(t.payLater),
      rateSource,
      fxRateUsed: rate,
      isShared: false,
      subtitle: `${modeLabel} • ${t.origin} → ${t.destination}`,
    });
  }

  for (const s of input.stays) {
    const origAmt = Number(s.costCash ?? 0);
    if (origAmt <= 0) continue;
    const origCurr = (s.currency || fallback).trim().toUpperCase();
    const resolved = resolveItemFxRateDate(
      { date: s.checkIn, fxDate: s.fxDate, payLater: s.payLater, createdAt: s.createdAt },
      today
    );
    const { converted, rate, rateSource } = convertWithHistoricalSnapshot(
      origAmt,
      origCurr,
      preferred,
      resolved,
      liveRates,
      snapshots
    );
    items.push({
      id: s.id,
      source: 'stay',
      tripId: s.tripId,
      title: s.name,
      category: 'lodging',
      date: (s.checkIn || s.createdAt || '').slice(0, 10),
      originalAmount: origAmt,
      originalCurrency: origCurr,
      convertedAmount: converted,
      preferredCurrency: preferred,
      fxDate: resolved.fxDate ?? undefined,
      payLater: Boolean(s.payLater),
      rateSource,
      fxRateUsed: rate,
      isShared: false,
      subtitle: `🏨 ${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`,
      receiptUri: s.receiptUri,
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));

  const categoryTotals: Record<string, number> = {};
  let total = 0;
  for (const item of items) {
    total += item.convertedAmount;
    categoryTotals[item.category] =
      Math.round(((categoryTotals[item.category] ?? 0) + item.convertedAmount) * 100) / 100;
  }

  return {
    items,
    totalSpentPreferred: Math.round(total * 100) / 100,
    categoryTotals,
    preferredCurrency: preferred,
  };
}
