import {
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  lookupAirline,
  lookupAirport,
} from '../db/airportsData';
import { ExpenseCategory, ScanResult } from '../types/models';
import { parseDocumentOcrText } from './ocrParser';

export interface AiExtractionOutcome {
  result: ScanResult;
  source: 'ai' | 'offline_fallback';
}

const VALID_CATEGORIES = new Set<ExpenseCategory>([
  'flights',
  'lodging',
  'dining',
  'transit',
  'fuel',
  'activities',
  'shopping',
  'other',
]);

/**
 * Optional Phase-2 1-tap AI Clean for messy / multi-column / foreign-language
 * receipts & booking confirmations.
 *
 * Strictly opt-in (only runs when the user taps "🪄 AI Clean" on the Review card).
 * Calls Supabase Edge Function `parse-travel-doc` (Gemini Flash JSON mode) and
 * falls back cleanly to offline heuristics if offline or cloud AI is not configured.
 */
export async function extractDocumentWithAi(
  rawText: string,
  defaultCurrency = 'USD',
  imageUri?: string,
  preferredKind?: 'flight' | 'transport' | 'hotel' | 'receipt'
): Promise<AiExtractionOutcome> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnon && rawText.trim().length >= 8) {
    try {
      let token: string | undefined;
      try {
        // Lazy require keeps Jest Node tests free of Expo native auth ESM imports
        const { getSupabaseClient } = require('./authService') as {
          getSupabaseClient: () => {
            auth: { getSession: () => Promise<{ data: { session?: { access_token?: string } } }> };
          } | null;
        };
        const sb = getSupabaseClient();
        if (sb) {
          const { data } = await sb.auth.getSession();
          token = data.session?.access_token;
        }
      } catch {
        // Proceed without user JWT if unavailable
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);

      const res = await fetch(`${supabaseUrl}/functions/v1/parse-travel-doc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnon,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rawText: rawText.slice(0, 6000),
          defaultCurrency,
          preferredKind,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        const mapped = mapAiJsonToScanResult(json, rawText, defaultCurrency, imageUri);
        if (mapped) {
          return { result: mapped, source: 'ai' };
        }
      }
    } catch {
      // Gracefully fall back to offline parser
    }
  }

  return {
    result: parseDocumentOcrText(rawText, defaultCurrency, imageUri, preferredKind),
    source: 'offline_fallback',
  };
}

/**
 * Pure validator/mapper converting structured AI JSON into a safe, strongly-typed ScanResult.
 */
export function mapAiJsonToScanResult(
  raw: unknown,
  rawText: string,
  defaultCurrency: string,
  imageUri?: string
): ScanResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const today = new Date().toISOString().slice(0, 10);
  const isoDate = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : fallback;
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const curr = (v: unknown) =>
    typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim())
      ? v.trim().toUpperCase()
      : defaultCurrency;

  if (obj.kind === 'flight' || obj.kind === 'boarding_pass') {
    const originIata = String(obj.originIata || 'TBD').trim().toUpperCase().slice(0, 3);
    const destIata = String(obj.destIata || 'TBD').trim().toUpperCase().slice(0, 3);
    const flightNumber = String(obj.flightNumber || 'FL Flight').trim().toUpperCase();
    const acMatch = flightNumber.match(/^([A-Z0-9]{2})/);
    const airlineCode = String(obj.airlineCode || acMatch?.[1] || 'FL').toUpperCase();
    const airlineInfo = lookupAirline(airlineCode);
    const o = lookupAirport(originIata);
    const d = lookupAirport(destIata);
    const distanceMiles = o && d ? calculateDistanceMiles(o.lat, o.lng, d.lat, d.lng) : 0;
    const ticketAmount = num(obj.ticketAmount);

    return {
      kind: 'boarding_pass',
      source: 'ocr',
      passengerName: String(obj.passengerName || 'Traveler').trim(),
      pnr: String(obj.pnr || '').trim().toUpperCase(),
      originIata,
      destIata,
      airlineCode: airlineInfo.code,
      airlineName: airlineInfo.name,
      flightNumber,
      flightDate: isoDate(obj.flightDate, today),
      cabinClass: String(obj.cabinClass || 'Economy').trim(),
      seat: String(obj.seat || '').trim().toUpperCase(),
      distanceMiles,
      estimatedDurationMin:
        distanceMiles > 0 ? estimateFlightDurationMinutes(distanceMiles) : 120,
      loyaltyProgram: airlineInfo.loyaltyProgram,
      rawBarcode: '',
      ticketAmount: ticketAmount > 0 ? ticketAmount : undefined,
      ticketCurrency: ticketAmount > 0 ? curr(obj.ticketCurrency) : undefined,
      rawText,
      imageUri,
    };
  }

  if (obj.kind === 'transport') {
    const validModes = new Set(['train', 'bus', 'ferry', 'rental_car']);
    const rawMode = String(obj.mode || 'train').toLowerCase();
    const mode = (validModes.has(rawMode) ? rawMode : 'train') as
      | 'train'
      | 'bus'
      | 'ferry'
      | 'rental_car';
    return {
      kind: 'transport',
      mode,
      operatorName: String(obj.operatorName || 'Transit').trim(),
      origin: String(obj.origin || 'Origin').trim(),
      destination: String(obj.destination || 'Destination').trim(),
      startDate: isoDate(obj.startDate, today),
      endDate: obj.endDate ? isoDate(obj.endDate, today) : undefined,
      referenceCode: obj.referenceCode ? String(obj.referenceCode).trim().toUpperCase() : undefined,
      seatOrVehicle: obj.seatOrVehicle ? String(obj.seatOrVehicle).trim() : undefined,
      totalAmount: num(obj.totalAmount),
      currency: curr(obj.currency),
      rawText,
      imageUri,
    };
  }

  if (obj.kind === 'hotel') {
    const checkIn = isoDate(obj.checkIn, today);
    const checkOut = isoDate(obj.checkOut, checkIn);
    const computedNights = Math.max(
      1,
      Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
    );
    const nights = num(obj.nights) > 0 ? Math.round(num(obj.nights)) : computedNights;

    return {
      kind: 'hotel',
      hotelName: String(obj.hotelName || 'Scanned Stay').trim(),
      confirmationCode: obj.confirmationCode ? String(obj.confirmationCode).trim() : undefined,
      checkIn,
      checkOut,
      nights,
      totalAmount: num(obj.totalAmount),
      currency: curr(obj.currency),
      address: obj.address ? String(obj.address).trim() : undefined,
      cityHint: obj.cityHint ? String(obj.cityHint).trim() : undefined,
      rawText,
      imageUri,
    };
  }

  if (obj.kind === 'receipt') {
    const catRaw = String(obj.category || 'dining').toLowerCase() as ExpenseCategory;
    const category: ExpenseCategory = VALID_CATEGORIES.has(catRaw) ? catRaw : 'dining';
    return {
      kind: 'receipt',
      merchant: String(obj.merchant || 'Scanned Expense').trim(),
      amount: num(obj.amount),
      currency: curr(obj.currency),
      date: isoDate(obj.date, today),
      category,
      rawText,
      imageUri,
    };
  }

  return null;
}
