import {
  CoTravelerRole,
  Expense,
  Flight,
  LoyaltyAccount,
  Memory,
  Stay,
  TransportLeg,
  Trip,
  TripStop,
} from '../types/models';

export interface LocalBackupSnapshot {
  schemaVersion: 2;
  app: "Wanderer's Ledger";
  exportedAt: string;
  trips: Trip[];
  flights: Flight[];
  transports: TransportLeg[];
  stops: TripStop[];
  stays: Stay[];
  expenses: Expense[];
  memories: Memory[];
  loyaltyAccounts: LoyaltyAccount[];
  fxSnapshots?: Record<string, Record<string, number>>;
}

export function normalizeIsoTimestamp(val?: string | null): string {
  if (!val) return new Date().toISOString();
  const s = String(val).trim();
  if (!s) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.length === 16 ? `${s}:00Z` : `${s}Z`;
  }
  return s;
}

export function normalizeDateOnly(val?: string | null): string | null {
  if (!val) return null;
  const s = String(val).trim();
  const match = s.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

/**
 * Last-Write-Wins timestamp comparison for bidirectional sync merges.
 * Returns true when the remote record is newer than (or local timestamp is missing).
 */
export function shouldAcceptRemoteRecord(
  localUpdatedAt?: string | null,
  remoteUpdatedAt?: string | null
): boolean {
  if (!localUpdatedAt) return true;
  if (!remoteUpdatedAt) return false;
  const localMs = Date.parse(normalizeIsoTimestamp(localUpdatedAt));
  const remoteMs = Date.parse(normalizeIsoTimestamp(remoteUpdatedAt));
  if (Number.isNaN(localMs)) return true;
  if (Number.isNaN(remoteMs)) return false;
  return remoteMs > localMs;
}

export function tripToCloudRow(
  trip: Trip,
  userId: string,
  coverPhotoKey?: string | null
): Record<string, unknown> {
  const cleanRoles: Record<string, CoTravelerRole> = {};
  if (trip.coTravelerRoles) {
    for (const [k, v] of Object.entries(trip.coTravelerRoles)) {
      const key = k.trim().toLowerCase();
      if (key) cleanRoles[key] = v === 'viewer' ? 'viewer' : 'editor';
    }
  }
  return {
    id: trip.id,
    owner_id: userId,
    title: trip.title,
    destination_city: trip.destinationCity,
    destination_country: trip.destinationCountry,
    country_code: trip.countryCode,
    flag_emoji: trip.flagEmoji || '🌍',
    start_date: normalizeDateOnly(trip.startDate) || new Date().toISOString().slice(0, 10),
    end_date:
      normalizeDateOnly(trip.endDate) ||
      normalizeDateOnly(trip.startDate) ||
      new Date().toISOString().slice(0, 10),
    home_currency: trip.homeCurrency || 'USD',
    budget: Number(trip.budget ?? 0),
    vibe: trip.vibe || 'city',
    cover_photo_key: coverPhotoKey ?? null,
    is_shared: Boolean(trip.isShared),
    share_token: trip.shareToken ?? null,
    co_travelers: trip.coTravelers ?? [],
    co_traveler_roles: cleanRoles,
    lat: Number(trip.lat ?? 0),
    lng: Number(trip.lng ?? 0),
    created_at: normalizeIsoTimestamp(trip.createdAt),
    updated_at: normalizeIsoTimestamp(trip.updatedAt),
  };
}

export function cloudRowToTrip(
  row: Record<string, unknown>,
  localCoverUri?: string,
  memberRoleOverrides?: Record<string, CoTravelerRole>
): Trip {
  let coTravelers: string[] = [];
  if (Array.isArray(row.co_travelers)) {
    coTravelers = row.co_travelers.map(String);
  } else if (typeof row.co_travelers === 'string') {
    try {
      const parsed = JSON.parse(row.co_travelers);
      if (Array.isArray(parsed)) coTravelers = parsed.map(String);
    } catch {
      coTravelers = [];
    }
  }
  const coTravelerRoles: Record<string, CoTravelerRole> = {};
  const rawRoles =
    typeof row.co_traveler_roles === 'string'
      ? (() => {
          try {
            return JSON.parse(row.co_traveler_roles);
          } catch {
            return {};
          }
        })()
      : row.co_traveler_roles;
  if (rawRoles && typeof rawRoles === 'object') {
    for (const [k, v] of Object.entries(rawRoles as Record<string, unknown>)) {
      const key = k.trim().toLowerCase();
      if (key) coTravelerRoles[key] = v === 'viewer' ? 'viewer' : 'editor';
    }
  }
  if (memberRoleOverrides) {
    for (const [k, v] of Object.entries(memberRoleOverrides)) {
      const key = k.trim().toLowerCase();
      if (key) coTravelerRoles[key] = v === 'viewer' ? 'viewer' : 'editor';
    }
  }
  return {
    id: String(row.id),
    ownerId: String(row.owner_id || 'local_wanderer'),
    title: String(row.title || 'Untitled Trip'),
    destinationCity: String(row.destination_city || ''),
    destinationCountry: String(row.destination_country || ''),
    countryCode: String(row.country_code || ''),
    flagEmoji: String(row.flag_emoji || '🌍'),
    startDate: normalizeDateOnly(row.start_date as string) || new Date().toISOString().slice(0, 10),
    endDate: normalizeDateOnly(row.end_date as string) || new Date().toISOString().slice(0, 10),
    homeCurrency: String(row.home_currency || 'USD'),
    budget: Number(row.budget ?? 0),
    vibe: (row.vibe as Trip['vibe']) || 'city',
    coverPhotoUri: localCoverUri || undefined,
    isShared: Boolean(row.is_shared),
    shareToken: (row.share_token as string) || undefined,
    coTravelers,
    coTravelerRoles,
    lat: Number(row.lat ?? 0),
    lng: Number(row.lng ?? 0),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

export function flightToCloudRow(f: Flight): Record<string, unknown> {
  return {
    id: f.id,
    trip_id: f.tripId,
    airline_code: f.airlineCode,
    airline_name: f.airlineName,
    flight_number: f.flightNumber,
    pnr: f.pnr ?? null,
    origin_iata: f.originIata,
    origin_city: f.originCity,
    dest_iata: f.destIata,
    dest_city: f.destCity,
    departure_time: normalizeIsoTimestamp(f.departureTime),
    arrival_time: normalizeIsoTimestamp(f.arrivalTime),
    duration_minutes: Math.round(Number(f.durationMinutes ?? 120)),
    seat: f.seat ?? null,
    cabin_class: f.cabinClass ?? null,
    terminal: f.terminal ?? null,
    gate: f.gate ?? null,
    aircraft: f.aircraft ?? null,
    status: f.status || 'scheduled',
    distance_miles: Math.round(Number(f.distanceMiles ?? 0)),
    miles_earned: Math.round(Number(f.milesEarned ?? 0)),
    loyalty_program: f.loyaltyProgram ?? null,
    frequent_flyer_number: f.frequentFlyerNumber ?? null,
    enriched_online: Boolean(f.enrichedOnline),
    raw_barcode: f.rawBarcode ?? null,
    created_at: normalizeIsoTimestamp(f.createdAt),
    updated_at: new Date().toISOString(),
  };
}

export function cloudRowToFlight(row: Record<string, unknown>): Flight {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    airlineCode: String(row.airline_code || ''),
    airlineName: String(row.airline_name || ''),
    flightNumber: String(row.flight_number || ''),
    pnr: (row.pnr as string) || undefined,
    originIata: String(row.origin_iata || ''),
    originCity: String(row.origin_city || ''),
    destIata: String(row.dest_iata || ''),
    destCity: String(row.dest_city || ''),
    departureTime: String(row.departure_time || ''),
    arrivalTime: String(row.arrival_time || ''),
    durationMinutes: Number(row.duration_minutes ?? 120),
    seat: (row.seat as string) || undefined,
    cabinClass: (row.cabin_class as string) || undefined,
    terminal: (row.terminal as string) || undefined,
    gate: (row.gate as string) || undefined,
    aircraft: (row.aircraft as string) || undefined,
    status: (row.status as Flight['status']) || 'scheduled',
    distanceMiles: Number(row.distance_miles ?? 0),
    milesEarned: Number(row.miles_earned ?? 0),
    loyaltyProgram: (row.loyalty_program as string) || undefined,
    frequentFlyerNumber: (row.frequent_flyer_number as string) || undefined,
    enrichedOnline: Boolean(row.enriched_online),
    rawBarcode: (row.raw_barcode as string) || undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function transportToCloudRow(t: TransportLeg): Record<string, unknown> {
  return {
    id: t.id,
    trip_id: t.tripId,
    mode: t.mode || 'train',
    title: t.title,
    operator_name: t.operatorName ?? null,
    reference_code: t.referenceCode ?? null,
    origin: t.origin,
    destination: t.destination,
    start_date: t.startDate,
    end_date: t.endDate ?? null,
    seat_or_vehicle: t.seatOrVehicle ?? null,
    distance_km: t.distanceKm !== undefined ? Math.round(t.distanceKm) : null,
    cost_amount: t.costAmount ?? null,
    currency: t.currency ?? null,
    home_cost: t.homeCost ?? null,
    notes: t.notes ?? null,
    created_at: normalizeIsoTimestamp(t.createdAt),
    updated_at: new Date().toISOString(),
  };
}

export function cloudRowToTransport(row: Record<string, unknown>): TransportLeg {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    mode: (row.mode as TransportLeg['mode']) || 'train',
    title: String(row.title || ''),
    operatorName: (row.operator_name as string) || undefined,
    referenceCode: (row.reference_code as string) || undefined,
    origin: String(row.origin || ''),
    destination: String(row.destination || ''),
    startDate: String(row.start_date || ''),
    endDate: (row.end_date as string) || undefined,
    seatOrVehicle: (row.seat_or_vehicle as string) || undefined,
    distanceKm:
      row.distance_km !== null && row.distance_km !== undefined ? Number(row.distance_km) : undefined,
    costAmount:
      row.cost_amount !== null && row.cost_amount !== undefined ? Number(row.cost_amount) : undefined,
    currency: (row.currency as string) || undefined,
    homeCost:
      row.home_cost !== null && row.home_cost !== undefined ? Number(row.home_cost) : undefined,
    notes: (row.notes as string) || undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function stopToCloudRow(s: TripStop): Record<string, unknown> {
  return {
    id: s.id,
    trip_id: s.tripId,
    city_name: s.cityName,
    start_date: normalizeDateOnly(s.startDate),
    end_date: normalizeDateOnly(s.endDate),
    sort_order: Math.round(Number(s.sortOrder ?? 0)),
    created_at: normalizeIsoTimestamp(s.createdAt),
    updated_at: new Date().toISOString(),
  };
}

export function cloudRowToStop(row: Record<string, unknown>): TripStop {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    cityName: String(row.city_name || ''),
    startDate: normalizeDateOnly(row.start_date as string) || undefined,
    endDate: normalizeDateOnly(row.end_date as string) || undefined,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function stayToCloudRow(
  s: Stay,
  receiptR2Key?: string | null
): Record<string, unknown> {
  return {
    id: s.id,
    trip_id: s.tripId,
    name: s.name,
    stay_type: s.stayType || 'hotel',
    address: s.address ?? null,
    confirmation_code: s.confirmationCode ?? null,
    check_in: normalizeDateOnly(s.checkIn) || new Date().toISOString().slice(0, 10),
    check_out:
      normalizeDateOnly(s.checkOut) ||
      normalizeDateOnly(s.checkIn) ||
      new Date().toISOString().slice(0, 10),
    nights: Math.max(1, Math.round(Number(s.nights ?? 1))),
    cost_cash: Number(s.costCash ?? 0),
    currency: s.currency || 'USD',
    home_cost: Number(s.homeCost ?? 0),
    points_redeemed: Math.round(Number(s.pointsRedeemed ?? 0)),
    points_program: s.pointsProgram ?? null,
    cash_value_estimate: s.cashValueEstimate ?? null,
    receipt_r2_key: receiptR2Key ?? null,
    notes: s.notes ?? null,
    created_at: normalizeIsoTimestamp(s.createdAt),
    updated_at: new Date().toISOString(),
  };
}

export function cloudRowToStay(
  row: Record<string, unknown>,
  localReceiptUri?: string
): Stay {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    name: String(row.name || ''),
    stayType: (row.stay_type as Stay['stayType']) || 'hotel',
    address: (row.address as string) || undefined,
    confirmationCode: (row.confirmation_code as string) || undefined,
    checkIn: normalizeDateOnly(row.check_in as string) || '',
    checkOut: normalizeDateOnly(row.check_out as string) || '',
    nights: Number(row.nights ?? 1),
    costCash: Number(row.cost_cash ?? 0),
    currency: String(row.currency || 'USD'),
    homeCost: Number(row.home_cost ?? 0),
    pointsRedeemed: Number(row.points_redeemed ?? 0),
    pointsProgram: (row.points_program as string) || undefined,
    cashValueEstimate:
      row.cash_value_estimate !== null && row.cash_value_estimate !== undefined
        ? Number(row.cash_value_estimate)
        : undefined,
    receiptUri: localReceiptUri || undefined,
    notes: (row.notes as string) || undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function expenseToCloudRow(
  e: Expense,
  userId: string,
  receiptR2Key?: string | null
): Record<string, unknown> {
  return {
    id: e.id,
    trip_id: e.tripId,
    created_by: userId,
    merchant: e.merchant,
    category: e.category || 'dining',
    local_amount: Number(e.localAmount ?? 0),
    local_currency: e.localCurrency || 'USD',
    home_amount: Number(e.homeAmount ?? 0),
    home_currency: e.homeCurrency || 'USD',
    fx_rate_used: Number(e.fxRateUsed ?? 1),
    expense_date: normalizeDateOnly(e.expenseDate) || new Date().toISOString().slice(0, 10),
    payment_method: e.paymentMethod ?? null,
    points_earned: Math.round(Number(e.pointsEarned ?? 0)),
    receipt_r2_key: receiptR2Key ?? null,
    receipt_raw_text: e.receiptRawText ?? null,
    notes: e.notes ?? null,
    is_shared: Boolean(e.isShared),
    author_name: e.authorName ?? null,
    created_at: normalizeIsoTimestamp(e.createdAt),
    updated_at: new Date().toISOString(),
  };
}

export function cloudRowToExpense(
  row: Record<string, unknown>,
  localReceiptUri?: string
): Expense {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    merchant: String(row.merchant || ''),
    category: (row.category as Expense['category']) || 'dining',
    localAmount: Number(row.local_amount ?? 0),
    localCurrency: String(row.local_currency || 'USD'),
    homeAmount: Number(row.home_amount ?? 0),
    homeCurrency: String(row.home_currency || 'USD'),
    fxRateUsed: Number(row.fx_rate_used ?? 1),
    expenseDate: normalizeDateOnly(row.expense_date as string) || '',
    paymentMethod: (row.payment_method as string) || undefined,
    pointsEarned: Number(row.points_earned ?? 0),
    receiptUri: localReceiptUri || undefined,
    receiptRawText: (row.receipt_raw_text as string) || undefined,
    notes: (row.notes as string) || undefined,
    isShared: Boolean(row.is_shared),
    authorId: (row.created_by as string) || undefined,
    authorName: (row.author_name as string) || undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function memoryToCloudRow(
  m: Memory,
  userId: string,
  photoR2Key?: string | null,
  thumbR2Key?: string | null
): Record<string, unknown> {
  return {
    id: m.id,
    trip_id: m.tripId,
    stop_id: m.stopId ?? null,
    author_id: userId,
    title: m.title,
    note: m.note,
    captured_at: normalizeIsoTimestamp(m.capturedAt),
    place_name: m.placeName ?? null,
    lat: m.lat ?? null,
    lng: m.lng ?? null,
    photo_r2_key: photoR2Key ?? null,
    thumb_r2_key: thumbR2Key ?? null,
    illustration_key: m.illustrationKey ?? null,
    mood_sticker: m.moodSticker || '🌅 Core Memory',
    is_highlight: Boolean(m.isHighlight),
    author_name: m.authorName ?? null,
    created_at: normalizeIsoTimestamp(m.createdAt),
    updated_at: new Date().toISOString(),
  };
}

export function cloudRowToMemory(
  row: Record<string, unknown>,
  localPhotoUri?: string,
  localThumbUri?: string
): Memory {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    stopId: (row.stop_id as string) || undefined,
    title: String(row.title || ''),
    note: String(row.note || ''),
    capturedAt: String(row.captured_at || row.created_at || new Date().toISOString()),
    placeName: (row.place_name as string) || undefined,
    lat: row.lat !== null && row.lat !== undefined ? Number(row.lat) : undefined,
    lng: row.lng !== null && row.lng !== undefined ? Number(row.lng) : undefined,
    photoUri: localPhotoUri || undefined,
    thumbUri: localThumbUri || undefined,
    illustrationKey: (row.illustration_key as Memory['illustrationKey']) || undefined,
    moodSticker: String(row.mood_sticker || '🌅 Core Memory'),
    isHighlight: Boolean(row.is_highlight),
    authorName: (row.author_name as string) || undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function loyaltyToCloudRow(
  acc: LoyaltyAccount,
  userId: string
): Record<string, unknown> {
  return {
    id: acc.id,
    user_id: userId,
    program_name: acc.programName,
    category: acc.category || 'airline',
    member_number: acc.memberNumber ?? null,
    balance: Math.round(Number(acc.balance ?? 0)),
    unit_label: acc.unitLabel || 'mi',
    updated_at: normalizeIsoTimestamp(acc.updatedAt),
  };
}

export function cloudRowToLoyalty(row: Record<string, unknown>): LoyaltyAccount {
  return {
    id: String(row.id),
    programName: String(row.program_name || ''),
    category: (row.category as LoyaltyAccount['category']) || 'airline',
    memberNumber: (row.member_number as string) || undefined,
    balance: Number(row.balance ?? 0),
    unitLabel: (row.unit_label as LoyaltyAccount['unitLabel']) || 'mi',
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export function validateBackupSnapshot(raw: unknown): LocalBackupSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.trips)) return null;
  return {
    schemaVersion: 2,
    app: "Wanderer's Ledger",
    exportedAt: String(obj.exportedAt || new Date().toISOString()),
    trips: obj.trips as Trip[],
    flights: Array.isArray(obj.flights) ? (obj.flights as Flight[]) : [],
    transports: Array.isArray(obj.transports) ? (obj.transports as TransportLeg[]) : [],
    stops: Array.isArray(obj.stops) ? (obj.stops as TripStop[]) : [],
    stays: Array.isArray(obj.stays) ? (obj.stays as Stay[]) : [],
    expenses: Array.isArray(obj.expenses) ? (obj.expenses as Expense[]) : [],
    memories: Array.isArray(obj.memories) ? (obj.memories as Memory[]) : [],
    loyaltyAccounts: Array.isArray(obj.loyaltyAccounts)
      ? (obj.loyaltyAccounts as LoyaltyAccount[])
      : [],
    fxSnapshots:
      obj.fxSnapshots && typeof obj.fxSnapshots === 'object' && !Array.isArray(obj.fxSnapshots)
        ? (obj.fxSnapshots as Record<string, Record<string, number>>)
        : undefined,
  };
}
