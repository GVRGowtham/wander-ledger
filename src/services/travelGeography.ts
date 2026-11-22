import { AIRPORTS, lookupAirport } from '../db/airportsData';
import { Flight, TransportLeg, Trip, TripStop } from '../types/models';

export interface GeoPlace {
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  lat: number;
  lng: number;
  iata?: string;
  date?: string;
}

export interface CountryStamp {
  code: string;
  country: string;
  flag: string;
  date: string;
  cities: string[];
}

export interface TransitHubSummary {
  iata: string;
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  lat: number;
  lng: number;
  date?: string;
}

export interface TripGeography {
  tripId: string;
  visitedPlaces: GeoPlace[];
  visitedCountries: CountryStamp[];
  transitHubs: TransitHubSummary[];
  flagsLabel: string;
  countriesLabel: string;
}

export interface GlobalTravelGeography {
  countryStamps: CountryStamp[];
  visitedCities: Array<GeoPlace & { tripId: string }>;
  transitHubs: TransitHubSummary[];
  byTripId: Record<string, TripGeography>;
}

/**
 * Curated offline gazetteer of popular travel cities & regions that don't have a major
 * IATA airport in AIRPORTS (e.g. Lucerne, Interlaken, Kyoto, Florence, Coorg, Heidelberg).
 */
const EXTRA_CITIES: Record<
  string,
  { city: string; country: string; countryCode: string; flag: string; lat: number; lng: number }
> = {
  // Switzerland
  lucerne: { city: 'Lucerne', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 47.0502, lng: 8.3093 },
  luzern: { city: 'Lucerne', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 47.0502, lng: 8.3093 },
  interlaken: { city: 'Interlaken', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 46.6863, lng: 7.8632 },
  zermatt: { city: 'Zermatt', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 46.0207, lng: 7.7491 },
  grindelwald: { city: 'Grindelwald', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 46.6242, lng: 8.0414 },
  lauterbrunnen: { city: 'Lauterbrunnen', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 46.5935, lng: 7.9091 },
  basel: { city: 'Basel', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 47.5596, lng: 7.5886 },
  bern: { city: 'Bern', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 46.948, lng: 7.4474 },
  montreux: { city: 'Montreux', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 46.4312, lng: 6.9107 },
  switzerland: { city: 'Switzerland', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 46.8182, lng: 8.2275 },

  // Germany
  berlin: { city: 'Berlin', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 52.52, lng: 13.405 },
  heidelberg: { city: 'Heidelberg', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 49.3988, lng: 8.6724 },
  cologne: { city: 'Cologne', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 50.9375, lng: 6.9603 },
  hamburg: { city: 'Hamburg', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 53.5511, lng: 9.9937 },
  stuttgart: { city: 'Stuttgart', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 48.7758, lng: 9.1829 },
  freiburg: { city: 'Freiburg', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 47.999, lng: 7.8421 },
  'black forest': { city: 'Black Forest', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 48.3, lng: 8.15 },
  germany: { city: 'Germany', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 51.1657, lng: 10.4515 },

  // France & Benelux & Austria
  strasbourg: { city: 'Strasbourg', country: 'France', countryCode: 'FR', flag: '🇫🇷', lat: 48.5734, lng: 7.7521 },
  colmar: { city: 'Colmar', country: 'France', countryCode: 'FR', flag: '🇫🇷', lat: 48.0794, lng: 7.3585 },
  chamonix: { city: 'Chamonix', country: 'France', countryCode: 'FR', flag: '🇫🇷', lat: 45.9237, lng: 6.8694 },
  annecy: { city: 'Annecy', country: 'France', countryCode: 'FR', flag: '🇫🇷', lat: 45.8992, lng: 6.1294 },
  lyon: { city: 'Lyon', country: 'France', countryCode: 'FR', flag: '🇫🇷', lat: 45.764, lng: 4.8357 },
  brussels: { city: 'Brussels', country: 'Belgium', countryCode: 'BE', flag: '🇧🇪', lat: 50.8503, lng: 4.3517 },
  bruges: { city: 'Bruges', country: 'Belgium', countryCode: 'BE', flag: '🇧🇪', lat: 51.2093, lng: 3.2247 },
  salzburg: { city: 'Salzburg', country: 'Austria', countryCode: 'AT', flag: '🇦🇹', lat: 47.8095, lng: 13.055 },
  innsbruck: { city: 'Innsbruck', country: 'Austria', countryCode: 'AT', flag: '🇦🇹', lat: 47.2692, lng: 11.4041 },
  hallstatt: { city: 'Hallstatt', country: 'Austria', countryCode: 'AT', flag: '🇦🇹', lat: 47.5622, lng: 13.6493 },
  budapest: { city: 'Budapest', country: 'Hungary', countryCode: 'HU', flag: '🇭🇺', lat: 47.4979, lng: 19.0402 },

  // Italy & Spain & Portugal
  florence: { city: 'Florence', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', lat: 43.7696, lng: 11.2558 },
  como: { city: 'Lake Como', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', lat: 45.8081, lng: 9.0852 },
  amalfi: { city: 'Amalfi Coast', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', lat: 40.6333, lng: 14.6029 },
  'cinque terre': { city: 'Cinque Terre', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', lat: 44.1461, lng: 9.6439 },
  seville: { city: 'Seville', country: 'Spain', countryCode: 'ES', flag: '🇪🇸', lat: 37.3891, lng: -5.9845 },
  granada: { city: 'Granada', country: 'Spain', countryCode: 'ES', flag: '🇪🇸', lat: 37.1773, lng: -3.5986 },

  // Japan
  kyoto: { city: 'Kyoto', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 35.0116, lng: 135.7681 },
  osaka: { city: 'Osaka', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 34.6937, lng: 135.5023 },
  hakone: { city: 'Hakone', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 35.2324, lng: 139.1069 },
  nara: { city: 'Nara', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 34.6851, lng: 135.8048 },
  hiroshima: { city: 'Hiroshima', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 34.3853, lng: 132.4553 },

  // India
  coorg: { city: 'Coorg', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 12.3375, lng: 75.8069 },
  mysuru: { city: 'Mysuru', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 12.2958, lng: 76.6394 },
  mysore: { city: 'Mysuru', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 12.2958, lng: 76.6394 },
  udaipur: { city: 'Udaipur', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 24.5854, lng: 73.7125 },
  ooty: { city: 'Ooty', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 11.4102, lng: 76.695 },
  hampi: { city: 'Hampi', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 15.335, lng: 76.46 },
  agra: { city: 'Agra', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 27.1767, lng: 78.0081 },
  varanasi: { city: 'Varanasi', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 25.3176, lng: 82.9739 },
  rishikesh: { city: 'Rishikesh', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 30.0869, lng: 78.2676 },
  leh: { city: 'Leh', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 34.1526, lng: 77.5771 },
  pondicherry: { city: 'Pondicherry', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 11.9416, lng: 79.8083 },
};

/**
 * Resolves an IATA code, city name, station name (e.g. "Zurich HB"), or country name
 * into a structured GeoPlace. Returns null if unknown (never invents a fake country!).
 */
export function resolvePlaceLocation(raw: string, date?: string): GeoPlace | null {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed.length < 2) return null;

  // 1. Exact 3-letter IATA airport code
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    const ap = lookupAirport(trimmed);
    if (ap) {
      return {
        city: ap.city.split('/')[0].trim(),
        country: ap.country,
        countryCode: ap.countryCode,
        flag: ap.flag,
        lat: ap.lat,
        lng: ap.lng,
        iata: ap.iata,
        date,
      };
    }
  }

  const lower = trimmed.toLowerCase();

  // 2. Check curated extra travel cities first (handles Lucerne, Interlaken, Kyoto, etc.)
  for (const [key, info] of Object.entries(EXTRA_CITIES)) {
    if (lower === key || new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
      return { ...info, date };
    }
  }

  // 3. Check airport cities and countries
  for (const ap of Object.values(AIRPORTS)) {
    const primaryCity = ap.city.split('/')[0].trim().toLowerCase();
    if (
      primaryCity.length >= 3 &&
      (lower === primaryCity ||
        new RegExp(`\\b${primaryCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower))
    ) {
      return {
        city: ap.city.split('/')[0].trim(),
        country: ap.country,
        countryCode: ap.countryCode,
        flag: ap.flag,
        lat: ap.lat,
        lng: ap.lng,
        iata: ap.iata,
        date,
      };
    }
  }

  for (const ap of Object.values(AIRPORTS)) {
    const countryLower = ap.country.toLowerCase();
    if (
      countryLower.length >= 3 &&
      (lower === countryLower ||
        new RegExp(`\\b${countryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower))
    ) {
      return {
        city: ap.country,
        country: ap.country,
        countryCode: ap.countryCode,
        flag: ap.flag,
        lat: ap.lat,
        lng: ap.lng,
        date,
      };
    }
  }

  return null;
}

function hoursBetweenIso(isoA: string, isoB: string): number {
  const norm = (s: string) => {
    const clean = s.includes('T') ? s.slice(0, 19) : `${s.slice(0, 10)}T12:00:00`;
    return new Date(clean.endsWith('Z') ? clean : `${clean}Z`).getTime();
  };
  const t1 = norm(isoA);
  const t2 = norm(isoB);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 24;
  return (t2 - t1) / 3600000;
}

/**
 * Derives all visited cities/countries vs. short airside airport layovers (<24h) for a trip.
 * Supports multi-country and open-jaw trips (e.g. BLR->AUH->ZRH + FRA->AUH->BLR
 * => Visited: Switzerland + Germany; Transit Hub: Abu Dhabi / UAE).
 */
export function deriveTripGeography(
  trip: Trip,
  flights: Flight[],
  transports: TransportLeg[],
  stops: TripStop[]
): TripGeography {
  const visitedByKey = new Map<string, GeoPlace>();
  const transitByIata = new Map<string, TransitHubSummary>();

  const addVisited = (place: GeoPlace) => {
    const key = `${place.countryCode}:${place.city.toLowerCase()}`;
    const existing = visitedByKey.get(key);
    if (!existing) {
      visitedByKey.set(key, place);
    } else if (place.date && (!existing.date || place.date < existing.date)) {
      existing.date = place.date;
    }
  };

  // 1. Always include the trip's primary destination (unless generic placeholder)
  const isGeneric =
    !trip.countryCode ||
    trip.destinationCountry.toLowerCase() === 'world adventure' ||
    trip.destinationCity.toLowerCase() === 'explore';
  if (!isGeneric) {
    addVisited({
      city: trip.destinationCity,
      country: trip.destinationCountry,
      countryCode: trip.countryCode,
      flag: trip.flagEmoji,
      lat: trip.lat,
      lng: trip.lng,
      date: trip.startDate,
    });
  }

  // 2. Explicit Trip Stops (always count as Visited — even if they overlap a transit hub!)
  const explicitStopCountries = new Set<string>();
  const explicitStopCities = new Set<string>();
  for (const stop of stops) {
    const resolved = resolvePlaceLocation(stop.cityName, stop.startDate || trip.startDate);
    if (resolved) {
      addVisited(resolved);
      explicitStopCountries.add(resolved.countryCode);
      explicitStopCities.add(resolved.city.toLowerCase());
    }
  }

  // 3. Ground / Sea Transport destinations (e.g. trains/drives crossing into Italy, Germany, France)
  for (const trn of transports) {
    const destPlace = resolvePlaceLocation(trn.destination, trn.startDate || trip.startDate);
    if (destPlace) {
      addVisited(destPlace);
    }
  }

  // 4. Chronological Flight Leg Analysis: distinguish real destinations vs <24h airside layovers
  const sortedFlights = [...flights].sort((a, b) =>
    (a.departureTime || '').localeCompare(b.departureTime || '')
  );

  if (sortedFlights.length > 0) {
    const firstOrigin = sortedFlights[0].originIata.toUpperCase();
    const lastDest = sortedFlights[sortedFlights.length - 1].destIata.toUpperCase();
    // If trip starts and ends at the same airport (round-trip / open-jaw returning home), don't stamp home origin
    const homeOriginIata =
      sortedFlights.length >= 2 && firstOrigin === lastDest && firstOrigin !== 'TBD'
        ? firstOrigin
        : null;

    const registerFlightAirport = (
      iata: string,
      isoDate: string,
      isTransit: boolean
    ) => {
      const code = iata.toUpperCase();
      if (!code || code === 'TBD' || code === homeOriginIata) return;
      const ap = lookupAirport(code);
      if (!ap) return;
      const primaryCity = ap.city.split('/')[0].trim();

      // If user explicitly added this city as a Stop, it's visited even if connection < 24h
      if (isTransit && !explicitStopCities.has(primaryCity.toLowerCase())) {
        if (!transitByIata.has(ap.iata)) {
          transitByIata.set(ap.iata, {
            iata: ap.iata,
            city: primaryCity,
            country: ap.country,
            countryCode: ap.countryCode,
            flag: ap.flag,
            lat: ap.lat,
            lng: ap.lng,
            date: isoDate.slice(0, 10),
          });
        }
        return;
      }

      addVisited({
        city: primaryCity,
        country: ap.country,
        countryCode: ap.countryCode,
        flag: ap.flag,
        lat: ap.lat,
        lng: ap.lng,
        iata: ap.iata,
        date: isoDate.slice(0, 10),
      });
    };

    if (sortedFlights.length === 1) {
      registerFlightAirport(sortedFlights[0].destIata, sortedFlights[0].departureTime, false);
    } else {
      for (let i = 0; i < sortedFlights.length - 1; i++) {
        const cur = sortedFlights[i];
        const next = sortedFlights[i + 1];
        const curDest = cur.destIata.toUpperCase();
        const nextOrigin = next.originIata.toUpperCase();

        if (curDest === nextOrigin) {
          // Same airport connection: < 24h = airside transit hub; >= 24h = genuine stopover visit
          const gapHours = hoursBetweenIso(cur.arrivalTime || cur.departureTime, next.departureTime);
          const isShortLayover = gapHours >= -2 && gapHours < 24;
          registerFlightAirport(curDest, cur.departureTime, isShortLayover);
        } else {
          // Open-jaw (e.g. arrived ZRH, later departed FRA): BOTH cities were visited!
          registerFlightAirport(curDest, cur.departureTime, false);
          registerFlightAirport(nextOrigin, next.departureTime, false);
        }
      }
      // Final arrival airport (skipped automatically if it equals homeOriginIata)
      const last = sortedFlights[sortedFlights.length - 1];
      registerFlightAirport(last.destIata, last.departureTime, false);
    }
  }

  // Remove any transit hub whose city is also in visitedPlaces (e.g. visited later on same trip)
  for (const [iata, hub] of transitByIata.entries()) {
    const key = `${hub.countryCode}:${hub.city.toLowerCase()}`;
    if (visitedByKey.has(key)) {
      transitByIata.delete(iata);
    }
  }

  const visitedPlaces = Array.from(visitedByKey.values());
  const transitHubs = Array.from(transitByIata.values());

  // Build deduplicated countries for this trip
  const countryMap = new Map<string, CountryStamp>();
  for (const p of visitedPlaces) {
    const existing = countryMap.get(p.countryCode);
    if (!existing) {
      countryMap.set(p.countryCode, {
        code: p.countryCode,
        country: p.country,
        flag: p.flag,
        date: p.date || trip.startDate,
        cities: [p.city],
      });
    } else {
      if (!existing.cities.some((c) => c.toLowerCase() === p.city.toLowerCase())) {
        existing.cities.push(p.city);
      }
      if (p.date && p.date < existing.date) {
        existing.date = p.date;
      }
    }
  }

  const visitedCountries = Array.from(countryMap.values());
  const flagsLabel =
    visitedCountries.length > 0
      ? visitedCountries.map((c) => c.flag).join(' ')
      : trip.flagEmoji;
  const countriesLabel =
    visitedCountries.length > 0
      ? visitedCountries.map((c) => c.country).join(' • ')
      : trip.destinationCountry;

  return {
    tripId: trip.id,
    visitedPlaces,
    visitedCountries,
    transitHubs,
    flagsLabel,
    countriesLabel,
  };
}

/**
 * Aggregates visited countries, visited city pins, and airside transit hubs across ALL trips.
 */
export function deriveGlobalTravelGeography(
  trips: Trip[],
  allFlights: Flight[],
  allTransports: TransportLeg[],
  allStops: TripStop[]
): GlobalTravelGeography {
  const byTripId: Record<string, TripGeography> = {};
  const globalCountries = new Map<string, CountryStamp>();
  const globalCities: Array<GeoPlace & { tripId: string }> = [];
  const seenCityPins = new Set<string>();
  const globalTransit = new Map<string, TransitHubSummary>();

  for (const trip of trips) {
    const tFlights = allFlights.filter((f) => f.tripId === trip.id);
    const tTransports = allTransports.filter((t) => t.tripId === trip.id);
    const tStops = allStops.filter((s) => s.tripId === trip.id);
    const geo = deriveTripGeography(trip, tFlights, tTransports, tStops);
    byTripId[trip.id] = geo;

    for (const c of geo.visitedCountries) {
      const existing = globalCountries.get(c.code);
      if (!existing) {
        globalCountries.set(c.code, { ...c, cities: [...c.cities] });
      } else {
        for (const city of c.cities) {
          if (!existing.cities.some((x) => x.toLowerCase() === city.toLowerCase())) {
            existing.cities.push(city);
          }
        }
        if (c.date && c.date < existing.date) {
          existing.date = c.date;
        }
      }
    }

    for (const p of geo.visitedPlaces) {
      const pinKey = `${trip.id}:${p.countryCode}:${p.city.toLowerCase()}`;
      if (!seenCityPins.has(pinKey)) {
        seenCityPins.add(pinKey);
        globalCities.push({ ...p, tripId: trip.id });
      }
    }

    for (const hub of geo.transitHubs) {
      if (!globalTransit.has(hub.iata)) {
        globalTransit.set(hub.iata, hub);
      }
    }
  }

  // If a country/city was actually visited on ANY trip, don't also list it as "transit only"
  for (const [iata, hub] of globalTransit.entries()) {
    const visitedSameCity = globalCities.some(
      (c) => c.countryCode === hub.countryCode && c.city.toLowerCase() === hub.city.toLowerCase()
    );
    if (visitedSameCity) {
      globalTransit.delete(iata);
    }
  }

  return {
    countryStamps: Array.from(globalCountries.values()),
    visitedCities: globalCities,
    transitHubs: Array.from(globalTransit.values()),
    byTripId,
  };
}
