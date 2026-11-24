-- Wanderer's Ledger Cloud Schema Migration 003
-- Enforces Editor vs. Viewer co-traveler roles and Personal vs. Shared trip expenses in Postgres RLS.
-- Safe to run idempotently after 001_init.sql and 002_transports_stops_and_sync.sql.

-- 1. Add co_traveler_roles on trips and Personal/Shared metadata on expenses
alter table public.trips
  add column if not exists co_traveler_roles jsonb not null default '{}'::jsonb;

alter table public.expenses
  add column if not exists is_shared boolean not null default false,
  add column if not exists author_name text;

create index if not exists idx_trip_members_email on public.trip_members (lower(invited_email));
create index if not exists idx_expenses_trip_shared on public.expenses (trip_id, is_shared);

-- 2. Helper function: true only for trip Owner or invited 'editor' co-travelers (excludes 'viewer')
create or replace function public.can_edit_trip(target_trip_id text)
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
      and m.role in ('owner', 'editor')
      and (
        m.user_id = auth.uid()
        or lower(m.invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

-- 3. Tighten Trips RLS: Viewers read-only, Editors can update trip metadata, only Owner can insert/delete
drop policy if exists "trip_member_all_trips" on public.trips;
drop policy if exists "trip_select_members" on public.trips;
drop policy if exists "trip_insert_owner" on public.trips;
drop policy if exists "trip_update_editors" on public.trips;
drop policy if exists "trip_delete_owner" on public.trips;

create policy "trip_select_members" on public.trips
  for select using (public.can_access_trip(id));

create policy "trip_insert_owner" on public.trips
  for insert with check (owner_id = auth.uid());

create policy "trip_update_editors" on public.trips
  for update using (public.can_edit_trip(id))
  with check (public.can_edit_trip(id));

create policy "trip_delete_owner" on public.trips
  for delete using (owner_id = auth.uid());

-- 4. Tighten Flights, Transports, Stops, Stays, Memories RLS:
--    SELECT -> Owner, Editor, or Viewer (can_access_trip)
--    INSERT / UPDATE / DELETE -> Owner or Editor only (can_edit_trip)
drop policy if exists "trip_member_all_flights" on public.flights;
drop policy if exists "flights_select_members" on public.flights;
drop policy if exists "flights_write_editors" on public.flights;
create policy "flights_select_members" on public.flights
  for select using (public.can_access_trip(trip_id));
create policy "flights_write_editors" on public.flights
  for all using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

drop policy if exists "trip_member_all_transports" on public.transports;
drop policy if exists "transports_select_members" on public.transports;
drop policy if exists "transports_write_editors" on public.transports;
create policy "transports_select_members" on public.transports
  for select using (public.can_access_trip(trip_id));
create policy "transports_write_editors" on public.transports
  for all using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

drop policy if exists "trip_member_all_stops" on public.trip_stops;
drop policy if exists "stops_select_members" on public.trip_stops;
drop policy if exists "stops_write_editors" on public.trip_stops;
create policy "stops_select_members" on public.trip_stops
  for select using (public.can_access_trip(trip_id));
create policy "stops_write_editors" on public.trip_stops
  for all using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

drop policy if exists "trip_member_all_stays" on public.stays;
drop policy if exists "stays_select_members" on public.stays;
drop policy if exists "stays_write_editors" on public.stays;
create policy "stays_select_members" on public.stays
  for select using (public.can_access_trip(trip_id));
create policy "stays_write_editors" on public.stays
  for all using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

drop policy if exists "trip_member_all_memories" on public.memories;
drop policy if exists "memories_select_members" on public.memories;
drop policy if exists "memories_write_editors" on public.memories;
create policy "memories_select_members" on public.memories
  for select using (public.can_access_trip(trip_id));
create policy "memories_write_editors" on public.memories
  for all using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

-- 5. Expenses RLS:
--    - Personal expenses (is_shared = false): visible ONLY to created_by = auth.uid()
--    - Shared expenses (is_shared = true): visible to Owner & Editor co-travelers (can_edit_trip)
--    - Viewers: NEVER see any expenses (neither personal nor shared)
--    - Write/Delete: only the expense author (or trip owner deleting a shared expense)
drop policy if exists "trip_member_private_expenses" on public.expenses;
drop policy if exists "expenses_select_personal_or_shared" on public.expenses;
drop policy if exists "expenses_insert_editors" on public.expenses;
drop policy if exists "expenses_update_author" on public.expenses;
drop policy if exists "expenses_delete_author_or_owner" on public.expenses;

create policy "expenses_select_personal_or_shared" on public.expenses
  for select using (
    created_by = auth.uid()
    or (is_shared = true and public.can_edit_trip(trip_id))
  );

create policy "expenses_insert_editors" on public.expenses
  for insert with check (
    created_by = auth.uid()
    and public.can_edit_trip(trip_id)
  );

create policy "expenses_update_author" on public.expenses
  for update using (created_by = auth.uid())
  with check (created_by = auth.uid() and public.can_edit_trip(trip_id));

create policy "expenses_delete_author_or_owner" on public.expenses
  for delete using (
    created_by = auth.uid()
    or (
      is_shared = true
      and exists (
        select 1 from public.trips t
        where t.id = trip_id and t.owner_id = auth.uid()
      )
    )
  );
