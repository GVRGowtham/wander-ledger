import { Flight, Memory, Stay, TransportLeg, Trip, TripStop } from '../types/models';

export interface TripSearchIndexData {
  flights: Flight[];
  transports: TransportLeg[];
  stops: TripStop[];
  stays: Stay[];
  memories: Memory[];
}

/**
 * Extracts unique 4-digit years across all trips (from startDate / endDate), sorted newest first.
 */
export function extractTripYears(trips: Trip[]): string[] {
  const years = new Set<string>();
  for (const t of trips) {
    const sy = t.startDate?.slice(0, 4);
    const ey = t.endDate?.slice(0, 4);
    if (sy && /^\d{4}$/.test(sy)) years.add(sy);
    if (ey && /^\d{4}$/.test(ey)) years.add(ey);
  }
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

/**
 * Filters trips by optional year (`'all'` or `'YYYY'`) and free-text query matching
 * trip metadata, co-travelers, flight routes/airlines, transports, stops, stays, and memory stories.
 */
export function filterTripsBySearchAndYear(
  trips: Trip[],
  query: string,
  year: string,
  data: TripSearchIndexData
): Trip[] {
  const cleanYear = year && year !== 'all' ? year.trim() : '';
  const cleanQuery = query.trim().toLowerCase();

  let list = trips;
  if (cleanYear) {
    list = list.filter(
      (t) => t.startDate.startsWith(cleanYear) || t.endDate.startsWith(cleanYear)
    );
  }

  if (!cleanQuery) return list;

  // Group child records once for fast O(N) lookup
  const textByTrip = new Map<string, string[]>();
  const push = (tripId: string, ...parts: Array<string | undefined | null>) => {
    let arr = textByTrip.get(tripId);
    if (!arr) {
      arr = [];
      textByTrip.set(tripId, arr);
    }
    for (const p of parts) {
      if (p) arr.push(p);
    }
  };

  for (const f of data.flights) {
    push(f.tripId, f.airlineName, f.flightNumber, f.originIata, f.originCity, f.destIata, f.destCity, f.pnr);
  }
  for (const tr of data.transports) {
    push(tr.tripId, tr.title, tr.operatorName, tr.origin, tr.destination, tr.mode, tr.referenceCode);
  }
  for (const s of data.stops) {
    push(s.tripId, s.cityName);
  }
  for (const st of data.stays) {
    push(st.tripId, st.name, st.address, st.confirmationCode);
  }
  for (const m of data.memories) {
    push(m.tripId, m.title, m.note, m.placeName, m.moodSticker, m.authorName);
  }

  return list.filter((t) => {
    const base = [
      t.title,
      t.destinationCity,
      t.destinationCountry,
      t.countryCode,
      t.startDate,
      t.endDate,
      ...(t.coTravelers ?? []),
      ...(textByTrip.get(t.id) ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return base.includes(cleanQuery);
  });
}
