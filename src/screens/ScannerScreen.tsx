import React, { useEffect, useRef, useState } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { DatePickerField } from '../components/forms/DatePickerField';
import { BottomSheetModal } from '../components/layout/BottomSheetModal';
import { useApp } from '../context/AppContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import {
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  formatDuration,
  inferDestinationVibe,
  lookupAirline,
  lookupAirport,
} from '../db/airportsData';
import { generateId } from '../db/database';
import { extractDocumentWithAi } from '../services/aiDocumentExtractor';
import { parseIataBcbp } from '../services/bcbpParser';
import {
  pickMultipleDocumentImages,
  pickPdfOrImageFile,
  renderPdfPagesToJpegs,
  runMultiImageOcrAndSave,
} from '../services/documentImportService';
import { enrichFlightDetails, FlightEnrichmentResult } from '../services/flightEnricher';
import { convertCurrency } from '../services/fxService';
import { mergeOcrTexts, parseDocumentOcrText } from '../services/ocrParser';
import { COLORS, formatMoney, SHADOWS } from '../theme/tokens';
import { IncomingSharePayload, ScanResult, Trip } from '../types/models';

interface Props {
  onClose: () => void;
  onSavedToTrip: (tripId: string) => void;
  incomingShare?: IncomingSharePayload | null;
}

type CameraMode = 'document' | 'boarding_pass';

export const ScannerScreen: React.FC<Props> = ({
  onClose,
  onSavedToTrip,
  incomingShare,
}) => {
  const {
    profile,
    trips,
    fxRates,
    addTrip,
    addFlight,
    addStay,
    addExpense,
  } = useApp();
  const keyboardHeight = useKeyboardHeight();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const processingRef = useRef(false);
  const handledShareIdRef = useRef<string | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>('document');
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [barcodeEnabled, setBarcodeEnabled] = useState(true);

  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [sourceSummary, setSourceSummary] = useState('');
  const [lastRawOcrText, setLastRawOcrText] = useState<string | null>(null);
  const [lastImageUri, setLastImageUri] = useState<string | undefined>(undefined);
  const [scannedPagesCount, setScannedPagesCount] = useState(0);
  const [appendingPage, setAppendingPage] = useState(false);
  const [aiCleaning, setAiCleaning] = useState(false);
  const [aiCleanedBadge, setAiCleanedBadge] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [enrichment, setEnrichment] = useState<FlightEnrichmentResult | null>(null);

  // Paste Email / Confirmation Text Modal
  const [pasteModal, setPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState('');

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

  const applyParsedText = async (
    text: string,
    savedUri: string | undefined,
    label: string,
    pageCount: number
  ) => {
    setStatusMessage('Extracting booking & spend details…');
    const parsed = parseDocumentOcrText(text, homeCurrency, savedUri);
    setLastRawOcrText(text);
    setLastImageUri(savedUri);
    setSourceSummary(label);
    setScannedPagesCount(pageCount);
    setAiCleanedBadge(false);
    setAppendingPage(false);
    setShowRawText(false);

    if (parsed.kind === 'boarding_pass') {
      applyDestinationSuggestion(parsed.flightDate);
      const enriched = await enrichFlightDetails(parsed);
      setEnrichment(enriched);
      setScanResult(parsed);
    } else {
      const scanDate = parsed.kind === 'hotel' ? parsed.checkIn : parsed.date;
      applyDestinationSuggestion(scanDate);
      setEnrichment(null);
      setScanResult(parsed);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const processImageBatch = async (
    imageUris: string[],
    sourceLabel: string,
    mergeIntoExisting = false
  ) => {
    const targetTripId = selectedTripId || 'unassigned';
    const outcome = await runMultiImageOcrAndSave(imageUris, targetTripId, (msg) =>
      setStatusMessage(msg)
    );

    if (!outcome.mergedText) {
      const detail = outcome.error
        ? `\n\nDetails: ${outcome.error}`
        : '\n\nTip: Try turning on the Flashlight in dim lighting, importing the booking PDF, or pasting the confirmation email text.';
      Alert.alert('No Readable Text Found', `Could not read text clearly from this document.${detail}`);
      return;
    }

    if (mergeIntoExisting && lastRawOcrText) {
      const combined = mergeOcrTexts([lastRawOcrText, outcome.mergedText]);
      const totalPages = scannedPagesCount + outcome.pagesScanned;
      await applyParsedText(
        combined,
        lastImageUri ?? outcome.savedReceiptUri,
        `${totalPages} PAGES MERGED`,
        totalPages
      );
      return;
    }

    await applyParsedText(
      outcome.mergedText,
      outcome.savedReceiptUri,
      sourceLabel,
      outcome.pagesScanned
    );
  };

  // Auto-process files/images/text shared directly from Gmail, WhatsApp, Drive, or Gallery!
  useEffect(() => {
    if (!incomingShare || handledShareIdRef.current === incomingShare.id) return;
    handledShareIdRef.current = incomingShare.id;

    (async () => {
      setBusy(true, 'Reading shared booking…');
      try {
        if (incomingShare.pdfUri) {
          setStatusMessage('Rendering shared PDF pages…');
          const pageUris = await renderPdfPagesToJpegs(incomingShare.pdfUri, 3);
          if (pageUris.length === 0) {
            Alert.alert('Empty PDF', 'Could not render any readable pages from this PDF.');
            return;
          }
          await processImageBatch(
            pageUris,
            `SHARED PDF • ${pageUris.length} ${pageUris.length === 1 ? 'PAGE' : 'PAGES'}`
          );
          return;
        }

        if (incomingShare.imageUris.length > 0) {
          const count = incomingShare.imageUris.length;
          await processImageBatch(
            incomingShare.imageUris,
            count > 1 ? `${count} SHARED SCREENSHOTS` : 'SHARED IMAGE'
          );
          return;
        }

        if (incomingShare.text && incomingShare.text.trim().length > 4) {
          const bcbp = parseIataBcbp(incomingShare.text.trim());
          if (bcbp) {
            applyDestinationSuggestion(bcbp.flightDate);
            const enriched = await enrichFlightDetails(bcbp);
            setEnrichment(enriched);
            setScanResult({ ...bcbp, source: 'barcode' });
            setSourceSummary('SHARED BOARDING PASS');
            return;
          }
          await applyParsedText(incomingShare.text.trim(), undefined, 'SHARED CONFIRMATION TEXT', 1);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to read shared file.';
        Alert.alert('Shared File Error', msg);
      } finally {
        setBusy(false);
      }
    })();
  }, [incomingShare]);

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
    setSourceSummary('LIVE BARCODE');
    setScannedPagesCount(1);
    setAiCleanedBadge(false);
    setShowRawText(false);
    setEnrichment(enriched);
    setScanResult({ ...parsed, source: 'barcode' });
    setBusy(false);
  };

  const handleBarcodeScanned = (event: BarcodeScanningResult) => {
    if (cameraMode !== 'boarding_pass' || processingRef.current || scanResult) return;
    if (event?.data) {
      handleDecodedBcbp(event.data);
    }
  };

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

    setBusy(true, appendingPage ? 'Capturing next part of document…' : 'Capturing document frame…');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      let photo = null;
      try {
        photo = await cameraRef.current.takePictureAsync({
          quality: 0.9,
          exif: false,
        });
      } catch (firstErr) {
        if (barcodeEnabled) {
          setStatusMessage('Switching camera to document mode…');
          setBarcodeEnabled(false);
          await new Promise((r) => setTimeout(r, 550));
          if (cameraRef.current) {
            photo = await cameraRef.current.takePictureAsync({
              quality: 0.9,
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
      await processImageBatch([photo.uri], 'CAMERA SCAN', appendingPage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected camera error';
      Alert.alert('Scan Error', `Could not scan from camera: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePickScreenshots = async () => {
    if (processingRef.current) return;
    setBusy(true, 'Opening photo library…');
    try {
      const uris = await pickMultipleDocumentImages(3);
      if (uris.length === 0) return;
      const label =
        uris.length > 1 ? `${uris.length} SCREENSHOTS MERGED` : 'SCREENSHOT OCR';
      await processImageBatch(uris, label, appendingPage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected gallery error';
      Alert.alert('Import Error', `Could not read selected screenshot(s): ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleImportPdf = async () => {
    if (processingRef.current) return;
    setBusy(true, 'Opening file picker…');
    try {
      const picked = await pickPdfOrImageFile();
      if (!picked) return;
      if (picked.imageUris.length === 0) {
        Alert.alert('Unreadable PDF', 'Could not render pages from this PDF file.');
        return;
      }
      const label = picked.isPdf
        ? `PDF • ${picked.imageUris.length} ${picked.imageUris.length === 1 ? 'PAGE' : 'PAGES'}`
        : 'IMPORTED FILE';
      await processImageBatch(picked.imageUris, label, appendingPage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open PDF file.';
      Alert.alert('PDF Import Error', msg);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenPasteModal = async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip && clip.trim().length > 8) {
        setPastedText(clip.trim());
      }
    } catch {
      // Ignore clipboard access issues
    }
    setPasteModal(true);
  };

  const handleParsePastedText = async () => {
    const clean = pastedText.trim();
    if (clean.length < 6) {
      Alert.alert('Paste Confirmation Text', 'Paste a flight email, hotel booking confirmation, or receipt text first.');
      return;
    }
    setPasteModal(false);
    setBusy(true, 'Extracting details from confirmation text…');
    try {
      const bcbp = parseIataBcbp(clean);
      if (bcbp) {
        applyDestinationSuggestion(bcbp.flightDate);
        const enriched = await enrichFlightDetails(bcbp);
        setEnrichment(enriched);
        setScanResult({ ...bcbp, source: 'barcode' });
        setSourceSummary('PASTED BARCODE');
        return;
      }
      await applyParsedText(clean, undefined, 'EMAIL / SMS TEXT', 1);
      setPastedText('');
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
    setAiCleanedBadge(false);
    setScanResult(reparsed);
    Haptics.selectionAsync().catch(() => {});
  };

  const handleAiClean = async () => {
    if (!lastRawOcrText || aiCleaning) return;
    setAiCleaning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const preferredKind =
        scanResult?.kind === 'boarding_pass'
          ? 'flight'
          : scanResult?.kind === 'hotel'
          ? 'hotel'
          : scanResult?.kind === 'receipt'
          ? 'receipt'
          : undefined;
      const outcome = await extractDocumentWithAi(
        lastRawOcrText,
        homeCurrency,
        lastImageUri,
        preferredKind
      );
      if (outcome.result.kind === 'boarding_pass') {
        const enriched = await enrichFlightDetails(outcome.result);
        setEnrichment(enriched);
      } else {
        setEnrichment(null);
      }
      setScanResult(outcome.result);
      if (outcome.source === 'ai') {
        setAiCleanedBadge(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Alert.alert(
          'Offline Mode Active',
          'Cloud AI cleanup requires an internet connection & Gemini key on Supabase. We ran our enhanced offline extractor instead—you can still tap any field to adjust it!'
        );
      }
    } finally {
      setAiCleaning(false);
    }
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
    setScanResult((prev) => {
      if (!prev || prev.kind !== 'hotel') return prev;
      const next = { ...prev, ...patch };
      if (patch.checkIn !== undefined || patch.checkOut !== undefined) {
        const s = new Date(`${next.checkIn}T00:00:00Z`).getTime();
        const e = new Date(`${next.checkOut}T00:00:00Z`).getTime();
        if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
          next.nights = Math.max(1, Math.round((e - s) / 86400000));
        }
      }
      return next;
    });
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
      const city = scanResult.cityHint || scanResult.hotelName;
      const inferred = inferDestinationVibe(city);
      return {
        title: scanResult.cityHint ? `${scanResult.cityHint} Trip ${inferred.flag}` : `${scanResult.hotelName} Stay`,
        city,
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
  const showCameraStage = !scanResult || appendingPage;

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
        contentContainerStyle={[
          styles.content,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight + 64 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {showCameraStage ? (
          <>
            {/* Stitching Banner when capturing Part 2 of a long receipt */}
            {appendingPage && (
              <View style={styles.appendBanner}>
                <Text style={styles.appendBannerText}>
                  📄 Scanning Page {scannedPagesCount + 1} — capture the bottom half of your receipt & we'll merge it!
                </Text>
                <TouchableOpacity onPress={() => setAppendingPage(false)}>
                  <Text style={styles.appendCancel}>Back</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Adaptive Camera Mode Switcher: Tall Receipt/Doc vs Wide Boarding Pass */}
            <View style={styles.modeSwitchBar}>
              <TouchableOpacity
                onPress={() => {
                  setCameraMode('document');
                  Haptics.selectionAsync().catch(() => {});
                }}
                style={[
                  styles.modePill,
                  cameraMode === 'document' && styles.modePillActive,
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.modePillText,
                    cameraMode === 'document' && styles.modePillTextActive,
                  ]}
                  numberOfLines={1}
                >
                  🧾 Receipt / Doc
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setCameraMode('boarding_pass');
                  setBarcodeEnabled(true);
                  Haptics.selectionAsync().catch(() => {});
                }}
                style={[
                  styles.modePill,
                  cameraMode === 'boarding_pass' && styles.modePillActive,
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.modePillText,
                    cameraMode === 'boarding_pass' && styles.modePillTextActive,
                  ]}
                  numberOfLines={1}
                >
                  ✈️ Boarding Pass
                </Text>
              </TouchableOpacity>
            </View>

            {/* ADAPTIVE LIVE CAMERA VIEWFINDER */}
            <View
              style={[
                styles.cameraCard,
                cameraMode === 'document'
                  ? styles.cameraCardTall
                  : styles.cameraCardWide,
              ]}
            >
              {permission?.granted ? (
                <View style={styles.camera}>
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    mode="picture"
                    facing="back"
                    enableTorch={torchOn}
                    onCameraReady={() => setCameraReady(true)}
                    barcodeScannerSettings={{
                      barcodeTypes: ['pdf417', 'aztec', 'qr', 'datamatrix'],
                    }}
                    onBarcodeScanned={
                      cameraMode === 'boarding_pass' && barcodeEnabled
                        ? handleBarcodeScanned
                        : undefined
                    }
                  />

                  {/* Torch / Flashlight Toggle for Dim Restaurants */}
                  <TouchableOpacity
                    onPress={() => {
                      setTorchOn((t) => !t);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    style={[styles.torchBtn, torchOn && styles.torchBtnActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.torchText}>{torchOn ? '🔦 On' : '🔦 Flash'}</Text>
                  </TouchableOpacity>

                  {/* Mode-Specific Guide Overlay */}
                  <View style={styles.reticleWrap} pointerEvents="none">
                    {cameraMode === 'document' ? (
                      <>
                        <View style={styles.docFrame} />
                        <Text style={styles.reticleHint}>
                          Fill frame vertically with your hotel folio or receipt 🧾
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={styles.reticle} />
                        <Text style={styles.reticleHint}>
                          Point at boarding pass barcode — auto-scans live ✈️
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.permBox}>
                  <Text style={{ fontSize: 34 }}>📷</Text>
                  <Text style={styles.permTitle}>Camera Permission Needed</Text>
                  <Text style={styles.permSub}>
                    Snap tall hotel folios, restaurant bills, or live boarding passes—or import PDFs & screenshots below without camera!
                  </Text>
                  <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
                    <Text style={styles.permBtnText}>Enable Camera</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Primary Live Snap CTA */}
            <TouchableOpacity
              onPress={handleSnapLiveCamera}
              disabled={processing || (Boolean(permission?.granted) && !cameraReady)}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#F97316', '#F43F5E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.snapPrimaryBtn, processing && { opacity: 0.7 }]}
              >
                <Text style={styles.snapPrimaryText}>
                  {processing
                    ? '⏳ Scanning…'
                    : appendingPage
                    ? `📸 Snap Page ${scannedPagesCount + 1} & Merge`
                    : cameraMode === 'document'
                    ? '📸 Snap Receipt / Document'
                    : '📸 Snap Boarding Pass / Confirmation'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {processing && (
              <View style={styles.loadingBanner}>
                <ActivityIndicator color={COLORS.coral} />
                <Text style={styles.loadingText}>
                  {statusMessage || 'Reading & extracting travel details…'}
                </Text>
              </View>
            )}

            {/* ZERO-TYPING DIGITAL IMPORT DOCK */}
            <View style={styles.importCard}>
              <Text style={styles.importTitle}>⚡ Or Import Digitally (Zero Typing)</Text>
              <View style={styles.importGrid}>
                <TouchableOpacity
                  onPress={handleImportPdf}
                  disabled={processing}
                  style={styles.importTile}
                  activeOpacity={0.85}
                >
                  <Text style={styles.importEmoji}>📄</Text>
                  <Text style={styles.importLabel}>PDF / File</Text>
                  <Text style={styles.importSub} numberOfLines={1}>
                    Tickets & hotels
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePickScreenshots}
                  disabled={processing}
                  style={styles.importTile}
                  activeOpacity={0.85}
                >
                  <Text style={styles.importEmoji}>🖼️</Text>
                  <Text style={styles.importLabel}>Screenshots</Text>
                  <Text style={styles.importSub} numberOfLines={1}>
                    Pick 1–3 photos
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleOpenPasteModal}
                  disabled={processing}
                  style={styles.importTile}
                  activeOpacity={0.85}
                >
                  <Text style={styles.importEmoji}>📋</Text>
                  <Text style={styles.importLabel}>Paste Text</Text>
                  <Text style={styles.importSub} numberOfLines={1}>
                    Email / SMS
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Android Share Sheet Pro Tip */}
            <View style={styles.shareTipBox}>
              <Text style={styles.shareTipText}>
                💡 <Text style={styles.bold}>Fastest trick:</Text> Open any hotel PDF or flight ticket in Gmail, WhatsApp, or Photos and tap <Text style={styles.bold}>Share → Wanderer's Ledger</Text> to auto-fill instantly!
              </Text>
            </View>
          </>
        ) : (
          /* STEP 2: EDITABLE 1-TAP REVIEW SHEET */
          <View style={styles.reviewWrap}>
            <View style={styles.detectedCard}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.detectedBadge}>
                    {scanResult.kind === 'boarding_pass'
                      ? scanResult.source === 'ocr'
                        ? '✈️ FLIGHT BOOKING READ'
                        : '✈️ BOARDING PASS DECODED'
                      : scanResult.kind === 'hotel'
                      ? '🏨 HOTEL CONFIRMATION READ'
                      : '🧾 RECEIPT READ'}
                  </Text>
                  {sourceSummary ? (
                    <Text style={styles.sourceChipText}>
                      {sourceSummary}
                      {aiCleanedBadge ? ' • ✨ AI CLEANED' : ''}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.reviewHeaderBtns}>
                  {lastRawOcrText && (
                    <TouchableOpacity
                      onPress={() => {
                        setCameraMode('document');
                        setAppendingPage(true);
                      }}
                      style={styles.addPageBtn}
                    >
                      <Text style={styles.addPageBtnText}>+ Page</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setScanResult(null);
                      setEnrichment(null);
                      setLastRawOcrText(null);
                      setSourceSummary('');
                      setScannedPagesCount(0);
                      setAiCleanedBadge(false);
                      setShowRawText(false);
                    }}
                  >
                    <Text style={styles.rescanLink}>↺ Re-scan</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 1-tap document type override + Optional Phase-2 AI Clean */}
              {lastRawOcrText && (
                <View style={styles.typeSwitchRow}>
                  {(
                    [
                      { id: 'flight', label: '✈️ Flight', active: scanResult.kind === 'boarding_pass' },
                      { id: 'hotel', label: '🏨 Hotel', active: scanResult.kind === 'hotel' },
                      { id: 'receipt', label: '🧾 Spend', active: scanResult.kind === 'receipt' },
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

                  <TouchableOpacity
                    onPress={handleAiClean}
                    disabled={aiCleaning}
                    style={styles.aiCleanChip}
                    activeOpacity={0.85}
                  >
                    {aiCleaning ? (
                      <ActivityIndicator size="small" color="#6D28D9" />
                    ) : (
                      <Text style={styles.aiCleanText}>🪄 AI Clean</Text>
                    )}
                  </TouchableOpacity>
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
                  </View>

                  <DatePickerField
                    label="Flight Date"
                    value={scanResult.flightDate}
                    onChange={(v) => updateFlightField({ flightDate: v })}
                    compact
                  />

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
                  </View>
                  <DatePickerField
                    label="Receipt Date"
                    value={scanResult.date}
                    onChange={(v) => updateReceiptField({ date: v })}
                    compact
                  />
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
                    <DatePickerField
                      label="Check-in"
                      value={scanResult.checkIn}
                      onChange={(v) => updateHotelField({ checkIn: v })}
                      compact
                    />
                    <DatePickerField
                      label="Check-out"
                      value={scanResult.checkOut}
                      onChange={(v) => updateHotelField({ checkOut: v })}
                      compact
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
                      ✓ Adds to Bookings tab ({scanResult.nights} {scanResult.nights === 1 ? 'night' : 'nights'}) & Spend breakdown
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
                      {showRawText ? '▾ Hide recognized text' : '▸ View recognized text'}
                    </Text>
                  </TouchableOpacity>
                  {showRawText && (
                    <View style={styles.rawBox}>
                      <Text style={styles.rawText} selectable>
                        {lastRawOcrText}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* USER CHOICE: ADD TO EXISTING TRIP OR CREATE NEW TRIP */}
            <View style={styles.destCard}>
              <Text style={styles.destHeader}>Where should this go?</Text>

              {trips.length > 0 && (
                <TouchableOpacity
                  onPress={() => setDestinationChoice('existing')}
                  style={[
                    styles.choiceRow,
                    destinationChoice === 'existing' && styles.choiceRowActive,
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.radio}>
                    {destinationChoice === 'existing' ? '●' : '○'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceTitle}>Add to an existing Trip</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingTop: 8 }}
                    >
                      {trips.map((t) => {
                        const active = selectedTripId === t.id && destinationChoice === 'existing';
                        return (
                          <TouchableOpacity
                            key={t.id}
                            onPress={() => {
                              setSelectedTripId(t.id);
                              setDestinationChoice('existing');
                            }}
                            style={[styles.tripChip, active && styles.tripChipActive]}
                          >
                            <Text style={[styles.tripChipText, active && { color: '#FFFFFF' }]}>
                              {t.flagEmoji} {t.title}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => setDestinationChoice('new')}
                style={[
                  styles.choiceRow,
                  destinationChoice === 'new' && styles.choiceRowActive,
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.radio}>
                  {destinationChoice === 'new' ? '●' : '○'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceTitle}>✨ Create New Trip Automatically</Text>
                  <Text style={styles.choiceSub}>
                    “{autoSuggestion.title}” ({autoSuggestion.dateStart} → {autoSuggestion.dateEnd})
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Confirm CTA */}
            <TouchableOpacity onPress={handleConfirmSave} activeOpacity={0.9}>
              <LinearGradient
                colors={['#F97316', '#F43F5E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmBtnText}>
                  Save to {destinationChoice === 'new' ? 'New Trip' : 'Selected Trip'} ✓
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* PASTE EMAIL / SMS CONFIRMATION TEXT MODAL */}
      <BottomSheetModal
        visible={pasteModal}
        title="📋 Paste Booking / Receipt Text"
        onClose={() => setPasteModal(false)}
        footer={
          <TouchableOpacity
            onPress={handleParsePastedText}
            style={styles.pastePrimaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.pastePrimaryText}>Extract Details Automatically ✨</Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.pasteHint}>
          Copy a hotel confirmation email, airline ticket SMS, or booking summary from Gmail/WhatsApp and paste it below for 100% accurate zero-typing parsing.
        </Text>
        <TextInput
          value={pastedText}
          onChangeText={setPastedText}
          multiline
          placeholder="Paste confirmation text here..."
          placeholderTextColor={COLORS.inkSoft}
          style={styles.pasteInput}
        />
        <View style={styles.pasteRowBtns}>
          <TouchableOpacity
            onPress={async () => {
              const clip = await Clipboard.getStringAsync();
              if (clip) setPastedText(clip.trim());
            }}
            style={styles.pasteHelperBtn}
          >
            <Text style={styles.pasteHelperText}>📋 Paste from Clipboard</Text>
          </TouchableOpacity>
          {pastedText.length > 0 && (
            <TouchableOpacity onPress={() => setPastedText('')} style={styles.pasteClearBtn}>
              <Text style={styles.pasteClearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </BottomSheetModal>
    </View>
  );
};

const InfoPair = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoPair}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoVal} numberOfLines={2}>
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
  onChangeText: (val: string) => void;
}) => (
  <View style={styles.editField}>
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

  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 12 },

  appendBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  appendBannerText: { flex: 1, fontSize: 12, fontWeight: '800', color: '#1E40AF', lineHeight: 16 },
  appendCancel: { fontSize: 12, fontWeight: '900', color: COLORS.coralDark },

  modeSwitchBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modePill: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modePillActive: { backgroundColor: COLORS.navy },
  modePillText: { fontSize: 12.5, fontWeight: '800', color: COLORS.inkMuted },
  modePillTextActive: { color: '#FFFFFF' },

  cameraCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FED7AA',
    backgroundColor: '#1C1917',
    ...SHADOWS.card,
  },
  cameraCardTall: { height: 390 },
  cameraCardWide: { height: 248 },
  camera: { flex: 1, position: 'relative' },
  torchBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 4,
    backgroundColor: 'rgba(15,23,42,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 99,
  },
  torchBtnActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#FDE68A',
  },
  torchText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  reticleWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  docFrame: {
    width: '86%',
    flex: 1,
    maxHeight: 300,
    marginTop: 22,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  reticle: {
    width: '88%',
    height: 138,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#FDE047',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  reticleHint: {
    backgroundColor: 'rgba(28,25,23,0.78)',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
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

  snapPrimaryBtn: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  snapPrimaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14.5 },

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

  importCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
    ...SHADOWS.card,
  },
  importTitle: { fontSize: 12.5, fontWeight: '900', color: COLORS.ink },
  importGrid: { flexDirection: 'row', gap: 8 },
  importTile: {
    flex: 1,
    backgroundColor: COLORS.canvas,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 15,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 3,
  },
  importEmoji: { fontSize: 21 },
  importLabel: { fontSize: 12, fontWeight: '900', color: COLORS.ink },
  importSub: { fontSize: 10, fontWeight: '600', color: COLORS.inkSoft },

  shareTipBox: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  shareTipText: { fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 17 },
  bold: { fontWeight: '800', color: COLORS.ink },

  reviewWrap: { gap: 14 },
  detectedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 16,
    gap: 12,
    ...SHADOWS.card,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  detectedBadge: { fontSize: 11, fontWeight: '900', color: '#047857', letterSpacing: 0.7 },
  sourceChipText: { fontSize: 10, fontWeight: '800', color: COLORS.inkSoft },
  reviewHeaderBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addPageBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
  },
  addPageBtnText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },
  rescanLink: { fontSize: 12, fontWeight: '800', color: COLORS.coralDark },

  typeSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeSwitchChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
  },
  typeSwitchChipActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  typeSwitchText: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted },
  aiCleanChip: {
    marginLeft: 'auto',
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#D8B4FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    minWidth: 78,
    alignItems: 'center',
  },
  aiCleanText: { fontSize: 11, fontWeight: '900', color: '#6D28D9' },

  detectedTitle: { fontSize: 18, fontWeight: '900', color: COLORS.ink },
  editRow: { flexDirection: 'row', gap: 8 },
  editField: { flex: 1, gap: 3 },
  editLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  editInput: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  gridTwo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoPair: {
    width: '48%',
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.inkSoft,
    textTransform: 'uppercase',
  },
  infoVal: { fontSize: 13, fontWeight: '800', color: COLORS.ink, marginTop: 2 },
  routeNoteBox: {
    backgroundColor: COLORS.emeraldSoft,
    padding: 10,
    borderRadius: 12,
  },
  routeNoteText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  rawToggle: { paddingVertical: 4 },
  rawToggleText: { fontSize: 11, fontWeight: '800', color: COLORS.inkSoft },
  rawBox: {
    backgroundColor: '#F5F5F4',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rawText: { fontSize: 11, fontFamily: 'monospace', color: COLORS.inkMuted, lineHeight: 16 },

  destCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
    ...SHADOWS.card,
  },
  destHeader: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.canvas,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  choiceRowActive: {
    backgroundColor: '#FFF7ED',
    borderColor: COLORS.coral,
  },
  radio: { fontSize: 16, color: COLORS.coral, fontWeight: '900', marginTop: 1 },
  choiceTitle: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  choiceSub: { fontSize: 12, color: COLORS.inkMuted, marginTop: 2 },
  tripChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  tripChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  tripChipText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },

  confirmBtn: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    ...SHADOWS.fab,
  },
  confirmBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

  pasteHint: { fontSize: 12, color: COLORS.inkMuted, lineHeight: 17 },
  pasteInput: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 140,
    textAlignVertical: 'top',
    fontSize: 12.5,
    color: COLORS.ink,
    lineHeight: 18,
  },
  pasteRowBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pasteHelperBtn: {
    backgroundColor: COLORS.skySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pasteHelperText: { fontSize: 12, fontWeight: '800', color: '#0369A1' },
  pasteClearBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  pasteClearText: { fontSize: 12, fontWeight: '800', color: COLORS.inkSoft },
  pastePrimaryBtn: {
    backgroundColor: COLORS.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pastePrimaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
});
