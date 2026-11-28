import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { DestinationBanner } from '../components/banners/DestinationBanner';
import { DatePickerField } from '../components/forms/DatePickerField';
import { CurrencySuggestionsBar } from '../components/forms/CurrencyField';
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
import { FEATURE_FLAGS } from '../config/featureFlags';
import { useApp } from '../context/AppContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { AirportInfo, inferDestinationVibe } from '../db/airportsData';
import { generateId } from '../db/database';
import { convertToKm } from '../services/distanceUtils';
import { convertCurrency } from '../services/fxService';
import { resolveDefaultFxDate } from '../services/spendCurrencyUtils';
import {
  buildManualFlight,
  buildReturnFlight,
  resolveAirportOrCity,
} from '../services/manualFlightBuilder';
import { ThemeColors, ThemeShadows, TRANSPORT_MODE_META } from '../theme/tokens';
import { DistanceUnit, Stay, TripVibe } from '../types/models';

interface Props {
  onBack: () => void;
  onCreated: (tripId: string) => void;
  onOpenScanner: () => void;
}

const VIBES: Array<{ id: TripVibe; label: string; emoji: string }> = [
  { id: 'japan', label: 'Japan', emoji: '🌸' },
  { id: 'coastal', label: 'Coastal', emoji: '🌊' },
  { id: 'alpine', label: 'Alpine', emoji: '🏔️' },
  { id: 'tropical', label: 'Tropical', emoji: '🏝️' },
  { id: 'desert', label: 'Desert', emoji: '🐪' },
  { id: 'city', label: 'City', emoji: '🌆' },
];

const STAY_TYPES: Array<{ id: Stay['stayType']; label: string }> = [
  { id: 'hotel', label: 'Hotel' },
  { id: 'airbnb', label: 'Airbnb' },
  { id: 'resort', label: 'Resort' },
  { id: 'ryokan', label: 'Ryokan' },
  { id: 'hostel', label: 'Hostel' },
];

export const NewTripScreen: React.FC<Props> = ({
  onBack,
  onCreated,
  onOpenScanner,
}) => {
  const {
    profile,
    fxRates,
    addTrip,
    addFlight,
    addTransport,
    addTripStop,
    addStay,
    addExpense,
    addMemory,
  } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const keyboardHeight = useKeyboardHeight();

  const homeCurrency = profile?.homeCurrency || 'USD';
  const distanceUnit: DistanceUnit = profile?.distanceUnit ?? 'km';
  const today = new Date();
  const fmt = (offset: number) =>
    new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);

  const [destination, setDestination] = useState('');
  const [title, setTitle] = useState('');
  const [stopsInput, setStopsInput] = useState('');
  const [startDate, setStartDate] = useState(fmt(0));
  const [endDate, setEndDate] = useState(fmt(5));
  const [budget, setBudget] = useState('');
  const [vibe, setVibe] = useState<TripVibe>('coastal');
  const [coTraveler, setCoTraveler] = useState('');
  const [tripNote, setTripNote] = useState('');

  // Expandable Travel Details (Flight OR Train/Bus/Ferry/Rental/Own Car!)
  const [showFlightSection, setShowFlightSection] = useState(true);
  const [travelTab, setTravelTab] = useState<'flight' | 'transport'>('flight');
  const [flightDraft, setFlightDraft] = useState<ManualFlightDraft>(() =>
    createEmptyFlightDraft(fmt(0), fmt(5), homeCurrency)
  );
  const [transportDraft, setTransportDraft] = useState<TransportDraft>({
    mode: 'train',
    title: '',
    operatorName: '',
    origin: '',
    destination: '',
    startDate: fmt(0),
    endDate: fmt(5),
    referenceCode: '',
    seatOrVehicle: '',
    distanceInput: '',
    costAmount: '',
    currency: homeCurrency,
    notes: '',
  });

  // Expandable Optional Stay Details
  const [showStaySection, setShowStaySection] = useState(false);
  const [stayName, setStayName] = useState('');
  const [stayType, setStayType] = useState<Stay['stayType']>('hotel');
  const [stayConf, setStayConf] = useState('');
  const [stayAddress, setStayAddress] = useState('');
  const [stayCost, setStayCost] = useState('');
  const [stayCurrency, setStayCurrency] = useState(homeCurrency);
  const [stayPoints, setStayPoints] = useState('');

  const applyDatePreset = (startOffset: number, endOffset: number) => {
    const s = fmt(startOffset);
    const e = fmt(endOffset);
    setStartDate(s);
    setEndDate(e);
    setFlightDraft((prev) => ({
      ...prev,
      flightDate: s,
      returnDate: e,
    }));
    setTransportDraft((prev) => ({
      ...prev,
      startDate: s,
      endDate: e,
    }));
  };

  const handleDestinationChange = (text: string) => {
    setDestination(text);
    if (text.trim().length >= 3) {
      const inferred = inferDestinationVibe(text);
      setVibe(inferred.vibe);
    }
  };

  const handleDestinationAirportPicked = (ap: AirportInfo) => {
    if (!destination.trim()) {
      setDestination(ap.city);
      setVibe(ap.vibe);
    }
  };

  const handleStartDateChange = (val: string) => {
    const prevStart = startDate;
    setStartDate(val);
    if (flightDraft.flightDate === prevStart) {
      setFlightDraft((prev) => ({ ...prev, flightDate: val }));
    }
    if (transportDraft.startDate === prevStart) {
      setTransportDraft((prev) => ({ ...prev, startDate: val }));
    }
  };

  const handleEndDateChange = (val: string) => {
    const prevEnd = endDate;
    setEndDate(val);
    if (flightDraft.returnDate === prevEnd) {
      setFlightDraft((prev) => ({ ...prev, returnDate: val }));
    }
    if (transportDraft.endDate === prevEnd) {
      setTransportDraft((prev) => ({ ...prev, endDate: val }));
    }
  };

  const handleCreate = () => {
    const resolvedDestFromFlight = resolveAirportOrCity(flightDraft.destInput);
    const dest =
      destination.trim() ||
      resolvedDestFromFlight?.city ||
      transportDraft.destination.trim() ||
      title.trim() ||
      flightDraft.flightNumber.trim();

    if (!dest) {
      Alert.alert(
        'Add a destination or travel leg',
        'Enter a destination, trip name, or a flight/train/road-trip route!'
      );
      return;
    }

    const inferred = resolvedDestFromFlight?.airport
      ? {
          vibe: resolvedDestFromFlight.airport.vibe,
          flag: resolvedDestFromFlight.airport.flag,
          country: resolvedDestFromFlight.airport.country,
          countryCode: resolvedDestFromFlight.airport.countryCode,
          lat: resolvedDestFromFlight.airport.lat,
          lng: resolvedDestFromFlight.airport.lng,
        }
      : inferDestinationVibe(dest);

    const id = generateId('trip');
    const now = new Date().toISOString();
    const companions = coTraveler.trim()
      ? coTraveler
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : [];
    const companionRoles = companions.reduce<Record<string, 'editor' | 'viewer'>>((acc, c) => {
      acc[c.trim().toLowerCase()] = 'editor';
      return acc;
    }, {});

    const cleanStart = startDate.trim() || fmt(0);
    const cleanEnd = endDate.trim() || cleanStart;

    addTrip({
      id,
      ownerId: profile?.id || 'local_user',
      title: title.trim() || `${dest} Trip`,
      destinationCity: dest,
      destinationCountry: inferred.country,
      countryCode: inferred.countryCode,
      flagEmoji: inferred.flag,
      startDate: cleanStart,
      endDate: cleanEnd,
      homeCurrency,
      budget: parseFloat(budget) || 0,
      vibe,
      isShared: companions.length > 0,
      shareToken: companions.length > 0 ? `wl_${id.slice(-8)}` : undefined,
      coTravelers: companions,
      coTravelerRoles: companionRoles,
      lat: inferred.lat,
      lng: inferred.lng,
      createdAt: now,
      updatedAt: now,
    });

    // Save optional multi-hop stops if entered
    if (stopsInput.trim()) {
      const stopCities = stopsInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      stopCities.forEach((cityName, idx) => {
        addTripStop({
          id: generateId('stop'),
          tripId: id,
          cityName,
          sortOrder: idx,
          createdAt: now,
        });
      });
    }

    // Save optional travel leg (Flight OR Train/Bus/Ferry/Car)
    if (travelTab === 'flight' && hasAnyFlightDraftData(flightDraft)) {
      const outbound = buildManualFlight({
        tripId: id,
        flightNumber: flightDraft.flightNumber,
        airlineName: flightDraft.airlineName,
        originInput: flightDraft.originInput,
        destInput: flightDraft.destInput,
        flightDate: flightDraft.flightDate || cleanStart,
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
        fallbackDestCity: destination.trim() || undefined,
      });
      addFlight(outbound);

      if (flightDraft.addReturnFlight) {
        const ret = buildReturnFlight(
          outbound,
          flightDraft.returnDate || cleanEnd,
          flightDraft.returnFlightNumber
        );
        addFlight(ret);
      }

      const priceNum = parseFloat(flightDraft.ticketPrice);
      if (!Number.isNaN(priceNum) && priceNum > 0) {
        const curr = (flightDraft.ticketCurrency || homeCurrency).toUpperCase();
        const { converted, rate } = convertCurrency(priceNum, curr, homeCurrency, fxRates);
        const flightExpDate = outbound.departureTime.slice(0, 10);
        addExpense({
          id: generateId('exp'),
          tripId: id,
          merchant: `${outbound.airlineName} (${outbound.flightNumber})`,
          category: 'flights',
          localAmount: priceNum,
          localCurrency: curr,
          homeAmount: converted,
          homeCurrency,
          fxRateUsed: rate,
          expenseDate: flightExpDate,
          fxDate: resolveDefaultFxDate(flightExpDate),
          createdAt: now,
        });
      }
    } else if (
      travelTab === 'transport' &&
      (transportDraft.origin.trim() ||
        transportDraft.destination.trim() ||
        transportDraft.title.trim())
    ) {
      const modeMeta = TRANSPORT_MODE_META[transportDraft.mode];
      const costNum = parseFloat(transportDraft.costAmount) || 0;
      const tCurr = (transportDraft.currency || homeCurrency).toUpperCase();
      const { converted: homeCost } =
        costNum > 0
          ? convertCurrency(costNum, tCurr, homeCurrency, fxRates)
          : { converted: 0 };
      const distVal = parseFloat(transportDraft.distanceInput);
      const distanceKm =
        !Number.isNaN(distVal) && distVal > 0
          ? convertToKm(distVal, distanceUnit)
          : undefined;
      const trnStartDate = transportDraft.startDate.trim() || cleanStart;
      addTransport({
        id: generateId('trn'),
        tripId: id,
        mode: transportDraft.mode,
        title:
          transportDraft.title.trim() ||
          `${modeMeta.label} to ${transportDraft.destination.trim() || dest}`,
        operatorName: transportDraft.operatorName.trim() || undefined,
        referenceCode: transportDraft.referenceCode.trim().toUpperCase() || undefined,
        origin: transportDraft.origin.trim() || 'Start',
        destination: transportDraft.destination.trim() || dest,
        startDate: trnStartDate,
        endDate: transportDraft.endDate.trim() || undefined,
        seatOrVehicle: transportDraft.seatOrVehicle.trim() || undefined,
        distanceKm,
        costAmount: costNum > 0 ? costNum : undefined,
        currency: costNum > 0 ? tCurr : undefined,
        homeCost: costNum > 0 ? homeCost : undefined,
        fxDate:
          costNum > 0 && !transportDraft.payLater
            ? resolveDefaultFxDate(trnStartDate)
            : undefined,
        payLater: costNum > 0 ? Boolean(transportDraft.payLater) : false,
        notes: transportDraft.notes.trim() || undefined,
        createdAt: now,
      });
    }

    // Save optional hotel/stay
    if (stayName.trim()) {
      const sCost = parseFloat(stayCost) || 0;
      const sCurr = (stayCurrency || homeCurrency).toUpperCase();
      const { converted } = convertCurrency(sCost, sCurr, homeCurrency, fxRates);
      const sPts = parseInt(stayPoints.replace(/[^0-9]/g, ''), 10) || 0;
      const d1 = new Date(`${cleanStart}T00:00:00Z`).getTime();
      const d2 = new Date(`${cleanEnd}T00:00:00Z`).getTime();
      const nights =
        !Number.isNaN(d1) && !Number.isNaN(d2)
          ? Math.max(1, Math.round((d2 - d1) / 86400000))
          : 1;

      addStay({
        id: generateId('stay'),
        tripId: id,
        name: stayName.trim(),
        stayType,
        address: stayAddress.trim() || undefined,
        confirmationCode: stayConf.trim().toUpperCase() || undefined,
        checkIn: cleanStart,
        checkOut: cleanEnd,
        nights,
        costCash: sCost,
        currency: sCurr,
        homeCost: converted,
        fxDate: sCost > 0 ? resolveDefaultFxDate(cleanStart) : undefined,
        pointsRedeemed: sPts,
        createdAt: now,
      });
    }

    // Save optional opening trip note / memory
    if (tripNote.trim()) {
      addMemory({
        id: generateId('mem'),
        tripId: id,
        title: `${dest} Notes`,
        note: tripNote.trim(),
        capturedAt: `${cleanStart}T12:00:00`,
        placeName: `${dest}, ${inferred.country}`,
        moodSticker: '✨ Trip Note',
        isHighlight: true,
        authorName: profile?.displayName.split(' ')[0] || 'You',
        createdAt: now,
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onCreated(id);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        keyboardHeight > 0 && { paddingBottom: keyboardHeight + 64 },
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.topRow}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>✨ Add a Trip</Text>
        <View style={{ width: 56 }} />
      </View>

      {/* Live Preview of Dynamic Destination Postcard */}
      <View style={styles.previewCard}>
        <DestinationBanner vibe={vibe} height={112} />
        <View style={styles.previewOverlay}>
          <Text style={styles.previewLabel}>POSTCARD PREVIEW</Text>
          <Text style={styles.previewTitle}>
            {title.trim() || destination.trim() || flightDraft.destInput.trim() || 'Your Adventure'} ✈️
          </Text>
        </View>
      </View>

      {/* Scan-to-Create Magic Shortcut */}
      <TouchableOpacity onPress={onOpenScanner} activeOpacity={0.9}>
        <LinearGradient
          colors={['#F97316', '#F43F5E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.scanShortcut}
        >
          <Text style={{ fontSize: 22 }}>📷</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Have a Boarding Pass or Hotel PDF?</Text>
            <Text style={styles.scanSub}>
              Scan it to auto-fill everything, or fill whatever you remember below!
            </Text>
          </View>
          <Text style={styles.scanArrow}>→</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Core Trip Details */}
      <View style={styles.formCard}>
        <Text style={styles.sectionHead}>🗺️ Trip Basics</Text>

        <Text style={styles.label}>Destination</Text>
        <TextInput
          value={destination}
          onChangeText={handleDestinationChange}
          placeholder="e.g. Europe, Swiss Alps, Japan, Goa"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />

        <Text style={styles.label}>Trip Name (Optional)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Swiss Alps Loop, Goa Road Trip"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />

        <Text style={styles.label}>Multi-City Stops / Hops (Optional, comma-separated)</Text>
        <TextInput
          value={stopsInput}
          onChangeText={setStopsInput}
          placeholder="e.g. Zurich, Lucerne, Interlaken"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />

        <Text style={styles.label}>When was / is this trip?</Text>
        <View style={styles.presetRow}>
          <TouchableOpacity
            onPress={() => applyDatePreset(0, 5)}
            style={styles.presetChip}
          >
            <Text style={styles.presetText}>☀️ Active Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => applyDatePreset(14, 21)}
            style={styles.presetChip}
          >
            <Text style={styles.presetText}>🎟️ Upcoming</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => applyDatePreset(-35, -30)}
            style={styles.presetChip}
          >
            <Text style={styles.presetText}>📖 Past Trip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.twoCol}>
          <DatePickerField
            label="Start Date"
            value={startDate}
            onChange={handleStartDateChange}
            placeholder="Pick start"
          />
          <DatePickerField
            label="End Date"
            value={endDate}
            onChange={handleEndDateChange}
            placeholder="Pick end"
          />
        </View>

        <Text style={styles.label}>Postcard Vibe (Auto-matched)</Text>
        <View style={styles.vibeGrid}>
          {VIBES.map((v) => {
            const active = vibe === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => setVibe(v.id)}
                style={[styles.vibeChip, active && styles.vibeChipActive]}
              >
                <Text style={styles.vibeEmoji}>{v.emoji}</Text>
                <Text style={[styles.vibeText, active && styles.vibeTextActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Budget ({homeCurrency}, Optional)</Text>
            <TextInput
              value={budget}
              onChangeText={setBudget}
              keyboardType="numeric"
              placeholder="Optional"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
            />
          </View>
          {FEATURE_FLAGS.CLOUD_COLLAB_ENABLED && (
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Co-Travelers (Optional)</Text>
              <TextInput
                value={coTraveler}
                onChangeText={setCoTraveler}
                placeholder="Names or emails"
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
          )}
        </View>
      </View>

      {/* Travel Details Section: Flight OR Train / Bus / Ferry / Car / Road Trip */}
      <View style={styles.formCard}>
        <TouchableOpacity
          onPress={() => setShowFlightSection(!showFlightSection)}
          style={styles.accordionHead}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionHead}>🧭 How are you getting there? (Optional)</Text>
            <Text style={styles.sectionSub}>
              Log a flight, train/bus/ferry, rental car, or own-car road trip — add whatever you know
            </Text>
          </View>
          <Text style={styles.chevron}>{showFlightSection ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showFlightSection && (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setTravelTab('flight')}
                style={[
                  styles.presetChip,
                  { flex: 1, alignItems: 'center' },
                  travelTab === 'flight' && styles.presetChipActive,
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.presetText,
                    travelTab === 'flight' && { color: '#FFFFFF' },
                  ]}
                >
                  ✈️ Flight
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTravelTab('transport')}
                style={[
                  styles.presetChip,
                  { flex: 1, alignItems: 'center' },
                  travelTab === 'transport' && styles.presetChipActive,
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.presetText,
                    travelTab === 'transport' && { color: '#FFFFFF' },
                  ]}
                >
                  🚆 Train / 🚗 Car
                </Text>
              </TouchableOpacity>
            </View>

            {travelTab === 'flight' ? (
              <ManualFlightFields
                draft={flightDraft}
                onChange={setFlightDraft}
                onDestinationAirportPicked={handleDestinationAirportPicked}
                homeCurrency={homeCurrency}
              />
            ) : (
              <TransportFormFields
                draft={transportDraft}
                onChange={(patch) =>
                  setTransportDraft((prev) => ({ ...prev, ...patch }))
                }
                distanceUnit={distanceUnit}
                homeCurrency={homeCurrency}
              />
            )}
          </View>
        )}
      </View>

      {/* Optional Hotel / Stay Section */}
      <View style={styles.formCard}>
        <TouchableOpacity
          onPress={() => setShowStaySection(!showStaySection)}
          style={styles.accordionHead}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionHead}>🏨 Hotel / Stay (Optional)</Text>
            <Text style={styles.sectionSub}>
              Add where you stayed, confirmation #, or points used
            </Text>
          </View>
          <Text style={styles.chevron}>{showStaySection ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showStaySection && (
          <View style={{ gap: 8 }}>
            <TextInput
              value={stayName}
              onChangeText={setStayName}
              placeholder="Hotel, Airbnb, or Resort name"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
            />
            <View style={styles.presetRow}>
              {STAY_TYPES.map((st) => {
                const active = stayType === st.id;
                return (
                  <TouchableOpacity
                    key={st.id}
                    onPress={() => setStayType(st.id)}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                  >
                    <Text style={[styles.presetText, active && { color: '#FFFFFF' }]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.twoCol}>
              <TextInput
                value={stayConf}
                onChangeText={setStayConf}
                placeholder="Confirmation # (opt)"
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="characters"
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                value={stayAddress}
                onChangeText={setStayAddress}
                placeholder="Neighborhood / address"
                placeholderTextColor={colors.inkSoft}
                style={[styles.input, { flex: 1.3 }]}
              />
            </View>
            <View style={styles.twoCol}>
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
                onChangeText={(v) =>
                  setStayCurrency(v.toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 12))
                }
                placeholder={homeCurrency || 'USD'}
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="characters"
                style={[styles.input, { width: 78, textAlign: 'center' }]}
              />
              <TextInput
                value={stayPoints}
                onChangeText={setStayPoints}
                placeholder="Points (opt)"
                placeholderTextColor={colors.inkSoft}
                keyboardType="numeric"
                style={[styles.input, { flex: 1 }]}
              />
            </View>
            <CurrencySuggestionsBar
              value={stayCurrency}
              onSelect={setStayCurrency}
              homeCurrency={homeCurrency}
            />
          </View>
        )}
      </View>

      {/* Optional Trip Notes / Memory */}
      <View style={styles.formCard}>
        <Text style={styles.sectionHead}>📝 Notes or Favorite Memory (Optional)</Text>
        <TextInput
          value={tripNote}
          onChangeText={setTripNote}
          placeholder="Anything else you remember — restaurants, people, highlights..."
          placeholderTextColor={colors.inkSoft}
          multiline
          numberOfLines={3}
          style={[styles.input, { height: 74, textAlignVertical: 'top' }]}
        />
      </View>

      <TouchableOpacity onPress={handleCreate} style={styles.createBtn} activeOpacity={0.9}>
        <Text style={styles.createBtnText}>Save Trip to Travelogue ✈️</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const createStyles = (COLORS: ThemeColors, SHADOWS: ThemeShadows) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.canvas },
    content: { padding: 16, paddingBottom: 56, gap: 14 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    backBtn: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 99,
    },
    backBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
    headerTitle: { fontSize: 16, fontWeight: '900', color: COLORS.ink, flex: 1, textAlign: 'center' },

    previewCard: {
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: COLORS.coralBorder,
      position: 'relative',
      ...SHADOWS.card,
    },
    previewOverlay: {
      position: 'absolute',
      bottom: 10,
      left: 14,
      right: 14,
      backgroundColor: 'rgba(28,25,23,0.52)',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    previewLabel: { fontSize: 9, fontWeight: '900', color: '#FDE68A', letterSpacing: 0.8 },
    previewTitle: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },

    scanShortcut: {
      borderRadius: 20,
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      ...SHADOWS.card,
    },
    scanTitle: { fontSize: 13, fontWeight: '900', color: '#FFFFFF' },
    scanSub: { fontSize: 11, color: '#FFEDD5', marginTop: 2, lineHeight: 15 },
    scanArrow: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },

    formCard: {
      backgroundColor: COLORS.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: 18,
      gap: 10,
    },
    accordionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionHead: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
    sectionSub: { fontSize: 11, color: COLORS.inkMuted, marginTop: 2, lineHeight: 16 },
    chevron: { fontSize: 12, fontWeight: '900', color: COLORS.inkMuted },
    label: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted, marginTop: 2 },
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
    presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 99,
      backgroundColor: COLORS.canvas,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    presetChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
    presetText: { fontSize: 12, fontWeight: '800', color: COLORS.inkMuted },
    vibeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    vibeChip: {
      width: '30.5%',
      backgroundColor: COLORS.canvas,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
      gap: 3,
    },
    vibeChipActive: { backgroundColor: COLORS.coralSoft, borderColor: COLORS.coral, borderWidth: 2 },
    vibeEmoji: { fontSize: 18 },
    vibeText: { fontSize: 11, fontWeight: '700', color: COLORS.inkMuted },
    vibeTextActive: { color: COLORS.coralDark, fontWeight: '900' },
    twoCol: { flexDirection: 'row', gap: 10 },
    createBtn: {
      backgroundColor: COLORS.navy,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOWS.card,
    },
    createBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  });
