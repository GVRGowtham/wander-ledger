import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { shareImageWithCaption } from '../services/shareMediaService';
import { InstagramIcon } from '../components/icons/InstagramIcon';
import {
  buildCarouselSlides,
  CanvasImageLoadScope,
  CarouselSlideSpec,
  IgCarouselSlideCanvas,
  IgFormat,
  IgSingleCanvas,
  IgTemplate,
  SlotTapPayload,
} from '../components/instagram/IgPostcardCanvas';
import { PhotoReframeModal, SwapCandidate } from '../components/instagram/PhotoReframeModal';
import { useApp } from '../context/AppContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import {
  CAPTION_TONES,
  CaptionTone,
  generateOfflineIgCaption,
  polishCaptionWithAi,
} from '../services/igCaptionService';
import {
  CollageLayoutId,
  computeNativeExportCanvasWidth,
  DEFAULT_PHOTO_CROP,
  getAvailableLayouts,
  getDefaultPostcardNote,
  IG_PALETTES,
  IgPaletteId,
  ImageDimensions,
  PhotoCrop,
  resolveLayoutForCount,
  ROUTE_OVERLAY_OPTIONS,
  RouteOverlayMode,
} from '../services/igStudioHelpers';
import { COLORS, SHADOWS } from '../theme/tokens';

interface Props {
  tripId: string;
  onBack: () => void;
}

const TEMPLATES: Array<{ id: IgTemplate; label: string; emoji: string }> = [
  { id: 'scrapbook', label: 'Scrapbook', emoji: '📸' },
  { id: 'route', label: 'Route Stats', emoji: '✈️' },
  { id: 'postcard', label: 'Postcard', emoji: '📮' },
];

type ExportJob =
  | { kind: 'single'; jobKey: string }
  | { kind: 'carousel'; slide: CarouselSlideSpec; jobKey: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const InstagramStudioScreen: React.FC<Props> = ({ tripId, onBack }) => {
  const { trips, getMemoriesForTrip, getFlightsForTrip } = useApp();
  const keyboardHeight = useKeyboardHeight();
  const { width: screenWidth } = useWindowDimensions();

  const trip = trips.find((t) => t.id === tripId);
  const allMemories = useMemo(
    () => (trip ? getMemoriesForTrip(trip.id) : []),
    [trip, getMemoriesForTrip]
  );
  const flights = useMemo(
    () => (trip ? getFlightsForTrip(trip.id) : []),
    [trip, getFlightsForTrip]
  );

  const [format, setFormat] = useState<IgFormat>('feed');
  const [template, setTemplate] = useState<IgTemplate>('scrapbook');
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    allMemories.slice(0, 4).map((m) => m.id)
  );
  const [layoutByCount, setLayoutByCount] = useState<Partial<Record<number, CollageLayoutId>>>({});
  const [paletteId, setPaletteId] = useState<IgPaletteId>('sunlit');
  const [routeOverlay, setRouteOverlay] = useState<RouteOverlayMode>(() =>
    flights.length > 0 ? 'center' : 'minimal'
  );
  const [heroMemoryId, setHeroMemoryId] = useState<string | undefined>(
    () => allMemories.find((m) => m.photoUri)?.id
  );
  const [showPhotoLabels, setShowPhotoLabels] = useState(true);
  const [showPostcardNote, setShowPostcardNote] = useState(true);
  const [postcardNote, setPostcardNote] = useState<string>(() =>
    trip ? getDefaultPostcardNote(trip, allMemories.slice(0, 4)) : ''
  );
  const [showWatermark, setShowWatermark] = useState(true);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selectionHint, setSelectionHint] = useState('');

  // Per-slot framing & natural photo dimensions
  const [photoCrops, setPhotoCrops] = useState<Record<string, PhotoCrop>>({});
  const [imageDims, setImageDims] = useState<Record<string, ImageDimensions>>({});
  const [reframeTarget, setReframeTarget] = useState<SlotTapPayload | null>(null);

  // Caption Studio State
  const [tone, setTone] = useState<CaptionTone>('aesthetic');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [variantIdx, setVariantIdx] = useState(0);
  const [caption, setCaption] = useState('');
  const [captionBadge, setCaptionBadge] = useState<'offline' | 'ai'>('offline');
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [polishing, setPolishing] = useState(false);

  // Offscreen Native-1080p Export Pipeline State
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const exportShotRef = useRef<ViewShotRef | null>(null);
  const exportReadyResolverRef = useRef<(() => void) | null>(null);
  const carouselScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  // Preload natural photo dimensions so framing & portrait-aware slides are exact immediately
  useEffect(() => {
    const uris = new Set<string>();
    allMemories.forEach((m) => {
      if (m.photoUri) uris.add(m.photoUri);
    });
    if (trip?.coverPhotoUri) uris.add(trip.coverPhotoUri);

    uris.forEach((uri) => {
      if (imageDims[uri]) return;
      Image.getSize(
        uri,
        (width, height) => {
          if (width > 0 && height > 0) {
            setImageDims((prev) => (prev[uri] ? prev : { ...prev, [uri]: { width, height } }));
          }
        },
        () => {}
      );
    });
  }, [allMemories, trip?.coverPhotoUri]);

  const selectedMemories = useMemo(() => {
    if (allMemories.length === 0) return [];
    const byId = new Map(allMemories.map((m) => [m.id, m]));
    const picked = selectedIds
      .map((id) => byId.get(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    return picked.length > 0 ? picked : allMemories.slice(0, 4);
  }, [allMemories, selectedIds]);

  const carouselSlides = useMemo(
    () => buildCarouselSlides(selectedMemories),
    [selectedMemories]
  );

  useEffect(() => {
    if (activeSlideIdx >= carouselSlides.length) {
      setActiveSlideIdx(0);
    }
  }, [carouselSlides.length, activeSlideIdx]);

  // Regenerate draft caption whenever trip, memories, tone, or hashtag/watermark toggle changes
  useEffect(() => {
    if (!trip) return;
    const draft = generateOfflineIgCaption({
      trip,
      memories: selectedMemories,
      flights,
      tone,
      includeHashtags,
      includeWatermarkTag: showWatermark,
      variantIndex: variantIdx,
    });
    setCaption(draft);
    setCaptionBadge('offline');
  }, [trip, selectedMemories, flights, tone, includeHashtags, showWatermark, variantIdx]);

  const handleExportImagesReady = useCallback(() => {
    const resolve = exportReadyResolverRef.current;
    exportReadyResolverRef.current = null;
    resolve?.();
  }, []);

  if (!trip) {
    return (
      <View style={styles.missingWrap}>
        <Text style={styles.missingText}>Trip not found.</Text>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const maxSelection = format === 'carousel' ? 5 : 4;
  const effectiveSingleMemories = selectedMemories.slice(0, 4);
  const activeLayout = resolveLayoutForCount(
    effectiveSingleMemories.length,
    layoutByCount[effectiveSingleMemories.length]
  );
  const layoutOptions = getAvailableLayouts(effectiveSingleMemories.length);

  const canvasWidth = Math.min(316, Math.max(256, Math.round(screenWidth - 60)));
  const carouselGap = 12;
  const carouselCardStep = canvasWidth + carouselGap;
  const carouselSidePad = Math.max(12, Math.round((screenWidth - 32 - canvasWidth) / 2));

  const exportCanvasWidth = computeNativeExportCanvasWidth(PixelRatio.get());
  const exportWidth = 1080;
  const exportHeight = format === 'story' ? 1920 : 1350;

  const toggleMemorySelection = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectionHint('');
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) {
          setSelectionHint('Keep at least 1 memory selected.');
          return prev;
        }
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= maxSelection) {
        setSelectionHint(
          `Max ${maxSelection} memories for this format — tap any selected photo to remove it first.`
        );
        return prev;
      }
      return [...prev, id];
    });
  };

  const moveSelectedMemory = (id: string, direction: -1 | 1) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleSwapSlotMemory = (targetMemoryId: string) => {
    if (!reframeTarget) return;
    // If reframing Route backdrop or Carousel Cover, switch the hero backdrop photo directly
    if (
      reframeTarget.cropKey.startsWith('route_') ||
      reframeTarget.cropKey === '__route_backdrop__' ||
      reframeTarget.cropKey.startsWith('cover_') ||
      reframeTarget.cropKey === '__carousel_cover__'
    ) {
      const targetMem = allMemories.find((m) => m.id === targetMemoryId);
      if (targetMem?.photoUri) {
        setHeroMemoryId(targetMem.id);
        const prefix = reframeTarget.cropKey.startsWith('cover_') || reframeTarget.cropKey === '__carousel_cover__'
          ? 'cover_'
          : 'route_';
        setReframeTarget({
          ...reframeTarget,
          cropKey: `${prefix}${targetMem.id}`,
          memoryId: targetMem.id,
          photoUri: targetMem.photoUri,
          title: targetMem.title || 'Backdrop Photo',
        });
      }
      return;
    }

    // Otherwise swap slot positions inside selectedIds
    if (reframeTarget.memoryId && reframeTarget.memoryId !== targetMemoryId) {
      setSelectedIds((prev) => {
        const a = prev.indexOf(reframeTarget.memoryId!);
        const b = prev.indexOf(targetMemoryId);
        if (a < 0) return prev;
        const next = [...prev];
        if (b >= 0) {
          [next[a], next[b]] = [next[b], next[a]];
        } else {
          next[a] = targetMemoryId;
        }
        return next;
      });
      const targetMem = allMemories.find((m) => m.id === targetMemoryId);
      if (targetMem?.photoUri) {
        setReframeTarget({
          ...reframeTarget,
          cropKey: reframeTarget.cropKey.startsWith('carousel_')
            ? `carousel_${targetMem.id}`
            : targetMem.id,
          memoryId: targetMem.id,
          photoUri: targetMem.photoUri,
          title: targetMem.title || 'Memory Photo',
        });
      }
    }
  };

  const handleCopyCaption = async () => {
    await Clipboard.setStringAsync(caption);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleAiPolish = async () => {
    if (polishing) return;
    setPolishing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const nextVariant = variantIdx + 1;
      const res = await polishCaptionWithAi(
        {
          trip,
          memories: selectedMemories,
          flights,
          tone,
          includeHashtags,
          includeWatermarkTag: showWatermark,
          variantIndex: variantIdx,
        },
        caption
      );
      setCaption(res.caption);
      setCaptionBadge(res.source === 'ai' ? 'ai' : 'offline');
      if (res.source !== 'ai') {
        setVariantIdx(nextVariant);
      }
    } finally {
      setPolishing(false);
    }
  };

  const ensureGalleryPermission = async (): Promise<boolean> => {
    const existing = await MediaLibrary.getPermissionsAsync(true, ['photo']);
    if (existing.granted) return true;
    const req = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
    if (!req.granted) {
      Alert.alert(
        'Gallery Permission Needed',
        "Allow Wanderer's Ledger to save your Instagram postcards and carousel slides to your phone gallery."
      );
      return false;
    }
    return true;
  };

  /**
   * Renders a job in the native-1080p offscreen export stage, waits until EVERY
   * <Image> in that job finishes decoding + painting, and captures a crisp PNG.
   */
  const captureExportJob = async (job: ExportJob): Promise<string> => {
    const readyPromise = new Promise<void>((resolve) => {
      exportReadyResolverRef.current = resolve;
    });

    setExportJob(job);
    await readyPromise;
    // Brief settle tick so ViewShot ref & GPU texture upload are 100% committed
    await delay(40);

    if (!exportShotRef.current) {
      throw new Error('High-res renderer was not ready.');
    }
    const uri = await exportShotRef.current.capture();
    if (!uri) {
      throw new Error('Could not render high-res image.');
    }
    return uri;
  };

  const handleSaveToGallery = async () => {
    if (exporting) return;
    setExporting(true);
    setExportStatus('Checking gallery access…');

    try {
      const allowed = await ensureGalleryPermission();
      if (!allowed) return;

      if (format === 'carousel') {
        let savedCount = 0;
        for (let i = 0; i < carouselSlides.length; i++) {
          const slide = carouselSlides[i];
          setExportStatus(`Rendering crisp slide ${i + 1} of ${carouselSlides.length}…`);
          const uri = await captureExportJob({
            kind: 'carousel',
            slide,
            jobKey: `save_slide_${i}_${Date.now()}`,
          });
          await MediaLibrary.Asset.create(uri);
          savedCount += 1;
          // Space MediaStore writes slightly so slides stay in exact 1 -> N order in IG picker
          if (i < carouselSlides.length - 1) {
            await delay(220);
          }
        }
        await Clipboard.setStringAsync(caption);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          `Saved ${savedCount} Crisp Carousel Slides! 🎉`,
          'All slides are saved in your Gallery in exact order, and your draft caption is copied—open Instagram and tap Select Multiple to post!'
        );
      } else {
        setExportStatus('Rendering crisp 1080p postcard…');
        const uri = await captureExportJob({
          kind: 'single',
          jobKey: `save_single_${Date.now()}`,
        });
        await MediaLibrary.Asset.create(uri);
        await Clipboard.setStringAsync(caption);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Saved to Gallery! 📸',
          'Your 1080p postcard is saved to your Photos, and your caption is copied—ready to paste on Instagram!'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save image.';
      Alert.alert('Save Error', msg);
    } finally {
      setExportJob(null);
      exportReadyResolverRef.current = null;
      setExporting(false);
      setExportStatus('');
    }
  };

  const handleShareToInstagram = async () => {
    if (exporting) return;
    setExporting(true);
    setExportStatus('Copying caption & rendering crisp 1080p image…');
    try {
      const currentSlide = carouselSlides[activeSlideIdx] ?? carouselSlides[0];
      const uri = await captureExportJob(
        format === 'carousel' && currentSlide
          ? {
              kind: 'carousel',
              slide: currentSlide,
              jobKey: `share_slide_${activeSlideIdx}_${Date.now()}`,
            }
          : { kind: 'single', jobKey: `share_single_${Date.now()}` }
      );

      await shareImageWithCaption({
        imageUri: uri,
        caption,
        title: `${trip.title} ${trip.flagEmoji} — Wanderer's Ledger`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open share sheet.';
      Alert.alert('Share Error', msg);
    } finally {
      setExportJob(null);
      exportReadyResolverRef.current = null;
      setExporting(false);
      setExportStatus('');
    }
  };

  const handleCarouselScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / carouselCardStep);
    if (idx >= 0 && idx < carouselSlides.length && idx !== activeSlideIdx) {
      setActiveSlideIdx(idx);
    }
  };

  const scrollToSlide = (idx: number) => {
    setActiveSlideIdx(idx);
    carouselScrollRef.current?.scrollTo({
      x: idx * carouselCardStep,
      animated: true,
    });
  };

  const swapCandidates: SwapCandidate[] = useMemo(() => {
    if (!reframeTarget) return [];
    const pool = allMemories.filter((m) => Boolean(m.photoUri));
    return pool.map((m) => ({
      id: m.id,
      title: m.title,
      photoUri: m.photoUri,
      isCurrent: m.id === reframeTarget.memoryId,
    }));
  }, [reframeTarget, allMemories]);

  const showLayoutPicker =
    format !== 'carousel' && template !== 'route' && effectiveSingleMemories.length >= 2;
  const showPalettePicker = format === 'carousel' || template !== 'route';
  const showLabelsToggle = format === 'carousel' || template === 'scrapbook';
  const showPostcardNoteEditor = format !== 'carousel' && template === 'postcard';

  return (
    <View style={styles.outerHost}>
      {/* OFFSCREEN NATIVE-1080P EXPORT STAGE (mounted behind opaque UI only while exporting) */}
      {exportJob ? (
        <View
          pointerEvents="none"
          collapsable={false}
          style={styles.offscreenExportHost}
        >
          <CanvasImageLoadScope
            key={exportJob.jobKey}
            jobKey={exportJob.jobKey}
            onAllLoaded={handleExportImagesReady}
          >
            <ViewShot
              ref={exportShotRef}
              options={{
                format: 'png',
                quality: 1,
                result: 'tmpfile',
                width: exportWidth,
                height: exportHeight,
              }}
            >
              {exportJob.kind === 'carousel' ? (
                <IgCarouselSlideCanvas
                  trip={trip}
                  flights={flights}
                  allSelectedMemories={selectedMemories}
                  slide={exportJob.slide}
                  showWatermark={showWatermark}
                  canvasWidth={exportCanvasWidth}
                  paletteId={paletteId}
                  showPhotoLabels={showPhotoLabels}
                  coverMemoryId={heroMemoryId}
                  photoCrops={photoCrops}
                  imageDims={imageDims}
                />
              ) : (
                <IgSingleCanvas
                  trip={trip}
                  memories={effectiveSingleMemories}
                  flights={flights}
                  format={format === 'story' ? 'story' : 'feed'}
                  template={template}
                  showWatermark={showWatermark}
                  canvasWidth={exportCanvasWidth}
                  layout={activeLayout}
                  paletteId={paletteId}
                  showPhotoLabels={showPhotoLabels}
                  showPostcardNote={showPostcardNote}
                  postcardNote={postcardNote}
                  routeOverlay={routeOverlay}
                  routeBackdropMemoryId={heroMemoryId}
                  photoCrops={photoCrops}
                  imageDims={imageDims}
                />
              )}
            </ViewShot>
          </CanvasImageLoadScope>
        </View>
      ) : null}

      {/* MAIN VISIBLE STUDIO UI */}
      <View style={styles.root}>
        {/* Top Studio Header */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <InstagramIcon size={18} variant="gradient" />
            <Text style={styles.headerTitle} numberOfLines={1}>
              IG Post Studio
            </Text>
          </View>
          <View style={styles.privacyBadge}>
            <Text style={styles.privacyBadgeText}>🔒 No Spend</Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.content,
            keyboardHeight > 0 && { paddingBottom: keyboardHeight + 64 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {/* Format Switcher: Feed 4:5 | Story 9:16 | Carousel Pack */}
          <View style={styles.formatBar}>
            {(
              [
                { id: 'feed', label: '🖼️ Feed 4:5' },
                { id: 'story', label: '📱 Story 9:16' },
                { id: 'carousel', label: `🎞️ Carousel (${carouselSlides.length})` },
              ] as const
            ).map((f) => {
              const active = format === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => {
                    setFormat(f.id);
                    setSelectionHint('');
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={[styles.formatPill, active && styles.formatPillActive]}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[styles.formatPillText, active && styles.formatPillTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Template Selector (Feed & Story) OR Carousel Slide Switcher */}
          {format !== 'carousel' ? (
            <View style={styles.templateRow}>
              {TEMPLATES.map((t) => {
                const active = template === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => {
                      setTemplate(t.id);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    style={[styles.templateChip, active && styles.templateChipActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.templateEmoji}>{t.emoji}</Text>
                    <Text
                      style={[styles.templateText, active && styles.templateTextActive]}
                      numberOfLines={1}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            >
              {carouselSlides.map((s, idx) => {
                const active = idx === activeSlideIdx;
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => scrollToSlide(idx)}
                    style={[styles.slideChip, active && styles.slideChipActive]}
                  >
                    <Text style={[styles.slideChipText, active && { color: '#FFFFFF' }]}>
                      {idx + 1}. {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Contextual Collage Layout Picker OR Route Overlay Placement */}
          {showLayoutPicker && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 7, paddingVertical: 1 }}
            >
              {layoutOptions.map((opt) => {
                const active = activeLayout === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setLayoutByCount((prev) => ({
                        ...prev,
                        [effectiveSingleMemories.length]: opt.id,
                      }));
                    }}
                    style={[styles.subPill, active && styles.subPillActive]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.subPillIcon, active && styles.subPillTextActive]}>
                      {opt.icon}
                    </Text>
                    <Text style={[styles.subPillText, active && styles.subPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {format !== 'carousel' && template === 'route' && (
            <View style={{ gap: 6 }}>
              <Text style={styles.microLabel}>OVERLAY PLACEMENT (KEEP FACES CLEAR)</Text>
              <View style={styles.overlayRow}>
                {ROUTE_OVERLAY_OPTIONS.map((opt) => {
                  const active = routeOverlay === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setRouteOverlay(opt.id);
                      }}
                      style={[styles.overlayChip, active && styles.subPillActive]}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[styles.subPillText, active && styles.subPillTextActive]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                      >
                        {opt.emoji} {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* LIVE INTERACTIVE PREVIEW CANVAS */}
          {format === 'carousel' ? (
            <View style={{ gap: 8 }}>
              <ScrollView
                ref={carouselScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={carouselCardStep}
                snapToAlignment="start"
                onMomentumScrollEnd={handleCarouselScrollEnd}
                contentContainerStyle={{
                  paddingHorizontal: carouselSidePad,
                  gap: carouselGap,
                  paddingVertical: 4,
                }}
              >
                {carouselSlides.map((slide) => (
                  <View key={slide.id} style={styles.shotFrame}>
                    <IgCarouselSlideCanvas
                      trip={trip}
                      flights={flights}
                      allSelectedMemories={selectedMemories}
                      slide={slide}
                      showWatermark={showWatermark}
                      canvasWidth={canvasWidth}
                      paletteId={paletteId}
                      showPhotoLabels={showPhotoLabels}
                      coverMemoryId={heroMemoryId}
                      photoCrops={photoCrops}
                      imageDims={imageDims}
                      onPressSlot={(payload) => setReframeTarget(payload)}
                    />
                  </View>
                ))}
              </ScrollView>

              {/* Pagination Dots */}
              <View style={styles.dotsRow}>
                {carouselSlides.map((s, idx) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => scrollToSlide(idx)}
                    style={[styles.dot, idx === activeSlideIdx && styles.dotActive]}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.stageWrap}>
              <View style={styles.shotFrame}>
                <IgSingleCanvas
                  trip={trip}
                  memories={effectiveSingleMemories}
                  flights={flights}
                  format={format === 'story' ? 'story' : 'feed'}
                  template={template}
                  showWatermark={showWatermark}
                  canvasWidth={canvasWidth}
                  layout={activeLayout}
                  paletteId={paletteId}
                  showPhotoLabels={showPhotoLabels}
                  showPostcardNote={showPostcardNote}
                  postcardNote={postcardNote}
                  routeOverlay={routeOverlay}
                  routeBackdropMemoryId={heroMemoryId}
                  photoCrops={photoCrops}
                  imageDims={imageDims}
                  onPressSlot={(payload) => setReframeTarget(payload)}
                />
              </View>
            </View>
          )}

          {/* Interactive Framing Hint */}
          <View style={styles.reframeHintPill}>
            <Text style={styles.reframeHintText}>
              {format === 'carousel'
                ? '👆 Swipe slides • Tap any photo to pan, zoom & reframe'
                : template === 'route'
                ? '✂️ Tap backdrop photo above to pan, zoom or switch photo'
                : '✂️ Tap any photo above to pan, zoom faces or swap slots'}
            </Text>
          </View>

          {/* Export Progress Banner */}
          {exporting && (
            <View style={styles.progressBanner}>
              <ActivityIndicator color={COLORS.coral} />
              <Text style={styles.progressText}>
                {exportStatus || 'Rendering crisp 1080p postcard…'}
              </Text>
            </View>
          )}

          {/* Primary Export Actions */}
          <View style={styles.exportRow}>
            <TouchableOpacity
              onPress={handleSaveToGallery}
              disabled={exporting}
              style={[styles.saveBtn, exporting && { opacity: 0.6 }]}
              activeOpacity={0.85}
            >
              <Text
                style={styles.saveBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {format === 'carousel'
                  ? `💾 Save All ${carouselSlides.length} Slides`
                  : '💾 Save to Gallery'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShareToInstagram}
              disabled={exporting}
              style={{ flex: 1.15 }}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#F58529', '#DD2A7B', '#8134AF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.igShareBtn, exporting && { opacity: 0.6 }]}
              >
                <InstagramIcon size={16} variant="white" />
                <Text
                  style={styles.igShareBtnText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {format === 'carousel' ? 'Share Slide' : 'Share to IG'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Memory Picker & Reorder Card */}
          {allMemories.length > 0 && (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>
                  📸 Pick & Order ({selectedMemories.length}/{maxSelection})
                </Text>
                <Text style={styles.cardHint}>Tap to select</Text>
              </View>

              {selectionHint ? <Text style={styles.limitHint}>{selectionHint}</Text> : null}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
              >
                {allMemories.map((m) => {
                  const orderIdx = selectedMemories.findIndex((x) => x.id === m.id);
                  const selected = orderIdx >= 0;
                  const isHero = heroMemoryId === m.id;
                  return (
                    <View key={m.id} style={styles.memPickCol}>
                      <TouchableOpacity
                        onPress={() => toggleMemorySelection(m.id)}
                        style={[styles.memPickCard, selected && styles.memPickCardActive]}
                        activeOpacity={0.85}
                      >
                        {m.photoUri ? (
                          <Image
                            source={{ uri: m.photoUri }}
                            style={styles.memPickImg}
                            resizeMode="cover"
                            fadeDuration={0}
                          />
                        ) : (
                          <View style={styles.memPickFallback}>
                            <Text style={{ fontSize: 22 }}>🌅</Text>
                          </View>
                        )}
                        <Text style={styles.memPickTitle} numberOfLines={1}>
                          {m.title}
                        </Text>
                        {selected && (
                          <View style={styles.orderBadge}>
                            <Text style={styles.orderBadgeText}>{orderIdx + 1}</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Reorder / Cover quick controls for selected memories */}
                      {selected && selectedMemories.length > 1 && (
                        <View style={styles.reorderMiniRow}>
                          <TouchableOpacity
                            disabled={orderIdx === 0}
                            onPress={() => moveSelectedMemory(m.id, -1)}
                            style={[styles.miniArrowBtn, orderIdx === 0 && { opacity: 0.3 }]}
                          >
                            <Text style={styles.miniArrowText}>←</Text>
                          </TouchableOpacity>
                          {m.photoUri && (format === 'carousel' || template === 'route') ? (
                            <TouchableOpacity
                              onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                setHeroMemoryId(m.id);
                              }}
                              style={[styles.miniStarBtn, isHero && styles.miniStarBtnActive]}
                            >
                              <Text
                                style={[
                                  styles.miniStarText,
                                  isHero && { color: '#FFFFFF' },
                                ]}
                              >
                                ★
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          <TouchableOpacity
                            disabled={orderIdx === selectedMemories.length - 1}
                            onPress={() => moveSelectedMemory(m.id, 1)}
                            style={[
                              styles.miniArrowBtn,
                              orderIdx === selectedMemories.length - 1 && { opacity: 0.3 },
                            ]}
                          >
                            <Text style={styles.miniArrowText}>→</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Style, Palette, Labels & Postcard Note Customization Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🎨 Card Style & Details</Text>

            {/* Paper Palette Switcher */}
            {showPalettePicker && (
              <View style={{ gap: 6 }}>
                <Text style={styles.microLabel}>PAPER PALETTE</Text>
                <View style={styles.paletteRow}>
                  {IG_PALETTES.map((p) => {
                    const active = paletteId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setPaletteId(p.id);
                        }}
                        style={[styles.paletteChip, active && styles.paletteChipActive]}
                        activeOpacity={0.85}
                      >
                        <View
                          style={[
                            styles.paletteDot,
                            { backgroundColor: p.swatch },
                            p.dark && { borderColor: '#FBBF24' },
                          ]}
                        />
                        <Text
                          style={[
                            styles.paletteLabel,
                            active && { color: COLORS.coralDark },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Toggle Polaroid Labels */}
            {showLabelsToggle && (
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>🏷️ Show Photo Titles</Text>
                  <Text style={styles.toggleSub}>
                    Turn off for clean frameless Polaroids without memory titles
                  </Text>
                </View>
                <Switch
                  value={showPhotoLabels}
                  onValueChange={setShowPhotoLabels}
                  trackColor={{ false: '#D6D3D1', true: '#FDBA74' }}
                  thumbColor={showPhotoLabels ? COLORS.coral : '#FFFFFF'}
                />
              </View>
            )}

            {/* Editable Postcard Note */}
            {showPostcardNoteEditor && (
              <View style={{ gap: 8 }}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>💌 Postcard Quote Line</Text>
                    <Text style={styles.toggleSub}>
                      Edit or hide the italic note at the bottom of your postcard
                    </Text>
                  </View>
                  <Switch
                    value={showPostcardNote}
                    onValueChange={setShowPostcardNote}
                    trackColor={{ false: '#D6D3D1', true: '#FDBA74' }}
                    thumbColor={showPostcardNote ? COLORS.coral : '#FFFFFF'}
                  />
                </View>
                {showPostcardNote && (
                  <TextInput
                    value={postcardNote}
                    onChangeText={setPostcardNote}
                    placeholder={`Wishing you were here in ${trip.destinationCity} ✨`}
                    placeholderTextColor={COLORS.inkSoft}
                    maxLength={90}
                    style={styles.noteInput}
                  />
                )}
              </View>
            )}

            {/* Watermark Toggle */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>✈️ Wanderer's Ledger Watermark</Text>
                <Text style={styles.toggleSub}>
                  Subtle “Stamped with Wanderer's Ledger” badge on your export
                </Text>
              </View>
              <Switch
                value={showWatermark}
                onValueChange={setShowWatermark}
                trackColor={{ false: '#D6D3D1', true: '#FDBA74' }}
                thumbColor={showWatermark ? COLORS.coral : '#FFFFFF'}
              />
            </View>
          </View>

          {/* DRAFT CAPTION STUDIO (OFFLINE + OPTIONAL AI ASSISTED) */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>✍️ Draft Instagram Caption</Text>
              <View style={[styles.badgePill, captionBadge === 'ai' && styles.badgePillAi]}>
                <Text style={[styles.badgePillText, captionBadge === 'ai' && { color: '#6D28D9' }]}>
                  {captionBadge === 'ai' ? '✨ AI Polished' : '⚡ Instant Offline'}
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            >
              {CAPTION_TONES.map((t) => {
                const active = tone === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => {
                      setTone(t.id);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    style={[styles.toneChip, active && styles.toneChipActive]}
                  >
                    <Text style={[styles.toneChipText, active && { color: '#FFFFFF' }]}>
                      {t.emoji} {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => setIncludeHashtags(!includeHashtags)}
                style={[styles.toneChip, includeHashtags && styles.hashtagChipActive]}
              >
                <Text style={[styles.toneChipText, includeHashtags && { color: '#0369A1' }]}>
                  {includeHashtags ? '✓ #Hashtags' : '+ #Hashtags'}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            <TextInput
              value={caption}
              onChangeText={setCaption}
              multiline
              placeholder="Write or tweak your Instagram caption..."
              placeholderTextColor={COLORS.inkSoft}
              style={styles.captionInput}
            />

            <View style={styles.captionActionsRow}>
              <TouchableOpacity
                onPress={handleCopyCaption}
                style={styles.copyBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.copyBtnText}>
                  {copiedCaption ? '✓ Copied!' : '📋 Copy Caption'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAiPolish}
                disabled={polishing}
                style={styles.aiBtn}
                activeOpacity={0.85}
              >
                {polishing ? (
                  <ActivityIndicator size="small" color="#6D28D9" />
                ) : (
                  <Text
                    style={styles.aiBtnText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    🪄 AI Polish / Remix
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* INTERACTIVE TAP-TO-REFRAME PHOTO MODAL */}
      <PhotoReframeModal
        visible={Boolean(reframeTarget)}
        photoUri={reframeTarget?.photoUri}
        title={reframeTarget?.title ?? 'Memory Photo'}
        slotAspectRatio={reframeTarget?.slotAspectRatio ?? 1}
        imageDimensions={reframeTarget?.photoUri ? imageDims[reframeTarget.photoUri] : undefined}
        initialCrop={
          reframeTarget
            ? photoCrops[reframeTarget.cropKey] ??
              (reframeTarget.memoryId ? photoCrops[reframeTarget.memoryId] : undefined) ??
              DEFAULT_PHOTO_CROP
            : DEFAULT_PHOTO_CROP
        }
        swapCandidates={swapCandidates}
        onSwapMemory={handleSwapSlotMemory}
        onApply={(nextCrop) => {
          if (reframeTarget) {
            setPhotoCrops((prev) => ({
              ...prev,
              [reframeTarget.cropKey]: nextCrop,
            }));
          }
          setReframeTarget(null);
        }}
        onClose={() => setReframeTarget(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  outerHost: { flex: 1, backgroundColor: COLORS.canvas, position: 'relative' },
  offscreenExportHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
  },
  root: { flex: 1, backgroundColor: COLORS.canvas, zIndex: 1 },
  missingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  missingText: { fontSize: 16, fontWeight: '700', color: COLORS.ink },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 99,
  },
  backBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: COLORS.ink },
  privacyBadge: {
    backgroundColor: COLORS.emeraldSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  privacyBadgeText: { fontSize: 10, fontWeight: '900', color: '#047857' },

  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 13 },

  formatBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formatPill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatPillActive: { backgroundColor: COLORS.navy },
  formatPillText: { fontSize: 12, fontWeight: '800', color: COLORS.inkMuted },
  formatPillTextActive: { color: '#FFFFFF' },

  templateRow: { flexDirection: 'row', gap: 8 },
  templateChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  templateChipActive: {
    backgroundColor: COLORS.coralSoft,
    borderColor: COLORS.coral,
    borderWidth: 1.5,
  },
  templateEmoji: { fontSize: 14 },
  templateText: { fontSize: 12, fontWeight: '800', color: COLORS.inkMuted },
  templateTextActive: { color: COLORS.coralDark },

  slideChip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  slideChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  slideChipText: { fontSize: 12, fontWeight: '800', color: COLORS.inkMuted },

  microLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: COLORS.inkSoft,
  },
  subPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  subPillActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  subPillIcon: { fontSize: 13, color: COLORS.inkMuted },
  subPillText: { fontSize: 11.5, fontWeight: '800', color: COLORS.inkMuted },
  subPillTextActive: { color: '#FFFFFF' },

  overlayRow: { flexDirection: 'row', gap: 6 },
  overlayChip: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
  },

  stageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  shotFrame: {
    borderRadius: 20,
    ...SHADOWS.card,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: '#D6D3D1',
  },
  dotActive: {
    width: 20,
    backgroundColor: COLORS.coral,
  },
  reframeHintPill: {
    alignSelf: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
  },
  reframeHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.coralDark,
    textAlign: 'center',
  },

  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.amberSoft,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  progressText: { fontSize: 12, fontWeight: '800', color: '#92400E' },

  exportRow: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  saveBtnText: { fontSize: 13, fontWeight: '900', color: COLORS.ink },
  igShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...SHADOWS.card,
  },
  igShareBtnText: { fontSize: 13, fontWeight: '900', color: '#FFFFFF' },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    gap: 12,
    ...SHADOWS.card,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
  cardHint: { fontSize: 11, fontWeight: '700', color: COLORS.inkSoft },
  limitHint: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.coralDark,
    backgroundColor: COLORS.coralSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },

  memPickCol: { alignItems: 'center', gap: 5 },
  memPickCard: {
    width: 82,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
    padding: 4,
    gap: 4,
    position: 'relative',
  },
  memPickCardActive: {
    borderColor: COLORS.coral,
    backgroundColor: COLORS.coralSoft,
  },
  memPickImg: { width: '100%', height: 58, borderRadius: 10 },
  memPickFallback: {
    width: '100%',
    height: 58,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memPickTitle: { fontSize: 10, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  orderBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 21,
    height: 21,
    borderRadius: 99,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  orderBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },

  reorderMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniArrowBtn: {
    width: 24,
    height: 22,
    borderRadius: 7,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniArrowText: { fontSize: 11, fontWeight: '900', color: COLORS.ink },
  miniStarBtn: {
    width: 24,
    height: 22,
    borderRadius: 7,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStarBtnActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  miniStarText: { fontSize: 11, fontWeight: '900', color: COLORS.inkMuted },

  paletteRow: { flexDirection: 'row', gap: 7 },
  paletteChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.canvas,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  paletteChipActive: {
    borderColor: COLORS.coral,
    backgroundColor: COLORS.coralSoft,
  },
  paletteDot: {
    width: 14,
    height: 14,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  paletteLabel: { fontSize: 11, fontWeight: '800', color: COLORS.ink },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },
  toggleTitle: { fontSize: 13, fontWeight: '800', color: COLORS.ink },
  toggleSub: { fontSize: 11, color: COLORS.inkMuted, marginTop: 1, lineHeight: 15 },
  noteInput: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12.5,
    color: COLORS.ink,
  },

  badgePill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  badgePillAi: { backgroundColor: '#EDE9FE' },
  badgePillText: { fontSize: 10, fontWeight: '900', color: '#92400E' },

  toneChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  toneChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  hashtagChipActive: { backgroundColor: '#E0F2FE', borderColor: '#7DD3FC' },
  toneChipText: { fontSize: 12, fontWeight: '800', color: COLORS.inkMuted },

  captionInput: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 108,
    textAlignVertical: 'top',
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.ink,
  },
  captionActionsRow: { flexDirection: 'row', gap: 10 },
  copyBtn: {
    flex: 1,
    backgroundColor: COLORS.navy,
    borderRadius: 13,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnText: { fontSize: 12, fontWeight: '900', color: '#FFFFFF' },
  aiBtn: {
    flex: 1,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#D8B4FE',
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBtnText: { fontSize: 12, fontWeight: '900', color: '#6D28D9' },
});
