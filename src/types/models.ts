export type TripVibe =
  | 'japan'
  | 'coastal'
  | 'alpine'
  | 'tropical'
  | 'desert'
  | 'city';

export type TripStatus = 'active' | 'upcoming' | 'past';

export type DistanceUnit = 'mi' | 'km';

export type ExpenseCategory =
  | 'lodging'
  | 'dining'
  | 'transit'
  | 'flights'
  | 'fuel'
  | 'activities'
  | 'shopping'
  | 'other';

export type TransportMode = 'train' | 'bus' | 'ferry' | 'rental_car' | 'own_car';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarInitials: string;
  avatarUrl?: string;
  homeCurrency: string;
  distanceUnit: DistanceUnit;
  wifiOnlyPhotoSync: boolean;
  authMode: 'google' | 'local_test';
  lastSyncedAt?: string;
}

export interface Trip {
  id: string;
  ownerId: string;
  title: string;
  destinationCity: string;
  destinationCountry: string;
  countryCode: string;
  flagEmoji: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  homeCurrency: string;
  budget: number;
  vibe: TripVibe;
  coverPhotoUri?: string;
  isShared: boolean;
  shareToken?: string;
  coTravelers: string[]; // display names or emails
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
}

export interface Flight {
  id: string;
  tripId: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  pnr?: string;
  originIata: string;
  originCity: string;
  destIata: string;
  destCity: string;
  departureTime: string; // ISO string or YYYY-MM-DDTHH:mm
  arrivalTime: string;
  durationMinutes: number;
  seat?: string;
  cabinClass?: string;
  terminal?: string;
  gate?: string;
  aircraft?: string;
  status: 'scheduled' | 'completed' | 'delayed';
  distanceMiles: number;
  milesEarned: number;
  loyaltyProgram?: string;
  frequentFlyerNumber?: string;
  enrichedOnline: boolean;
  rawBarcode?: string;
  createdAt: string;
}

export interface TransportLeg {
  id: string;
  tripId: string;
  mode: TransportMode;
  title: string; // e.g., "SBB InterCity 8" / "Sixt VW Golf" / "Road Trip in Swift"
  operatorName?: string; // e.g., "IRCTC", "SBB", "Sixt", "Hertz"
  referenceCode?: string; // PNR / Train No / Booking Ref
  origin: string; // e.g., "Zurich HB" / "Bengaluru"
  destination: string; // e.g., "Lucerne" / "Coorg"
  startDate: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  endDate?: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  seatOrVehicle?: string; // e.g., "Coach B4 • 32" or "VW Golf" or "KA-01-XX"
  distanceKm?: number; // Stored canonically in km, displayed in user's km/mi preference
  costAmount?: number; // Ticket / rental cost in local currency
  currency?: string;
  homeCost?: number; // Converted cost in trip home currency
  notes?: string;
  createdAt: string;
}

export interface TripStop {
  id: string;
  tripId: string;
  cityName: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  sortOrder: number;
  createdAt: string;
}

export interface Stay {
  id: string;
  tripId: string;
  name: string;
  stayType: 'hotel' | 'airbnb' | 'ryokan' | 'hostel' | 'resort';
  address?: string;
  confirmationCode?: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  nights: number;
  costCash: number;
  currency: string;
  homeCost: number;
  pointsRedeemed: number;
  pointsProgram?: string;
  cashValueEstimate?: number;
  receiptUri?: string;
  notes?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  tripId: string;
  merchant: string;
  category: ExpenseCategory;
  localAmount: number;
  localCurrency: string;
  homeAmount: number;
  homeCurrency: string;
  fxRateUsed: number;
  expenseDate: string; // YYYY-MM-DD
  paymentMethod?: string;
  pointsEarned?: number;
  receiptUri?: string; // Strictly private — tucked inside Spend tab only!
  receiptRawText?: string;
  notes?: string;
  createdAt: string;
}

export interface Memory {
  id: string;
  tripId: string;
  stopId?: string; // Optional TripStop / hop tag
  title: string;
  note: string;
  capturedAt: string; // ISO date or YYYY-MM-DDTHH:mm
  placeName?: string;
  lat?: number;
  lng?: number;
  photoUri?: string;
  thumbUri?: string;
  illustrationKey?: 'torii' | 'matcha' | 'coast' | 'alpine' | 'tram' | 'beach';
  moodSticker: string; // e.g. '🌅 Core Memory'
  isHighlight: boolean;
  authorName?: string;
  createdAt: string;
}

export interface LoyaltyAccount {
  id: string;
  programName: string;
  category: 'airline' | 'hotel' | 'card';
  memberNumber?: string;
  balance: number;
  unitLabel: 'mi' | 'pts';
  updatedAt: string;
}

export interface ParsedBoardingPass {
  kind: 'boarding_pass';
  source?: 'barcode' | 'ocr';
  passengerName: string;
  pnr: string;
  originIata: string;
  destIata: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  flightDate: string; // YYYY-MM-DD
  cabinClass: string;
  seat: string;
  frequentFlyerAirline?: string;
  frequentFlyerNumber?: string;
  distanceMiles: number;
  estimatedDurationMin: number;
  loyaltyProgram: string;
  rawBarcode: string;
  ticketAmount?: number;
  ticketCurrency?: string;
  rawText?: string;
  imageUri?: string;
}

export interface ParsedReceipt {
  kind: 'receipt';
  merchant: string;
  amount: number;
  currency: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  rawText: string;
  imageUri?: string;
}

export interface ParsedHotelConfirmation {
  kind: 'hotel';
  hotelName: string;
  confirmationCode?: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  nights: number;
  totalAmount: number;
  currency: string;
  address?: string;
  cityHint?: string;
  rawText: string;
  imageUri?: string;
}

export interface ParsedTransport {
  kind: 'transport';
  mode: 'train' | 'bus' | 'ferry' | 'rental_car';
  operatorName: string;
  origin: string;
  destination: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  referenceCode?: string;
  seatOrVehicle?: string;
  totalAmount: number;
  currency: string;
  rawText: string;
  imageUri?: string;
}

export type ScanResult =
  | ParsedBoardingPass
  | ParsedReceipt
  | ParsedHotelConfirmation
  | ParsedTransport;

export interface IncomingSharePayload {
  id: string;
  imageUris: string[];
  pdfUri?: string;
  text?: string;
  fileName?: string;
}

export interface TripSummaryStats {
  totalSpentHome: number;
  totalMilesFlown: number;
  totalDistanceKm: number;
  totalPointsEarned: number;
  memoriesCount: number;
  flightsCount: number;
  transportsCount: number;
  staysCount: number;
  receiptsCount: number;
}
