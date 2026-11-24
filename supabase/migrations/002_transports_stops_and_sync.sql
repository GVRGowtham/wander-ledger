-- Wanderer's Ledger Cloud Schema Migration 002
-- Adds v0.4.0+ multi-mode transports, multi-city trip stops, synced user preferences,
-- missing columns from v0.4.x models, performance indexes, and RLS policies.
-- Safe to run idempotently after 001_init.sql.

-- 1. Backfill newer columns on existing v0.1 tables
alter table public.trips
  add column if not exists co_travelers jsonb not null default '[]'::jsonb;

alter table public.flights
  add column if not exists raw_barcode text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.stays
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.expenses
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.memories
  add column if not exists stop_id text,
  add column if not exists illustration_key text,
  add column if not exists author_name text,
  add column if not exists updated_at timestamptz not null default now();

-- 2. Ground & Sea Transports (Train, Bus, Ferry, Rental Car, Own Car Road Trips)
create table if not exists public.transports (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  mode text not null default 'train' check (mode in ('train', 'bus', 'ferry', 'rental_car', 'own_car')),
  title text not null,
  operator_name text,
  reference_code text,
  origin text not null,
  destination text not null,
  start_date text not null,
  end_date text,
  seat_or_vehicle text,
  distance_km integer,
  cost_amount numeric(12,2),
  currency text,
  home_cost numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Multi-City Trip Stops / Hops (powers photo stop filters + multi-country Passport stamps)
create table if not exists public.trip_stops (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  city_name text not null,
  start_date date,
  end_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Synced User Travel Preferences (Home Currency, km/mi, Wi-Fi Photo Sync)
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  home_currency text not null default 'USD',
  distance_unit text not null default 'km' check (distance_unit in ('km', 'mi')),
  wifi_only_photo_sync boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 5. Enable Row-Level Security on new tables
alter table public.transports enable row level security;
alter table public.trip_stops enable row level security;
alter table public.user_preferences enable row level security;

-- 6. RLS Policies (idempotent via drop-if-exists)
drop policy if exists "trip_member_all_transports" on public.transports;
create policy "trip_member_all_transports" on public.transports
  for all using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

drop policy if exists "trip_member_all_stops" on public.trip_stops;
create policy "trip_member_all_stops" on public.trip_stops
  for all using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

drop policy if exists "owner_user_preferences" on public.user_preferences;
create policy "owner_user_preferences" on public.user_preferences
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "trip_owner_manage_members" on public.trip_members;
create policy "trip_owner_manage_members" on public.trip_members
  for all using (
    public.can_access_trip(trip_id)
    or user_id = auth.uid()
    or lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    exists (
      select 1 from public.trips t
      where t.id = trip_id and t.owner_id = auth.uid()
    )
  );

-- 7. Indexes for fast incremental & full cloud sync pulls
create index if not exists idx_trips_owner_updated on public.trips (owner_id, updated_at desc);
create index if not exists idx_flights_trip_id on public.flights (trip_id);
create index if not exists idx_transports_trip_id on public.transports (trip_id);
create index if not exists idx_trip_stops_trip_id on public.trip_stops (trip_id);
create index if not exists idx_stays_trip_id on public.stays (trip_id);
create index if not exists idx_expenses_trip_id on public.expenses (trip_id);
create index if not exists idx_memories_trip_id on public.memories (trip_id);
create index if not exists idx_loyalty_user_id on public.loyalty_accounts (user_id);
