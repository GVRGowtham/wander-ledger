import {
  DistanceUnit,
  Flight,
  Memory,
  Stay,
  TransportLeg,
  Trip,
  TripStop,
} from '../types/models';
import {
  buildJourneyRouteTrail,
  buildJourneyTimeline,
  formatDistance,
  milesToKm,
} from './distanceUtils';
import { deriveTripGeography } from './travelGeography';

export interface KeepsakePdfInput {
  trip: Trip;
  flights: Flight[];
  transports: TransportLeg[];
  stops: TripStop[];
  stays: Stay[];
  memories: Memory[];
  distanceUnit: DistanceUnit;
  coverDataUri?: string;
  photoDataUriMap?: Record<string, string>; // memory.id -> data:image/...;base64,...
}

function escapeHtml(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEditorialDate(iso?: string | null): string {
  if (!iso) return '';
  const clean = iso.slice(0, 10);
  const d = new Date(`${clean}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return clean;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function computeTripDays(startDate: string, endDate: string): number {
  const s = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const e = Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e)) return 1;
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

const VIBE_GRADIENTS: Record<Trip['vibe'], string> = {
  japan: 'linear-gradient(135deg, #FB7185 0%, #F97316 55%, #FDE68A 100%)',
  coastal: 'linear-gradient(135deg, #0284C7 0%, #38BDF8 55%, #FEF3C7 100%)',
  alpine: 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 55%, #E0F2FE 100%)',
  tropical: 'linear-gradient(135deg, #059669 0%, #10B981 55%, #FEF08A 100%)',
  desert: 'linear-gradient(135deg, #C2410C 0%, #F59E0B 55%, #FEF3C7 100%)',
  city: 'linear-gradient(135deg, #4338CA 0%, #EC4899 55%, #FED7AA 100%)',
};

const TRANSPORT_EMOJI: Record<TransportLeg['mode'], string> = {
  train: '🚆',
  bus: '🚌',
  ferry: '⛴️',
  rental_car: '🚗',
  own_car: '🚙',
};

/**
 * Generates a self-contained, privacy-safe magazine HTML document for Printable Trip Keepsake PDFs.
 * STRICT PRIVACY GUARANTEE: Never includes expenses, budgets, ticket fares, hotel prices, or receipts.
 */
export function buildTripKeepsakeHtml(input: KeepsakePdfInput): string {
  const {
    trip,
    flights,
    transports,
    stops,
    stays,
    memories,
    distanceUnit,
    coverDataUri,
    photoDataUriMap = {},
  } = input;

  const days = computeTripDays(trip.startDate, trip.endDate);
  const flightKm = flights.reduce((sum, f) => sum + milesToKm(f.distanceMiles || 0), 0);
  const groundKm = transports.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
  const totalDistanceKm = Math.round(flightKm + groundKm);
  const routeTrail = buildJourneyRouteTrail(flights, transports, stops);
  const timeline = buildJourneyTimeline(flights, transports, stops.length ? stays : stays);
  const geo = deriveTripGeography(trip, flights, transports, stops);
  const stopMap = new Map(stops.map((s) => [s.id, s.cityName]));

  const flags = geo.visitedCountries.length > 0 ? geo.flagsLabel : trip.flagEmoji || '🌍';
  const subtitleGeo =
    geo.visitedCountries.length > 0
      ? geo.countriesLabel
      : [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(', ');
  const dateRangeLabel =
    trip.startDate === trip.endDate
      ? formatEditorialDate(trip.startDate)
      : `${formatEditorialDate(trip.startDate)} – ${formatEditorialDate(trip.endDate)}`;

  const coverBannerStyle = coverDataUri
    ? `background-image: linear-gradient(180deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.72) 100%), url('${coverDataUri}'); background-size: cover; background-position: center;`
    : `background: ${VIBE_GRADIENTS[trip.vibe] || VIBE_GRADIENTS.city};`;

  const routeNodes = routeTrail
    ? routeTrail
        .split('→')
        .map((n) => n.trim())
        .filter(Boolean)
    : [];

  const routePillsHtml =
    routeNodes.length > 0
      ? `<div class="route-strip">
          ${routeNodes
            .map(
              (node, i) =>
                `<span class="route-pill">${escapeHtml(node)}</span>${
                  i < routeNodes.length - 1 ? '<span class="route-arrow">→</span>' : ''
                }`
            )
            .join('')}
        </div>`
      : '';

  const coTravelersHtml =
    trip.coTravelers.length > 0
      ? `<div class="companions-pill">🤝 Travel Companions: ${escapeHtml(
          trip.coTravelers.join(' • ')
        )}</div>`
      : '';

  // Itinerary section (strictly non-financial: flights, transports, stays)
  const itineraryItemsHtml = timeline
    .map((item) => {
      if (item.kind === 'flight') {
        const f = item.flight;
        const metaParts = [
          f.airlineName,
          f.flightNumber,
          f.cabinClass,
          f.seat ? `Seat ${f.seat}` : '',
          f.aircraft,
          f.distanceMiles > 0
            ? formatDistance(Math.round(milesToKm(f.distanceMiles)), distanceUnit)
            : '',
        ].filter(Boolean);
        return `
          <div class="timeline-card">
            <div class="tl-badge tl-flight">✈️ FLIGHT</div>
            <div class="tl-body">
              <div class="tl-top">
                <span class="tl-title">${escapeHtml(f.originCity || f.originIata)} (${escapeHtml(
          f.originIata
        )}) → ${escapeHtml(f.destCity || f.destIata)} (${escapeHtml(f.destIata)})</span>
                <span class="tl-date">${escapeHtml(formatEditorialDate(f.departureTime))}</span>
              </div>
              <div class="tl-sub">${escapeHtml(metaParts.join(' • '))}</div>
            </div>
          </div>`;
      }
      if (item.kind === 'transport') {
        const t = item.transport;
        const emoji = TRANSPORT_EMOJI[t.mode] || '🚆';
        const metaParts = [
          t.operatorName,
          t.seatOrVehicle,
          t.distanceKm && t.distanceKm > 0 ? formatDistance(t.distanceKm, distanceUnit) : '',
        ].filter(Boolean);
        return `
          <div class="timeline-card">
            <div class="tl-badge tl-ground">${emoji} ${escapeHtml(
          t.mode.replace('_', ' ').toUpperCase()
        )}</div>
            <div class="tl-body">
              <div class="tl-top">
                <span class="tl-title">${escapeHtml(t.title || `${t.origin} → ${t.destination}`)}</span>
                <span class="tl-date">${escapeHtml(formatEditorialDate(t.startDate))}</span>
              </div>
              <div class="tl-sub">${escapeHtml(
                [
                  t.origin && t.destination ? `${t.origin} → ${t.destination}` : '',
                  ...metaParts,
                ]
                  .filter(Boolean)
                  .join(' • ')
              )}</div>
            </div>
          </div>`;
      }
      const s = item.stay;
      return `
        <div class="timeline-card">
          <div class="tl-badge tl-stay">🏨 STAY</div>
          <div class="tl-body">
            <div class="tl-top">
              <span class="tl-title">${escapeHtml(s.name)}</span>
              <span class="tl-date">${escapeHtml(formatEditorialDate(s.checkIn))} → ${escapeHtml(
        formatEditorialDate(s.checkOut)
      )}</span>
            </div>
            <div class="tl-sub">${escapeHtml(
              [
                `${s.nights} ${s.nights === 1 ? 'night' : 'nights'}`,
                s.stayType.toUpperCase(),
                s.address,
              ]
                .filter(Boolean)
                .join(' • ')
            )}</div>
          </div>
        </div>`;
    })
    .join('');

  // Chronological memories (oldest -> newest reads like a real storybook!)
  const orderedMemories = [...memories].sort((a, b) =>
    (a.capturedAt || a.createdAt).localeCompare(b.capturedAt || b.createdAt)
  );

  const memoriesGridHtml = orderedMemories
    .map((m) => {
      const imgSrc = photoDataUriMap[m.id];
      const stopName = m.stopId ? stopMap.get(m.stopId) : undefined;
      const locText = [m.placeName, stopName].filter(Boolean).join(' • ');
      return `
        <div class="polaroid-card">
          ${
            imgSrc
              ? `<div class="polaroid-photo-wrap"><img class="polaroid-photo" src="${imgSrc}" /></div>`
              : `<div class="polaroid-text-accent">✨ ${escapeHtml(m.moodSticker || 'Travel Note')}</div>`
          }
          <div class="polaroid-caption">
            <div class="polaroid-meta">
              <span class="mood-pill">${escapeHtml(m.moodSticker || '🌅 Memory')}</span>
              <span class="mem-date">${escapeHtml(formatEditorialDate(m.capturedAt))}</span>
            </div>
            <div class="mem-title">${escapeHtml(m.title)}</div>
            ${locText ? `<div class="mem-loc">📍 ${escapeHtml(locText)}</div>` : ''}
            ${m.note ? `<div class="mem-note">${escapeHtml(m.note)}</div>` : ''}
            ${
              m.authorName
                ? `<div class="mem-author">— ${escapeHtml(m.authorName)}</div>`
                : ''
            }
          </div>
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(trip.title)} — Wanderer's Ledger Keepsake</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #FFF9F2;
    color: #1F2937;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page-cover {
    background: #FFFFFF;
    border: 1.5px solid #FDE2C8;
    border-radius: 22px;
    overflow: hidden;
    margin-bottom: 18px;
  }
  .hero {
    height: 255px;
    padding: 26px 28px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: #FFFFFF;
    ${coverBannerStyle}
  }
  .brand-chip {
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .hero-bottom h1 {
    margin: 0 0 6px 0;
    font-size: 30px;
    line-height: 1.15;
    font-weight: 900;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  }
  .hero-sub {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.96;
  }
  .cover-body {
    padding: 20px 24px 24px 24px;
  }
  .stats-grid {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  }
  .stat-box {
    flex: 1;
    background: #FFF9F2;
    border: 1px solid #FDE2C8;
    border-radius: 14px;
    padding: 12px 10px;
    text-align: center;
  }
  .stat-val {
    font-size: 18px;
    font-weight: 900;
    color: #EA580C;
  }
  .stat-lbl {
    font-size: 9.5px;
    font-weight: 800;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-top: 3px;
  }
  .route-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    background: #F0F9FF;
    border: 1px solid #BAE6FD;
    border-radius: 14px;
    padding: 10px 14px;
    margin-bottom: 12px;
  }
  .route-pill {
    font-size: 11px;
    font-weight: 800;
    color: #0369A1;
  }
  .route-arrow {
    font-size: 11px;
    font-weight: 900;
    color: #7DD3FC;
  }
  .companions-pill {
    font-size: 11.5px;
    font-weight: 700;
    color: #166534;
    background: #F0FDF4;
    border: 1px solid #BBF7D0;
    border-radius: 12px;
    padding: 8px 12px;
  }
  .section {
    margin-top: 18px;
  }
  .section-head {
    font-size: 15px;
    font-weight: 900;
    color: #111827;
    margin: 0 0 10px 2px;
    letter-spacing: 0.2px;
  }
  .timeline-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: #FFFFFF;
    border: 1px solid #F3E8D8;
    border-radius: 14px;
    padding: 11px 14px;
    margin-bottom: 8px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .tl-badge {
    font-size: 9px;
    font-weight: 900;
    padding: 4px 8px;
    border-radius: 999px;
    white-space: nowrap;
    letter-spacing: 0.4px;
  }
  .tl-flight { background: #E0F2FE; color: #0369A1; }
  .tl-ground { background: #EDE9FE; color: #5B21B6; }
  .tl-stay   { background: #FEF3C7; color: #B45309; }
  .tl-body { flex: 1; }
  .tl-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .tl-title { font-size: 12.5px; font-weight: 800; color: #111827; }
  .tl-date  { font-size: 10.5px; font-weight: 700; color: #6B7280; white-space: nowrap; }
  .tl-sub   { font-size: 11px; color: #4B5563; margin-top: 3px; }
  .memories-section {
    page-break-before: auto;
    margin-top: 20px;
  }
  .polaroid-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }
  .polaroid-card {
    width: calc(50% - 7px);
    background: #FFFFFF;
    border: 1.5px solid #F3E8D8;
    border-radius: 16px;
    padding: 10px;
    box-shadow: 0 3px 10px rgba(31, 41, 55, 0.05);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .polaroid-photo-wrap {
    width: 100%;
    height: 190px;
    border-radius: 10px;
    overflow: hidden;
    background: #F3F4F6;
    margin-bottom: 10px;
  }
  .polaroid-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .polaroid-text-accent {
    background: #FFF7ED;
    color: #C2410C;
    border-radius: 10px;
    padding: 14px 12px;
    font-size: 12px;
    font-weight: 800;
    margin-bottom: 8px;
  }
  .polaroid-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
  }
  .mood-pill {
    background: #FFF1F2;
    color: #BE123C;
    font-size: 9.5px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 999px;
  }
  .mem-date { font-size: 10px; font-weight: 700; color: #6B7280; }
  .mem-title { font-size: 13.5px; font-weight: 900; color: #111827; margin-bottom: 3px; }
  .mem-loc { font-size: 10.5px; font-weight: 700; color: #0369A1; margin-bottom: 4px; }
  .mem-note { font-size: 11px; line-height: 1.48; color: #374151; white-space: pre-wrap; }
  .mem-author { font-size: 10px; font-weight: 700; color: #6B7280; margin-top: 6px; text-align: right; }
  .footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid #F3E8D8;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    color: #9CA3AF;
  }
</style>
</head>
<body>
  <div class="page-cover">
    <div class="hero">
      <div class="brand-chip">✈️ Wanderer's Ledger • Trip Keepsake</div>
      <div class="hero-bottom">
        <h1>${escapeHtml(trip.title)} ${escapeHtml(flags)}</h1>
        <div class="hero-sub">${escapeHtml(subtitleGeo)} • ${escapeHtml(dateRangeLabel)}</div>
      </div>
    </div>
    <div class="cover-body">
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-val">${days}</div>
          <div class="stat-lbl">${days === 1 ? 'Day' : 'Days'}</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">${escapeHtml(formatDistance(totalDistanceKm, distanceUnit))}</div>
          <div class="stat-lbl">Distance</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">${flights.length + transports.length + stays.length}</div>
          <div class="stat-lbl">Bookings</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">${memories.length}</div>
          <div class="stat-lbl">Memories</div>
        </div>
      </div>
      ${routePillsHtml}
      ${coTravelersHtml}
    </div>
  </div>

  ${
    timeline.length > 0
      ? `<div class="section">
          <h2 class="section-head">🧭 Journey Itinerary</h2>
          ${itineraryItemsHtml}
        </div>`
      : ''
  }

  ${
    orderedMemories.length > 0
      ? `<div class="memories-section">
          <h2 class="section-head">📸 Polaroid Travelogue</h2>
          <div class="polaroid-grid">
            ${memoriesGridHtml}
          </div>
        </div>`
      : ''
  }

  <div class="footer">
    Crafted offline with Wanderer's Ledger • Private budgets, expenses & receipts automatically excluded
  </div>
</body>
</html>`;
}
