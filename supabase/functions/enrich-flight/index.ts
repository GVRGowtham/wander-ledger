// Supabase Edge Function: enrich-flight
// Shared cached flight lookup that populates exact departure/arrival times, terminal, gate,
// and aircraft type via AirLabs free tier (1,000 req/mo) while caching every response in
// `public.flight_cache` so duplicate lookups across users cost $0.
//
// Deploy alongside r2-presign:
//   npx supabase secrets set AIRLABS_API_KEY=<YOUR_KEY>
//   npx supabase functions deploy enrich-flight

// @ts-nocheck — Deno Edge Runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { airlineCode, flightNumber, flightDate, originIata, destIata } = await req.json();
    const cleanNum = String(flightNumber || '')
      .toUpperCase()
      .replace(/\s+/g, '');
    const cleanDate = String(flightDate || '').slice(0, 10);

    if (!cleanNum || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return new Response(
        JSON.stringify({ error: 'flightNumber and YYYY-MM-DD flightDate are required' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cacheKey = `${cleanNum}_${cleanDate}`;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Check shared flight_cache first ($0 external API calls on cache hit)
    const { data: cached } = await supabase
      .from('flight_cache')
      .select('payload, provider, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cached && cached.expires_at && new Date(cached.expires_at).getTime() > Date.now()) {
      return new Response(
        JSON.stringify({
          ...(cached.payload || {}),
          provider: `${cached.provider || 'cache'}-cached`,
        }),
        { headers: CORS_HEADERS }
      );
    }

    // 2. Fetch live schedule/status from AirLabs if API key is configured
    const airlabsKey = Deno.env.get('AIRLABS_API_KEY');
    if (!airlabsKey) {
      return new Response(
        JSON.stringify({ enriched: false, reason: 'no_provider_configured' }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const apiUrl = `https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(
      cleanNum
    )}&api_key=${encodeURIComponent(airlabsKey)}`;
    const apiRes = await fetch(apiUrl);
    if (!apiRes.ok) {
      return new Response(
        JSON.stringify({ enriched: false, reason: `provider_http_${apiRes.status}` }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const json = await apiRes.json();
    const f = json?.response;
    if (!f || (!f.dep_time && !f.dep_time_utc)) {
      return new Response(
        JSON.stringify({ enriched: false, reason: 'flight_not_found' }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // Match origin/dest if provided to prevent mismatched reused flight numbers
    if (originIata && f.dep_iata && String(f.dep_iata).toUpperCase() !== String(originIata).toUpperCase()) {
      return new Response(
        JSON.stringify({ enriched: false, reason: 'origin_mismatch' }),
        { status: 200, headers: CORS_HEADERS }
      );
    }
    if (destIata && f.arr_iata && String(f.arr_iata).toUpperCase() !== String(destIata).toUpperCase()) {
      return new Response(
        JSON.stringify({ enriched: false, reason: 'dest_mismatch' }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    const normalizeTime = (raw: string | undefined, fallbackDate: string): string => {
      if (!raw) return `${fallbackDate}T10:30:00`;
      const trimmed = String(raw).trim();
      if (trimmed.includes(' ')) return trimmed.replace(' ', 'T');
      return trimmed;
    };

    const payload = {
      airlineCode: String(airlineCode || f.airline_iata || cleanNum.slice(0, 2)),
      flightNumber: cleanNum,
      departureTime: normalizeTime(f.dep_time || f.dep_time_utc, cleanDate),
      arrivalTime: normalizeTime(f.arr_time || f.arr_time_utc, cleanDate),
      durationMinutes: Number(f.duration || 0) || undefined,
      terminal: f.dep_terminal ? `T${String(f.dep_terminal).replace(/^T/i, '')}` : undefined,
      gate: f.dep_gate ? String(f.dep_gate) : undefined,
      aircraft: f.aircraft_icao ? String(f.aircraft_icao) : undefined,
      status:
        f.status === 'landed'
          ? 'completed'
          : Number(f.delayed || 0) > 15
            ? 'delayed'
            : 'scheduled',
      provider: 'airlabs',
    };

    // Cache for 6 hours if flight is within 48h, else 24 hours
    const depMs = Date.parse(`${cleanDate}T00:00:00Z`);
    const within48h = Math.abs(depMs - Date.now()) < 48 * 3600 * 1000;
    const ttlHours = within48h ? 6 : 24;
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    await supabase.from('flight_cache').upsert(
      {
        cache_key: cacheKey,
        payload,
        provider: 'airlabs',
        cached_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'cache_key' }
    );

    return new Response(JSON.stringify(payload), { headers: CORS_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
