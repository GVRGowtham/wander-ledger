import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PixelRatio,
  ScrollView,
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
import { useApp } from '../context/AppContext';
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
import { shareImageWithCaption } from '../services/shareMediaService';
import {
  CATEGORY_META,
  COLORS,
  formatMoney,
  MOOD_STICKERS,
  SHADOWS,
  TRANSPORT_MODE_META,
} from '../theme/tokens';
import {
  DistanceUnit,
  ExpenseCategory,
  Flight,
  Memory,
  Stay,
  TripVibe,
} from '../types/models';

interface Props {
  tripId: string;
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
  onBack,
  onOpenScanner,
  onOpenIgStudio,
}) => {
  const {
    trips,
    profile,
    fxRates,
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
    removeTransport,
    addTripStop,
    removeTripStop,
    addStay,
    removeStay,
    addMemory,
    editMemory,
    removeMemory,
    addExpense,
    removeExpense,
    removeTrip,
    setTripCoverPhoto,
    saveTripSharing,
  } = useApp();

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

  // Unified Add Travel Modal (Flight OR Train / Bus / Ferry / Rental Car / Own Car)
  const [flightModal, setFlightModal] = useState(false);
  const [travelModalMode, setTravelModalMode] = useState<'flight' | 'transport'>('flight');
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

  // Add Stop / Hop Modal
  const [stopModal, setStopModal] = useState(false);
  const [stopCity, setStopCity] = useState('');
  const [stopStartDate, setStopStartDate] = useState(trip?.startDate || '');
  const [stopEndDate, setStopEndDate] = useState(trip?.endDate || '');

  // Manual Stay Modal
  const [stayModal, setStayModal] = useState(false);
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
  const [stayNotes, setStayNotes] = useState('');

  // Quick Expense Modal
  const [expenseModal, setExpenseModal] = useState(false);
  const [expMerchant, setExpMerchant] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState(trip?.homeCurrency || 'USD');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('dining');

  // Share Modal & Auto-Collage Postcard Export
  const [shareModal, setShareModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sharingPostcard, setSharingPostcard] = useState(false);
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

  const stopMap = new Map(stops.map((s) => [s.id, s]));
  const activeStopFilter =
    selectedStopFilterId && stopMap.has(selectedStopFilterId)
      ? selectedStopFilterId
      : null;
  const visibleMemories = activeStopFilter
    ? memories.filter((m) => m.stopId === activeStopFilter)
    : memories;

  const fuelExpenses = expenses.filter((e) => e.category === 'fuel');
  const fuelSpentHome = fuelExpenses.reduce((sum, e) => sum + e.homeAmount, 0);
  const timelineItems = buildJourneyTimeline(flights, transports, stays);
  const routeTrail = buildJourneyRouteTrail(flights, transports, stops);
  const suggestedStops = suggestStopsFromBookings(flights, transports, stays, stops);
  const tripGeo = deriveTripGeography(trip, flights, transports, stops);

  // Spend breakdown by category
  const catTotals: Record<string, number> = {};
  for (const e of expenses) {
    catTotals[e.category] = (catTotals[e.category] ?? 0) + e.homeAmount;
  }
  for (const s of stays) {
    catTotals.lodging = (catTotals.lodging ?? 0) + s.homeCost;
  }
  for (const t of transports) {
    if (t.homeCost && t.homeCost > 0) {
      catTotals.transit = (catTotals.transit ?? 0) + t.homeCost;
    }
  }
  const grandTotal = Math.max(1, summary.totalSpentHome);

  // --- EDIT TRIP ---
  const openEditTripModal = () => {
    setEditTitle(trip.title);
    setEditDestination(trip.destinationCity);
    setEditStartDate(trip.startDate);
    setEditEndDate(trip.endDate);
    setEditBudget(trip.budget > 0 ? String(trip.budget) : '');
    setEditCurrency(trip.homeCurrency || 'USD');
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
    setStopCity('');
    setStopStartDate(trip.startDate);
    setStopEndDate(trip.endDate);
    setStopModal(true);
  };

  const handleSaveStop = () => {
    const clean = stopCity.trim();
    if (!clean) {
      Alert.alert('City or stop name needed', 'Enter a city, town, or hop name (e.g. Lucerne).');
      return;
    }
    const newId = generateId('stop');
    addTripStop({
      id: newId,
      tripId: trip.id,
      cityName: clean,
      startDate: stopStartDate.trim() || undefined,
      endDate: stopEndDate.trim() || undefined,
      sortOrder: stops.length,
      createdAt: new Date().toISOString(),
    });
    // If adding a stop while Memory modal is open, auto-select it!
    if (memoryModal) {
      setMemStopId(newId);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    setExpCurrency(trip.homeCurrency || 'USD');
    setExpDate(new Date().toISOString().slice(0, 10));
    setExpCategory(presetCategory);
    setExpenseModal(true);
  };

  const handleSaveExpense = () => {
    const amt = parseFloat(expAmount);
    if (!expMerchant.trim() || Number.isNaN(amt) || amt <= 0) {
      Alert.alert('Check expense', 'Enter a merchant name and valid amount.');
      return;
    }
    const { converted, rate } = convertCurrency(amt, expCurrency, trip.homeCurrency, fxRates);
    addExpense({
      id: generateId('exp'),
      tripId: trip.id,
      merchant: expMerchant.trim(),
      category: expCategory,
      localAmount: amt,
      localCurrency: expCurrency.toUpperCase(),
      homeAmount: converted,
      homeCurrency: trip.homeCurrency,
      fxRateUsed: rate,
      expenseDate: expDate.trim() || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setExpMerchant('');
    setExpAmount('');
    setExpenseModal(false);
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
    setTravelModalMode(initialMode);
    setFlightDraft(
      createEmptyFlightDraft(trip.startDate, trip.endDate, trip.homeCurrency, trip.destinationCity)
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
      currency: trip.homeCurrency,
      notes: '',
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
    const tCurr = (transportDraft.currency || trip.homeCurrency).toUpperCase();
    const { converted: homeCost } =
      costNum > 0
        ? convertCurrency(costNum, tCurr, trip.homeCurrency, fxRates)
        : { converted: 0 };
    const distVal = parseFloat(transportDraft.distanceInput);
    const distanceKm =
      !Number.isNaN(distVal) && distVal > 0
        ? convertToKm(distVal, distanceUnit)
        : undefined;

    addTransport({
      id: generateId('trn'),
      tripId: trip.id,
      mode: transportDraft.mode,
      title:
        transportDraft.title.trim() ||
        `${modeMeta.label} to ${transportDraft.destination.trim() || trip.destinationCity}`,
      operatorName: transportDraft.operatorName.trim() || undefined,
      referenceCode: transportDraft.referenceCode.trim().toUpperCase() || undefined,
      origin: transportDraft.origin.trim() || 'Start',
      destination: transportDraft.destination.trim() || trip.destinationCity,
      startDate: transportDraft.startDate.trim() || trip.startDate,
      endDate: transportDraft.endDate.trim() || undefined,
      seatOrVehicle: transportDraft.seatOrVehicle.trim() || undefined,
      distanceKm,
      costAmount: costNum > 0 ? costNum : undefined,
      currency: costNum > 0 ? tCurr : undefined,
      homeCost: costNum > 0 ? homeCost : undefined,
      notes: transportDraft.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
      const curr = (flightDraft.ticketCurrency || trip.homeCurrency).toUpperCase();
      const { converted, rate } = convertCurrency(priceNum, curr, trip.homeCurrency, fxRates);
      addExpense({
        id: generateId('exp'),
        tripId: trip.id,
        merchant: `${outbound.airlineName} (${outbound.flightNumber})`,
        category: 'flights',
        localAmount: priceNum,
        localCurrency: curr,
        homeAmount: converted,
        homeCurrency: trip.homeCurrency,
        fxRateUsed: rate,
        expenseDate: outbound.departureTime.slice(0, 10),
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
    setStayName('');
    setStayType('hotel');
    setStayCheckIn(trip.startDate);
    setStayCheckOut(trip.endDate);
    setStayConf('');
    setStayAddress('');
    setStayCost('');
    setStayCurrency(trip.homeCurrency);
    setStayPoints('');
    setStayPointsProg('');
    setStayNotes('');
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
    const curr = (stayCurrency || trip.homeCurrency).toUpperCase();
    const { converted } = convertCurrency(cash, curr, trip.homeCurrency, fxRates);
    const pts = parseInt(stayPoints.replace(/[^0-9]/g, ''), 10) || 0;

    addStay({
      id: generateId('stay'),
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
      pointsRedeemed: pts,
      pointsProgram: stayPointsProg.trim() || undefined,
      notes: stayNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setStayModal(false);
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
    const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
    const nextList = Array.from(new Set([...trip.coTravelers, buddy]));
    saveTripSharing(trip.id, true, nextList, token);
    setInviteEmail('');
    Alert.alert(
      'Co-Traveler Added 💌',
      `${buddy} has been added to "${trip.title}". Share the invite link so they can join via Google Sign-In!`
    );
  };

  const handleSharePostcard = async () => {
    if (sharingPostcard) return;
    setSharingPostcard(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
      if (!trip.isShared) {
        saveTripSharing(trip.id, true, trip.coTravelers, token);
      }

      // Prefer memories that have photos so the auto-collage looks vibrant
      const sortedForCollage = [
        ...memories.filter((m) => Boolean(m.photoUri)),
        ...memories.filter((m) => !m.photoUri),
      ].slice(0, 4);

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

      setShareModal(false);
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
            <Text style={styles.glassBtnText}>← Trips</Text>
          </TouchableOpacity>
          <View style={styles.headerRightActions}>
            <TouchableOpacity onPress={openEditTripModal} style={styles.glassBtn} activeOpacity={0.85}>
              <Text style={styles.glassBtnText}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShareModal(true)} style={styles.shareGlassBtn} activeOpacity={0.85}>
              <Text style={styles.shareGlassText}>💌 Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteTrip} style={styles.iconGlassBtn} activeOpacity={0.85}>
              <Text style={styles.glassBtnText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerBottomText}>
          <Text style={styles.tripTitle} numberOfLines={1}>
            {trip.title}{' '}
            {tripGeo.visitedCountries.length > 0 ? tripGeo.flagsLabel : trip.flagEmoji}
          </Text>
          <Text style={styles.tripDates} numberOfLines={1}>
            {tripGeo.visitedCountries.length > 0 ? `${tripGeo.countriesLabel} • ` : ''}
            {trip.startDate} → {trip.endDate} • {formatMoney(summary.totalSpentHome, trip.homeCurrency)} •{' '}
            {formatDistance(summary.totalDistanceKm, distanceUnit)}
          </Text>
        </View>
      </View>

      {/* 3 Focused Tabs: 📸 Memories | 🧭 Bookings | 🧾 Spend */}
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
        <TabPill
          active={tab === 'spend'}
          label={`🧾 Spend (${expenses.length})`}
          onPress={() => setTab('spend')}
        />
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
                      <View style={styles.polaroidMetaRow}>
                        {taggedStop ? (
                          <View style={styles.stopTagBadge}>
                            <Text style={styles.stopTagBadgeText}>📍 {taggedStop.cityName}</Text>
                          </View>
                        ) : null}
                        {m.placeName ? (
                          <Text style={styles.polaroidPlace} numberOfLines={1}>
                            {taggedStop ? m.placeName : `📍 ${m.placeName}`}
                          </Text>
                        ) : null}
                      </View>
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
                  {stops.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      onLongPress={() => handleDeleteStop(s.id, s.cityName)}
                      onPress={() => handleDeleteStop(s.id, s.cityName)}
                      style={styles.stopChip}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.stopChipText}>
                        📍 {s.cityName}
                        {s.startDate ? ` • ${s.startDate.slice(5)}` : ''}
                      </Text>
                      <Text style={styles.stopChipX}>✕</Text>
                    </TouchableOpacity>
                  ))}
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
                        key={sug.cityName}
                        onPress={() =>
                          handleAcceptSuggestedStop(sug.cityName, sug.startDate, sug.endDate)
                        }
                        style={styles.suggestChip}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.suggestChipText}>
                          + 📍 {sug.cityName}
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
                        <View style={[styles.timelineDot, { backgroundColor: COLORS.sky }]} />
                        <Text style={styles.timelineDateText}>
                          {item.dateLabel}
                          {item.timeLabel ? ` • ${item.timeLabel}` : ''} • FLIGHT
                        </Text>
                      </View>
                      <BoardingPassCard flight={f} distanceUnit={distanceUnit} />
                      <View style={styles.flightCardActionsRow}>
                        <TouchableOpacity
                          onPress={() => openEditFlightModal(f)}
                          style={styles.flightEditPill}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.flightEditPillText}>✏️ Edit date &amp; time</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteFlight(f.id, f.flightNumber)}
                          style={styles.subtleRemoveRow}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.subtleRemoveText}>🗑️ Remove flight</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                if (item.kind === 'transport') {
                  const t = item.transport;
                  const meta = TRANSPORT_MODE_META[t.mode];
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
                        homeCurrency={trip.homeCurrency}
                        fuelSpentHome={fuelSpentHome}
                        fuelCount={fuelExpenses.length}
                        onLogFuel={() => openExpenseModal('fuel')}
                      />
                      <TouchableOpacity
                        onPress={() => handleDeleteTransport(t.id, t.title)}
                        style={styles.subtleRemoveRow}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.subtleRemoveText}>🗑️ Remove travel leg</Text>
                      </TouchableOpacity>
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
                      <View style={[styles.timelineDot, { backgroundColor: COLORS.indigo }]} />
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
                          <TouchableOpacity
                            onPress={() => handleDeleteStay(s.id, s.name)}
                            style={styles.memDeletePill}
                          >
                            <Text style={styles.deleteAction}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Text style={styles.stayName}>{s.name}</Text>
                      <Text style={styles.stayDates}>
                        Check-in {s.checkIn} → Check-out {s.checkOut}
                      </Text>
                      {s.address ? (
                        <Text style={styles.stayAddr}>📍 {s.address} (Saved offline)</Text>
                      ) : null}
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

        {/* TAB 3: SPEND LEDGER WITH TUCKED-AWAY PRIVATE RECEIPTS */}
        {tab === 'spend' && (
          <View style={styles.sectionGap}>
            <View style={styles.spendSummaryCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.subHeading}>💰 Spend Overview</Text>
                <Text style={styles.spendTotal}>
                  {formatMoney(summary.totalSpentHome, trip.homeCurrency)}
                  {trip.budget > 0 ? ` / ${formatMoney(trip.budget, trip.homeCurrency)}` : ''}
                </Text>
              </View>

              {/* Category Proportional Bar */}
              <View style={styles.catBar}>
                {Object.entries(catTotals).map(([cat, amt]) => {
                  const meta = CATEGORY_META[cat as ExpenseCategory] ?? CATEGORY_META.other;
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
                  const meta = CATEGORY_META[cat as ExpenseCategory] ?? CATEGORY_META.other;
                  return (
                    <View key={cat} style={styles.legendChip}>
                      <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                      <Text style={styles.legendText}>
                        {meta.label}: {formatMoney(amt, trip.homeCurrency)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.subHeading}>🧾 Bills & Receipts</Text>
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

            {expenses.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 28 }}>🧾</Text>
                <Text style={styles.emptyTitle}>No expenses logged yet</Text>
                <Text style={styles.emptySub}>
                  Scan restaurant bills in any currency — we convert them offline and keep receipts tucked neatly here!
                </Text>
              </View>
            ) : (
              expenses.map((e) => {
                const meta = CATEGORY_META[e.category] ?? CATEGORY_META.other;
                const hasReceipt = Boolean(e.receiptUri || e.receiptRawText);
                const isOpen = expandedReceiptId === e.id;
                return (
                  <TouchableOpacity
                    key={e.id}
                    onPress={() =>
                      hasReceipt && setExpandedReceiptId(isOpen ? null : e.id)
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
                            {e.merchant}
                          </Text>
                          <Text style={styles.expSub} numberOfLines={1}>
                            {e.expenseDate} • {formatMoney(e.localAmount, e.localCurrency)}
                            {hasReceipt ? ' • 🧾' : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={styles.expHome}>
                          {formatMoney(e.homeAmount, e.homeCurrency)}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {hasReceipt && (
                            <Text style={styles.peekLink}>
                              {isOpen ? 'Hide ▲' : 'Peek 🧾'}
                            </Text>
                          )}
                          <TouchableOpacity
                            onPress={() => handleDeleteExpense(e.id, e.merchant)}
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
                          🔒 Private Receipt (Hidden from shared Postcards)
                        </Text>
                        {e.receiptUri && (
                          <Image
                            source={{ uri: e.receiptUri }}
                            style={styles.receiptImg}
                            resizeMode="contain"
                          />
                        )}
                        {e.receiptRawText && (
                          <Text style={styles.receiptMono}>{e.receiptRawText}</Text>
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
          placeholderTextColor={COLORS.inkSoft}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Destination</Text>
        <TextInput
          value={editDestination}
          onChangeText={setEditDestination}
          placeholder="e.g. Europe, Swiss Alps, Japan, Goa"
          placeholderTextColor={COLORS.inkSoft}
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
              placeholderTextColor={COLORS.inkSoft}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 0.7 }}>
            <Text style={styles.fieldLabel}>Currency</Text>
            <TextInput
              value={editCurrency}
              onChangeText={(v) => setEditCurrency(v.toUpperCase())}
              placeholder="USD"
              autoCapitalize="characters"
              maxLength={3}
              style={[styles.input, { textAlign: 'center' }]}
            />
          </View>
        </View>

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
          placeholderTextColor={COLORS.inkSoft}
          style={styles.input}
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.25 }}>
            <Text style={styles.fieldLabel}>Place</Text>
            <TextInput
              value={memPlace}
              onChangeText={setMemPlace}
              placeholder="Place name (optional)"
              placeholderTextColor={COLORS.inkSoft}
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
            style={[styles.moodChip, { borderStyle: 'dashed', borderColor: COLORS.coral }]}
          >
            <Text style={[styles.moodChipText, { color: COLORS.coralDark }]}>+ Stop</Text>
          </TouchableOpacity>
        </ScrollView>

        <Text style={styles.fieldLabel}>Story / Reflection</Text>
        <TextInput
          value={memNote}
          onChangeText={setMemNote}
          placeholder="How did it feel? Write your little story..."
          placeholderTextColor={COLORS.inkSoft}
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
          placeholderTextColor={COLORS.inkSoft}
          style={styles.input}
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput
              value={expAmount}
              onChangeText={setExpAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.inkSoft}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>
          <View style={{ width: 84 }}>
            <Text style={styles.fieldLabel}>Currency</Text>
            <TextInput
              value={expCurrency}
              onChangeText={(v) => setExpCurrency(v.toUpperCase())}
              placeholder="USD"
              autoCapitalize="characters"
              maxLength={3}
              style={[styles.input, { textAlign: 'center' }]}
            />
          </View>
        </View>

        <DatePickerField
          label="Expense Date"
          value={expDate}
          onChange={setExpDate}
          placeholder="Pick date"
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map((cat) => {
            const m = CATEGORY_META[cat];
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

      {/* SHARE TRIP & POSTCARD MODAL */}
      <BottomSheetModal
        visible={shareModal}
        title={`💌 Share ${trip.title}`}
        onClose={() => setShareModal(false)}
      >
        <View style={styles.shareCardWarm}>
          <Text style={styles.shareCardHead}>✨ Invite Co-Travelers</Text>
          <Text style={styles.shareCardSub}>
            Friends sign in with Google to add their own Polaroids, flights & shared bills.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="friend@gmail.com"
              placeholderTextColor={COLORS.inkSoft}
              autoCapitalize="none"
              style={[styles.input, { flex: 1, backgroundColor: '#FFFFFF' }]}
            />
            <TouchableOpacity onPress={handleInviteBuddy} style={styles.inviteBtn}>
              <Text style={styles.inviteBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {trip.coTravelers.length > 0 && (
            <Text style={styles.coTravelerList}>
              Co-travelers: {trip.coTravelers.join(', ')}
            </Text>
          )}
        </View>

        <View style={styles.shareCardSky}>
          <Text style={[styles.shareCardHead, { color: '#0369A1' }]}>
            📮 Send Read-Only Family Postcard
          </Text>
          <Text style={styles.shareCardSub}>
            Auto-creates a 1080p photo collage postcard with your Route Stats caption in a single WhatsApp / Messages share — private receipts & spend stay hidden!
          </Text>
          <TouchableOpacity
            onPress={handleSharePostcard}
            disabled={sharingPostcard}
            style={[
              styles.postcardShareBtn,
              { flexDirection: 'row', justifyContent: 'center', gap: 8 },
              sharingPostcard && { opacity: 0.72 },
            ]}
            activeOpacity={0.88}
          >
            {sharingPostcard ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.postcardShareText}>Creating Postcard Collage…</Text>
              </>
            ) : (
              <Text style={styles.postcardShareText}>Share Postcard Collage ✈️</Text>
            )}
          </TouchableOpacity>
        </View>

        {memories.length > 0 ? (
          <TouchableOpacity
            onPress={() => {
              setShareModal(false);
              onOpenIgStudio(trip.id);
            }}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#F58529', '#DD2A7B', '#8134AF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.igBannerBtn}
            >
              <View style={styles.igLogoCircle}>
                <InstagramIcon size={18} variant="white" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.igBannerTitle}>Open Instagram Post Studio</Text>
                <Text style={styles.igBannerSub} numberOfLines={1}>
                  Export Collages, Stories, Carousels & Captions
                </Text>
              </View>
              <Text style={styles.igBannerArrow}>→</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setShareModal(false);
              setTab('memories');
              openAddMemoryModal();
            }}
            style={styles.igLockedHintBtn}
            activeOpacity={0.85}
          >
            <InstagramIcon size={18} variant="gradient" />
            <View style={{ flex: 1 }}>
              <Text style={styles.igLockedHintTitle}>Add a memory to unlock IG Post Studio</Text>
              <Text style={styles.igLockedHintSub}>
                Tap to capture your first photo & unlock collages & carousels
              </Text>
            </View>
            <Text style={styles.igLockedHintArrow}>+</Text>
          </TouchableOpacity>
        )}
      </BottomSheetModal>

      {/* UNIFIED ADD TRAVEL MODAL (FLIGHT OR TRAIN / BUS / FERRY / RENTAL / OWN CAR) */}
      <BottomSheetModal
        visible={flightModal}
        title={travelModalMode === 'flight' ? '✈️ Add Flight' : '🚆 Add Train / Car / Road Trip'}
        onClose={() => setFlightModal(false)}
        footer={
          <TouchableOpacity
            onPress={travelModalMode === 'flight' ? handleSaveManualFlight : handleSaveTransport}
            style={styles.modalPrimaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.modalPrimaryText}>
              {travelModalMode === 'flight' ? 'Save Flight to Trip ✈️' : 'Save Travel Leg 🧭'}
            </Text>
          </TouchableOpacity>
        }
      >
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

        {travelModalMode === 'flight' ? (
          <ManualFlightFields draft={flightDraft} onChange={setFlightDraft} />
        ) : (
          <TransportFormFields
            draft={transportDraft}
            onChange={(patch) => setTransportDraft((prev) => ({ ...prev, ...patch }))}
            distanceUnit={distanceUnit}
          />
        )}
      </BottomSheetModal>

      {/* ADD STOP / HOP MODAL */}
      <BottomSheetModal
        visible={stopModal}
        title="📍 Add Trip Stop / Hop"
        onClose={() => setStopModal(false)}
        footer={
          <TouchableOpacity onPress={handleSaveStop} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
            <Text style={styles.modalPrimaryText}>Add Stop to Trip 📍</Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.tinyNote}>
          Add cities or stops on multi-hop trips. Adding dates lets Wanderer's Ledger auto-match photo memories to the right stop!
        </Text>
        <Text style={styles.fieldLabel}>City / Stop Name</Text>
        <TextInput
          value={stopCity}
          onChangeText={setStopCity}
          placeholder="e.g. Lucerne, Kyoto, Coorg"
          placeholderTextColor={COLORS.inkSoft}
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
              onChangeText={(v) => setEditFltTime(v.replace(/[^0-9:]/g, '').slice(0, 5))}
              placeholder="e.g. 22:00"
              placeholderTextColor={COLORS.inkSoft}
              keyboardType="numbers-and-punctuation"
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
              placeholderTextColor={COLORS.inkSoft}
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
              placeholderTextColor={COLORS.inkSoft}
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
              placeholderTextColor={COLORS.inkSoft}
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
              placeholderTextColor={COLORS.inkSoft}
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
              placeholderTextColor={COLORS.inkSoft}
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
              placeholderTextColor={COLORS.inkSoft}
              style={styles.input}
            />
          </View>
        </View>
      </BottomSheetModal>

      {/* MANUAL STAY / HOTEL MODAL */}
      <BottomSheetModal
        visible={stayModal}
        title="🏨 Add Hotel / Stay"
        onClose={() => setStayModal(false)}
        footer={
          <TouchableOpacity onPress={handleSaveManualStay} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
            <Text style={styles.modalPrimaryText}>Save Stay to Trip 🏨</Text>
          </TouchableOpacity>
        }
      >
        <TextInput
          value={stayName}
          onChangeText={setStayName}
          placeholder="Hotel, Airbnb, or Resort name"
          placeholderTextColor={COLORS.inkSoft}
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={stayConf}
            onChangeText={setStayConf}
            placeholder="Confirmation # (opt)"
            placeholderTextColor={COLORS.inkSoft}
            autoCapitalize="characters"
            style={[styles.input, { flex: 1 }]}
          />
          <TextInput
            value={stayAddress}
            onChangeText={setStayAddress}
            placeholder="Address / Area (opt)"
            placeholderTextColor={COLORS.inkSoft}
            style={[styles.input, { flex: 1.3 }]}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={stayCost}
            onChangeText={setStayCost}
            placeholder="Cash cost (opt)"
            placeholderTextColor={COLORS.inkSoft}
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1 }]}
          />
          <TextInput
            value={stayCurrency}
            onChangeText={(v) => setStayCurrency(v.toUpperCase())}
            placeholder="USD"
            autoCapitalize="characters"
            maxLength={3}
            style={[styles.input, { width: 74, textAlign: 'center' }]}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={stayPoints}
            onChangeText={setStayPoints}
            placeholder="Points redeemed (opt)"
            placeholderTextColor={COLORS.inkSoft}
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <TextInput
            value={stayPointsProg}
            onChangeText={setStayPointsProg}
            placeholder="Program (e.g. Bonvoy)"
            placeholderTextColor={COLORS.inkSoft}
            style={[styles.input, { flex: 1 }]}
          />
        </View>
        <TextInput
          value={stayNotes}
          onChangeText={setStayNotes}
          placeholder="Notes (optional)"
          placeholderTextColor={COLORS.inkSoft}
          style={styles.input}
        />
      </BottomSheetModal>
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
}) => (
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

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  iconGlassBtn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: 6,
    ...SHADOWS.polaroid,
  },
  tapeStrip: {
    width: 64,
    height: 14,
    backgroundColor: 'rgba(253, 224, 71, 0.55)',
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
  editAction: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  coverAction: { fontSize: 11, fontWeight: '800', color: COLORS.indigo },
  deleteAction: { fontSize: 11, fontWeight: '800', color: COLORS.rose },
  subtleRemoveRow: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 4 },
  subtleRemoveText: { fontSize: 11, fontWeight: '700', color: COLORS.rose },

  // Stays
  stayCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FED7AA',
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
  stayBadgeText: { fontSize: 10, fontWeight: '900', color: '#047857' },
  confCode: { fontSize: 12, fontWeight: '800', color: COLORS.indigo },
  stayName: { fontSize: 16, fontWeight: '900', color: COLORS.ink, marginTop: 2 },
  stayDates: { fontSize: 12, color: COLORS.inkMuted, fontWeight: '600' },
  stayAddr: { fontSize: 12, color: COLORS.inkMuted },
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
    backgroundColor: '#F5F5F4',
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
    backgroundColor: '#FAFAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D6D3D1',
    padding: 12,
    gap: 8,
  },
  receiptPrivateBadge: { fontSize: 11, fontWeight: '800', color: '#047857' },
  receiptImg: { width: '100%', height: 180, borderRadius: 8 },
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
    backgroundColor: 'rgba(28, 25, 23, 0.55)',
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
  resetCoverText: { fontSize: 12, fontWeight: '800', color: '#92400E' },
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
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 15,
    gap: 6,
  },
  shareCardSky: {
    backgroundColor: '#F0F9FF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BAE6FD',
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
    borderColor: '#FDBA74',
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
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  stopTagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
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
    borderColor: '#C7D2FE',
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
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#FDBA74',
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
    borderColor: '#BAE6FD',
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  flightEditPillText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0369A1',
  },
  fieldMiniLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.inkSoft,
    letterSpacing: 0.4,
    paddingLeft: 2,
  },
});
