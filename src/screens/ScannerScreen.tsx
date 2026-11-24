import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { formatFlightDistance } from '../services/distanceUtils';
import { convertCurrency } from '../services/fxService';
import {
  DetectedMoneyCandidate,
  extractMoneyCandidates,
  formatFlightItinerarySummary,
  inferPrimaryDestinationFromLegs,
  mergeOcrTexts,
  parseDocumentOcrText,
} from '../services/ocrParser';
import { CATEGORY_META, COLORS, formatMoney, SHADOWS, TRANSPORT_MODE_META } from '../theme/tokens';
import {
  DistanceUnit,
  ExpenseCategory,
  IncomingSharePayload,
  ParsedBoardingPass,
  ParsedFlightLeg,
  ScanResult,
  Trip,
} from '../types/models';
import { isCollaborativeTrip } from '../services/sharingHelpers';
import { formatTimeHmInput } from '../services/timeInputUtils';

interface Props {
  onClose: () => void;
  onSavedToTrip: (tripId: string) => void;
  incomingShare?: IncomingSharePayload | null;
  onIncomingShareConsumed?: () => void;
}

type CameraMode = 'document' | 'boarding_pass';

export const ScannerScreen: React.FC<Props> = ({
  onClose,
  onSavedToTrip,
  incomingShare,
  onIncomingShareConsumed,
}) => {
  const {
    profile,
    trips,
    fxRates,
    addTrip,
    addFlight,
    addTransport,
    addStay,
    addExpense,
  } = useApp();
  const keyboardHeight = useKeyboardHeight();
  const distanceUnit: DistanceUnit = profile?.distanceUnit ?? 'km';

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
  const [receiptIsShared, setReceiptIsShared] = useState(false);

  const targetTripForShare =
    destinationChoice === 'existing' ? trips.find((t) => t.id === selectedTripId) : undefined;
  const targetTripIsCollab = targetTripForShare
    ? isCollaborativeTrip(targetTripForShare, profile)
    : false;

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
      const scanDate =
        parsed.kind === 'hotel'
          ? parsed.checkIn
          : parsed.kind === 'transport'
          ? parsed.startDate
          : parsed.date;
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
          const pageUris = await renderPdfPagesToJpegs(incomingShare.pdfUri, 5);
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
        onIncomingShareConsumed?.();
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
      Alert.alert('Paste Confirmation Text', 'Paste a flight email, train ticket, car rental, hotel booking, or receipt text first.');
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

  const handleSwitchParsedKind = async (kind: 'flight' | 'transport' | 'hotel' | 'receipt') => {
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
          : scanResult?.kind === 'transport'
          ? 'transport'
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

  const getFlightLegs = (scan: ParsedBoardingPass): ParsedFlightLeg[] => {
    if (scan.legs && scan.legs.length > 0) return scan.legs;
    return [
      {
        airlineCode: scan.airlineCode,
        airlineName: scan.airlineName,
        flightNumber: scan.flightNumber,
        originIata: scan.originIata,
        destIata: scan.destIata,
        flightDate: scan.flightDate,
        departureTimeHm: scan.departureTimeHm,
        seat: scan.seat || undefined,
        cabinClass: scan.cabinClass,
        distanceMiles: scan.distanceMiles,
        estimatedDurationMin: scan.estimatedDurationMin,
        loyaltyProgram: scan.loyaltyProgram,
      },
    ];
  };

  const syncPrimaryFromLegs = (
    prev: ParsedBoardingPass,
    legs: ParsedFlightLeg[]
  ): ParsedBoardingPass => {
    const first = legs[0];
    if (!first) return { ...prev, legs };
    return {
      ...prev,
      airlineCode: first.airlineCode,
      airlineName: first.airlineName,
      flightNumber: first.flightNumber,
      originIata: first.originIata,
      destIata: first.destIata,
      flightDate: first.flightDate,
      departureTimeHm: first.departureTimeHm,
      seat: first.seat ?? prev.seat,
      distanceMiles: first.distanceMiles,
      estimatedDurationMin: first.estimatedDurationMin,
      loyaltyProgram: first.loyaltyProgram,
      legs,
    };
  };

  const updateFlightField = (patch: Partial<ParsedBoardingPass>) => {
    setScanResult((prev) => {
      if (!prev || prev.kind !== 'boarding_pass') return prev;
      const next = { ...prev, ...patch };
      if (
        patch.originIata !== undefined ||
        patch.destIata !== undefined ||
        patch.flightNumber !== undefined ||
        patch.flightDate !== undefined ||
        patch.departureTimeHm !== undefined
      ) {
        const legs = [...getFlightLegs(prev)];
        const leg0 = { ...legs[0] };
        if (patch.originIata !== undefined) leg0.originIata = patch.originIata;
        if (patch.destIata !== undefined) leg0.destIata = patch.destIata;
        if (patch.flightDate !== undefined) leg0.flightDate = patch.flightDate;
        if (patch.departureTimeHm !== undefined) leg0.departureTimeHm = patch.departureTimeHm;
        if (patch.flightNumber !== undefined) {
          leg0.flightNumber = patch.flightNumber;
          const m = patch.flightNumber.trim().toUpperCase().match(/^([A-Z0-9]{2})\s*[-]?\s*(\d{1,4})/);
          if (m) {
            const al = lookupAirline(m[1]);
            leg0.airlineCode = al.code;
            leg0.airlineName = al.name;
            leg0.loyaltyProgram = al.loyaltyProgram;
          }
        }
        const o = lookupAirport(leg0.originIata);
        const d = lookupAirport(leg0.destIata);
        if (o && d) {
          leg0.distanceMiles = calculateDistanceMiles(o.lat, o.lng, d.lat, d.lng);
          leg0.estimatedDurationMin = estimateFlightDurationMinutes(leg0.distanceMiles);
        }
        legs[0] = leg0;
        return syncPrimaryFromLegs(next, legs);
      }
      return next;
    });
  };

  const updateFlightLeg = (index: number, patch: Partial<ParsedFlightLeg>) => {
    setScanResult((prev) => {
      if (!prev || prev.kind !== 'boarding_pass') return prev;
      const legs = [...getFlightLegs(prev)];
      if (!legs[index]) return prev;
      const updated = { ...legs[index], ...patch };
      if (patch.flightNumber !== undefined) {
        const m = patch.flightNumber.trim().toUpperCase().match(/^([A-Z0-9]{2})\s*[-]?\s*(\d{1,4})/);
        if (m) {
          const al = lookupAirline(m[1]);
          updated.airlineCode = al.code;
          updated.airlineName = al.name;
          updated.loyaltyProgram = al.loyaltyProgram;
        }
      }
      if (patch.originIata !== undefined || patch.destIata !== undefined) {
        const o = lookupAirport(updated.originIata);
        const d = lookupAirport(updated.destIata);
        if (o && d) {
          updated.distanceMiles = calculateDistanceMiles(o.lat, o.lng, d.lat, d.lng);
          updated.estimatedDurationMin = estimateFlightDurationMinutes(updated.distanceMiles);
        } else {
          updated.distanceMiles = 0;
        }
      }
      legs[index] = updated;
      return syncPrimaryFromLegs(prev, legs);
    });
  };

  const addFlightLeg = () => {
    setScanResult((prev) => {
      if (!prev || prev.kind !== 'boarding_pass') return prev;
      const legs = [...getFlightLegs(prev)];
      const last = legs[legs.length - 1];
      const nextOrigin = last?.destIata && last.destIata !== 'TBD' ? last.destIata : '';
      const newLeg: ParsedFlightLeg = {
        airlineCode: last?.airlineCode ?? prev.airlineCode,
        airlineName: last?.airlineName ?? prev.airlineName,
        flightNumber: `${last?.airlineCode ?? prev.airlineCode} `,
        originIata: nextOrigin,
        destIata: '',
        flightDate: last?.flightDate ?? prev.flightDate,
        cabinClass: prev.cabinClass,
        distanceMiles: 0,
        estimatedDurationMin: 120,
        loyaltyProgram: last?.loyaltyProgram ?? prev.loyaltyProgram,
      };
      legs.push(newLeg);
      return syncPrimaryFromLegs(prev, legs);
    });
    Haptics.selectionAsync().catch(() => {});
  };

  const removeFlightLeg = (index: number) => {
    setScanResult((prev) => {
      if (!prev || prev.kind !== 'boarding_pass') return prev;
      const legs = [...getFlightLegs(prev)];
      if (legs.length <= 1) return prev;
      legs.splice(index, 1);
      return syncPrimaryFromLegs(prev, legs);
    });
    Haptics.selectionAsync().catch(() => {});
  };

  const updateTransportField = (patch: Partial<Extract<ScanResult, { kind: 'transport' }>>) => {
    setScanResult((prev) => (prev && prev.kind === 'transport' ? { ...prev, ...patch } : prev));
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
      const legs = getFlightLegs(scanResult);
      const primaryDestIata = inferPrimaryDestinationFromLegs(legs);
      const destAp = lookupAirport(primaryDestIata);
      const city =
        destAp?.city ??
        (primaryDestIata !== 'TBD' ? primaryDestIata : scanResult.flightNumber);
      const sortedDates = legs.map((l) => l.flightDate).filter(Boolean).sort();
      const start = sortedDates[0] ?? scanResult.flightDate;
      const lastDate = sortedDates[sortedDates.length - 1] ?? start;
      const end = lastDate > start ? lastDate : addDays(start, 5);
      return {
        title: `${city} Trip ${destAp?.flag ?? '✈️'}`,
        city,
        dateStart: start,
        dateEnd: end,
      };
    }
    if (scanResult.kind === 'transport') {
      const city = scanResult.destination || scanResult.origin || scanResult.operatorName;
      const inferred = inferDestinationVibe(city);
      const modeEmoji = TRANSPORT_MODE_META[scanResult.mode].emoji;
      return {
        title: `${city} Trip ${inferred.flag || modeEmoji}`,
        city,
        dateStart: scanResult.startDate,
        dateEnd: scanResult.endDate || addDays(scanResult.startDate, 4),
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
          ? lookupAirport(inferPrimaryDestinationFromLegs(getFlightLegs(scanResult)))?.city ??
            auto.city
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
      const legs = getFlightLegs(scanResult);
      legs.forEach((leg, idx) => {
        const cleanOrigin = (leg.originIata || 'TBD').trim().toUpperCase();
        const cleanDest = (leg.destIata || 'TBD').trim().toUpperCase();
        const originAp = lookupAirport(cleanOrigin);
        const destAp = lookupAirport(cleanDest);
        const legEnrich = idx === 0 ? enrichment : null;
        const durationMin = legEnrich?.durationMinutes ?? leg.estimatedDurationMin;
        const cleanTime = normalizeHmTime(leg.departureTimeHm);
        const depIso = cleanTime
          ? `${leg.flightDate}T${cleanTime}:00`
          : legEnrich?.departureTime ?? `${leg.flightDate}T00:00:00`;
        const arrIso = computeArrivalIso(depIso, durationMin);
        addFlight({
          id: generateId('flt'),
          tripId: finalTripId,
          airlineCode: leg.airlineCode,
          airlineName: leg.airlineName,
          flightNumber: leg.flightNumber.trim() || `${leg.airlineCode} Flight`,
          pnr: scanResult.pnr || undefined,
          originIata: cleanOrigin,
          originCity: originAp?.city ?? cleanOrigin,
          destIata: cleanDest,
          destCity: destAp?.city ?? cleanDest,
          departureTime: depIso,
          arrivalTime: legEnrich?.arrivalTime && !cleanTime ? legEnrich.arrivalTime : arrIso,
          durationMinutes: durationMin,
          seat: leg.seat || (idx === 0 ? scanResult.seat || undefined : undefined),
          cabinClass: leg.cabinClass || scanResult.cabinClass || undefined,
          terminal: legEnrich?.terminal,
          gate: legEnrich?.gate,
          aircraft: legEnrich?.aircraft,
          status: legEnrich?.status ?? 'scheduled',
          distanceMiles: leg.distanceMiles,
          milesEarned: leg.distanceMiles,
          loyaltyProgram: leg.loyaltyProgram,
          frequentFlyerNumber: scanResult.frequentFlyerNumber,
          enrichedOnline: Boolean(legEnrich?.enrichedOnline),
          rawBarcode: idx === 0 ? scanResult.rawBarcode || undefined : undefined,
          createdAt: now,
        });
      });

      // Log ONE single combined ticket expense for the entire booking (even when 2–4 flights are added!)
      if (scanResult.ticketAmount && scanResult.ticketAmount > 0) {
        const cleanCurr = (scanResult.ticketCurrency || '').trim().toUpperCase();
        const curr = cleanCurr.length === 3 ? cleanCurr : homeCurrency;
        const { converted, rate } = convertCurrency(
          scanResult.ticketAmount,
          curr,
          homeCurrency,
          fxRates
        );
        const routeSummary = formatFlightItinerarySummary(legs);
        const merchantLabel =
          legs.length > 1
            ? `${scanResult.airlineName.split(' ')[0]} (${legs.length} flights • ${routeSummary})`
            : `${scanResult.airlineName} (${legs[0].flightNumber})`;

        addExpense({
          id: generateId('exp'),
          tripId: finalTripId,
          merchant: merchantLabel,
          category: 'flights',
          localAmount: scanResult.ticketAmount,
          localCurrency: curr,
          homeAmount: converted,
          homeCurrency,
          fxRateUsed: rate,
          expenseDate: legs[0]?.flightDate ?? scanResult.flightDate,
          receiptUri: scanResult.imageUri,
          receiptRawText: scanResult.rawText,
          createdAt: now,
        });
      }
    } else if (scanResult.kind === 'transport') {
      const cleanCurr = (scanResult.currency || '').trim().toUpperCase();
      const curr = cleanCurr.length === 3 ? cleanCurr : homeCurrency;
      const { converted: homeCost } =
        scanResult.totalAmount > 0
          ? convertCurrency(scanResult.totalAmount, curr, homeCurrency, fxRates)
          : { converted: 0 };
      const modeLabel = TRANSPORT_MODE_META[scanResult.mode].label;
      addTransport({
        id: generateId('trn'),
        tripId: finalTripId,
        mode: scanResult.mode,
        title: `${scanResult.operatorName || modeLabel}${
          scanResult.seatOrVehicle && scanResult.mode === 'rental_car'
            ? ` • ${scanResult.seatOrVehicle}`
            : ''
        }`,
        operatorName: scanResult.operatorName || undefined,
        referenceCode: scanResult.referenceCode || undefined,
        origin: scanResult.origin || 'Start',
        destination: scanResult.destination || 'Destination',
        startDate: scanResult.startDate,
        endDate: scanResult.endDate || undefined,
        seatOrVehicle: scanResult.seatOrVehicle || undefined,
        costAmount: scanResult.totalAmount > 0 ? scanResult.totalAmount : undefined,
        currency: scanResult.totalAmount > 0 ? curr : undefined,
        homeCost: scanResult.totalAmount > 0 ? homeCost : undefined,
        createdAt: now,
      });
    } else if (scanResult.kind === 'hotel') {
      const cleanCurr = (scanResult.currency || '').trim().toUpperCase();
      const curr = cleanCurr.length === 3 ? cleanCurr : homeCurrency;
      const { converted } = convertCurrency(
        scanResult.totalAmount,
        curr,
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
        currency: curr,
        homeCost: converted,
        pointsRedeemed: 0,
        receiptUri: scanResult.imageUri,
        createdAt: now,
      });
    } else {
      const cleanCurr = (scanResult.currency || '').trim().toUpperCase();
      const curr = cleanCurr.length === 3 ? cleanCurr : homeCurrency;
      const { converted, rate } = convertCurrency(
        scanResult.amount,
        curr,
        homeCurrency,
        fxRates
      );
      addExpense({
        id: generateId('exp'),
        tripId: finalTripId,
        merchant: scanResult.merchant,
        category: scanResult.category,
        localAmount: scanResult.amount,
        localCurrency: curr,
        homeAmount: converted,
        homeCurrency,
        fxRateUsed: rate,
        expenseDate: scanResult.date,
        receiptUri: scanResult.imageUri,
        receiptRawText: scanResult.rawText,
        isShared: targetTripIsCollab ? receiptIsShared : false,
        authorId: profile?.id,
        authorName: profile?.displayName,
        createdAt: now,
      });
      setReceiptIsShared(false);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onSavedToTrip(finalTripId);
  };

  const autoSuggestion = getAutoTripSuggestion();
  const moneyCandidates = useMemo(
    () => (lastRawOcrText ? extractMoneyCandidates(lastRawOcrText, homeCurrency, 4) : []),
    [lastRawOcrText, homeCurrency]
  );
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
                      ? getFlightLegs(scanResult).length > 1
                        ? `✈️ ${getFlightLegs(scanResult).length} FLIGHTS READ`
                        : scanResult.source === 'ocr'
                        ? '✈️ FLIGHT BOOKING READ'
                        : '✈️ BOARDING PASS DECODED'
                      : scanResult.kind === 'transport'
                      ? `${TRANSPORT_MODE_META[scanResult.mode].emoji} ${TRANSPORT_MODE_META[scanResult.mode].label.toUpperCase()} READ`
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
                      { id: 'transport', label: '🚆 Travel', active: scanResult.kind === 'transport' },
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

              {scanResult.kind === 'boarding_pass' && (() => {
                const flightLegs = getFlightLegs(scanResult);
                const isMultiLeg = flightLegs.length > 1;
                const totalMiles = flightLegs.reduce((sum, l) => sum + (l.distanceMiles || 0), 0);
                const routeHeadline = isMultiLeg
                  ? formatFlightItinerarySummary(flightLegs)
                  : `${scanResult.airlineName.split(' ')[0]} ${scanResult.flightNumber} (${scanResult.originIata} → ${scanResult.destIata})`;
                const activeFareCurr =
                  (scanResult.ticketCurrency || '').length === 3
                    ? scanResult.ticketCurrency!
                    : homeCurrency;

                return (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.detectedTitle}>{routeHeadline}</Text>

                    {!isMultiLeg ? (
                      <>
                        <View style={styles.editRow}>
                          <EditableField
                            label="Flight #"
                            value={scanResult.flightNumber}
                            autoCapitalize="characters"
                            onChangeText={(v) => updateFlightField({ flightNumber: v.toUpperCase() })}
                          />
                          <EditableField
                            label="PNR / Ref"
                            value={scanResult.pnr}
                            placeholder="Optional"
                            autoCapitalize="characters"
                            onChangeText={(v) => updateFlightField({ pnr: v.toUpperCase() })}
                          />
                        </View>

                        <View style={styles.editRow}>
                          <EditableField
                            label="From (IATA)"
                            value={scanResult.originIata}
                            autoCapitalize="characters"
                            onChangeText={(v) =>
                              updateFlightField({ originIata: v.toUpperCase().slice(0, 3) })
                            }
                          />
                          <EditableField
                            label="To (IATA)"
                            value={scanResult.destIata}
                            autoCapitalize="characters"
                            onChangeText={(v) =>
                              updateFlightField({ destIata: v.toUpperCase().slice(0, 3) })
                            }
                          />
                        </View>

                        <View style={styles.editRow}>
                          <DatePickerField
                            label="Flight Date"
                            value={scanResult.flightDate}
                            onChange={(v) => updateFlightField({ flightDate: v })}
                            compact
                          />
                          <EditableField
                            label="Time (24h)"
                            value={scanResult.departureTimeHm ?? ''}
                            placeholder="HH:MM"
                            keyboardType="number-pad"
                            onChangeText={(v) =>
                              updateFlightField({
                                departureTimeHm: formatTimeHmInput(
                                  v,
                                  scanResult.departureTimeHm ?? ''
                                ),
                              })
                            }
                          />
                        </View>
                      </>
                    ) : (
                      <>
                        <EditableField
                          label="Shared PNR / Booking Ref"
                          value={scanResult.pnr}
                          placeholder="Optional"
                          autoCapitalize="characters"
                          onChangeText={(v) => updateFlightField({ pnr: v.toUpperCase() })}
                        />

                        {flightLegs.map((leg, idx) => (
                          <View key={`leg-${idx}`} style={styles.legCard}>
                            <View style={styles.legHeaderRow}>
                              <Text style={styles.legHeaderTitle}>
                                ✈️ Flight {idx + 1} • {leg.originIata || '???'} → {leg.destIata || '???'}
                                {leg.distanceMiles > 0
                                  ? ` (${formatFlightDistance(leg.distanceMiles, distanceUnit)})`
                                  : ''}
                              </Text>
                              <TouchableOpacity
                                onPress={() => removeFlightLeg(idx)}
                                style={styles.legRemoveBtn}
                              >
                                <Text style={styles.legRemoveText}>✕</Text>
                              </TouchableOpacity>
                            </View>

                            <View style={styles.editRow}>
                              <EditableField
                                label="Flight #"
                                value={leg.flightNumber}
                                autoCapitalize="characters"
                                onChangeText={(v) =>
                                  updateFlightLeg(idx, { flightNumber: v.toUpperCase() })
                                }
                              />
                              <EditableField
                                label="From"
                                value={leg.originIata}
                                autoCapitalize="characters"
                                onChangeText={(v) =>
                                  updateFlightLeg(idx, { originIata: v.toUpperCase().slice(0, 3) })
                                }
                              />
                              <EditableField
                                label="To"
                                value={leg.destIata}
                                autoCapitalize="characters"
                                onChangeText={(v) =>
                                  updateFlightLeg(idx, { destIata: v.toUpperCase().slice(0, 3) })
                                }
                              />
                            </View>

                            <View style={styles.editRow}>
                              <DatePickerField
                                label={`Flight ${idx + 1} Date`}
                                value={leg.flightDate}
                                onChange={(v) => updateFlightLeg(idx, { flightDate: v })}
                                compact
                              />
                              <EditableField
                                label="Time (24h)"
                                value={leg.departureTimeHm ?? ''}
                                placeholder="HH:MM"
                                keyboardType="number-pad"
                                onChangeText={(v) =>
                                  updateFlightLeg(idx, {
                                    departureTimeHm: formatTimeHmInput(
                                      v,
                                      leg.departureTimeHm ?? ''
                                    ),
                                  })
                                }
                              />
                            </View>
                          </View>
                        ))}
                      </>
                    )}

                    <TouchableOpacity
                      onPress={addFlightLeg}
                      style={styles.addLegBtn}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.addLegBtnText}>
                        + Add {isMultiLeg ? 'another flight leg' : 'connecting / return flight'}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.editRow}>
                      <DecimalAmountField
                        label={isMultiLeg ? 'Total Ticket Fare (1 Spend Entry)' : 'Fare Paid (Optional)'}
                        value={scanResult.ticketAmount}
                        placeholder="Leave blank to skip"
                        onChangeValue={(amt) =>
                          updateFlightField({
                            ticketAmount: amt > 0 ? amt : undefined,
                            ticketCurrency:
                              amt > 0
                                ? scanResult.ticketCurrency || homeCurrency
                                : scanResult.ticketCurrency,
                          })
                        }
                      />
                      <EditableField
                        label="Currency"
                        value={scanResult.ticketCurrency ?? homeCurrency}
                        placeholder={homeCurrency}
                        autoCapitalize="characters"
                        onChangeText={(v) =>
                          updateFlightField({
                            ticketCurrency: v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3),
                          })
                        }
                      />
                    </View>

                    <DetectedAmountsBar
                      candidates={moneyCandidates}
                      activeAmount={scanResult.ticketAmount}
                      activeCurrency={scanResult.ticketCurrency ?? homeCurrency}
                      onSelect={(c) => {
                        updateFlightField({ ticketAmount: c.amount, ticketCurrency: c.currency });
                        Haptics.selectionAsync().catch(() => {});
                      }}
                    />

                    <View style={styles.gridTwo}>
                      <InfoPair
                        label={isMultiLeg ? `Total Distance (${flightLegs.length} legs)` : 'Distance & Time'}
                        value={
                          totalMiles > 0
                            ? isMultiLeg
                              ? formatFlightDistance(totalMiles, distanceUnit)
                              : `${formatFlightDistance(totalMiles, distanceUnit)} (${formatDuration(
                                  enrichment?.durationMinutes ?? scanResult.estimatedDurationMin
                                )})`
                            : 'Enter IATA codes for distance'
                        }
                      />
                      <InfoPair
                        label={
                          scanResult.ticketAmount &&
                          scanResult.ticketAmount > 0 &&
                          activeFareCurr !== homeCurrency
                            ? `Fare in ${homeCurrency}`
                            : 'Loyalty Miles'
                        }
                        value={
                          scanResult.ticketAmount &&
                          scanResult.ticketAmount > 0 &&
                          activeFareCurr !== homeCurrency
                            ? formatMoney(
                                convertCurrency(
                                  scanResult.ticketAmount,
                                  activeFareCurr,
                                  homeCurrency,
                                  fxRates
                                ).converted,
                                homeCurrency
                              )
                            : `+${totalMiles.toLocaleString()} mi ✨`
                        }
                      />
                    </View>

                    <View style={styles.routeNoteBox}>
                      <Text style={styles.routeNoteText}>
                        ✓ Adds {isMultiLeg ? `all ${flightLegs.length} flights` : 'to Bookings timeline'}, World Map & {scanResult.loyaltyProgram}
                        {scanResult.ticketAmount && scanResult.ticketAmount > 0
                          ? ` + logs 1 ${formatMoney(scanResult.ticketAmount, activeFareCurr)} expense to Spend`
                          : ''}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {scanResult.kind === 'transport' && (
                <View style={{ gap: 8 }}>
                  <View style={styles.typeSwitchRow}>
                    {(['train', 'bus', 'ferry', 'rental_car'] as const).map((m) => {
                      const meta = TRANSPORT_MODE_META[m];
                      const active = scanResult.mode === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          onPress={() => updateTransportField({ mode: m })}
                          style={[
                            styles.typeSwitchChip,
                            active && { backgroundColor: meta.color, borderColor: meta.color },
                          ]}
                        >
                          <Text
                            style={[
                              styles.typeSwitchText,
                              active && { color: '#FFFFFF' },
                            ]}
                          >
                            {meta.emoji} {meta.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <EditableField
                    label={scanResult.mode === 'rental_car' ? 'Rental Company' : 'Operator / Train'}
                    value={scanResult.operatorName}
                    onChangeText={(v) => updateTransportField({ operatorName: v })}
                  />

                  <View style={styles.editRow}>
                    <EditableField
                      label={scanResult.mode === 'rental_car' ? 'Pickup' : 'From'}
                      value={scanResult.origin}
                      onChangeText={(v) => updateTransportField({ origin: v })}
                    />
                    <EditableField
                      label={scanResult.mode === 'rental_car' ? 'Drop-off' : 'To'}
                      value={scanResult.destination}
                      onChangeText={(v) => updateTransportField({ destination: v })}
                    />
                  </View>

                  <View style={styles.editRow}>
                    <DatePickerField
                      label="Start Date"
                      value={scanResult.startDate}
                      onChange={(v) => updateTransportField({ startDate: v })}
                      compact
                    />
                    <DatePickerField
                      label="End Date (Opt.)"
                      value={scanResult.endDate || scanResult.startDate}
                      onChange={(v) => updateTransportField({ endDate: v })}
                      compact
                    />
                  </View>

                  <View style={styles.editRow}>
                    <DecimalAmountField
                      label="Total Paid"
                      value={scanResult.totalAmount}
                      onChangeValue={(amt) => updateTransportField({ totalAmount: amt })}
                    />
                    <EditableField
                      label="Currency"
                      value={scanResult.currency}
                      autoCapitalize="characters"
                      onChangeText={(v) =>
                        updateTransportField({
                          currency: v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3),
                        })
                      }
                    />
                    <EditableField
                      label="PNR / Ref"
                      value={scanResult.referenceCode || ''}
                      placeholder="Optional"
                      autoCapitalize="characters"
                      onChangeText={(v) =>
                        updateTransportField({ referenceCode: v.toUpperCase() })
                      }
                    />
                  </View>

                  <DetectedAmountsBar
                    candidates={moneyCandidates}
                    activeAmount={scanResult.totalAmount}
                    activeCurrency={scanResult.currency}
                    onSelect={(c) => {
                      updateTransportField({ totalAmount: c.amount, currency: c.currency });
                      Haptics.selectionAsync().catch(() => {});
                    }}
                  />

                  <EditableField
                    label={scanResult.mode === 'rental_car' ? 'Vehicle (Opt.)' : 'Coach / Seat (Opt.)'}
                    value={scanResult.seatOrVehicle || ''}
                    placeholder="Optional"
                    onChangeText={(v) => updateTransportField({ seatOrVehicle: v })}
                  />

                  <View style={styles.routeNoteBox}>
                    <Text style={styles.routeNoteText}>
                      ✓ Adds to your Chronological Bookings Timeline & Trip Spend overview
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
                    <DecimalAmountField
                      label="Amount"
                      value={scanResult.amount}
                      onChangeValue={(amt) => updateReceiptField({ amount: amt })}
                    />
                    <EditableField
                      label="Currency"
                      value={scanResult.currency}
                      autoCapitalize="characters"
                      onChangeText={(v) =>
                        updateReceiptField({
                          currency: v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3),
                        })
                      }
                    />
                  </View>
                  <DetectedAmountsBar
                    candidates={moneyCandidates}
                    activeAmount={scanResult.amount}
                    activeCurrency={scanResult.currency}
                    onSelect={(c) => {
                      updateReceiptField({ amount: c.amount, currency: c.currency });
                      Haptics.selectionAsync().catch(() => {});
                    }}
                  />
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
                        convertCurrency(
                          scanResult.amount,
                          scanResult.currency.length === 3 ? scanResult.currency : homeCurrency,
                          homeCurrency,
                          fxRates
                        ).converted,
                        homeCurrency
                      )}
                    />
                    <InfoPair
                      label="Category"
                      value={`${CATEGORY_META[scanResult.category]?.emoji ?? '✨'} ${CATEGORY_META[scanResult.category]?.label ?? scanResult.category}`}
                    />
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
                  >
                    {(Object.keys(CATEGORY_META) as ExpenseCategory[]).map((cat) => {
                      const meta = CATEGORY_META[cat];
                      const active = scanResult.category === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          onPress={() => updateReceiptField({ category: cat })}
                          style={[
                            styles.typeSwitchChip,
                            active && styles.typeSwitchChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.typeSwitchText,
                              active && { color: '#FFFFFF' },
                            ]}
                          >
                            {meta.emoji} {meta.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {targetTripIsCollab && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity
                        onPress={() => setReceiptIsShared(false)}
                        style={[
                          styles.typeSwitchChip,
                          { flex: 1, alignItems: 'center', paddingVertical: 8 },
                          !receiptIsShared && styles.typeSwitchChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeSwitchText,
                            !receiptIsShared && { color: '#FFFFFF' },
                          ]}
                        >
                          🔒 Personal
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setReceiptIsShared(true)}
                        style={[
                          styles.typeSwitchChip,
                          { flex: 1, alignItems: 'center', paddingVertical: 8 },
                          receiptIsShared && {
                            backgroundColor: '#15803D',
                            borderColor: '#15803D',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeSwitchText,
                            receiptIsShared && { color: '#FFFFFF' },
                          ]}
                        >
                          🤝 Shared
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={styles.routeNoteBox}>
                    <Text style={styles.routeNoteText}>
                      {targetTripIsCollab && receiptIsShared
                        ? '🤝 Shared with Editor co-travelers on this trip (including receipt photo)'
                        : '🔒 Tucked safely inside the Spend tab (visible only to you)'}
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
                    <DecimalAmountField
                      label="Total Paid"
                      value={scanResult.totalAmount}
                      onChangeValue={(amt) => updateHotelField({ totalAmount: amt })}
                    />
                    <EditableField
                      label="Currency"
                      value={scanResult.currency}
                      autoCapitalize="characters"
                      onChangeText={(v) =>
                        updateHotelField({
                          currency: v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3),
                        })
                      }
                    />
                    <EditableField
                      label="Conf #"
                      value={scanResult.confirmationCode || ''}
                      placeholder="Optional"
                      autoCapitalize="characters"
                      onChangeText={(v) => updateHotelField({ confirmationCode: v })}
                    />
                  </View>
                  <DetectedAmountsBar
                    candidates={moneyCandidates}
                    activeAmount={scanResult.totalAmount}
                    activeCurrency={scanResult.currency}
                    onSelect={(c) => {
                      updateHotelField({ totalAmount: c.amount, currency: c.currency });
                      Haptics.selectionAsync().catch(() => {});
                    }}
                  />
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
  autoCapitalize,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
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
      autoCapitalize={autoCapitalize}
      style={styles.editInput}
    />
  </View>
);

const DecimalAmountField = ({
  label,
  value,
  placeholder,
  onChangeValue,
}: {
  label: string;
  value: number | undefined;
  placeholder?: string;
  onChangeValue: (val: number) => void;
}) => {
  const [draft, setDraft] = useState(value && value > 0 ? String(value) : '');

  useEffect(() => {
    const numericDraft = parseFloat(draft.replace(/,/g, ''));
    const propVal = value && value > 0 ? value : 0;
    const currentNum = Number.isFinite(numericDraft) && numericDraft > 0 ? numericDraft : 0;
    if (currentNum !== propVal) {
      setDraft(propVal > 0 ? String(propVal) : '');
    }
  }, [value]);

  return (
    <EditableField
      label={label}
      value={draft}
      placeholder={placeholder ?? '0.00'}
      keyboardType="decimal-pad"
      onChangeText={(raw) => {
        const cleaned = raw.replace(/[^0-9.,]/g, '');
        setDraft(cleaned);
        const parsed = parseFloat(cleaned.replace(/,/g, ''));
        onChangeValue(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
      }}
    />
  );
};

const DetectedAmountsBar = ({
  candidates,
  activeAmount,
  activeCurrency,
  onSelect,
}: {
  candidates: DetectedMoneyCandidate[];
  activeAmount: number | undefined;
  activeCurrency: string;
  onSelect: (candidate: DetectedMoneyCandidate) => void;
}) => {
  if (candidates.length <= 1) return null;
  const currNorm = (activeCurrency || '').trim().toUpperCase();
  return (
    <View style={styles.candWrap}>
      <Text style={styles.candLabel}>Tap detected amount:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}
      >
        {candidates.map((c, idx) => {
          const isActive =
            Boolean(activeAmount) &&
            Math.abs((activeAmount ?? 0) - c.amount) < 0.01 &&
            currNorm === c.currency;
          return (
            <TouchableOpacity
              key={`${c.currency}-${c.amount}-${idx}`}
              onPress={() => onSelect(c)}
              style={[styles.candChip, isActive && styles.candChipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.candChipText, isActive && { color: '#FFFFFF' }]}>
                {formatMoney(c.amount, c.currency)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeHmTime(raw?: string): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function computeArrivalIso(departureIso: string, durationMinutes: number): string {
  const clean = departureIso.endsWith('Z') ? departureIso : `${departureIso}Z`;
  const d = new Date(clean);
  if (Number.isNaN(d.getTime())) return departureIso;
  d.setUTCMinutes(d.getUTCMinutes() + Math.max(30, durationMinutes || 120));
  return d.toISOString().slice(0, 19);
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
  candWrap: {
    gap: 5,
    paddingTop: 2,
  },
  candLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  candChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  candChipActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  candChipText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.ink,
  },
  legCard: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 10,
    gap: 6,
  },
  legHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  legHeaderTitle: {
    fontSize: 11.5,
    fontWeight: '900',
    color: COLORS.navy,
    flex: 1,
  },
  legRemoveBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legRemoveText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.inkSoft,
  },
  addLegBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.coral,
    backgroundColor: COLORS.coralSoft,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  addLegBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.coralDark,
  },
});
