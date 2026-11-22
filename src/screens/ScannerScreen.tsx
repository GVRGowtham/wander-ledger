import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import {
  formatDuration,
  inferDestinationVibe,
  lookupAirport,
} from '../db/airportsData';
import { generateId } from '../db/database';
import { parseIataBcbp, SAMPLE_BCBP_STRINGS } from '../services/bcbpParser';
import { enrichFlightDetails, FlightEnrichmentResult } from '../services/flightEnricher';
import { convertCurrency } from '../services/fxService';
import { pickAndOptimizeReceiptPhoto } from '../services/mediaService';
import { recognizeTextFromImage } from '../services/nativeOcr';
import { parseDocumentOcrText, SAMPLE_OCR_TEXTS } from '../services/ocrParser';
import { COLORS, formatMoney, SHADOWS } from '../theme/tokens';
import { ScanResult, Trip } from '../types/models';

interface Props {
  onClose: () => void;
  onSavedToTrip: (tripId: string) => void;
}

export const ScannerScreen: React.FC<Props> = ({ onClose, onSavedToTrip }) => {
  const {
    profile,
    trips,
    fxRates,
    addTrip,
    addFlight,
    addStay,
    addExpense,
  } = useApp();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [processing, setProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [enrichment, setEnrichment] = useState<FlightEnrichmentResult | null>(null);
  const [destinationChoice, setDestinationChoice] = useState<'existing' | 'new'>(
    trips.length > 0 ? 'existing' : 'new'
  );
  const [selectedTripId, setSelectedTripId] = useState<string>(trips[0]?.id ?? '');

  const homeCurrency = profile?.homeCurrency || 'USD';

  const findBestMatchingTrip = (isoDate: string): Trip | undefined => {
    const exact = trips.find((t) => isoDate >= t.startDate && isoDate <= t.endDate);
    return exact ?? trips[0];
  };

  const handleDecodedBcbp = async (rawData: string) => {
    if (processing || scanResult) return;
    const parsed = parseIataBcbp(rawData);
    if (!parsed) return;

    setProcessing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    const best = findBestMatchingTrip(parsed.flightDate);
    if (best) {
      setSelectedTripId(best.id);
      setDestinationChoice('existing');
    } else {
      setDestinationChoice('new');
    }

    const enriched = await enrichFlightDetails(parsed);
    setEnrichment(enriched);
    setScanResult(parsed);
    setProcessing(false);
  };

  const handleBarcodeScanned = (event: BarcodeScanningResult) => {
    if (event?.data) {
      handleDecodedBcbp(event.data);
    }
  };

  const handleCaptureDocumentOcr = async (source: 'camera' | 'library') => {
    setProcessing(true);
    try {
      const targetTripId = selectedTripId || 'unassigned';
      const compressedUri = await pickAndOptimizeReceiptPhoto(targetTripId, source);
      if (!compressedUri) {
        setProcessing(false);
        return;
      }

      const ocrText = await recognizeTextFromImage(compressedUri);
      if (!ocrText) {
        Alert.alert(
          'Could Not Read Text Clearly',
          'Try brighter lighting, hold steady over the bill/hotel page, or try one of the built-in test scans below.'
        );
        setProcessing(false);
        return;
      }

      // Check if OCR happened to read a BCBP string or standard receipt/hotel
      const parsed = parseDocumentOcrText(ocrText, homeCurrency, compressedUri);
      const scanDate =
        parsed.kind === 'hotel'
          ? parsed.checkIn
          : parsed.kind === 'receipt'
          ? parsed.date
          : new Date().toISOString().slice(0, 10);

      const best = findBestMatchingTrip(scanDate);
      if (best) {
        setSelectedTripId(best.id);
        setDestinationChoice('existing');
      } else {
        setDestinationChoice('new');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEnrichment(null);
      setScanResult(parsed);
    } finally {
      setProcessing(false);
    }
  };

  const triggerSampleScan = async (sample: 'flight' | 'receipt' | 'hotel') => {
    if (sample === 'flight') {
      await handleDecodedBcbp(SAMPLE_BCBP_STRINGS.tokyo);
      return;
    }
    setProcessing(true);
    const raw =
      sample === 'receipt'
        ? SAMPLE_OCR_TEXTS.ramenReceipt
        : SAMPLE_OCR_TEXTS.hotelConfirmation;
    const parsed = parseDocumentOcrText(raw, homeCurrency);
    const best = findBestMatchingTrip(
      parsed.kind === 'hotel' ? parsed.checkIn : parsed.kind === 'receipt' ? parsed.date : ''
    );
    if (best) {
      setSelectedTripId(best.id);
      setDestinationChoice('existing');
    }
    setEnrichment(null);
    setScanResult(parsed);
    setProcessing(false);
    Haptics.selectionAsync().catch(() => {});
  };

  const getAutoTripSuggestion = (): { title: string; city: string; dateStart: string; dateEnd: string } => {
    if (!scanResult) {
      const today = new Date().toISOString().slice(0, 10);
      return { title: 'New Adventure', city: 'Explore', dateStart: today, dateEnd: today };
    }
    if (scanResult.kind === 'boarding_pass') {
      const destAp = lookupAirport(scanResult.destIata);
      const city = destAp?.city ?? scanResult.destIata;
      const start = scanResult.flightDate;
      const end = addDays(start, 5);
      return {
        title: `${city} Getaway ${destAp?.flag ?? '✈️'}`,
        city,
        dateStart: start,
        dateEnd: end,
      };
    }
    if (scanResult.kind === 'hotel') {
      return {
        title: `${scanResult.hotelName} Stay`,
        city: scanResult.hotelName,
        dateStart: scanResult.checkIn,
        dateEnd: scanResult.checkOut,
      };
    }
    return {
      title: `${scanResult.merchant} Trip`,
      city: scanResult.merchant,
      dateStart: scanResult.date,
      dateEnd: addDays(scanResult.date, 3),
    };
  };

  const handleConfirmSave = () => {
    if (!scanResult) return;

    let finalTripId = selectedTripId;
    const now = new Date().toISOString();

    if (destinationChoice === 'new' || !finalTripId) {
      const auto = getAutoTripSuggestion();
      const vibeHint =
        scanResult.kind === 'boarding_pass'
          ? lookupAirport(scanResult.destIata)?.city ?? scanResult.destIata
          : auto.city;
      const inferred = inferDestinationVibe(vibeHint);
      finalTripId = generateId('trip');
      addTrip({
        id: finalTripId,
        ownerId: profile?.id || 'local_user',
        title: auto.title,
        destinationCity: inferred.country === auto.city ? auto.city : vibeHint,
        destinationCountry: inferred.country,
        countryCode: inferred.countryCode,
        flagEmoji: inferred.flag,
        startDate: auto.dateStart,
        endDate: auto.dateEnd,
        homeCurrency,
        budget: 2000,
        vibe: inferred.vibe,
        isShared: false,
        coTravelers: [],
        lat: inferred.lat,
        lng: inferred.lng,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (scanResult.kind === 'boarding_pass') {
      const originAp = lookupAirport(scanResult.originIata);
      const destAp = lookupAirport(scanResult.destIata);
      addFlight({
        id: generateId('flt'),
        tripId: finalTripId,
        airlineCode: scanResult.airlineCode,
        airlineName: scanResult.airlineName,
        flightNumber: scanResult.flightNumber,
        pnr: scanResult.pnr,
        originIata: scanResult.originIata,
        originCity: originAp?.city ?? scanResult.originIata,
        destIata: scanResult.destIata,
        destCity: destAp?.city ?? scanResult.destIata,
        departureTime: enrichment?.departureTime ?? `${scanResult.flightDate}T10:30:00Z`,
        arrivalTime: enrichment?.arrivalTime ?? `${scanResult.flightDate}T16:30:00Z`,
        durationMinutes: enrichment?.durationMinutes ?? scanResult.estimatedDurationMin,
        seat: scanResult.seat,
        cabinClass: scanResult.cabinClass,
        terminal: enrichment?.terminal,
        gate: enrichment?.gate,
        aircraft: enrichment?.aircraft,
        status: enrichment?.status ?? 'scheduled',
        distanceMiles: scanResult.distanceMiles,
        milesEarned: scanResult.distanceMiles,
        loyaltyProgram: scanResult.loyaltyProgram,
        frequentFlyerNumber: scanResult.frequentFlyerNumber,
        enrichedOnline: Boolean(enrichment?.enrichedOnline),
        rawBarcode: scanResult.rawBarcode,
        createdAt: now,
      });
    } else if (scanResult.kind === 'hotel') {
      const { converted } = convertCurrency(
        scanResult.totalAmount,
        scanResult.currency,
        homeCurrency,
        fxRates
      );
      addStay({
        id: generateId('stay'),
        tripId: finalTripId,
        name: scanResult.hotelName,
        stayType: 'hotel',
        address: scanResult.address,
        confirmationCode: scanResult.confirmationCode,
        checkIn: scanResult.checkIn,
        checkOut: scanResult.checkOut,
        nights: scanResult.nights,
        costCash: scanResult.totalAmount,
        currency: scanResult.currency,
        homeCost: converted,
        pointsRedeemed: 0,
        receiptUri: scanResult.imageUri,
        createdAt: now,
      });
    } else {
      const { converted, rate } = convertCurrency(
        scanResult.amount,
        scanResult.currency,
        homeCurrency,
        fxRates
      );
      addExpense({
        id: generateId('exp'),
        tripId: finalTripId,
        merchant: scanResult.merchant,
        category: scanResult.category,
        localAmount: scanResult.amount,
        localCurrency: scanResult.currency,
        homeAmount: converted,
        homeCurrency,
        fxRateUsed: rate,
        expenseDate: scanResult.date,
        receiptUri: scanResult.imageUri,
        receiptRawText: scanResult.rawText,
        createdAt: now,
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onSavedToTrip(finalTripId);
  };

  const autoSuggestion = getAutoTripSuggestion();

  return (
    <View style={styles.root}>
      {/* Top Bar */}
      <View style={styles.topRow}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕ Close</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📷 Smart Magic Scan</Text>
        <View style={styles.offlineTag}>
          <Text style={styles.offlineTagText}>$0 On-Device</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* STEP 1: LIVE CAMERA VIEWFINDER (when no scan result pending review) */}
        {!scanResult ? (
          <>
            <View style={styles.cameraCard}>
              {permission?.granted ? (
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{
                    barcodeTypes: ['pdf417', 'aztec', 'qr', 'datamatrix'],
                  }}
                  onBarcodeScanned={handleBarcodeScanned}
                >
                  <View style={styles.reticleWrap}>
                    <View style={styles.reticle} />
                    <Text style={styles.reticleHint}>
                      Point at any Boarding Pass barcode — auto-detects offline! ✈️
                    </Text>
                  </View>
                </CameraView>
              ) : (
                <View style={styles.permBox}>
                  <Text style={{ fontSize: 34 }}>📷</Text>
                  <Text style={styles.permTitle}>Camera Permission Needed</Text>
                  <Text style={styles.permSub}>
                    Scan airline boarding pass barcodes (PDF417/Aztec/QR) and capture hotel confirmations or restaurant bills offline.
                  </Text>
                  <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
                    <Text style={styles.permBtnText}>Enable Camera</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Capture Receipt / Hotel OCR Buttons */}
            <View style={styles.ocrActionsRow}>
              <TouchableOpacity
                onPress={() => handleCaptureDocumentOcr('camera')}
                style={{ flex: 1 }}
                disabled={processing}
              >
                <LinearGradient
                  colors={['#F97316', '#F43F5E']}
                  style={styles.ocrPrimaryBtn}
                >
                  <Text style={styles.ocrPrimaryText}>🧾 Snap Bill / Hotel</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleCaptureDocumentOcr('library')}
                style={styles.ocrSecondaryBtn}
                disabled={processing}
              >
                <Text style={styles.ocrSecondaryText}>🖼️ Pick Photo</Text>
              </TouchableOpacity>
            </View>

            {processing && (
              <View style={styles.loadingBanner}>
                <ActivityIndicator color={COLORS.coral} />
                <Text style={styles.loadingText}>Reading & enriching travel details…</Text>
              </View>
            )}

            {/* 1-Tap Instant Demo Test Scans */}
            <View style={styles.demoCard}>
              <Text style={styles.demoTitle}>🧪 Quick Test Scans (No Paper Ticket Needed!)</Text>
              <Text style={styles.demoSub}>
                Tap any sample below to test the exact offline BCBP & OCR parsing pipeline right now:
              </Text>
              <View style={styles.demoRow}>
                <TouchableOpacity
                  onPress={() => triggerSampleScan('flight')}
                  style={styles.demoChip}
                >
                  <Text style={styles.demoChipText}>✈️ ANA Pass</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => triggerSampleScan('receipt')}
                  style={styles.demoChip}
                >
                  <Text style={styles.demoChipText}>🍜 Kyoto Bill</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => triggerSampleScan('hotel')}
                  style={styles.demoChip}
                >
                  <Text style={styles.demoChipText}>🏨 Kyoto Hotel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          /* STEP 2: 1-TAP REVIEW SHEET + USER CHOICE (AUTO-CREATE VS EXISTING TRIP) */
          <View style={styles.reviewWrap}>
            <View style={styles.detectedCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.detectedBadge}>
                  {scanResult.kind === 'boarding_pass'
                    ? '✈️ BOARDING PASS DECODED'
                    : scanResult.kind === 'hotel'
                    ? '🏨 HOTEL CONFIRMATION READ'
                    : '🍜 RECEIPT READ (ON-DEVICE OCR)'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setScanResult(null);
                    setEnrichment(null);
                  }}
                >
                  <Text style={styles.rescanLink}>↺ Re-scan</Text>
                </TouchableOpacity>
              </View>

              {scanResult.kind === 'boarding_pass' && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.detectedTitle}>
                    {scanResult.airlineName.split(' ')[0]} {scanResult.flightNumber} ({scanResult.originIata} →{' '}
                    {scanResult.destIata})
                  </Text>
                  <View style={styles.gridTwo}>
                    <InfoPair label="Date" value={scanResult.flightDate} />
                    <InfoPair label="Seat / Cabin" value={`${scanResult.seat} • ${scanResult.cabinClass}`} />
                    <InfoPair
                      label="Distance & Time"
                      value={`${scanResult.distanceMiles.toLocaleString()} mi (${formatDuration(
                        enrichment?.durationMinutes ?? scanResult.estimatedDurationMin
                      )})`}
                    />
                    <InfoPair
                      label="Loyalty Miles"
                      value={`+${scanResult.distanceMiles.toLocaleString()} mi ✨`}
                    />
                  </View>
                  <View style={styles.routeNoteBox}>
                    <Text style={styles.routeNoteText}>
                      ✓ Adds to Bookings tab, draws arc on World Map & credits {scanResult.loyaltyProgram}
                      {enrichment?.enrichedOnline ? ' • Live flight API enriched!' : ' • Offline airport DB'}
                    </Text>
                  </View>
                </View>
              )}

              {scanResult.kind === 'receipt' && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.detectedTitle}>{scanResult.merchant}</Text>
                  <View style={styles.gridTwo}>
                    <InfoPair
                      label="Local Bill"
                      value={formatMoney(scanResult.amount, scanResult.currency)}
                    />
                    <InfoPair
                      label={`In ${homeCurrency}`}
                      value={formatMoney(
                        convertCurrency(scanResult.amount, scanResult.currency, homeCurrency, fxRates)
                          .converted,
                        homeCurrency
                      )}
                    />
                    <InfoPair label="Date" value={scanResult.date} />
                    <InfoPair label="Category" value={scanResult.category.toUpperCase()} />
                  </View>
                  <View style={styles.routeNoteBox}>
                    <Text style={styles.routeNoteText}>
                      🔒 Tucked safely inside the Spend tab (keeps your Polaroid Memories timeline clean!)
                    </Text>
                  </View>
                </View>
              )}

              {scanResult.kind === 'hotel' && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.detectedTitle}>{scanResult.hotelName}</Text>
                  <View style={styles.gridTwo}>
                    <InfoPair
                      label="Dates"
                      value={`${scanResult.checkIn} → ${scanResult.checkOut}`}
                    />
                    <InfoPair label="Duration" value={`${scanResult.nights} Nights`} />
                    <InfoPair
                      label="Total Paid"
                      value={formatMoney(scanResult.totalAmount, scanResult.currency)}
                    />
                    <InfoPair label="Confirmation" value={scanResult.confirmationCode || 'Saved'} />
                  </View>
                  <View style={styles.routeNoteBox}>
                    <Text style={styles.routeNoteText}>
                      ✓ Adds to Bookings tab with offline address & Spend breakdown
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* USER CHOICE: ADD TO EXISTING TRIP VS AUTO-CREATE NEW TRIP */}
            <View style={styles.choiceCard}>
              <Text style={styles.choiceTitle}>Where should we add this?</Text>

              <View style={styles.choiceGrid}>
                <TouchableOpacity
                  onPress={() => setDestinationChoice('existing')}
                  disabled={trips.length === 0}
                  style={[
                    styles.choiceBox,
                    destinationChoice === 'existing' && styles.choiceBoxActive,
                    trips.length === 0 && { opacity: 0.45 },
                  ]}
                >
                  <Text style={styles.choiceHead}>📎 Existing Trip</Text>
                  <Text style={styles.choiceSub} numberOfLines={1}>
                    {trips.find((t) => t.id === selectedTripId)?.title || 'Pick a trip'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setDestinationChoice('new')}
                  style={[
                    styles.choiceBox,
                    destinationChoice === 'new' && styles.choiceBoxActive,
                  ]}
                >
                  <Text style={styles.choiceHead}>✨ Auto-Create</Text>
                  <Text style={styles.choiceSub} numberOfLines={1}>
                    {autoSuggestion.title}
                  </Text>
                </TouchableOpacity>
              </View>

              {destinationChoice === 'existing' && trips.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingTop: 4 }}
                >
                  {trips.map((t) => {
                    const active = t.id === selectedTripId;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => setSelectedTripId(t.id)}
                        style={[styles.tripChip, active && styles.tripChipActive]}
                      >
                        <Text
                          style={[
                            styles.tripChipText,
                            active && { color: '#FFFFFF' },
                          ]}
                        >
                          {t.flagEmoji} {t.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <TouchableOpacity onPress={handleConfirmSave} activeOpacity={0.9}>
              <LinearGradient
                colors={['#F97316', '#F43F5E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmBtnText}>
                  {destinationChoice === 'new'
                    ? `✨ Create "${autoSuggestion.title}" & Save`
                    : `📎 Add to ${trips.find((t) => t.id === selectedTripId)?.title || 'Trip'}`}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const InfoPair = ({ label, value }: { label: string; value: string }) => (
  <View style={{ width: '48%' }}>
    <Text style={styles.pairLabel}>{label}</Text>
    <Text style={styles.pairValue}>{value}</Text>
  </View>
);

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  closeBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  closeBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  headerTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink },
  offlineTag: {
    backgroundColor: COLORS.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  offlineTagText: { fontSize: 11, fontWeight: '800', color: '#047857' },

  content: { padding: 16, paddingBottom: 36, gap: 14 },
  cameraCard: {
    height: 290,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1C1917',
    borderWidth: 2,
    borderColor: '#FB923C',
  },
  camera: { flex: 1 },
  reticleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  reticle: {
    width: '86%',
    height: 130,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#FDE047',
    borderStyle: 'dashed',
  },
  reticleHint: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  permBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  permTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  permSub: { color: '#D6D3D1', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  permBtn: {
    marginTop: 6,
    backgroundColor: COLORS.coral,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 99,
  },
  permBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  ocrActionsRow: { flexDirection: 'row', gap: 10 },
  ocrPrimaryBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  ocrPrimaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  ocrSecondaryBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    justifyContent: 'center',
  },
  ocrSecondaryText: { color: COLORS.ink, fontWeight: '800', fontSize: 13 },

  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: COLORS.amberSoft,
    borderRadius: 14,
  },
  loadingText: { fontSize: 13, fontWeight: '800', color: '#92400E' },

  demoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 8,
  },
  demoTitle: { fontSize: 13, fontWeight: '900', color: COLORS.ink },
  demoSub: { fontSize: 12, color: COLORS.inkMuted, lineHeight: 17 },
  demoRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  demoChip: {
    flex: 1,
    backgroundColor: COLORS.coralSoft,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  demoChipText: { fontSize: 12, fontWeight: '800', color: COLORS.coralDark },

  // Review Sheet
  reviewWrap: { gap: 14 },
  detectedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    padding: 16,
    gap: 10,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detectedBadge: { fontSize: 11, fontWeight: '900', color: COLORS.coralDark, letterSpacing: 0.4 },
  rescanLink: { fontSize: 12, fontWeight: '800', color: COLORS.sky },
  detectedTitle: { fontSize: 17, fontWeight: '900', color: COLORS.ink },
  gridTwo: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pairLabel: { fontSize: 10, fontWeight: '700', color: COLORS.inkSoft, textTransform: 'uppercase' },
  pairValue: { fontSize: 13, fontWeight: '800', color: COLORS.ink, marginTop: 2 },
  routeNoteBox: {
    backgroundColor: COLORS.emeraldSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
  },
  routeNoteText: { fontSize: 11, fontWeight: '700', color: '#047857', lineHeight: 16 },

  choiceCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 10,
  },
  choiceTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
  choiceGrid: { flexDirection: 'row', gap: 10 },
  choiceBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.canvas,
    padding: 12,
    gap: 3,
  },
  choiceBoxActive: { borderColor: COLORS.coral, backgroundColor: '#FFF7ED' },
  choiceHead: { fontSize: 13, fontWeight: '900', color: COLORS.ink },
  choiceSub: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '600' },
  tripChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  tripChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  tripChipText: { fontSize: 12, fontWeight: '700', color: COLORS.ink },

  confirmBtn: {
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: 'center',
    ...SHADOWS.fab,
  },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
});
