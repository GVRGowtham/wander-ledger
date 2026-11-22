// Supabase Edge Function: enrich-flight
// Checks shared Postgres `flight_cache` first so co-travelers & repeat lookups cost 0 API credits.
// Falls back cleanly to AirLabs free-tier (1,000 req/mo) when cache misses.
// Deploy via: supabase functions deploy enrich-flight

// @ts-nocheck — Deno Edge Runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { flightNumber, flightDate } = await req.json();
    const cleanFlight = String(flightNumber || '').replace(/\s+/g, '').toUpperCase();
    const dateKey = String(flightDate || new Date().toISOString().slice(0, 10));
    const cacheKey = `${cleanFlight}_${dateKey}`;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Check shared flight_cache first
    const { data: cached } = await supabase
      .from('flight_cache')
      .select('payload, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return new Response(JSON.stringify({ ...cached.payload, cached: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Call AirLabs free-tier API if configured
    const airlabsKey = Deno.env.get('AIRLABS_API_KEY');
    if (!airlabsKey) {
      return new Response(JSON.stringify({ enriched: false, reason: 'no_api_key' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(
      `https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(cleanFlight)}&api_key=${encodeURIComponent(airlabsKey)}`
    );
    const json = await res.json();
    const f = json?.response;

    if (!f) {
      return new Response(JSON.stringify({ enriched: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      departureTime: f.dep_time_utc || f.dep_time,
      arrivalTime: f.arr_time_utc || f.arr_time,
      durationMinutes: f.duration,
      terminal: f.dep_terminal ? `T${f.dep_terminal}` : undefined,
      gate: f.dep_gate || undefined,
      aircraft: f.aircraft_icao || undefined,
      status: f.status === 'landed' ? 'completed' : f.delayed ? 'delayed' : 'scheduled',
      provider: 'airlabs',
    };

    // Cache 30 mins for active/upcoming flights, 365 days for landed/past flights
    const ttlMs = payload.status === 'completed' ? 365 * 86400000 : 30 * 60000;
    await supabase.from('flight_cache').upsert({
      cache_key: cacheKey,
      payload,
      provider: 'airlabs',
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });

    return new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
