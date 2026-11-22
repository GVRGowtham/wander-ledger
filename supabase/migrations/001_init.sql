-- WanderLedger Cloud Schema (Supabase PostgreSQL 16 Free Tier)
-- Enforces Row-Level Security for Google-authenticated owners, co-travelers,
-- and read-only family postcards (which strictly exclude private expenses & receipts).

create extension if not exists "pgcrypto";

create table if not exists public.trips (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  destination_city text not null,
  destination_country text not null,
  country_code text not null,
  flag_emoji text not null default '🌍',
  start_date date not null,
  end_date date not null,
  home_currency text not null default 'USD',
  budget numeric(12,2) not null default 0,
  vibe text not null default 'city',
  cover_photo_key text,
  is_shared boolean not null default false,
  share_token text unique,
  lat double precision not null default 0,
  lng double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id text not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text not null,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (trip_id, invited_email)
);

create table if not exists public.flights (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  airline_code text not null,
  airline_name text not null,
  flight_number text not null,
  pnr text,
  origin_iata text not null,
  origin_city text not null,
  dest_iata text not null,
  dest_city text not null,
  departure_time timestamptz not null,
  arrival_time timestamptz not null,
  duration_minutes integer not null default 120,
  seat text,
  cabin_class text,
  terminal text,
  gate text,
  aircraft text,
  status text not null default 'scheduled',
  distance_miles integer not null default 0,
  miles_earned integer not null default 0,
  loyalty_program text,
  frequent_flyer_number text,
  enriched_online boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.stays (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  name text not null,
  stay_type text not null default 'hotel',
  address text,
  confirmation_code text,
  check_in date not null,
  check_out date not null,
  nights integer not null default 1,
  cost_cash numeric(12,2) not null default 0,
  currency text not null default 'USD',
  home_cost numeric(12,2) not null default 0,
  points_redeemed integer not null default 0,
  points_program text,
  cash_value_estimate numeric(12,2),
  receipt_r2_key text,
  created_at timestamptz not null default now()
);

-- Strictly private to trip owner & invited co-travelers (NEVER exposed on read-only Postcards)
create table if not exists public.expenses (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  category text not null default 'dining',
  local_amount numeric(12,2) not null default 0,
  local_currency text not null default 'USD',
  home_amount numeric(12,2) not null default 0,
  home_currency text not null default 'USD',
  fx_rate_used numeric(12,6) not null default 1,
  expense_date date not null,
  payment_method text,
  points_earned integer not null default 0,
  receipt_r2_key text,
  receipt_raw_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  note text not null,
  captured_at timestamptz not null,
  place_name text,
  lat double precision,
  lng double precision,
  photo_r2_key text,
  thumb_r2_key text,
  blurhash text,
  mood_sticker text not null default '🌅 Core Memory',
  is_highlight boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  program_name text not null,
  category text not null default 'airline',
  member_number text,
  balance integer not null default 0,
  unit_label text not null default 'mi',
  updated_at timestamptz not null default now()
);

-- Shared Flight API response cache to keep external API calls at $0/month
create table if not exists public.flight_cache (
  cache_key text primary key, -- e.g. NH105_2026-10-14
  payload jsonb not null,
  provider text not null,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Helper function: checks if current authenticated user owns or is a member of a trip
create or replace function public.can_access_trip(target_trip_id text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.trips t
    where t.id = target_trip_id and t.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.trip_members m
    where m.trip_id = target_trip_id
      and (m.user_id = auth.uid() or lower(m.invited_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.flights enable row level security;
alter table public.stays enable row level security;
alter table public.expenses enable row level security;
alter table public.memories enable row level security;
alter table public.loyalty_accounts enable row level security;

create policy "trip_member_all_trips" on public.trips
  for all using (public.can_access_trip(id))
  with check (owner_id = auth.uid());

create policy "trip_member_all_flights" on public.flights
  for all using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

create policy "trip_member_all_stays" on public.stays
  for all using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

create policy "trip_member_private_expenses" on public.expenses
  for all using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

create policy "trip_member_all_memories" on public.memories
  for all using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

create policy "owner_loyalty_accounts" on public.loyalty_accounts
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
