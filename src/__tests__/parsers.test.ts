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





