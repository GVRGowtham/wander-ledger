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
