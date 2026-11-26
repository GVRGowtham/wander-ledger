import {
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  inferDestinationVibe,
  lookupAirport,
} from '../db/airportsData';
import {
  julianDayToIsoDate,
  parseIataBcbp,
  SAMPLE_BCBP_STRINGS,
} from '../services/bcbpParser';
import { convertCurrency, DEFAULT_USD_RATES } from '../services/fxService';
import {
  parseClockTimeHm,
  parseDocumentOcrText,
  SAMPLE_OCR_TEXTS,
} from '../services/ocrParser';
import {
  buildManualFlight,
  buildReturnFlight,
  parseFlightNumberInput,
  resolveAirportOrCity,
  searchAirports,
} from '../services/manualFlightBuilder';
import {
  buildTripMemberRows,
  getCoTravelerRole,
  getEditorCount,
  getTripAccessRole,
  isCollaborativeTrip,
} from '../services/sharingHelpers';
import { buildTripKeepsakeHtml } from '../services/keepsakePdfBuilder';
import {
  extractTripYears,
  filterTripsBySearchAndYear,
} from '../services/tripSearchHelpers';
import { buildTravelReminders } from '../services/reminderPlanner';
import { formatTimeHmInput } from '../services/timeInputUtils';
import {
  buildTripSpendLedger,
  collectRequiredFxDates,
  formatShortRateDate,
  resolveDefaultFxDate,
  resolveItemFxRateDate,
} from '../services/spendCurrencyUtils';
import { Expense } from '../types/models';

describe('IATA BCBP Boarding Pass Parser (100% Offline)', () => {
  it('decodes ANA LAX -> HND boarding pass with PNR, seat, miles & loyalty number', () => {
    const ref = new Date('2026-10-10T00:00:00Z');
    const parsed = parseIataBcbp(SAMPLE_BCBP_STRINGS.tokyo, ref);

    expect(parsed).not.toBeNull();
    expect(parsed?.passengerName).toBe('Alex Jordan');
    expect(parsed?.pnr).toBe('7X9K2P');
    expect(parsed?.originIata).toBe('LAX');
    expect(parsed?.destIata).toBe('HND');
    expect(parsed?.airlineCode).toBe('NH');
    expect(parsed?.flightNumber).toBe('NH 105');
    expect(parsed?.cabinClass).toBe('Economy');
    expect(parsed?.seat).toBe('24A');
    expect(parsed?.flightDate).toBe('2026-10-14');
    expect(parsed?.frequentFlyerAirline).toBe('NH');
    expect(parsed?.frequentFlyerNumber).toBe('882194012');
    expect(parsed?.distanceMiles).toBeGreaterThan(5400);
    expect(parsed?.distanceMiles).toBeLessThan(5600);
  });

  it('decodes IndiGo BLR -> GOI domestic boarding pass (alphanumeric carrier 6E)', () => {
    const ref = new Date('2026-01-10T00:00:00Z');
    const parsed = parseIataBcbp(SAMPLE_BCBP_STRINGS.goa, ref);

    expect(parsed).not.toBeNull();
    expect(parsed?.airlineCode).toBe('6E');
    expect(parsed?.airlineName).toBe('IndiGo');
    expect(parsed?.flightNumber).toBe('6E 412');
    expect(parsed?.originIata).toBe('BLR');
    expect(parsed?.destIata).toBe('GOI');
    expect(parsed?.seat).toBe('14C');
    expect(parsed?.distanceMiles).toBeGreaterThan(280);
    expect(parsed?.distanceMiles).toBeLessThan(340);
  });

  it('returns null for non-BCBP strings', () => {
    expect(parseIataBcbp('https://example.com/not-a-boarding-pass')).toBeNull();
    expect(parseIataBcbp('')).toBeNull();
  });

  it('handles year roll-over cleanly when scanning January flight in December', () => {
    const decRef = new Date('2026-12-20T00:00:00Z');
    expect(julianDayToIsoDate(5, decRef)).toBe('2027-01-05');
  });
});

describe('Airports DB, Haversine Math & Destination Postcard Vibes', () => {
  it('computes realistic LAX -> HND great-circle distance & duration', () => {
    const lax = lookupAirport('LAX')!;
    const hnd = lookupAirport('HND')!;
    const miles = calculateDistanceMiles(lax.lat, lax.lng, hnd.lat, hnd.lng);
    expect(miles).toBeGreaterThan(5400);
    expect(miles).toBeLessThan(5550);
    expect(estimateFlightDurationMinutes(miles)).toBeGreaterThan(650);
  });

  it('maps destinations dynamically to matching postcard themes', () => {
    expect(inferDestinationVibe('Kyoto').vibe).toBe('japan');
    expect(inferDestinationVibe('Amalfi Coast').vibe).toBe('coastal');
    expect(inferDestinationVibe('Zurich').vibe).toBe('alpine');
    expect(inferDestinationVibe('Goa').vibe).toBe('tropical');
    expect(inferDestinationVibe('Dubai').vibe).toBe('desert');
  });
});

describe('Receipt & Hotel Confirmation OCR Parser (Offline)', () => {
  it('extracts merchant, JPY total, date & dining category from Kyoto ramen receipt', () => {
    const res = parseDocumentOcrText(SAMPLE_OCR_TEXTS.ramenReceipt, 'USD');
    expect(res.kind).toBe('receipt');
    if (res.kind === 'receipt') {
      expect(res.merchant).toContain('Menba Kawatomi');
      expect(res.amount).toBe(1850);
      expect(res.currency).toBe('JPY');
      expect(res.date).toBe('2026-10-18');
      expect(res.category).toBe('dining');
    }
  });

  it('extracts hotel name, confirmation code, check-in/out dates & nights from hotel booking', () => {
    const res = parseDocumentOcrText(SAMPLE_OCR_TEXTS.hotelConfirmation, 'USD');
    expect(res.kind).toBe('hotel');
    if (res.kind === 'hotel') {
      expect(res.hotelName).toContain('Thousand Kyoto');
      expect(res.confirmationCode).toBe('TK-88412');
      expect(res.checkIn).toBe('2026-10-17');
      expect(res.checkOut).toBe('2026-10-21');
      expect(res.nights).toBe(4);
      expect(res.totalAmount).toBe(1450);
      expect(res.currency).toBe('USD');
    }
  });

  it('extracts EUR totals from Lisbon bakery receipt', () => {
    const res = parseDocumentOcrText(SAMPLE_OCR_TEXTS.lisbonCafe, 'USD');
    expect(res.kind).toBe('receipt');
    if (res.kind === 'receipt') {
      expect(res.currency).toBe('EUR');
      expect(res.amount).toBe(9);
      expect(res.date).toBe('2026-05-06');
    }
  });
});

describe('Offline Multi-Currency FX Service', () => {
  it('converts JPY to USD and EUR to INR accurately using cached rates', () => {
    const jpyToUsd = convertCurrency(1492, 'JPY', 'USD', DEFAULT_USD_RATES);
    expect(jpyToUsd.converted).toBeCloseTo(10, 1);

    const same = convertCurrency(42.5, 'USD', 'USD', DEFAULT_USD_RATES);
    expect(same.converted).toBe(42.5);
    expect(same.rate).toBe(1);
  });
});

describe('Manual Flight Builder (Lost / Missing Boarding Pass)', () => {
  it('parses airline code and loyalty program from flight number input', () => {
    const parsed = parseFlightNumberInput('6e412');
    expect(parsed).not.toBeNull();
    expect(parsed?.airlineCode).toBe('6E');
    expect(parsed?.flightNumber).toBe('6E 412');
    expect(parsed?.airlineName).toBe('IndiGo');
    expect(parsed?.loyaltyProgram).toBe('IndiGo BluChip');
  });

  it('searches bundled offline airports by code and city name', () => {
    const byCode = searchAirports('BLR');
    expect(byCode[0]?.iata).toBe('BLR');
    const byCity = searchAirports('Tokyo');
    expect(byCity.some((a) => a.iata === 'HND')).toBe(true);
    const custom = resolveAirportOrCity('Udaipur');
    expect(custom?.iata).toBe('UDA');
    expect(custom?.city).toBe('Udaipur');
  });

  it('builds a flight cleanly when user only remembers flight number and date', () => {
    const f = buildManualFlight({
      tripId: 'trip_1',
      flightNumber: 'NH105',
      flightDate: '2026-10-14',
      fallbackDestCity: 'Tokyo',
    });
    expect(f.airlineCode).toBe('NH');
    expect(f.airlineName).toContain('ANA');
    expect(f.flightNumber).toBe('NH 105');
    expect(f.originIata).toBe('TBD');
    expect(f.destIata).toBe('HND');
    expect(f.departureTime).toBe('2026-10-14T00:00:00');
  });

  it('builds outbound and swapped return flights from origin/destination cities without a flight number', () => {
    const outbound = buildManualFlight({
      tripId: 'trip_2',
      originInput: 'Bengaluru',
      destInput: 'Goa',
      flightDate: '2026-08-10',
      departureTimeHm: '09:15',
      seat: '12a',
      cabinClass: 'Economy',
    });
    expect(outbound.originIata).toBe('BLR');
    expect(outbound.destIata).toBe('GOI');
    expect(outbound.distanceMiles).toBeGreaterThan(280);
    expect(outbound.milesEarned).toBe(outbound.distanceMiles);
    expect(outbound.seat).toBe('12A');
    expect(outbound.departureTime).toBe('2026-08-10T09:15:00');

    const ret = buildReturnFlight(outbound, '2026-08-14', '6E 419');
    expect(ret.originIata).toBe('GOI');
    expect(ret.destIata).toBe('BLR');
    expect(ret.flightNumber).toBe('6E 419');
    expect(ret.departureTime).toBe('2026-08-14T00:00:00');
  });
});

describe('Flight Booking Confirmation OCR Parser (Offline)', () => {
  it('detects IndiGo flight booking confirmation email and extracts PNR, route, date, seat & INR fare', () => {
    const res = parseDocumentOcrText(SAMPLE_OCR_TEXTS.flightConfirmation, 'USD');
    expect(res.kind).toBe('boarding_pass');
    if (res.kind === 'boarding_pass') {
      expect(res.source).toBe('ocr');
      expect(res.airlineCode).toBe('6E');
      expect(res.airlineName).toBe('IndiGo');
      expect(res.flightNumber).toBe('6E 412');
      expect(res.pnr).toBe('R8V2N4');
      expect(res.originIata).toBe('BLR');
      expect(res.destIata).toBe('GOI');
      expect(res.flightDate).toBe('2026-10-14');
      expect(res.seat).toBe('14C');
      expect(res.ticketAmount).toBe(6450);
      expect(res.ticketCurrency).toBe('INR');
      expect(res.distanceMiles).toBeGreaterThan(280);
    }
  });

  it('parses international flight confirmation with DD/MM/YYYY date and allows forceKind override', () => {
    const raw = `United Airlines E-Ticket Itinerary
Confirmation Code: XY98Z1
Flight UA 875
San Francisco (SFO) to Tokyo (HND)
Departure Date: 18/11/2026
Business Class • Seat 4A
Total Paid: $2,480.00`;

    const res = parseDocumentOcrText(raw, 'USD');
    expect(res.kind).toBe('boarding_pass');
    if (res.kind === 'boarding_pass') {
      expect(res.airlineCode).toBe('UA');
      expect(res.flightNumber).toBe('UA 875');
      expect(res.pnr).toBe('XY98Z1');
      expect(res.originIata).toBe('SFO');
      expect(res.destIata).toBe('HND');
      expect(res.flightDate).toBe('2026-11-18');
      expect(res.cabinClass).toBe('Business');
      expect(res.seat).toBe('4A');
      expect(res.ticketAmount).toBe(2480);
      expect(res.ticketCurrency).toBe('USD');
    }

    // Force-override as receipt works cleanly too
    const asReceipt = parseDocumentOcrText(raw, 'USD', undefined, 'receipt');
    expect(asReceipt.kind).toBe('receipt');
  });
});

import { buildHashtags, generateOfflineIgCaption } from '../services/igCaptionService';
import { Flight, Memory, Trip } from '../types/models';

describe('Instagram Draft Caption Studio (100% Offline, Privacy-Safe)', () => {
  const sampleTrip: Trip = {
    id: 'trip_kyoto',
    ownerId: 'u1',
    title: 'Kyoto Autumn Escape',
    destinationCity: 'Kyoto',
    destinationCountry: 'Japan',
    countryCode: 'JP',
    flagEmoji: '🇯🇵',
    startDate: '2026-10-14',
    endDate: '2026-10-19',
    homeCurrency: 'USD',
    budget: 3200,
    vibe: 'japan',
    isShared: false,
    coTravelers: [],
    lat: 35.01,
    lng: 135.76,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const sampleMemories: Memory[] = [
    {
      id: 'm1',
      tripId: 'trip_kyoto',
      title: 'Golden Torii Sunrise',
      note: 'Beat the crowds at 6 AM and the lanterns were still glowing.',
      capturedAt: '2026-10-15T06:15:00',
      placeName: 'Fushimi Inari',
      moodSticker: '🌅 Core Memory',
      isHighlight: true,
      createdAt: '2026-10-15T06:20:00Z',
    },
  ];

  const sampleFlights: Flight[] = [
    {
      id: 'f1',
      tripId: 'trip_kyoto',
      airlineCode: 'NH',
      airlineName: 'ANA',
      flightNumber: 'NH 105',
      originIata: 'LAX',
      originCity: 'Los Angeles',
      destIata: 'HND',
      destCity: 'Tokyo',
      departureTime: '2026-10-14T10:30:00Z',
      arrivalTime: '2026-10-15T14:30:00Z',
      durationMinutes: 710,
      status: 'scheduled',
      distanceMiles: 5478,
      milesEarned: 5478,
      enrichedOnline: false,
      createdAt: '2026-10-01T00:00:00Z',
    },
  ];

  it('generates offline captions across all 4 tones without ever leaking budget or spend', () => {
    const aesthetic = generateOfflineIgCaption({
      trip: sampleTrip,
      memories: sampleMemories,
      flights: sampleFlights,
      tone: 'aesthetic',
      includeHashtags: true,
      includeWatermarkTag: true,
    });
    expect(aesthetic.toLowerCase()).toContain('kyoto');
    expect(aesthetic).toContain('Fushimi Inari');
    expect(aesthetic).toContain('#wanderersledger');
    expect(aesthetic).not.toContain('3200');

    const stats = generateOfflineIgCaption({
      trip: sampleTrip,
      memories: sampleMemories,
      flights: sampleFlights,
      tone: 'stats',
      includeHashtags: false,
      includeWatermarkTag: false,
    });
    expect(stats).toContain('LAX → HND');
    expect(stats).toContain('8,816 km');
    expect(stats).not.toContain('#');
    expect(stats).not.toContain('3200');

    const statsMi = generateOfflineIgCaption({
      trip: sampleTrip,
      memories: sampleMemories,
      flights: sampleFlights,
      distanceUnit: 'mi',
      tone: 'stats',
      includeHashtags: false,
      includeWatermarkTag: false,
    });
    expect(statsMi).toContain('5,478 miles');
  });

  it('respects watermark toggle in generated hashtags', () => {
    const withTag = buildHashtags(sampleTrip, sampleMemories, true);
    const withoutTag = buildHashtags(sampleTrip, sampleMemories, false);
    expect(withTag).toContain('#wanderersledger');
    expect(withoutTag).not.toContain('#wanderersledger');
  });
});

import { extractPhotoCapturedAt, extractPhotoGps } from '../services/photoMetadata';

describe('Photo Capture Date & GPS Metadata Extractor (Offline)', () => {
  it('extracts EXIF DateTimeOriginal and falls back to DateTimeDigitized / GPSDateStamp', () => {
    expect(
      extractPhotoCapturedAt({
        exif: { DateTimeOriginal: '2025:10:18 06:45:12' },
      })
    ).toBe('2025-10-18T06:45:12');

    expect(
      extractPhotoCapturedAt({
        exif: { DateTimeDigitized: '2024:07:04 19:20:00' },
      })
    ).toBe('2024-07-04T19:20:00');

    expect(
      extractPhotoCapturedAt({
        exif: { GPSDateStamp: '2025:03:22' },
      })
    ).toBe('2025-03-22T12:00:00');
  });

  it('extracts dates from Pixel, Samsung, WhatsApp, and Screenshot filenames when EXIF is missing', () => {
    expect(
      extractPhotoCapturedAt({ fileName: 'PXL_20250814_112233456.jpg' })
    ).toBe('2025-08-14T11:22:33');

    expect(
      extractPhotoCapturedAt({ fileName: 'IMG-20241225-WA0007.jpg' })
    ).toBe('2024-12-25T12:00:00');

    expect(
      extractPhotoCapturedAt({ fileName: 'Screenshot_2026-01-09-14-05-00.png' })
    ).toBe('2026-01-09T12:00:00');
  });

  it('applies S/W hemisphere signs to EXIF GPS coordinates', () => {
    const gps = extractPhotoGps({
      GPSLatitude: 33.8688,
      GPSLatitudeRef: 'S',
      GPSLongitude: 151.2093,
      GPSLongitudeRef: 'E',
    });
    expect(gps.lat).toBeCloseTo(-33.8688, 3);
    expect(gps.lng).toBeCloseTo(151.2093, 3);
  });
});

import {
  computeCroppedImageLayout,
  computeNativeExportCanvasWidth,
  formatEditorialDateRange,
  formatLocationLabel,
  formatStampMonthYear,
  getAvailableLayouts,
  getDefaultPostcardNote,
  getRouteStatsItems,
  isGenericPlaceholderNote,
} from '../services/igStudioHelpers';

describe('IG Studio Helpers (Layouts, Framing Math, Editorial Formatting)', () => {
  const swissTrip: Trip = {
    id: 'trip_ch',
    ownerId: 'u1',
    title: 'Swiss Trip',
    destinationCity: 'Switzerland',
    destinationCountry: 'Switzerland',
    countryCode: 'CH',
    flagEmoji: '🇨🇭',
    startDate: '2025-11-01',
    endDate: '2025-11-05',
    homeCurrency: 'USD',
    budget: 2500,
    vibe: 'alpine',
    isShared: false,
    coTravelers: [],
    lat: 46.8,
    lng: 8.2,
    createdAt: '2025-11-01T00:00:00Z',
    updatedAt: '2025-11-01T00:00:00Z',
  };

  it('formats editorial dates and stamps cleanly without raw ISO arrows', () => {
    expect(formatEditorialDateRange('2025-11-01', '2025-11-05')).toBe('Nov 1 – 5, 2025');
    expect(formatEditorialDateRange('2025-11-01', '2025-11-01')).toBe('Nov 1, 2025');
    expect(formatEditorialDateRange('2025-11-28', '2025-12-03')).toBe('Nov 28 – Dec 3, 2025');
    expect(formatEditorialDateRange('2025-12-29', '2026-01-02')).toBe('Dec 29, 2025 – Jan 2, 2026');
    expect(formatStampMonthYear('2025-11-01')).toBe('NOV 2025');
  });

  it('deduplicates identical city and country labels and filters generic placeholder notes', () => {
    expect(formatLocationLabel('Switzerland', 'Switzerland')).toBe('Switzerland');
    expect(formatLocationLabel('Lucerne', 'Switzerland')).toBe('Lucerne, Switzerland');
    expect(isGenericPlaceholderNote('A favorite moment from the journey ✨')).toBe(true);
    expect(isGenericPlaceholderNote('Sunset over Mount Titlis')).toBe(false);

    const genericMem: Memory = {
      id: 'm1',
      tripId: 'trip_ch',
      title: 'Alps view',
      note: 'A favorite moment from the journey ✨',
      capturedAt: '2025-11-01T12:00:00',
      moodSticker: '✨',
      isHighlight: false,
      createdAt: '2025-11-01T12:00:00Z',
    };
    expect(getDefaultPostcardNote(swissTrip, [genericMem])).toBe(
      'Wishing you were here in Switzerland ✨'
    );
  });

  it('never duplicates DAYS in Route Stats when a trip has no logged flights', () => {
    const mems: Memory[] = [
      {
        id: 'm1',
        tripId: 'trip_ch',
        title: 'Alps view',
        note: '',
        capturedAt: '2025-11-01T12:00:00',
        moodSticker: '🏔️',
        isHighlight: false,
        createdAt: '2025-11-01T12:00:00Z',
      },
      {
        id: 'm2',
        tripId: 'trip_ch',
        title: 'Titlis Chills',
        note: '',
        capturedAt: '2025-11-02T12:00:00',
        moodSticker: '❄️',
        isHighlight: false,
        createdAt: '2025-11-02T12:00:00Z',
      },
    ];
    const items = getRouteStatsItems(swissTrip, mems, []);
    const labels = items.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(['DAYS', 'MEMORIES']);
  });

  it('computes WYSIWYG cropped image rect clamped inside slot bounds with top/bottom presets', () => {
    // Portrait photo (1000x1500) placed in a wide slot (200x100)
    const topCrop = computeCroppedImageLayout(200, 100, 1000, 1500, {
      offsetX: 0,
      offsetY: 1,
      zoom: 1,
    });
    expect(topCrop.width).toBeCloseTo(200, 1);
    expect(topCrop.height).toBeCloseTo(300, 1);
    expect(topCrop.top).toBeCloseTo(0, 1); // Aligned to very top so faces are preserved

    const bottomCrop = computeCroppedImageLayout(200, 100, 1000, 1500, {
      offsetX: 0,
      offsetY: -1,
      zoom: 1,
    });
    expect(bottomCrop.top).toBeCloseTo(-200, 1); // Aligned to very bottom, zero gap exposed

    expect(getAvailableLayouts(3).map((l) => l.id)).toContain('portrait_left');
    expect(computeNativeExportCanvasWidth(2) * 2).toBeGreaterThanOrEqual(1080);
    expect(computeNativeExportCanvasWidth(2.625) * 2.625).toBeGreaterThanOrEqual(1080);
    expect(computeNativeExportCanvasWidth(3) * 3).toBeGreaterThanOrEqual(1080);
  });
});

import { mapAiJsonToScanResult } from '../services/aiDocumentExtractor';
import {
  mergeOcrTexts,
  parseDateRangeFromString,
} from '../services/ocrParser';

describe('Smart Scan v2 (CHF/European Totals, Multi-line Hotel PDFs, Stitching & AI Schema)', () => {
  it('extracts CHF Swiss totals and European comma decimals cleanly', () => {
    const swissBill = `ALPINE CHALET RESTAURANT
2025-11-02
Cheese Fondue       CHF 38.00
Hot Chocolate x2    CHF 14.50
Gesamtbetrag        CHF 52.50`;
    const parsed = parseDocumentOcrText(swissBill, 'USD');
    expect(parsed.kind).toBe('receipt');
    if (parsed.kind === 'receipt') {
      expect(parsed.currency).toBe('CHF');
      expect(parsed.amount).toBeCloseTo(52.5, 2);
    }

    const euroBill = `CAFE ZURICH
Total TTC
€ 18,50`;
    const parsedEu = parseDocumentOcrText(euroBill, 'USD');
    expect(parsedEu.kind).toBe('receipt');
    if (parsedEu.kind === 'receipt') {
      expect(parsedEu.currency).toBe('EUR');
      expect(parsedEu.amount).toBeCloseTo(18.5, 2);
    }
  });

  it('parses Booking.com 2-line Check-in/Check-out hotel confirmations and infers cityHint', () => {
    const bookingEmail = `Booking.com
Reservation confirmed
Hotel Schweizerhof Zurich
Bahnhofplatz 7, Zurich, Switzerland
Check-in
Sat, Nov 1, 2025
Check-out
Wed, Nov 5, 2025
Confirmation number: 4829104421
Total price
CHF 1,240.00`;

    const parsed = parseDocumentOcrText(bookingEmail, 'USD');
    expect(parsed.kind).toBe('hotel');
    if (parsed.kind === 'hotel') {
      expect(parsed.hotelName).toContain('Schweizerhof');
      expect(parsed.checkIn).toBe('2025-11-01');
      expect(parsed.checkOut).toBe('2025-11-05');
      expect(parsed.nights).toBe(4);
      expect(parsed.currency).toBe('CHF');
      expect(parsed.totalAmount).toBe(1240);
      expect(parsed.cityHint).toBe('Zurich');
    }

    expect(parseDateRangeFromString('Stay dates: Nov 1 – 5, 2025')).toEqual({
      start: '2025-11-01',
      end: '2025-11-05',
    });
  });

  it('merges overlapping top/bottom receipt scans without duplicating header lines and validates AI JSON', () => {
    const merged = mergeOcrTexts([
      'GRAND HOTEL FOLIO\nRoom 402 • Nov 1, 2025\nBreakfast CHF 24.00',
      'Room 402 • Nov 1, 2025\nDinner CHF 68.00\nGrand Total CHF 92.00',
    ]);
    expect(merged.match(/Room 402/g)?.length).toBe(1);
    expect(merged).toContain('Grand Total CHF 92.00');

    const aiMapped = mapAiJsonToScanResult(
      {
        kind: 'hotel',
        hotelName: 'Badrutt Palace',
        confirmationCode: 'BP-7788',
        checkIn: '2025-11-01',
        checkOut: '2025-11-04',
        totalAmount: 980,
        currency: 'chf',
        cityHint: 'Zurich',
      },
      'raw text',
      'USD'
    );
    expect(aiMapped?.kind).toBe('hotel');
    if (aiMapped?.kind === 'hotel') {
      expect(aiMapped.nights).toBe(3);
      expect(aiMapped.currency).toBe('CHF');
      expect(aiMapped.cityHint).toBe('Zurich');
    }
  });

  it('parses MakeMyTrip / Goibibo / Agoda hotel vouchers in INR with short-year dates', () => {
    const mmtVoucher = `MakeMyTrip
Hotel Voucher
Booking ID: NH72019384729
Taj Fort Aguada Resort & Spa, Goa
Check-in: Fri, 14 Nov '25
Check-out: Mon, 17 Nov '25
3 Nights • Sea View Cottage
Total Paid: ₹48,500`;

    const parsed = parseDocumentOcrText(mmtVoucher, 'INR');
    expect(parsed.kind).toBe('hotel');
    if (parsed.kind === 'hotel') {
      expect(parsed.hotelName).toContain('Taj Fort Aguada');
      expect(parsed.confirmationCode).toBe('NH72019384729');
      expect(parsed.checkIn).toBe('2025-11-14');
      expect(parsed.checkOut).toBe('2025-11-17');
      expect(parsed.nights).toBe(3);
      expect(parsed.currency).toBe('INR');
      expect(parsed.totalAmount).toBe(48500);
      expect(parsed.cityHint).toBe('Goa');
    }
  });
});

import {
  buildJourneyRouteTrail,
  buildJourneyTimeline,
  convertToKm,
  formatDistance,
  formatFlightDistance,
  matchStopForDate,
  suggestStopsFromBookings,
} from '../services/distanceUtils';
import { Stay, TransportLeg, TripStop } from '../types/models';

describe('v0.4.0 Multi-Mode Travel, Distance Units (km/mi) & Multi-Hop Stops', () => {
  it('converts and formats distances cleanly in km (default) and mi', () => {
    expect(formatDistance(260, 'km')).toBe('260 km');
    expect(formatDistance(260, 'mi')).toBe('162 mi');
    expect(formatFlightDistance(1000, 'km')).toBe('1,609 km');
    expect(formatFlightDistance(1000, 'mi')).toBe('1,000 mi');
    expect(convertToKm(100, 'mi')).toBe(161);
    expect(convertToKm(100, 'km')).toBe(100);
  });

  it('auto-matches EXIF photo dates to the right TripStop and suggests stops from bookings', () => {
    const stops: TripStop[] = [
      { id: 's1', tripId: 't1', cityName: 'Zurich', startDate: '2025-11-01', endDate: '2025-11-03', sortOrder: 0, createdAt: '' },
      { id: 's2', tripId: 't1', cityName: 'Lucerne', startDate: '2025-11-03', endDate: '2025-11-05', sortOrder: 1, createdAt: '' },
      { id: 's3', tripId: 't1', cityName: 'Interlaken', startDate: '2025-11-06', endDate: '2025-11-08', sortOrder: 2, createdAt: '' },
    ];
    expect(matchStopForDate(stops, '2025-11-02T14:22:00')?.cityName).toBe('Zurich');
    // Transition day prefers arriving stop
    expect(matchStopForDate(stops, '2025-11-03T18:10:00')?.cityName).toBe('Lucerne');
    expect(matchStopForDate(stops, '2025-11-07')?.cityName).toBe('Interlaken');
    expect(matchStopForDate(stops, '2025-11-12')).toBeUndefined();

    const transports: TransportLeg[] = [
      {
        id: 'trn1',
        tripId: 't1',
        mode: 'train',
        title: 'SBB InterCity',
        origin: 'Zurich HB',
        destination: 'Zermatt',
        startDate: '2025-11-09',
        createdAt: '',
      },
    ];
    const suggested = suggestStopsFromBookings([], transports, [], stops);
    expect(suggested.map((s) => s.cityName)).toContain('Zermatt');
  });

  it('sorts flights, trains, car rentals, and stays into one chronological journey timeline', () => {
    const flights: Flight[] = [
      {
        id: 'f1', tripId: 't1', airlineCode: 'LX', airlineName: 'SWISS', flightNumber: 'LX 147',
        originIata: 'BLR', originCity: 'Bengaluru', destIata: 'ZRH', destCity: 'Zurich',
        departureTime: '2025-11-01T02:00:00Z', arrivalTime: '2025-11-01T08:00:00Z',
        durationMinutes: 540, status: 'completed', distanceMiles: 4700, milesEarned: 4700,
        enrichedOnline: false, createdAt: '',
      },
    ];
    const transports: TransportLeg[] = [
      {
        id: 'trn1', tripId: 't1', mode: 'train', title: 'SBB IC8',
        origin: 'Zurich HB', destination: 'Lucerne', startDate: '2025-11-03', distanceKm: 55, createdAt: '',
      },
    ];
    const stays: Stay[] = [
      {
        id: 'st1', tripId: 't1', name: 'Hotel Schweizerhof', stayType: 'hotel',
        checkIn: '2025-11-01', checkOut: '2025-11-03', nights: 2,
        costCash: 500, currency: 'CHF', homeCost: 560, pointsRedeemed: 0, createdAt: '',
      },
      {
        id: 'st2', tripId: 't1', name: 'Lake Lucerne Hotel', stayType: 'hotel',
        checkIn: '2025-11-03', checkOut: '2025-11-05', nights: 2,
        costCash: 420, currency: 'CHF', homeCost: 470, pointsRedeemed: 0, createdAt: '',
      },
    ];

    const timeline = buildJourneyTimeline(flights, transports, stays);
    expect(timeline.map((i) => i.kind)).toEqual(['flight', 'stay', 'transport', 'stay']);
    const trail = buildJourneyRouteTrail(flights, transports, []);
    expect(trail).toContain('BLR → ZRH');
  });

  it('parses IRCTC train tickets, Sixt car rentals, and IndianOil / Shell fuel bills offline', () => {
    const irctcTicket = `IRCTC Electronic Reservation Slip
Train No: 20608 Vande Bharat Exp
PNR: 4518293041
From Station: Bengaluru
To Station: Mysuru
Date: 15 Nov 2025
Coach: C4 / 22
Total Fare: ₹1,150`;
    const parsedTrain = parseDocumentOcrText(irctcTicket, 'INR');
    expect(parsedTrain.kind).toBe('transport');
    if (parsedTrain.kind === 'transport') {
      expect(parsedTrain.mode).toBe('train');
      expect(parsedTrain.origin).toContain('Bengaluru');
      expect(parsedTrain.destination).toContain('Mysuru');
      expect(parsedTrain.referenceCode).toBe('4518293041');
      expect(parsedTrain.totalAmount).toBe(1150);
      expect(parsedTrain.currency).toBe('INR');
    }

    const sixtRental = `SIXT CAR RENTAL
Reservation: SX992014
Pickup Location: Zurich Airport
Drop-off Location: Geneva Airport
Pickup Date: 2025-11-01
Return Date: 2025-11-05
Vehicle: VW Golf Automatic
Total Price: CHF 380.00`;
    const parsedCar = parseDocumentOcrText(sixtRental, 'CHF');
    expect(parsedCar.kind).toBe('transport');
    if (parsedCar.kind === 'transport') {
      expect(parsedCar.mode).toBe('rental_car');
      expect(parsedCar.operatorName).toContain('Sixt');
      expect(parsedCar.startDate).toBe('2025-11-01');
      expect(parsedCar.endDate).toBe('2025-11-05');
      expect(parsedCar.totalAmount).toBe(380);
    }

    const fuelReceipt = `IndianOil Petrol Pump
NH-75 Highway
Petrol 32.5 Litres
Date: 2025-11-16
Grand Total: ₹3,340.00`;
    const parsedFuel = parseDocumentOcrText(fuelReceipt, 'INR');
    expect(parsedFuel.kind).toBe('receipt');
    if (parsedFuel.kind === 'receipt') {
      expect(parsedFuel.category).toBe('fuel');
      expect(parsedFuel.amount).toBe(3340);
      expect(parsedFuel.currency).toBe('INR');
    }

    const aiTransport = mapAiJsonToScanResult(
      {
        kind: 'transport',
        mode: 'train',
        operatorName: 'SBB',
        origin: 'Zurich HB',
        destination: 'Lucerne',
        startDate: '2025-11-03',
        totalAmount: 29,
        currency: 'CHF',
      },
      'raw',
      'CHF'
    );
    expect(aiTransport?.kind).toBe('transport');
  });

  it('adapts IG Studio Route Stats and captions for road trips and user km/mi preference', () => {
    const roadTrip: Trip = {
      id: 'trip_coorg',
      ownerId: 'u1',
      title: 'Coorg Coffee Road Trip',
      destinationCity: 'Coorg',
      destinationCountry: 'India',
      countryCode: 'IN',
      flagEmoji: '🇮🇳',
      startDate: '2025-11-14',
      endDate: '2025-11-16',
      homeCurrency: 'INR',
      budget: 25000,
      vibe: 'alpine',
      isShared: false,
      coTravelers: [],
      lat: 12.33,
      lng: 75.8,
      createdAt: '',
      updatedAt: '',
    };
    const driveLeg: TransportLeg = {
      id: 'trn_drive',
      tripId: 'trip_coorg',
      mode: 'own_car',
      title: 'Own Car Road Trip',
      origin: 'Bengaluru',
      destination: 'Coorg',
      startDate: '2025-11-14',
      distanceKm: 520,
      createdAt: '',
    };
    const kmStats = getRouteStatsItems(roadTrip, [], [], [driveLeg], 'km');
    expect(kmStats[0]).toEqual({ value: '520', label: 'KM TRAVELED' });
    const miStats = getRouteStatsItems(roadTrip, [], [], [driveLeg], 'mi');
    expect(miStats[0]).toEqual({ value: '323', label: 'MILES TRAVELED' });

    const captionKm = generateOfflineIgCaption({
      trip: roadTrip,
      memories: [],
      flights: [],
      transports: [driveLeg],
      distanceUnit: 'km',
      tone: 'stats',
      includeHashtags: false,
      includeWatermarkTag: false,
    });
    expect(captionKm).toContain('Bengaluru → Coorg');
    expect(captionKm).toContain('520 km');
  });
});

describe('v0.4.2 Airline E-Ticket PDF OCR Accuracy (Etihad / Emirates / Multi-page PDFs)', () => {
  it('classifies Etihad e-ticket PDF as flight (not hotel), skips issue date & baggage kg, and extracts INR fare', () => {
    const etihadPdf = `ETIHAD AIRWAYS
Electronic Ticket Itinerary & Receipt
Date of issue: 12 Sep 2025
Booking reference: 7CHIQH
Ticket number: 607-2418392014
Passenger: SRUTHY SANKARANARAYANAN

Flight EY 217
Departure
Fri, 31 Oct
22:00 Bengaluru (BLR) -> 00:50 Abu Dhabi (AUH)
Total duration: 4h 25m
Baggage allowance: Total 30 KG
Online Check-in opens 48 hours before departure.
Abu Dhabi Stopover: enjoy a free hotel stay on eligible routes.

Fare Details
Base Fare: INR 46,000
Taxes & Fees: INR 8,280
Total Fare: INR 54,280

Conditions & European Union passenger rights:
Change fee: USD 100
No-show penalty: USD 200`;

    const parsed = parseDocumentOcrText(etihadPdf, 'USD');
    expect(parsed.kind).toBe('boarding_pass');
    if (parsed.kind === 'boarding_pass') {
      expect(parsed.airlineCode).toBe('EY');
      expect(parsed.flightNumber).toBe('EY 217');
      expect(parsed.pnr).toBe('7CHIQH');
      expect(parsed.originIata).toBe('BLR');
      expect(parsed.destIata).toBe('AUH');
      expect(parsed.flightDate).toBe('2025-10-31');
      expect(parsed.ticketAmount).toBe(54280);
      expect(parsed.ticketCurrency).toBe('INR');
      expect(parsed.distanceMiles).toBeGreaterThan(1600);
    }
  });

  it('handles compact airline dates (10JAN / 31OCT25) with year rollover past booking date and AED fare', () => {
    const emiratesPdf = `EMIRATES E-TICKET ITINERARY
Booking date: 18 Nov 2025
PNR: K9M4P2
EK 569 10JAN BLR - DXB
Online Check-in available 48h prior. Rent a car with Sixt for your trip.
Total baggage: 30 kg
Grand Total: AED 1,890.50`;

    const parsed = parseDocumentOcrText(emiratesPdf, 'USD');
    expect(parsed.kind).toBe('boarding_pass');
    if (parsed.kind === 'boarding_pass') {
      expect(parsed.flightNumber).toBe('EK 569');
      expect(parsed.pnr).toBe('K9M4P2');
      expect(parsed.originIata).toBe('BLR');
      expect(parsed.destIata).toBe('DXB');
      expect(parsed.flightDate).toBe('2026-01-10');
      expect(parsed.ticketAmount).toBeCloseTo(1890.5, 2);
      expect(parsed.ticketCurrency).toBe('AED');
    }
  });
});

import { reconstructSpatialTextFromBlocks } from '../services/nativeOcr';
import { extractMoneyCandidates } from '../services/ocrParser';

describe('v0.4.3 Spatial Table Row Reconstruction & Tax-vs-Total Fare Accuracy', () => {
  it('reconstructs 2-column ML Kit PDF tables into visual rows and picks Total Calculated Fare (69,422) over Taxes (408,804)', () => {
    const mlKitBlocks = [
      {
        text: 'ETIHAD AIRWAYS\nBooking reference: 7CHIQH\nEY 217  31OCT25  BLR -> AUH',
        lines: [
          { text: 'ETIHAD AIRWAYS', frame: { top: 40, left: 60, width: 320, height: 32 } },
          { text: 'Booking reference: 7CHIQH', frame: { top: 90, left: 60, width: 340, height: 26 } },
          { text: 'EY 217  31OCT25  BLR -> AUH', frame: { top: 140, left: 60, width: 420, height: 26 } },
        ],
      },
      // Left column block (all labels)
      {
        text: 'Base Fare\nTotal Taxes & Carrier Charges\nTotal Calculated Fare',
        lines: [
          { text: 'Base Fare', frame: { top: 300, left: 60, width: 180, height: 26 } },
          { text: 'Total Taxes & Carrier Charges', frame: { top: 344, left: 60, width: 360, height: 26 } },
          { text: 'Total Calculated Fare', frame: { top: 392, left: 60, width: 290, height: 28 } },
        ],
      },
      // Right column block (all numbers — including a misread tax decimal 408,804 > 69,422!)
      {
        text: 'INR 52,000\nINR 408,804\nINR 69,422',
        lines: [
          { text: 'INR 52,000', frame: { top: 302, left: 1200, width: 180, height: 26 } },
          { text: 'INR 408,804', frame: { top: 345, left: 1200, width: 190, height: 26 } },
          { text: 'INR 69,422', frame: { top: 393, left: 1200, width: 185, height: 28 } },
        ],
      },
    ];

    const spatialText = reconstructSpatialTextFromBlocks(mlKitBlocks);
    expect(spatialText).toContain('Total Calculated Fare  INR 69,422');
    expect(spatialText).toContain('Total Taxes & Carrier Charges  INR 408,804');

    const parsed = parseDocumentOcrText(spatialText, 'INR');
    expect(parsed.kind).toBe('boarding_pass');
    if (parsed.kind === 'boarding_pass') {
      expect(parsed.flightNumber).toBe('EY 217');
      expect(parsed.pnr).toBe('7CHIQH');
      expect(parsed.flightDate).toBe('2025-10-31');
      expect(parsed.ticketAmount).toBe(69422);
      expect(parsed.ticketCurrency).toBe('INR');
    }

    const candidates = extractMoneyCandidates(spatialText, 'INR', 4);
    expect(candidates[0]).toEqual({ amount: 69422, currency: 'INR' });
    expect(candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('skips standalone tax lines even when total label is generic and has no currency prefix on that line', () => {
    const raw = `ETIHAD AIRWAYS E-TICKET
Booking Ref: 7CHIQH
EY 217 31 Oct 2025 BLR -> AUH
Taxes: INR 408,804
Total calculated fare: 69422`;

    const parsed = parseDocumentOcrText(raw, 'USD');
    expect(parsed.kind).toBe('boarding_pass');
    if (parsed.kind === 'boarding_pass') {
      expect(parsed.ticketAmount).toBe(69422);
      expect(parsed.ticketCurrency).toBe('INR');
    }
  });
});

import {
  formatFlightItinerarySummary,
  inferPrimaryDestinationFromLegs,
} from '../services/ocrParser';

describe('v0.4.4 Multi-Leg Flight Itinerary Parsing (Round-Trip / Open-Jaw / Connecting)', () => {
  it('extracts all 4 flights from an open-jaw Etihad PDF (BLR->AUH->ZRH + FRA->AUH->BLR) with dates, single fare & ZRH destination', () => {
    const fourLegEtihadPdf = `ETIHAD AIRWAYS
Electronic Ticket Receipt
Date of issue: 12 Sep 2025
Booking reference: 7CHIQH
Passenger: SRUTHY SANKARANARAYANAN

Outbound: Bengaluru (BLR) to Zurich (ZRH)
Fri, 31 Oct 2025  EY 217  22:00 Bengaluru (BLR) -> 00:50 Abu Dhabi (AUH)
Sat, 01 Nov 2025  EY 73   02:25 Abu Dhabi (AUH) -> 06:40 Zurich (ZRH)

Return: Frankfurt (FRA) to Bengaluru (BLR)
Sat, 08 Nov 2025  EY 122  10:45 Frankfurt (FRA) -> 19:55 Abu Dhabi (AUH)
Sun, 09 Nov 2025  EY 216  21:20 Abu Dhabi (AUH) -> 03:00 Bengaluru (BLR)

Baggage Allowance
EY 217: 30 KG checked baggage
EY 73: 30 KG checked baggage
EY 122: 30 KG checked baggage
EY 216: 30 KG checked baggage

Payment Summary
Base Fare  INR 52,000
Taxes & Fees  INR 408,804
Total Calculated Fare  INR 69,422`;

    const parsed = parseDocumentOcrText(fourLegEtihadPdf, 'INR');
    expect(parsed.kind).toBe('boarding_pass');
    if (parsed.kind === 'boarding_pass') {
      expect(parsed.pnr).toBe('7CHIQH');
      expect(parsed.ticketAmount).toBe(69422);
      expect(parsed.ticketCurrency).toBe('INR');
      expect(parsed.legs?.length).toBe(4);
      expect(parsed.legs?.map((l) => `${l.flightNumber}:${l.originIata}->${l.destIata}:${l.flightDate}`)).toEqual([
        'EY 217:BLR->AUH:2025-10-31',
        'EY 73:AUH->ZRH:2025-11-01',
        'EY 122:FRA->AUH:2025-11-08',
        'EY 216:AUH->BLR:2025-11-09',
      ]);

      expect(formatFlightItinerarySummary(parsed.legs!)).toBe('BLR → AUH → ZRH • FRA → AUH → BLR');
      expect(inferPrimaryDestinationFromLegs(parsed.legs!)).toBe('ZRH');
      expect(parsed.legs?.map((l) => l.departureTimeHm)).toEqual(['22:00', '02:25', '10:45', '21:20']);
    }
  });

  it('correctly parses stacked Etihad/Amadeus cards where route, date & time sit ABOVE the flight number without shifting legs', () => {
    const stackedEtihadPdf = `ETIHAD AIRWAYS
Date of issue: 12 Sep 2025
Booking reference: 7CHIQH

Fri, 31 Oct 2025  Bengaluru (BLR)  22:00
Sat, 01 Nov 2025  Abu Dhabi (AUH)  00:50
EY 217  Operated by Etihad Airways  Duration 4h 20m
Layover in Abu Dhabi 1h 35m

Sat, 01 Nov 2025  Abu Dhabi (AUH)  02:25
Sat, 01 Nov 2025  Zurich (ZRH)     06:40
EY 73   Operated by Etihad Airways  Duration 7h 15m

Sat, 08 Nov 2025  Frankfurt (FRA)  10:45
Sat, 08 Nov 2025  Abu Dhabi (AUH)  19:55
EY 122  Operated by Etihad Airways  Duration 6h 10m
Layover in Abu Dhabi 1h 25m

Sat, 08 Nov 2025  Abu Dhabi (AUH)  21:20
Sun, 09 Nov 2025  Bengaluru (BLR)  03:00
EY 216  Operated by Etihad Airways  Duration 4h 10m

Total Calculated Fare  INR 69,422`;

    const parsed = parseDocumentOcrText(stackedEtihadPdf, 'INR');
    expect(parsed.kind).toBe('boarding_pass');
    if (parsed.kind === 'boarding_pass') {
      expect(parsed.legs?.length).toBe(4);
      expect(
        parsed.legs?.map(
          (l) => `${l.flightNumber}:${l.originIata}->${l.destIata}:${l.flightDate}@${l.departureTimeHm}`
        )
      ).toEqual([
        'EY 217:BLR->AUH:2025-10-31@22:00',
        'EY 73:AUH->ZRH:2025-11-01@02:25',
        'EY 122:FRA->AUH:2025-11-08@10:45',
        'EY 216:AUH->BLR:2025-11-08@21:20',
      ]);
      expect(parsed.ticketAmount).toBe(69422);
    }
  });

  it('orders same-day and multi-day flights chronologically by exact date and 24h time in Bookings timeline', () => {
    const outOfOrderFlights: Flight[] = [
      {
        id: 'f4', tripId: 't1', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 216',
        originIata: 'AUH', originCity: 'Abu Dhabi', destIata: 'BLR', destCity: 'Bengaluru',
        departureTime: '2025-11-08T21:20:00', arrivalTime: '2025-11-09T03:00:00',
        durationMinutes: 250, status: 'scheduled', distanceMiles: 1690, milesEarned: 1690,
        enrichedOnline: false, createdAt: '',
      },
      {
        id: 'f2', tripId: 't1', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 73',
        originIata: 'AUH', originCity: 'Abu Dhabi', destIata: 'ZRH', destCity: 'Zurich',
        departureTime: '2025-11-01T02:25:00', arrivalTime: '2025-11-01T06:40:00',
        durationMinutes: 435, status: 'scheduled', distanceMiles: 2970, milesEarned: 2970,
        enrichedOnline: false, createdAt: '',
      },
      {
        id: 'f3', tripId: 't1', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 122',
        originIata: 'FRA', originCity: 'Frankfurt', destIata: 'AUH', destCity: 'Abu Dhabi',
        departureTime: '2025-11-08T10:45:00', arrivalTime: '2025-11-08T19:55:00',
        durationMinutes: 370, status: 'scheduled', distanceMiles: 3010, milesEarned: 3010,
        enrichedOnline: false, createdAt: '',
      },
      {
        id: 'f1', tripId: 't1', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 217',
        originIata: 'BLR', originCity: 'Bengaluru', destIata: 'AUH', destCity: 'Abu Dhabi',
        departureTime: '2025-10-31T22:00:00', arrivalTime: '2025-11-01T00:50:00',
        durationMinutes: 260, status: 'scheduled', distanceMiles: 1690, milesEarned: 1690,
        enrichedOnline: false, createdAt: '',
      },
    ];

    const timeline = buildJourneyTimeline(outOfOrderFlights, [], []);
    expect(timeline.map((i) => (i.kind === 'flight' ? `${i.flight.flightNumber}@${i.timeLabel}` : ''))).toEqual([
      'EY 217@22:00',
      'EY 73@02:25',
      'EY 122@10:45',
      'EY 216@21:20',
    ]);
  });
});

import {
  deriveGlobalTravelGeography,
  deriveTripGeography,
} from '../services/travelGeography';

describe('v0.4.6 Multi-Country Trip Geography (Visited Countries vs. Airport Transit Hubs)', () => {
  const euroTrip: Trip = {
    id: 'trip_euro',
    ownerId: 'u1',
    title: 'Europe Autumn',
    destinationCity: 'Zurich',
    destinationCountry: 'Switzerland',
    countryCode: 'CH',
    flagEmoji: '🇨🇭',
    startDate: '2025-10-31',
    endDate: '2025-11-09',
    homeCurrency: 'INR',
    budget: 0,
    vibe: 'alpine',
    isShared: false,
    coTravelers: [],
    lat: 47.4647,
    lng: 8.5492,
    createdAt: '',
    updatedAt: '',
  };

  const openJawFlights: Flight[] = [
    {
      id: 'f1', tripId: 'trip_euro', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 217',
      originIata: 'BLR', originCity: 'Bengaluru', destIata: 'AUH', destCity: 'Abu Dhabi',
      departureTime: '2025-10-31T22:00:00', arrivalTime: '2025-11-01T00:50:00',
      durationMinutes: 260, status: 'scheduled', distanceMiles: 1690, milesEarned: 1690,
      enrichedOnline: false, createdAt: '',
    },
    {
      id: 'f2', tripId: 'trip_euro', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 73',
      originIata: 'AUH', originCity: 'Abu Dhabi', destIata: 'ZRH', destCity: 'Zurich',
      departureTime: '2025-11-01T02:25:00', arrivalTime: '2025-11-01T06:40:00',
      durationMinutes: 435, status: 'scheduled', distanceMiles: 2970, milesEarned: 2970,
      enrichedOnline: false, createdAt: '',
    },
    {
      id: 'f3', tripId: 'trip_euro', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 122',
      originIata: 'FRA', originCity: 'Frankfurt', destIata: 'AUH', destCity: 'Abu Dhabi',
      departureTime: '2025-11-08T10:45:00', arrivalTime: '2025-11-08T19:55:00',
      durationMinutes: 370, status: 'scheduled', distanceMiles: 3010, milesEarned: 3010,
      enrichedOnline: false, createdAt: '',
    },
    {
      id: 'f4', tripId: 'trip_euro', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 216',
      originIata: 'AUH', originCity: 'Abu Dhabi', destIata: 'BLR', destCity: 'Bengaluru',
      departureTime: '2025-11-08T21:20:00', arrivalTime: '2025-11-09T03:00:00',
      durationMinutes: 250, status: 'scheduled', distanceMiles: 1690, milesEarned: 1690,
      enrichedOnline: false, createdAt: '',
    },
  ];

  it('counts Switzerland & Germany as visited countries, skips home BLR, and marks <24h AUH connection as a Transit Hub', () => {
    const geo = deriveTripGeography(euroTrip, openJawFlights, [], []);
    expect(geo.visitedCountries.map((c) => c.code)).toEqual(['CH', 'DE']);
    expect(geo.countriesLabel).toBe('Switzerland • Germany');
    expect(geo.transitHubs.map((h) => h.iata)).toEqual(['AUH']);
  });

  it('adds extra countries from Trip Stops & promotes AUH out of Transit Hubs if added as a real Stop', () => {
    const stops: TripStop[] = [
      { id: 's1', tripId: 'trip_euro', cityName: 'Strasbourg', startDate: '2025-11-05', sortOrder: 0, createdAt: '' },
      { id: 's2', tripId: 'trip_euro', cityName: 'Abu Dhabi', startDate: '2025-11-08', sortOrder: 1, createdAt: '' },
    ];
    const global = deriveGlobalTravelGeography([euroTrip], openJawFlights, [], stops);
    expect(new Set(global.countryStamps.map((c) => c.code))).toEqual(new Set(['CH', 'FR', 'AE', 'DE']));
    expect(global.countryStamps).toHaveLength(4);
    expect(global.transitHubs).toHaveLength(0);
  });

  it('v0.4.7: never generates country stamps or map pins from the free-text trip Destination field alone', () => {
    const europeRegionTrip: Trip = {
      ...euroTrip,
      id: 'trip_region_only',
      title: 'Europe Autumn',
      destinationCity: 'Europe',
      destinationCountry: 'Europe',
      countryCode: 'US', // legacy fallback from inferDestinationVibe('Europe')
      flagEmoji: '🌍',
    };

    // With no flights, transports, or stops: 0 country stamps, 0 visited pins!
    const emptyGeo = deriveGlobalTravelGeography([europeRegionTrip], [], [], []);
    expect(emptyGeo.countryStamps).toHaveLength(0);
    expect(emptyGeo.visitedCities).toHaveLength(0);
    expect(emptyGeo.byTripId[europeRegionTrip.id].countriesLabel).toBe('');

    // Once open-jaw flights are logged: ONLY Switzerland & Germany — NO phantom US/Europe stamp!
    const flightsForRegion = openJawFlights.map((f) => ({ ...f, tripId: europeRegionTrip.id }));
    const withFlights = deriveGlobalTravelGeography([europeRegionTrip], flightsForRegion, [], []);
    expect(withFlights.countryStamps.map((c) => c.code)).toEqual(['CH', 'DE']);
    expect(withFlights.transitHubs.map((h) => h.iata)).toEqual(['AUH']);
    expect(withFlights.byTripId[europeRegionTrip.id].flagsLabel).toBe('🇨🇭 🇩🇪');
    expect(withFlights.byTripId[europeRegionTrip.id].countriesLabel).toBe('Switzerland • Germany');
  });
});

import {
  cloudRowToExpense,
  cloudRowToFlight,
  cloudRowToLoyalty,
  cloudRowToMemory,
  cloudRowToStay,
  cloudRowToStop,
  cloudRowToTransport,
  cloudRowToTrip,
  expenseToCloudRow,
  flightToCloudRow,
  loyaltyToCloudRow,
  memoryToCloudRow,
  shouldAcceptRemoteRecord,
  stayToCloudRow,
  stopToCloudRow,
  transportToCloudRow,
  tripToCloudRow,
  validateBackupSnapshot,
} from '../services/cloudSyncMappers';

describe('v0.5.0 Bidirectional Cloud Sync Engine (Offline-Safe + Supabase/R2 Mappers)', () => {
  it('treats missing Supabase env keys as unconfigured offline-first mode', () => {
    const configured = Boolean(
      process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    );
    expect(configured).toBe(false);
  });

  it('round-trips trips, flights, transports, stops, stays, expenses, memories, and loyalty rows cleanly', () => {
    const uid = '11111111-2222-3333-4444-555555555555';
    const trip: Trip = {
      id: 'trip_sync_1',
      ownerId: 'local_wanderer',
      title: 'Europe Autumn',
      destinationCity: 'Europe',
      destinationCountry: 'Europe',
      countryCode: 'CH',
      flagEmoji: '🇨🇭',
      startDate: '2025-10-31',
      endDate: '2025-11-09',
      homeCurrency: 'INR',
      budget: 150000,
      vibe: 'alpine',
      isShared: true,
      shareToken: 'wl_1234',
      coTravelers: ['Priya'],
      lat: 47.46,
      lng: 8.55,
      createdAt: '2025-10-01T10:00:00Z',
      updatedAt: '2025-10-02T10:00:00Z',
    };
    const cloudTrip = tripToCloudRow(trip, uid, 'covers/trip_sync_1/cover.webp');
    expect(cloudTrip.owner_id).toBe(uid);
    expect(cloudTrip.co_travelers).toEqual(['Priya']);
    const restoredTrip = cloudRowToTrip(cloudTrip, 'file:///local/cover.webp');
    expect(restoredTrip.title).toBe('Europe Autumn');
    expect(restoredTrip.coTravelers).toEqual(['Priya']);
    expect(restoredTrip.coverPhotoUri).toBe('file:///local/cover.webp');

    const flight: Flight = {
      id: 'flt_1',
      tripId: 'trip_sync_1',
      airlineCode: 'EY',
      airlineName: 'Etihad Airways',
      flightNumber: 'EY 217',
      pnr: '7CHIQH',
      originIata: 'BLR',
      originCity: 'Bengaluru',
      destIata: 'AUH',
      destCity: 'Abu Dhabi',
      departureTime: '2025-10-31T22:00:00',
      arrivalTime: '2025-11-01T00:50:00',
      durationMinutes: 260,
      status: 'scheduled',
      distanceMiles: 1690,
      milesEarned: 1690,
      loyaltyProgram: 'Etihad Guest',
      enrichedOnline: false,
      createdAt: '2025-10-01T10:00:00Z',
    };
    const restoredFlight = cloudRowToFlight(flightToCloudRow(flight));
    expect(restoredFlight.flightNumber).toBe('EY 217');
    expect(restoredFlight.pnr).toBe('7CHIQH');

    const trn: TransportLeg = {
      id: 'trn_1',
      tripId: 'trip_sync_1',
      mode: 'train',
      title: 'SBB InterCity',
      operatorName: 'SBB',
      origin: 'Zurich HB',
      destination: 'Lucerne',
      startDate: '2025-11-03',
      distanceKm: 55,
      costAmount: 29,
      currency: 'CHF',
      homeCost: 2784,
      createdAt: '2025-10-01T10:00:00Z',
    };
    const restoredTrn = cloudRowToTransport(transportToCloudRow(trn));
    expect(restoredTrn.mode).toBe('train');
    expect(restoredTrn.distanceKm).toBe(55);

    const stop: TripStop = {
      id: 'stop_1',
      tripId: 'trip_sync_1',
      cityName: 'Lucerne',
      startDate: '2025-11-03',
      endDate: '2025-11-05',
      sortOrder: 1,
      createdAt: '2025-10-01T10:00:00Z',
    };
    expect(cloudRowToStop(stopToCloudRow(stop)).cityName).toBe('Lucerne');

    const stay: Stay = {
      id: 'stay_1',
      tripId: 'trip_sync_1',
      name: 'Hotel Schweizerhof',
      stayType: 'hotel',
      checkIn: '2025-11-01',
      checkOut: '2025-11-03',
      nights: 2,
      costCash: 500,
      currency: 'CHF',
      homeCost: 48000,
      pointsRedeemed: 0,
      notes: 'Lake view',
      createdAt: '2025-10-01T10:00:00Z',
    };
    expect(cloudRowToStay(stayToCloudRow(stay, 'receipts/trip_sync_1/u/stay.webp'), 'file:///r.webp').notes).toBe('Lake view');

    const expRow = expenseToCloudRow(
      {
        id: 'exp_1',
        tripId: 'trip_sync_1',
        merchant: 'Etihad Airways',
        category: 'flights',
        localAmount: 69422,
        localCurrency: 'INR',
        homeAmount: 69422,
        homeCurrency: 'INR',
        fxRateUsed: 1,
        expenseDate: '2025-10-31',
        createdAt: '2025-10-01T10:00:00Z',
      },
      uid,
      'receipts/trip_sync_1/u/exp_1.webp'
    );
    expect(expRow.created_by).toBe(uid);
    expect(cloudRowToExpense(expRow, 'file:///exp.webp').homeAmount).toBe(69422);

    const memRow = memoryToCloudRow(
      {
        id: 'mem_1',
        tripId: 'trip_sync_1',
        stopId: 'stop_1',
        title: 'Lake Lucerne',
        note: 'Golden hour',
        capturedAt: '2025-11-03T17:30:00Z',
        moodSticker: '🏔️ Pure Magic',
        isHighlight: true,
        createdAt: '2025-11-03T18:00:00Z',
      },
      uid,
      'memories/trip_sync_1/mem_1.webp',
      'memories/trip_sync_1/mem_1_thumb.webp'
    );
    const restoredMem = cloudRowToMemory(memRow, 'file:///p.webp', 'file:///t.webp');
    expect(restoredMem.stopId).toBe('stop_1');
    expect(restoredMem.photoUri).toBe('file:///p.webp');

    const loyRow = loyaltyToCloudRow(
      {
        id: 'loy_1',
        programName: 'Etihad Guest',
        category: 'airline',
        balance: 9360,
        unitLabel: 'mi',
        updatedAt: '2025-11-01T10:00:00Z',
      },
      uid
    );
    expect(cloudRowToLoyalty(loyRow).balance).toBe(9360);
  });

  it('resolves LWW conflicts by updated_at and validates local JSON backup snapshots', () => {
    expect(shouldAcceptRemoteRecord('2025-11-01T10:00:00Z', '2025-11-02T10:00:00Z')).toBe(true);
    expect(shouldAcceptRemoteRecord('2025-11-03T10:00:00Z', '2025-11-02T10:00:00Z')).toBe(false);
    expect(shouldAcceptRemoteRecord(undefined, '2025-11-02T10:00:00Z')).toBe(true);

    expect(validateBackupSnapshot(null)).toBeNull();
    expect(validateBackupSnapshot({ foo: 'bar' })).toBeNull();
    const valid = validateBackupSnapshot({ trips: [], flights: [] });
    expect(valid?.schemaVersion).toBe(2);
    expect(valid?.transports).toEqual([]);
  });

  it('handles Editor vs Viewer roles, trip_members rows, and Personal vs Shared expense mapping', () => {
    const uid = '11111111-2222-3333-4444-555555555555';
    const otherUid = '99999999-8888-7777-6666-555555555555';

    const collabTrip: Trip = {
      id: 'trip_collab_1',
      ownerId: uid,
      title: 'Japan Group',
      destinationCity: 'Tokyo',
      destinationCountry: 'Japan',
      countryCode: 'JP',
      flagEmoji: '🇯🇵',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
      homeCurrency: 'USD',
      budget: 3000,
      vibe: 'japan',
      isShared: true,
      coTravelers: ['Priya@gmail.com', 'Mom@gmail.com', 'priya@gmail.com'],
      coTravelerRoles: {
        'priya@gmail.com': 'editor',
        'mom@gmail.com': 'viewer',
      },
      lat: 35.68,
      lng: 139.76,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-02T10:00:00Z',
    };

    // Role lookups & editor count (excludes Viewers!)
    expect(getCoTravelerRole(collabTrip, 'Priya@gmail.com')).toBe('editor');
    expect(getCoTravelerRole(collabTrip, 'Mom@gmail.com')).toBe('viewer');
    expect(getCoTravelerRole(collabTrip, 'legacy_friend@gmail.com')).toBe('editor');

    const memberRows = buildTripMemberRows(collabTrip);
    expect(memberRows).toEqual([
      { trip_id: 'trip_collab_1', invited_email: 'priya@gmail.com', role: 'editor' },
      { trip_id: 'trip_collab_1', invited_email: 'mom@gmail.com', role: 'viewer' },
    ]);

    expect(
      getEditorCount({
        coTravelers: ['priya@gmail.com', 'mom@gmail.com'],
        coTravelerRoles: { 'priya@gmail.com': 'editor', 'mom@gmail.com': 'viewer' },
      })
    ).toBe(2); // 1 owner + 1 editor (viewer excluded)

    // Access role resolution for owner, editor, and viewer
    expect(
      getTripAccessRole(collabTrip, { id: uid, email: 'me@gmail.com', authMode: 'google' })
    ).toBe('owner');
    expect(
      getTripAccessRole(collabTrip, { id: otherUid, email: 'Priya@gmail.com', authMode: 'google' })
    ).toBe('editor');
    expect(
      getTripAccessRole(collabTrip, { id: otherUid, email: 'mom@gmail.com', authMode: 'google' })
    ).toBe('viewer');

    // Solo trip is NOT collaborative even if legacy isShared flag was set
    expect(isCollaborativeTrip({ ownerId: uid, coTravelers: [] }, { id: uid, authMode: 'google' })).toBe(false);
    expect(isCollaborativeTrip(collabTrip, { id: uid, authMode: 'google' })).toBe(true);

    // Cloud mapper round-trip for coTravelerRoles & memberRoleOverrides
    const cloudTrip = tripToCloudRow(collabTrip, uid);
    expect(cloudTrip.co_traveler_roles).toEqual({
      'priya@gmail.com': 'editor',
      'mom@gmail.com': 'viewer',
    });
    const restoredTrip = cloudRowToTrip(cloudTrip, undefined, { 'mom@gmail.com': 'viewer' });
    expect(restoredTrip.coTravelerRoles?.['mom@gmail.com']).toBe('viewer');

    // Expense mapper round-trip for Personal (default false) and Shared (true + authorName)
    const personalRow = expenseToCloudRow(
      {
        id: 'exp_p1',
        tripId: 'trip_collab_1',
        merchant: 'Matcha Cafe',
        category: 'dining',
        localAmount: 600,
        localCurrency: 'JPY',
        homeAmount: 4,
        homeCurrency: 'USD',
        fxRateUsed: 0.0067,
        expenseDate: '2026-10-02',
        createdAt: '2026-10-02T12:00:00Z',
      },
      uid,
      `receipts/trip_collab_1/${uid}/exp_p1.webp`
    );
    expect(personalRow.is_shared).toBe(false);
    const restoredPersonal = cloudRowToExpense(personalRow);
    expect(restoredPersonal.isShared).toBe(false);
    expect(restoredPersonal.authorId).toBe(uid);

    const sharedRow = expenseToCloudRow(
      {
        id: 'exp_s1',
        tripId: 'trip_collab_1',
        merchant: 'Ichiran Ramen Group Dinner',
        category: 'dining',
        localAmount: 8000,
        localCurrency: 'JPY',
        homeAmount: 54,
        homeCurrency: 'USD',
        fxRateUsed: 0.0067,
        expenseDate: '2026-10-03',
        isShared: true,
        authorId: uid,
        authorName: 'Gowtham',
        createdAt: '2026-10-03T19:00:00Z',
      },
      uid,
      'shared-receipts/trip_collab_1/exp_s1.webp'
    );
    expect(sharedRow.is_shared).toBe(true);
    expect(sharedRow.author_name).toBe('Gowtham');
    const restoredShared = cloudRowToExpense(sharedRow, 'file:///local/exp_s1.webp');
    expect(restoredShared.isShared).toBe(true);
    expect(restoredShared.authorName).toBe('Gowtham');
    expect(restoredShared.receiptUri).toBe('file:///local/exp_s1.webp');
  });
});

describe('v0.6 Keepsake PDF, Trip Search & Offline Travel Reminders', () => {
  const sampleTrip: Trip = {
    id: 'trip_v06_1',
    ownerId: 'local_wanderer',
    title: 'Swiss Alpine Adventure <2026>',
    destinationCity: 'Zurich',
    destinationCountry: 'Switzerland',
    countryCode: 'CH',
    flagEmoji: '🇨🇭',
    startDate: '2026-12-20',
    endDate: '2026-12-28',
    homeCurrency: 'INR',
    budget: 275000,
    vibe: 'alpine',
    isShared: true,
    coTravelers: ['Priya'],
    lat: 47.37,
    lng: 8.54,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
  };

  const sampleFlight: Flight = {
    id: 'flt_v06_1',
    tripId: 'trip_v06_1',
    airlineCode: 'LX',
    airlineName: 'SWISS',
    flightNumber: 'LX 147',
    pnr: 'ABC123',
    originIata: 'BLR',
    originCity: 'Bengaluru',
    destIata: 'ZRH',
    destCity: 'Zurich',
    departureTime: '2026-12-20T02:15:00',
    arrivalTime: '2026-12-20T07:45:00',
    durationMinutes: 600,
    seat: '18A',
    terminal: 'T2',
    gate: 'B14',
    status: 'scheduled',
    distanceMiles: 4580,
    milesEarned: 4580,
    enrichedOnline: true,
    createdAt: '2026-11-01T10:00:00Z',
  };

  const sampleStay: Stay = {
    id: 'stay_v06_1',
    tripId: 'trip_v06_1',
    name: 'Hotel Adler Zurich',
    stayType: 'hotel',
    address: 'Rosengasse 10, Zurich',
    confirmationCode: 'ADL998',
    checkIn: '2026-12-20',
    checkOut: '2026-12-24',
    nights: 4,
    costCash: 840,
    currency: 'CHF',
    homeCost: 79800,
    pointsRedeemed: 0,
    createdAt: '2026-11-01T10:00:00Z',
  };

  const sampleMemory: Memory = {
    id: 'mem_v06_1',
    tripId: 'trip_v06_1',
    title: 'Golden Fondue Night',
    note: 'Melted Gruyere by the snowy Limmat river!',
    capturedAt: '2026-12-21T20:00:00Z',
    placeName: 'Old Town Zurich',
    moodSticker: '🧀 Cozy Eats',
    isHighlight: true,
    authorName: 'Gowtham',
    createdAt: '2026-12-21T20:05:00Z',
  };

  it('builds a privacy-safe Keepsake PDF HTML with escaped text, inlined photos, and zero spend/prices', () => {
    const html = buildTripKeepsakeHtml({
      trip: sampleTrip,
      flights: [sampleFlight],
      transports: [],
      stops: [
        {
          id: 'stp_1',
          tripId: 'trip_v06_1',
          cityName: 'Lucerne',
          sortOrder: 0,
          createdAt: '2026-11-01T10:00:00Z',
        },
      ],
      stays: [sampleStay],
      memories: [sampleMemory],
      distanceUnit: 'km',
      photoDataUriMap: {
        mem_v06_1: 'data:image/webp;base64,AAAA',
      },
    });

    expect(html).toContain('Swiss Alpine Adventure &lt;2026&gt;');
    expect(html).toContain('LX 147');
    expect(html).toContain('Hotel Adler Zurich');
    expect(html).toContain('Golden Fondue Night');
    expect(html).toContain('data:image/webp;base64,AAAA');
    expect(html).toContain('Lucerne');
    // Strict privacy: budget, cash price, home cost must NEVER leak into Keepsake PDF
    expect(html).not.toContain('275000');
    expect(html).not.toContain('79800');
    expect(html).not.toContain('840');
  });

  it('filters trips by year and searches across title, airline, hotel, stop, and memory story text', () => {
    const olderTrip: Trip = {
      ...sampleTrip,
      id: 'trip_v06_2',
      title: 'Kyoto Sakura Spring',
      destinationCity: 'Kyoto',
      destinationCountry: 'Japan',
      countryCode: 'JP',
      flagEmoji: '🇯🇵',
      startDate: '2025-04-02',
      endDate: '2025-04-10',
      coTravelers: [],
    };
    const allTrips = [sampleTrip, olderTrip];
    const index = {
      flights: [sampleFlight],
      transports: [],
      stops: [
        {
          id: 'stp_1',
          tripId: 'trip_v06_1',
          cityName: 'Interlaken',
          sortOrder: 0,
          createdAt: '2026-11-01T10:00:00Z',
        },
      ],
      stays: [sampleStay],
      memories: [sampleMemory],
    };

    expect(extractTripYears(allTrips)).toEqual(['2026', '2025']);
    expect(filterTripsBySearchAndYear(allTrips, '', '2025', index).map((t) => t.id)).toEqual([
      'trip_v06_2',
    ]);
    // Search matches memory note ("fondue"), flight airline ("SWISS"), stop ("Interlaken"), stay ("Adler")
    expect(filterTripsBySearchAndYear(allTrips, 'fondue', 'all', index).map((t) => t.id)).toEqual([
      'trip_v06_1',
    ]);
    expect(filterTripsBySearchAndYear(allTrips, 'Interlaken', 'all', index).map((t) => t.id)).toEqual([
      'trip_v06_1',
    ]);
    expect(filterTripsBySearchAndYear(allTrips, 'LX 147', 'all', index).map((t) => t.id)).toEqual([
      'trip_v06_1',
    ]);
    expect(filterTripsBySearchAndYear(allTrips, 'Adler', 'all', index).map((t) => t.id)).toEqual([
      'trip_v06_1',
    ]);
  });

  it('plans chronological future travel reminders and skips past bookings', () => {
    const now = new Date(2026, 11, 18, 12, 0, 0); // Dec 18, 2026 12:00 local
    const pastFlight: Flight = {
      ...sampleFlight,
      id: 'flt_past',
      departureTime: '2026-11-01T10:00:00',
    };
    const reminders = buildTravelReminders({
      trips: [sampleTrip],
      flights: [sampleFlight, pastFlight],
      stays: [sampleStay],
      transports: [],
      now,
    });

    // Expect 3 upcoming reminders: 24h flight check-in, 3h flight departure, 9 AM hotel check-in
    expect(reminders.map((r) => r.kind)).toEqual([
      'flight_checkin',
      'flight_departure',
      'stay_checkin',
    ]);
    expect(reminders[0].title).toContain('LX 147');
    expect(reminders[0].body).toContain('PNR ABC123');
    expect(reminders[1].body).toContain('Gate B14');
    expect(reminders[2].title).toContain('Hotel Adler Zurich');
    expect(reminders[2].body).toContain('Conf #ADL998');
  });

  it('auto-inserts ":" in HH:MM time inputs while allowing clean backspace', () => {
    expect(formatTimeHmInput('2', '')).toBe('2');
    expect(formatTimeHmInput('22', '2')).toBe('22:');
    expect(formatTimeHmInput('223', '22:')).toBe('22:3');
    expect(formatTimeHmInput('22:30', '22:3')).toBe('22:30');
    expect(formatTimeHmInput('0945', '')).toBe('09:45');
    // Backspacing the colon should NOT immediately re-append ":"
    expect(formatTimeHmInput('22', '22:')).toBe('22');
    expect(formatTimeHmInput('2', '22')).toBe('2');
  });

  it('extracts flight departure times formatted with hrs / HRS / dots / compact 4-digit or on the line below origin IATA', () => {
    expect(parseClockTimeHm('Dep 22:00 hrs')).toBe('22:00');
    expect(parseClockTimeHm('06:45 HRS IST')).toBe('06:45');
    expect(parseClockTimeHm('14.30 hrs')).toBe('14:30');
    expect(parseClockTimeHm('0645 hrs')).toBe('06:45');
    expect(parseClockTimeHm('2:25PM')).toBe('14:25');
    // Still ignores pure duration lines
    expect(parseClockTimeHm('Duration: 04:20')).toBeNull();

    const stackedTicket = [
      'IndiGo Confirmation PNR: 9AB12C',
      'Flight 6E 412',
      '14 Oct 2026',
      'BLR',
      '06:45 hrs',
      'GOI',
      '08:05 hrs',
    ].join('\n');
    const parsed = parseDocumentOcrText(stackedTicket, 'INR');
    expect(parsed.kind).toBe('boarding_pass');
    if (parsed.kind === 'boarding_pass') {
      expect(parsed.departureTimeHm).toBe('06:45');
    }
  });

  it('includes priced trains and stays in Spend ledger and dynamically converts multi-currency items when preferred currency changes', () => {
    const flightExpense: Expense = {
      id: 'exp_flt',
      tripId: 'trip_v06_1',
      merchant: 'SWISS (LX 147)',
      category: 'flights',
      localAmount: 84000,
      localCurrency: 'INR',
      homeAmount: 84000,
      homeCurrency: 'INR',
      fxRateUsed: 1,
      expenseDate: '2026-12-20',
      createdAt: '2026-11-01T10:00:00Z',
    };
    const localDinner: Expense = {
      id: 'exp_eur',
      tripId: 'trip_v06_1',
      merchant: 'Zurich Fondue',
      category: 'dining',
      localAmount: 100,
      localCurrency: 'EUR',
      homeAmount: 100,
      homeCurrency: 'EUR',
      fxRateUsed: 1,
      expenseDate: '2026-12-21',
      createdAt: '2026-12-21T20:00:00Z',
    };
    const manualTrain: TransportLeg = {
      id: 'trn_sbb',
      tripId: 'trip_v06_1',
      mode: 'train',
      title: 'SBB InterCity Zurich -> Lucerne',
      origin: 'Zurich HB',
      destination: 'Lucerne',
      startDate: '2026-12-22',
      costAmount: 50,
      currency: 'CHF',
      homeCost: 50,
      createdAt: '2026-12-22T09:00:00Z',
    };

    // 1. View in INR: all 4 items (flight INR + dinner EUR + train CHF + stay CHF) appear & convert to INR
    const ledgerInr = buildTripSpendLedger({
      expenses: [flightExpense, localDinner],
      transports: [manualTrain],
      stays: [sampleStay],
      preferredCurrency: 'INR',
      fxRates: DEFAULT_USD_RATES,
    });
    expect(ledgerInr.items.length).toBe(4);
    expect(ledgerInr.items.some((i) => i.source === 'transport' && i.id === 'trn_sbb')).toBe(true);
    expect(ledgerInr.items.some((i) => i.source === 'stay' && i.id === 'stay_v06_1')).toBe(true);
    expect(ledgerInr.preferredCurrency).toBe('INR');
    expect(ledgerInr.categoryTotals.flights).toBe(84000);
    expect(ledgerInr.categoryTotals.transit).toBeGreaterThan(4000); // 50 CHF in INR
    expect(ledgerInr.categoryTotals.dining).toBeGreaterThan(8000); // 100 EUR in INR

    // 2. Switch preferred currency to USD: EVERY item converts cleanly into USD with zero stale INR totals
    const ledgerUsd = buildTripSpendLedger({
      expenses: [flightExpense, localDinner],
      transports: [manualTrain],
      stays: [sampleStay],
      preferredCurrency: 'USD',
      fxRates: DEFAULT_USD_RATES,
    });
    expect(ledgerUsd.preferredCurrency).toBe('USD');
    expect(ledgerUsd.categoryTotals.flights).toBeGreaterThan(900);
    expect(ledgerUsd.categoryTotals.flights).toBeLessThan(1200);
    expect(ledgerUsd.totalSpentPreferred).toBeLessThan(3000);
  });

  it('locks future bookings paid today to TODAY, past trips to travel date, and pay-later stays to live rate until check-in', () => {
    const today = '2026-11-24';

    // Future flight booked today -> locks to today (NOT future flight date!)
    expect(resolveDefaultFxDate('2027-03-15', today)).toBe('2026-11-24');

    // Future flight PDF with an explicit past issue/booking date -> locks to issue date
    expect(resolveDefaultFxDate('2027-03-15', today, '2026-10-08')).toBe('2026-10-08');

    // Backfilling a past receipt from 6 months ago -> locks to receipt date
    expect(resolveDefaultFxDate('2026-05-12', today)).toBe('2026-05-12');

    // Pay-later future hotel -> live pending until check-in date arrives
    expect(
      resolveItemFxRateDate({ date: '2027-03-15', payLater: true }, today)
    ).toEqual({ fxDate: null, isLivePending: true });

    // Once check-in date arrives -> automatically locks to check-in date
    expect(
      resolveItemFxRateDate({ date: '2027-03-15', payLater: true }, '2027-03-15')
    ).toEqual({ fxDate: '2027-03-15', isLivePending: false });

    // Formatting helper
    expect(formatShortRateDate('2026-11-24', 2026)).toBe('24 Nov');
    expect(formatShortRateDate('2025-05-12', 2026)).toBe("12 May '25");
  });

  it('freezes historical trip totals at each payment date rate even when live FX swings drastically later', () => {
    const today = '2026-11-24';
    const futureFlightPaidToday: Expense = {
      id: 'exp_future_flt',
      tripId: 'trip_fx_lock',
      merchant: 'SWISS (LX 147)',
      category: 'flights',
      localAmount: 1000,
      localCurrency: 'USD',
      homeAmount: 84000,
      homeCurrency: 'INR',
      fxRateUsed: 84,
      expenseDate: '2027-04-10', // Future flight!
      fxDate: '2026-11-24', // Paid today!
      createdAt: '2026-11-24T10:00:00Z',
    };
    const pastTrain: TransportLeg = {
      id: 'trn_past_chf',
      tripId: 'trip_fx_lock',
      mode: 'train',
      title: 'SBB Zurich -> Bern',
      origin: 'Zurich',
      destination: 'Bern',
      startDate: '2026-05-12',
      costAmount: 100,
      currency: 'USD',
      homeCost: 8000,
      fxDate: '2026-05-12',
      createdAt: '2026-11-24T10:00:00Z',
    };
    const payLaterHotel: Stay = {
      id: 'stay_pay_later',
      tripId: 'trip_fx_lock',
      name: 'Hotel Schweizerhof',
      stayType: 'hotel',
      checkIn: '2027-04-10',
      checkOut: '2027-04-13',
      nights: 3,
      costCash: 500,
      currency: 'USD',
      homeCost: 42000,
      payLater: true,
      pointsRedeemed: 0,
      createdAt: '2026-11-24T10:00:00Z',
    };

    const fxSnapshots = {
      '2026-05-12': { USD: 1, INR: 80, EUR: 0.9 },
      '2026-11-24': { USD: 1, INR: 84, EUR: 0.92 },
    };
    // Simulate a huge future FX swing where USD jumps to 100 INR!
    const swungLiveRates = { USD: 1, INR: 100, EUR: 0.95 };

    expect(
      collectRequiredFxDates({
        expenses: [futureFlightPaidToday],
        transports: [pastTrain],
        stays: [payLaterHotel],
        todayYmd: today,
      })
    ).toEqual(['2026-05-12', '2026-11-24']);

    const ledger = buildTripSpendLedger({
      expenses: [futureFlightPaidToday],
      transports: [pastTrain],
      stays: [payLaterHotel],
      preferredCurrency: 'INR',
      fxRates: swungLiveRates,
      fxSnapshots,
      todayYmd: today,
    });

    const fltRow = ledger.items.find((i) => i.id === 'exp_future_flt')!;
    const trnRow = ledger.items.find((i) => i.id === 'trn_past_chf')!;
    const stayRow = ledger.items.find((i) => i.id === 'stay_pay_later')!;

    // Future flight paid today stays FROZEN at Nov 24 rate (84) -> 84,000 INR (NOT 100,000!)
    expect(fltRow.convertedAmount).toBe(84000);
    expect(fltRow.rateSource).toBe('date_locked');
    expect(fltRow.fxDate).toBe('2026-11-24');

    // Past train stays FROZEN at May 12 rate (80) -> 8,000 INR
    expect(trnRow.convertedAmount).toBe(8000);
    expect(trnRow.rateSource).toBe('date_locked');

    // Pay-later upcoming hotel tracks the live rate (100) -> 50,000 INR until check-in
    expect(stayRow.convertedAmount).toBe(50000);
    expect(stayRow.rateSource).toBe('live_pending');
    expect(stayRow.fxDate).toBeUndefined();
  });

  it('stitches connecting flights via layover hubs and preserves hub-and-spoke city revisits (Zurich -> Lucerne -> Zurich -> Venice -> Paris)', () => {
    const { buildStructuredJourneyRoute } = require('../services/distanceUtils');
    const europeFlights: Flight[] = [
      {
        id: 'f1', tripId: 't_eu', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 239',
        originIata: 'BLR', originCity: 'Bengaluru', destIata: 'AUH', destCity: 'Abu Dhabi',
        departureTime: '2025-10-31T21:00:00', arrivalTime: '2025-11-01T00:15:00',
        durationMinutes: 225, status: 'completed', distanceMiles: 1692, milesEarned: 1692,
        enrichedOnline: false, createdAt: '2025-10-01T00:00:00Z',
      },
      {
        id: 'f2', tripId: 't_eu', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 143',
        originIata: 'AUH', originCity: 'Abu Dhabi', destIata: 'ZRH', destCity: 'Zurich',
        departureTime: '2025-11-01T02:25:00', arrivalTime: '2025-11-01T06:55:00',
        durationMinutes: 420, status: 'completed', distanceMiles: 2970, milesEarned: 2970,
        enrichedOnline: false, createdAt: '2025-10-01T00:00:00Z',
      },
      {
        id: 'f3', tripId: 't_eu', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 34',
        originIata: 'CDG', originCity: 'Paris', destIata: 'AUH', destCity: 'Abu Dhabi',
        departureTime: '2025-11-16T10:30:00', arrivalTime: '2025-11-16T19:45:00',
        durationMinutes: 405, status: 'completed', distanceMiles: 3263, milesEarned: 3263,
        enrichedOnline: false, createdAt: '2025-10-01T00:00:00Z',
      },
      {
        id: 'f4', tripId: 't_eu', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 232',
        originIata: 'AUH', originCity: 'Abu Dhabi', destIata: 'BLR', destCity: 'Bengaluru',
        departureTime: '2025-11-17T02:00:00', arrivalTime: '2025-11-17T07:30:00',
        durationMinutes: 225, status: 'completed', distanceMiles: 1692, milesEarned: 1692,
        enrichedOnline: false, createdAt: '2025-10-01T00:00:00Z',
      },
    ];
    const europeTransports: TransportLeg[] = [
      {
        id: 'tr_ven', tripId: 't_eu', mode: 'train', title: 'Train to Venice',
        origin: 'Zurich', destination: 'Venice', startDate: '2025-11-06',
        createdAt: '2025-10-02T00:00:00Z',
      },
    ];
    const europeStops: TripStop[] = [
      { id: 's1', tripId: 't_eu', cityName: 'Lucerne', sortOrder: 0, createdAt: '2025-10-02T00:00:00Z' },
      { id: 's2', tripId: 't_eu', cityName: 'Zurich', sortOrder: 1, createdAt: '2025-10-02T00:01:00Z' },
      { id: 's3', tripId: 't_eu', cityName: 'Venice', sortOrder: 2, createdAt: '2025-10-02T00:02:00Z' },
    ];

    const route = buildStructuredJourneyRoute(europeFlights, europeTransports, europeStops);
    // Connecting flights stitched into 2 clean chains (via AUH), NOT 4 separate hubs
    expect(route.flightChains.length).toBe(2);
    expect(route.flightChains[0].originIata).toBe('BLR');
    expect(route.flightChains[0].destIata).toBe('ZRH');
    expect(route.flightChains[0].viaIatas).toEqual(['AUH']);
    expect(route.flightChains[1].originIata).toBe('CDG');
    expect(route.flightChains[1].destIata).toBe('BLR');
    expect(route.flightChains[1].viaIatas).toEqual(['AUH']);

    // City sequence preserves Zurich -> Lucerne -> Zurich revisit AND includes Paris + return to Bengaluru!
    expect(route.nodes.map((n: { city: string }) => n.city)).toEqual([
      'Bengaluru',
      'Zurich',
      'Lucerne',
      'Zurich',
      'Venice',
      'Paris',
      'Bengaluru',
    ]);
    expect(route.compactTrail).toContain('✈️ BLR → ZRH (via AUH)');
    expect(route.compactTrail).toContain('📍 Lucerne');
    expect(route.compactTrail).toContain('📍 Zurich');
    expect(route.compactTrail).toContain('📍 Venice');
    expect(route.compactTrail).toContain('✈️ CDG → BLR (via AUH)');
  });

  it('renders all 3 Keepsake PDF templates (magazine, artbook, passport) with WYSIWYG cover crop, grouped boarding passes & zero spend', () => {
    const europeFlights: Flight[] = [
      {
        id: 'f1', tripId: 'trip_v06_1', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 239',
        originIata: 'BLR', originCity: 'Bengaluru', destIata: 'AUH', destCity: 'Abu Dhabi',
        departureTime: '2025-10-31T21:00:00', arrivalTime: '2025-11-01T00:15:00',
        durationMinutes: 225, status: 'completed', distanceMiles: 1692, milesEarned: 1692,
        enrichedOnline: false, createdAt: '2025-10-01T00:00:00Z',
      },
      {
        id: 'f2', tripId: 'trip_v06_1', airlineCode: 'EY', airlineName: 'Etihad Airways', flightNumber: 'EY 143',
        originIata: 'AUH', originCity: 'Abu Dhabi', destIata: 'ZRH', destCity: 'Zurich',
        departureTime: '2025-11-01T02:25:00', arrivalTime: '2025-11-01T06:55:00',
        durationMinutes: 420, status: 'completed', distanceMiles: 2970, milesEarned: 2970,
        enrichedOnline: false, createdAt: '2025-10-01T00:00:00Z',
      },
    ];

    for (const templateId of ['magazine', 'artbook', 'passport'] as const) {
      const html = buildTripKeepsakeHtml({
        trip: sampleTrip,
        flights: europeFlights,
        transports: [],
        stops: [
          { id: 'st_luc', tripId: 'trip_v06_1', cityName: 'Lucerne', sortOrder: 0, createdAt: '2025-10-01T00:00:00Z' },
        ],
        stays: [sampleStay],
        memories: [sampleMemory],
        distanceUnit: 'km',
        templateId,
        coverDataUri: 'data:image/jpeg;base64,COVERDATA',
        coverDimensions: { width: 1600, height: 1000 },
        coverCrop: { zoom: 1.4, offsetX: 0.25, offsetY: -0.15 },
        photoDataUriMap: { mem_v06_1: 'data:image/jpeg;base64,MEMDATA' },
      });
      expect(html).toContain(`cover-${templateId}`);
      expect(html).toContain(`theme-${templateId}`);
      expect(html).toContain('width: 210mm;');
      expect(html).toContain('data:image/jpeg;base64,COVERDATA');
      expect(html).toContain('position:absolute; left:'); // Percentage WYSIWYG crop math applied!
      expect(html).toContain('via AUH'); // Grouped boarding pass!
      expect(html).toContain('EY 239 · EY 143');
      expect(html).toContain('ADMITTED • CH'); // Country passport stamp!
      if (templateId === 'magazine') expect(html).toContain('mag-spread-header');
      if (templateId === 'artbook') expect(html).toContain('art-spread-header');
      if (templateId === 'passport') expect(html).toContain('pass-inner-banner');
      expect(html).not.toContain('4500'); // Budget strictly excluded
      expect(html).not.toContain('1850'); // Stay cash cost strictly excluded
    }
  });
});

import {
  buildGoogleMapsSearchUrl,
  formatTripTitleWithFlags,
} from '../services/placeLookupService';

describe('v0.6.8 Hotel Name/Address OCR Hardening & Maps / Flag Helpers', () => {
  it('extracts exact hotel name, clean PIN address & Coorg cityHint from 2-page Djubo confirmation while ignoring greeting & phishing disclaimers', () => {
    const djuboVoucher = `Reservation ID
SEV0004277
Check in
27 Nov, 2026 13:00
Check out
29 Nov, 2026 11:00
CONFIRMED
Dear Venkat Raman,
Thanks for booking with us. Your room confirmation details are mentioned below. For any follow on queries please contact the Hotel at
+91 8951339867 or suvarnaecovillage@gmail.com .
Guest Name : Venkat Raman
Guest Email : gowthamvenkat2605@gmail.com
Guest Contact No. : 91-9489291310
S.No. Room Nights Adults Children Infants Meal Plan Currency Total Net Price
1 Standard Deluxe With Lake view 2 2 0 0 Breakfast INR 8,571.43
Room Rent INR 8,571.43
Total INR 8,571.43
Sub Total INR 8,571.43
Total Taxes INR 428.57
Total outstanding amount INR 9,000.00
INCLUSIONS
Free Wi-Fi
Free Parking
Plantation Walk
TERMS & CONDITIONS
Check-In Policy: 1:00 PM
Check-Out Policy: 11:00 AM
CANCELLATION POLICY
Cancellation Charges of 100% will be applicable if cancelled/No Show on or after 25-November-2026 and before 27-November-2026
Suvarna Eco Village
Makkanduru Village & Post Madikeri Taluk,Kodagu District
Madikeri 571201 India
Email: suvarnaecovillage@gmail.com
Modified By: Neel Suvarna
Website: https://suvarnaecovillage.in/
IMPORTANT NOTICE: BEWARE OF FAKE BOOKING MESSAGES
Fraudsters may contact you by WhatsApp, SMS or email quoting your real booking details and asking you to pay, or to 'validate' your booking with your card details, often claiming that no money will be charged. Suvarna Eco Village will never ask you to pay or share your card details, OTP, CVV or PIN through a link. If you receive such a message, do not click the link or make any payment, and call us on 8951339867, the number on our official website, to check. If you have already entered your card details, contact your bank immediately to block your card.
Powered by Djubo.com`;

    const parsed = parseDocumentOcrText(djuboVoucher, 'INR');
    expect(parsed.kind).toBe('hotel');
    if (parsed.kind === 'hotel') {
      expect(parsed.hotelName).toBe('Suvarna Eco Village');
      expect(parsed.address).toBe(
        'Makkanduru Village & Post Madikeri Taluk, Kodagu District, Madikeri 571201 India'
      );
      expect(parsed.address).not.toContain('block your card');
      expect(parsed.cityHint).toBe('Coorg');
      expect(parsed.confirmationCode).toBe('SEV0004277');
      expect(parsed.checkIn).toBe('2026-11-27');
      expect(parsed.checkOut).toBe('2026-11-29');
      expect(parsed.nights).toBe(2);
      expect(parsed.totalAmount).toBe(9000);
      expect(parsed.currency).toBe('INR');
    }
  });

  it('leaves hotel address blank rather than grabbing phishing disclaimers containing "have" ("ave")', () => {
    const voucherWithoutAddress = `Reservation Confirmed
Reservation ID: BK99410
Check-in: 2026-12-05
Check-out: 2026-12-07
Dear Guest,
Thanks for booking with us. For any follow on queries please contact the Hotel at reception.
Evolve Back Coorg Resort
Total Paid: INR 24,500.00
If you have already entered your card details, contact your bank immediately to block your card.`;

    const parsed = parseDocumentOcrText(voucherWithoutAddress, 'INR');
    expect(parsed.kind).toBe('hotel');
    if (parsed.kind === 'hotel') {
      expect(parsed.hotelName).toBe('Evolve Back Coorg Resort');
      expect(parsed.address).toBeUndefined();
    }
  });

  it('builds clean Google Maps search URLs and prevents duplicate flag emojis in trip titles', () => {
    const urlWithAddr = buildGoogleMapsSearchUrl(
      'Suvarna Eco Village',
      'Madikeri 571201 India',
      'Coorg'
    );
    expect(urlWithAddr).toBe(
      'https://www.google.com/maps/search/?api=1&query=Suvarna%20Eco%20Village%2C%20Madikeri%20571201%20India'
    );

    const urlFallback = buildGoogleMapsSearchUrl('Suvarna Eco Village', '', 'Coorg');
    expect(urlFallback).toBe(
      'https://www.google.com/maps/search/?api=1&query=Suvarna%20Eco%20Village%2C%20Coorg'
    );

    expect(formatTripTitleWithFlags('Coorg Trip 🇮🇳', '🇮🇳')).toBe('Coorg Trip 🇮🇳');
    expect(formatTripTitleWithFlags('Europe Autumn', '🇨🇭 🇩🇪')).toBe('Europe Autumn 🇨🇭 🇩🇪');
    expect(formatTripTitleWithFlags('Swiss Trip 🇨🇭', '🇨🇭 🇩🇪')).toBe('Swiss Trip 🇨🇭 🇩🇪');
  });
});

import { formatPassportStampMonthYear } from '../services/travelGeography';

describe('v0.6.9 Passport Stamp Formatting & Last-Visited Tracking', () => {
  it('formats stamp month/year cleanly without UTC drift and tracks most recent lastVisitedDate across trips', () => {
    expect(formatPassportStampMonthYear('2025-11-01')).toBe('Nov 2025');
    expect(formatPassportStampMonthYear('2026-01-15')).toBe('Jan 2026');
    expect(formatPassportStampMonthYear('2025-10')).toBe('Oct 2025');
    expect(formatPassportStampMonthYear('')).toBe('');

    const trip1: Trip = {
      id: 't_ch_old',
      ownerId: 'u1',
      title: 'Swiss 2024',
      destinationCity: 'Zurich',
      destinationCountry: 'Switzerland',
      countryCode: 'CH',
      flagEmoji: '🇨🇭',
      startDate: '2024-06-10',
      endDate: '2024-06-15',
      homeCurrency: 'INR',
      budget: 0,
      vibe: 'alpine',
      isShared: false,
      coTravelers: [],
      lat: 47.3769,
      lng: 8.5417,
      createdAt: '2024-06-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
    };
    const trip2: Trip = {
      ...trip1,
      id: 't_ch_new',
      title: 'Europe 2025',
      startDate: '2025-11-02',
      endDate: '2025-11-12',
    };
    const stops: TripStop[] = [
      {
        id: 's1',
        tripId: 't_ch_old',
        cityName: 'Zurich',
        startDate: '2024-06-10',
        sortOrder: 0,
        createdAt: '2024-06-01T00:00:00Z',
      },
      {
        id: 's2',
        tripId: 't_ch_new',
        cityName: 'Lucerne',
        startDate: '2025-11-05',
        sortOrder: 0,
        createdAt: '2025-11-01T00:00:00Z',
      },
    ];
    const global = deriveGlobalTravelGeography([trip1, trip2], [], [], stops);
    const ch = global.countryStamps.find((c) => c.code === 'CH');
    expect(ch).toBeDefined();
    expect(ch?.cities.length).toBe(2);
    expect(ch?.date).toBe('2024-06-10');
    expect(ch?.lastVisitedDate).toBe('2025-11-05');
    expect(formatPassportStampMonthYear(ch?.lastVisitedDate)).toBe('Nov 2025');
  });

  it('caps compact multi-country flags cleanly with an overflow +N count', () => {
    const { formatCompactFlags } = require('../services/travelGeography');

    // Empty falls back to trip flag
    expect(formatCompactFlags([], '🌍', 3)).toEqual({ flagsText: '🌍', overflowCount: 0 });

    // Up to maxVisible (3) shows all flags with no overflow
    expect(
      formatCompactFlags([{ flag: '🇨🇭' }, { flag: '🇮🇹' }, { flag: '🇫🇷' }], '🌍', 3)
    ).toEqual({ flagsText: '🇨🇭 🇮🇹 🇫🇷', overflowCount: 0 });

    // 5-country Europe trip caps to 2 flags + "+3" so photo badge stays inside card
    expect(
      formatCompactFlags(
        [
          { flag: '🇦🇪' },
          { flag: '🇨🇭' },
          { flag: '🇮🇹' },
          { flag: '🇫🇷' },
          { flag: '🇮🇳' },
        ],
        '🌍',
        3
      )
    ).toEqual({ flagsText: '🇦🇪 🇨🇭', overflowCount: 3 });

    // Deduplicates repeated flags
    expect(
      formatCompactFlags([{ flag: '🇮🇳' }, { flag: '🇮🇳' }], '🌍', 3)
    ).toEqual({ flagsText: '🇮🇳', overflowCount: 0 });
  });
});


