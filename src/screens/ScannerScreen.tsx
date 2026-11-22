import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import {
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  formatDuration,
  inferDestinationVibe,
  lookupAirline,
  lookupAirport,
} from '../db/airportsData';
import { generateId } from '../db/database';
import { parseIataBcbp, SAMPLE_BCBP_STRINGS } from '../services/bcbpParser';
import { enrichFlightDetails, FlightEnrichmentResult } from '../services/flightEnricher';
import { convertCurrency } from '../services/fxService';
import {
  compressAndSaveReceiptUri,
  pickRawDocumentFromLibrary,
} from '../services/mediaService';
import { recognizeTextWithDiagnostics } from '../services/nativeOcr';
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
  const processingRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [barcodeEnabled, setBarcodeEnabled] = useState(true);

  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [lastRawOcrText, setLastRawOcrText] = useState<string | null>(null);
  const [lastImageUri, setLastImageUri] = useState<string | undefined>(undefined);
  const [showRawText, setShowRawText] = useState(false);
  const [enrichment, setEnrichment] = useState<FlightEnrichmentResult | null>(null);
  const [destinationChoice, setDestinationChoice] = useState<'existing' | 'new'>(
    trips.length > 0 ? 'existing' : 'new'
  );
  const [selectedTripId, setSelectedTripId] = useState<string>(trips[0]?.id ?? '');

  const homeCurrency = profile?.homeCurrency || 'USD';

  const setBusy = (val: boolean, msg = '') => {
    processingRef.current = val;
    setProcessing(val);
    setStatusMessage(msg);
  };

  const findBestMatchingTrip = (isoDate: string): Trip | undefined => {
    const exact = trips.find((t) => isoDate >= t.startDate && isoDate <= t.endDate);
    return exact ?? trips[0];
  };

  const applyDestinationSuggestion = (isoDate: string) => {
    const best = findBestMatchingTrip(isoDate);
    if (best) {
      setSelectedTripId(best.id);
      setDestinationChoice('existing');
    } else {
      setDestinationChoice('new');
    }
  };

  const handleDecodedBcbp = async (rawData: string) => {
    if (processingRef.current || scanResult) return;
    const parsed = parseIataBcbp(rawData);
    if (!parsed) return;

    setBusy(true, 'Decoding boarding pass barcode…');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    applyDestinationSuggestion(parsed.flightDate);

    const enriched = await enrichFlightDetails(parsed);
    setLastRawOcrText(null);
    setLastImageUri(undefined);
    setShowRawText(false);
    setEnrichment(enriched);
    setScanResult({ ...parsed, source: 'barcode' });
    setBusy(false);
  };

  const handleBarcodeScanned = (event: BarcodeScanningResult) => {
    if (processingRef.current || scanResult) return;
    if (event?.data) {
      handleDecodedBcbp(event.data);
    }
  };

  const processOcrImageUri = async (rawUri: string) => {
    setStatusMessage('Reading text on-device (ML Kit OCR)…');
    const targetTripId = selectedTripId || 'unassigned';

    // Run ML Kit OCR directly on the crisp full-resolution capture BEFORE compressing for storage!
    const [ocrRes, savedReceiptUri] = await Promise.all([
      recognizeTextWithDiagnostics(rawUri),
      compressAndSaveReceiptUri(rawUri, targetTripId),
    ]);

    if (!ocrRes.text) {
      const detail = ocrRes.error
        ? `\n\nDetails: ${ocrRes.error}`
        : '\n\nTip: Hold steady in bright lighting, fill the frame with the confirmation text, or try Screenshot for email confirmations.';
      Alert.alert('No Readable Text Found', `Could not read text clearly from this image.${detail}`);
      return;
    }

    setStatusMessage('Extracting booking & spend details…');
    const parsed = parseDocumentOcrText(ocrRes.text, homeCurrency, savedReceiptUri);
    setLastRawOcrText(ocrRes.text);
    setLastImageUri(savedReceiptUri);
    setShowRawText(false);

    if (parsed.kind === 'boarding_pass') {
      applyDestinationSuggestion(parsed.flightDate);
      const enriched = await enrichFlightDetails(parsed);
      setEnrichment(enriched);
      setScanResult(parsed);
    } else {
      const scanDate =
        parsed.kind === 'hotel' ? parsed.checkIn : parsed.date;
      applyDestinationSuggestion(scanDate);
      setEnrichment(null);
      setScanResult(parsed);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  /**
   * Captures directly from the live in-app CameraView viewfinder — NO external camera app popup!
   * Keeps onBarcodeScanned prop stable during capture so CameraX never calls unbindAll() mid-shot.
   */
  const handleSnapLiveCamera = async () => {
    if (processingRef.current) return;
    if (!permission?.granted) {
      const perm = await requestPermission();
      if (!perm.granted) return;
    }
    if (!cameraRef.current) {
      Alert.alert('Camera Starting', 'Wait a moment for the live camera preview to load, then tap Snap again.');
      return;
    }

    setBusy(true, 'Capturing document frame…');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      let photo = null;
      try {
        photo = await cameraRef.current.takePictureAsync({
          quality: 0.85,
          exif: false,
        });
      } catch (firstErr) {
        // Fallback for Camera2-LIMITED devices that cannot bind Preview + ImageCapture + Barcode ImageAnalysis concurrently
        if (barcodeEnabled) {
          setStatusMessage('Switching camera to document mode…');
          setBarcodeEnabled(false);
          await new Promise((r) => setTimeout(r, 550));
          if (cameraRef.current) {
            photo = await cameraRef.current.takePictureAsync({
              quality: 0.85,
              exif: false,
            });
          }
        } else {
          throw firstErr;
        }
      }

      if (!photo?.uri) {
        Alert.alert('Capture Failed', 'Could not capture a photo from the live camera. Please try again.');
        return;
      }
      await processOcrImageUri(photo.uri);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected camera error';
      Alert.alert('Scan Error', `Could not scan from camera: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Lets the user pick an existing booking confirmation screenshot or receipt photo from their gallery.
   */
  const handlePickFromGallery = async () => {
    if (processingRef.current) return;
    setBusy(true, 'Opening photo library…');
    try {
      const rawUri = await pickRawDocumentFromLibrary();
      if (!rawUri) return;
      await processOcrImageUri(rawUri);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected gallery error';
      Alert.alert('Import Error', `Could not read selected image: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchParsedKind = async (kind: 'flight' | 'hotel' | 'receipt') => {
    if (!lastRawOcrText) return;
    const reparsed = parseDocumentOcrText(lastRawOcrText, homeCurrency, lastImageUri, kind);
    if (reparsed.kind === 'boarding_pass') {
      const enriched = await enrichFlightDetails(reparsed);
      setEnrichment(enriched);
    } else {
      setEnrichment(null);
    }
    setScanResult(reparsed);
    Haptics.selectionAsync().catch(() => {});
  };

  const triggerSampleScan = async (sample: 'flight' | 'booking' | 'receipt' | 'hotel') => {
    if (sample === 'flight') {
      await handleDecodedBcbp(SAMPLE_BCBP_STRINGS.tokyo);
      return;
    }
    setProcessing(true);
    setStatusMessage('Running offline OCR parser…');
    const raw =
      sample === 'booking'
        ? SAMPLE_OCR_TEXTS.flightConfirmation
        : sample === 'receipt'
        ? SAMPLE_OCR_TEXTS.ramenReceipt
        : SAMPLE_OCR_TEXTS.hotelConfirmation;

    const parsed = parseDocumentOcrText(raw, homeCurrency);
    setLastRawOcrText(raw);
    setLastImageUri(undefined);
    setShowRawText(false);

    if (parsed.kind === 'boarding_pass') {
      applyDestinationSuggestion(parsed.flightDate);
      const enriched = await enrichFlightDetails(parsed);
      setEnrichment(enriched);
    } else {
      applyDestinationSuggestion(parsed.kind === 'hotel' ? parsed.checkIn : parsed.date);
      setEnrichment(null);
    }
    setScanResult(parsed);
    setProcessing(false);
    setStatusMessage('');
    Haptics.selectionAsync().catch(() => {});
  };

  const updateFlightField = (patch: Partial<Extract<ScanResult, { kind: 'boarding_pass' }>>) => {
    setScanResult((prev) => {
      if (!prev || prev.kind !== 'boarding_pass') return prev;
      const next = { ...prev, ...patch };
      if (patch.originIata !== undefined || patch.destIata !== undefined) {
        const o = lookupAirport(next.originIata);
        const d = lookupAirport(next.destIata);
        if (o && d) {
          next.distanceMiles = calculateDistanceMiles(o.lat, o.lng, d.lat, d.lng);
          next.estimatedDurationMin = estimateFlightDurationMinutes(next.distanceMiles);
        }
      }
      if (patch.flightNumber !== undefined) {
        const m = patch.flightNumber.trim().toUpperCase().match(/^([A-Z0-9]{2})\s*[-]?\s*(\d{1,4})/);
        if (m) {
          const al = lookupAirline(m[1]);
          next.airlineCode = al.code;
          next.airlineName = al.name;
          next.loyaltyProgram = al.loyaltyProgram;
        }
      }
      return next;
    });
  };

  const updateHotelField = (patch: Partial<Extract<ScanResult, { kind: 'hotel' }>>) => {
    setScanResult((prev) => (prev && prev.kind === 'hotel' ? { ...prev, ...patch } : prev));
  };

  const updateReceiptField = (patch: Partial<Extract<ScanResult, { kind: 'receipt' }>>) => {
    setScanResult((prev) => (prev && prev.kind === 'receipt' ? { ...prev, ...patch } : prev));
  };

  const getAutoTripSuggestion = (): { title: string; city: string; dateStart: string; dateEnd: string } => {
    if (!scanResult) {
      const today = new Date().toISOString().slice(0, 10);
      return { title: 'New Adventure', city: 'Explore', dateStart: today, dateEnd: today };
    }
    if (scanResult.kind === 'boarding_pass') {
      const destAp = lookupAirport(scanResult.destIata);
      const city = destAp?.city ?? (scanResult.destIata !== 'TBD' ? scanResult.destIata : scanResult.flightNumber);
      const start = scanResult.flightDate;
      const end = addDays(start, 5);
      return {
        title: `${city} Trip ${destAp?.flag ?? '✈️'}`,
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
        budget: 0,
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
        pnr: scanResult.pnr || undefined,
        originIata: scanResult.originIata.toUpperCase(),
        originCity: originAp?.city ?? scanResult.originIata,
        destIata: scanResult.destIata.toUpperCase(),
        destCity: destAp?.city ?? scanResult.destIata,
        departureTime: enrichment?.departureTime ?? `${scanResult.flightDate}T10:30:00Z`,
        arrivalTime: enrichment?.arrivalTime ?? `${scanResult.flightDate}T16:30:00Z`,
        durationMinutes: enrichment?.durationMinutes ?? scanResult.estimatedDurationMin,
        seat: scanResult.seat || undefined,
        cabinClass: scanResult.cabinClass || undefined,
        terminal: enrichment?.terminal,
        gate: enrichment?.gate,
        aircraft: enrichment?.aircraft,
        status: enrichment?.status ?? 'scheduled',
        distanceMiles: scanResult.distanceMiles,
        milesEarned: scanResult.distanceMiles,
        loyaltyProgram: scanResult.loyaltyProgram,
        frequentFlyerNumber: scanResult.frequentFlyerNumber,
        enrichedOnline: Boolean(enrichment?.enrichedOnline),
        rawBarcode: scanResult.rawBarcode || undefined,
        createdAt: now,
      });

      // If OCR also captured the ticket fare paid on a flight confirmation, log it privately in Spend!
      if (scanResult.ticketAmount && scanResult.ticketAmount > 0) {
        const curr = scanResult.ticketCurrency || homeCurrency;
        const { converted, rate } = convertCurrency(
          scanResult.ticketAmount,
          curr,
          homeCurrency,
          fxRates
        );
        addExpense({
          id: generateId('exp'),
          tripId: finalTripId,
          merchant: `${scanResult.airlineName} (${scanResult.flightNumber})`,
          category: 'flights',
          localAmount: scanResult.ticketAmount,
          localCurrency: curr,
          homeAmount: converted,
          homeCurrency,
          fxRateUsed: rate,
          expenseDate: scanResult.flightDate,
          receiptUri: scanResult.imageUri,
          receiptRawText: scanResult.rawText,
          createdAt: now,
        });
      }
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
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          📷 Smart Scan
        </Text>
        <View style={styles.offlineTag}>
          <Text style={styles.offlineTagText}>$0 Offline</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* STEP 1: LIVE CAMERA VIEWFINDER */}
        {!scanResult ? (
          <>
            <View style={styles.cameraCard}>
              {permission?.granted ? (
                <View style={styles.camera}>
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    mode="picture"
                    facing="back"
                    onCameraReady={() => setCameraReady(true)}
                    barcodeScannerSettings={{
                      barcodeTypes: ['pdf417', 'aztec', 'qr', 'datamatrix'],
                    }}
                    onBarcodeScanned={barcodeEnabled ? handleBarcodeScanned : undefined}
                  />
                  {/* Sibling overlay (not CameraView child) */}
                  <View style={styles.reticleWrap} pointerEvents="none">
                    <View style={styles.reticle} />
                    <Text style={styles.reticleHint}>
                      Boarding pass barcodes auto-scan ✈️{'\n'}
                      For booking confirmations or bills, tap Snap below!
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.permBox}>
                  <Text style={{ fontSize: 34 }}>📷</Text>
                  <Text style={styles.permTitle}>Camera Permission Needed</Text>
                  <Text style={styles.permSub}>
                    Auto-scan boarding pass barcodes and snap flight/hotel booking confirmations or receipts offline.
                  </Text>
                  <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
                    <Text style={styles.permBtnText}>Enable Camera</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Direct Live-Snap & Gallery Screenshot OCR Buttons */}
            <View style={styles.ocrActionsRow}>
              <TouchableOpacity
                onPress={handleSnapLiveCamera}
                style={{ flex: 1.35 }}
                disabled={processing || (Boolean(permission?.granted) && !cameraReady)}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#F97316', '#F43F5E']}
                  style={[
                    styles.ocrPrimaryBtn,
                    processing && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={styles.ocrPrimaryText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {processing ? '⏳ Scanning…' : '📸 Snap & Scan'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePickFromGallery}
                style={styles.ocrSecondaryBtn}
                disabled={processing}
                activeOpacity={0.85}
              >
                <Text
                  style={styles.ocrSecondaryText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  🖼️ Screenshot
                </Text>
              </TouchableOpacity>
            </View>

            {processing && (
              <View style={styles.loadingBanner}>
                <ActivityIndicator color={COLORS.coral} />
                <Text style={styles.loadingText}>
                  {statusMessage || 'Reading & enriching travel details…'}
                </Text>
              </View>
            )}

            {/* How It Works Helper */}
            <View style={styles.howItWorksCard}>
              <Text style={styles.howTitle}>✨ What you can scan</Text>
              <Text style={styles.howLine}>
                • <Text style={styles.bold}>Boarding Pass Barcode</Text>: Auto-detects live in viewfinder (no tap needed).
              </Text>
              <Text style={styles.howLine}>
                • <Text style={styles.bold}>Flight / Hotel Booking Confirmation</Text>: Point camera & tap <Text style={styles.bold}>Snap & Scan</Text>, or pick an email <Text style={styles.bold}>Screenshot</Text>.
              </Text>
              <Text style={styles.howLine}>
                • <Text style={styles.bold}>Restaurant / Store Receipts</Text>: Snap directly to auto-convert currency & tuck privately in Spend.
              </Text>
            </View>

            {/* 1-Tap Instant Demo Test Scans */}
            <View style={styles.demoCard}>
              <Text style={styles.demoTitle}>🧪 Quick Test Scans (No Paper Ticket Needed)</Text>
              <View style={styles.demoRow}>
                <TouchableOpacity
                  onPress={() => triggerSampleScan('flight')}
                  style={styles.demoChip}
                >
                  <Text style={styles.demoChipText}>✈️ BCBP</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => triggerSampleScan('booking')}
                  style={styles.demoChip}
                >
                  <Text style={styles.demoChipText}>📩 Flight Email</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => triggerSampleScan('hotel')}
                  style={styles.demoChip}
                >
                  <Text style={styles.demoChipText}>🏨 Hotel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => triggerSampleScan('receipt')}
                  style={styles.demoChip}
                >
                  <Text style={styles.demoChipText}>🍜 Bill</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          /* STEP 2: EDITABLE 1-TAP REVIEW SHEET + USER CHOICE */
          <View style={styles.reviewWrap}>
            <View style={styles.detectedCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.detectedBadge}>
                  {scanResult.kind === 'boarding_pass'
                    ? scanResult.source === 'ocr'
                      ? '✈️ FLIGHT BOOKING READ (OCR)'
                      : '✈️ BOARDING PASS DECODED'
                    : scanResult.kind === 'hotel'
                    ? '🏨 HOTEL CONFIRMATION READ'
                    : '🧾 RECEIPT READ (OCR)'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setScanResult(null);
                    setEnrichment(null);
                    setLastRawOcrText(null);
                    setShowRawText(false);
                  }}
                >
                  <Text style={styles.rescanLink}>↺ Re-scan</Text>
                </TouchableOpacity>
              </View>

              {/* 1-tap document type override for OCR scans */}
              {lastRawOcrText && (
                <View style={styles.typeSwitchRow}>
                  <Text style={styles.typeSwitchLbl}>Type:</Text>
                  {(
                    [
                      { id: 'flight', label: '✈️ Flight', active: scanResult.kind === 'boarding_pass' },
                      { id: 'hotel', label: '🏨 Hotel', active: scanResult.kind === 'hotel' },
                      { id: 'receipt', label: '🧾 Expense', active: scanResult.kind === 'receipt' },
                    ] as const
                  ).map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleSwitchParsedKind(item.id)}
                      style={[
                        styles.typeSwitchChip,
                        item.active && styles.typeSwitchChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeSwitchText,
                          item.active && { color: '#FFFFFF' },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {scanResult.kind === 'boarding_pass' && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.detectedTitle}>
                    {scanResult.airlineName.split(' ')[0]} {scanResult.flightNumber} ({scanResult.originIata} →{' '}
                    {scanResult.destIata})
                  </Text>

                  <View style={styles.editRow}>
                    <EditableField
                      label="Flight #"
                      value={scanResult.flightNumber}
                      onChangeText={(v) => updateFlightField({ flightNumber: v.toUpperCase() })}
                    />
                    <EditableField
                      label="PNR / Ref"
                      value={scanResult.pnr}
                      placeholder="Optional"
                      onChangeText={(v) => updateFlightField({ pnr: v.toUpperCase() })}
                    />
                  </View>

                  <View style={styles.editRow}>
                    <EditableField
                      label="From (IATA)"
                      value={scanResult.originIata}
                      onChangeText={(v) => updateFlightField({ originIata: v.toUpperCase().slice(0, 3) })}
                    />
                    <EditableField
                      label="To (IATA)"
                      value={scanResult.destIata}
                      onChangeText={(v) => updateFlightField({ destIata: v.toUpperCase().slice(0, 3) })}
                    />
                    <EditableField
                      label="Date"
                      value={scanResult.flightDate}
                      onChangeText={(v) => updateFlightField({ flightDate: v })}
                    />
                  </View>

                  <View style={styles.gridTwo}>
                    <InfoPair
                      label="Distance & Time"
                      value={
                        scanResult.distanceMiles > 0
                          ? `${scanResult.distanceMiles.toLocaleString()} mi (${formatDuration(
                              enrichment?.durationMinutes ?? scanResult.estimatedDurationMin
                            )})`
                          : 'Enter IATA codes for miles'
                      }
                    />
                    <InfoPair
                      label={scanResult.ticketAmount ? 'Fare Detected' : 'Loyalty Miles'}
                      value={
                        scanResult.ticketAmount
                          ? formatMoney(
                              scanResult.ticketAmount,
                              scanResult.ticketCurrency || homeCurrency
                            )
                          : `+${scanResult.distanceMiles.toLocaleString()} mi ✨`
                      }
                    />
                  </View>

                  <View style={styles.routeNoteBox}>
                    <Text style={styles.routeNoteText}>
                      ✓ Adds to Bookings tab, World Map & {scanResult.loyaltyProgram}
                      {scanResult.ticketAmount ? ' + logs fare to Spend' : ''}
                    </Text>
                  </View>
                </View>
              )}

              {scanResult.kind === 'receipt' && (
                <View style={{ gap: 8 }}>
                  <EditableField
                    label="Merchant"
                    value={scanResult.merchant}
                    onChangeText={(v) => updateReceiptField({ merchant: v })}
                  />
                  <View style={styles.editRow}>
                    <EditableField
                      label="Amount"
                      value={String(scanResult.amount || '')}
                      keyboardType="decimal-pad"
                      onChangeText={(v) =>
                        updateReceiptField({ amount: parseFloat(v) || 0 })
                      }
                    />
                    <EditableField
                      label="Currency"
                      value={scanResult.currency}
                      onChangeText={(v) =>
                        updateReceiptField({ currency: v.toUpperCase().slice(0, 3) })
                      }
                    />
                    <EditableField
                      label="Date"
                      value={scanResult.date}
                      onChangeText={(v) => updateReceiptField({ date: v })}
                    />
                  </View>
                  <View style={styles.gridTwo}>
                    <InfoPair
                      label={`In ${homeCurrency}`}
                      value={formatMoney(
                        convertCurrency(scanResult.amount, scanResult.currency, homeCurrency, fxRates)
                          .converted,
                        homeCurrency
                      )}
                    />
                    <InfoPair label="Category" value={scanResult.category.toUpperCase()} />
                  </View>
                  <View style={styles.routeNoteBox}>
                    <Text style={styles.routeNoteText}>
                      🔒 Tucked safely inside the Spend tab (keeps Polaroid Memories clean!)
                    </Text>
                  </View>
                </View>
              )}

              {scanResult.kind === 'hotel' && (
                <View style={{ gap: 8 }}>
                  <EditableField
                    label="Hotel / Stay Name"
                    value={scanResult.hotelName}
                    onChangeText={(v) => updateHotelField({ hotelName: v })}
                  />
                  <View style={styles.editRow}>
                    <EditableField
                      label="Check-in"
                      value={scanResult.checkIn}
                      onChangeText={(v) => updateHotelField({ checkIn: v })}
                    />
                    <EditableField
                      label="Check-out"
                      value={scanResult.checkOut}
                      onChangeText={(v) => updateHotelField({ checkOut: v })}
                    />
                  </View>
                  <View style={styles.editRow}>
                    <EditableField
                      label="Total Paid"
                      value={String(scanResult.totalAmount || '')}
                      keyboardType="decimal-pad"
                      onChangeText={(v) =>
                        updateHotelField({ totalAmount: parseFloat(v) || 0 })
                      }
                    />
                    <EditableField
                      label="Currency"
                      value={scanResult.currency}
                      onChangeText={(v) =>
                        updateHotelField({ currency: v.toUpperCase().slice(0, 3) })
                      }
                    />
                    <EditableField
                      label="Conf #"
                      value={scanResult.confirmationCode || ''}
                      placeholder="Optional"
                      onChangeText={(v) => updateHotelField({ confirmationCode: v })}
                    />
                  </View>
                  <View style={styles.routeNoteBox}>
                    <Text style={styles.routeNoteText}>
                      ✓ Adds to Bookings tab ({scanResult.nights} nights) & Spend breakdown
                    </Text>
                  </View>
                </View>
              )}

              {/* Collapsible raw OCR text viewer */}
              {lastRawOcrText && (
                <View>
                  <TouchableOpacity
                    onPress={() => setShowRawText(!showRawText)}
                    style={styles.rawToggle}
                  >
                    <Text style={styles.rawToggleText}>
                      {showRawText ? '▲ Hide Raw Scanned Text' : '📄 View Raw Scanned Text'}
                    </Text>
                  </TouchableOpacity>
                  {showRawText && (
                    <View style={styles.rawBox}>
                      <Text style={styles.rawText}>{lastRawOcrText}</Text>
                    </View>
                  )}
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
                    {trips.find((t) => t.id === selectedTripId)?.title || 'No trips yet'}
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
                <Text style={styles.confirmBtnText} numberOfLines={2}>
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
  <View style={styles.infoPair}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const EditableField = ({
  label,
  value,
  placeholder,
  keyboardType,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad';
  onChangeText: (v: string) => void;
}) => (
  <View style={{ flex: 1 }}>
    <Text style={styles.editLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.inkSoft}
      keyboardType={keyboardType}
      style={styles.editInput}
    />
  </View>
);

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 99,
  },
  closeBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.ink,
    flex: 1,
    textAlign: 'center',
  },
  offlineTag: {
    backgroundColor: COLORS.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  offlineTagText: { fontSize: 10, fontWeight: '900', color: '#047857' },

  content: { padding: 16, paddingBottom: 48, gap: 14 },
  cameraCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FED7AA',
    backgroundColor: '#1C1917',
    height: 290,
    ...SHADOWS.card,
  },
  camera: { flex: 1, position: 'relative' },
  reticleWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 12,
  },
  reticle: {
    width: '88%',
    height: 155,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#FDE047',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  reticleHint: {
    backgroundColor: 'rgba(28,25,23,0.75)',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
  permBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
    backgroundColor: '#FFF7ED',
  },
  permTitle: { fontSize: 16, fontWeight: '900', color: COLORS.ink, textAlign: 'center' },
  permSub: { fontSize: 12, color: COLORS.inkMuted, textAlign: 'center', lineHeight: 18 },
  permBtn: {
    backgroundColor: COLORS.coral,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 99,
    marginTop: 6,
  },
  permBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  ocrActionsRow: { flexDirection: 'row', gap: 10 },
  ocrPrimaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  ocrPrimaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  ocrSecondaryBtn: {
    flex: 0.9,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ocrSecondaryText: { color: COLORS.ink, fontWeight: '800', fontSize: 13 },

  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.amberSoft,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  loadingText: { fontSize: 12, fontWeight: '800', color: '#92400E', flexShrink: 1 },

  howItWorksCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 6,
  },
  howTitle: { fontSize: 12, fontWeight: '900', color: COLORS.ink, marginBottom: 2 },
  howLine: { fontSize: 11, color: COLORS.inkMuted, lineHeight: 16 },
  bold: { fontWeight: '800', color: COLORS.ink },

  demoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 10,
  },
  demoTitle: { fontSize: 12, fontWeight: '900', color: COLORS.ink },
  demoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  demoChip: {
    backgroundColor: COLORS.skySoft,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  demoChipText: { fontSize: 12, fontWeight: '800', color: '#0369A1' },

  reviewWrap: { gap: 14 },
  detectedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 18,
    gap: 12,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  detectedBadge: { fontSize: 11, fontWeight: '900', color: '#047857', letterSpacing: 0.4, flex: 1 },
  rescanLink: { fontSize: 12, fontWeight: '800', color: COLORS.coralDark },
  detectedTitle: { fontSize: 17, fontWeight: '900', color: COLORS.ink },

  typeSwitchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  typeSwitchLbl: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted },
  typeSwitchChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeSwitchChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  typeSwitchText: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted },

  editRow: { flexDirection: 'row', gap: 8 },
  editLabel: { fontSize: 10, fontWeight: '800', color: COLORS.inkSoft, marginBottom: 4 },
  editInput: {
    backgroundColor: COLORS.canvas,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },

  gridTwo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoPair: {
    width: '47.5%',
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  infoLabel: { fontSize: 10, fontWeight: '700', color: COLORS.inkSoft },
  infoValue: { fontSize: 12, fontWeight: '800', color: COLORS.ink, marginTop: 2 },
  routeNoteBox: {
    backgroundColor: COLORS.emeraldSoft,
    borderRadius: 12,
    padding: 11,
  },
  routeNoteText: { fontSize: 11, fontWeight: '700', color: '#047857', lineHeight: 16 },

  rawToggle: { paddingTop: 4, alignSelf: 'flex-start' },
  rawToggleText: { fontSize: 12, fontWeight: '800', color: '#0369A1' },
  rawBox: {
    marginTop: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rawText: { fontSize: 11, fontFamily: 'monospace', color: COLORS.inkMuted, lineHeight: 16 },

  choiceCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    padding: 18,
    gap: 10,
  },
  choiceTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
  choiceGrid: { flexDirection: 'row', gap: 10 },
  choiceBox: {
    flex: 1,
    backgroundColor: COLORS.canvas,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 12,
  },
  choiceBoxActive: {
    backgroundColor: COLORS.coralSoft,
    borderColor: COLORS.coral,
    borderWidth: 2,
  },
  choiceHead: { fontSize: 13, fontWeight: '900', color: COLORS.ink },
  choiceSub: { fontSize: 11, color: COLORS.inkMuted, marginTop: 3 },
  tripChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
  },
  tripChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  tripChipText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },

  confirmBtn: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
