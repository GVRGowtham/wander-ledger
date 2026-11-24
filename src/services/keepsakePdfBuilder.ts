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
  buildJourneyTimeline,
  buildStructuredJourneyRoute,
  FlightChain,
  formatDistance,
  milesToKm,
} from './distanceUtils';
import {
  computeCroppedImageLayout,
  DEFAULT_PHOTO_CROP,
  ImageDimensions,
  PhotoCrop,
} from './igStudioHelpers';
import { deriveTripGeography } from './travelGeography';

export type KeepsakeTemplateId = 'magazine' | 'artbook' | 'passport';

export interface KeepsakeTemplateMeta {
  id: KeepsakeTemplateId;
  label: string;
  emoji: string;
  tagline: string;
  coverSlotWidth: number;
  coverSlotHeight: number;
  accentColor: string;
}

export const KEEPSAKE_A4_WIDTH = 595;
export const KEEPSAKE_A4_HEIGHT = 842;

export const KEEPSAKE_TEMPLATES: KeepsakeTemplateMeta[] = [
  {
    id: 'magazine',
    label: 'Magazine',
    emoji: '📰',
    tagline: 'Full-bleed Condé Nast cover',
    coverSlotWidth: KEEPSAKE_A4_WIDTH,
    coverSlotHeight: KEEPSAKE_A4_HEIGHT,
    accentColor: '#EA580C',
  },
  {
    id: 'artbook',
    label: 'Art Book',
    emoji: '🖼️',
    tagline: 'Framed ivory (great for landscape)',
    coverSlotWidth: 499,
    coverSlotHeight: 356,
    accentColor: '#0F766E',
  },
  {
    id: 'passport',
    label: 'Passport',
    emoji: '🛂',
    tagline: 'Midnight navy & gold journal',
    coverSlotWidth: 276,
    coverSlotHeight: 276,
    accentColor: '#1E1B4B',
  },
];

export function getKeepsakeTemplateMeta(id?: KeepsakeTemplateId): KeepsakeTemplateMeta {
  return KEEPSAKE_TEMPLATES.find((t) => t.id === id) ?? KEEPSAKE_TEMPLATES[0];
}

export interface KeepsakePdfInput {
  trip: Trip;
  flights: Flight[];
  transports: TransportLeg[];
  stops: TripStop[];
  stays: Stay[];
  memories: Memory[];
  distanceUnit: DistanceUnit;
  templateId?: KeepsakeTemplateId;
  coverDataUri?: string;
  coverDimensions?: ImageDimensions;
  coverCrop?: PhotoCrop;
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

function formatEditionSeason(iso?: string | null): string {
  if (!iso) return 'SPECIAL EDITION';
  const clean = iso.slice(0, 10);
  const d = new Date(`${clean}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'TRAVEL EDITION';
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const season =
    month >= 2 && month <= 4
      ? 'SPRING'
      : month >= 5 && month <= 7
        ? 'SUMMER'
        : month >= 8 && month <= 10
          ? 'AUTUMN'
          : 'WINTER';
  return `${season} ${year} EDITION`;
}

function computeTripDays(startDate: string, endDate: string): number {
  const s = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const e = Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e)) return 1;
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

const VIBE_BACKDROPS: Record<Trip['vibe'], string> = {
  japan: 'linear-gradient(155deg, #2D1B36 0%, #9D174D 45%, #F97316 100%)',
  coastal: 'linear-gradient(155deg, #0C2D48 0%, #0369A1 50%, #38BDF8 100%)',
  alpine: 'linear-gradient(155deg, #0F172A 0%, #1E3A8A 50%, #60A5FA 100%)',
  tropical: 'linear-gradient(155deg, #064E3B 0%, #0D9488 52%, #34D399 100%)',
  desert: 'linear-gradient(155deg, #431407 0%, #C2410C 52%, #F59E0B 100%)',
  city: 'linear-gradient(155deg, #1E1B4B 0%, #6D28D9 52%, #EC4899 100%)',
};

const TRANSPORT_EMOJI: Record<TransportLeg['mode'], string> = {
  train: '🚆',
  bus: '🚌',
  ferry: '⛴️',
  rental_car: '🚗',
  own_car: '🚙',
};

const STAMP_COLORS = ['#B45309', '#0F766E', '#1D4ED8', '#BE123C', '#6D28D9'];
const STAMP_TILTS = [-4, 3, -2.5, 4.5, -3];

function buildPassportStampsHtml(
  countries: Array<{ country: string; code: string; flag: string; date?: string }>,
  fallbackDateLabel: string,
  goldTheme = false
): string {
  if (countries.length === 0) return '';
  return `<div class="stamps-row">
    ${countries
      .slice(0, 6)
      .map((c, idx) => {
        const ink = goldTheme ? '#D4AF37' : STAMP_COLORS[idx % STAMP_COLORS.length];
        const tilt = STAMP_TILTS[idx % STAMP_TILTS.length];
        const stampDate = c.date
          ? formatEditorialDate(c.date).replace(/,\s*/, ' ')
          : fallbackDateLabel;
        return `<div class="passport-stamp" style="border-color:${ink}; color:${ink}; transform:rotate(${tilt}deg);">
          <div class="stamp-inner" style="border-color:${ink};">
            <div class="stamp-top">ADMITTED • ${escapeHtml(c.code)}</div>
            <div class="stamp-mid">${escapeHtml(c.flag)} ${escapeHtml(c.country.toUpperCase())}</div>
            <div class="stamp-bot">${escapeHtml(stampDate)}</div>
          </div>
        </div>`;
      })
      .join('')}
  </div>`;
}

function buildCroppedCoverImgHtml(
  dataUri: string,
  slotW: number,
  slotH: number,
  dims?: ImageDimensions,
  crop?: PhotoCrop
): string {
  const imgW = dims?.width && dims.width > 0 ? dims.width : 1200;
  const imgH = dims?.height && dims.height > 0 ? dims.height : 900;
  const layout = computeCroppedImageLayout(
    slotW,
    slotH,
    imgW,
    imgH,
    crop ?? DEFAULT_PHOTO_CROP
  );
  return `<img src="${dataUri}" style="position:absolute; left:${layout.left.toFixed(1)}px; top:${layout.top.toFixed(1)}px; width:${layout.width.toFixed(1)}px; height:${layout.height.toFixed(1)}px; max-width:none; display:block;" />`;
}

function buildCompassSvg(stroke = '#D4AF37', size = 86): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="44" stroke="${stroke}" stroke-width="1.4" stroke-dasharray="3 3" opacity="0.75"/>
    <circle cx="50" cy="50" r="34" stroke="${stroke}" stroke-width="1.2" opacity="0.9"/>
    <path d="M50 10 L56 44 L90 50 L56 56 L50 90 L44 56 L10 50 L44 44 Z" fill="${stroke}" opacity="0.16" stroke="${stroke}" stroke-width="1.3"/>
    <path d="M50 16 L53 47 L50 50 L47 47 Z" fill="${stroke}"/>
    <circle cx="50" cy="50" r="4" fill="${stroke}"/>
  </svg>`;
}

function buildGroupedItineraryHtml(
  flightChains: FlightChain[],
  transports: TransportLeg[],
  stays: Stay[],
  distanceUnit: DistanceUnit
): string {
  // Build unified chronological items with grouped connecting flight chains!
  type GroupedItem =
    | { sortKey: string; kind: 'flight_chain'; chain: FlightChain }
    | { sortKey: string; kind: 'transport'; transport: TransportLeg }
    | { sortKey: string; kind: 'stay'; stay: Stay };

  const items: GroupedItem[] = [];
  for (const chain of flightChains) {
    items.push({
      sortKey: `${chain.departureTime.slice(0, 10)}T06:00`,
      kind: 'flight_chain',
      chain,
    });
  }
  const nonFlightTimeline = buildJourneyTimeline([], transports, stays);
  for (const item of nonFlightTimeline) {
    if (item.kind === 'transport') {
      items.push({ sortKey: item.sortKey, kind: 'transport', transport: item.transport });
    } else if (item.kind === 'stay') {
      items.push({ sortKey: item.sortKey, kind: 'stay', stay: item.stay });
    }
  }
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return items
    .map((item) => {
      if (item.kind === 'flight_chain') {
        const c = item.chain;
        const totalMiles = c.legs.reduce((sum, l) => sum + (l.distanceMiles || 0), 0);
        const totalKm = Math.round(milesToKm(totalMiles));
        const flightNums = c.legs.map((l) => l.flightNumber).filter(Boolean).join(' · ');
        const airline = c.legs[0]?.airlineName || c.legs[0]?.airlineCode || 'Flight';
        const cabin = c.legs[0]?.cabinClass || '';
        const depDate = formatEditorialDate(c.departureTime);
        const arrDate = formatEditorialDate(c.arrivalTime);
        const dateDisplay = arrDate && arrDate !== depDate ? `${depDate} – ${arrDate}` : depDate;
        const viaChip =
          c.viaIatas.length > 0
            ? `<span class="via-badge">via ${escapeHtml(c.viaIatas.join(', '))}</span>`
            : `<span class="via-badge via-direct">Direct</span>`;

        return `<div class="bp-card">
          <div class="bp-main">
            <div class="bp-top-row">
              <span class="bp-tag bp-tag-flight">✈️ FLIGHT</span>
              ${viaChip}
              <span class="bp-airline">${escapeHtml(airline)} ${flightNums ? `• ${escapeHtml(flightNums)}` : ''}</span>
            </div>
            <div class="bp-route-big">
              <div class="bp-endpoint">
                <div class="bp-iata">${escapeHtml(c.originIata)}</div>
                <div class="bp-city">${escapeHtml(c.originCity)}</div>
              </div>
              <div class="bp-arc">
                <span class="bp-dash"></span>
                <span class="bp-plane">✈</span>
                <span class="bp-dash"></span>
              </div>
              <div class="bp-endpoint bp-endpoint-right">
                <div class="bp-iata">${escapeHtml(c.destIata)}</div>
                <div class="bp-city">${escapeHtml(c.destCity)}</div>
              </div>
            </div>
          </div>
          <div class="bp-stub">
            <div class="bp-stub-label">DATE</div>
            <div class="bp-stub-val">${escapeHtml(dateDisplay)}</div>
            ${cabin ? `<div class="bp-stub-meta">${escapeHtml(cabin)}</div>` : ''}
            ${totalKm > 0 ? `<div class="bp-stub-meta">${escapeHtml(formatDistance(totalKm, distanceUnit))}</div>` : ''}
          </div>
        </div>`;
      }

      if (item.kind === 'transport') {
        const t = item.transport;
        const emoji = TRANSPORT_EMOJI[t.mode] || '🚆';
        const modeText = t.mode.replace('_', ' ').toUpperCase();
        const metaParts = [
          t.operatorName,
          t.seatOrVehicle,
          t.distanceKm && t.distanceKm > 0 ? formatDistance(t.distanceKm, distanceUnit) : '',
        ].filter(Boolean);
        return `<div class="bp-card bp-card-compact">
          <div class="bp-main">
            <div class="bp-top-row">
              <span class="bp-tag bp-tag-ground">${emoji} ${escapeHtml(modeText)}</span>
              <span class="bp-airline">${escapeHtml(t.title || modeText)}</span>
            </div>
            <div class="bp-compact-route">
              ${escapeHtml(t.origin)} <span class="bp-arrow">→</span> ${escapeHtml(t.destination)}
            </div>
            ${metaParts.length > 0 ? `<div class="bp-sub-line">${escapeHtml(metaParts.join(' • '))}</div>` : ''}
          </div>
          <div class="bp-stub">
            <div class="bp-stub-label">DEPART</div>
            <div class="bp-stub-val">${escapeHtml(formatEditorialDate(t.startDate))}</div>
          </div>
        </div>`;
      }

      const s = item.stay;
      return `<div class="bp-card bp-card-compact">
        <div class="bp-main">
          <div class="bp-top-row">
            <span class="bp-tag bp-tag-stay">🏨 STAY</span>
            <span class="bp-airline">${escapeHtml(s.stayType.toUpperCase())} • ${s.nights} ${s.nights === 1 ? 'night' : 'nights'}</span>
          </div>
          <div class="bp-compact-route">${escapeHtml(s.name)}</div>
          ${s.address ? `<div class="bp-sub-line">📍 ${escapeHtml(s.address)}</div>` : ''}
        </div>
        <div class="bp-stub">
          <div class="bp-stub-label">CHECK-IN</div>
          <div class="bp-stub-val">${escapeHtml(formatEditorialDate(s.checkIn))}</div>
          <div class="bp-stub-meta">to ${escapeHtml(formatEditorialDate(s.checkOut))}</div>
        </div>
      </div>`;
    })
    .join('');
}

/**
 * Generates a self-contained, privacy-safe multi-template A4 Magazine Keepsake HTML document.
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
    templateId = 'magazine',
    coverDataUri,
    coverDimensions,
    coverCrop,
    photoDataUriMap = {},
  } = input;

  const tpl = getKeepsakeTemplateMeta(templateId);
  const days = computeTripDays(trip.startDate, trip.endDate);
  const flightKm = flights.reduce((sum, f) => sum + milesToKm(f.distanceMiles || 0), 0);
  const groundKm = transports.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
  const totalDistanceKm = Math.round(flightKm + groundKm);

  const structuredRoute = buildStructuredJourneyRoute(flights, transports, stops);
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
  const editionLabel = formatEditionSeason(trip.startDate);
  const stampDateShort = formatEditorialDate(trip.startDate).replace(/,\s*/, ' ');

  const routeCityLabels = structuredRoute.nodes.map((n) => n.city);
  const routeRibbonText = routeCityLabels.join('  →  ');

  const routePillsHtml =
    structuredRoute.nodes.length > 0
      ? `<div class="route-ribbon">
          ${structuredRoute.nodes
            .map((node, i) => {
              const viaNote =
                node.viaIatas && node.viaIatas.length > 0
                  ? `<span class="route-via">via ${escapeHtml(node.viaIatas.join(', '))}</span>`
                  : '';
              return `<span class="route-node">${escapeHtml(node.city)}${viaNote}</span>${
                i < structuredRoute.nodes.length - 1 ? '<span class="route-sep">→</span>' : ''
              }`;
            })
            .join('')}
        </div>`
      : '';

  const stampsHtml = buildPassportStampsHtml(
    geo.visitedCountries,
    stampDateShort,
    templateId === 'passport'
  );

  const itineraryHtml = buildGroupedItineraryHtml(
    structuredRoute.flightChains,
    transports,
    stays,
    distanceUnit
  );

  const coTravelersHtml =
    trip.coTravelers.length > 0
      ? `<div class="companions-note">With ${escapeHtml(trip.coTravelers.join(' • '))}</div>`
      : '';

  // --- COVER PAGE HTML (Dedicated full A4 page per template!) ---
  const vibeBg = VIBE_BACKDROPS[trip.vibe] || VIBE_BACKDROPS.city;
  let coverPageHtml = '';

  if (templateId === 'magazine') {
    const heroPhotoHtml = coverDataUri
      ? `<div class="mag-photo-layer">${buildCroppedCoverImgHtml(
          coverDataUri,
          tpl.coverSlotWidth,
          tpl.coverSlotHeight,
          coverDimensions,
          coverCrop
        )}</div>`
      : `<div class="mag-art-layer" style="background:${vibeBg};">
          <div class="mag-art-compass">${buildCompassSvg('rgba(255,255,255,0.45)', 190)}</div>
        </div>`;

    coverPageHtml = `
      <section class="cover-page cover-magazine">
        ${heroPhotoHtml}
        <div class="mag-scrim"></div>
        <div class="mag-content">
          <div class="mag-masthead">
            <div class="mag-brand">WANDERER'S LEDGER</div>
            <div class="mag-issue">${escapeHtml(editionLabel)} • TRIP KEEPSAKE</div>
          </div>
          <div class="mag-bottom">
            <div class="mag-flags">${escapeHtml(flags)}</div>
            <h1 class="mag-title">${escapeHtml(trip.title)}</h1>
            <div class="mag-sub">${escapeHtml(subtitleGeo)} &nbsp;·&nbsp; ${escapeHtml(dateRangeLabel)}</div>
            ${coTravelersHtml}
            <div class="mag-footer-bar">
              <div class="mag-meta-row">
                <span>${days} ${days === 1 ? 'Day' : 'Days'}</span>
                <span>•</span>
                <span>${escapeHtml(formatDistance(totalDistanceKm, distanceUnit))}</span>
                <span>•</span>
                <span>${memories.length} ${memories.length === 1 ? 'Memory' : 'Memories'}</span>
              </div>
              ${
                routeRibbonText
                  ? `<div class="mag-route-line">${escapeHtml(routeRibbonText)}</div>`
                  : ''
              }
            </div>
          </div>
        </div>
      </section>`;
  } else if (templateId === 'artbook') {
    const framedPhotoHtml = coverDataUri
      ? `<div class="art-photo-window" style="width:${tpl.coverSlotWidth}px; height:${tpl.coverSlotHeight}px;">
          ${buildCroppedCoverImgHtml(
            coverDataUri,
            tpl.coverSlotWidth,
            tpl.coverSlotHeight,
            coverDimensions,
            coverCrop
          )}
        </div>`
      : `<div class="art-photo-window art-photo-fallback" style="width:${tpl.coverSlotWidth}px; height:${tpl.coverSlotHeight}px; background:${vibeBg};">
          ${buildCompassSvg('rgba(255,255,255,0.65)', 120)}
        </div>`;

    coverPageHtml = `
      <section class="cover-page cover-artbook">
        <div class="art-frame">
          <div class="art-top">
            <div class="art-kicker">WANDERER'S LEDGER &nbsp;·&nbsp; ${escapeHtml(editionLabel)}</div>
            <h1 class="art-title">${escapeHtml(trip.title)}</h1>
            <div class="art-sub">${escapeHtml(flags)} &nbsp; ${escapeHtml(subtitleGeo)} &nbsp;·&nbsp; ${escapeHtml(dateRangeLabel)}</div>
          </div>
          <div class="art-center">
            ${framedPhotoHtml}
          </div>
          <div class="art-bottom">
            ${
              routeRibbonText
                ? `<div class="art-route">${escapeHtml(routeRibbonText)}</div>`
                : ''
            }
            <div class="art-stats-line">
              ${days} ${days === 1 ? 'Day' : 'Days'} &nbsp;·&nbsp; ${escapeHtml(formatDistance(totalDistanceKm, distanceUnit))} &nbsp;·&nbsp; ${memories.length} ${memories.length === 1 ? 'Story' : 'Stories'}${
      trip.coTravelers.length > 0 ? ` &nbsp;·&nbsp; With ${escapeHtml(trip.coTravelers.join(', '))}` : ''
    }
            </div>
          </div>
        </div>
      </section>`;
  } else {
    // Vintage Passport Journal (Midnight Navy & Gold)
    const cameoHtml = coverDataUri
      ? `<div class="pass-cameo-ring">
          <div class="pass-cameo-window" style="width:${tpl.coverSlotWidth}px; height:${tpl.coverSlotHeight}px;">
            ${buildCroppedCoverImgHtml(
              coverDataUri,
              tpl.coverSlotWidth,
              tpl.coverSlotHeight,
              coverDimensions,
              coverCrop
            )}
          </div>
        </div>`
      : `<div class="pass-emblem">${buildCompassSvg('#D4AF37', 132)}</div>`;

    coverPageHtml = `
      <section class="cover-page cover-passport">
        <div class="pass-border-outer">
          <div class="pass-border-inner">
            <div class="pass-kicker">TRAVELOGUE PASSPORT</div>
            <div class="pass-brand">WANDERER'S LEDGER</div>
            <div class="pass-center">
              ${cameoHtml}
              <h1 class="pass-title">${escapeHtml(trip.title)}</h1>
              <div class="pass-sub">${escapeHtml(flags)} &nbsp; ${escapeHtml(subtitleGeo)}</div>
              <div class="pass-dates">${escapeHtml(dateRangeLabel)}</div>
              ${coTravelersHtml}
            </div>
            <div class="pass-footer">
              ${
                routeRibbonText
                  ? `<div class="pass-route">${escapeHtml(routeRibbonText)}</div>`
                  : ''
              }
              <div class="pass-edition">${escapeHtml(editionLabel)} &nbsp;·&nbsp; ${days} DAYS &nbsp;·&nbsp; ${escapeHtml(formatDistance(totalDistanceKm, distanceUnit).toUpperCase())}</div>
            </div>
          </div>
        </div>
      </section>`;
  }

  // --- CHRONOLOGICAL MEMORIES (Oldest -> Newest reads like a real storybook!) ---
  const orderedMemories = [...memories].sort((a, b) =>
    (a.capturedAt || a.createdAt).localeCompare(b.capturedAt || b.createdAt)
  );

  const memoriesHtml = orderedMemories
    .map((m, idx) => {
      const imgSrc = photoDataUriMap[m.id];
      const stopName = m.stopId ? stopMap.get(m.stopId) : undefined;
      const locText = [m.placeName, stopName].filter(Boolean).join(' • ');
      const isHeroFirst =
        templateId === 'artbook' && idx === 0 && Boolean(imgSrc) && orderedMemories.length % 2 === 1;
      const tiltStyle =
        templateId === 'passport'
          ? `transform: rotate(${idx % 2 === 0 ? '-0.7deg' : '0.7deg'});`
          : '';
      const tapeHtml = templateId === 'passport' ? '<div class="washi-tape"></div>' : '';

      return `<article class="polaroid-card ${isHeroFirst ? 'polaroid-card-wide' : ''}" style="${tiltStyle}">
        ${tapeHtml}
        ${
          imgSrc
            ? `<div class="polaroid-photo-wrap ${isHeroFirst ? 'polaroid-photo-wide' : ''}">
                <img class="polaroid-photo" src="${imgSrc}" />
              </div>`
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
          ${m.authorName ? `<div class="mem-author">— ${escapeHtml(m.authorName)}</div>` : ''}
        </div>
      </article>`;
    })
    .join('');

  const pageBg =
    templateId === 'passport' ? '#FCF7EC' : templateId === 'artbook' ? '#FBF8F3' : '#FFFDF9';
  const accentHex = tpl.accentColor;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(trip.title)} — Wanderer's Ledger Keepsake</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: ${pageBg};
    color: #1F2937;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ====== PAGE 1: FULL-PAGE COVER ====== */
  .cover-page {
    width: ${KEEPSAKE_A4_WIDTH}px;
    height: ${KEEPSAKE_A4_HEIGHT}px;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }

  /* Template 1: Full-Bleed Editorial Magazine */
  .cover-magazine {
    background: #0F172A;
    color: #FFFFFF;
  }
  .mag-photo-layer, .mag-art-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .mag-art-layer {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mag-art-compass {
    margin-bottom: 90px;
  }
  .mag-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(15, 23, 42, 0.56) 0%,
      rgba(15, 23, 42, 0.08) 28%,
      rgba(15, 23, 42, 0.14) 52%,
      rgba(15, 23, 42, 0.86) 100%
    );
  }
  .mag-content {
    position: relative;
    z-index: 2;
    height: 100%;
    padding: 44px 44px 40px 44px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .mag-masthead {
    text-align: center;
    border-top: 1px solid rgba(255,255,255,0.45);
    border-bottom: 1px solid rgba(255,255,255,0.45);
    padding: 12px 0;
  }
  .mag-brand {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 24px;
    letter-spacing: 5px;
    font-weight: 700;
    color: #FFFFFF;
  }
  .mag-issue {
    font-size: 9.5px;
    letter-spacing: 2.6px;
    font-weight: 700;
    color: rgba(255,255,255,0.88);
    margin-top: 5px;
  }
  .mag-bottom {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mag-flags {
    font-size: 22px;
    letter-spacing: 4px;
  }
  .mag-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 46px;
    line-height: 1.06;
    font-weight: 700;
    margin: 0;
    color: #FFFFFF;
    text-shadow: 0 4px 20px rgba(0,0,0,0.42);
  }
  .mag-sub {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: rgba(255,255,255,0.92);
  }
  .mag-footer-bar {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid rgba(255,255,255,0.35);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mag-meta-row {
    display: flex;
    gap: 10px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: #FDE68A;
  }
  .mag-route-line {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255,255,255,0.9);
    line-height: 1.45;
  }
  .companions-note {
    font-size: 11.5px;
    font-style: italic;
    opacity: 0.9;
    margin-top: 2px;
  }

  /* Template 2: Framed Art Book (Kinfolk / Landscape-Friendly) */
  .cover-artbook {
    background: #FBF8F3;
    padding: 32px;
    color: #1C1917;
  }
  .art-frame {
    width: 100%;
    height: 100%;
    border: 1.2px solid #DED5C5;
    padding: 30px 16px 28px 16px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
  }
  .art-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0 18px;
  }
  .art-kicker {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 3px;
    color: #78716C;
    text-transform: uppercase;
  }
  .art-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 42px;
    line-height: 1.1;
    font-weight: 700;
    margin: 4px 0 0 0;
    color: #1C1917;
  }
  .art-sub {
    font-size: 12.5px;
    color: #57534E;
    font-weight: 600;
  }
  .art-center {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .art-photo-window {
    position: relative;
    overflow: hidden;
    border-radius: 4px;
    box-shadow: 0 10px 28px rgba(28, 25, 23, 0.14);
    border: 6px solid #FFFFFF;
  }
  .art-photo-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .art-bottom {
    width: 100%;
    padding: 14px 20px 0 20px;
    border-top: 1px solid #E7DFD1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }
  .art-route {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 11.5px;
    color: #292524;
    letter-spacing: 0.3px;
    line-height: 1.45;
  }
  .art-stats-line {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: #78716C;
  }

  /* Template 3: Vintage Passport Journal (Navy & Gold) */
  .cover-passport {
    background: linear-gradient(160deg, #111833 0%, #1B254B 55%, #0F172A 100%);
    padding: 32px;
    color: #F6E6B4;
  }
  .pass-border-outer {
    width: 100%;
    height: 100%;
    border: 2px solid #D4AF37;
    border-radius: 14px;
    padding: 7px;
  }
  .pass-border-inner {
    width: 100%;
    height: 100%;
    border: 1px solid rgba(212, 175, 55, 0.55);
    border-radius: 9px;
    padding: 34px 32px 28px 32px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
  }
  .pass-kicker {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 4px;
    color: #D4AF37;
  }
  .pass-brand {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 15px;
    letter-spacing: 3px;
    color: rgba(246, 230, 180, 0.85);
    margin-top: 4px;
  }
  .pass-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .pass-cameo-ring {
    padding: 7px;
    border: 1.5px solid #D4AF37;
    border-radius: 16px;
    background: rgba(255,255,255,0.05);
    margin-bottom: 6px;
  }
  .pass-cameo-window {
    position: relative;
    overflow: hidden;
    border-radius: 10px;
  }
  .pass-emblem {
    margin: 12px 0;
  }
  .pass-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 38px;
    line-height: 1.1;
    margin: 4px 0 0 0;
    color: #FDF3D0;
  }
  .pass-sub {
    font-size: 13.5px;
    font-weight: 600;
    color: #E8D59B;
  }
  .pass-dates {
    font-size: 11px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: rgba(212, 175, 55, 0.9);
    font-weight: 700;
  }
  .pass-footer {
    width: 100%;
    border-top: 1px solid rgba(212, 175, 55, 0.35);
    padding-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pass-route {
    font-size: 11px;
    color: #F6E6B4;
    line-height: 1.45;
  }
  .pass-edition {
    font-size: 9.5px;
    letter-spacing: 2px;
    font-weight: 800;
    color: #D4AF37;
  }

  /* ====== INNER PAGES (JOURNEY SPREAD & TRAVELOGUE) ====== */
  .inner-page {
    padding: 38px 38px 32px 38px;
  }
  .stories-page {
    page-break-before: always;
    break-before: page;
  }
  .spread-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1.5px solid #E5DDD0;
    padding-bottom: 10px;
    margin-bottom: 18px;
    break-after: avoid;
    page-break-after: avoid;
  }
  .spread-kicker {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 2.2px;
    color: ${accentHex};
    text-transform: uppercase;
  }
  .spread-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 24px;
    font-weight: 700;
    color: #1C1917;
    margin: 3px 0 0 0;
  }
  .spread-page-tag {
    font-size: 10px;
    font-weight: 700;
    color: #78716C;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  /* Editorial KPI strip (hairline columns, not boxy widgets) */
  .editorial-stats {
    display: flex;
    border-top: 1px solid #E7DFD1;
    border-bottom: 1px solid #E7DFD1;
    padding: 12px 0;
    margin-bottom: 18px;
  }
  .ed-stat {
    flex: 1;
    text-align: center;
    border-right: 1px solid #E7DFD1;
  }
  .ed-stat:last-child { border-right: none; }
  .ed-stat-val {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 18px;
    font-weight: 700;
    color: #1C1917;
  }
  .ed-stat-lbl {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: #78716C;
    margin-top: 2px;
  }

  /* Vintage Inked Passport Stamps */
  .stamps-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 18px;
    align-items: center;
  }
  .passport-stamp {
    border: 2px solid;
    border-radius: 10px;
    padding: 3px;
    display: inline-block;
    opacity: 0.88;
  }
  .stamp-inner {
    border: 1px dashed;
    border-radius: 7px;
    padding: 5px 10px;
    text-align: center;
  }
  .stamp-top { font-size: 7.5px; font-weight: 900; letter-spacing: 1.2px; }
  .stamp-mid { font-size: 11px; font-weight: 900; letter-spacing: 0.6px; margin: 2px 0; }
  .stamp-bot { font-size: 8px; font-weight: 700; opacity: 0.85; }

  /* Route Ribbon */
  .route-ribbon {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    background: #FFFFFF;
    border: 1px solid #E7DFD1;
    border-left: 3.5px solid ${accentHex};
    border-radius: 10px;
    padding: 11px 14px;
    margin-bottom: 18px;
  }
  .route-node {
    font-size: 11px;
    font-weight: 800;
    color: #1C1917;
  }
  .route-via {
    font-size: 9.5px;
    font-weight: 700;
    color: #78716C;
    margin-left: 3px;
  }
  .route-sep {
    font-size: 11px;
    font-weight: 900;
    color: ${accentHex};
  }

  /* Boarding-Pass Itinerary Cards */
  .bp-section-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: #78716C;
    margin: 0 0 10px 0;
    break-after: avoid;
    page-break-after: avoid;
  }
  .bp-card {
    display: flex;
    background: #FFFFFF;
    border: 1px solid #E7DFD1;
    border-radius: 14px;
    margin-bottom: 10px;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .bp-main {
    flex: 1;
    padding: 12px 15px;
  }
  .bp-stub {
    width: 132px;
    background: ${templateId === 'passport' ? '#F8F1E1' : '#FAF7F2'};
    border-left: 1.5px dashed #D6CCB8;
    padding: 12px 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-end;
    text-align: right;
  }
  .bp-top-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .bp-tag {
    font-size: 8.5px;
    font-weight: 900;
    letter-spacing: 0.6px;
    padding: 3px 8px;
    border-radius: 999px;
  }
  .bp-tag-flight { background: #E0F2FE; color: #0369A1; }
  .bp-tag-ground { background: #EDE9FE; color: #5B21B6; }
  .bp-tag-stay   { background: #FEF3C7; color: #B45309; }
  .via-badge {
    font-size: 8.5px;
    font-weight: 800;
    color: #9A3412;
    background: #FFEDD5;
    padding: 2px 7px;
    border-radius: 999px;
  }
  .via-direct {
    color: #0F766E;
    background: #CCFBF1;
  }
  .bp-airline {
    font-size: 10.5px;
    font-weight: 700;
    color: #57534E;
  }
  .bp-route-big {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .bp-endpoint { min-width: 82px; }
  .bp-endpoint-right { text-align: right; }
  .bp-iata {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 20px;
    font-weight: 700;
    color: #1C1917;
    line-height: 1.1;
  }
  .bp-city {
    font-size: 10.5px;
    color: #57534E;
    font-weight: 600;
  }
  .bp-arc {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .bp-dash {
    flex: 1;
    height: 1px;
    border-top: 1.5px dashed #CBD5E1;
  }
  .bp-plane {
    font-size: 13px;
    color: ${accentHex};
  }
  .bp-compact-route {
    font-size: 13px;
    font-weight: 800;
    color: #1C1917;
  }
  .bp-arrow { color: ${accentHex}; }
  .bp-sub-line {
    font-size: 10.5px;
    color: #57534E;
    margin-top: 3px;
  }
  .bp-stub-label {
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #78716C;
  }
  .bp-stub-val {
    font-size: 11px;
    font-weight: 800;
    color: #1C1917;
    margin-top: 2px;
  }
  .bp-stub-meta {
    font-size: 9.5px;
    color: #57534E;
    margin-top: 2px;
  }

  /* ====== POLAROID STORYBOOK GRID ====== */
  .polaroid-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .polaroid-card {
    position: relative;
    width: calc(50% - 8px);
    background: #FFFFFF;
    border: 1.2px solid #E7DFD1;
    border-radius: 12px;
    padding: 10px 10px 14px 10px;
    box-shadow: 0 4px 14px rgba(28, 25, 23, 0.06);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .polaroid-card-wide {
    width: 100%;
  }
  .washi-tape {
    position: absolute;
    top: -6px;
    left: 50%;
    width: 58px;
    height: 13px;
    margin-left: -29px;
    background: rgba(212, 175, 55, 0.34);
    border: 1px solid rgba(212, 175, 55, 0.45);
    border-radius: 2px;
  }
  .polaroid-photo-wrap {
    width: 100%;
    height: 196px;
    border-radius: 7px;
    overflow: hidden;
    background: #F3F4F6;
    margin-bottom: 10px;
  }
  .polaroid-photo-wide {
    height: 270px;
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
    border-radius: 8px;
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
    background: #FEF3C7;
    color: #92400E;
    font-size: 9px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 999px;
  }
  .mem-date { font-size: 9.5px; font-weight: 700; color: #78716C; }
  .mem-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 15px;
    font-weight: 700;
    color: #1C1917;
    margin-bottom: 3px;
  }
  .mem-loc { font-size: 10px; font-weight: 700; color: ${accentHex}; margin-bottom: 5px; }
  .mem-note { font-size: 11px; line-height: 1.52; color: #44403C; white-space: pre-wrap; }
  .mem-author { font-size: 10px; font-style: italic; color: #78716C; margin-top: 6px; text-align: right; }

  .colophon-footer {
    margin-top: 26px;
    padding-top: 12px;
    border-top: 1px solid #E7DFD1;
    text-align: center;
    font-size: 9.5px;
    letter-spacing: 0.5px;
    color: #78716C;
  }
</style>
</head>
<body>
  ${coverPageHtml}

  <section class="inner-page">
    <div class="spread-header">
      <div>
        <div class="spread-kicker">CHAPTER 01 • THE JOURNEY</div>
        <h2 class="spread-title">${escapeHtml(trip.title)}</h2>
      </div>
      <div class="spread-page-tag">${escapeHtml(dateRangeLabel)}</div>
    </div>

    <div class="editorial-stats">
      <div class="ed-stat">
        <div class="ed-stat-val">${days}</div>
        <div class="ed-stat-lbl">${days === 1 ? 'Day' : 'Days'}</div>
      </div>
      <div class="ed-stat">
        <div class="ed-stat-val">${escapeHtml(formatDistance(totalDistanceKm, distanceUnit))}</div>
        <div class="ed-stat-lbl">Distance</div>
      </div>
      <div class="ed-stat">
        <div class="ed-stat-val">${Math.max(1, geo.visitedCountries.length)}</div>
        <div class="ed-stat-lbl">${geo.visitedCountries.length === 1 ? 'Country' : 'Countries'}</div>
      </div>
      <div class="ed-stat">
        <div class="ed-stat-val">${memories.length}</div>
        <div class="ed-stat-lbl">${memories.length === 1 ? 'Memory' : 'Memories'}</div>
      </div>
    </div>

    ${stampsHtml}
    ${routePillsHtml}

    ${
      itineraryHtml
        ? `<div class="bp-section-label">BOARDING PASSES &amp; ITINERARY</div>
           ${itineraryHtml}`
        : ''
    }
  </section>

  ${
    orderedMemories.length > 0
      ? `<section class="inner-page stories-page">
          <div class="spread-header">
            <div>
              <div class="spread-kicker">CHAPTER 02 • TRAVELOGUE</div>
              <h2 class="spread-title">Stories &amp; Polaroids</h2>
            </div>
            <div class="spread-page-tag">${orderedMemories.length} ${orderedMemories.length === 1 ? 'MOMENT' : 'MOMENTS'}</div>
          </div>
          <div class="polaroid-grid">
            ${memoriesHtml}
          </div>
          <div class="colophon-footer">
            Crafted offline with Wanderer's Ledger • Private budgets, expenses &amp; receipts automatically excluded
          </div>
        </section>`
      : `<div class="inner-page">
          <div class="colophon-footer">
            Crafted offline with Wanderer's Ledger • Private budgets, expenses &amp; receipts automatically excluded
          </div>
        </div>`
  }
</body>
</html>`;
}
