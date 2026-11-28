import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PixelRatio,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { DestinationBanner } from '../components/banners/DestinationBanner';
import { BoardingPassCard } from '../components/cards/BoardingPassCard';
import { MemoryIllustration } from '../components/cards/MemoryIllustration';
import { TransportCard } from '../components/cards/TransportCard';
import { DatePickerField } from '../components/forms/DatePickerField';
import { CurrencySuggestionsBar } from '../components/forms/CurrencyField';
import { resolveTripCurrencies } from '../services/currencyDirectory';
import {
  createEmptyFlightDraft,
  hasAnyFlightDraftData,
  ManualFlightDraft,
  ManualFlightFields,
} from '../components/forms/ManualFlightFields';
import {
  TransportDraft,
  TransportFormFields,
} from '../components/forms/TransportFormFields';
import { InstagramIcon } from '../components/icons/InstagramIcon';
import {
  CanvasImageLoadScope,
  IgSingleCanvas,
} from '../components/instagram/IgPostcardCanvas';
import { BottomSheetModal } from '../components/layout/BottomSheetModal';
import {
  ReceiptLightboxItem,
  ReceiptLightboxModal,
} from '../components/modals/ReceiptLightboxModal';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { useApp } from '../context/AppContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  inferDestinationVibe,
  lookupAirline,
  lookupAirport,
} from '../db/airportsData';
import { generateId } from '../db/database';
import {
  buildJourneyRouteTrail,
  buildJourneyTimeline,
  convertToKm,
  formatDistance,
  formatDistanceValue,
  matchStopForDate,
  suggestStopsFromBookings,
} from '../services/distanceUtils';
import { deriveTripGeography } from '../services/travelGeography';
import { convertCurrency } from '../services/fxService';
import { generateOfflineIgCaption } from '../services/igCaptionService';
import {
  CollageLayoutId,
  computeNativeExportCanvasWidth,
  ImageDimensions,
  PhotoCrop,
} from '../services/igStudioHelpers';
import {
  buildManualFlight,
  buildReturnFlight,
} from '../services/manualFlightBuilder';
import { pickAndOptimizeMemoryPhoto } from '../services/mediaService';
import { enrichFlightDetails } from '../services/flightEnricher';
import { exportTripKeepsakePdf } from '../services/keepsakePdfService';
import {
  KeepsakeExportConfig,
  KeepsakeStudioModal,
} from '../components/keepsake/KeepsakeStudioModal';
import { shareImageWithCaption } from '../services/shareMediaService';
import {
  buildTripSpendLedger,
  convertAmountToPreferred,
  formatShortRateDate,
  resolveDefaultFxDate,
  SpendLedgerItem,
} from '../services/spendCurrencyUtils';
import { formatTimeHmInput } from '../services/timeInputUtils';
import { PlaceAddressHelper } from '../components/forms/PlaceAddressHelper';
import {
  formatTripTitleWithFlags,
  openPropertyInGoogleMaps,
} from '../services/placeLookupService';
import {
  getCoTravelerRole,
  getEditorCount,
  getTripAccessRole,
  isCollaborativeTrip,
  normalizeCoTravelerKey,
} from '../services/sharingHelpers';
import {
  formatMoney,
  getCategoryMeta,
  getTransportModeMeta,
  MOOD_STICKERS,
  ThemeColors,
  ThemeShadows,
  TRANSPORT_MODE_META,
} from '../theme/tokens';
import {
  CoTravelerRole,
  DistanceUnit,
  ExpenseCategory,
  Flight,
  Memory,
  Stay,
  TripStop,
  TransportLeg,
  TripVibe,
} from '../types/models';

interface Props {
  tripId: string;
  backLabel?: string;
  onBack: () => void;
  onOpenScanner: () => void;
  onOpenIgStudio: (tripId: string) => void;
}

type InnerTab = 'memories' | 'bookings' | 'spend';

const STAY_TYPES: Array<{ id: Stay['stayType']; label: string }> = [
  { id: 'hotel', label: 'Hotel' },
  { id: 'airbnb', label: 'Airbnb' },
  { id: 'resort', label: 'Resort' },
  { id: 'ryokan', label: 'Ryokan' },
  { id: 'hostel', label: 'Hostel' },
];

const VIBES: Array<{ id: TripVibe; label: string; emoji: string }> = [
  { id: 'japan', label: 'Japan', emoji: '🌸' },
  { id: 'coastal', label: 'Coastal', emoji: '🌊' },
  { id: 'alpine', label: 'Alpine', emoji: '🏔️' },
  { id: 'tropical', label: 'Tropical', emoji: '🏝️' },
  { id: 'desert', label: 'Desert', emoji: '🐪' },
  { id: 'city', label: 'City', emoji: '🌆' },
];

export const TripDetailScreen: React.FC<Props> = ({
  tripId,
  backLabel = 'Trips',
  onBack,
  onOpenScanner,
  onOpenIgStudio,
}) => {
  const {
    trips,
    profile,
    fxRates,
    fxSnapshots,
    getFlightsForTrip,
    getTransportsForTrip,
    getStopsForTrip,
    getStaysForTrip,
    getExpensesForTrip,
    getMemoriesForTrip,
    getSummaryForTrip,
    editTrip,
    addFlight,
    editFlight,
    removeFlight,
    addTransport,
    editTransport,
    removeTransport,
    addTripStop,
    editTripStop,
    removeTripStop,
    addStay,
    editStay,
    removeStay,
    addMemory,
    editMemory,
    removeMemory,
    addExpense,
    removeExpense,
    updateSpendItemFxDate,
    removeTrip,
    setTripCoverPhoto,
    saveTripSharing,
  } = useApp();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const categoryMeta = getCategoryMeta(isDark);
  const transportMeta = getTransportModeMeta(isDark);

  const trip = trips.find((t) => t.id === tripId);
  const distanceUnit: DistanceUnit = profile?.distanceUnit ?? 'km';
  const [tab, setTab] = useState<InnerTab>('memories');
  const [selectedStopFilterId, setSelectedStopFilterId] = useState<string | null>(null);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  // Edit Trip Modal
  const [editModal, setEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editVibe, setEditVibe] = useState<TripVibe>('coastal');

  // Add / Edit Memory Modal
  const [memoryModal, setMemoryModal] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memStopId, setMemStopId] = useState<string | undefined>(undefined);
  const [memStopAutoMatched, setMemStopAutoMatched] = useState<string | null>(null);
  const [memTitle, setMemTitle] = useState('');
  const [memNote, setMemNote] = useState('');
  const [memPlace, setMemPlace] = useState('');
  const [memDate, setMemDate] = useState(new Date().toISOString().slice(0, 10));
  const [memCapturedTime, setMemCapturedTime] = useState<string | undefined>(undefined);
  const [memDateAutoDetected, setMemDateAutoDetected] = useState(false);
  const [memLat, setMemLat] = useState<number | undefined>(undefined);
  const [memLng, setMemLng] = useState<number | undefined>(undefined);
  const [memMood, setMemMood] = useState(MOOD_STICKERS[0]);
  const [memPhotoUri, setMemPhotoUri] = useState<string | undefined>(undefined);
  const [memThumbUri, setMemThumbUri] = useState<string | undefined>(undefined);

  // Unified Add / Edit Travel Modal (Flight OR Train / Bus / Ferry / Rental Car / Own Car)
  const [flightModal, setFlightModal] = useState(false);
  const [travelModalMode, setTravelModalMode] = useState<'flight' | 'transport'>('flight');
  const [editingTransport, setEditingTransport] = useState<TransportLeg | null>(null);
  const [flightDraft, setFlightDraft] = useState<ManualFlightDraft>(() =>
    createEmptyFlightDraft(
      trip?.startDate || new Date().toISOString().slice(0, 10),
      trip?.endDate || new Date().toISOString().slice(0, 10),
      trip?.homeCurrency || 'USD',
      trip?.destinationCity || ''
    )
  );
  // Edit Existing Flight Modal (date, time, flight #, route, PNR, seat, cabin)
  const [editFlightModal, setEditFlightModal] = useState(false);
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [editFltNum, setEditFltNum] = useState('');
  const [editFltOrigin, setEditFltOrigin] = useState('');
  const [editFltDest, setEditFltDest] = useState('');
  const [editFltDate, setEditFltDate] = useState('');
  const [editFltTime, setEditFltTime] = useState('');
  const [editFltPnr, setEditFltPnr] = useState('');
  const [editFltSeat, setEditFltSeat] = useState('');
  const [editFltCabin, setEditFltCabin] = useState('Economy');
  const [transportDraft, setTransportDraft] = useState<TransportDraft>({
    mode: 'train',
    title: '',
    operatorName: '',
    origin: '',
    destination: trip?.destinationCity || '',
    startDate: trip?.startDate || new Date().toISOString().slice(0, 10),
    endDate: trip?.endDate || '',
    referenceCode: '',
    seatOrVehicle: '',
    distanceInput: '',
    costAmount: '',
    currency: trip?.homeCurrency || 'USD',
    notes: '',
  });

  // Add / Edit Stop / Hop Modal
  const [stopModal, setStopModal] = useState(false);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [stopCity, setStopCity] = useState('');
  const [stopStartDate, setStopStartDate] = useState(trip?.startDate || '');
  const [stopEndDate, setStopEndDate] = useState(trip?.endDate || '');

  // Manual / Edit Stay Modal
  const [stayModal, setStayModal] = useState(false);
  const [editingStayId, setEditingStayId] = useState<string | null>(null);
  const [stayName, setStayName] = useState('');
  const [stayType, setStayType] = useState<Stay['stayType']>('hotel');
  const [stayCheckIn, setStayCheckIn] = useState(trip?.startDate || '');
  const [stayCheckOut, setStayCheckOut] = useState(trip?.endDate || '');
  const [stayConf, setStayConf] = useState('');
  const [stayAddress, setStayAddress] = useState('');
  const [stayCost, setStayCost] = useState('');
  const [stayCurrency, setStayCurrency] = useState(trip?.homeCurrency || 'USD');
  const [stayPoints, setStayPoints] = useState('');
  const [stayPointsProg, setStayPointsProg] = useState('');
  const [stayPayLater, setStayPayLater] = useState(false);
  const [stayNotes, setStayNotes] = useState('');

  // Quick Expense Modal (defaults to Personal; 1-tap toggle to Shared on collaborative trips)
  const [expenseModal, setExpenseModal] = useState(false);
  const [expMerchant, setExpMerchant] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState(trip?.homeCurrency || 'USD');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('dining');
  const [expIsShared, setExpIsShared] = useState(false);
  const [expenseFilter, setExpenseFilter] = useState<'all' | 'personal' | 'shared'>('all');

  // FX Rate Date Edit Modal (lets user adjust Payment Date or toggle Pay Later on any converted spend row)
  const [fxEditItem, setFxEditItem] = useState<SpendLedgerItem | null>(null);
  const [fxEditDate, setFxEditDate] = useState(new Date().toISOString().slice(0, 10));
  const [fxEditPayLater, setFxEditPayLater] = useState(false);

  // Full-screen zoomable receipt lightbox
  const [lightboxReceipt, setLightboxReceipt] = useState<ReceiptLightboxItem | null>(null);

  // Co-Travelers Modal & Instant One-Off Postcard Export
  const [shareModal, setShareModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CoTravelerRole>('editor');
  const [sharingPostcard, setSharingPostcard] = useState(false);
  const [keepsakeStudioOpen, setKeepsakeStudioOpen] = useState(false);
  const [exportingKeepsakePdf, setExportingKeepsakePdf] = useState(false);
  const [refreshingFlightId, setRefreshingFlightId] = useState<string | null>(null);
  const [postcardRenderJob, setPostcardRenderJob] = useState<{
    jobKey: string;
    memories: Memory[];
    layout: CollageLayoutId;
    imageDims: Record<string, ImageDimensions>;
    photoCrops: Record<string, PhotoCrop>;
  } | null>(null);
  const postcardShotRef = useRef<ViewShotRef | null>(null);
  const postcardReadyResolverRef = useRef<(() => void) | null>(null);

  const handlePostcardImagesReady = useCallback(() => {
    const resolve = postcardReadyResolverRef.current;
    postcardReadyResolverRef.current = null;
    resolve?.();
  }, []);

  if (!trip) {
    return (
      <View style={styles.missingWrap}>
        <Text style={styles.missingText}>Trip not found.</Text>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back to Trips</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const flights = getFlightsForTrip(trip.id);
  const transports = getTransportsForTrip(trip.id);
  const stops = getStopsForTrip(trip.id);
  const stays = getStaysForTrip(trip.id);
  const expenses = getExpensesForTrip(trip.id);
  const memories = getMemoriesForTrip(trip.id);
  const summary = getSummaryForTrip(trip.id);

  const myRole = FEATURE_FLAGS.CLOUD_COLLAB_ENABLED
    ? getTripAccessRole(trip, profile)
    : 'owner';
  const isOwner = myRole === 'owner';
  const isViewer = myRole === 'viewer';
  const isCollab = FEATURE_FLAGS.CLOUD_COLLAB_ENABLED && isCollaborativeTrip(trip, profile);
  const editorCount = FEATURE_FLAGS.CLOUD_COLLAB_ENABLED ? getEditorCount(trip) : 1;

  const stopMap = new Map(stops.map((s) => [s.id, s]));
  const activeStopFilter =
    selectedStopFilterId && stopMap.has(selectedStopFilterId)
      ? selectedStopFilterId
      : null;
  const visibleMemories = activeStopFilter
    ? memories.filter((m) => m.stopId === activeStopFilter)
    : memories;

  const preferredCurrency = (profile?.homeCurrency || trip.homeCurrency || 'USD').toUpperCase();
  const convertedTripBudget =
    trip.budget > 0
      ? convertAmountToPreferred(trip.budget, trip.homeCurrency, preferredCurrency, fxRates).amount
      : 0;

  const fullSpendLedger = buildTripSpendLedger({
    expenses,
    transports,
    stays,
    preferredCurrency,
    fallbackCurrency: trip.homeCurrency,
    fxRates,
    fxSnapshots,
  });

  const fuelExpenses = fullSpendLedger.items.filter((i) => i.category === 'fuel');
  const fuelSpentHome = fuelExpenses.reduce((sum, i) => sum + i.convertedAmount, 0);
  const timelineItems = buildJourneyTimeline(flights, transports, stays);
  const routeTrail = buildJourneyRouteTrail(flights, transports, stops);
  const suggestedStops = suggestStopsFromBookings(flights, transports, stays, stops);
  const tripGeo = deriveTripGeography(trip, flights, transports, stops);
  const tripCurrencies = resolveTripCurrencies(trip, flights, transports, stops);
  const defaultManualCurrency =
    tripCurrencies.length === 1
      ? tripCurrencies[0]
      : tripCurrencies.length > 1
        ? ''
        : preferredCurrency;

  // Personal vs Shared expense filtering (Option A: full bill amounts + subtle per-person reference on Shared)
  const personalSpendItems = fullSpendLedger.items.filter(
    (i) => i.source === 'expense' && !i.isShared
  );
  const sharedSpendItems = fullSpendLedger.items.filter(
    (i) => i.source === 'expense' && i.isShared
  );
  const showExpenseFilter =
    FEATURE_FLAGS.CLOUD_COLLAB_ENABLED && (isCollab || sharedSpendItems.length > 0);
  const activeExpenseFilter = showExpenseFilter ? expenseFilter : 'all';
  const visibleSpendItems =
    activeExpenseFilter === 'personal'
      ? personalSpendItems
      : activeExpenseFilter === 'shared'
        ? sharedSpendItems
        : fullSpendLedger.items;

  // Spend breakdown by category (follows active All / Personal / Shared filter, all converted to preferredCurrency)
  const catTotals: Record<string, number> = {};
  for (const item of visibleSpendItems) {
    catTotals[item.category] =
      Math.round(((catTotals[item.category] ?? 0) + item.convertedAmount) * 100) / 100;
  }
  const filteredTotalHome =
    Math.round(visibleSpendItems.reduce((sum, i) => sum + i.convertedAmount, 0) * 100) / 100;
  const grandTotal = Math.max(1, filteredTotalHome);

  // --- EDIT TRIP ---
  const openEditTripModal = () => {
    setEditTitle(trip.title);
    setEditDestination(trip.destinationCity);
    setEditStartDate(trip.startDate);
    setEditEndDate(trip.endDate);
    setEditBudget(convertedTripBudget > 0 ? String(convertedTripBudget) : '');
    setEditCurrency(preferredCurrency);
    setEditVibe(trip.vibe);
    setEditModal(true);
  };

  const handleSaveTripEdit = () => {
    const cleanTitle = editTitle.trim();
    const cleanDest = editDestination.trim() || trip.destinationCity;
    if (!cleanTitle) {
      Alert.alert('Trip name needed', 'Give your trip a name before saving.');
      return;
    }

    const destChanged = cleanDest.toLowerCase() !== trip.destinationCity.toLowerCase();
    const inferred = destChanged ? inferDestinationVibe(cleanDest) : null;

    editTrip(trip.id, {
      title: cleanTitle,
      destinationCity: cleanDest,
      destinationCountry: inferred ? inferred.country : trip.destinationCountry,
      countryCode: inferred ? inferred.countryCode : trip.countryCode,
      flagEmoji: inferred ? inferred.flag : trip.flagEmoji,
      lat: inferred ? inferred.lat : trip.lat,
      lng: inferred ? inferred.lng : trip.lng,
      startDate: editStartDate.trim() || trip.startDate,
      endDate: editEndDate.trim() || trip.endDate,
      budget: parseFloat(editBudget) || 0,
      homeCurrency: editCurrency.trim().toUpperCase() || trip.homeCurrency,
      vibe: editVibe,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditModal(false);
  };

  // --- STOPS / HOPS ---
  const openAddStopModal = () => {
    setEditingStopId(null);
    setStopCity('');
    setStopStartDate(trip.startDate);
    setStopEndDate(trip.endDate);
    setStopModal(true);
  };

  const openEditStopModal = (stop: TripStop) => {
    setEditingStopId(stop.id);
    setStopCity(stop.cityName);
    setStopStartDate(stop.startDate || '');
    setStopEndDate(stop.endDate || stop.startDate || '');
    setStopModal(true);
  };

  const handleSaveStop = () => {
    const clean = stopCity.trim();
    if (!clean) {
      Alert.alert('City or stop name needed', 'Enter a city, town, or hop name (e.g. Lucerne).');
      return;
    }
    const cleanStart = stopStartDate.trim() || undefined;
    const cleanEnd = stopEndDate.trim() || undefined;
    if (editingStopId) {
      const existing = stops.find((s) => s.id === editingStopId);
      editTripStop({
        id: editingStopId,
        tripId: trip.id,
        cityName: clean,
        startDate: cleanStart,
        endDate: cleanEnd,
        sortOrder: existing?.sortOrder ?? stops.length,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      });
    } else {
      const newId = generateId('stop');
      addTripStop({
        id: newId,
        tripId: trip.id,
        cityName: clean,
        startDate: cleanStart,
        endDate: cleanEnd,
        sortOrder: stops.length,
        createdAt: new Date().toISOString(),
      });
      // If adding a stop while Memory modal is open, auto-select it!
      if (memoryModal) {
        setMemStopId(newId);
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditingStopId(null);
    setStopModal(false);
  };

  const handleAcceptSuggestedStop = (cityName: string, startDate?: string, endDate?: string) => {
    addTripStop({
      id: generateId('stop'),
      tripId: trip.id,
      cityName,
      startDate,
      endDate,
      sortOrder: stops.length,
      createdAt: new Date().toISOString(),
    });
    Haptics.selectionAsync().catch(() => {});
  };

  const handleDeleteStop = (stopId: string, cityName: string) => {
    Alert.alert(`Remove stop "${cityName}"?`, 'Memories tagged to this stop will stay in your trip (untagged).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (selectedStopFilterId === stopId) setSelectedStopFilterId(null);
          removeTripStop(stopId);
        },
      },
    ]);
  };

  // --- MEMORIES (ADD + EDIT + DELETE) ---
  const openAddMemoryModal = () => {
    const defaultDate = new Date().toISOString().slice(0, 10);
    const matched = activeStopFilter
      ? stopMap.get(activeStopFilter)
      : matchStopForDate(stops, defaultDate);
    setEditingMemoryId(null);
    setMemStopId(matched?.id);
    setMemStopAutoMatched(null);
    setMemTitle('');
    setMemNote('');
    setMemPlace(matched ? matched.cityName : '');
    setMemDate(defaultDate);
    setMemCapturedTime(undefined);
    setMemDateAutoDetected(false);
    setMemLat(undefined);
    setMemLng(undefined);
    setMemMood(MOOD_STICKERS[0]);
    setMemPhotoUri(undefined);
    setMemThumbUri(undefined);
    setMemoryModal(true);
  };

  const openEditMemoryModal = (m: Memory) => {
    setEditingMemoryId(m.id);
    setMemStopId(m.stopId);
    setMemStopAutoMatched(null);
    setMemTitle(m.title);
    setMemNote(m.note);
    setMemPlace(m.placeName || '');
    setMemDate(m.capturedAt.slice(0, 10) || trip.startDate);
    setMemCapturedTime(m.capturedAt.length >= 19 ? m.capturedAt.slice(11, 19) : undefined);
    setMemDateAutoDetected(false);
    setMemLat(m.lat);
    setMemLng(m.lng);
    setMemMood(m.moodSticker || MOOD_STICKERS[0]);
    setMemPhotoUri(m.photoUri);
    setMemThumbUri(m.thumbUri);
    setMemoryModal(true);
  };

  const handlePickMemoryPhoto = async (source: 'camera' | 'library') => {
    const res = await pickAndOptimizeMemoryPhoto(trip.id, source);
    if (res) {
      setMemPhotoUri(res.photoUri);
      setMemThumbUri(res.thumbUri);
      if (res.capturedAt) {
        const photoDay = res.capturedAt.slice(0, 10);
        setMemDate(photoDay);
        setMemCapturedTime(res.capturedAt.slice(11, 19));
        setMemDateAutoDetected(true);
        const matched = matchStopForDate(stops, photoDay);
        if (matched) {
          setMemStopId(matched.id);
          setMemStopAutoMatched(matched.cityName);
          if (!memPlace.trim()) setMemPlace(matched.cityName);
        } else {
          setMemStopAutoMatched(null);
        }
      } else {
        setMemDateAutoDetected(false);
        setMemStopAutoMatched(null);
      }
      if (res.lat !== undefined && res.lng !== undefined) {
        setMemLat(res.lat);
        setMemLng(res.lng);
      }
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const handleSaveMemory = async () => {
    if (!memTitle.trim() && !memNote.trim()) {
      Alert.alert('Add a quick note', 'Give your memory a title or short reflection!');
      return;
    }
    const cleanDate = memDate.trim() || new Date().toISOString().slice(0, 10);
    const timeSuffix = memCapturedTime || new Date().toISOString().slice(11, 19);
    const selectedStop = memStopId ? stopMap.get(memStopId) : undefined;
    const defaultPlace = selectedStop
      ? `${selectedStop.cityName}, ${trip.destinationCountry}`
      : `${trip.destinationCity}, ${trip.destinationCountry}`;

    if (editingMemoryId) {
      await editMemory(editingMemoryId, {
        stopId: memStopId ?? null,
        title: memTitle.trim() || `${selectedStop?.cityName || trip.destinationCity} Moment`,
        note: memNote.trim() || 'A favorite moment from the journey ✨',
        placeName: memPlace.trim() || defaultPlace,
        moodSticker: memMood,
        capturedAt: `${cleanDate}T${timeSuffix}`,
        photoUri: memPhotoUri ?? null,
        thumbUri: memThumbUri ?? null,
        illustrationKey: memPhotoUri ? null : 'torii',
      });
    } else {
      addMemory({
        id: generateId('mem'),
        tripId: trip.id,
        stopId: memStopId,
        title: memTitle.trim() || `${selectedStop?.cityName || trip.destinationCity} Moment`,
        note: memNote.trim() || 'A favorite moment from the journey ✨',
        capturedAt: `${cleanDate}T${timeSuffix}`,
        placeName: memPlace.trim() || defaultPlace,
        lat: memLat,
        lng: memLng,
        photoUri: memPhotoUri,
        thumbUri: memThumbUri,
        illustrationKey: memPhotoUri ? undefined : 'torii',
        moodSticker: memMood,
        isHighlight: false,
        authorName: profile?.displayName.split(' ')[0] || 'You',
        createdAt: new Date().toISOString(),
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditingMemoryId(null);
    setMemStopId(undefined);
    setMemStopAutoMatched(null);
    setMemTitle('');
    setMemNote('');
    setMemPlace('');
    setMemPhotoUri(undefined);
    setMemThumbUri(undefined);
    setMemoryModal(false);
  };

  const handleDeleteMemory = (m: Memory) => {
    Alert.alert(
      `Delete "${m.title}"?`,
      'This permanently deletes this memory and its photo from local app storage and your cloud backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeMemory(m.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          },
        },
      ]
    );
  };

  // --- EXPENSES ---
  const openExpenseModal = (presetCategory: ExpenseCategory = 'dining') => {
    setExpMerchant('');
    setExpAmount('');
    setExpCurrency(defaultManualCurrency);
    setExpDate(new Date().toISOString().slice(0, 10));
    setExpCategory(presetCategory);
    setExpIsShared(false);
    setExpenseModal(true);
  };

  const handleSaveExpense = () => {
    const amt = parseFloat(expAmount);
    if (!expMerchant.trim() || Number.isNaN(amt) || amt <= 0) {
      Alert.alert('Check expense', 'Enter a merchant name and valid amount.');
      return;
    }
    const cleanCurr = expCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cleanCurr)) {
      Alert.alert('Pick a Currency', 'Tap a currency chip or enter a 3-letter code (e.g. INR, EUR, PLN).');
      return;
    }
    const cleanExpDate = expDate.trim() || new Date().toISOString().slice(0, 10);
    const { converted, rate } = convertCurrency(amt, cleanCurr, preferredCurrency, fxRates);
    addExpense({
      id: generateId('exp'),
      tripId: trip.id,
      merchant: expMerchant.trim(),
      category: expCategory,
      localAmount: amt,
      localCurrency: cleanCurr,
      homeAmount: converted,
      homeCurrency: preferredCurrency,
      fxRateUsed: rate,
      expenseDate: cleanExpDate,
      fxDate: resolveDefaultFxDate(cleanExpDate),
      isShared: isCollab ? expIsShared : false,
      authorId: profile?.id,
      authorName: profile?.displayName,
      createdAt: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setExpMerchant('');
    setExpAmount('');
    setExpIsShared(false);
    setExpenseModal(false);
  };

  const openFxRateModal = (item: SpendLedgerItem) => {
    setFxEditItem(item);
    setFxEditDate(item.fxDate || resolveDefaultFxDate(item.date));
    setFxEditPayLater(Boolean(item.payLater));
  };

  const handleSaveFxRateDate = () => {
    if (!fxEditItem) return;
    const cleanDate = fxEditDate.trim().slice(0, 10) || resolveDefaultFxDate(fxEditItem.date);
    updateSpendItemFxDate(
      fxEditItem.source,
      fxEditItem.id,
      fxEditPayLater ? null : cleanDate,
      fxEditPayLater
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setFxEditItem(null);
  };

  const handleDeleteExpense = (expenseId: string, merchant: string) => {
    Alert.alert(
      `Delete "${merchant}"?`,
      'Removes this expense and any attached receipt from this device and cloud backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeExpense(expenseId);
          },
        },
      ]
    );
  };

  // --- FLIGHTS, TRANSPORTS & STAYS ---
  const openManualFlightModal = (initialMode: 'flight' | 'transport' = 'flight') => {
    setEditingTransport(null);
    setTravelModalMode(initialMode);
    setFlightDraft(
      createEmptyFlightDraft(trip.startDate, trip.endDate, preferredCurrency, trip.destinationCity)
    );
    setTransportDraft({
      mode: 'train',
      title: '',
      operatorName: '',
      origin: '',
      destination: trip.destinationCity,
      startDate: trip.startDate,
      endDate: trip.endDate,
      referenceCode: '',
      seatOrVehicle: '',
      distanceInput: '',
      costAmount: '',
      currency: preferredCurrency,
      payLater: false,
      notes: '',
    });
    setFlightModal(true);
  };

  const openEditTransportModal = (t: TransportLeg) => {
    setEditingTransport(t);
    setTravelModalMode('transport');
    const distInUnit =
      t.distanceKm && t.distanceKm > 0
        ? String(formatDistanceValue(t.distanceKm, distanceUnit))
        : '';
    setTransportDraft({
      mode: t.mode,
      title: t.title || '',
      operatorName: t.operatorName || '',
      origin: t.origin || '',
      destination: t.destination || '',
      startDate: t.startDate || trip.startDate,
      endDate: t.endDate || '',
      referenceCode: t.referenceCode || '',
      seatOrVehicle: t.seatOrVehicle || '',
      distanceInput: distInUnit,
      costAmount: t.costAmount && t.costAmount > 0 ? String(t.costAmount) : '',
      currency: t.currency || preferredCurrency,
      payLater: Boolean(t.payLater),
      notes: t.notes || '',
    });
    setFlightModal(true);
  };

  const handleSaveTransport = () => {
    if (
      !transportDraft.origin.trim() &&
      !transportDraft.destination.trim() &&
      !transportDraft.title.trim()
    ) {
      Alert.alert(
        'Add route or title',
        'Enter at least an origin, destination, or transport name.'
      );
      return;
    }
    const modeMeta = TRANSPORT_MODE_META[transportDraft.mode];
    const costNum = parseFloat(transportDraft.costAmount) || 0;
    const tCurr = (transportDraft.currency || preferredCurrency).toUpperCase();
    const { converted: homeCost } =
      costNum > 0
        ? convertCurrency(costNum, tCurr, preferredCurrency, fxRates)
        : { converted: 0 };
    const distVal = parseFloat(transportDraft.distanceInput);
    const distanceKm =
      !Number.isNaN(distVal) && distVal > 0
        ? convertToKm(distVal, distanceUnit)
        : undefined;
    const trnStartDate = transportDraft.startDate.trim() || trip.startDate;
    const preservedFxDate =
      costNum > 0 && !transportDraft.payLater
        ? editingTransport?.fxDate || resolveDefaultFxDate(trnStartDate)
        : undefined;

    const payload: TransportLeg = {
      id: editingTransport ? editingTransport.id : generateId('trn'),
      tripId: trip.id,
      mode: transportDraft.mode,
      title:
        transportDraft.title.trim() ||
        `${modeMeta.label} to ${transportDraft.destination.trim() || trip.destinationCity}`,
      operatorName: transportDraft.operatorName.trim() || undefined,
      referenceCode: transportDraft.referenceCode.trim().toUpperCase() || undefined,
      origin: transportDraft.origin.trim() || 'Start',
      destination: transportDraft.destination.trim() || trip.destinationCity,
      startDate: trnStartDate,
      endDate: transportDraft.endDate.trim() || undefined,
      seatOrVehicle: transportDraft.seatOrVehicle.trim() || undefined,
      distanceKm,
      costAmount: costNum > 0 ? costNum : undefined,
      currency: costNum > 0 ? tCurr : undefined,
      homeCost: costNum > 0 ? homeCost : undefined,
      fxDate: preservedFxDate,
      payLater: costNum > 0 ? Boolean(transportDraft.payLater) : false,
      notes: transportDraft.notes.trim() || undefined,
      createdAt: editingTransport ? editingTransport.createdAt : new Date().toISOString(),
    };

    if (editingTransport) {
      editTransport(payload);
    } else {
      addTransport(payload);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditingTransport(null);
    setFlightModal(false);
  };

  const handleDeleteTransport = (transportId: string, label: string) => {
    Alert.alert(`Remove "${label}"?`, 'Removes this travel leg from your journey timeline.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeTransport(transportId) },
    ]);
  };

  const handleSaveManualFlight = () => {
    if (!hasAnyFlightDraftData(flightDraft)) {
      Alert.alert(
        'Add at least one flight detail',
        'Enter a flight number, airline, origin/destination, or PNR — even partial info works!'
      );
      return;
    }
    const outbound = buildManualFlight({
      tripId: trip.id,
      flightNumber: flightDraft.flightNumber,
      airlineName: flightDraft.airlineName,
      originInput: flightDraft.originInput,
      destInput: flightDraft.destInput,
      flightDate: flightDraft.flightDate || trip.startDate,
      departureTimeHm: flightDraft.departureTimeHm,
      arrivalTimeHm: flightDraft.arrivalTimeHm,
      cabinClass: flightDraft.cabinClass,
      seat: flightDraft.seat,
      pnr: flightDraft.pnr,
      terminal: flightDraft.terminal,
      gate: flightDraft.gate,
      aircraft: flightDraft.aircraft,
      milesEarned: flightDraft.milesEarned,
      frequentFlyerNumber: flightDraft.frequentFlyerNumber,
      fallbackDestCity: trip.destinationCity,
    });
    addFlight(outbound);

    if (flightDraft.addReturnFlight) {
      const ret = buildReturnFlight(
        outbound,
        flightDraft.returnDate || trip.endDate,
        flightDraft.returnFlightNumber
      );
      addFlight(ret);
    }

    const priceNum = parseFloat(flightDraft.ticketPrice);
    if (!Number.isNaN(priceNum) && priceNum > 0) {
      const curr = (flightDraft.ticketCurrency || preferredCurrency).toUpperCase();
      const { converted, rate } = convertCurrency(priceNum, curr, preferredCurrency, fxRates);
      const depDate = outbound.departureTime.slice(0, 10);
      addExpense({
        id: generateId('exp'),
        tripId: trip.id,
        merchant: `${outbound.airlineName} (${outbound.flightNumber})`,
        category: 'flights',
        localAmount: priceNum,
        localCurrency: curr,
        homeAmount: converted,
        homeCurrency: preferredCurrency,
        fxRateUsed: rate,
        expenseDate: depDate,
        fxDate: resolveDefaultFxDate(depDate),
        createdAt: new Date().toISOString(),
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setFlightModal(false);
  };

  const handleDeleteFlight = (flightId: string, label: string) => {
    Alert.alert(`Remove flight ${label}?`, 'Removes this flight from your trip bookings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeFlight(flightId) },
    ]);
  };

  const openEditFlightModal = (f: Flight) => {
    setEditingFlightId(f.id);
    setEditFltNum(f.flightNumber);
    setEditFltOrigin(f.originIata);
    setEditFltDest(f.destIata);
    setEditFltDate(f.departureTime.slice(0, 10));
    const rawHm = f.departureTime.length >= 16 ? f.departureTime.slice(11, 16) : '';
    setEditFltTime(rawHm && rawHm !== '00:00' ? rawHm : '');
    setEditFltPnr(f.pnr || '');
    setEditFltSeat(f.seat || '');
    setEditFltCabin(f.cabinClass || 'Economy');
    setEditFlightModal(true);
  };

  const handleSaveEditedFlight = () => {
    if (!editingFlightId) return;
    const existing = flights.find((f) => f.id === editingFlightId);
    if (!existing) return;

    const cleanDate = editFltDate.trim() || existing.departureTime.slice(0, 10);
    const trimmedTime = editFltTime.trim();
    let hm = '00:00';
    if (trimmedTime) {
      const m = trimmedTime.match(/^(\d{1,2}):(\d{2})$/);
      const h = m ? parseInt(m[1], 10) : -1;
      const min = m ? parseInt(m[2], 10) : -1;
      if (!m || h < 0 || h > 23 || min < 0 || min > 59) {
        Alert.alert('Invalid Time', 'Enter departure time in 24-hour HH:MM format (e.g. 22:00 or 06:45), or leave blank.');
        return;
      }
      hm = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }

    const cleanOrigin = (editFltOrigin.trim() || existing.originIata).toUpperCase().slice(0, 3);
    const cleanDest = (editFltDest.trim() || existing.destIata).toUpperCase().slice(0, 3);
    const originAp = lookupAirport(cleanOrigin);
    const destAp = lookupAirport(cleanDest);
    const distanceMiles =
      originAp && destAp
        ? calculateDistanceMiles(originAp.lat, originAp.lng, destAp.lat, destAp.lng)
        : existing.distanceMiles;
    const durationMinutes =
      originAp && destAp
        ? estimateFlightDurationMinutes(distanceMiles)
        : existing.durationMinutes;

    const cleanFlightNum = editFltNum.trim().toUpperCase() || existing.flightNumber;
    const carrierMatch = cleanFlightNum.match(/^([A-Z0-9]{2})\s*[-]?\s*(\d{1,4})/);
    const alInfo = carrierMatch ? lookupAirline(carrierMatch[1]) : null;

    const depIso = `${cleanDate}T${hm}:00`;
    const depObj = new Date(`${depIso}Z`);
    let arrIso = depIso;
    if (!Number.isNaN(depObj.getTime())) {
      depObj.setUTCMinutes(depObj.getUTCMinutes() + Math.max(30, durationMinutes || 120));
      arrIso = depObj.toISOString().slice(0, 19);
    }

    editFlight(editingFlightId, {
      airlineCode: alInfo?.code ?? existing.airlineCode,
      airlineName: alInfo?.name ?? existing.airlineName,
      flightNumber: cleanFlightNum,
      pnr: editFltPnr.trim().toUpperCase() || undefined,
      originIata: cleanOrigin,
      originCity: originAp?.city ?? (cleanOrigin === existing.originIata ? existing.originCity : cleanOrigin),
      destIata: cleanDest,
      destCity: destAp?.city ?? (cleanDest === existing.destIata ? existing.destCity : cleanDest),
      departureTime: depIso,
      arrivalTime: arrIso,
      durationMinutes,
      distanceMiles,
      milesEarned: distanceMiles,
      loyaltyProgram: alInfo?.loyaltyProgram ?? existing.loyaltyProgram,
      seat: editFltSeat.trim().toUpperCase() || undefined,
      cabinClass: editFltCabin.trim() || undefined,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEditFlightModal(false);
    setEditingFlightId(null);
  };

  const openManualStayModal = () => {
    setEditingStayId(null);
    setStayName('');
    setStayType('hotel');
    setStayCheckIn(trip.startDate);
    setStayCheckOut(trip.endDate);
    setStayConf('');
    setStayAddress('');
    setStayCost('');
    setStayCurrency(preferredCurrency);
    setStayPoints('');
    setStayPointsProg('');
    setStayPayLater(false);
    setStayNotes('');
    setStayModal(true);
  };

  const openEditStayModal = (s: Stay) => {
    setEditingStayId(s.id);
    setStayName(s.name);
    setStayType(s.stayType);
    setStayCheckIn(s.checkIn);
    setStayCheckOut(s.checkOut);
    setStayConf(s.confirmationCode || '');
    setStayAddress(s.address || '');
    setStayCost(s.costCash > 0 ? String(s.costCash) : '');
    setStayCurrency(s.currency || preferredCurrency);
    setStayPoints(s.pointsRedeemed > 0 ? String(s.pointsRedeemed) : '');
    setStayPointsProg(s.pointsProgram || '');
    setStayPayLater(Boolean(s.payLater));
    setStayNotes(s.notes || '');
    setStayModal(true);
  };

  const handleSaveManualStay = () => {
    if (!stayName.trim()) {
      Alert.alert('Add stay name', 'Enter the hotel, Airbnb, or resort name.');
      return;
    }
    const checkIn = stayCheckIn.trim() || trip.startDate;
    const checkOut = stayCheckOut.trim() || trip.endDate;
    const d1 = new Date(`${checkIn}T00:00:00Z`).getTime();
    const d2 = new Date(`${checkOut}T00:00:00Z`).getTime();
    const nights =
      !Number.isNaN(d1) && !Number.isNaN(d2)
        ? Math.max(1, Math.round((d2 - d1) / 86400000))
        : 1;
    const cash = parseFloat(stayCost) || 0;
    const curr = (stayCurrency || preferredCurrency).toUpperCase();
    const { converted } = convertCurrency(cash, curr, preferredCurrency, fxRates);
    const pts = parseInt(stayPoints.replace(/[^0-9]/g, ''), 10) || 0;

    const existing = editingStayId ? stays.find((s) => s.id === editingStayId) : undefined;
    const nextFxDate =
      cash > 0 && !stayPayLater
        ? existing?.fxDate || resolveDefaultFxDate(checkIn)
        : undefined;

    const payload: Stay = {
      id: existing ? existing.id : generateId('stay'),
      tripId: trip.id,
      name: stayName.trim(),
      stayType,
      address: stayAddress.trim() || undefined,
      confirmationCode: stayConf.trim().toUpperCase() || undefined,
      checkIn,
      checkOut,
      nights,
      costCash: cash,
      currency: curr,
      homeCost: converted,
      fxDate: nextFxDate,
      payLater: cash > 0 ? stayPayLater : false,
      pointsRedeemed: pts,
      pointsProgram: stayPointsProg.trim() || undefined,
      cashValueEstimate: existing?.cashValueEstimate,
      receiptUri: existing?.receiptUri,
      notes: stayNotes.trim() || undefined,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };

    if (existing) {
      editStay(payload);
    } else {
      addStay(payload);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setStayModal(false);
    setEditingStayId(null);
  };

  const handleDeleteStay = (stayId: string, name: string) => {
    Alert.alert(`Remove "${name}"?`, 'Removes this stay from your trip bookings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeStay(stayId) },
    ]);
  };

  const handleDeleteTrip = () => {
    Alert.alert(
      `Delete "${trip.title}"?`,
      'This permanently deletes this trip, all linked flights, stays, expenses, and memory photos from this device and cloud backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Trip',
          style: 'destructive',
          onPress: async () => {
            await removeTrip(trip.id);
            onBack();
          },
        },
      ]
    );
  };

  const handleInviteBuddy = () => {
    const buddy = inviteEmail.trim();
    if (!buddy) return;
    const normKey = normalizeCoTravelerKey(buddy);
    const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
    const existingMatch = trip.coTravelers.find((c) => normalizeCoTravelerKey(c) === normKey);
    const nextList = existingMatch ? trip.coTravelers : [...trip.coTravelers, buddy];
    const nextRoles: Record<string, CoTravelerRole> = {
      ...(trip.coTravelerRoles ?? {}),
      [normKey]: inviteRole,
    };
    saveTripSharing(trip.id, true, nextList, token, nextRoles);
    setInviteEmail('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert(
      'Co-Traveler Added 🤝',
      `${buddy} now has ${inviteRole === 'viewer' ? 'Viewer (read-only)' : 'Editor'} access to "${trip.title}". Once Cloud Sync is connected, they'll see this trip automatically on Google Sign-In.`
    );
  };

  const handleToggleBuddyRole = (member: string) => {
    if (!isOwner) return;
    const normKey = normalizeCoTravelerKey(member);
    const current = getCoTravelerRole(trip, member);
    const nextRole: CoTravelerRole = current === 'editor' ? 'viewer' : 'editor';
    const nextRoles: Record<string, CoTravelerRole> = {
      ...(trip.coTravelerRoles ?? {}),
      [normKey]: nextRole,
    };
    const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
    saveTripSharing(trip.id, trip.coTravelers.length > 0, trip.coTravelers, token, nextRoles);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleRemoveBuddy = (member: string) => {
    if (!isOwner) return;
    const normKey = normalizeCoTravelerKey(member);
    const nextList = trip.coTravelers.filter((c) => normalizeCoTravelerKey(c) !== normKey);
    const nextRoles: Record<string, CoTravelerRole> = { ...(trip.coTravelerRoles ?? {}) };
    delete nextRoles[normKey];
    const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
    saveTripSharing(trip.id, nextList.length > 0, nextList, token, nextRoles);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const handleSharePostcard = async () => {
    if (sharingPostcard) return;
    setSharingPostcard(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      // Pure one-off postcard share: never stores history and never marks the trip as collaborative
      const photoMemories = memories.filter((m) => Boolean(m.photoUri));
      const sortedForCollage = photoMemories.slice(0, 4);

      const routeStatsCaption = generateOfflineIgCaption({
        trip,
        memories: sortedForCollage.length > 0 ? sortedForCollage : memories,
        flights,
        transports,
        distanceUnit,
        tone: 'stats',
        includeHashtags: false,
        includeWatermarkTag: false,
      });

      // No photo memories yet -> share clean text travelogue immediately without rendering a blank image
      if (sortedForCollage.length === 0) {
        await Share.share({
          title: `${trip.title} ${trip.flagEmoji} — Wanderer's Ledger Postcard`,
          message: routeStatsCaption,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return;
      }

      // Measure natural photo dimensions for smart layout & face-friendly framing
      const dimsMap: Record<string, ImageDimensions> = {};
      await Promise.all(
        sortedForCollage.map(
          (m) =>
            new Promise<void>((resolve) => {
              if (!m.photoUri) {
                resolve();
                return;
              }
              const timeout = setTimeout(resolve, 700);
              Image.getSize(
                m.photoUri,
                (width, height) => {
                  clearTimeout(timeout);
                  if (width > 0 && height > 0) dimsMap[m.photoUri!] = { width, height };
                  resolve();
                },
                () => {
                  clearTimeout(timeout);
                  resolve();
                }
              );
            })
        )
      );

      // Pick orientation-aware collage layout & gentle top-bias for portrait photos so faces stay clear
      const firstUri = sortedForCollage[0]?.photoUri;
      const firstDims = firstUri ? dimsMap[firstUri] : undefined;
      const firstIsPortrait = firstDims ? firstDims.height > firstDims.width * 1.05 : false;

      let smartLayout: CollageLayoutId = 'single';
      if (sortedForCollage.length === 2) {
        smartLayout = firstIsPortrait ? 'side_by_side' : 'stacked';
      } else if (sortedForCollage.length === 3) {
        smartLayout = firstIsPortrait ? 'portrait_left' : 'hero_top';
      } else if (sortedForCollage.length >= 4) {
        smartLayout = 'grid_2x2';
      }

      const smartCrops: Record<string, PhotoCrop> = {};
      sortedForCollage.forEach((m) => {
        const d = m.photoUri ? dimsMap[m.photoUri] : undefined;
        if (d && d.height > d.width * 1.05) {
          // Slight top bias keeps faces in frame on portrait shots inside horizontal slots
          smartCrops[m.id] = { offsetX: 0, offsetY: 0.38, zoom: 1 };
        }
      });

      // Render crisp 1080x1350 postcard collage behind the UI and wait for every photo to decode
      const readyPromise = new Promise<void>((resolve) => {
        postcardReadyResolverRef.current = resolve;
      });
      setPostcardRenderJob({
        jobKey: `postcard_${trip.id}_${Date.now()}`,
        memories: sortedForCollage,
        layout: smartLayout,
        imageDims: dimsMap,
        photoCrops: smartCrops,
      });

      await readyPromise;
      await new Promise((r) => setTimeout(r, 45));

      const imageUri = await postcardShotRef.current?.capture();
      if (!imageUri) {
        throw new Error('Could not render postcard collage.');
      }

      await shareImageWithCaption({
        imageUri,
        caption: routeStatsCaption,
        title: `${trip.title} ${trip.flagEmoji} — Wanderer's Ledger Postcard`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to share postcard.';
      Alert.alert('Share Error', msg);
    } finally {
      setPostcardRenderJob(null);
      postcardReadyResolverRef.current = null;
      setSharingPostcard(false);
    }
  };

  const handleExportKeepsakePdf = async (config: KeepsakeExportConfig) => {
    if (exportingKeepsakePdf) return;
    setExportingKeepsakePdf(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await exportTripKeepsakePdf({
        trip,
        flights,
        transports,
        stops,
        stays,
        memories,
        distanceUnit,
        templateId: config.templateId,
        coverPhotoUriOverride: config.coverPhotoUri,
        coverDimensions: config.coverDimensions,
        coverCrop: config.coverCrop,
      });
      setKeepsakeStudioOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate keepsake PDF.';
      Alert.alert('Keepsake PDF Error', msg);
    } finally {
      setExportingKeepsakePdf(false);
    }
  };

  const handleRefreshFlightInfo = async (f: Flight) => {
    if (refreshingFlightId) return;
    setRefreshingFlightId(f.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const flightDate = f.departureTime.slice(0, 10) || trip.startDate;
      const result = await enrichFlightDetails({
        kind: 'boarding_pass',
        passengerName: profile?.displayName || 'Traveler',
        pnr: f.pnr || '',
        originIata: f.originIata,
        destIata: f.destIata,
        airlineCode: f.airlineCode,
        airlineName: f.airlineName,
        flightNumber: f.flightNumber,
        flightDate,
        cabinClass: f.cabinClass || 'Economy',
        seat: f.seat || '',
        distanceMiles: f.distanceMiles,
        estimatedDurationMin: f.durationMinutes || 120,
        loyaltyProgram: f.loyaltyProgram || '',
        rawBarcode: f.rawBarcode || '',
      });

      if (result.enrichedOnline) {
        editFlight(f.id, {
          airlineCode: f.airlineCode,
          airlineName: f.airlineName,
          flightNumber: f.flightNumber,
          pnr: f.pnr,
          originIata: f.originIata,
          originCity: f.originCity,
          destIata: f.destIata,
          destCity: f.destCity,
          departureTime: result.departureTime || f.departureTime,
          arrivalTime: result.arrivalTime || f.arrivalTime,
          durationMinutes: result.durationMinutes || f.durationMinutes,
          distanceMiles: f.distanceMiles,
          milesEarned: f.milesEarned,
          loyaltyProgram: f.loyaltyProgram,
          seat: f.seat,
          cabinClass: f.cabinClass,
          terminal: result.terminal,
          gate: result.gate,
          aircraft: result.aircraft,
          status: result.status,
          enrichedOnline: true,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          `${f.flightNumber} Updated ✈️`,
          [
            result.terminal ? `Terminal ${result.terminal}` : '',
            result.gate ? `Gate ${result.gate}` : '',
            result.aircraft ? `Aircraft: ${result.aircraft}` : '',
            `Status: ${result.status}`,
          ]
            .filter(Boolean)
            .join(' • ')
        );
      } else {
        Alert.alert(
          'Offline Schedule Active ✈️',
          `Live terminal/gate lookup will activate automatically once Cloud Sync (enrich-flight) is connected. Your offline schedule for ${f.flightNumber} is saved and ready.`
        );
      }
    } catch {
      Alert.alert('Flight Refresh', 'Could not fetch live flight details right now.');
    } finally {
      setRefreshingFlightId(null);
    }
  };

  const postcardExportCanvasWidth = computeNativeExportCanvasWidth(PixelRatio.get());

  return (
    <View style={styles.screenHost}>
      {/* OFFSCREEN 1080P AUTO-POSTCARD COLLAGE RENDERER (mounted only while sharing) */}
      {postcardRenderJob ? (
        <View
          pointerEvents="none"
          collapsable={false}
          style={styles.offscreenPostcardHost}
        >
          <CanvasImageLoadScope
            key={postcardRenderJob.jobKey}
            jobKey={postcardRenderJob.jobKey}
            onAllLoaded={handlePostcardImagesReady}
          >
            <ViewShot
              ref={postcardShotRef}
              options={{
                format: 'png',
                quality: 1,
                result: 'tmpfile',
                width: 1080,
                height: 1350,
              }}
            >
              <IgSingleCanvas
                trip={trip}
                memories={postcardRenderJob.memories}
                flights={flights}
                transports={transports}
                distanceUnit={distanceUnit}
                format="feed"
                template="postcard"
                showWatermark
                canvasWidth={postcardExportCanvasWidth}
                layout={postcardRenderJob.layout}
                paletteId="sunlit"
                showPostcardNote
                photoCrops={postcardRenderJob.photoCrops}
                imageDims={postcardRenderJob.imageDims}
              />
            </ViewShot>
          </CanvasImageLoadScope>
        </View>
      ) : null}

      <View style={styles.root}>
      {/* Top Scenic Postcard Header */}
      <View style={styles.topHeader}>
        <DestinationBanner vibe={trip.vibe} coverPhotoUri={trip.coverPhotoUri} height={162} />
        <LinearGradient
          colors={['rgba(0,0,0,0.48)', 'transparent', 'rgba(0,0,0,0.68)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerNavRow}>
          <TouchableOpacity onPress={onBack} style={styles.glassBtn} activeOpacity={0.85}>
            <Text style={styles.glassBtnText}>{`← ${backLabel}`}</Text>
          </TouchableOpacity>
          <View style={styles.headerRightActions}>
            {FEATURE_FLAGS.CLOUD_COLLAB_ENABLED && (
              <TouchableOpacity
                onPress={() => setShareModal(true)}
                style={styles.glassBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.glassBtnText}>
                  👥{trip.coTravelers.length > 0 ? ` ${trip.coTravelers.length}` : ''}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleSharePostcard}
              disabled={sharingPostcard}
              style={[styles.shareGlassBtn, sharingPostcard && { opacity: 0.72 }]}
              activeOpacity={0.85}
            >
              {sharingPostcard ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.shareGlassText}>📮 Postcard</Text>
              )}
            </TouchableOpacity>
            {!isViewer && (
              <TouchableOpacity onPress={openEditTripModal} style={styles.iconGlassBtn} activeOpacity={0.85}>
                <Text style={styles.glassBtnText}>✏️</Text>
              </TouchableOpacity>
            )}
            {isOwner && (
              <TouchableOpacity onPress={handleDeleteTrip} style={styles.iconGlassBtn} activeOpacity={0.85}>
                <Text style={styles.glassBtnText}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.headerBottomText}>
          <Text style={styles.tripTitle} numberOfLines={1}>
            {formatTripTitleWithFlags(
              trip.title,
              tripGeo.visitedCountries.length > 0 ? tripGeo.flagsLabel : trip.flagEmoji
            )}
          </Text>
          <Text style={styles.tripDates} numberOfLines={1}>
            {tripGeo.visitedCountries.length > 0 ? `${tripGeo.countriesLabel} • ` : ''}
            {trip.startDate} → {trip.endDate}
            {!isViewer ? ` • ${formatMoney(fullSpendLedger.totalSpentPreferred, preferredCurrency)}` : ''} •{' '}
            {formatDistance(summary.totalDistanceKm, distanceUnit)}
          </Text>
        </View>
      </View>

      {/* Focused Tabs: 📸 Memories | 🧭 Bookings | 🧾 Spend (Spend hidden for Viewers) */}
      <View style={styles.tabsWrap}>
        <TabPill
          active={tab === 'memories'}
          label={`📸 Memories (${memories.length})`}
          onPress={() => setTab('memories')}
        />
        <TabPill
          active={tab === 'bookings'}
          label={`🧭 Bookings (${flights.length + transports.length + stays.length})`}
          onPress={() => setTab('bookings')}
        />
        {!isViewer && (
          <TabPill
            active={tab === 'spend'}
            label={`🧾 Spend (${fullSpendLedger.items.length})`}
            onPress={() => setTab('spend')}
          />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* TAB 1: CLEAN POLAROID MEMORIES TIMELINE (ZERO RECEIPT CLUTTER) */}
        {tab === 'memories' && (
          <View style={styles.sectionGap}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.subHeading}>✨ Polaroid Travelogue</Text>
                <Text style={styles.tinyNote}>Photos & notes only — receipts stay in Spend</Text>
              </View>
              <TouchableOpacity
                onPress={openAddMemoryModal}
                style={styles.actionPill}
                activeOpacity={0.85}
              >
                <Text style={styles.actionPillText}>+ Memory</Text>
              </TouchableOpacity>
            </View>

            {/* Stop / Hop Filter Strip (shown when trip has multi-hop stops) */}
            {stops.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
              >
                <TouchableOpacity
                  onPress={() => setSelectedStopFilterId(null)}
                  style={[
                    styles.stopFilterPill,
                    activeStopFilter === null && styles.stopFilterPillActive,
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.stopFilterText,
                      activeStopFilter === null && styles.stopFilterTextActive,
                    ]}
                  >
                    All ({memories.length})
                  </Text>
                </TouchableOpacity>
                {stops.map((s) => {
                  const count = memories.filter((m) => m.stopId === s.id).length;
                  const active = activeStopFilter === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => setSelectedStopFilterId(active ? null : s.id)}
                      style={[
                        styles.stopFilterPill,
                        active && styles.stopFilterPillActive,
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.stopFilterText,
                          active && styles.stopFilterTextActive,
                        ]}
                      >
                        📍 {s.cityName} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Show Create Instagram Post CTA only once at least one memory exists */}
            {memories.length > 0 && (
              <TouchableOpacity
                onPress={() => onOpenIgStudio(trip.id)}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#F58529', '#DD2A7B', '#8134AF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.igBannerBtn}
                >
                  <View style={styles.igLogoCircle}>
                    <InstagramIcon size={20} variant="white" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.igBannerTitle}>Create Instagram Post</Text>
                    <Text style={styles.igBannerSub} numberOfLines={1}>
                      Collages, Story cards, Carousels & draft captions ✨
                    </Text>
                  </View>
                  <Text style={styles.igBannerArrow}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Printable Trip Keepsake PDF (100% offline, strictly excludes expenses & receipts) */}
            {(memories.length > 0 || timelineItems.length > 0) && (
              <TouchableOpacity
                onPress={() => setKeepsakeStudioOpen(true)}
                disabled={exportingKeepsakePdf}
                style={[styles.keepsakeBannerBtn, exportingKeepsakePdf && { opacity: 0.72 }]}
                activeOpacity={0.88}
              >
                <View style={styles.keepsakeIconCircle}>
                  {exportingKeepsakePdf ? (
                    <ActivityIndicator size="small" color={colors.coralDark} />
                  ) : (
                    <Text style={{ fontSize: 18 }}>📖</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.keepsakeBannerTitle}>
                    {exportingKeepsakePdf
                      ? 'Crafting Keepsake PDF…'
                      : 'Keepsake Magazine PDF'}
                  </Text>
                  <Text style={styles.keepsakeBannerSub} numberOfLines={1}>
                    3 cover styles • drag &amp; zoom cover • zero spend shown
                  </Text>
                </View>
                <Text style={styles.keepsakeBannerArrow}>↗</Text>
              </TouchableOpacity>
            )}

            {memories.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 32 }}>📸</Text>
                <Text style={styles.emptyTitle}>No memories captured yet!</Text>
                <Text style={styles.emptySub}>
                  Add your first photo & note to start your travelogue and unlock Instagram Post Studio for collages, stories & carousels.
                </Text>
                <TouchableOpacity
                  onPress={openAddMemoryModal}
                  style={styles.emptyBtn}
                  activeOpacity={0.88}
                >
                  <Text style={styles.emptyBtnText}>📸 Capture First Memory</Text>
                </TouchableOpacity>
              </View>
            ) : visibleMemories.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 28 }}>📍</Text>
                <Text style={styles.emptyTitle}>No memories in this stop yet</Text>
                <Text style={styles.emptySub}>
                  Tap "+ Memory" to add a Polaroid for {stopMap.get(activeStopFilter!)?.cityName}, or switch back to All.
                </Text>
              </View>
            ) : (
              visibleMemories.map((m, idx) => {
                const taggedStop = m.stopId ? stopMap.get(m.stopId) : undefined;
                const stopCity = taggedStop?.cityName?.trim() || '';
                const rawPlace = m.placeName?.trim() || '';
                const isSameAsStop =
                  !!stopCity &&
                  !!rawPlace &&
                  rawPlace.toLowerCase() === stopCity.toLowerCase();
                const displayPlace =
                  stopCity && rawPlace.toLowerCase().startsWith(`${stopCity.toLowerCase()},`)
                    ? rawPlace.slice(stopCity.length + 1).trim()
                    : rawPlace;
                const showSeparatePlace = !!displayPlace && !isSameAsStop;
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.polaroidCard,
                      { transform: [{ rotate: idx % 2 === 0 ? '-0.6deg' : '0.6deg' }] },
                    ]}
                  >
                    <View style={styles.tapeStrip} />
                    <MemoryIllustration
                      photoUri={m.photoUri}
                      illustrationKey={m.illustrationKey}
                      height={175}
                    />
                    <View style={styles.polaroidBody}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.polaroidTitle}>{m.title}</Text>
                        <Text style={styles.polaroidDate}>{m.capturedAt.slice(0, 10)}</Text>
                      </View>
                      {stopCity || showSeparatePlace ? (
                        <View style={styles.polaroidMetaRow}>
                          {stopCity ? (
                            <View style={styles.stopTagBadge}>
                              <Text style={styles.stopTagEmoji}>📍</Text>
                              <Text style={styles.stopTagBadgeText} numberOfLines={1}>
                                {stopCity}
                              </Text>
                            </View>
                          ) : null}
                          {showSeparatePlace ? (
                            <Text style={styles.polaroidPlace} numberOfLines={1}>
                              {stopCity ? displayPlace : `📍 ${displayPlace}`}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      <Text style={styles.polaroidNote}>{m.note}</Text>
                      <View style={styles.polaroidFooter}>
                        <View style={styles.moodTag}>
                          <Text style={styles.moodTagText}>{m.moodSticker}</Text>
                        </View>
                        <View style={styles.memoryActionGroup}>
                          {m.authorName ? (
                            <Text style={styles.authorTag}>by {m.authorName}</Text>
                          ) : null}
                          <TouchableOpacity
                            onPress={() => openEditMemoryModal(m)}
                            style={styles.memEditPill}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.editAction}>✏️ Edit</Text>
                          </TouchableOpacity>
                          {m.photoUri && (
                            <TouchableOpacity
                              onPress={() => {
                                setTripCoverPhoto(trip.id, m.photoUri!);
                                Alert.alert('Trip Cover Updated ⭐', 'Your postcard banner now shows this memory!');
                              }}
                              style={styles.memActionPill}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.coverAction}>⭐ Cover</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => handleDeleteMemory(m)}
                            style={styles.memDeletePill}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.deleteAction}>🗑️ Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: MULTI-HOP STOPS & CHRONOLOGICAL JOURNEY TIMELINE */}
        {tab === 'bookings' && (
          <View style={styles.sectionGap}>
            {/* Trip Stops / Multi-Hop Strip */}
            <View style={styles.stopsCard}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopsTitle}>🗺️ Trip Stops / Hops</Text>
                  <Text style={styles.tinyNote}>
                    Optional — tag multi-city hops & auto-match memory photos by date
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openAddStopModal}
                  style={styles.actionPillSoft}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionPillSoftText}>+ Stop</Text>
                </TouchableOpacity>
              </View>

              {routeTrail ? (
                <View style={styles.routeTrailBox}>
                  <Text style={styles.routeTrailText}>{routeTrail}</Text>
                </View>
              ) : null}

              {stops.length > 0 && (
                <View style={styles.stopsChipsWrap}>
                  {stops.map((s) => {
                    const datePart =
                      s.startDate && s.endDate && s.endDate !== s.startDate
                        ? ` • ${s.startDate.slice(5)} → ${s.endDate.slice(5)}`
                        : s.startDate
                          ? ` • ${s.startDate.slice(5)}`
                          : '';
                    return (
                      <View key={s.id} style={styles.stopChip}>
                        <TouchableOpacity
                          onPress={() => openEditStopModal(s)}
                          onLongPress={() => handleDeleteStop(s.id, s.cityName)}
                          activeOpacity={0.75}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <Text style={styles.stopChipText}>
                            📍 {s.cityName}
                            {datePart}
                          </Text>
                          <Text style={styles.stopChipX}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteStop(s.id, s.cityName)}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
                          activeOpacity={0.7}
                          accessibilityLabel={`Remove ${s.cityName} stop`}
                        >
                          <Text style={styles.stopChipX}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {suggestedStops.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={styles.suggestLabel}>✨ 1-TAP SUGGESTED STOPS FROM YOUR BOOKINGS</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                  >
                    {suggestedStops.map((sug) => (
                      <TouchableOpacity
                        key={`${sug.cityName}-${sug.startDate || 'nodate'}`}
                        onPress={() =>
                          handleAcceptSuggestedStop(sug.cityName, sug.startDate, sug.endDate)
                        }
                        style={styles.suggestChip}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.suggestChipText}>
                          + 📍 {sug.cityName}
                          {sug.startDate ? ` • ${sug.startDate.slice(5)}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Quick Action Bar for Travel, Stay & Scan */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.subHeading}>🧭 Journey Timeline</Text>
                <Text style={styles.tinyNote}>Flights, trains, cars & stays in date order</Text>
              </View>
              <View style={styles.actionGroup}>
                <TouchableOpacity
                  onPress={() => openManualFlightModal('flight')}
                  style={styles.actionPillSoft}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionPillSoftText}>+ Travel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openManualStayModal}
                  style={styles.actionPillSoft}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionPillSoftText}>+ Stay</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onOpenScanner} style={styles.actionPill} activeOpacity={0.85}>
                  <Text style={styles.actionPillText}>📷 Scan</Text>
                </TouchableOpacity>
              </View>
            </View>

            {timelineItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 30 }}>✈️🚆🚗🏨</Text>
                <Text style={styles.emptyTitle}>No travel or stays logged yet</Text>
                <Text style={styles.emptySub}>
                  Scan a boarding pass, train e-ticket, car rental or hotel PDF — or log a flight, road trip, or stay manually!
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <TouchableOpacity
                    onPress={() => openManualFlightModal('flight')}
                    style={styles.emptyBtn}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.emptyBtnText}>✈️ Add Flight</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openManualFlightModal('transport')}
                    style={styles.emptyBtn}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.emptyBtnText}>🚆 Train / 🚗 Car</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openManualStayModal}
                    style={styles.emptyBtn}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.emptyBtnText}>🏨 Add Stay</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              timelineItems.map((item) => {
                if (item.kind === 'flight') {
                  const f = item.flight;
                  return (
                    <View key={`tl_f_${f.id}`} style={{ gap: 6 }}>
                      <View style={styles.timelineDateHeader}>
                        <View style={[styles.timelineDot, { backgroundColor: colors.sky }]} />
                        <Text style={styles.timelineDateText}>
                          {item.dateLabel}
                          {item.timeLabel ? ` • ${item.timeLabel}` : ''} • FLIGHT
                        </Text>
                      </View>
                      <BoardingPassCard flight={f} distanceUnit={distanceUnit} />
                      {!isViewer && (
                        <View style={styles.flightCardActionsRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => openEditFlightModal(f)}
                              style={styles.flightEditPill}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.flightEditPillText}>✏️ Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleRefreshFlightInfo(f)}
                              disabled={refreshingFlightId === f.id}
                              style={styles.flightRefreshPill}
                              activeOpacity={0.8}
                            >
                              {refreshingFlightId === f.id ? (
                                <ActivityIndicator size="small" color={colors.emeraldText} />
                              ) : (
                                <Text style={styles.flightRefreshPillText}>↻ Gate / Status</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDeleteFlight(f.id, f.flightNumber)}
                            style={styles.subtleRemoveRow}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.subtleRemoveText}>🗑️ Remove</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                }

                if (item.kind === 'transport') {
                  const t = item.transport;
                  const meta = transportMeta[t.mode];
                  return (
                    <View key={`tl_t_${t.id}`} style={{ gap: 6 }}>
                      <View style={styles.timelineDateHeader}>
                        <View style={[styles.timelineDot, { backgroundColor: meta.color }]} />
                        <Text style={styles.timelineDateText}>
                          {item.dateLabel} • {meta.label.toUpperCase()}
                        </Text>
                      </View>
                      <TransportCard
                        transport={t}
                        distanceUnit={distanceUnit}
                        homeCurrency={preferredCurrency}
                        fuelSpentHome={fuelSpentHome}
                        fuelCount={fuelExpenses.length}
                        onLogFuel={() => openExpenseModal('fuel')}
                      />
                      {!isViewer && (
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            gap: 14,
                            paddingRight: 4,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => openEditTransportModal(t)}
                            style={styles.subtleRemoveRow}
                            activeOpacity={0.75}
                          >
                            <Text style={[styles.subtleRemoveText, { color: colors.indigo }]}>
                              ✏️ Edit booking
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteTransport(t.id, t.title)}
                            style={styles.subtleRemoveRow}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.subtleRemoveText}>🗑️ Remove</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                }

                const s = item.stay;
                const cpp =
                  s.pointsRedeemed > 0 && s.cashValueEstimate
                    ? (((s.cashValueEstimate - s.costCash) / s.pointsRedeemed) * 100).toFixed(2)
                    : null;
                return (
                  <View key={`tl_s_${s.id}`} style={{ gap: 6 }}>
                    <View style={styles.timelineDateHeader}>
                      <View style={[styles.timelineDot, { backgroundColor: colors.indigo }]} />
                      <Text style={styles.timelineDateText}>{item.dateLabel} • STAY CHECK-IN</Text>
                    </View>
                    <View style={styles.stayCard}>
                      <View style={styles.rowBetween}>
                        <View style={styles.stayBadge}>
                          <Text style={styles.stayBadgeText}>🏨 {s.nights} NIGHTS</Text>
                        </View>
                        <View style={styles.actionGroup}>
                          {s.confirmationCode ? (
                            <Text style={styles.confCode}>#{s.confirmationCode}</Text>
                          ) : null}
                          {!isViewer && (
                            <TouchableOpacity
                              onPress={() => openEditStayModal(s)}
                              style={styles.memActionPill}
                              accessibilityLabel={`Edit ${s.name}`}
                            >
                              <Text style={styles.coverAction}>✏️</Text>
                            </TouchableOpacity>
                          )}
                          {!isViewer && (
                            <TouchableOpacity
                              onPress={() => handleDeleteStay(s.id, s.name)}
                              style={styles.memDeletePill}
                              accessibilityLabel={`Delete ${s.name}`}
                            >
                              <Text style={styles.deleteAction}>🗑️</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      <Text style={styles.stayName}>{s.name}</Text>
                      <Text style={styles.stayDates}>
                        Check-in {s.checkIn} → Check-out {s.checkOut}
                      </Text>
                      <View style={styles.stayLocationRow}>
                        {s.address ? (
                          <TouchableOpacity
                            onPress={() =>
                              openPropertyInGoogleMaps(s.name, s.address, trip.destinationCity)
                            }
                            style={{ flex: 1 }}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.stayAddr} numberOfLines={2}>
                              📍 {s.address}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={[styles.stayAddr, { flex: 1, fontStyle: 'italic' }]}>
                            📍 Tap Maps for directions{!isViewer ? ' or ✏️ to add location' : ''}
                          </Text>
                        )}
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            openPropertyInGoogleMaps(s.name, s.address, trip.destinationCity);
                          }}
                          style={styles.stayMapsPill}
                          activeOpacity={0.82}
                        >
                          <Text style={styles.stayMapsPillText}>🗺️ Maps</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.stayCostBox}>
                        <Text style={styles.stayCostText}>
                          {s.pointsRedeemed > 0
                            ? `${(s.pointsRedeemed / 1000).toFixed(0)}k pts + ${formatMoney(s.costCash, s.currency)}`
                            : formatMoney(s.costCash, s.currency)}
                        </Text>
                        {cpp && <Text style={styles.cppText}>{cpp}¢/pt value 🔥</Text>}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 3: UNIFIED MULTI-CURRENCY SPEND LEDGER (EXPENSES + PRICED BOOKINGS) */}
        {tab === 'spend' && !isViewer && (
          <View style={styles.sectionGap}>
            {showExpenseFilter && (
              <View style={styles.expenseFilterRow}>
                {(
                  [
                    { id: 'all', label: `All (${fullSpendLedger.items.length})` },
                    { id: 'personal', label: `🔒 Personal (${personalSpendItems.length})` },
                    { id: 'shared', label: `🤝 Shared (${sharedSpendItems.length})` },
                  ] as const
                ).map((opt) => {
                  const active = activeExpenseFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setExpenseFilter(opt.id)}
                      style={[
                        styles.expenseFilterPill,
                        active && styles.expenseFilterPillActive,
                      ]}
                      activeOpacity={0.82}
                    >
                      <Text
                        style={[
                          styles.expenseFilterText,
                          active && styles.expenseFilterTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={styles.spendSummaryCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.subHeading}>
                  {activeExpenseFilter === 'personal'
                    ? '🔒 Personal Spend'
                    : activeExpenseFilter === 'shared'
                      ? '🤝 Shared Group Spend'
                      : `💰 Spend Overview (${preferredCurrency})`}
                </Text>
                <Text style={styles.spendTotal}>
                  {formatMoney(filteredTotalHome, preferredCurrency)}
                  {activeExpenseFilter === 'all' && convertedTripBudget > 0
                    ? ` / ${formatMoney(convertedTripBudget, preferredCurrency)}`
                    : ''}
                </Text>
              </View>

              {activeExpenseFilter === 'shared' && editorCount >= 2 && filteredTotalHome > 0 && (
                <Text style={styles.perPersonHint}>
                  ≈ {formatMoney(filteredTotalHome / editorCount, preferredCurrency)} / person ({editorCount} editors)
                </Text>
              )}

              {/* Category Proportional Bar */}
              <View style={styles.catBar}>
                {Object.entries(catTotals).map(([cat, amt]) => {
                  const meta = categoryMeta[cat as ExpenseCategory] ?? categoryMeta.other;
                  const pct = Math.max(6, Math.round((amt / grandTotal) * 100));
                  return (
                    <View
                      key={cat}
                      style={{ width: `${pct}%`, backgroundColor: meta.color, height: '100%' }}
                    />
                  );
                })}
              </View>

              <View style={styles.catLegend}>
                {Object.entries(catTotals).map(([cat, amt]) => {
                  const meta = categoryMeta[cat as ExpenseCategory] ?? categoryMeta.other;
                  return (
                    <View key={cat} style={styles.legendChip}>
                      <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                      <Text style={styles.legendText}>
                        {meta.label}: {formatMoney(amt, preferredCurrency)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.subHeading}>🧾 Bills, Bookings &amp; Receipts</Text>
              </View>
              <View style={styles.actionGroup}>
                <TouchableOpacity
                  onPress={() => openExpenseModal('dining')}
                  style={styles.actionPillSoft}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionPillSoftText}>+ Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onOpenScanner} style={styles.actionPill} activeOpacity={0.85}>
                  <Text style={styles.actionPillText}>📷 Scan</Text>
                </TouchableOpacity>
              </View>
            </View>

            {visibleSpendItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 28 }}>🧾</Text>
                <Text style={styles.emptyTitle}>
                  {activeExpenseFilter === 'shared'
                    ? 'No shared expenses yet'
                    : activeExpenseFilter === 'personal'
                      ? 'No personal expenses yet'
                      : 'No expenses logged yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {activeExpenseFilter === 'shared'
                    ? 'Toggle “🤝 Shared” when adding an expense to share group bills & receipts with your Editor co-travelers.'
                    : 'Scan restaurant bills or add priced trains, flights & stays in any currency — everything converts automatically to ' + preferredCurrency + '!'}
                </Text>
              </View>
            ) : (
              visibleSpendItems.map((item) => {
                const meta = categoryMeta[item.category] ?? categoryMeta.other;
                const hasReceipt = Boolean(item.receiptUri || item.receiptRawText);
                const drawerKey = `${item.source}_${item.id}`;
                const isOpen = expandedReceiptId === drawerKey;
                const isFxConverted = item.originalCurrency !== preferredCurrency;
                return (
                  <TouchableOpacity
                    key={drawerKey}
                    onPress={() =>
                      hasReceipt && setExpandedReceiptId(isOpen ? null : drawerKey)
                    }
                    activeOpacity={hasReceipt ? 0.8 : 1}
                    style={styles.expenseCard}
                  >
                    <View style={styles.rowBetween}>
                      <View style={styles.expLeft}>
                        <View style={[styles.expIconBox, { backgroundColor: meta.bg }]}>
                          <Text style={{ fontSize: 16 }}>{meta.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expMerchant} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.expSub} numberOfLines={1}>
                            {item.date}
                            {isFxConverted
                              ? ` • Paid ${formatMoney(item.originalAmount, item.originalCurrency)}`
                              : ` • ${formatMoney(item.originalAmount, item.originalCurrency)}`}
                            {item.subtitle ? ` • ${item.subtitle}` : ''}
                            {hasReceipt ? ' • 🧾' : ''}
                          </Text>
                          {(showExpenseFilter || item.source !== 'expense' || isFxConverted) && (
                            <View style={styles.expBadgeRow}>
                              {item.source === 'transport' ? (
                                <View
                                  style={[
                                    styles.expVisBadge,
                                    { backgroundColor: isDark ? '#2B1B46' : '#EDE9FE' },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.expVisBadgeText,
                                      { color: isDark ? '#D8B4FE' : '#5B21B6' },
                                    ]}
                                  >
                                    🚆 From Bookings
                                  </Text>
                                </View>
                              ) : item.source === 'stay' ? (
                                <View
                                  style={[
                                    styles.expVisBadge,
                                    { backgroundColor: colors.amberSoft },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.expVisBadgeText,
                                      { color: colors.amberText },
                                    ]}
                                  >
                                    🏨 From Bookings
                                  </Text>
                                </View>
                              ) : showExpenseFilter ? (
                                <>
                                  <View
                                    style={[
                                      styles.expVisBadge,
                                      item.isShared && styles.expVisBadgeShared,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.expVisBadgeText,
                                        item.isShared && styles.expVisBadgeTextShared,
                                      ]}
                                    >
                                      {item.isShared ? '🤝 Shared' : '🔒 Personal'}
                                    </Text>
                                  </View>
                                  {item.isShared && item.authorName ? (
                                    <Text style={styles.expAuthorText} numberOfLines={1}>
                                      by {item.authorName}
                                    </Text>
                                  ) : null}
                                </>
                              ) : null}
                              {isFxConverted && (
                                <TouchableOpacity
                                  onPress={() => openFxRateModal(item)}
                                  activeOpacity={0.75}
                                  style={[
                                    styles.expVisBadge,
                                    {
                                      backgroundColor:
                                        item.rateSource === 'live_pending'
                                          ? isDark
                                            ? colors.coralSoft
                                            : '#FFF7ED'
                                          : colors.skySoft,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.expVisBadgeText,
                                      {
                                        color:
                                          item.rateSource === 'live_pending'
                                            ? isDark
                                              ? colors.coralDark
                                              : '#C2410C'
                                            : isDark
                                              ? '#7DD3FC'
                                              : '#0369A1',
                                      },
                                    ]}
                                  >
                                    {item.rateSource === 'live_pending'
                                      ? '⏳ Live rate (pay later)'
                                      : `💱 Rate ${formatShortRateDate(item.fxDate || item.date)}`}
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={styles.expHome}>
                          {formatMoney(item.convertedAmount, preferredCurrency)}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {hasReceipt && (
                            <Text style={styles.peekLink}>
                              {isOpen ? 'Hide ▲' : 'Peek 🧾'}
                            </Text>
                          )}
                          {!isViewer && (item.source === 'transport' || item.source === 'stay') && (
                            <TouchableOpacity
                              onPress={() => {
                                if (item.source === 'transport') {
                                  const found = transports.find((tr) => tr.id === item.id);
                                  if (found) openEditTransportModal(found);
                                } else if (item.source === 'stay') {
                                  const found = stays.find((st) => st.id === item.id);
                                  if (found) openEditStayModal(found);
                                }
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityLabel={`Edit ${item.title}`}
                            >
                              <Text style={styles.coverAction}>✏️</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => {
                              if (item.source === 'transport') {
                                handleDeleteTransport(item.id, item.title);
                              } else if (item.source === 'stay') {
                                handleDeleteStay(item.id, item.title);
                              } else {
                                handleDeleteExpense(item.id, item.title);
                              }
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.deleteAction}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    {isOpen && (
                      <View style={styles.receiptDrawer}>
                        <Text style={styles.receiptPrivateBadge}>
                          {FEATURE_FLAGS.CLOUD_COLLAB_ENABLED && item.isShared
                            ? '🤝 Shared Receipt (Visible to trip Editors • Hidden from Viewers & Postcards)'
                            : '🔒 Private Receipt (Visible only to you • Excluded from Studio & Postcards)'}
                        </Text>
                        {item.receiptUri && (
                          <TouchableOpacity
                            onPress={() =>
                              setLightboxReceipt({
                                title: item.title,
                                date: item.date,
                                amountLabel: isFxConverted
                                  ? `${formatMoney(item.originalAmount, item.originalCurrency)} (${formatMoney(item.convertedAmount, preferredCurrency)})`
                                  : formatMoney(item.originalAmount, item.originalCurrency),
                                receiptUri: item.receiptUri!,
                                receiptRawText: item.receiptRawText,
                              })
                            }
                            activeOpacity={0.88}
                            style={styles.receiptImgWrap}
                            accessibilityLabel={`View full size receipt for ${item.title}`}
                          >
                            <Image
                              source={{ uri: item.receiptUri }}
                              style={styles.receiptImg}
                              resizeMode="contain"
                            />
                            <View style={styles.receiptExpandBadge}>
                              <Text style={styles.receiptExpandBadgeText}>🔍 Full size</Text>
                            </View>
                          </TouchableOpacity>
                        )}
                        {item.receiptRawText && (
                          <Text style={styles.receiptMono}>{item.receiptRawText}</Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* EDIT TRIP MODAL */}
      <BottomSheetModal
        visible={editModal}
        title="✏️ Edit Trip Details"
        onClose={() => setEditModal(false)}
        footer={
          <TouchableOpacity onPress={handleSaveTripEdit} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
            <Text style={styles.modalPrimaryText}>Save Trip Changes ✨</Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.fieldLabel}>Trip Name</Text>
        <TextInput
          value={editTitle}
          onChangeText={setEditTitle}
          placeholder="e.g. Kyoto Autumn Escape"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Destination</Text>
        <TextInput
          value={editDestination}
          onChangeText={setEditDestination}
          placeholder="e.g. Europe, Swiss Alps, Japan, Goa"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DatePickerField
            label="Start Date"
            value={editStartDate}
            onChange={setEditStartDate}
            placeholder="Pick start"
          />
          <DatePickerField
            label="End Date"
            value={editEndDate}
            onChange={setEditEndDate}
            placeholder="Pick end"
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.3 }}>
            <Text style={styles.fieldLabel}>Target Budget (Optional)</Text>
            <TextInput
              value={editBudget}
              onChangeText={setEditBudget}
              placeholder="0"
              placeholderTextColor={colors.inkSoft}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 0.7 }}>
            <Text style={styles.fieldLabel}>Currency</Text>
            <TextInput
              value={editCurrency}
              onChangeText={(v) => setEditCurrency(v.toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 12))}
              placeholder="USD"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="characters"
              style={[styles.input, { textAlign: 'center' }]}
            />
          </View>
        </View>
        <CurrencySuggestionsBar
          value={editCurrency}
          onSelect={setEditCurrency}
          tripCurrencies={tripCurrencies}
          homeCurrency={preferredCurrency}
        />

        <Text style={styles.fieldLabel}>Postcard Banner Vibe</Text>
        <View style={styles.vibeGrid}>
          {VIBES.map((v) => {
            const active = editVibe === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => setEditVibe(v.id)}
                style={[styles.vibeChip, active && styles.vibeChipActive]}
              >
                <Text style={{ fontSize: 16 }}>{v.emoji}</Text>
                <Text
                  style={[styles.vibeText, active && styles.vibeTextActive]}
                  numberOfLines={1}
                >
                  {v.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {trip.coverPhotoUri && (
          <TouchableOpacity
            onPress={() => {
              setTripCoverPhoto(trip.id, null);
              Alert.alert('Banner Reset', 'Reverted back to the illustrated postcard banner.');
            }}
            style={styles.resetCoverBtn}
          >
            <Text style={styles.resetCoverText}>🖼️ Reset Custom Cover Photo</Text>
          </TouchableOpacity>
        )}
      </BottomSheetModal>

      {/* ADD / EDIT MEMORY MODAL */}
      <BottomSheetModal
        visible={memoryModal}
        title={editingMemoryId ? '✏️ Edit Polaroid Memory' : '📸 Capture a Polaroid Memory'}
        onClose={() => {
          setMemoryModal(false);
          setEditingMemoryId(null);
        }}
        footer={
          <TouchableOpacity onPress={handleSaveMemory} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
            <Text style={styles.modalPrimaryText}>
              {editingMemoryId ? 'Save Memory Changes ✨' : 'Save to Polaroid Timeline ✨'}
            </Text>
          </TouchableOpacity>
        }
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => handlePickMemoryPhoto('camera')}
            style={styles.photoPickBtn}
          >
            <Text style={styles.photoPickText}>📷 {memPhotoUri ? 'Retake' : 'Take Photo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handlePickMemoryPhoto('library')}
            style={styles.photoPickBtn}
          >
            <Text style={styles.photoPickText}>🖼️ {memPhotoUri ? 'Change Photo' : 'From Gallery'}</Text>
          </TouchableOpacity>
        </View>

        {memPhotoUri && (
          <View style={{ gap: 6 }}>
            <Image
              source={{ uri: memPhotoUri }}
              style={styles.previewMemImg}
              resizeMode="cover"
            />
            {memDateAutoDetected && (
              <Text style={styles.tinyNote}>
                ✨ Auto-filled date ({memDate})
                {memStopAutoMatched ? ` & matched stop "${memStopAutoMatched}"` : ''} from photo
              </Text>
            )}
            <TouchableOpacity
              onPress={() => {
                setMemPhotoUri(undefined);
                setMemThumbUri(undefined);
                setMemDateAutoDetected(false);
                setMemStopAutoMatched(null);
              }}
              style={styles.resetCoverBtn}
            >
              <Text style={styles.resetCoverText}>🗑️ Remove Photo</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          value={memTitle}
          onChangeText={setMemTitle}
          placeholder="Moment title (e.g. Sunset at Arashiyama)"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.25 }}>
            <Text style={styles.fieldLabel}>Place</Text>
            <TextInput
              value={memPlace}
              onChangeText={setMemPlace}
              placeholder="Place name (optional)"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DatePickerField
              label="Date"
              value={memDate}
              onChange={(d) => {
                setMemDate(d);
                setMemDateAutoDetected(false);
                if (!memStopId) {
                  const matched = matchStopForDate(stops, d);
                  if (matched) setMemStopId(matched.id);
                }
              }}
              placeholder="Pick date"
              compact
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Trip Stop / Hop (Optional)</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
        >
          <TouchableOpacity
            onPress={() => setMemStopId(undefined)}
            style={[styles.moodChip, !memStopId && styles.moodChipActive]}
          >
            <Text style={[styles.moodChipText, !memStopId && { color: '#FFFFFF' }]}>
              None
            </Text>
          </TouchableOpacity>
          {stops.map((s) => {
            const active = memStopId === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => {
                  setMemStopId(s.id);
                  if (!memPlace.trim()) setMemPlace(s.cityName);
                }}
                style={[styles.moodChip, active && styles.moodChipActive]}
              >
                <Text style={[styles.moodChipText, active && { color: '#FFFFFF' }]}>
                  📍 {s.cityName}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={openAddStopModal}
            style={[styles.moodChip, { borderStyle: 'dashed', borderColor: colors.coral }]}
          >
            <Text style={[styles.moodChipText, { color: colors.coralDark }]}>+ Stop</Text>
          </TouchableOpacity>
        </ScrollView>

        <Text style={styles.fieldLabel}>Story / Reflection</Text>
        <TextInput
          value={memNote}
          onChangeText={setMemNote}
          placeholder="How did it feel? Write your little story..."
          placeholderTextColor={colors.inkSoft}
          multiline
          numberOfLines={3}
          style={[styles.input, { height: 78, textAlignVertical: 'top' }]}
        />

        <Text style={styles.fieldLabel}>Feel / Mood Sticker</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
        >
          {MOOD_STICKERS.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setMemMood(s)}
              style={[styles.moodChip, memMood === s && styles.moodChipActive]}
            >
              <Text
                style={[
                  styles.moodChipText,
                  memMood === s && { color: '#FFFFFF' },
                ]}
              >
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheetModal>

      {/* QUICK MANUAL EXPENSE MODAL */}
      <BottomSheetModal
        visible={expenseModal}
        title="🧾 Add Quick Expense"
        onClose={() => setExpenseModal(false)}
        footer={
          <TouchableOpacity onPress={handleSaveExpense} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
            <Text style={styles.modalPrimaryText}>Save to Spend Ledger</Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.fieldLabel}>Merchant</Text>
        <TextInput
          value={expMerchant}
          onChangeText={setExpMerchant}
          placeholder="Merchant (e.g. Ichiran Ramen)"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput
              value={expAmount}
              onChangeText={setExpAmount}
              placeholder="0.00"
              placeholderTextColor={colors.inkSoft}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>
          <View style={{ width: 92 }}>
            <Text style={styles.fieldLabel}>
              {tripCurrencies.length > 1 && !expCurrency.trim() ? 'Currency *' : 'Currency'}
            </Text>
            <TextInput
              value={expCurrency}
              onChangeText={(v) => setExpCurrency(v.toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 12))}
              placeholder={tripCurrencies.length > 1 ? 'Pick' : preferredCurrency}
              placeholderTextColor={tripCurrencies.length > 1 && !expCurrency.trim() ? colors.coral : colors.inkSoft}
              autoCapitalize="characters"
              style={[styles.input, { textAlign: 'center' }]}
            />
          </View>
        </View>
        <CurrencySuggestionsBar
          value={expCurrency}
          onSelect={setExpCurrency}
          tripCurrencies={tripCurrencies}
          homeCurrency={preferredCurrency}
          needsPick={tripCurrencies.length > 1}
        />

        <DatePickerField
          label="Expense Date"
          value={expDate}
          onChange={setExpDate}
          placeholder="Pick date"
        />

        {isCollab && (
          <View style={styles.expToggleWrap}>
            <Text style={styles.fieldLabel}>Expense Visibility</Text>
            <View style={styles.rolePillRow}>
              <TouchableOpacity
                onPress={() => setExpIsShared(false)}
                style={[styles.rolePillBtn, !expIsShared && styles.rolePillBtnActive]}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.rolePillText, !expIsShared && styles.rolePillTextActive]}
                >
                  🔒 Personal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setExpIsShared(true)}
                style={[styles.rolePillBtn, expIsShared && styles.rolePillBtnSharedActive]}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.rolePillText, expIsShared && styles.rolePillTextActive]}
                >
                  🤝 Shared
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.roleHelperText}>
              {expIsShared
                ? 'Visible to Editor co-travelers on this trip (including receipt photo).'
                : 'Private — visible only to you, even on this shared trip.'}
            </Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {(Object.keys(categoryMeta) as ExpenseCategory[]).map((cat) => {
            const m = categoryMeta[cat];
            const active = expCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setExpCategory(cat)}
                style={[styles.moodChip, active && styles.moodChipActive]}
              >
                <Text style={[styles.moodChipText, active && { color: '#FFFFFF' }]}>
                  {m.emoji} {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </BottomSheetModal>

      {/* DEDICATED CO-TRAVELERS MODAL (Trip Sharing & Roles — Postcards are separate 1-tap action) */}
      <BottomSheetModal
        visible={shareModal}
        title={`👥 Co-Travelers • ${trip.title}`}
        onClose={() => setShareModal(false)}
      >
        {isOwner ? (
          <View style={styles.shareCardWarm}>
            <Text style={styles.shareCardHead}>✨ Invite Co-Travelers</Text>
            <Text style={styles.shareCardSub}>
              Add friends by their Google email and pick what they can access.
            </Text>

            <View style={styles.rolePillRow}>
              <TouchableOpacity
                onPress={() => setInviteRole('editor')}
                style={[
                  styles.rolePillBtn,
                  inviteRole === 'editor' && styles.rolePillBtnSharedActive,
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.rolePillText,
                    inviteRole === 'editor' && styles.rolePillTextActive,
                  ]}
                >
                  ✏️ Editor
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setInviteRole('viewer')}
                style={[
                  styles.rolePillBtn,
                  inviteRole === 'viewer' && styles.rolePillBtnViewerActive,
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.rolePillText,
                    inviteRole === 'viewer' && styles.rolePillTextActive,
                  ]}
                >
                  👀 Viewer
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.roleHelperText}>
              {inviteRole === 'editor'
                ? 'Can add photos, bookings & shared expenses. Personal expenses stay private.'
                : 'Read-only itinerary & photos. Expenses and receipts are completely hidden.'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TextInput
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="friend@gmail.com"
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
                keyboardType="email-address"
                style={[styles.input, { flex: 1, backgroundColor: colors.card }]}
              />
              <TouchableOpacity onPress={handleInviteBuddy} style={styles.inviteBtn}>
                <Text style={styles.inviteBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.shareCardSky}>
            <Text style={[styles.shareCardHead, { color: isDark ? '#7DD3FC' : '#0369A1' }]}>
              {isViewer ? '👀 You have Viewer access' : '✏️ You have Editor access'}
            </Text>
            <Text style={styles.shareCardSub}>
              {isViewer
                ? 'You can view this trip’s route, bookings & memories. Expenses are hidden.'
                : 'You can add photos, bookings & shared expenses. Only the trip owner can manage members.'}
            </Text>
          </View>
        )}

        <View style={styles.memberSection}>
          <Text style={styles.fieldLabel}>
            People on this Trip ({trip.coTravelers.length + 1})
          </Text>

          <View style={styles.memberRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {isOwner ? `${profile?.displayName || 'You'} (Owner)` : 'Trip Owner'}
            </Text>
            <View style={[styles.memberRoleBadge, { backgroundColor: colors.amberSoft }]}>
              <Text style={[styles.memberRoleBadgeText, { color: colors.amberText }]}>👑 Owner</Text>
            </View>
          </View>

          {trip.coTravelers.length === 0 ? (
            <Text style={styles.memberEmptyHint}>
              No co-travelers added yet — this is currently a solo trip.
            </Text>
          ) : (
            trip.coTravelers.map((member) => {
              const role = getCoTravelerRole(trip, member);
              return (
                <View key={member} style={styles.memberRow}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member}
                  </Text>
                  <View style={styles.memberRowActions}>
                    <TouchableOpacity
                      onPress={() => handleToggleBuddyRole(member)}
                      disabled={!isOwner}
                      style={[
                        styles.memberRoleBadge,
                        role === 'viewer'
                          ? { backgroundColor: colors.skySoft }
                          : { backgroundColor: colors.emeraldSoft },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.memberRoleBadgeText,
                          role === 'viewer'
                            ? { color: isDark ? '#7DD3FC' : '#0369A1' }
                            : { color: colors.emeraldText },
                        ]}
                      >
                        {role === 'viewer' ? '👀 Viewer' : '✏️ Editor'}
                      </Text>
                    </TouchableOpacity>
                    {isOwner && (
                      <TouchableOpacity
                        onPress={() => handleRemoveBuddy(member)}
                        style={styles.memberRemoveBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.memberRemoveText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
          {isOwner && trip.coTravelers.length > 0 && (
            <Text style={styles.roleHelperText}>
              Tip: Tap a person’s role badge to switch between Editor and Viewer anytime.
            </Text>
          )}
        </View>
      </BottomSheetModal>

      {/* UNIFIED ADD / EDIT TRAVEL MODAL (FLIGHT OR TRAIN / BUS / FERRY / RENTAL / OWN CAR) */}
      <BottomSheetModal
        visible={flightModal}
        title={
          editingTransport
            ? `✏️ Edit ${TRANSPORT_MODE_META[transportDraft.mode].label}`
            : travelModalMode === 'flight'
              ? '✈️ Add Flight'
              : '🚆 Add Train / Car / Road Trip'
        }
        onClose={() => {
          setEditingTransport(null);
          setFlightModal(false);
        }}
        footer={
          <TouchableOpacity
            onPress={travelModalMode === 'flight' ? handleSaveManualFlight : handleSaveTransport}
            style={styles.modalPrimaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.modalPrimaryText}>
              {editingTransport
                ? 'Save Booking Changes ✨'
                : travelModalMode === 'flight'
                  ? 'Save Flight to Trip ✈️'
                  : 'Save Travel Leg 🧭'}
            </Text>
          </TouchableOpacity>
        }
      >
        {!editingTransport && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <TouchableOpacity
              onPress={() => setTravelModalMode('flight')}
              style={[
                styles.moodChip,
                { flex: 1, alignItems: 'center' },
                travelModalMode === 'flight' && styles.moodChipActive,
              ]}
            >
              <Text
                style={[
                  styles.moodChipText,
                  travelModalMode === 'flight' && { color: '#FFFFFF' },
                ]}
              >
                ✈️ Flight
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTravelModalMode('transport')}
              style={[
                styles.moodChip,
                { flex: 1, alignItems: 'center' },
                travelModalMode === 'transport' && styles.moodChipActive,
              ]}
            >
              <Text
                style={[
                  styles.moodChipText,
                  travelModalMode === 'transport' && { color: '#FFFFFF' },
                ]}
              >
                🚆 Train / Bus / 🚗 Car
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {travelModalMode === 'flight' && !editingTransport ? (
          <ManualFlightFields
            draft={flightDraft}
            onChange={setFlightDraft}
            tripCurrencies={tripCurrencies}
            homeCurrency={preferredCurrency}
          />
        ) : (
          <TransportFormFields
            draft={transportDraft}
            onChange={(patch) => setTransportDraft((prev) => ({ ...prev, ...patch }))}
            distanceUnit={distanceUnit}
            tripCurrencies={tripCurrencies}
            homeCurrency={preferredCurrency}
          />
        )}
      </BottomSheetModal>

      {/* ADD / EDIT STOP / HOP MODAL */}
      <BottomSheetModal
        visible={stopModal}
        title={editingStopId ? '✏️ Edit Trip Stop / Hop' : '📍 Add Trip Stop / Hop'}
        onClose={() => {
          setStopModal(false);
          setEditingStopId(null);
        }}
        footer={
          <TouchableOpacity onPress={handleSaveStop} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
            <Text style={styles.modalPrimaryText}>
              {editingStopId ? 'Save Stop Changes ✓' : 'Add Stop to Trip 📍'}
            </Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.tinyNote}>
          Tag cities you actually explored (including stopovers on one leg of a trip!). Adding dates keeps earlier layovers stitched and auto-matches photos to the right stop.
        </Text>
        <Text style={styles.fieldLabel}>City / Stop Name</Text>
        <TextInput
          value={stopCity}
          onChangeText={setStopCity}
          placeholder="e.g. Lucerne, Kyoto, Coorg"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DatePickerField
            label="Arrival Date (Opt.)"
            value={stopStartDate}
            onChange={setStopStartDate}
            placeholder="Pick date"
            compact
          />
          <DatePickerField
            label="Departure Date (Opt.)"
            value={stopEndDate}
            onChange={setStopEndDate}
            placeholder="Pick date"
            compact
          />
        </View>
      </BottomSheetModal>

      {/* EDIT EXISTING FLIGHT MODAL (Date, Time, Route, Flight #, PNR, Seat) */}
      <BottomSheetModal
        visible={editFlightModal}
        title="✈️ Edit Flight Details"
        onClose={() => {
          setEditFlightModal(false);
          setEditingFlightId(null);
        }}
        footer={
          <TouchableOpacity
            onPress={handleSaveEditedFlight}
            style={styles.modalPrimaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.modalPrimaryText}>Save Flight Changes ✓</Text>
          </TouchableOpacity>
        }
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DatePickerField
            label="Departure Date"
            value={editFltDate}
            onChange={setEditFltDate}
            placeholder="Pick date"
            compact
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.fieldMiniLabel}>TIME (24H)</Text>
            <TextInput
              value={editFltTime}
              onChangeText={(v) => setEditFltTime(formatTimeHmInput(v, editFltTime))}
              placeholder="e.g. 22:00"
              placeholderTextColor={colors.inkSoft}
              keyboardType="number-pad"
              maxLength={5}
              style={styles.input}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1.2, gap: 4 }}>
            <Text style={styles.fieldMiniLabel}>FLIGHT #</Text>
            <TextInput
              value={editFltNum}
              onChangeText={(v) => setEditFltNum(v.toUpperCase())}
              placeholder="e.g. EY 217"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 0.9, gap: 4 }}>
            <Text style={styles.fieldMiniLabel}>FROM (IATA)</Text>
            <TextInput
              value={editFltOrigin}
              onChangeText={(v) => setEditFltOrigin(v.toUpperCase().slice(0, 3))}
              placeholder="BLR"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 0.9, gap: 4 }}>
            <Text style={styles.fieldMiniLabel}>TO (IATA)</Text>
            <TextInput
              value={editFltDest}
              onChangeText={(v) => setEditFltDest(v.toUpperCase().slice(0, 3))}
              placeholder="AUH"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.fieldMiniLabel}>PNR / REF</Text>
            <TextInput
              value={editFltPnr}
              onChangeText={(v) => setEditFltPnr(v.toUpperCase())}
              placeholder="Optional"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 0.8, gap: 4 }}>
            <Text style={styles.fieldMiniLabel}>SEAT</Text>
            <TextInput
              value={editFltSeat}
              onChangeText={(v) => setEditFltSeat(v.toUpperCase())}
              placeholder="e.g. 14A"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.fieldMiniLabel}>CABIN</Text>
            <TextInput
              value={editFltCabin}
              onChangeText={setEditFltCabin}
              placeholder="Economy"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
            />
          </View>
        </View>
      </BottomSheetModal>

      {/* MANUAL / EDIT STAY MODAL */}
      <BottomSheetModal
        visible={stayModal}
        title={editingStayId ? '✏️ Edit Hotel / Stay' : '🏨 Add Hotel / Stay'}
        onClose={() => {
          setStayModal(false);
          setEditingStayId(null);
        }}
        footer={
          <TouchableOpacity onPress={handleSaveManualStay} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
            <Text style={styles.modalPrimaryText}>
              {editingStayId ? 'Save Stay Changes ✓' : 'Save Stay to Trip 🏨'}
            </Text>
          </TouchableOpacity>
        }
      >
        <TextInput
          value={stayName}
          onChangeText={setStayName}
          placeholder="Hotel, Airbnb, or Resort name"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
        >
          {STAY_TYPES.map((st) => {
            const active = stayType === st.id;
            return (
              <TouchableOpacity
                key={st.id}
                onPress={() => setStayType(st.id)}
                style={[styles.moodChip, active && styles.moodChipActive]}
              >
                <Text style={[styles.moodChipText, active && { color: '#FFFFFF' }]}>
                  {st.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <PlaceAddressHelper
          label="Location / Address (Optional)"
          propertyName={stayName}
          regionHint={trip.destinationCity}
          value={stayAddress}
          onChangeText={setStayAddress}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DatePickerField
            label="Check-in"
            value={stayCheckIn}
            onChange={setStayCheckIn}
            placeholder="Pick date"
            compact
          />
          <DatePickerField
            label="Check-out"
            value={stayCheckOut}
            onChange={setStayCheckOut}
            placeholder="Pick date"
            compact
          />
        </View>
        <TextInput
          value={stayConf}
          onChangeText={setStayConf}
          placeholder="Confirmation # (opt)"
          placeholderTextColor={colors.inkSoft}
          autoCapitalize="characters"
          style={styles.input}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={stayCost}
            onChangeText={setStayCost}
            placeholder="Cash cost (opt)"
            placeholderTextColor={colors.inkSoft}
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1 }]}
          />
          <TextInput
            value={stayCurrency}
            onChangeText={(v) => setStayCurrency(v.toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 12))}
            placeholder={tripCurrencies.length > 1 ? 'Pick' : preferredCurrency}
            placeholderTextColor={tripCurrencies.length > 1 && !stayCurrency.trim() ? colors.coral : colors.inkSoft}
            autoCapitalize="characters"
            style={[styles.input, { width: 84, textAlign: 'center' }]}
          />
        </View>
        <CurrencySuggestionsBar
          value={stayCurrency}
          onSelect={setStayCurrency}
          tripCurrencies={tripCurrencies}
          homeCurrency={preferredCurrency}
          needsPick={tripCurrencies.length > 1 && parseFloat(stayCost) > 0}
        />
        {parseFloat(stayCost) > 0 &&
          stayCheckIn.trim().slice(0, 10) > new Date().toISOString().slice(0, 10) && (
            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Payment Timing (for FX Rate)</Text>
              <View style={styles.rolePillRow}>
                <TouchableOpacity
                  onPress={() => setStayPayLater(false)}
                  style={[styles.rolePillBtn, !stayPayLater && styles.rolePillBtnActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.rolePillText, !stayPayLater && styles.rolePillTextActive]}>
                    🔒 Paid now (lock rate)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStayPayLater(true)}
                  style={[styles.rolePillBtn, stayPayLater && styles.rolePillBtnSharedActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.rolePillText, stayPayLater && styles.rolePillTextActive]}>
                    ⏳ Pay at property
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={stayPoints}
            onChangeText={setStayPoints}
            placeholder="Points redeemed (opt)"
            placeholderTextColor={colors.inkSoft}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <TextInput
            value={stayPointsProg}
            onChangeText={setStayPointsProg}
            placeholder="Program (e.g. Bonvoy)"
            placeholderTextColor={colors.inkSoft}
            style={[styles.input, { flex: 1 }]}
          />
        </View>
        <TextInput
          value={stayNotes}
          onChangeText={setStayNotes}
          placeholder="Notes (optional)"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />
      </BottomSheetModal>

      {/* EXCHANGE RATE / PAYMENT DATE MODAL */}
      <BottomSheetModal
        visible={Boolean(fxEditItem)}
        title="💱 Exchange Rate Date"
        onClose={() => setFxEditItem(null)}
        footer={
          <TouchableOpacity
            onPress={handleSaveFxRateDate}
            style={styles.modalPrimaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.modalPrimaryText}>Save Rate Setting ✓</Text>
          </TouchableOpacity>
        }
      >
        {fxEditItem && (
          <View style={{ gap: 12 }}>
            <Text style={styles.tinyNote}>
              {fxEditItem.title} • Paid{' '}
              {formatMoney(fxEditItem.originalAmount, fxEditItem.originalCurrency)} →{' '}
              {preferredCurrency}
            </Text>

            <View style={styles.rolePillRow}>
              <TouchableOpacity
                onPress={() => setFxEditPayLater(false)}
                style={[styles.rolePillBtn, !fxEditPayLater && styles.rolePillBtnActive]}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.rolePillText, !fxEditPayLater && styles.rolePillTextActive]}
                >
                  🔒 Lock Payment Date
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFxEditPayLater(true)}
                style={[styles.rolePillBtn, fxEditPayLater && styles.rolePillBtnSharedActive]}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.rolePillText, fxEditPayLater && styles.rolePillTextActive]}
                >
                  ⏳ Pay Later (Live)
                </Text>
              </TouchableOpacity>
            </View>

            {!fxEditPayLater ? (
              <View style={{ gap: 6 }}>
                <DatePickerField
                  label="Payment / Booking Date"
                  value={fxEditDate}
                  onChange={setFxEditDate}
                  placeholder="Pick payment date"
                />
                <Text style={styles.roleHelperText}>
                  Locks conversion to the European Central Bank exchange rate on this payment date
                  so your trip totals never drift when currencies fluctuate later.
                </Text>
              </View>
            ) : (
              <Text style={styles.roleHelperText}>
                Uses today’s live exchange rate while this booking is upcoming, then automatically
                locks to the travel/check-in date ({fxEditItem.date}) once that day arrives.
              </Text>
            )}
          </View>
        )}
      </BottomSheetModal>

      {/* KEEPSAKE MAGAZINE PDF STUDIO (3 Templates + Cover Photo Picker + Drag & Zoom Reframe) */}
      <KeepsakeStudioModal
        visible={keepsakeStudioOpen}
        trip={trip}
        flights={flights}
        transports={transports}
        stops={stops}
        stays={stays}
        memories={memories}
        distanceUnit={distanceUnit}
        exporting={exportingKeepsakePdf}
        onClose={() => setKeepsakeStudioOpen(false)}
        onExport={handleExportKeepsakePdf}
      />

      {/* FULL-SCREEN ZOOMABLE RECEIPT / BILL LIGHTBOX */}
      <ReceiptLightboxModal
        item={lightboxReceipt}
        onClose={() => setLightboxReceipt(null)}
      />
      </View>
    </View>
  );
};

const TabPill = ({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) => {
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tabPill, active && styles.tabPillActive]}
      activeOpacity={0.85}
    >
      <Text
        style={[styles.tabPillText, active && styles.tabPillTextActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const createStyles = (COLORS: ThemeColors, SHADOWS: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    screenHost: { flex: 1, backgroundColor: COLORS.canvas, position: 'relative' },
    offscreenPostcardHost: {
      position: 'absolute',
      top: 0,
      left: 0,
      zIndex: 0,
    },
    root: { flex: 1, backgroundColor: COLORS.canvas, zIndex: 1 },
    missingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    missingText: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
    backBtn: { backgroundColor: COLORS.coralSoft, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 99 },
    backBtnText: { color: COLORS.coralDark, fontWeight: '800' },

    topHeader: { position: 'relative' },
    headerNavRow: {
      position: 'absolute',
      top: 12,
      left: 14,
      right: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    headerRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    glassBtn: {
      backgroundColor: isDark ? 'rgba(14,17,27,0.82)' : 'rgba(255,255,255,0.92)',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 99,
    },
    iconGlassBtn: {
      backgroundColor: isDark ? 'rgba(14,17,27,0.82)' : 'rgba(255,255,255,0.92)',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 99,
    },
    glassBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
    shareGlassBtn: {
      backgroundColor: COLORS.rose,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 99,
    },
    shareGlassText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
    headerBottomText: { position: 'absolute', bottom: 14, left: 16, right: 16 },
    tripTitle: { fontSize: 21, fontWeight: '900', color: '#FFFFFF' },
    tripDates: { fontSize: 12, color: '#FEF3C7', fontWeight: '700', marginTop: 3 },

    tabsWrap: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: COLORS.card,
      borderRadius: 16,
      padding: 4,
      gap: 4,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    tabPill: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabPillActive: { backgroundColor: COLORS.coral },
    tabPillText: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted, textAlign: 'center' },
    tabPillTextActive: { color: '#FFFFFF' },

    scrollContent: { padding: 16, paddingBottom: 48 },
    sectionGap: { gap: 14 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    sectionHeaderLeft: {
      flex: 1,
      flexShrink: 1,
    },
    actionGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    subHeading: { fontSize: 15, fontWeight: '900', color: COLORS.ink },
    tinyNote: { fontSize: 11, color: COLORS.emerald, fontWeight: '700', marginTop: 2 },
    actionPill: {
      backgroundColor: COLORS.coral,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 99,
    },
    actionPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    actionPillSoft: {
      backgroundColor: COLORS.coralSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 99,
    },
    actionPillSoftText: { color: COLORS.coralDark, fontSize: 12, fontWeight: '800' },

    // Polaroid Memory Card
    polaroidCard: {
      backgroundColor: COLORS.card,
      borderRadius: 18,
      padding: 14,
      paddingBottom: 16,
      borderWidth: 1,
      borderColor: COLORS.coralBorder,
      marginTop: 6,
      ...SHADOWS.polaroid,
    },
    tapeStrip: {
      width: 64,
      height: 14,
      backgroundColor: isDark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(253, 224, 71, 0.55)',
      alignSelf: 'center',
      marginTop: -20,
      marginBottom: 10,
      borderRadius: 3,
    },
    polaroidBody: { paddingTop: 10, gap: 6 },
    polaroidTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink, flex: 1 },
    polaroidDate: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '700' },
    polaroidPlace: { fontSize: 12, color: COLORS.coralDark, fontWeight: '700' },
    polaroidNote: { fontSize: 13, color: COLORS.inkMuted, lineHeight: 19 },
    polaroidFooter: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: COLORS.borderSoft,
    },
    memoryActionGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    moodTag: {
      backgroundColor: COLORS.coralSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 99,
    },
    moodTagText: { fontSize: 11, fontWeight: '800', color: COLORS.coralDark },
    authorTag: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '600' },
    memEditPill: {
      backgroundColor: COLORS.amberSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 99,
    },
    memActionPill: {
      backgroundColor: COLORS.indigoSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 99,
    },
    memDeletePill: {
      backgroundColor: COLORS.roseSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 99,
    },
    editAction: { fontSize: 11, fontWeight: '800', color: COLORS.amberText },
    coverAction: { fontSize: 11, fontWeight: '800', color: COLORS.indigo },
    deleteAction: { fontSize: 11, fontWeight: '800', color: COLORS.rose },
    subtleRemoveRow: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 4 },
    subtleRemoveText: { fontSize: 11, fontWeight: '700', color: COLORS.rose },

    // Stays
    stayCard: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: COLORS.coralBorder,
      padding: 16,
      gap: 6,
      ...SHADOWS.card,
    },
    stayBadge: {
      backgroundColor: COLORS.emeraldSoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 99,
    },
    stayBadgeText: { fontSize: 10, fontWeight: '900', color: COLORS.emeraldText },
    confCode: { fontSize: 12, fontWeight: '800', color: COLORS.indigo },
    stayName: { fontSize: 16, fontWeight: '900', color: COLORS.ink, marginTop: 2 },
    stayDates: { fontSize: 12, color: COLORS.inkMuted, fontWeight: '600' },
    stayAddr: { fontSize: 12, color: COLORS.inkMuted, lineHeight: 17 },
    stayLocationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 2,
    },
    stayMapsPill: {
      backgroundColor: isDark ? COLORS.emeraldSoft : '#ECFDF5',
      borderWidth: 1,
      borderColor: COLORS.emeraldBorder,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 99,
    },
    stayMapsPillText: {
      fontSize: 11,
      fontWeight: '800',
      color: COLORS.emeraldText,
    },
    stayCostBox: {
      marginTop: 4,
      backgroundColor: COLORS.canvas,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    stayCostText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
    cppText: { fontSize: 12, fontWeight: '900', color: COLORS.coralDark },

    // Spend
    spendSummaryCard: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 16,
      gap: 10,
      ...SHADOWS.card,
    },
    spendTotal: { fontSize: 14, fontWeight: '900', color: COLORS.coralDark },
    catBar: {
      height: 10,
      borderRadius: 99,
      backgroundColor: isDark ? COLORS.surfaceMuted : '#F5F5F4',
      flexDirection: 'row',
      overflow: 'hidden',
    },
    catLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    legendChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '700' },

    expenseCard: {
      backgroundColor: COLORS.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      padding: 14,
      gap: 10,
    },
    expLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    expIconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    expMerchant: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
    expSub: { fontSize: 11, color: COLORS.inkMuted, marginTop: 2 },
    expHome: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
    peekLink: { fontSize: 11, fontWeight: '800', color: COLORS.coral },
    receiptDrawer: {
      backgroundColor: isDark ? COLORS.surfaceMuted : '#FAFAF9',
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: isDark ? COLORS.border : '#D6D3D1',
      padding: 12,
      gap: 8,
    },
    receiptPrivateBadge: { fontSize: 11, fontWeight: '800', color: COLORS.emeraldText },
    receiptImgWrap: {
      position: 'relative',
      width: '100%',
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(15,23,42,0.04)',
    },
    receiptImg: { width: '100%', height: 180, borderRadius: 8 },
    receiptExpandBadge: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      backgroundColor: 'rgba(15, 23, 42, 0.82)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.18)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 99,
    },
    receiptExpandBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    receiptMono: { fontSize: 11, color: COLORS.inkMuted, fontFamily: 'monospace', lineHeight: 16 },

    // Empty
    emptyBox: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: COLORS.border,
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink, textAlign: 'center' },
    emptySub: { fontSize: 12, color: COLORS.inkMuted, textAlign: 'center', lineHeight: 18 },
    emptyBtn: {
      marginTop: 6,
      backgroundColor: COLORS.coral,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 99,
    },
    emptyBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

    // Modals
    modalBackdrop: {
      flex: 1,
      backgroundColor: COLORS.modalBackdrop,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: COLORS.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 20,
      paddingBottom: 28,
      gap: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '900', color: COLORS.ink },
    closeX: { fontSize: 18, fontWeight: '800', color: COLORS.inkMuted, padding: 6 },
    fieldLabel: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted, marginTop: 2 },
    photoPickBtn: {
      flex: 1,
      backgroundColor: COLORS.coralSoft,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 14,
      alignItems: 'center',
    },
    photoPickText: { color: COLORS.coralDark, fontWeight: '800', fontSize: 13 },
    previewMemImg: { width: '100%', height: 150, borderRadius: 14 },
    input: {
      backgroundColor: COLORS.canvas,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: COLORS.ink,
      fontWeight: '600',
    },
    vibeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    vibeChip: {
      width: '31%',
      backgroundColor: COLORS.canvas,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 14,
      paddingVertical: 9,
      paddingHorizontal: 6,
      alignItems: 'center',
      gap: 3,
    },
    vibeChipActive: { backgroundColor: COLORS.coralSoft, borderColor: COLORS.coral, borderWidth: 2 },
    vibeText: { fontSize: 11, fontWeight: '700', color: COLORS.inkMuted },
    vibeTextActive: { color: COLORS.coralDark, fontWeight: '900' },
    resetCoverBtn: {
      backgroundColor: COLORS.amberSoft,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    resetCoverText: { fontSize: 12, fontWeight: '800', color: COLORS.amberText },
    moodChip: {
      backgroundColor: COLORS.canvas,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 99,
    },
    moodChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
    moodChipText: { fontSize: 12, fontWeight: '700', color: COLORS.ink },
    modalPrimaryBtn: {
      backgroundColor: COLORS.coral,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: 16,
      alignItems: 'center',
    },
    modalPrimaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },

    // Share Modal Cards
    shareCardWarm: {
      backgroundColor: isDark ? COLORS.coralSoft : '#FFF7ED',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: COLORS.coralBorder,
      padding: 15,
      gap: 6,
    },
    shareCardSky: {
      backgroundColor: isDark ? COLORS.skySoft : '#F0F9FF',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: COLORS.skyBorder,
      padding: 15,
      gap: 8,
    },
    shareCardHead: { fontSize: 14, fontWeight: '900', color: COLORS.coralDark },
    shareCardSub: { fontSize: 12, color: COLORS.inkMuted, lineHeight: 17 },
    inviteBtn: {
      backgroundColor: COLORS.coral,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      justifyContent: 'center',
    },
    inviteBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
    coTravelerList: { fontSize: 11, fontWeight: '700', color: COLORS.coralDark, marginTop: 4 },
    postcardShareBtn: {
      backgroundColor: COLORS.sky,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
    },
    postcardShareText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
    igBannerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      paddingVertical: 13,
      paddingHorizontal: 15,
      ...SHADOWS.card,
    },
    igLogoCircle: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    igBannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
    igBannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600', marginTop: 1 },
    igBannerArrow: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
    igLockedHintBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: COLORS.canvas,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: COLORS.coralBorder,
    },
    igLockedHintTitle: { color: COLORS.ink, fontWeight: '900', fontSize: 13 },
    igLockedHintSub: { color: COLORS.inkMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
    igLockedHintArrow: { color: COLORS.coral, fontSize: 20, fontWeight: '900' },

    // Multi-Hop Stops & Chronological Journey Timeline
    stopFilterPill: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 99,
    },
    stopFilterPillActive: {
      backgroundColor: COLORS.navy,
      borderColor: COLORS.navy,
    },
    stopFilterText: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.ink,
    },
    stopFilterTextActive: {
      color: '#FFFFFF',
    },
    polaroidMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    stopTagBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: COLORS.skySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 99,
      alignSelf: 'flex-start',
      flexShrink: 0,
    },
    stopTagEmoji: {
      fontSize: 11,
      lineHeight: 15,
      includeFontPadding: false,
    },
    stopTagBadgeText: {
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
      color: isDark ? '#7DD3FC' : '#0369A1',
      includeFontPadding: false,
    },
    stopsCard: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 14,
      gap: 10,
      ...SHADOWS.card,
    },
    stopsTitle: {
      fontSize: 14,
      fontWeight: '900',
      color: COLORS.ink,
    },
    routeTrailBox: {
      backgroundColor: COLORS.canvas,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    routeTrailText: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.ink,
      lineHeight: 18,
    },
    stopsChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    stopChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: COLORS.indigoSoft,
      borderWidth: 1,
      borderColor: COLORS.indigoBorder,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 99,
    },
    stopChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.indigo,
    },
    stopChipX: {
      fontSize: 10,
      fontWeight: '900',
      color: COLORS.indigo,
      opacity: 0.7,
    },
    suggestLabel: {
      fontSize: 9,
      fontWeight: '900',
      color: COLORS.coralDark,
      letterSpacing: 0.5,
    },
    suggestChip: {
      backgroundColor: isDark ? COLORS.coralSoft : '#FFF7ED',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: COLORS.coralBorder,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 99,
    },
    suggestChipText: {
      fontSize: 11,
      fontWeight: '800',
      color: COLORS.coralDark,
    },
    timelineDateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingLeft: 4,
      marginTop: 2,
    },
    timelineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    timelineDateText: {
      fontSize: 11,
      fontWeight: '900',
      color: COLORS.inkMuted,
      letterSpacing: 0.6,
    },
    flightCardActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    flightEditPill: {
      backgroundColor: COLORS.skySoft,
      borderWidth: 1,
      borderColor: COLORS.skyBorder,
      borderRadius: 99,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    flightEditPillText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: isDark ? '#7DD3FC' : '#0369A1',
    },
    fieldMiniLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: COLORS.inkSoft,
      letterSpacing: 0.4,
      paddingLeft: 2,
    },
    expenseFilterRow: {
      flexDirection: 'row',
      gap: 8,
    },
    expenseFilterPill: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 99,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
      alignItems: 'center',
    },
    expenseFilterPillActive: {
      backgroundColor: isDark ? COLORS.coral : COLORS.ink,
      borderColor: isDark ? COLORS.coral : COLORS.ink,
    },
    expenseFilterText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: COLORS.inkMuted,
    },
    expenseFilterTextActive: {
      color: '#FFFFFF',
    },
    perPersonHint: {
      fontSize: 11.5,
      fontWeight: '700',
      color: COLORS.emeraldText,
      marginTop: 2,
    },
    expBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    expVisBadge: {
      backgroundColor: isDark ? COLORS.surfaceMuted : '#F3F4F6',
      borderRadius: 99,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    expVisBadgeShared: {
      backgroundColor: COLORS.emeraldSoft,
    },
    expVisBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: COLORS.inkMuted,
    },
    expVisBadgeTextShared: {
      color: COLORS.emeraldText,
    },
    expAuthorText: {
      fontSize: 10.5,
      color: COLORS.inkSoft,
      fontWeight: '600',
      flexShrink: 1,
    },
    expToggleWrap: {
      gap: 6,
      marginTop: 2,
    },
    rolePillRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    rolePillBtn: {
      flex: 1,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: COLORS.card,
      borderWidth: 1.5,
      borderColor: COLORS.border,
      alignItems: 'center',
    },
    rolePillBtnActive: {
      backgroundColor: isDark ? COLORS.coral : COLORS.ink,
      borderColor: isDark ? COLORS.coral : COLORS.ink,
    },
    rolePillBtnSharedActive: {
      backgroundColor: '#15803D',
      borderColor: '#15803D',
    },
    rolePillBtnViewerActive: {
      backgroundColor: '#0369A1',
      borderColor: '#0369A1',
    },
    rolePillText: {
      fontSize: 12.5,
      fontWeight: '800',
      color: COLORS.ink,
    },
    rolePillTextActive: {
      color: '#FFFFFF',
    },
    roleHelperText: {
      fontSize: 11,
      color: COLORS.inkMuted,
      lineHeight: 16,
    },
    memberSection: {
      backgroundColor: COLORS.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      padding: 14,
      gap: 10,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.borderSoft,
    },
    memberName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.ink,
    },
    memberRowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    memberRoleBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 99,
    },
    memberRoleBadgeText: {
      fontSize: 11,
      fontWeight: '800',
    },
    memberRemoveBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: COLORS.roseSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberRemoveText: {
      fontSize: 12,
      fontWeight: '900',
      color: COLORS.rose,
    },
    memberEmptyHint: {
      fontSize: 12,
      color: COLORS.inkSoft,
      fontStyle: 'italic',
    },
    keepsakeBannerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? COLORS.cardWarm : '#FFF7ED',
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: COLORS.coralBorder,
      paddingHorizontal: 14,
      paddingVertical: 12,
      ...SHADOWS.card,
    },
    keepsakeIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.coralBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keepsakeBannerTitle: {
      fontSize: 13.5,
      fontWeight: '900',
      color: COLORS.ink,
    },
    keepsakeBannerSub: {
      fontSize: 11,
      fontWeight: '600',
      color: COLORS.inkMuted,
      marginTop: 1,
    },
    keepsakeBannerArrow: {
      fontSize: 16,
      fontWeight: '900',
      color: COLORS.coralDark,
    },
    flightRefreshPill: {
      backgroundColor: isDark ? COLORS.emeraldSoft : '#F0FDF4',
      borderWidth: 1,
      borderColor: COLORS.emeraldBorder,
      borderRadius: 99,
      paddingHorizontal: 11,
      paddingVertical: 5,
      minWidth: 96,
      alignItems: 'center',
    },
    flightRefreshPillText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: COLORS.emeraldText,
    },
  });
