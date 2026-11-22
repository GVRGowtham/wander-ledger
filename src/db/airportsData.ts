import { TripVibe } from '../types/models';

export interface AirportInfo {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  lat: number;
  lng: number;
  vibe: TripVibe;
}

export interface AirlineInfo {
  code: string;
  name: string;
  loyaltyProgram: string;
}

export const AIRPORTS: Record<string, AirportInfo> = {
  // Japan & East Asia
  HND: { iata: 'HND', name: 'Tokyo Haneda Intl', city: 'Tokyo', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 35.5494, lng: 139.7798, vibe: 'japan' },
  NRT: { iata: 'NRT', name: 'Tokyo Narita Intl', city: 'Tokyo', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 35.772, lng: 140.3929, vibe: 'japan' },
  KIX: { iata: 'KIX', name: 'Kansai Intl', city: 'Osaka / Kyoto', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 34.4347, lng: 135.2441, vibe: 'japan' },
  ITM: { iata: 'ITM', name: 'Osaka Itami', city: 'Osaka / Kyoto', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 34.7855, lng: 135.4382, vibe: 'japan' },
  CTS: { iata: 'CTS', name: 'New Chitose', city: 'Sapporo', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', lat: 42.7752, lng: 141.6923, vibe: 'alpine' },
  ICN: { iata: 'ICN', name: 'Incheon Intl', city: 'Seoul', country: 'South Korea', countryCode: 'KR', flag: '🇰🇷', lat: 37.4602, lng: 126.4407, vibe: 'city' },
  HKG: { iata: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', country: 'Hong Kong', countryCode: 'HK', flag: '🇭🇰', lat: 22.308, lng: 113.9185, vibe: 'city' },
  TPE: { iata: 'TPE', name: 'Taoyuan Intl', city: 'Taipei', country: 'Taiwan', countryCode: 'TW', flag: '🇹🇼', lat: 25.0797, lng: 121.2342, vibe: 'city' },
  SIN: { iata: 'SIN', name: 'Singapore Changi', city: 'Singapore', country: 'Singapore', countryCode: 'SG', flag: '🇸🇬', lat: 1.3644, lng: 103.9915, vibe: 'tropical' },
  BKK: { iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'Thailand', countryCode: 'TH', flag: '🇹🇭', lat: 13.69, lng: 100.7501, vibe: 'tropical' },
  HKT: { iata: 'HKT', name: 'Phuket Intl', city: 'Phuket', country: 'Thailand', countryCode: 'TH', flag: '🇹🇭', lat: 8.1132, lng: 98.3169, vibe: 'tropical' },
  DPS: { iata: 'DPS', name: 'Ngurah Rai Intl', city: 'Bali', country: 'Indonesia', countryCode: 'ID', flag: '🇮🇩', lat: -8.7482, lng: 115.1672, vibe: 'tropical' },
  KUL: { iata: 'KUL', name: 'Kuala Lumpur Intl', city: 'Kuala Lumpur', country: 'Malaysia', countryCode: 'MY', flag: '🇲🇾', lat: 2.7456, lng: 101.7099, vibe: 'tropical' },
  HAN: { iata: 'HAN', name: 'Noi Bai Intl', city: 'Hanoi', country: 'Vietnam', countryCode: 'VN', flag: '🇻🇳', lat: 21.2212, lng: 105.8072, vibe: 'tropical' },

  // India & South Asia
  DEL: { iata: 'DEL', name: 'Indira Gandhi Intl', city: 'New Delhi', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 28.5562, lng: 77.1, vibe: 'desert' },
  BOM: { iata: 'BOM', name: 'Chhatrapati Shivaji', city: 'Mumbai', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 19.0896, lng: 72.8656, vibe: 'coastal' },
  BLR: { iata: 'BLR', name: 'Kempegowda Intl', city: 'Bengaluru', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 13.1986, lng: 77.7066, vibe: 'city' },
  HYD: { iata: 'HYD', name: 'Rajiv Gandhi Intl', city: 'Hyderabad', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 17.2403, lng: 78.4294, vibe: 'desert' },
  MAA: { iata: 'MAA', name: 'Chennai Intl', city: 'Chennai', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 12.9941, lng: 80.1709, vibe: 'coastal' },
  GOI: { iata: 'GOI', name: 'Dabolim Goa', city: 'Goa', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 15.3808, lng: 73.8314, vibe: 'tropical' },
  GOX: { iata: 'GOX', name: 'Manohar Intl Mopa', city: 'Goa', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 15.731, lng: 73.868, vibe: 'tropical' },
  COK: { iata: 'COK', name: 'Cochin Intl', city: 'Kochi', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 10.152, lng: 76.4019, vibe: 'tropical' },
  JAI: { iata: 'JAI', name: 'Jaipur Intl', city: 'Jaipur', country: 'India', countryCode: 'IN', flag: '🇮🇳', lat: 26.8242, lng: 75.8122, vibe: 'desert' },
  KTM: { iata: 'KTM', name: 'Tribhuvan Intl', city: 'Kathmandu', country: 'Nepal', countryCode: 'NP', flag: '🇳🇵', lat: 27.6966, lng: 85.3591, vibe: 'alpine' },
  MLE: { iata: 'MLE', name: 'Velana Intl', city: 'Malé', country: 'Maldives', countryCode: 'MV', flag: '🇲🇻', lat: 4.1918, lng: 73.5291, vibe: 'tropical' },
  CMB: { iata: 'CMB', name: 'Bandaranaike Intl', city: 'Colombo', country: 'Sri Lanka', countryCode: 'LK', flag: '🇱🇰', lat: 7.1808, lng: 79.8841, vibe: 'tropical' },

  // Middle East
  DXB: { iata: 'DXB', name: 'Dubai Intl', city: 'Dubai', country: 'UAE', countryCode: 'AE', flag: '🇦🇪', lat: 25.2532, lng: 55.3657, vibe: 'desert' },
  AUH: { iata: 'AUH', name: 'Zayed Intl', city: 'Abu Dhabi', country: 'UAE', countryCode: 'AE', flag: '🇦🇪', lat: 24.433, lng: 54.6511, vibe: 'desert' },
  DOH: { iata: 'DOH', name: 'Hamad Intl', city: 'Doha', country: 'Qatar', countryCode: 'QA', flag: '🇶🇦', lat: 25.2731, lng: 51.6081, vibe: 'desert' },
  IST: { iata: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', countryCode: 'TR', flag: '🇹🇷', lat: 41.2753, lng: 28.7519, vibe: 'desert' },

  // Europe
  LHR: { iata: 'LHR', name: 'London Heathrow', city: 'London', country: 'United Kingdom', countryCode: 'GB', flag: '🇬🇧', lat: 51.47, lng: -0.4543, vibe: 'city' },
  LGW: { iata: 'LGW', name: 'London Gatwick', city: 'London', country: 'United Kingdom', countryCode: 'GB', flag: '🇬🇧', lat: 51.1537, lng: -0.1821, vibe: 'city' },
  EDI: { iata: 'EDI', name: 'Edinburgh Airport', city: 'Edinburgh', country: 'United Kingdom', countryCode: 'GB', flag: '🇬🇧', lat: 55.9508, lng: -3.3615, vibe: 'alpine' },
  CDG: { iata: 'CDG', name: 'Paris Charles de Gaulle', city: 'Paris', country: 'France', countryCode: 'FR', flag: '🇫🇷', lat: 49.0097, lng: 2.5479, vibe: 'city' },
  NCE: { iata: 'NCE', name: 'Nice Côte d\'Azur', city: 'Nice', country: 'France', countryCode: 'FR', flag: '🇫🇷', lat: 43.6584, lng: 7.2159, vibe: 'coastal' },
  AMS: { iata: 'AMS', name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', flag: '🇳🇱', lat: 52.3105, lng: 4.7683, vibe: 'city' },
  FRA: { iata: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 50.0379, lng: 8.5622, vibe: 'city' },
  MUC: { iata: 'MUC', name: 'Munich Airport', city: 'Munich', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', lat: 48.3537, lng: 11.775, vibe: 'alpine' },
  ZRH: { iata: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 47.4647, lng: 8.5492, vibe: 'alpine' },
  GVA: { iata: 'GVA', name: 'Geneva Airport', city: 'Geneva', country: 'Switzerland', countryCode: 'CH', flag: '🇨🇭', lat: 46.2381, lng: 6.1089, vibe: 'alpine' },
  FCO: { iata: 'FCO', name: 'Rome Fiumicino', city: 'Rome', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', lat: 41.8003, lng: 12.2389, vibe: 'coastal' },
  MXP: { iata: 'MXP', name: 'Milan Malpensa', city: 'Milan', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', lat: 45.63, lng: 8.7231, vibe: 'alpine' },
  NAP: { iata: 'NAP', name: 'Naples Intl', city: 'Naples / Amalfi', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', lat: 40.886, lng: 14.2908, vibe: 'coastal' },
  VCE: { iata: 'VCE', name: 'Venice Marco Polo', city: 'Venice', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', lat: 45.5053, lng: 12.3519, vibe: 'coastal' },
  LIS: { iata: 'LIS', name: 'Lisbon Humberto Delgado', city: 'Lisbon', country: 'Portugal', countryCode: 'PT', flag: '🇵🇹', lat: 38.7742, lng: -9.1342, vibe: 'coastal' },
  OPO: { iata: 'OPO', name: 'Porto Airport', city: 'Porto', country: 'Portugal', countryCode: 'PT', flag: '🇵🇹', lat: 41.2481, lng: -8.6814, vibe: 'coastal' },
  MAD: { iata: 'MAD', name: 'Madrid Barajas', city: 'Madrid', country: 'Spain', countryCode: 'ES', flag: '🇪🇸', lat: 40.4983, lng: -3.5676, vibe: 'coastal' },
  BCN: { iata: 'BCN', name: 'Barcelona El Prat', city: 'Barcelona', country: 'Spain', countryCode: 'ES', flag: '🇪🇸', lat: 41.2974, lng: 2.0833, vibe: 'coastal' },
  ATH: { iata: 'ATH', name: 'Athens Intl', city: 'Athens', country: 'Greece', countryCode: 'GR', flag: '🇬🇷', lat: 37.9364, lng: 23.9445, vibe: 'coastal' },
  JTR: { iata: 'JTR', name: 'Santorini Airport', city: 'Santorini', country: 'Greece', countryCode: 'GR', flag: '🇬🇷', lat: 36.3992, lng: 25.4793, vibe: 'coastal' },
  KEF: { iata: 'KEF', name: 'Keflavik Intl', city: 'Reykjavik', country: 'Iceland', countryCode: 'IS', flag: '🇮🇸', lat: 63.985, lng: -22.6056, vibe: 'alpine' },
  DUB: { iata: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland', countryCode: 'IE', flag: '🇮🇪', lat: 53.4213, lng: -6.2701, vibe: 'coastal' },
  PRG: { iata: 'PRG', name: 'Václav Havel Prague', city: 'Prague', country: 'Czechia', countryCode: 'CZ', flag: '🇨🇿', lat: 50.1008, lng: 14.26, vibe: 'city' },
  VIE: { iata: 'VIE', name: 'Vienna Intl', city: 'Vienna', country: 'Austria', countryCode: 'AT', flag: '🇦🇹', lat: 48.1103, lng: 16.5697, vibe: 'alpine' },

  // North America
  LAX: { iata: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 33.9416, lng: -118.4085, vibe: 'coastal' },
  SFO: { iata: 'SFO', name: 'San Francisco Intl', city: 'San Francisco', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 37.6213, lng: -122.379, vibe: 'coastal' },
  JFK: { iata: 'JFK', name: 'John F. Kennedy Intl', city: 'New York', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 40.6413, lng: -73.7781, vibe: 'city' },
  EWR: { iata: 'EWR', name: 'Newark Liberty Intl', city: 'New York / Newark', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 40.6895, lng: -74.1745, vibe: 'city' },
  ORD: { iata: 'ORD', name: 'Chicago O\'Hare Intl', city: 'Chicago', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 41.9742, lng: -87.9073, vibe: 'city' },
  SEA: { iata: 'SEA', name: 'Seattle-Tacoma Intl', city: 'Seattle', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 47.4502, lng: -122.3088, vibe: 'alpine' },
  DEN: { iata: 'DEN', name: 'Denver Intl', city: 'Denver', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 39.8561, lng: -104.6737, vibe: 'alpine' },
  MIA: { iata: 'MIA', name: 'Miami Intl', city: 'Miami', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 25.7959, lng: -80.287, vibe: 'tropical' },
  ATL: { iata: 'ATL', name: 'Hartsfield-Jackson', city: 'Atlanta', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 33.6407, lng: -84.4277, vibe: 'city' },
  DFW: { iata: 'DFW', name: 'Dallas/Fort Worth Intl', city: 'Dallas', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 32.8998, lng: -97.0403, vibe: 'desert' },
  BOS: { iata: 'BOS', name: 'Boston Logan Intl', city: 'Boston', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 42.3656, lng: -71.0096, vibe: 'coastal' },
  HNL: { iata: 'HNL', name: 'Daniel K. Inouye Intl', city: 'Honolulu', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 21.3187, lng: -157.9225, vibe: 'tropical' },
  LAS: { iata: 'LAS', name: 'Harry Reid Intl', city: 'Las Vegas', country: 'United States', countryCode: 'US', flag: '🇺🇸', lat: 36.084, lng: -115.1537, vibe: 'desert' },
  YYZ: { iata: 'YYZ', name: 'Toronto Pearson Intl', city: 'Toronto', country: 'Canada', countryCode: 'CA', flag: '🇨🇦', lat: 43.6777, lng: -79.6248, vibe: 'city' },
  YVR: { iata: 'YVR', name: 'Vancouver Intl', city: 'Vancouver', country: 'Canada', countryCode: 'CA', flag: '🇨🇦', lat: 49.1967, lng: -123.1815, vibe: 'alpine' },
  MEX: { iata: 'MEX', name: 'Mexico City Intl', city: 'Mexico City', country: 'Mexico', countryCode: 'MX', flag: '🇲🇽', lat: 19.4361, lng: -99.0719, vibe: 'desert' },
  CUN: { iata: 'CUN', name: 'Cancún Intl', city: 'Cancún', country: 'Mexico', countryCode: 'MX', flag: '🇲🇽', lat: 21.0365, lng: -86.8771, vibe: 'tropical' },

  // Oceania, South America & Africa
  SYD: { iata: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'Australia', countryCode: 'AU', flag: '🇦🇺', lat: -33.9399, lng: 151.1753, vibe: 'coastal' },
  MEL: { iata: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia', countryCode: 'AU', flag: '🇦🇺', lat: -37.669, lng: 144.841, vibe: 'coastal' },
  AKL: { iata: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand', countryCode: 'NZ', flag: '🇳🇿', lat: -37.0082, lng: 174.785, vibe: 'alpine' },
  ZQN: { iata: 'ZQN', name: 'Queenstown Airport', city: 'Queenstown', country: 'New Zealand', countryCode: 'NZ', flag: '🇳🇿', lat: -45.0211, lng: 168.7392, vibe: 'alpine' },
  GRU: { iata: 'GRU', name: 'São Paulo Guarulhos', city: 'São Paulo', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', lat: -23.4356, lng: -46.4731, vibe: 'tropical' },
  GIG: { iata: 'GIG', name: 'Rio de Janeiro Galeão', city: 'Rio de Janeiro', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', lat: -22.8099, lng: -43.2506, vibe: 'tropical' },
  LIM: { iata: 'LIM', name: 'Jorge Chávez Intl', city: 'Lima', country: 'Peru', countryCode: 'PE', flag: '🇵🇪', lat: -12.0219, lng: -77.1143, vibe: 'alpine' },
  CPT: { iata: 'CPT', name: 'Cape Town Intl', city: 'Cape Town', country: 'South Africa', countryCode: 'ZA', flag: '🇿🇦', lat: -33.9715, lng: 18.6021, vibe: 'coastal' },
  RAK: { iata: 'RAK', name: 'Marrakesh Menara', city: 'Marrakesh', country: 'Morocco', countryCode: 'MA', flag: '🇲🇦', lat: 31.6069, lng: -8.0363, vibe: 'desert' },
  CAI: { iata: 'CAI', name: 'Cairo Intl', city: 'Cairo', country: 'Egypt', countryCode: 'EG', flag: '🇪🇬', lat: 30.1219, lng: 31.4056, vibe: 'desert' },
};

export const AIRLINES: Record<string, AirlineInfo> = {
  NH: { code: 'NH', name: 'ANA (All Nippon Airways)', loyaltyProgram: 'ANA Mileage Club (Star Alliance)' },
  JL: { code: 'JL', name: 'Japan Airlines', loyaltyProgram: 'JAL Mileage Bank (oneworld)' },
  UA: { code: 'UA', name: 'United Airlines', loyaltyProgram: 'United MileagePlus' },
  DL: { code: 'DL', name: 'Delta Air Lines', loyaltyProgram: 'Delta SkyMiles' },
  AA: { code: 'AA', name: 'American Airlines', loyaltyProgram: 'AAdvantage' },
  AS: { code: 'AS', name: 'Alaska Airlines', loyaltyProgram: 'Alaska Mileage Plan' },
  B6: { code: 'B6', name: 'JetBlue', loyaltyProgram: 'TrueBlue' },
  WN: { code: 'WN', name: 'Southwest Airlines', loyaltyProgram: 'Rapid Rewards' },
  BA: { code: 'BA', name: 'British Airways', loyaltyProgram: 'Executive Club Avios' },
  LH: { code: 'LH', name: 'Lufthansa', loyaltyProgram: 'Miles & More' },
  AF: { code: 'AF', name: 'Air France', loyaltyProgram: 'Flying Blue' },
  KL: { code: 'KL', name: 'KLM Royal Dutch', loyaltyProgram: 'Flying Blue' },
  LX: { code: 'LX', name: 'SWISS', loyaltyProgram: 'Miles & More' },
  TP: { code: 'TP', name: 'TAP Air Portugal', loyaltyProgram: 'Miles&Go (Star Alliance)' },
  AZ: { code: 'AZ', name: 'ITA Airways', loyaltyProgram: 'Volare' },
  IB: { code: 'IB', name: 'Iberia', loyaltyProgram: 'Iberia Plus Avios' },
  EK: { code: 'EK', name: 'Emirates', loyaltyProgram: 'Emirates Skywards' },
  QR: { code: 'QR', name: 'Qatar Airways', loyaltyProgram: 'Privilege Club Avios' },
  EY: { code: 'EY', name: 'Etihad Airways', loyaltyProgram: 'Etihad Guest' },
  TK: { code: 'TK', name: 'Turkish Airlines', loyaltyProgram: 'Miles&Smiles' },
  SQ: { code: 'SQ', name: 'Singapore Airlines', loyaltyProgram: 'KrisFlyer' },
  CX: { code: 'CX', name: 'Cathay Pacific', loyaltyProgram: 'Asia Miles' },
  KE: { code: 'KE', name: 'Korean Air', loyaltyProgram: 'SKYPASS' },
  TG: { code: 'TG', name: 'Thai Airways', loyaltyProgram: 'Royal Orchid Plus' },
  AI: { code: 'AI', name: 'Air India', loyaltyProgram: 'Maharaja Club (Star Alliance)' },
  '6E': { code: '6E', name: 'IndiGo', loyaltyProgram: 'IndiGo BluChip' },
  QP: { code: 'QP', name: 'Akasa Air', loyaltyProgram: 'Akasa Rewards' },
  QF: { code: 'QF', name: 'Qantas', loyaltyProgram: 'Qantas Frequent Flyer' },
  AC: { code: 'AC', name: 'Air Canada', loyaltyProgram: 'Aeroplan' },
  VS: { code: 'VS', name: 'Virgin Atlantic', loyaltyProgram: 'Flying Club' },
};

export function lookupAirport(iata: string): AirportInfo | undefined {
  return AIRPORTS[iata.trim().toUpperCase()];
}

export function lookupAirline(code: string): AirlineInfo {
  const clean = code.trim().toUpperCase();
  return (
    AIRLINES[clean] ?? {
      code: clean,
      name: `${clean} Airlines`,
      loyaltyProgram: `${clean} Frequent Flyer`,
    }
  );
}

/**
 * Great-circle distance between two coordinates using the Haversine formula (in statute miles).
 */
export function calculateDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function estimateFlightDurationMinutes(distanceMiles: number): number {
  if (distanceMiles <= 0) return 90;
  // Average jet cruise ~500 mph + 35 min taxi/climb/descent overhead
  return Math.max(45, Math.round((distanceMiles / 500) * 60 + 35));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function inferDestinationVibe(destinationText: string): {
  vibe: TripVibe;
  flag: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
} {
  const q = destinationText.toLowerCase();

  // Check if text matches any airport city/country/code
  for (const ap of Object.values(AIRPORTS)) {
    if (
      q.includes(ap.city.toLowerCase()) ||
      q.includes(ap.country.toLowerCase()) ||
      q === ap.iata.toLowerCase()
    ) {
      return {
        vibe: ap.vibe,
        flag: ap.flag,
        country: ap.country,
        countryCode: ap.countryCode,
        lat: ap.lat,
        lng: ap.lng,
      };
    }
  }

  if (/(kyoto|tokyo|osaka|japan|fuji|sapporo)/.test(q)) {
    return { vibe: 'japan', flag: '🇯🇵', country: 'Japan', countryCode: 'JP', lat: 35.6762, lng: 139.6503 };
  }
  if (/(swiss|alps|zurich|nepal|banff|aspen|iceland|mountain|snow|ski)/.test(q)) {
    return { vibe: 'alpine', flag: '🇨🇭', country: 'Switzerland', countryCode: 'CH', lat: 46.8182, lng: 8.2275 };
  }
  if (/(bali|goa|maldives|hawaii|phuket|beach|island|cancun|tropical)/.test(q)) {
    return { vibe: 'tropical', flag: '🏝️', country: 'Tropical Escape', countryCode: 'ID', lat: -8.4095, lng: 115.1889 };
  }
  if (/(dubai|jaipur|morocco|egypt|desert|doha|india|jordan)/.test(q)) {
    return { vibe: 'desert', flag: '🐪', country: 'Desert Journey', countryCode: 'AE', lat: 25.2048, lng: 55.2708 };
  }
  if (/(italy|rome|amalfi|lisbon|portugal|greece|santorini|spain|barcelona|coast)/.test(q)) {
    return { vibe: 'coastal', flag: '🇮🇹', country: 'Italy', countryCode: 'IT', lat: 41.9028, lng: 12.4964 };
  }
  return { vibe: 'city', flag: '🌍', country: destinationText || 'World Adventure', countryCode: 'US', lat: 40.7128, lng: -74.006 };
}
