import { lookupAirport } from '../db/airportsData';
import { ParsedBoardingPass } from '../types/models';

export interface FlightEnrichmentResult {
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  terminal?: string;
  gate?: string;
  aircraft?: string;
  status: 'scheduled' | 'completed' | 'delayed';
  enrichedOnline: boolean;
  provider?: string;
}

/**
 * Hybrid Flight Enrichment:
 * 1. When online & configured (Supabase Edge Function `enrich-flight` OR AirLabs free-tier key),
 *    fetches live scheduled/actual departure & arrival times, terminal, gate, and aircraft type.
 * 2. Always falls back gracefully to deterministic offline schedules derived from the bundled
 *    global airport database so boarding pass scanning works 100% in airplane mode.
 */
export async function enrichFlightDetails(
  parsed: ParsedBoardingPass
): Promise<FlightEnrichmentResult> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const airlabsKey = process.env.EXPO_PUBLIC_AIRLABS_API_KEY;

  // Attempt 1: Shared cached Supabase Edge Function (avoids duplicate external API calls)
  if (supabaseUrl && supabaseAnon) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${supabaseUrl}/functions/v1/enrich-flight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnon}`,
        },
        body: JSON.stringify({
          airlineCode: parsed.airlineCode,
          flightNumber: parsed.flightNumber.replace(/\s+/g, ''),
          flightDate: parsed.flightDate,
          originIata: parsed.originIata,
          destIata: parsed.destIata,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data?.departureTime && data?.arrivalTime) {
          return {
            departureTime: data.departureTime,
            arrivalTime: data.arrivalTime,
            durationMinutes: data.durationMinutes || parsed.estimatedDurationMin,
            terminal: data.terminal,
            gate: data.gate,
            aircraft: data.aircraft,
            status: data.status || 'scheduled',
            enrichedOnline: true,
            provider: data.provider || 'supabase-cache',
          };
        }
      }
    } catch {
      // Fall through to next provider or offline baseline
    }
  }

  // Attempt 2: Direct AirLabs free-tier lookup (1,000 req/mo free) if user supplied a key
  if (airlabsKey) {
    try {
      const iataCode = parsed.flightNumber.replace(/\s+/g, '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(iataCode)}&api_key=${encodeURIComponent(airlabsKey)}`,
        { signal: controller.signal }
      );
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        const f = json?.response;
        if (f?.dep_time && f?.arr_time) {
          return {
            departureTime: f.dep_time,
            arrivalTime: f.arr_time,
            durationMinutes: f.duration || parsed.estimatedDurationMin,
            terminal: f.dep_terminal ? `T${f.dep_terminal}` : undefined,
            gate: f.dep_gate || undefined,
            aircraft: f.aircraft_icao || undefined,
            status: f.status === 'landed' ? 'completed' : f.delayed ? 'delayed' : 'scheduled',
            enrichedOnline: true,
            provider: 'airlabs',
          };
        }
      }
    } catch {
      // Offline fallback below
    }
  }

  // Offline Guaranteed Baseline (Instant, $0, Airplane Mode Ready)
  const origin = lookupAirport(parsed.originIata);
  const dest = lookupAirport(parsed.destIata);
  const depDate = new Date(`${parsed.flightDate}T10:30:00Z`);
  const arrDate = new Date(depDate.getTime() + parsed.estimatedDurationMin * 60000);
  const isPast = depDate.getTime() < Date.now() - 12 * 3600 * 1000;

  return {
    departureTime: depDate.toISOString(),
    arrivalTime: arrDate.toISOString(),
    durationMinutes: parsed.estimatedDurationMin,
    terminal: origin ? 'Main Terminal' : undefined,
    aircraft:
      parsed.distanceMiles > 3500
        ? 'Widebody Jet (Long-Haul)'
        : parsed.distanceMiles > 1200
        ? 'Narrowbody Jet'
        : 'Regional Jet',
    status: isPast ? 'completed' : 'scheduled',
    enrichedOnline: false,
    provider: dest ? 'offline-airport-db' : 'offline-estimate',
  };
}
