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
  | 'activities'
  | 'shopping'
  | 'other';

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
  rawText: string;
  imageUri?: string;
}

export type ScanResult =
  | ParsedBoardingPass
  | ParsedReceipt
  | ParsedHotelConfirmation;

export interface TripSummaryStats {
  totalSpentHome: number;
  totalMilesFlown: number;
  totalPointsEarned: number;
  memoriesCount: number;
  flightsCount: number;
  staysCount: number;
  receiptsCount: number;
}
