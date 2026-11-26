import { ExpenseCategory, TransportMode } from '../types/models';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export function resolveThemeMode(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined
): ResolvedTheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export interface ThemeColors {
  // Surfaces & Borders
  canvas: string;
  card: string;
  cardWarm: string;
  surfaceMuted: string;
  border: string;
  borderSoft: string;
  navBg: string;
  navBorder: string;
  modalBackdrop: string;
  handleBar: string;

  // Typography
  ink: string;
  inkMuted: string;
  inkSoft: string;

  // Joyful Travel Accents
  coral: string;
  coralDark: string;
  coralSoft: string;
  coralBorder: string;
  rose: string;
  roseSoft: string;
  roseBorder: string;
  sky: string;
  skySoft: string;
  skyBorder: string;
  emerald: string;
  emeraldSoft: string;
  emeraldBorder: string;
  emeraldText: string;
  amber: string;
  amberSoft: string;
  amberBorder: string;
  amberText: string;
  indigo: string;
  indigoSoft: string;
  indigoBorder: string;
  navy: string;
  navyText: string;
}

export const LIGHT_COLORS: ThemeColors = {
  // Warm Sunlit Postcard Canvas
  canvas: '#FFF9F2',
  card: '#FFFFFF',
  cardWarm: '#FFF4E6',
  surfaceMuted: '#FFF9F2',
  border: '#F3DFC8',
  borderSoft: '#F0E6DA',
  navBg: '#FFFFFF',
  navBorder: '#FDE68A',
  modalBackdrop: 'rgba(28,25,23,0.52)',
  handleBar: '#E7E5E4',

  // Typography
  ink: '#292524',
  inkMuted: '#78716C',
  inkSoft: '#A8A29E',

  // Joyful Travel Accents
  coral: '#F97316',
  coralDark: '#EA580C',
  coralSoft: '#FFEDD5',
  coralBorder: '#FED7AA',
  rose: '#F43F5E',
  roseSoft: '#FFE4E6',
  roseBorder: '#FECDD3',
  sky: '#0EA5E9',
  skySoft: '#E0F2FE',
  skyBorder: '#BAE6FD',
  emerald: '#10B981',
  emeraldSoft: '#D1FAE5',
  emeraldBorder: '#A7F3D0',
  emeraldText: '#047857',
  amber: '#F59E0B',
  amberSoft: '#FEF3C7',
  amberBorder: '#FCD34D',
  amberText: '#B45309',
  indigo: '#4F46E5',
  indigoSoft: '#E0E7FF',
  indigoBorder: '#C7D2FE',
  navy: '#1E1B4B',
  navyText: '#1E1B4B',
};

export const DARK_COLORS: ThemeColors = {
  // Midnight Passport Canvas — warm deep indigo-charcoal (never sterile pure black)
  canvas: '#0E111B',
  card: '#171C2C',
  cardWarm: '#221C2A',
  surfaceMuted: '#1E2438',
  border: '#2C344E',
  borderSoft: '#22283E',
  navBg: '#131827',
  navBorder: '#283049',
  modalBackdrop: 'rgba(4,6,14,0.74)',
  handleBar: '#3B4463',

  // Warm Parchment Typography
  ink: '#F5F2EB',
  inkMuted: '#B3BACB',
  inkSoft: '#7D869E',

  // Luminous Travel Accents tuned for Dark Surfaces
  coral: '#FB923C',
  coralDark: '#FDBA74',
  coralSoft: '#331E14',
  coralBorder: '#6B361F',
  rose: '#FB7185',
  roseSoft: '#351621',
  roseBorder: '#6E233E',
  sky: '#38BDF8',
  skySoft: '#11273A',
  skyBorder: '#1D4D70',
  emerald: '#34D399',
  emeraldSoft: '#102B24',
  emeraldBorder: '#1D5746',
  emeraldText: '#6EE7B7',
  amber: '#FBBF24',
  amberSoft: '#302310',
  amberBorder: '#61471A',
  amberText: '#FCD34D',
  indigo: '#818CF8',
  indigoSoft: '#1E2246',
  indigoBorder: '#3B4282',
  navy: '#312E81',
  navyText: '#C7D2FE',
};

// Legacy default export kept for non-reactive helpers & tests
export const COLORS = LIGHT_COLORS;

export const LIGHT_SHADOWS = {
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

export const DARK_SHADOWS = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.36,
    shadowRadius: 12,
    elevation: 4,
  },
  polaroid: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  fab: {
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 9,
  },
};

export const SHADOWS = LIGHT_SHADOWS;

export type ThemeShadows = typeof LIGHT_SHADOWS;

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

export const DARK_CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; emoji: string; color: string; bg: string }
> = {
  lodging: { label: 'Stays', emoji: '🏨', color: '#A5B4FC', bg: '#1F234A' },
  dining: { label: 'Food & Drink', emoji: '🍜', color: '#FDBA74', bg: '#351F14' },
  transit: { label: 'Transit', emoji: '🚄', color: '#6EE7B7', bg: '#112E26' },
  flights: { label: 'Flights', emoji: '✈️', color: '#7DD3FC', bg: '#122B3F' },
  fuel: { label: 'Fuel & Tolls', emoji: '⛽', color: '#FCD34D', bg: '#332510' },
  activities: { label: 'Experiences', emoji: '🎟️', color: '#F9A8D4', bg: '#36172B' },
  shopping: { label: 'Souvenirs', emoji: '🛍️', color: '#C4B5FD', bg: '#281E47' },
  other: { label: 'Other', emoji: '✨', color: '#CBD5E1', bg: '#23293E' },
};

export function getCategoryMeta(isDark: boolean) {
  return isDark ? DARK_CATEGORY_META : CATEGORY_META;
}

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

export const DARK_TRANSPORT_MODE_META: Record<
  TransportMode,
  { label: string; emoji: string; color: string; bg: string; subtitle: string }
> = {
  train: {
    label: 'Train',
    emoji: '🚆',
    color: '#5EEAD4',
    bg: '#112E2D',
    subtitle: 'IRCTC • SBB • Eurostar • Shinkansen',
  },
  bus: {
    label: 'Bus',
    emoji: '🚌',
    color: '#7DD3FC',
    bg: '#122A3E',
    subtitle: 'RedBus • FlixBus • Coach',
  },
  ferry: {
    label: 'Ferry',
    emoji: '⛴️',
    color: '#93C5FD',
    bg: '#152544',
    subtitle: 'Boat • Cruise • Island Ferry',
  },
  rental_car: {
    label: 'Rental Car',
    emoji: '🚗',
    color: '#FDBA74',
    bg: '#351F14',
    subtitle: 'Sixt • Hertz • Avis • Zoomcar',
  },
  own_car: {
    label: 'Own Car',
    emoji: '🚘',
    color: '#FCD34D',
    bg: '#332510',
    subtitle: 'Road Trip • Fuel & Tolls',
  },
};

export function getTransportModeMeta(isDark: boolean) {
  return isDark ? DARK_TRANSPORT_MODE_META : TRANSPORT_MODE_META;
}

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
