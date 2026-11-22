import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
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
import { DestinationBanner } from '../components/banners/DestinationBanner';
import { BoardingPassCard } from '../components/cards/BoardingPassCard';
import { MemoryIllustration } from '../components/cards/MemoryIllustration';
import {
  createEmptyFlightDraft,
  hasAnyFlightDraftData,
  ManualFlightDraft,
  ManualFlightFields,
} from '../components/forms/ManualFlightFields';
import { useApp } from '../context/AppContext';
import { inferDestinationVibe } from '../db/airportsData';
import { generateId } from '../db/database';
import { convertCurrency } from '../services/fxService';
import {
  buildManualFlight,
  buildReturnFlight,
} from '../services/manualFlightBuilder';
import { pickAndOptimizeMemoryPhoto } from '../services/mediaService';
import {
  CATEGORY_META,
  COLORS,
  formatMoney,
  MOOD_STICKERS,
  SHADOWS,
} from '../theme/tokens';
import { ExpenseCategory, Memory, Stay, TripVibe } from '../types/models';

interface Props {
  tripId: string;
  onBack: () => void;
  onOpenScanner: () => void;
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
}) => {
  const {
    trips,
    profile,
    fxRates,
    getFlightsForTrip,
    getStaysForTrip,
    getExpensesForTrip,
    getMemoriesForTrip,
    getSummaryForTrip,
    editTrip,
    addFlight,
    removeFlight,
    addStay,
    removeStay,
    addMemory,
    removeMemory,
    addExpense,
    removeExpense,
    removeTrip,
    setTripCoverPhoto,
    saveTripSharing,
  } = useApp();

  const trip = trips.find((t) => t.id === tripId);
  const [tab, setTab] = useState<InnerTab>('memories');
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

  // Add Memory Modal
  const [memoryModal, setMemoryModal] = useState(false);
  const [memTitle, setMemTitle] = useState('');
  const [memNote, setMemNote] = useState('');
  const [memPlace, setMemPlace] = useState('');
  const [memMood, setMemMood] = useState(MOOD_STICKERS[0]);
  const [memPhotoUri, setMemPhotoUri] = useState<string | undefined>(undefined);
  const [memThumbUri, setMemThumbUri] = useState<string | undefined>(undefined);

  // Manual Flight Modal (Lost / Missing Boarding Pass)
  const [flightModal, setFlightModal] = useState(false);
  const [flightDraft, setFlightDraft] = useState<ManualFlightDraft>(() =>
    createEmptyFlightDraft(
      trip?.startDate || new Date().toISOString().slice(0, 10),
      trip?.endDate || new Date().toISOString().slice(0, 10),
      trip?.homeCurrency || 'USD',
      trip?.destinationCity || ''
    )
  );

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
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('dining');

  // Share Modal
  const [shareModal, setShareModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

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
  const stays = getStaysForTrip(trip.id);
  const expenses = getExpensesForTrip(trip.id);
  const memories = getMemoriesForTrip(trip.id);
  const summary = getSummaryForTrip(trip.id);

  // Spend breakdown by category
  const catTotals: Record<string, number> = {};
  for (const e of expenses) {
    catTotals[e.category] = (catTotals[e.category] ?? 0) + e.homeAmount;
  }
  for (const s of stays) {
    catTotals.lodging = (catTotals.lodging ?? 0) + s.homeCost;
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

  // --- MEMORIES ---
  const handlePickMemoryPhoto = async (source: 'camera' | 'library') => {
    const res = await pickAndOptimizeMemoryPhoto(trip.id, source);
    if (res) {
      setMemPhotoUri(res.photoUri);
      setMemThumbUri(res.thumbUri);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const handleSaveMemory = () => {
    if (!memTitle.trim() && !memNote.trim()) {
      Alert.alert('Add a quick note', 'Give your memory a title or short reflection!');
      return;
    }
    addMemory({
      id: generateId('mem'),
      tripId: trip.id,
      title: memTitle.trim() || `${trip.destinationCity} Moment`,
      note: memNote.trim() || 'A favorite moment from the journey ✨',
      capturedAt: new Date().toISOString().slice(0, 19),
      placeName: memPlace.trim() || `${trip.destinationCity}, ${trip.destinationCountry}`,
      photoUri: memPhotoUri,
      thumbUri: memThumbUri,
      illustrationKey: memPhotoUri ? undefined : 'torii',
      moodSticker: memMood,
      isHighlight: false,
      authorName: profile?.displayName.split(' ')[0] || 'You',
      createdAt: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
      expenseDate: new Date().toISOString().slice(0, 10),
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

  // --- FLIGHTS & STAYS ---
  const openManualFlightModal = () => {
    setFlightDraft(
      createEmptyFlightDraft(trip.startDate, trip.endDate, trip.homeCurrency, trip.destinationCity)
    );
    setFlightModal(true);
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
    const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
    if (!trip.isShared) {
      saveTripSharing(trip.id, true, trip.coTravelers, token);
    }
    const highlights = memories
      .slice(0, 3)
      .map((m) => `• ${m.moodSticker} ${m.title}`)
      .join('\n');

    await Share.share({
      title: `${trip.title} ${trip.flagEmoji} — WanderLedger Postcard`,
      message: `📮 Greetings from ${trip.title} ${trip.flagEmoji}!\n${trip.startDate} → ${trip.endDate}\n✈️ ${summary.totalMilesFlown.toLocaleString()} miles flown • 📸 ${summary.memoriesCount} memories\n\nHighlights:\n${highlights || '• Exploring and making memories!'}\n\n(Private spend & receipts stay hidden on shared postcards ✨)`,
    });
  };

  return (
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
            {trip.title} {trip.flagEmoji}
          </Text>
          <Text style={styles.tripDates} numberOfLines={1}>
            {trip.startDate} → {trip.endDate} • {formatMoney(summary.totalSpentHome, trip.homeCurrency)} •{' '}
            {summary.totalMilesFlown.toLocaleString()} mi
          </Text>
        </View>
      </View>

      {/* 3 Focused Tabs: 📸 Memories | ✈️ Bookings | 🧾 Spend */}
      <View style={styles.tabsWrap}>
        <TabPill
          active={tab === 'memories'}
          label={`📸 Memories (${memories.length})`}
          onPress={() => setTab('memories')}
        />
        <TabPill
          active={tab === 'bookings'}
          label={`✈️ Bookings (${flights.length + stays.length})`}
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
                onPress={() => setMemoryModal(true)}
                style={styles.actionPill}
                activeOpacity={0.85}
              >
                <Text style={styles.actionPillText}>+ Memory</Text>
              </TouchableOpacity>
            </View>

            {memories.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 32 }}>📸</Text>
                <Text style={styles.emptyTitle}>No memories captured yet!</Text>
                <Text style={styles.emptySub}>
                  Snap a Polaroid photo and write a quick note to start your travelogue.
                </Text>
                <TouchableOpacity
                  onPress={() => setMemoryModal(true)}
                  style={styles.emptyBtn}
                  activeOpacity={0.88}
                >
                  <Text style={styles.emptyBtnText}>📸 Capture First Memory</Text>
                </TouchableOpacity>
              </View>
            ) : (
              memories.map((m, idx) => (
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
                    <Text style={styles.polaroidNote}>{m.note}</Text>
                    <View style={styles.polaroidFooter}>
                      <View style={styles.moodTag}>
                        <Text style={styles.moodTagText}>{m.moodSticker}</Text>
                      </View>
                      <View style={styles.memoryActionGroup}>
                        {m.authorName ? (
                          <Text style={styles.authorTag}>by {m.authorName}</Text>
                        ) : null}
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
              ))
            )}
          </View>
        )}

        {/* TAB 2: PERFORATED FLIGHTS & COZY STAYS */}
        {tab === 'bookings' && (
          <View style={styles.sectionGap}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.subHeading}>✈️ Flights</Text>
              </View>
              <View style={styles.actionGroup}>
                <TouchableOpacity onPress={openManualFlightModal} style={styles.actionPillSoft} activeOpacity={0.85}>
                  <Text style={styles.actionPillSoftText}>+ Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onOpenScanner} style={styles.actionPill} activeOpacity={0.85}>
                  <Text style={styles.actionPillText}>📷 Scan</Text>
                </TouchableOpacity>
              </View>
            </View>

            {flights.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 28 }}>✈️</Text>
                <Text style={styles.emptyTitle}>No flights logged yet</Text>
                <Text style={styles.emptySub}>
                  Scan a boarding pass or booking confirmation, or log whatever details you remember manually!
                </Text>
                <TouchableOpacity onPress={openManualFlightModal} style={styles.emptyBtn} activeOpacity={0.88}>
                  <Text style={styles.emptyBtnText}>✍️ Add Flight Manually</Text>
                </TouchableOpacity>
              </View>
            ) : (
              flights.map((f) => (
                <View key={f.id} style={{ gap: 6 }}>
                  <BoardingPassCard flight={f} />
                  <TouchableOpacity
                    onPress={() => handleDeleteFlight(f.id, f.flightNumber)}
                    style={styles.subtleRemoveRow}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.subtleRemoveText}>🗑️ Remove flight</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <View style={[styles.sectionHeaderRow, { marginTop: 8 }]}>
              <View style={styles.sectionHeaderLeft}>
                <Text style={styles.subHeading}>🏨 Hotels & Stays</Text>
              </View>
              <View style={styles.actionGroup}>
                <TouchableOpacity onPress={openManualStayModal} style={styles.actionPillSoft} activeOpacity={0.85}>
                  <Text style={styles.actionPillSoftText}>+ Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onOpenScanner} style={styles.actionPill} activeOpacity={0.85}>
                  <Text style={styles.actionPillText}>📷 Scan</Text>
                </TouchableOpacity>
              </View>
            </View>

            {stays.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 28 }}>🏨</Text>
                <Text style={styles.emptyTitle}>No stays logged yet</Text>
                <Text style={styles.emptySub}>
                  Scan a hotel confirmation or add your hotel/Airbnb details manually.
                </Text>
                <TouchableOpacity onPress={openManualStayModal} style={styles.emptyBtn} activeOpacity={0.88}>
                  <Text style={styles.emptyBtnText}>✍️ Add Stay Manually</Text>
                </TouchableOpacity>
              </View>
            ) : (
              stays.map((s) => {
                const cpp =
                  s.pointsRedeemed > 0 && s.cashValueEstimate
                    ? (((s.cashValueEstimate - s.costCash) / s.pointsRedeemed) * 100).toFixed(2)
                    : null;
                return (
                  <View key={s.id} style={styles.stayCard}>
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
                  onPress={() => setExpenseModal(true)}
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
      <Modal visible={editModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>✏️ Edit Trip Details</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
            >
              <Text style={styles.fieldLabel}>Trip Name</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="e.g. Kyoto Autumn Escape"
                placeholderTextColor={COLORS.inkSoft}
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Destination City or Country</Text>
              <TextInput
                value={editDestination}
                onChangeText={setEditDestination}
                placeholder="e.g. Tokyo, Goa, Zurich"
                placeholderTextColor={COLORS.inkSoft}
                style={styles.input}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Start Date (YYYY-MM-DD)</Text>
                  <TextInput
                    value={editStartDate}
                    onChangeText={setEditStartDate}
                    placeholder="2026-10-14"
                    placeholderTextColor={COLORS.inkSoft}
                    style={styles.input}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>End Date (YYYY-MM-DD)</Text>
                  <TextInput
                    value={editEndDate}
                    onChangeText={setEditEndDate}
                    placeholder="2026-10-20"
                    placeholderTextColor={COLORS.inkSoft}
                    style={styles.input}
                  />
                </View>
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
            </ScrollView>
            <TouchableOpacity onPress={handleSaveTripEdit} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
              <Text style={styles.modalPrimaryText}>Save Trip Changes ✨</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ADD MEMORY MODAL */}
      <Modal visible={memoryModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>📸 Capture a Polaroid Memory</Text>
              <TouchableOpacity onPress={() => setMemoryModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
            >
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => handlePickMemoryPhoto('camera')}
                  style={styles.photoPickBtn}
                >
                  <Text style={styles.photoPickText}>📷 Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handlePickMemoryPhoto('library')}
                  style={styles.photoPickBtn}
                >
                  <Text style={styles.photoPickText}>🖼️ From Gallery</Text>
                </TouchableOpacity>
              </View>

              {memPhotoUri && (
                <Image
                  source={{ uri: memPhotoUri }}
                  style={styles.previewMemImg}
                  resizeMode="cover"
                />
              )}

              <TextInput
                value={memTitle}
                onChangeText={setMemTitle}
                placeholder="Moment title (e.g. Sunset at Arashiyama)"
                placeholderTextColor={COLORS.inkSoft}
                style={styles.input}
              />
              <TextInput
                value={memPlace}
                onChangeText={setMemPlace}
                placeholder="Place name (optional)"
                placeholderTextColor={COLORS.inkSoft}
                style={styles.input}
              />
              <TextInput
                value={memNote}
                onChangeText={setMemNote}
                placeholder="How did it feel? Write your little story..."
                placeholderTextColor={COLORS.inkSoft}
                multiline
                numberOfLines={3}
                style={[styles.input, { height: 78, textAlignVertical: 'top' }]}
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}
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
            </ScrollView>

            <TouchableOpacity onPress={handleSaveMemory} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
              <Text style={styles.modalPrimaryText}>Save to Polaroid Timeline ✨</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QUICK MANUAL EXPENSE MODAL */}
      <Modal visible={expenseModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>🧾 Add Quick Expense</Text>
              <TouchableOpacity onPress={() => setExpenseModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={expMerchant}
              onChangeText={setExpMerchant}
              placeholder="Merchant (e.g. Ichiran Ramen)"
              placeholderTextColor={COLORS.inkSoft}
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                value={expAmount}
                onChangeText={setExpAmount}
                placeholder="Amount"
                placeholderTextColor={COLORS.inkSoft}
                keyboardType="decimal-pad"
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                value={expCurrency}
                onChangeText={setExpCurrency}
                placeholder="USD"
                autoCapitalize="characters"
                maxLength={3}
                style={[styles.input, { width: 84, textAlign: 'center' }]}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
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
            <TouchableOpacity onPress={handleSaveExpense} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
              <Text style={styles.modalPrimaryText}>Save to Spend Ledger</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SHARE TRIP & POSTCARD MODAL */}
      <Modal visible={shareModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={[styles.modalTitle, { flex: 1 }]} numberOfLines={1}>
                💌 Share {trip.title}
              </Text>
              <TouchableOpacity onPress={() => setShareModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>

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
                Shares your Memories & trip highlights via WhatsApp/Messages — private receipts & spend stay hidden!
              </Text>
              <TouchableOpacity onPress={handleSharePostcard} style={styles.postcardShareBtn}>
                <Text style={styles.postcardShareText}>Share Postcard Now ✈️</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MANUAL FLIGHT MODAL (LOST / MISSING BOARDING PASS) */}
      <Modal visible={flightModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>✈️ Add Flight Manually</Text>
              <TouchableOpacity onPress={() => setFlightModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
            >
              <ManualFlightFields draft={flightDraft} onChange={setFlightDraft} />
            </ScrollView>
            <TouchableOpacity onPress={handleSaveManualFlight} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
              <Text style={styles.modalPrimaryText}>Save Flight to Trip ✈️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MANUAL STAY / HOTEL MODAL */}
      <Modal visible={stayModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>🏨 Add Hotel / Stay</Text>
              <TouchableOpacity onPress={() => setStayModal(false)}>
                <Text style={styles.closeX}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
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
                contentContainerStyle={{ gap: 6 }}
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={stayCheckIn}
                  onChangeText={setStayCheckIn}
                  placeholder="Check-in YYYY-MM-DD"
                  placeholderTextColor={COLORS.inkSoft}
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={stayCheckOut}
                  onChangeText={setStayCheckOut}
                  placeholder="Check-out YYYY-MM-DD"
                  placeholderTextColor={COLORS.inkSoft}
                  style={[styles.input, { flex: 1 }]}
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
            </ScrollView>
            <TouchableOpacity onPress={handleSaveManualStay} style={styles.modalPrimaryBtn} activeOpacity={0.9}>
              <Text style={styles.modalPrimaryText}>Save Stay to Trip 🏨</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  root: { flex: 1, backgroundColor: COLORS.canvas },
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
  polaroidBody: { paddingTop: 10, gap: 8 },
  polaroidTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink, flex: 1 },
  polaroidDate: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '700' },
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
});
