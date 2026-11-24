export interface PlaceSuggestion {
  label: string;
  address: string;
  city?: string;
  country?: string;
}

export interface PlaceLookupOutcome {
  results: PlaceSuggestion[];
  status: 'found' | 'not_found' | 'offline_or_error';
}

function buildPhotonAddress(props: Record<string, any>): PlaceSuggestion | null {
  const name = typeof props.name === 'string' ? props.name.trim() : '';
  const streetParts = [props.housenumber, props.street]
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
    .map((v) => String(v).trim());
  const locality =
    props.locality || props.district || props.suburb || props.city || props.town || props.village || '';
  const city = props.city || props.town || props.village || props.county || '';
  const state = props.state || '';
  const postcode = props.postcode || '';
  const country = props.country || '';

  const parts: string[] = [];
  if (streetParts.length > 0) parts.push(streetParts.join(' '));
  if (locality && !parts.some((p) => p.toLowerCase().includes(String(locality).toLowerCase()))) {
    parts.push(String(locality).trim());
  }
  if (city && !parts.some((p) => p.toLowerCase().includes(String(city).toLowerCase()))) {
    parts.push(String(city).trim());
  }
  if (state && !parts.some((p) => p.toLowerCase().includes(String(state).toLowerCase()))) {
    parts.push(String(state).trim());
  }
  if (postcode) parts.push(String(postcode).trim());
  if (country && !parts.some((p) => p.toLowerCase().includes(String(country).toLowerCase()))) {
    parts.push(String(country).trim());
  }

  const address = parts.join(', ');
  if (!address && !name) return null;

  return {
    label: name && address ? `${name} — ${address}` : address || name,
    address: address || name,
    city: city ? String(city).trim() : undefined,
    country: country ? String(country).trim() : undefined,
  };
}

/**
 * Zero-cost, zero-API-key place address lookup backed by Komoot Photon (OpenStreetMap).
 * Fails gracefully when offline or when smaller boutique homestays aren't mapped on OSM.
 */
export async function lookupPropertyAddresses(
  propertyName: string,
  regionHint?: string
): Promise<PlaceLookupOutcome> {
  const cleanName = propertyName.trim();
  const cleanHint = (regionHint || '').trim();
  const query = [cleanName, cleanHint].filter(Boolean).join(', ');
  if (query.length < 2) {
    return { results: [], status: 'not_found' };
  }

  const fetchPhoton = async (q: string): Promise<PlaceSuggestion[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=4&lang=en`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'WanderersLedger/0.6.8 (mobile travel journal)',
        },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const features: any[] = Array.isArray(data?.features) ? data.features : [];
      const seen = new Set<string>();
      const out: PlaceSuggestion[] = [];
      for (const feat of features) {
        const s = buildPhotonAddress(feat?.properties || {});
        if (!s) continue;
        const key = s.address.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
        if (out.length >= 3) break;
      }
      return out;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let results = await fetchPhoton(query);
    // If combined "Property, Region" missed on OSM, retry with property name alone
    if (results.length === 0 && cleanName && cleanHint) {
      results = await fetchPhoton(cleanName);
    }
    return {
      results,
      status: results.length > 0 ? 'found' : 'not_found',
    };
  } catch {
    return { results: [], status: 'offline_or_error' };
  }
}

/**
 * Builds an official zero-API-key Google Maps search URL for a hotel/stay.
 * Opens natively in the Google Maps app on Android & iOS.
 */
export function buildGoogleMapsSearchUrl(
  propertyName: string,
  address?: string,
  fallbackLocation?: string
): string {
  const name = propertyName.trim();
  const addr = (address || '').trim();
  const fallback = (fallbackLocation || '').trim();

  const parts: string[] = [];
  if (name) parts.push(name);
  if (addr) {
    if (!name || !addr.toLowerCase().includes(name.toLowerCase())) {
      parts.push(addr);
    }
  } else if (fallback) {
    if (!name || !fallback.toLowerCase().includes(name.toLowerCase())) {
      parts.push(fallback);
    }
  }

  const query = parts.join(', ').trim() || 'hotel';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export async function openPropertyInGoogleMaps(
  propertyName: string,
  address?: string,
  fallbackLocation?: string
): Promise<boolean> {
  const url = buildGoogleMapsSearchUrl(propertyName, address, fallbackLocation);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Linking } = require('react-native');
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Appends country flag emojis to a trip title without duplicating any flag already present in the title.
 * Fixes titles like "Coorg Trip 🇮🇳" + "🇮🇳" rendering as "Coorg Trip 🇮🇳 🇮🇳".
 */
export function formatTripTitleWithFlags(title: string, flagsLabel?: string): string {
  const cleanTitle = (title || '').trim();
  const cleanFlags = (flagsLabel || '').trim();
  if (!cleanFlags) return cleanTitle;

  const missingFlags = cleanFlags
    .split(/\s+/)
    .filter((flag) => flag && !cleanTitle.includes(flag));

  if (missingFlags.length === 0) return cleanTitle;
  return `${cleanTitle} ${missingFlags.join(' ')}`.trim();
}
