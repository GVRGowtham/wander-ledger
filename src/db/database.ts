import * as SQLite from 'expo-sqlite';
import {
  Expense,
  Flight,
  LoyaltyAccount,
  Memory,
  Stay,
  Trip,
  TripStatus,
  TripSummaryStats,
} from '../types/models';
import { DEFAULT_USD_RATES, FxRatesMap } from '../services/fxService';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('wanderledger_v1.db');
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db: SQLite.SQLiteDatabase): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      destination_city TEXT NOT NULL,
      destination_country TEXT NOT NULL,
      country_code TEXT NOT NULL,
      flag_emoji TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      home_currency TEXT NOT NULL DEFAULT 'USD',
      budget REAL NOT NULL DEFAULT 0,
      vibe TEXT NOT NULL DEFAULT 'city',
      cover_photo_uri TEXT,
      is_shared INTEGER NOT NULL DEFAULT 0,
      share_token TEXT,
      co_travelers TEXT NOT NULL DEFAULT '[]',
      lat REAL NOT NULL DEFAULT 0,
      lng REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS flights (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL,
      airline_code TEXT NOT NULL,
      airline_name TEXT NOT NULL,
      flight_number TEXT NOT NULL,
      pnr TEXT,
      origin_iata TEXT NOT NULL,
      origin_city TEXT NOT NULL,
      dest_iata TEXT NOT NULL,
      dest_city TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 120,
      seat TEXT,
      cabin_class TEXT,
      terminal TEXT,
      gate TEXT,
      aircraft TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      distance_miles INTEGER NOT NULL DEFAULT 0,
      miles_earned INTEGER NOT NULL DEFAULT 0,
      loyalty_program TEXT,
      frequent_flyer_number TEXT,
      enriched_online INTEGER NOT NULL DEFAULT 0,
      raw_barcode TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stays (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL,
      name TEXT NOT NULL,
      stay_type TEXT NOT NULL DEFAULT 'hotel',
      address TEXT,
      confirmation_code TEXT,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER NOT NULL DEFAULT 1,
      cost_cash REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      home_cost REAL NOT NULL DEFAULT 0,
      points_redeemed INTEGER NOT NULL DEFAULT 0,
      points_program TEXT,
      cash_value_estimate REAL,
      receipt_uri TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL,
      merchant TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'dining',
      local_amount REAL NOT NULL DEFAULT 0,
      local_currency TEXT NOT NULL DEFAULT 'USD',
      home_amount REAL NOT NULL DEFAULT 0,
      home_currency TEXT NOT NULL DEFAULT 'USD',
      fx_rate_used REAL NOT NULL DEFAULT 1,
      expense_date TEXT NOT NULL,
      payment_method TEXT,
      points_earned INTEGER DEFAULT 0,
      receipt_uri TEXT,
      receipt_raw_text TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL,
      title TEXT NOT NULL,
      note TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      place_name TEXT,
      lat REAL,
      lng REAL,
      photo_uri TEXT,
      thumb_uri TEXT,
      illustration_key TEXT,
      mood_sticker TEXT NOT NULL DEFAULT '🌅 Core Memory',
      is_highlight INTEGER NOT NULL DEFAULT 0,
      author_name TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loyalty_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      program_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'airline',
      member_number TEXT,
      balance INTEGER NOT NULL DEFAULT 0,
      unit_label TEXT NOT NULL DEFAULT 'mi',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fx_cache (
      currency TEXT PRIMARY KEY NOT NULL,
      rate_from_usd REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

export function getTripStatus(trip: Pick<Trip, 'startDate' | 'endDate'>): TripStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (today >= trip.startDate && today <= trip.endDate) return 'active';
  if (today < trip.startDate) return 'upcoming';
  return 'past';
}

export function getTripDayProgress(trip: Pick<Trip, 'startDate' | 'endDate'>): {
  currentDay: number;
  totalDays: number;
  daysUntil: number;
} {
  const start = new Date(`${trip.startDate}T00:00:00Z`).getTime();
  const end = new Date(`${trip.endDate}T00:00:00Z`).getTime();
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date(`${todayStr}T00:00:00Z`).getTime();
  const dayMs = 86400000;
  const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
  const currentDay = Math.min(totalDays, Math.max(1, Math.round((now - start) / dayMs) + 1));
  const daysUntil = Math.max(0, Math.round((start - now) / dayMs));
  return { currentDay, totalDays, daysUntil };
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- TRIPS ---

export function listTrips(): Trip[] {
  const db = getDb();
  const rows = db.getAllSync<Record<string, unknown>>(
    'SELECT * FROM trips ORDER BY start_date DESC'
  );
  return rows.map(mapTripRow);
}

export function getTripById(id: string): Trip | null {
  const db = getDb();
  const row = db.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM trips WHERE id = ?',
    [id]
  );
  return row ? mapTripRow(row) : null;
}

export function insertTrip(trip: Trip): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO trips (
      id, owner_id, title, destination_city, destination_country, country_code,
      flag_emoji, start_date, end_date, home_currency, budget, vibe,
      cover_photo_uri, is_shared, share_token, co_travelers, lat, lng,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trip.id,
      trip.ownerId,
      trip.title,
      trip.destinationCity,
      trip.destinationCountry,
      trip.countryCode,
      trip.flagEmoji,
      trip.startDate,
      trip.endDate,
      trip.homeCurrency,
      trip.budget,
      trip.vibe,
      trip.coverPhotoUri ?? null,
      trip.isShared ? 1 : 0,
      trip.shareToken ?? null,
      JSON.stringify(trip.coTravelers ?? []),
      trip.lat,
      trip.lng,
      trip.createdAt,
      trip.updatedAt,
    ]
  );
}

export function updateTripCover(tripId: string, coverPhotoUri: string): void {
  const db = getDb();
  db.runSync('UPDATE trips SET cover_photo_uri = ?, updated_at = ? WHERE id = ?', [
    coverPhotoUri,
    new Date().toISOString(),
    tripId,
  ]);
}

export function updateTripSharing(
  tripId: string,
  isShared: boolean,
  coTravelers: string[],
  shareToken: string
): void {
  const db = getDb();
  db.runSync(
    'UPDATE trips SET is_shared = ?, co_travelers = ?, share_token = ?, updated_at = ? WHERE id = ?',
    [
      isShared ? 1 : 0,
      JSON.stringify(coTravelers),
      shareToken,
      new Date().toISOString(),
      tripId,
    ]
  );
}

export function deleteTrip(tripId: string): void {
  const db = getDb();
  db.runSync('DELETE FROM flights WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM stays WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM expenses WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM memories WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM trips WHERE id = ?', [tripId]);
}

function mapTripRow(r: Record<string, unknown>): Trip {
  let coTravelers: string[] = [];
  try {
    coTravelers = JSON.parse((r.co_travelers as string) || '[]');
  } catch {
    coTravelers = [];
  }
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    title: String(r.title),
    destinationCity: String(r.destination_city),
    destinationCountry: String(r.destination_country),
    countryCode: String(r.country_code),
    flagEmoji: String(r.flag_emoji),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    homeCurrency: String(r.home_currency),
    budget: Number(r.budget ?? 0),
    vibe: (r.vibe as Trip['vibe']) || 'city',
    coverPhotoUri: (r.cover_photo_uri as string) || undefined,
    isShared: Number(r.is_shared) === 1,
    shareToken: (r.share_token as string) || undefined,
    coTravelers,
    lat: Number(r.lat ?? 0),
    lng: Number(r.lng ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

// --- FLIGHTS ---

export function listFlights(tripId?: string): Flight[] {
  const db = getDb();
  const rows = tripId
    ? db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM flights WHERE trip_id = ? ORDER BY departure_time ASC',
        [tripId]
      )
    : db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM flights ORDER BY departure_time DESC'
      );

  return rows.map((r) => ({
    id: String(r.id),
    tripId: String(r.trip_id),
    airlineCode: String(r.airline_code),
    airlineName: String(r.airline_name),
    flightNumber: String(r.flight_number),
    pnr: (r.pnr as string) || undefined,
    originIata: String(r.origin_iata),
    originCity: String(r.origin_city),
    destIata: String(r.dest_iata),
    destCity: String(r.dest_city),
    departureTime: String(r.departure_time),
    arrivalTime: String(r.arrival_time),
    durationMinutes: Number(r.duration_minutes ?? 120),
    seat: (r.seat as string) || undefined,
    cabinClass: (r.cabin_class as string) || undefined,
    terminal: (r.terminal as string) || undefined,
    gate: (r.gate as string) || undefined,
    aircraft: (r.aircraft as string) || undefined,
    status: (r.status as Flight['status']) || 'scheduled',
    distanceMiles: Number(r.distance_miles ?? 0),
    milesEarned: Number(r.miles_earned ?? 0),
    loyaltyProgram: (r.loyalty_program as string) || undefined,
    frequentFlyerNumber: (r.frequent_flyer_number as string) || undefined,
    enrichedOnline: Number(r.enriched_online) === 1,
    rawBarcode: (r.raw_barcode as string) || undefined,
    createdAt: String(r.created_at),
  }));
}

export function insertFlight(f: Flight): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO flights (
      id, trip_id, airline_code, airline_name, flight_number, pnr,
      origin_iata, origin_city, dest_iata, dest_city, departure_time, arrival_time,
      duration_minutes, seat, cabin_class, terminal, gate, aircraft,
      status, distance_miles, miles_earned, loyalty_program, frequent_flyer_number,
      enriched_online, raw_barcode, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      f.id,
      f.tripId,
      f.airlineCode,
      f.airlineName,
      f.flightNumber,
      f.pnr ?? null,
      f.originIata,
      f.originCity,
      f.destIata,
      f.destCity,
      f.departureTime,
      f.arrivalTime,
      f.durationMinutes,
      f.seat ?? null,
      f.cabinClass ?? null,
      f.terminal ?? null,
      f.gate ?? null,
      f.aircraft ?? null,
      f.status,
      f.distanceMiles,
      f.milesEarned,
      f.loyaltyProgram ?? null,
      f.frequentFlyerNumber ?? null,
      f.enrichedOnline ? 1 : 0,
      f.rawBarcode ?? null,
      f.createdAt,
    ]
  );

  // Auto-credit loyalty miles vault
  if (f.milesEarned > 0 && f.loyaltyProgram) {
    creditLoyaltyProgram(f.loyaltyProgram, 'airline', f.milesEarned, 'mi', f.frequentFlyerNumber);
  }
}

// --- STAYS ---

export function listStays(tripId: string): Stay[] {
  const db = getDb();
  const rows = db.getAllSync<Record<string, unknown>>(
    'SELECT * FROM stays WHERE trip_id = ? ORDER BY check_in ASC',
    [tripId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    tripId: String(r.trip_id),
    name: String(r.name),
    stayType: (r.stay_type as Stay['stayType']) || 'hotel',
    address: (r.address as string) || undefined,
    confirmationCode: (r.confirmation_code as string) || undefined,
    checkIn: String(r.check_in),
    checkOut: String(r.check_out),
    nights: Number(r.nights ?? 1),
    costCash: Number(r.cost_cash ?? 0),
    currency: String(r.currency),
    homeCost: Number(r.home_cost ?? 0),
    pointsRedeemed: Number(r.points_redeemed ?? 0),
    pointsProgram: (r.points_program as string) || undefined,
    cashValueEstimate: r.cash_value_estimate ? Number(r.cash_value_estimate) : undefined,
    receiptUri: (r.receipt_uri as string) || undefined,
    notes: (r.notes as string) || undefined,
    createdAt: String(r.created_at),
  }));
}

export function insertStay(s: Stay): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO stays (
      id, trip_id, name, stay_type, address, confirmation_code,
      check_in, check_out, nights, cost_cash, currency, home_cost,
      points_redeemed, points_program, cash_value_estimate, receipt_uri, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.id,
      s.tripId,
      s.name,
      s.stayType,
      s.address ?? null,
      s.confirmationCode ?? null,
      s.checkIn,
      s.checkOut,
      s.nights,
      s.costCash,
      s.currency,
      s.homeCost,
      s.pointsRedeemed,
      s.pointsProgram ?? null,
      s.cashValueEstimate ?? null,
      s.receiptUri ?? null,
      s.notes ?? null,
      s.createdAt,
    ]
  );
}

// --- EXPENSES (Receipts tucked safely here!) ---

export function listExpenses(tripId?: string): Expense[] {
  const db = getDb();
  const rows = tripId
    ? db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM expenses WHERE trip_id = ? ORDER BY expense_date DESC, created_at DESC',
        [tripId]
      )
    : db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM expenses ORDER BY expense_date DESC'
      );

  return rows.map((r) => ({
    id: String(r.id),
    tripId: String(r.trip_id),
    merchant: String(r.merchant),
    category: (r.category as Expense['category']) || 'dining',
    localAmount: Number(r.local_amount ?? 0),
    localCurrency: String(r.local_currency),
    homeAmount: Number(r.home_amount ?? 0),
    homeCurrency: String(r.home_currency),
    fxRateUsed: Number(r.fx_rate_used ?? 1),
    expenseDate: String(r.expense_date),
    paymentMethod: (r.payment_method as string) || undefined,
    pointsEarned: Number(r.points_earned ?? 0),
    receiptUri: (r.receipt_uri as string) || undefined,
    receiptRawText: (r.receipt_raw_text as string) || undefined,
    notes: (r.notes as string) || undefined,
    createdAt: String(r.created_at),
  }));
}

export function insertExpense(e: Expense): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO expenses (
      id, trip_id, merchant, category, local_amount, local_currency,
      home_amount, home_currency, fx_rate_used, expense_date,
      payment_method, points_earned, receipt_uri, receipt_raw_text, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.id,
      e.tripId,
      e.merchant,
      e.category,
      e.localAmount,
      e.localCurrency,
      e.homeAmount,
      e.homeCurrency,
      e.fxRateUsed,
      e.expenseDate,
      e.paymentMethod ?? null,
      e.pointsEarned ?? 0,
      e.receiptUri ?? null,
      e.receiptRawText ?? null,
      e.notes ?? null,
      e.createdAt,
    ]
  );
}

// --- MEMORIES (Clean Polaroid Timeline — zero receipts!) ---

export function listMemories(tripId?: string): Memory[] {
  const db = getDb();
  const rows = tripId
    ? db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM memories WHERE trip_id = ? ORDER BY captured_at DESC',
        [tripId]
      )
    : db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM memories ORDER BY captured_at DESC'
      );

  return rows.map((r) => ({
    id: String(r.id),
    tripId: String(r.trip_id),
    title: String(r.title),
    note: String(r.note),
    capturedAt: String(r.captured_at),
    placeName: (r.place_name as string) || undefined,
    lat: r.lat !== null && r.lat !== undefined ? Number(r.lat) : undefined,
    lng: r.lng !== null && r.lng !== undefined ? Number(r.lng) : undefined,
    photoUri: (r.photo_uri as string) || undefined,
    thumbUri: (r.thumb_uri as string) || undefined,
    illustrationKey: (r.illustration_key as Memory['illustrationKey']) || undefined,
    moodSticker: String(r.mood_sticker || '🌅 Core Memory'),
    isHighlight: Number(r.is_highlight) === 1,
    authorName: (r.author_name as string) || undefined,
    createdAt: String(r.created_at),
  }));
}

export function insertMemory(m: Memory): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO memories (
      id, trip_id, title, note, captured_at, place_name, lat, lng,
      photo_uri, thumb_uri, illustration_key, mood_sticker, is_highlight, author_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      m.tripId,
      m.title,
      m.note,
      m.capturedAt,
      m.placeName ?? null,
      m.lat ?? null,
      m.lng ?? null,
      m.photoUri ?? null,
      m.thumbUri ?? null,
      m.illustrationKey ?? null,
      m.moodSticker,
      m.isHighlight ? 1 : 0,
      m.authorName ?? null,
      m.createdAt,
    ]
  );
}

// --- LOYALTY VAULT ---

export function listLoyaltyAccounts(): LoyaltyAccount[] {
  const db = getDb();
  const rows = db.getAllSync<Record<string, unknown>>(
    'SELECT * FROM loyalty_accounts ORDER BY balance DESC'
  );
  return rows.map((r) => ({
    id: String(r.id),
    programName: String(r.program_name),
    category: (r.category as LoyaltyAccount['category']) || 'airline',
    memberNumber: (r.member_number as string) || undefined,
    balance: Number(r.balance ?? 0),
    unitLabel: (r.unit_label as 'mi' | 'pts') || 'mi',
    updatedAt: String(r.updated_at),
  }));
}

export function creditLoyaltyProgram(
  programName: string,
  category: LoyaltyAccount['category'],
  delta: number,
  unitLabel: 'mi' | 'pts',
  memberNumber?: string
): void {
  const db = getDb();
  const existing = db.getFirstSync<{ id: string; balance: number }>(
    'SELECT id, balance FROM loyalty_accounts WHERE LOWER(program_name) = LOWER(?)',
    [programName]
  );
  const now = new Date().toISOString();
  if (existing) {
    db.runSync(
      'UPDATE loyalty_accounts SET balance = ?, member_number = COALESCE(?, member_number), updated_at = ? WHERE id = ?',
      [existing.balance + delta, memberNumber ?? null, now, existing.id]
    );
  } else {
    db.runSync(
      'INSERT INTO loyalty_accounts (id, program_name, category, member_number, balance, unit_label, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [generateId('loy'), programName, category, memberNumber ?? null, delta, unitLabel, now]
    );
  }
}

// --- FX CACHE ---

export function saveFxRates(rates: FxRatesMap, updatedAt: string): void {
  const db = getDb();
  for (const [currency, rate] of Object.entries(rates)) {
    db.runSync(
      'INSERT OR REPLACE INTO fx_cache (currency, rate_from_usd, updated_at) VALUES (?, ?, ?)',
      [currency, rate, updatedAt]
    );
  }
}

export function loadCachedFxRates(): FxRatesMap {
  const db = getDb();
  const rows = db.getAllSync<{ currency: string; rate_from_usd: number }>(
    'SELECT currency, rate_from_usd FROM fx_cache'
  );
  if (!rows.length) return { ...DEFAULT_USD_RATES };
  const map: FxRatesMap = { ...DEFAULT_USD_RATES };
  for (const r of rows) {
    map[r.currency] = r.rate_from_usd;
  }
  return map;
}

// --- AGGREGATES ---

export function getTripSummary(tripId: string): TripSummaryStats {
  const expenses = listExpenses(tripId);
  const flights = listFlights(tripId);
  const stays = listStays(tripId);
  const memories = listMemories(tripId);

  const totalSpentHome =
    expenses.reduce((acc, e) => acc + e.homeAmount, 0) +
    stays.reduce((acc, s) => acc + s.homeCost, 0);
  const totalMilesFlown = flights.reduce((acc, f) => acc + f.distanceMiles, 0);
  const totalPointsEarned =
    flights.reduce((acc, f) => acc + f.milesEarned, 0) +
    expenses.reduce((acc, e) => acc + (e.pointsEarned ?? 0), 0);
  const receiptsCount = expenses.filter((e) => Boolean(e.receiptUri || e.receiptRawText)).length;

  return {
    totalSpentHome: Math.round(totalSpentHome * 100) / 100,
    totalMilesFlown,
    totalPointsEarned,
    memoriesCount: memories.length,
    flightsCount: flights.length,
    staysCount: stays.length,
    receiptsCount,
  };
}

// --- CLEAN LOCAL STATE & LEGACY DEMO CLEANUP ---

const LEGACY_DEMO_TRIP_IDS = [
  'trip_japan_autumn',
  'trip_italy_upcoming',
  'trip_lisbon_past',
  'trip_goa_past',
];

const LEGACY_DEMO_LOYALTY_PROGRAMS = [
  'Marriott Bonvoy',
  'Amex Membership Rewards',
  'ANA Mileage Club (Star Alliance)',
  'Volare',
  'Miles&Go (Star Alliance)',
  'IndiGo BluChip',
];

/**
 * One-time cleanup when upgrading over v0.1.0: removes only the 4 hardcoded demo seed trips
 * (and orphaned demo loyalty rows) while leaving any user-created trips untouched.
 */
export function purgeLegacySeedDataIfNeeded(): void {
  const db = getDb();
  const already = db.getFirstSync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'purged_v010_demo_data'"
  );
  if (already?.value === '1') return;

  let removedAnyDemo = false;
  for (const tripId of LEGACY_DEMO_TRIP_IDS) {
    const exists = db.getFirstSync<{ id: string }>(
      'SELECT id FROM trips WHERE id = ?',
      [tripId]
    );
    if (exists) {
      deleteTrip(tripId);
      removedAnyDemo = true;
    }
  }

  if (removedAnyDemo) {
    const remainingTrips = listTrips();
    if (remainingTrips.length === 0) {
      for (const prog of LEGACY_DEMO_LOYALTY_PROGRAMS) {
        db.runSync('DELETE FROM loyalty_accounts WHERE program_name = ?', [prog]);
      }
    }
  }

  db.runSync(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('purged_v010_demo_data', '1')"
  );
}

/**
 * Clears all local travelogue records (trips, flights, stays, expenses, memories, loyalty vault)
 * for fresh local testing.
 */
export function clearAllLocalData(): void {
  const db = getDb();
  db.execSync(`
    DELETE FROM flights;
    DELETE FROM stays;
    DELETE FROM expenses;
    DELETE FROM memories;
    DELETE FROM trips;
    DELETE FROM loyalty_accounts;
    DELETE FROM sync_queue;
  `);
}
