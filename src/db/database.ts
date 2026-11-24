import * as SQLite from 'expo-sqlite';
import {
  CoTravelerRole,
  Expense,
  Flight,
  LoyaltyAccount,
  Memory,
  Stay,
  TransportLeg,
  Trip,
  TripStatus,
  TripStop,
  TripSummaryStats,
} from '../types/models';
import { DEFAULT_USD_RATES, FxRatesMap } from '../services/fxService';
import { milesToKm } from '../services/distanceUtils';
import { buildTripSpendLedger } from '../services/spendCurrencyUtils';

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
      co_traveler_roles TEXT NOT NULL DEFAULT '{}',
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

    CREATE TABLE IF NOT EXISTS transports (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'train',
      title TEXT NOT NULL,
      operator_name TEXT,
      reference_code TEXT,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      seat_or_vehicle TEXT,
      distance_km INTEGER,
      cost_amount REAL,
      currency TEXT,
      home_cost REAL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trip_stops (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL,
      city_name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
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
      is_shared INTEGER NOT NULL DEFAULT 0,
      author_id TEXT,
      author_name TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY NOT NULL,
      trip_id TEXT NOT NULL,
      stop_id TEXT,
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

  // Safe non-destructive migrations for existing databases
  try {
    const memCols = db.getAllSync<{ name: string }>('PRAGMA table_info(memories)');
    if (!memCols.some((c) => c.name === 'stop_id')) {
      db.execSync('ALTER TABLE memories ADD COLUMN stop_id TEXT');
    }
  } catch {
    // Ignore if already migrated
  }
  try {
    const tripCols = db.getAllSync<{ name: string }>('PRAGMA table_info(trips)');
    if (!tripCols.some((c) => c.name === 'co_traveler_roles')) {
      db.execSync("ALTER TABLE trips ADD COLUMN co_traveler_roles TEXT NOT NULL DEFAULT '{}'");
    }
  } catch {
    // Ignore if already migrated
  }
  try {
    const expCols = db.getAllSync<{ name: string }>('PRAGMA table_info(expenses)');
    if (!expCols.some((c) => c.name === 'is_shared')) {
      db.execSync('ALTER TABLE expenses ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0');
    }
    if (!expCols.some((c) => c.name === 'author_id')) {
      db.execSync('ALTER TABLE expenses ADD COLUMN author_id TEXT');
    }
    if (!expCols.some((c) => c.name === 'author_name')) {
      db.execSync('ALTER TABLE expenses ADD COLUMN author_name TEXT');
    }
  } catch {
    // Ignore if already migrated
  }
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

export interface DbWriteOptions {
  skipSyncQueue?: boolean;
}

export interface SyncQueueItem {
  id: string;
  entity: string;
  entityId: string;
  action: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
}

export function insertTrip(trip: Trip, options?: DbWriteOptions): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO trips (
      id, owner_id, title, destination_city, destination_country, country_code,
      flag_emoji, start_date, end_date, home_currency, budget, vibe,
      cover_photo_uri, is_shared, share_token, co_travelers, co_traveler_roles, lat, lng,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(trip.coTravelerRoles ?? {}),
      trip.lat,
      trip.lng,
      trip.createdAt,
      trip.updatedAt,
    ]
  );
  if (!options?.skipSyncQueue) {
    enqueueSyncMutation('trips', trip.id, 'upsert', { tripId: trip.id });
  }
}

export type TripEditablePatch = Partial<
  Pick<
    Trip,
    | 'title'
    | 'destinationCity'
    | 'destinationCountry'
    | 'countryCode'
    | 'flagEmoji'
    | 'startDate'
    | 'endDate'
    | 'homeCurrency'
    | 'budget'
    | 'vibe'
    | 'coverPhotoUri'
    | 'lat'
    | 'lng'
  >
>;

export function enqueueSyncMutation(
  entity: string,
  entityId: string,
  action: 'upsert' | 'delete',
  payload: Record<string, unknown> = {}
): void {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO sync_queue (id, entity, entity_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      `${entity}_${entityId}_${action}`,
      entity,
      entityId,
      action,
      JSON.stringify(payload),
      new Date().toISOString(),
    ]
  );
}

export function clearSyncMutation(
  entity: string,
  entityId: string,
  action: 'upsert' | 'delete'
): void {
  const db = getDb();
  db.runSync('DELETE FROM sync_queue WHERE id = ?', [`${entity}_${entityId}_${action}`]);
}

export function listSyncQueue(): SyncQueueItem[] {
  const db = getDb();
  const rows = db.getAllSync<Record<string, unknown>>(
    'SELECT * FROM sync_queue ORDER BY created_at ASC'
  );
  return rows.map((r) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(r.payload || '{}'));
    } catch {
      payload = {};
    }
    return {
      id: String(r.id),
      entity: String(r.entity),
      entityId: String(r.entity_id),
      action: r.action === 'delete' ? 'delete' : 'upsert',
      payload,
      createdAt: String(r.created_at),
    };
  });
}

export function getPendingSyncCount(): number {
  const db = getDb();
  const row = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM sync_queue');
  return Number(row?.cnt ?? 0);
}

export function clearSyncQueueIds(ids: string[]): void {
  if (!ids.length) return;
  const db = getDb();
  for (const id of ids) {
    db.runSync('DELETE FROM sync_queue WHERE id = ?', [id]);
  }
}

export function getAppMeta(key: string): string | null {
  const db = getDb();
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row ? String(row.value) : null;
}

export function setAppMeta(key: string, value: string): void {
  const db = getDb();
  db.runSync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [key, value]);
}

export function updateTrip(tripId: string, patch: TripEditablePatch): void {
  const existing = getTripById(tripId);
  if (!existing) return;

  const updated: Trip = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  insertTrip(updated);
}

export function updateTripCover(tripId: string, coverPhotoUri: string | null): void {
  const db = getDb();
  db.runSync('UPDATE trips SET cover_photo_uri = ?, updated_at = ? WHERE id = ?', [
    coverPhotoUri,
    new Date().toISOString(),
    tripId,
  ]);
  enqueueSyncMutation('trips', tripId, 'upsert', { tripId });
}

export function updateTripSharing(
  tripId: string,
  isShared: boolean,
  coTravelers: string[],
  shareToken: string,
  coTravelerRoles?: Record<string, CoTravelerRole>
): void {
  const db = getDb();
  const cleanRoles: Record<string, CoTravelerRole> = {};
  if (coTravelerRoles) {
    for (const [k, v] of Object.entries(coTravelerRoles)) {
      const key = k.trim().toLowerCase();
      if (key) cleanRoles[key] = v === 'viewer' ? 'viewer' : 'editor';
    }
  }
  db.runSync(
    'UPDATE trips SET is_shared = ?, co_travelers = ?, co_traveler_roles = ?, share_token = ?, updated_at = ? WHERE id = ?',
    [
      isShared ? 1 : 0,
      JSON.stringify(coTravelers),
      JSON.stringify(cleanRoles),
      shareToken,
      new Date().toISOString(),
      tripId,
    ]
  );
  enqueueSyncMutation('trips', tripId, 'upsert', { tripId });
}

export function deleteTrip(tripId: string): void {
  const db = getDb();
  db.runSync('DELETE FROM flights WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM transports WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM trip_stops WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM stays WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM expenses WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM memories WHERE trip_id = ?', [tripId]);
  db.runSync('DELETE FROM trips WHERE id = ?', [tripId]);
  enqueueSyncMutation('trips', tripId, 'delete', { tripId });
}

function mapTripRow(r: Record<string, unknown>): Trip {
  let coTravelers: string[] = [];
  try {
    coTravelers = JSON.parse((r.co_travelers as string) || '[]');
  } catch {
    coTravelers = [];
  }
  let coTravelerRoles: Record<string, CoTravelerRole> = {};
  try {
    const parsedRoles = JSON.parse((r.co_traveler_roles as string) || '{}');
    if (parsedRoles && typeof parsedRoles === 'object') {
      for (const [k, v] of Object.entries(parsedRoles as Record<string, unknown>)) {
        coTravelerRoles[k.trim().toLowerCase()] = v === 'viewer' ? 'viewer' : 'editor';
      }
    }
  } catch {
    coTravelerRoles = {};
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
    coTravelerRoles,
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

export function insertFlight(f: Flight, options?: DbWriteOptions): void {
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

  if (!options?.skipSyncQueue) {
    enqueueSyncMutation('flights', f.id, 'upsert', { tripId: f.tripId });
    // Auto-credit loyalty miles vault only on local inserts (not cloud pulls)
    if (f.milesEarned > 0 && f.loyaltyProgram) {
      creditLoyaltyProgram(f.loyaltyProgram, 'airline', f.milesEarned, 'mi', f.frequentFlyerNumber);
    }
  }
}

export interface FlightEditablePatch {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  pnr?: string;
  originIata: string;
  originCity: string;
  destIata: string;
  destCity: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  distanceMiles: number;
  milesEarned: number;
  loyaltyProgram?: string;
  seat?: string;
  cabinClass?: string;
  terminal?: string;
  gate?: string;
  aircraft?: string;
  status?: Flight['status'];
  enrichedOnline?: boolean;
}

export function updateFlight(flightId: string, patch: FlightEditablePatch): void {
  const db = getDb();
  db.runSync(
    `UPDATE flights
     SET airline_code = ?,
         airline_name = ?,
         flight_number = ?,
         pnr = ?,
         origin_iata = ?,
         origin_city = ?,
         dest_iata = ?,
         dest_city = ?,
         departure_time = ?,
         arrival_time = ?,
         duration_minutes = ?,
         distance_miles = ?,
         miles_earned = ?,
         loyalty_program = ?,
         seat = ?,
         cabin_class = ?,
         terminal = COALESCE(?, terminal),
         gate = COALESCE(?, gate),
         aircraft = COALESCE(?, aircraft),
         status = COALESCE(?, status),
         enriched_online = COALESCE(?, enriched_online)
     WHERE id = ?`,
    [
      patch.airlineCode,
      patch.airlineName,
      patch.flightNumber,
      patch.pnr ?? null,
      patch.originIata,
      patch.originCity,
      patch.destIata,
      patch.destCity,
      patch.departureTime,
      patch.arrivalTime,
      patch.durationMinutes,
      patch.distanceMiles,
      patch.milesEarned,
      patch.loyaltyProgram ?? null,
      patch.seat ?? null,
      patch.cabinClass ?? null,
      patch.terminal ?? null,
      patch.gate ?? null,
      patch.aircraft ?? null,
      patch.status ?? null,
      patch.enrichedOnline !== undefined ? (patch.enrichedOnline ? 1 : 0) : null,
      flightId,
    ]
  );
  enqueueSyncMutation('flights', flightId, 'upsert', { flightId });
}

// --- TRANSPORTS (Train, Bus, Ferry, Rental Car, Own Car) ---

export function listTransports(tripId?: string): TransportLeg[] {
  const db = getDb();
  const rows = tripId
    ? db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM transports WHERE trip_id = ? ORDER BY start_date ASC, created_at ASC',
        [tripId]
      )
    : db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM transports ORDER BY start_date DESC, created_at DESC'
      );

  return rows.map((r) => ({
    id: String(r.id),
    tripId: String(r.trip_id),
    mode: (r.mode as TransportLeg['mode']) || 'train',
    title: String(r.title),
    operatorName: (r.operator_name as string) || undefined,
    referenceCode: (r.reference_code as string) || undefined,
    origin: String(r.origin),
    destination: String(r.destination),
    startDate: String(r.start_date),
    endDate: (r.end_date as string) || undefined,
    seatOrVehicle: (r.seat_or_vehicle as string) || undefined,
    distanceKm:
      r.distance_km !== null && r.distance_km !== undefined ? Number(r.distance_km) : undefined,
    costAmount:
      r.cost_amount !== null && r.cost_amount !== undefined ? Number(r.cost_amount) : undefined,
    currency: (r.currency as string) || undefined,
    homeCost:
      r.home_cost !== null && r.home_cost !== undefined ? Number(r.home_cost) : undefined,
    notes: (r.notes as string) || undefined,
    createdAt: String(r.created_at),
  }));
}

export function insertTransport(t: TransportLeg, options?: DbWriteOptions): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO transports (
      id, trip_id, mode, title, operator_name, reference_code,
      origin, destination, start_date, end_date, seat_or_vehicle,
      distance_km, cost_amount, currency, home_cost, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.id,
      t.tripId,
      t.mode,
      t.title,
      t.operatorName ?? null,
      t.referenceCode ?? null,
      t.origin,
      t.destination,
      t.startDate,
      t.endDate ?? null,
      t.seatOrVehicle ?? null,
      t.distanceKm ?? null,
      t.costAmount ?? null,
      t.currency ?? null,
      t.homeCost ?? null,
      t.notes ?? null,
      t.createdAt,
    ]
  );
  if (!options?.skipSyncQueue) {
    enqueueSyncMutation('transports', t.id, 'upsert', { tripId: t.tripId });
  }
}

export function deleteTransport(transportId: string): void {
  const db = getDb();
  db.runSync('DELETE FROM transports WHERE id = ?', [transportId]);
  enqueueSyncMutation('transports', transportId, 'delete', { transportId });
}

// --- TRIP STOPS / MULTI-HOP JOURNEY ---

export function listTripStops(tripId?: string): TripStop[] {
  const db = getDb();
  const rows = tripId
    ? db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM trip_stops WHERE trip_id = ? ORDER BY sort_order ASC, start_date ASC, created_at ASC',
        [tripId]
      )
    : db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM trip_stops ORDER BY sort_order ASC, start_date ASC'
      );

  return rows.map((r) => ({
    id: String(r.id),
    tripId: String(r.trip_id),
    cityName: String(r.city_name),
    startDate: (r.start_date as string) || undefined,
    endDate: (r.end_date as string) || undefined,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: String(r.created_at),
  }));
}

export function insertTripStop(s: TripStop, options?: DbWriteOptions): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO trip_stops (
      id, trip_id, city_name, start_date, end_date, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      s.id,
      s.tripId,
      s.cityName,
      s.startDate ?? null,
      s.endDate ?? null,
      s.sortOrder,
      s.createdAt,
    ]
  );
  if (!options?.skipSyncQueue) {
    enqueueSyncMutation('trip_stops', s.id, 'upsert', { tripId: s.tripId });
  }
}

export function deleteTripStop(stopId: string): void {
  const db = getDb();
  db.runSync('UPDATE memories SET stop_id = NULL WHERE stop_id = ?', [stopId]);
  db.runSync('DELETE FROM trip_stops WHERE id = ?', [stopId]);
  enqueueSyncMutation('trip_stops', stopId, 'delete', { stopId });
}

// --- STAYS ---

export function listStays(tripId?: string): Stay[] {
  const db = getDb();
  const rows = tripId
    ? db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM stays WHERE trip_id = ? ORDER BY check_in ASC',
        [tripId]
      )
    : db.getAllSync<Record<string, unknown>>(
        'SELECT * FROM stays ORDER BY check_in DESC'
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

export function insertStay(s: Stay, options?: DbWriteOptions): void {
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
  if (!options?.skipSyncQueue) {
    enqueueSyncMutation('stays', s.id, 'upsert', { tripId: s.tripId });
  }
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
    isShared: Number(r.is_shared ?? 0) === 1,
    authorId: (r.author_id as string) || undefined,
    authorName: (r.author_name as string) || undefined,
    createdAt: String(r.created_at),
  }));
}

export function insertExpense(e: Expense, options?: DbWriteOptions): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO expenses (
      id, trip_id, merchant, category, local_amount, local_currency,
      home_amount, home_currency, fx_rate_used, expense_date,
      payment_method, points_earned, receipt_uri, receipt_raw_text, notes,
      is_shared, author_id, author_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      e.isShared ? 1 : 0,
      e.authorId ?? null,
      e.authorName ?? null,
      e.createdAt,
    ]
  );
  if (!options?.skipSyncQueue) {
    enqueueSyncMutation('expenses', e.id, 'upsert', { tripId: e.tripId });
  }
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
    stopId: (r.stop_id as string) || undefined,
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

export function insertMemory(m: Memory, options?: DbWriteOptions): void {
  const db = getDb();
  db.runSync(
    `INSERT OR REPLACE INTO memories (
      id, trip_id, stop_id, title, note, captured_at, place_name, lat, lng,
      photo_uri, thumb_uri, illustration_key, mood_sticker, is_highlight, author_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      m.tripId,
      m.stopId ?? null,
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
  if (!options?.skipSyncQueue) {
    enqueueSyncMutation('memories', m.id, 'upsert', { tripId: m.tripId });
  }
}

export interface MemoryEditablePatch {
  stopId?: string | null;
  title?: string;
  note?: string;
  placeName?: string;
  moodSticker?: string;
  capturedAt?: string;
  photoUri?: string | null;
  thumbUri?: string | null;
  illustrationKey?: Memory['illustrationKey'] | null;
}

export function updateMemory(
  memoryId: string,
  patch: MemoryEditablePatch
): { previousPhotoUri?: string; previousThumbUri?: string; updated: Memory } | null {
  const db = getDb();
  const row = db.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM memories WHERE id = ?',
    [memoryId]
  );
  if (!row) return null;

  const prevPhotoUri = (row.photo_uri as string) || undefined;
  const prevThumbUri = (row.thumb_uri as string) || undefined;

  const nextStopId =
    patch.stopId !== undefined ? patch.stopId || null : (row.stop_id as string) || null;
  const nextTitle = patch.title !== undefined ? patch.title : String(row.title);
  const nextNote = patch.note !== undefined ? patch.note : String(row.note);
  const nextPlace =
    patch.placeName !== undefined ? patch.placeName || null : (row.place_name as string) || null;
  const nextMood =
    patch.moodSticker !== undefined ? patch.moodSticker : String(row.mood_sticker || '🌅 Core Memory');
  const nextCapturedAt =
    patch.capturedAt !== undefined ? patch.capturedAt : String(row.captured_at);
  const nextPhoto =
    patch.photoUri !== undefined ? patch.photoUri : (row.photo_uri as string) || null;
  const nextThumb =
    patch.thumbUri !== undefined ? patch.thumbUri : (row.thumb_uri as string) || null;
  const nextIllust =
    patch.illustrationKey !== undefined
      ? patch.illustrationKey
      : (row.illustration_key as Memory['illustrationKey']) || null;

  db.runSync(
    `UPDATE memories
     SET stop_id = ?, title = ?, note = ?, place_name = ?, mood_sticker = ?, captured_at = ?,
         photo_uri = ?, thumb_uri = ?, illustration_key = ?
     WHERE id = ?`,
    [
      nextStopId,
      nextTitle,
      nextNote,
      nextPlace,
      nextMood,
      nextCapturedAt,
      nextPhoto,
      nextThumb,
      nextIllust,
      memoryId,
    ]
  );

  const updated: Memory = {
    id: String(row.id),
    tripId: String(row.trip_id),
    stopId: nextStopId || undefined,
    title: nextTitle,
    note: nextNote,
    capturedAt: nextCapturedAt,
    placeName: nextPlace || undefined,
    lat: row.lat !== null && row.lat !== undefined ? Number(row.lat) : undefined,
    lng: row.lng !== null && row.lng !== undefined ? Number(row.lng) : undefined,
    photoUri: nextPhoto || undefined,
    thumbUri: nextThumb || undefined,
    illustrationKey: nextIllust || undefined,
    moodSticker: nextMood,
    isHighlight: Number(row.is_highlight) === 1,
    authorName: (row.author_name as string) || undefined,
    createdAt: String(row.created_at),
  };

  enqueueSyncMutation('memories', memoryId, 'upsert', { ...updated });

  return {
    previousPhotoUri: prevPhotoUri && prevPhotoUri !== nextPhoto ? prevPhotoUri : undefined,
    previousThumbUri: prevThumbUri && prevThumbUri !== nextThumb ? prevThumbUri : undefined,
    updated,
  };
}

export function deleteMemory(memoryId: string): Memory | null {
  const db = getDb();
  const row = db.getFirstSync<Record<string, unknown>>(
    'SELECT * FROM memories WHERE id = ?',
    [memoryId]
  );
  if (!row) return null;

  const mem: Memory = {
    id: String(row.id),
    tripId: String(row.trip_id),
    stopId: (row.stop_id as string) || undefined,
    title: String(row.title),
    note: String(row.note),
    capturedAt: String(row.captured_at),
    placeName: (row.place_name as string) || undefined,
    lat: row.lat !== null && row.lat !== undefined ? Number(row.lat) : undefined,
    lng: row.lng !== null && row.lng !== undefined ? Number(row.lng) : undefined,
    photoUri: (row.photo_uri as string) || undefined,
    thumbUri: (row.thumb_uri as string) || undefined,
    illustrationKey: (row.illustration_key as Memory['illustrationKey']) || undefined,
    moodSticker: String(row.mood_sticker || '🌅 Core Memory'),
    isHighlight: Number(row.is_highlight) === 1,
    authorName: (row.author_name as string) || undefined,
    createdAt: String(row.created_at),
  };

  db.runSync('DELETE FROM memories WHERE id = ?', [memoryId]);

  // If this memory's photo was the trip's cover photo, revert cleanly to the destination postcard banner
  if (mem.photoUri) {
    db.runSync(
      'UPDATE trips SET cover_photo_uri = NULL, updated_at = ? WHERE id = ? AND cover_photo_uri = ?',
      [new Date().toISOString(), mem.tripId, mem.photoUri]
    );
  }

  enqueueSyncMutation('memories', memoryId, 'delete', {
    tripId: mem.tripId,
    photoUri: mem.photoUri ?? null,
    thumbUri: mem.thumbUri ?? null,
  });

  return mem;
}

export function deleteFlight(flightId: string): void {
  const db = getDb();
  db.runSync('DELETE FROM flights WHERE id = ?', [flightId]);
  enqueueSyncMutation('flights', flightId, 'delete', { flightId });
}

export function deleteStay(stayId: string): void {
  const db = getDb();
  db.runSync('DELETE FROM stays WHERE id = ?', [stayId]);
  enqueueSyncMutation('stays', stayId, 'delete', { stayId });
}

export function deleteExpense(expenseId: string): { receiptUri?: string } {
  const db = getDb();
  const row = db.getFirstSync<{ receipt_uri?: string }>(
    'SELECT receipt_uri FROM expenses WHERE id = ?',
    [expenseId]
  );
  db.runSync('DELETE FROM expenses WHERE id = ?', [expenseId]);
  enqueueSyncMutation('expenses', expenseId, 'delete', { expenseId });
  return { receiptUri: row?.receipt_uri || undefined };
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
    enqueueSyncMutation('loyalty_accounts', existing.id, 'upsert', { id: existing.id });
  } else {
    const newId = generateId('loy');
    db.runSync(
      'INSERT INTO loyalty_accounts (id, program_name, category, member_number, balance, unit_label, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [newId, programName, category, memberNumber ?? null, delta, unitLabel, now]
    );
    enqueueSyncMutation('loyalty_accounts', newId, 'upsert', { id: newId });
  }
}

export function upsertLoyaltyAccount(
  acc: LoyaltyAccount,
  options?: DbWriteOptions
): void {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO loyalty_accounts (id, program_name, category, member_number, balance, unit_label, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      acc.id,
      acc.programName,
      acc.category,
      acc.memberNumber ?? null,
      acc.balance,
      acc.unitLabel,
      acc.updatedAt,
    ]
  );
  if (!options?.skipSyncQueue) {
    enqueueSyncMutation('loyalty_accounts', acc.id, 'upsert', { id: acc.id });
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

export function getTripSummary(
  tripId: string,
  preferredCurrency?: string,
  fxRates: FxRatesMap = DEFAULT_USD_RATES
): TripSummaryStats {
  const trip = getTripById(tripId);
  const expenses = listExpenses(tripId);
  const flights = listFlights(tripId);
  const transports = listTransports(tripId);
  const stays = listStays(tripId);
  const memories = listMemories(tripId);

  const targetCurrency = (preferredCurrency || trip?.homeCurrency || 'USD').toUpperCase();
  const ledger = buildTripSpendLedger({
    expenses,
    transports,
    stays,
    preferredCurrency: targetCurrency,
    fallbackCurrency: trip?.homeCurrency || targetCurrency,
    fxRates,
  });

  const totalSpentHome = ledger.totalSpentPreferred;
  const totalMilesFlown = flights.reduce((acc, f) => acc + f.distanceMiles, 0);
  const totalDistanceKm =
    milesToKm(totalMilesFlown) +
    transports.reduce((acc, t) => acc + (t.distanceKm ?? 0), 0);
  const totalPointsEarned =
    flights.reduce((acc, f) => acc + f.milesEarned, 0) +
    expenses.reduce((acc, e) => acc + (e.pointsEarned ?? 0), 0);
  const receiptsCount = expenses.filter((e) => Boolean(e.receiptUri || e.receiptRawText)).length;

  return {
    totalSpentHome,
    totalMilesFlown,
    totalDistanceKm,
    totalPointsEarned,
    memoriesCount: memories.length,
    flightsCount: flights.length,
    transportsCount: transports.length,
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
 * Clears all local travelogue records (trips, flights, transports, stops, stays, expenses, memories, loyalty vault)
 * for fresh local testing.
 */
export function clearAllLocalData(): void {
  const db = getDb();
  db.execSync(`
    DELETE FROM flights;
    DELETE FROM transports;
    DELETE FROM trip_stops;
    DELETE FROM stays;
    DELETE FROM expenses;
    DELETE FROM memories;
    DELETE FROM trips;
    DELETE FROM loyalty_accounts;
    DELETE FROM sync_queue;
  `);
}
