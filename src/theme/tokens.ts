import { ExpenseCategory, TransportMode } from '../types/models';

export const COLORS = {
  // Warm Sunlit Postcard Canvas
  canvas: '#FFF9F2',
  card: '#FFFFFF',
  cardWarm: '#FFF4E6',
  border: '#F3DFC8',
  borderSoft: '#F0E6DA',

  // Typography
  ink: '#292524',
  inkMuted: '#78716C',
  inkSoft: '#A8A29E',

  // Joyful Travel Accents
  coral: '#F97316',
  coralDark: '#EA580C',
  coralSoft: '#FFEDD5',
  rose: '#F43F5E',
  roseSoft: '#FFE4E6',
  sky: '#0EA5E9',
  skySoft: '#E0F2FE',
  emerald: '#10B981',
  emeraldSoft: '#D1FAE5',
  amber: '#F59E0B',
  amberSoft: '#FEF3C7',
  indigo: '#4F46E5',
  indigoSoft: '#E0E7FF',
  navy: '#1E1B4B',
};

export const SHADOWS = {
  card: {
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  polaroid: {
    shadowColor: '#292524',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  fab: {
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
};

export const CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; emoji: string; color: string; bg: string }
> = {
  lodging: { label: 'Stays', emoji: '🏨', color: '#4F46E5', bg: '#E0E7FF' },
  dining: { label: 'Food & Drink', emoji: '🍜', color: '#F97316', bg: '#FFEDD5' },
  transit: { label: 'Transit', emoji: '🚄', color: '#10B981', bg: '#D1FAE5' },
  flights: { label: 'Flights', emoji: '✈️', color: '#0EA5E9', bg: '#E0F2FE' },
  fuel: { label: 'Fuel & Tolls', emoji: '⛽', color: '#D97706', bg: '#FEF3C7' },
  activities: { label: 'Experiences', emoji: '🎟️', color: '#EC4899', bg: '#FCE7F3' },
  shopping: { label: 'Souvenirs', emoji: '🛍️', color: '#8B5CF6', bg: '#EDE9FE' },
  other: { label: 'Other', emoji: '✨', color: '#78716C', bg: '#F5F5F4' },
};

export const TRANSPORT_MODE_META: Record<
  TransportMode,
  { label: string; emoji: string; color: string; bg: string; subtitle: string }
> = {
  train: {
    label: 'Train',
    emoji: '🚆',
    color: '#0D9488',
    bg: '#CCFBF1',
    subtitle: 'IRCTC • SBB • Eurostar • Shinkansen',
  },
  bus: {
    label: 'Bus',
    emoji: '🚌',
    color: '#0284C7',
    bg: '#E0F2FE',
    subtitle: 'RedBus • FlixBus • Coach',
  },
  ferry: {
    label: 'Ferry',
    emoji: '⛴️',
    color: '#2563EB',
    bg: '#DBEAFE',
    subtitle: 'Boat • Cruise • Island Ferry',
  },
  rental_car: {
    label: 'Rental Car',
    emoji: '🚗',
    color: '#EA580C',
    bg: '#FFEDD5',
    subtitle: 'Sixt • Hertz • Avis • Zoomcar',
  },
  own_car: {
    label: 'Own Car',
    emoji: '🚘',
    color: '#D97706',
    bg: '#FEF3C7',
    subtitle: 'Road Trip • Fuel & Tolls',
  },
};

export const MOOD_STICKERS = [
  '🌅 Core Memory',
  '🍜 Food Coma',
  '🏔️ Pure Magic',
  '☕ Cozy Pause',
  '🌊 Ocean Breeze',
  '🎉 Best Day',
  '🚆 Scenic Ride',
  '✨ Hidden Gem',
];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  INR: '₹',
  CHF: 'CHF ',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  THB: '฿',
  AED: 'AED ',
  KRW: '₩',
  MXN: 'MX$',
  NZD: 'NZ$',
};

export function formatMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const sym = CURRENCY_SYMBOLS[code] ?? `${code} `;
  const noDecimals = ['JPY', 'KRW'].includes(code);
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  });
  return amount < 0 ? `-${sym}${formatted}` : `${sym}${formatted}`;
}
