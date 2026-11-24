import {
  Expense,
  ExpenseCategory,
  Stay,
  TransportLeg,
} from '../types/models';
import { convertCurrency, DEFAULT_USD_RATES, FxRatesMap } from './fxService';

export interface SpendLedgerItem {
  id: string;
  source: 'expense' | 'transport' | 'stay';
  tripId: string;
  title: string;
  category: ExpenseCategory;
  date: string; // YYYY-MM-DD
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  preferredCurrency: string;
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

/**
 * Builds a unified multi-currency spend ledger for a trip by combining:
 * - Expenses (manual spend, scanned receipts, flight fares)
 * - Priced ground/sea Transports (trains, buses, ferries, car rentals)
 * - Priced Stays (hotels, Airbnbs, resorts)
 *
 * Every item retains its original payment currency and is converted live into the user's
 * current preferredCurrency using fxRates (zero double-counting, instant currency switching).
 */
export function buildTripSpendLedger(input: {
  expenses: Expense[];
  transports: TransportLeg[];
  stays: Stay[];
  preferredCurrency: string;
  fallbackCurrency?: string;
  fxRates?: FxRatesMap;
}): TripSpendLedger {
  const preferred = (input.preferredCurrency || input.fallbackCurrency || 'USD')
    .trim()
    .toUpperCase();
  const fallback = (input.fallbackCurrency || preferred).trim().toUpperCase();
  const rates = input.fxRates ?? DEFAULT_USD_RATES;

  const items: SpendLedgerItem[] = [];

  for (const e of input.expenses) {
    const origCurr = (e.localCurrency || e.homeCurrency || fallback).trim().toUpperCase();
    const origAmt = Number(e.localAmount ?? e.homeAmount ?? 0);
    const { amount: converted } = convertAmountToPreferred(origAmt, origCurr, preferred, rates);
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
    const { amount: converted } = convertAmountToPreferred(origAmt, origCurr, preferred, rates);
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
      isShared: false,
      subtitle: `${modeLabel} • ${t.origin} → ${t.destination}`,
    });
  }

  for (const s of input.stays) {
    const origAmt = Number(s.costCash ?? 0);
    if (origAmt <= 0) continue;
    const origCurr = (s.currency || fallback).trim().toUpperCase();
    const { amount: converted } = convertAmountToPreferred(origAmt, origCurr, preferred, rates);
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
