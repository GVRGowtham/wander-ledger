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

// A4 PDF dimensions in points (72 PPI) used by expo-print width/height
export const KEEPSAKE_A4_WIDTH = 595;
export const KEEPSAKE_A4_HEIGHT = 842;

export const KEEPSAKE_TEMPLATES: KeepsakeTemplateMeta[] = [
  {
    id: 'magazine',
    label: 'Magazine',
    emoji: '📰',
    tagline: 'Full-bleed editorial • glossy white',
    coverSlotWidth: KEEPSAKE_A4_WIDTH,
    coverSlotHeight: KEEPSAKE_A4_HEIGHT,
    accentColor: '#EA580C',
  },
  {
    id: 'artbook',
    label: 'Art Book',
    emoji: '🖼️',
    tagline: 'Framed ivory • landscape-safe',
    coverSlotWidth: 499,
    coverSlotHeight: 356,
    accentColor: '#0F766E',
  },
  {
    id: 'passport',
    label: 'Passport',
    emoji: '🛂',
    tagline: 'Midnight navy & gold parchment',
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

const MAGAZINE_STAMP_COLORS = ['#EA580C', '#0369A1', '#BE123C', '#6D28D9', '#0F766E'];
const ARTBOOK_STAMP_COLORS = ['#0F766E', '#57534E', '#78716C', '#115E59', '#44403C'];
const PASSPORT_STAMP_COLORS = ['#1E2952', '#9A6B16', '#991B1B', '#1E3A5F', '#78350F'];
const STAMP_TILTS = [-3.5, 2.8, -2.2, 4, -2.8];

function buildPassportStampsHtml(
  countries: Array<{ country: string; code: string; flag: string; date?: string }>,
  fallbackDateLabel: string,
  templateId: KeepsakeTemplateId
): string {
  if (countries.length === 0) return '';
  const palette =
    templateId === 'passport'
      ? PASSPORT_STAMP_COLORS
      : templateId === 'artbook'
        ? ARTBOOK_STAMP_COLORS
        : MAGAZINE_STAMP_COLORS;

  return `<div class="stamps-row">
    ${countries
      .slice(0, 6)
      .map((c, idx) => {
        const ink = palette[idx % palette.length];
        const tilt = templateId === 'artbook' ? 0 : STAMP_TILTS[idx % STAMP_TILTS.length];
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

/**
 * Renders a cropped cover image using percentage positioning relative to its frame container.
 * Using percentages guarantees 1:1 WYSIWYG parity across 96-DPI Android Chromium print
 * (794x1123 CSS px) and 72-DPI iOS WKWebView print (595x842 CSS px) with zero white borders!
 */
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
  const leftPct = (layout.left / slotW) * 100;
  const topPct = (layout.top / slotH) * 100;
  const widthPct = (layout.width / slotW) * 100;
  const heightPct = (layout.height / slotH) * 100;
  return `<img src="${dataUri}" style="position:absolute; left:${leftPct.toFixed(3)}%; top:${topPct.toFixed(3)}%; width:${widthPct.toFixed(3)}%; height:${heightPct.toFixed(3)}%; max-width:none; display:block;" />`;
}

function buildCompassSvg(stroke = '#D4AF37', size = 110): string {
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
              <span class="bp-airline">${escapeHtml(airline)}${flightNums ? ` • ${escapeHtml(flightNums)}` : ''}</span>
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

interface ThemePalette {
  pageBg: string;
  cardBg: string;
  stubBg: string;
  inkPrimary: string;
  inkMuted: string;
  accent: string;
  accentSoft: string;
  border: string;
  ruleStrong: string;
  badgeFlightBg: string;
  badgeFlightInk: string;
  badgeGroundBg: string;
  badgeGroundInk: string;
  badgeStayBg: string;
  badgeStayInk: string;
  moodBg: string;
  moodInk: string;
}

const THEME_PALETTES: Record<KeepsakeTemplateId, ThemePalette> = {
  magazine: {
    pageBg: '#FFFFFF',
    cardBg: '#FFFFFF',
    stubBg: '#F8FAFC',
    inkPrimary: '#111827',
    inkMuted: '#64748B',
    accent: '#EA580C',
    accentSoft: '#FFF7ED',
    border: '#E2E8F0',
    ruleStrong: '#111827',
    badgeFlightBg: '#111827',
    badgeFlightInk: '#FFFFFF',
    badgeGroundBg: '#FFF7ED',
    badgeGroundInk: '#C2410C',
    badgeStayBg: '#F1F5F9',
    badgeStayInk: '#334155',
    moodBg: '#111827',
    moodInk: '#FDE68A',
  },
  artbook: {
    pageBg: '#FBF8F3',
    cardBg: '#FFFFFF',
    stubBg: '#F5EFE6',
    inkPrimary: '#292524',
    inkMuted: '#78716C',
    accent: '#0F766E',
    accentSoft: '#F0FDFA',
    border: '#E6DEC8',
    ruleStrong: '#0F766E',
    badgeFlightBg: '#E6F4F1',
    badgeFlightInk: '#0F766E',
    badgeGroundBg: '#F5EFE6',
    badgeGroundInk: '#57534E',
    badgeStayBg: '#FEF7EC',
    badgeStayInk: '#92400E',
    moodBg: '#F0FDFA',
    moodInk: '#0F766E',
  },
  passport: {
    pageBg: '#F8F1E1',
    cardBg: '#FFFDF7',
    stubBg: '#EFE4CA',
    inkPrimary: '#131A36',
    inkMuted: '#6B5E4A',
    accent: '#9A6B16',
    accentSoft: '#FEF6DF',
    border: '#D8C7A2',
    ruleStrong: '#131A36',
    badgeFlightBg: '#131A36',
    badgeFlightInk: '#F6E6B4',
    badgeGroundBg: '#27325C',
    badgeGroundInk: '#F6E6B4',
    badgeStayBg: '#D4AF37',
    badgeStayInk: '#131A36',
    moodBg: '#131A36',
    moodInk: '#F6E6B4',
  },
};

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
  const pal = THEME_PALETTES[templateId];
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
    templateId
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

  // --- COVER PAGE HTML (100% edge-to-edge 210mm x 296.8mm A4 page!) ---
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
          <div class="mag-art-compass">${buildCompassSvg('rgba(255,255,255,0.45)', 220)}</div>
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
      ? `<div class="art-photo-window">
          ${buildCroppedCoverImgHtml(
            coverDataUri,
            tpl.coverSlotWidth,
            tpl.coverSlotHeight,
            coverDimensions,
            coverCrop
          )}
        </div>`
      : `<div class="art-photo-window art-photo-fallback" style="background:${vibeBg};">
          ${buildCompassSvg('rgba(255,255,255,0.65)', 140)}
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
    const cameoHtml = coverDataUri
      ? `<div class="pass-cameo-ring">
          <div class="pass-cameo-window">
            ${buildCroppedCoverImgHtml(
              coverDataUri,
              tpl.coverSlotWidth,
              tpl.coverSlotHeight,
              coverDimensions,
              coverCrop
            )}
          </div>
        </div>`
      : `<div class="pass-emblem">${buildCompassSvg('#D4AF37', 160)}</div>`;

    coverPageHtml = `
      <section class="cover-page cover-passport">
        <div class="pass-border-outer">
          <div class="pass-border-inner">
            <div class="pass-head">
              <div class="pass-kicker">TRAVELOGUE PASSPORT</div>
              <div class="pass-brand">WANDERER'S LEDGER</div>
            </div>
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

  // --- CHRONOLOGICAL MEMORIES ---
  const orderedMemories = [...memories].sort((a, b) =>
    (a.capturedAt || a.createdAt).localeCompare(b.capturedAt || b.createdAt)
  );

  const memoriesHtml = orderedMemories
    .map((m, idx) => {
      const imgSrc = photoDataUriMap[m.id];
      const stopName = m.stopId ? stopMap.get(m.stopId) : undefined;
      const locText = [m.placeName, stopName].filter(Boolean).join(' • ');
      const isHeroFirst =
        (templateId === 'artbook' || templateId === 'magazine') &&
        idx === 0 &&
        Boolean(imgSrc) &&
        orderedMemories.length % 2 === 1;
      const tiltStyle =
        templateId === 'passport'
          ? `transform: rotate(${idx % 2 === 0 ? '-0.9deg' : '0.9deg'});`
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

  // --- THEME-SPECIFIC INNER PAGE HEADERS & STYLING ---
  const journeyHeaderHtml =
    templateId === 'passport'
      ? `<div class="pass-inner-banner">
          <div>
            <div class="pass-inner-kicker">IMMIGRATION &amp; TRANSIT LOG • PAGE 02</div>
            <h2 class="pass-inner-title">${escapeHtml(trip.title)}</h2>
          </div>
          <div class="pass-inner-date">${escapeHtml(dateRangeLabel)}</div>
        </div>`
      : templateId === 'artbook'
        ? `<div class="art-spread-header">
            <div class="spread-kicker">CURATED ARCHIVE &nbsp;·&nbsp; CHAPTER 01</div>
            <h2 class="spread-title">${escapeHtml(trip.title)}</h2>
            <div class="art-spread-dates">${escapeHtml(flags)} &nbsp; ${escapeHtml(dateRangeLabel)}</div>
          </div>`
        : `<div class="mag-spread-header">
            <div>
              <div class="spread-kicker">WANDERER'S LEDGER • CHAPTER 01</div>
              <h2 class="spread-title">The Journey</h2>
            </div>
            <div class="spread-page-tag">${escapeHtml(trip.title)} · ${escapeHtml(dateRangeLabel)}</div>
          </div>`;

  const storiesHeaderHtml =
    templateId === 'passport'
      ? `<div class="pass-inner-banner">
          <div>
            <div class="pass-inner-kicker">FIELD JOURNAL &amp; POLAROIDS • CHAPTER 02</div>
            <h2 class="pass-inner-title">Memories &amp; Stories</h2>
          </div>
          <div class="pass-inner-date">${orderedMemories.length} ${orderedMemories.length === 1 ? 'MOMENT' : 'MOMENTS'}</div>
        </div>`
      : templateId === 'artbook'
        ? `<div class="art-spread-header">
            <div class="spread-kicker">PHOTOGRAPHIC PLATES &nbsp;·&nbsp; CHAPTER 02</div>
            <h2 class="spread-title">Stories &amp; Reflections</h2>
            <div class="art-spread-dates">${orderedMemories.length} ${orderedMemories.length === 1 ? 'Moment' : 'Moments'}</div>
          </div>`
        : `<div class="mag-spread-header">
            <div>
              <div class="spread-kicker">WANDERER'S LEDGER • CHAPTER 02</div>
              <h2 class="spread-title">Stories &amp; Polaroids</h2>
            </div>
            <div class="spread-page-tag">${orderedMemories.length} ${orderedMemories.length === 1 ? 'MOMENT' : 'MOMENTS'}</div>
          </div>`;

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
    width: 100%;
    background: ${pal.pageBg};
    color: ${pal.inkPrimary};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ====== PAGE 1: TRUE FULL-BLEED A4 COVER (210mm x 296.8mm) ====== */
  .cover-page {
    width: 210mm;
    height: 296.8mm;
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
  .mag-art-compass { margin-bottom: 30mm; }
  .mag-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(15, 23, 42, 0.58) 0%,
      rgba(15, 23, 42, 0.06) 28%,
      rgba(15, 23, 42, 0.14) 54%,
      rgba(15, 23, 42, 0.88) 100%
    );
  }
  .mag-content {
    position: relative;
    z-index: 2;
    height: 100%;
    padding: 16mm 16mm 15mm 16mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .mag-masthead {
    text-align: center;
    border-top: 1.5px solid rgba(255,255,255,0.52);
    border-bottom: 1.5px solid rgba(255,255,255,0.52);
    padding: 4.5mm 0;
  }
  .mag-brand {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 32px;
    letter-spacing: 7px;
    font-weight: 700;
    color: #FFFFFF;
  }
  .mag-issue {
    font-size: 11px;
    letter-spacing: 3.4px;
    font-weight: 700;
    color: rgba(255,255,255,0.9);
    margin-top: 6px;
  }
  .mag-bottom {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mag-flags { font-size: 28px; letter-spacing: 6px; }
  .mag-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 62px;
    line-height: 1.04;
    font-weight: 700;
    margin: 0;
    color: #FFFFFF;
    text-shadow: 0 5px 24px rgba(0,0,0,0.45);
  }
  .mag-sub {
    font-size: 16.5px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: rgba(255,255,255,0.94);
  }
  .mag-footer-bar {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid rgba(255,255,255,0.4);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .mag-meta-row {
    display: flex;
    gap: 12px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: #FDE68A;
  }
  .mag-route-line {
    font-size: 13.5px;
    font-weight: 600;
    color: rgba(255,255,255,0.92);
    line-height: 1.45;
  }
  .companions-note {
    font-size: 14px;
    font-style: italic;
    opacity: 0.92;
    margin-top: 2px;
  }

  /* Template 2: Framed Art Book (Warm Ivory & Forest Teal) */
  .cover-artbook {
    background: #FBF8F3;
    padding: 13mm;
    color: #292524;
  }
  .art-frame {
    width: 100%;
    height: 100%;
    border: 1.5px solid #D9CEBC;
    padding: 13mm 8mm 11mm 8mm;
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
    gap: 10px;
    padding: 0 10mm;
  }
  .art-kicker {
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: 4px;
    color: #0F766E;
    text-transform: uppercase;
  }
  .art-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 54px;
    line-height: 1.08;
    font-weight: 700;
    margin: 4px 0 0 0;
    color: #1C1917;
  }
  .art-sub {
    font-size: 15px;
    color: #57534E;
    font-weight: 600;
  }
  .art-center {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .art-photo-window {
    width: 168mm;
    height: 120mm;
    position: relative;
    overflow: hidden;
    border-radius: 3px;
    box-shadow: 0 14px 36px rgba(28, 25, 23, 0.14);
    border: 3mm solid #FFFFFF;
  }
  .art-photo-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .art-bottom {
    width: 100%;
    padding: 6mm 10mm 0 10mm;
    border-top: 1px solid #DFD6C5;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .art-route {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 14.5px;
    color: #292524;
    letter-spacing: 0.3px;
    line-height: 1.5;
  }
  .art-stats-line {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: #0F766E;
  }

  /* Template 3: Vintage Passport Journal (Midnight Navy & Gold) */
  .cover-passport {
    background: linear-gradient(160deg, #101730 0%, #1B254B 55%, #0E152B 100%);
    padding: 13mm;
    color: #F6E6B4;
  }
  .pass-border-outer {
    width: 100%;
    height: 100%;
    border: 2.5px solid #D4AF37;
    border-radius: 16px;
    padding: 3mm;
  }
  .pass-border-inner {
    width: 100%;
    height: 100%;
    border: 1px solid rgba(212, 175, 55, 0.58);
    border-radius: 10px;
    padding: 14mm 12mm 11mm 12mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
  }
  .pass-kicker {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 5px;
    color: #D4AF37;
  }
  .pass-brand {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 19px;
    letter-spacing: 4px;
    color: rgba(246, 230, 180, 0.9);
    margin-top: 6px;
  }
  .pass-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }
  .pass-cameo-ring {
    padding: 2.5mm;
    border: 2px solid #D4AF37;
    border-radius: 18px;
    background: rgba(255,255,255,0.05);
    margin-bottom: 4px;
  }
  .pass-cameo-window {
    width: 96mm;
    height: 96mm;
    position: relative;
    overflow: hidden;
    border-radius: 11px;
  }
  .pass-emblem { margin: 14px 0; }
  .pass-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 50px;
    line-height: 1.08;
    margin: 4px 0 0 0;
    color: #FDF3D0;
  }
  .pass-sub {
    font-size: 16.5px;
    font-weight: 600;
    color: #E8D59B;
  }
  .pass-dates {
    font-size: 13px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #D4AF37;
    font-weight: 700;
  }
  .pass-footer {
    width: 100%;
    border-top: 1px solid rgba(212, 175, 55, 0.4);
    padding-top: 5mm;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pass-route {
    font-size: 13.5px;
    color: #F6E6B4;
    line-height: 1.5;
  }
  .pass-edition {
    font-size: 11px;
    letter-spacing: 2.4px;
    font-weight: 800;
    color: #D4AF37;
  }

  /* ====== INNER PAGES (THEMED PER TEMPLATE!) ====== */
  .inner-page {
    width: 210mm;
    padding: 15mm 15mm 14mm 15mm;
    background: ${pal.pageBg};
  }
  .theme-passport .inner-page {
    padding: 12mm 13mm 12mm 13mm;
  }
  .passport-page-frame {
    ${
      templateId === 'passport'
        ? 'border: 1.5px solid #C8B07B; border-radius: 10px; padding: 10mm 10mm 9mm 10mm; background: #F8F1E1;'
        : ''
    }
  }
  .stories-page {
    page-break-before: always;
    break-before: page;
  }

  /* Magazine Inner Header */
  .mag-spread-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-top: 3px solid #111827;
    border-bottom: 1px solid #CBD5E1;
    padding: 12px 0 10px 0;
    margin-bottom: 20px;
    break-after: avoid;
    page-break-after: avoid;
  }

  /* Art Book Inner Header (Centered Museum Gallery) */
  .art-spread-header {
    text-align: center;
    border-bottom: 1px solid #DFD6C5;
    padding-bottom: 14px;
    margin-bottom: 22px;
    break-after: avoid;
    page-break-after: avoid;
  }
  .art-spread-dates {
    font-size: 12px;
    color: #78716C;
    margin-top: 5px;
    font-weight: 600;
  }

  /* Passport Inner Header (Midnight Navy & Gold Banner) */
  .pass-inner-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(120deg, #131A36 0%, #1F2B57 100%);
    border: 1.5px solid #D4AF37;
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 18px;
    color: #F6E6B4;
    break-after: avoid;
    page-break-after: avoid;
  }
  .pass-inner-kicker {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 2.2px;
    color: #D4AF37;
  }
  .pass-inner-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 26px;
    font-weight: 700;
    margin: 3px 0 0 0;
    color: #FDF3D0;
  }
  .pass-inner-date {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #E8D59B;
    text-align: right;
  }

  .spread-kicker {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 2.6px;
    color: ${pal.accent};
    text-transform: uppercase;
  }
  .spread-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 30px;
    font-weight: 700;
    color: ${pal.inkPrimary};
    margin: 3px 0 0 0;
  }
  .spread-page-tag {
    font-size: 11px;
    font-weight: 700;
    color: ${pal.inkMuted};
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

  /* Editorial KPI Strip */
  .editorial-stats {
    display: flex;
    border-top: 1.5px solid ${pal.border};
    border-bottom: 1.5px solid ${pal.border};
    background: ${templateId === 'passport' ? '#FFFDF7' : 'transparent'};
    padding: 14px 0;
    margin-bottom: 20px;
  }
  .ed-stat {
    flex: 1;
    text-align: center;
    border-right: 1px solid ${pal.border};
  }
  .ed-stat:last-child { border-right: none; }
  .ed-stat-val {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 22px;
    font-weight: 700;
    color: ${templateId === 'magazine' ? '#EA580C' : pal.inkPrimary};
  }
  .ed-stat-lbl {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: ${pal.inkMuted};
    margin-top: 3px;
  }

  /* Vintage Inked Passport Stamps */
  .stamps-row {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 20px;
    align-items: center;
    justify-content: ${templateId === 'artbook' ? 'center' : 'flex-start'};
  }
  .passport-stamp {
    border: 2px solid;
    border-radius: ${templateId === 'artbook' ? '4px' : '10px'};
    padding: 3px;
    display: inline-block;
    opacity: 0.9;
  }
  .stamp-inner {
    border: 1px ${templateId === 'artbook' ? 'solid' : 'dashed'};
    border-radius: ${templateId === 'artbook' ? '2px' : '7px'};
    padding: 6px 12px;
    text-align: center;
  }
  .stamp-top { font-size: 8.5px; font-weight: 900; letter-spacing: 1.4px; }
  .stamp-mid { font-size: 13px; font-weight: 900; letter-spacing: 0.8px; margin: 2px 0; }
  .stamp-bot { font-size: 9px; font-weight: 700; opacity: 0.88; }

  /* Route Ribbon */
  .route-ribbon {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: ${templateId === 'artbook' ? 'center' : 'flex-start'};
    gap: 8px;
    background: ${pal.cardBg};
    border: 1px solid ${pal.border};
    border-left: ${templateId === 'artbook' ? `1px solid ${pal.border}` : `4px solid ${pal.accent}`};
    border-radius: ${templateId === 'magazine' ? '4px' : '10px'};
    padding: 13px 16px;
    margin-bottom: 22px;
  }
  .route-node {
    font-size: 13px;
    font-weight: 800;
    color: ${pal.inkPrimary};
  }
  .route-via {
    font-size: 10.5px;
    font-weight: 700;
    color: ${pal.inkMuted};
    margin-left: 4px;
  }
  .route-sep {
    font-size: 13px;
    font-weight: 900;
    color: ${pal.accent};
  }

  /* Boarding-Pass Itinerary Cards */
  .bp-section-label {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: ${pal.accent};
    margin: 0 0 12px 0;
    text-align: ${templateId === 'artbook' ? 'center' : 'left'};
    break-after: avoid;
    page-break-after: avoid;
  }
  .bp-card {
    display: flex;
    background: ${pal.cardBg};
    border: 1.2px solid ${pal.border};
    border-top: ${templateId === 'passport' ? '3.5px solid #131A36' : templateId === 'artbook' ? '1.2px solid #DFD6C5' : '1.2px solid #E2E8F0'};
    border-left: ${templateId === 'artbook' ? '3.5px solid #0F766E' : `1.2px solid ${pal.border}`};
    border-radius: ${templateId === 'magazine' ? '6px' : templateId === 'artbook' ? '4px' : '12px'};
    margin-bottom: 12px;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .bp-main {
    flex: 1;
    padding: 14px 18px;
  }
  .bp-stub {
    width: 168px;
    background: ${pal.stubBg};
    border-left: 1.5px dashed ${pal.border};
    padding: 14px 16px;
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
    gap: 8px;
    margin-bottom: 8px;
  }
  .bp-tag {
    font-size: 9.5px;
    font-weight: 900;
    letter-spacing: 0.7px;
    padding: 3.5px 9px;
    border-radius: ${templateId === 'magazine' ? '3px' : '999px'};
  }
  .bp-tag-flight { background: ${pal.badgeFlightBg}; color: ${pal.badgeFlightInk}; }
  .bp-tag-ground { background: ${pal.badgeGroundBg}; color: ${pal.badgeGroundInk}; }
  .bp-tag-stay   { background: ${pal.badgeStayBg}; color: ${pal.badgeStayInk}; }
  .via-badge {
    font-size: 9.5px;
    font-weight: 800;
    color: ${pal.accent};
    background: ${pal.accentSoft};
    border: 1px solid ${pal.border};
    padding: 2.5px 8px;
    border-radius: 999px;
  }
  .via-direct {
    color: #0F766E;
    background: #CCFBF1;
    border-color: #99F6E4;
  }
  .bp-airline {
    font-size: 12px;
    font-weight: 700;
    color: ${pal.inkMuted};
  }
  .bp-route-big {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bp-endpoint { min-width: 96px; }
  .bp-endpoint-right { text-align: right; }
  .bp-iata {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 25px;
    font-weight: 700;
    color: ${pal.inkPrimary};
    line-height: 1.08;
  }
  .bp-city {
    font-size: 12px;
    color: ${pal.inkMuted};
    font-weight: 600;
  }
  .bp-arc {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .bp-dash {
    flex: 1;
    height: 1px;
    border-top: 1.5px dashed ${pal.border};
  }
  .bp-plane {
    font-size: 15px;
    color: ${pal.accent};
  }
  .bp-compact-route {
    font-size: 15.5px;
    font-weight: 800;
    color: ${pal.inkPrimary};
  }
  .bp-arrow { color: ${pal.accent}; }
  .bp-sub-line {
    font-size: 12px;
    color: ${pal.inkMuted};
    margin-top: 4px;
  }
  .bp-stub-label {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.2px;
    color: ${pal.inkMuted};
  }
  .bp-stub-val {
    font-size: 12.5px;
    font-weight: 800;
    color: ${pal.inkPrimary};
    margin-top: 3px;
  }
  .bp-stub-meta {
    font-size: 11px;
    color: ${pal.inkMuted};
    margin-top: 2px;
  }

  /* ====== STORIES & POLAROID GRID (THEMED PER TEMPLATE!) ====== */
  .polaroid-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }
  .polaroid-card {
    position: relative;
    width: calc(50% - 9px);
    background: ${pal.cardBg};
    border: 1.2px solid ${pal.border};
    border-radius: ${templateId === 'magazine' ? '4px' : templateId === 'artbook' ? '3px' : '12px'};
    padding: ${templateId === 'magazine' ? '0 0 16px 0' : templateId === 'artbook' ? '14px 14px 18px 14px' : '12px 12px 16px 12px'};
    overflow: ${templateId === 'magazine' ? 'hidden' : 'visible'};
    box-shadow: ${templateId === 'passport' ? '0 6px 18px rgba(19, 26, 54, 0.11)' : '0 4px 14px rgba(17, 24, 39, 0.06)'};
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .polaroid-card-wide {
    width: 100%;
  }
  .washi-tape {
    position: absolute;
    top: -7px;
    left: 50%;
    width: 72px;
    height: 15px;
    margin-left: -36px;
    background: rgba(212, 175, 55, 0.38);
    border: 1px solid rgba(154, 107, 22, 0.45);
    border-radius: 2px;
    z-index: 3;
  }
  .polaroid-photo-wrap {
    width: 100%;
    height: 235px;
    border-radius: ${templateId === 'magazine' ? '0' : '4px'};
    overflow: hidden;
    background: #E5E7EB;
    margin-bottom: 12px;
  }
  .polaroid-photo-wide {
    height: 325px;
  }
  .polaroid-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .polaroid-caption {
    padding: ${templateId === 'magazine' ? '0 14px' : '0 2px'};
    text-align: ${templateId === 'artbook' ? 'center' : 'left'};
  }
  .polaroid-text-accent {
    background: ${pal.accentSoft};
    color: ${pal.accent};
    border-radius: 6px;
    padding: 16px 14px;
    font-size: 13px;
    font-weight: 800;
    margin: ${templateId === 'magazine' ? '12px 14px 10px 14px' : '0 0 10px 0'};
  }
  .polaroid-meta {
    display: flex;
    justify-content: ${templateId === 'artbook' ? 'center' : 'space-between'};
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .mood-pill {
    background: ${pal.moodBg};
    color: ${pal.moodInk};
    font-size: 9.5px;
    font-weight: 800;
    padding: 3.5px 9px;
    border-radius: ${templateId === 'magazine' ? '3px' : '999px'};
  }
  .mem-date { font-size: 10.5px; font-weight: 700; color: ${pal.inkMuted}; }
  .mem-title {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 18px;
    font-weight: 700;
    color: ${pal.inkPrimary};
    margin-bottom: 4px;
  }
  .mem-loc { font-size: 11px; font-weight: 700; color: ${pal.accent}; margin-bottom: 6px; }
  .mem-note { font-size: 12.5px; line-height: 1.56; color: ${pal.inkPrimary}; opacity: 0.88; white-space: pre-wrap; }
  .mem-author { font-size: 11px; font-style: italic; color: ${pal.inkMuted}; margin-top: 8px; text-align: ${templateId === 'artbook' ? 'center' : 'right'}; }

  .colophon-footer {
    margin-top: 26px;
    padding-top: 12px;
    border-top: 1px solid ${pal.border};
    text-align: center;
    font-size: 10.5px;
    letter-spacing: 0.6px;
    color: ${pal.inkMuted};
  }
</style>
</head>
<body class="theme-${templateId}">
  ${coverPageHtml}

  <section class="inner-page">
    <div class="passport-page-frame">
      ${journeyHeaderHtml}

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
    </div>
  </section>

  ${
    orderedMemories.length > 0
      ? `<section class="inner-page stories-page">
          <div class="passport-page-frame">
            ${storiesHeaderHtml}
            <div class="polaroid-grid">
              ${memoriesHtml}
            </div>
            <div class="colophon-footer">
              Crafted offline with Wanderer's Ledger • Private budgets, expenses &amp; receipts automatically excluded
            </div>
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
