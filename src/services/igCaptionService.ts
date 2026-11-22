import { DistanceUnit, Flight, Memory, TransportLeg, Trip } from '../types/models';
import {
  formatDistanceValue,
  getTransportModeEmoji,
  milesToKm,
} from './distanceUtils';
import {
  formatEditorialDateRange,
  formatLocationLabel,
  getTripDaysCount,
  isGenericPlaceholderNote,
} from './igStudioHelpers';

export type CaptionTone = 'aesthetic' | 'storyteller' | 'fun' | 'stats';

export interface CaptionToneOption {
  id: CaptionTone;
  label: string;
  emoji: string;
}

export const CAPTION_TONES: CaptionToneOption[] = [
  { id: 'aesthetic', label: 'Aesthetic', emoji: '✨' },
  { id: 'storyteller', label: 'Storyteller', emoji: '📖' },
  { id: 'fun', label: 'Fun & Punchy', emoji: '🎉' },
  { id: 'stats', label: 'Route Stats', emoji: '✈️' },
];

export interface DraftCaptionInput {
  trip: Trip;
  memories: Memory[];
  flights: Flight[];
  transports?: TransportLeg[];
  distanceUnit?: DistanceUnit;
  tone: CaptionTone;
  includeHashtags: boolean;
  includeWatermarkTag: boolean;
  variantIndex?: number;
}

function slugTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function uniqueStrings(items: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item?.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function buildHashtags(
  trip: Trip,
  memories: Memory[],
  includeWatermarkTag: boolean
): string {
  const cityTag = slugTag(trip.destinationCity);
  const countryTag = slugTag(trip.destinationCountry);
  const vibeMap: Record<Trip['vibe'], string[]> = {
    japan: ['japantravel', 'kyotodiaries'],
    coastal: ['coastalvibes', 'seasideescape'],
    alpine: ['mountainmagic', 'alpinelife'],
    tropical: ['islandtime', 'sunsoaked'],
    desert: ['goldenhour', 'desertglow'],
    city: ['cityescapes', 'urbanwanderer'],
  };

  const rawTags = [
    cityTag,
    countryTag,
    cityTag && countryTag && cityTag !== countryTag ? `${cityTag}trip` : cityTag ? `${cityTag}trip` : '',
    ...(vibeMap[trip.vibe] ?? []),
    'travelgram',
    'postcardfromtheworld',
    memories.length > 1 ? 'photodump' : 'travelmemories',
  ].filter(Boolean);

  const unique = Array.from(new Set(rawTags)).slice(0, includeWatermarkTag ? 7 : 8);
  if (includeWatermarkTag) {
    unique.push('wanderersledger');
  }
  return unique.map((t) => `#${t}`).join(' ');
}

/**
 * Generates a ready-to-paste Instagram caption 100% offline from the user's trip,
 * selected Polaroid memories, flights, and ground/rail transport routes. Strictly excludes private spend/budgets.
 */
export function generateOfflineIgCaption(input: DraftCaptionInput): string {
  const {
    trip,
    memories,
    flights,
    transports = [],
    distanceUnit = 'km',
    tone,
    includeHashtags,
    includeWatermarkTag,
  } = input;
  const variant = Math.abs(input.variantIndex ?? 0) % 3;

  const city = trip.destinationCity;
  const country = trip.destinationCountry;
  const locationLabel = formatLocationLabel(city, country);
  const dateRangeLabel = formatEditorialDateRange(trip.startDate, trip.endDate);
  const flag = trip.flagEmoji || '✈️';
  const days = getTripDaysCount(trip.startDate, trip.endDate);
  const totalDistanceKm =
    flights.reduce((acc, f) => acc + milesToKm(f.distanceMiles || 0), 0) +
    transports.reduce((acc, t) => acc + (t.distanceKm || 0), 0);
  const distanceVal = formatDistanceValue(totalDistanceKm, distanceUnit);
  const distanceWord = distanceUnit === 'mi' ? 'miles' : 'km';

  const places = uniqueStrings(memories.map((m) => m.placeName)).slice(0, 3);
  const titles = uniqueStrings(memories.map((m) => m.title)).slice(0, 3);
  const moods = uniqueStrings(memories.map((m) => m.moodSticker)).slice(0, 3);
  const firstNote = memories
    .find((m) => m.note && m.note.trim().length > 6 && !isGenericPlaceholderNote(m.note))
    ?.note.trim();

  const flightRouteSummary =
    flights.length > 0
      ? uniqueStrings(flights.map((f) => `${f.originIata} → ${f.destIata}`)).slice(0, 2).join(' • ')
      : '';
  const transportRouteSummary =
    transports.length > 0
      ? uniqueStrings(
          transports.map((t) => `${getTransportModeEmoji(t.mode)} ${t.origin} → ${t.destination}`)
        )
          .slice(0, 2)
          .join(' • ')
      : '';
  const routeLine = flightRouteSummary
    ? `✈️ Route: ${flightRouteSummary}${transportRouteSummary ? ` • ${transportRouteSummary}` : ''}`
    : transportRouteSummary
    ? `Route: ${transportRouteSummary}`
    : `🗺️ Destination: ${locationLabel}`;

  let body = '';

  if (tone === 'aesthetic') {
    const openers = [
      `postcards from ${city.toLowerCase()} ${flag}`,
      `${days} sunlit days in ${city.toLowerCase()} ${flag}✨`,
      `currently daydreaming about ${city.toLowerCase()} ${flag}`,
    ];
    const lines = [openers[variant]];
    if (places.length > 0) {
      lines.push(`📍 ${places.join(' · ')}`);
    } else {
      lines.push(`📍 ${locationLabel}`);
    }
    if (firstNote) {
      lines.push(`\n“${firstNote}”`);
    } else if (moods.length > 0) {
      lines.push(`\n${moods.join('  ')}`);
    }
    body = lines.join('\n');
  } else if (tone === 'storyteller') {
    const openers = [
      `Still smiling about ${trip.title} ${flag}`,
      `${days} days in ${city}, and every corner felt like a postcard ${flag}`,
      `Tucking these ${city} moments straight into my favorite memories ${flag}`,
    ];
    const lines = [openers[variant]];
    if (firstNote) {
      lines.push(`\n${firstNote}`);
    }
    if (titles.length > 0) {
      lines.push(`\nFavorite chapters:\n${titles.map((t) => `• ${t}`).join('\n')}`);
    }
    if (places.length > 0) {
      lines.push(`\n📍 ${places.join(' • ')}`);
    }
    body = lines.join('\n');
  } else if (tone === 'fun') {
    const openers = [
      `${city} really showed off for this one ${flag}🔥`,
      `BRB, mentally still in ${city} ${flag}✈️`,
      `Zero regrets, maximum memories in ${city} ${flag}✨`,
    ];
    const lines = [openers[variant]];
    if (moods.length > 0) {
      lines.push(`The vibe: ${moods.join(' + ')}`);
    }
    if (titles.length > 0) {
      lines.push(`Highlights: ${titles.join(', ')}`);
    } else if (firstNote) {
      lines.push(firstNote);
    }
    lines.push(`📍 ${locationLabel}`);
    body = lines.join('\n\n');
  } else {
    // 'stats' — Journey Route & Distance Flex (ZERO private spend!)
    const openers = [
      `Trip wrapped: ${trip.title} ${flag}`,
      `New passport stamp unlocked: ${country} ${flag}`,
      `${city} by the numbers ${flag}✈️`,
    ];
    const statLines = [
      routeLine,
      distanceVal > 0
        ? `🌍 Distance ${flights.length > 0 && transports.length === 0 ? 'flown' : 'traveled'}: ${distanceVal.toLocaleString()} ${distanceWord}`
        : null,
      `🗓️ ${days} ${days === 1 ? 'day' : 'days'} (${dateRangeLabel})`,
      memories.length > 0
        ? `📸 ${memories.length} core ${memories.length === 1 ? 'memory' : 'memories'} captured`
        : null,
    ].filter(Boolean);

    body = `${openers[variant]}\n\n${statLines.join('\n')}`;
    if (moods.length > 0) {
      body += `\n\nMood: ${moods[0]}`;
    }
  }

  if (includeHashtags) {
    const tags = buildHashtags(trip, memories, includeWatermarkTag);
    body = `${body}\n\n${tags}`;
  }

  return body;
}

/**
 * Optional AI-assisted caption polish via Supabase Edge Function `polish-ig-caption`.
 * Falls back cleanly to a fresh offline variation if offline or cloud AI is not configured yet.
 */
export async function polishCaptionWithAi(
  input: DraftCaptionInput,
  currentDraft: string
): Promise<{ caption: string; source: 'ai' | 'offline_variation' }> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnon) {
    try {
      let token: string | undefined;
      try {
        // Lazy require avoids pulling Expo native auth modules into pure unit tests
        const { getSupabaseClient } = require('./authService') as {
          getSupabaseClient: () => {
            auth: { getSession: () => Promise<{ data: { session?: { access_token?: string } } }> };
          } | null;
        };
        const sb = getSupabaseClient();
        if (sb) {
          const { data: sessionData } = await sb.auth.getSession();
          token = sessionData.session?.access_token;
        }
      } catch {
        // Proceed without JWT if unavailable
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${supabaseUrl}/functions/v1/polish-ig-caption`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnon,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tripTitle: input.trip.title,
          destinationCity: input.trip.destinationCity,
          destinationCountry: input.trip.destinationCountry,
          flagEmoji: input.trip.flagEmoji,
          startDate: input.trip.startDate,
          endDate: input.trip.endDate,
          tone: input.tone,
          includeHashtags: input.includeHashtags,
          includeWatermarkTag: input.includeWatermarkTag,
          currentDraft,
          memories: input.memories.slice(0, 6).map((m) => ({
            title: m.title,
            placeName: m.placeName,
            note: m.note,
            moodSticker: m.moodSticker,
          })),
          routes: input.flights.slice(0, 4).map((f) => `${f.originIata}->${f.destIata}`),
          totalMiles: input.flights.reduce((s, f) => s + (f.distanceMiles || 0), 0),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        if (typeof json?.caption === 'string' && json.caption.trim().length > 10) {
          return { caption: json.caption.trim(), source: 'ai' };
        }
      }
    } catch {
      // Gracefully fall back to offline smart variation
    }
  }

  const nextDraft = generateOfflineIgCaption({
    ...input,
    variantIndex: (input.variantIndex ?? 0) + 1,
  });
  return { caption: nextDraft, source: 'offline_variation' };
}
