import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as Sharing from 'expo-sharing';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { InstagramIcon } from '../components/icons/InstagramIcon';
import {
  buildCarouselSlides,
  IgCarouselSlideCanvas,
  IgFormat,
  IgSingleCanvas,
  IgTemplate,
} from '../components/instagram/IgPostcardCanvas';
import { useApp } from '../context/AppContext';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import {
  CAPTION_TONES,
  CaptionTone,
  generateOfflineIgCaption,
  polishCaptionWithAi,
} from '../services/igCaptionService';
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

function waitForNextFrames(frames = 2): Promise<void> {
  return new Promise((resolve) => {
    let left = frames;
    const step = () => {
      left -= 1;
      if (left <= 0) {
        setTimeout(resolve, 60);
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });
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
  const [showWatermark, setShowWatermark] = useState(true);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

  // Caption Studio State
  const [tone, setTone] = useState<CaptionTone>('aesthetic');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [variantIdx, setVariantIdx] = useState(0);
  const [caption, setCaption] = useState('');
  const [captionBadge, setCaptionBadge] = useState<'offline' | 'ai'>('offline');
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [polishing, setPolishing] = useState(false);

  // Export State
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const shotRef = useRef<ViewShotRef | null>(null);

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
  const canvasWidth = Math.min(324, Math.max(260, Math.round(screenWidth - 56)));

  const toggleMemorySelection = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // Keep at least 1 selected
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= maxSelection) {
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
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
        'Allow WanderLedger to save your Instagram postcards and carousel slides to your phone gallery.'
      );
      return false;
    }
    return true;
  };

  const captureCurrentCanvas = async (): Promise<string> => {
    if (!shotRef.current) {
      throw new Error('Postcard preview is still loading.');
    }
    const uri = await shotRef.current.capture();
    if (!uri) throw new Error('Could not render image.');
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
        const originalSlide = activeSlideIdx;
        let savedCount = 0;

        for (let i = 0; i < carouselSlides.length; i++) {
          setExportStatus(`Rendering slide ${i + 1} of ${carouselSlides.length}…`);
          setActiveSlideIdx(i);
          await waitForNextFrames(3);
          const uri = await captureCurrentCanvas();
          await MediaLibrary.Asset.create(uri);
          savedCount += 1;
        }
        setActiveSlideIdx(originalSlide);
        await Clipboard.setStringAsync(caption);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          `Saved ${savedCount} Carousel Slides! 🎉`,
          'All slides are saved in your Gallery in order, and your draft caption is copied to your clipboard—open Instagram and tap Select Multiple to post!'
        );
      } else {
        setExportStatus('Rendering high-res postcard…');
        await waitForNextFrames(2);
        const uri = await captureCurrentCanvas();
        await MediaLibrary.Asset.create(uri);
        await Clipboard.setStringAsync(caption);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Saved to Gallery! 📸',
          'Your crisp postcard is saved to your Photos, and your caption is copied—ready to paste on Instagram!'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save image.';
      Alert.alert('Save Error', msg);
    } finally {
      setExporting(false);
      setExportStatus('');
    }
  };

  const handleShareToInstagram = async () => {
    if (exporting) return;
    setExporting(true);
    setExportStatus('Copying caption & rendering postcard…');
    try {
      // Copy draft caption first so it's immediately ready to paste inside Instagram!
      await Clipboard.setStringAsync(caption);
      await waitForNextFrames(2);
      const uri = await captureCurrentCanvas();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share to Instagram (Caption copied!)',
        });
      } else {
        Alert.alert('Ready to Share', 'Postcard rendered and caption copied to clipboard.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open share sheet.';
      Alert.alert('Share Error', msg);
    } finally {
      setExporting(false);
      setExportStatus('');
    }
  };

  const currentSlide = carouselSlides[activeSlideIdx] ?? carouselSlides[0];
  const exportWidth = 1080;
  const exportHeight = format === 'story' ? 1920 : 1350;

  return (
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
                    style={[
                      styles.templateText,
                      active && styles.templateTextActive,
                    ]}
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
                  onPress={() => setActiveSlideIdx(idx)}
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

        {/* LIVE CAPTUREABLE POSTCARD CANVAS */}
        <View style={styles.stageWrap}>
          <ViewShot
            ref={shotRef}
            options={{
              format: 'png',
              quality: 0.96,
              result: 'tmpfile',
              width: exportWidth,
              height: exportHeight,
            }}
            style={styles.shotFrame}
          >
            {format === 'carousel' && currentSlide ? (
              <IgCarouselSlideCanvas
                trip={trip}
                flights={flights}
                allSelectedMemories={selectedMemories}
                slide={currentSlide}
                showWatermark={showWatermark}
                canvasWidth={canvasWidth}
              />
            ) : (
              <IgSingleCanvas
                trip={trip}
                memories={selectedMemories}
                flights={flights}
                format={format === 'story' ? 'story' : 'feed'}
                template={template}
                showWatermark={showWatermark}
                canvasWidth={canvasWidth}
              />
            )}
          </ViewShot>
        </View>

        {/* Export Progress Banner */}
        {exporting && (
          <View style={styles.progressBanner}>
            <ActivityIndicator color={COLORS.coral} />
            <Text style={styles.progressText}>{exportStatus || 'Rendering high-res postcard…'}</Text>
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

        {/* Memory Picker Strip */}
        {allMemories.length > 0 && (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>📸 Pick Memories ({selectedMemories.length}/{maxSelection})</Text>
              <Text style={styles.cardHint}>Tap to toggle</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 2 }}
            >
              {allMemories.map((m) => {
                const orderIdx = selectedMemories.findIndex((x) => x.id === m.id);
                const selected = orderIdx >= 0;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => toggleMemorySelection(m.id)}
                    style={[styles.memPickCard, selected && styles.memPickCardActive]}
                    activeOpacity={0.85}
                  >
                    {m.photoUri ? (
                      <Image source={{ uri: m.photoUri }} style={styles.memPickImg} resizeMode="cover" />
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
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Watermark Toggle */}
        <View style={styles.watermarkRowCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>✈️ WanderLedger Watermark</Text>
            <Text style={styles.watermarkSub}>
              Adds a subtle “Stamped with WanderLedger” badge on your postcard
            </Text>
          </View>
          <Switch
            value={showWatermark}
            onValueChange={setShowWatermark}
            trackColor={{ false: '#D6D3D1', true: '#FDBA74' }}
            thumbColor={showWatermark ? COLORS.coral : '#FFFFFF'}
          />
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
                <Text style={styles.aiBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  🪄 AI Polish / Remix
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
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

  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 14 },

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

  stageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  shotFrame: {
    borderRadius: 20,
    ...SHADOWS.card,
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
    padding: 16,
    gap: 10,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
  cardHint: { fontSize: 11, fontWeight: '700', color: COLORS.inkSoft },

  memPickCard: {
    width: 82,
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 5,
    gap: 4,
    position: 'relative',
  },
  memPickCardActive: {
    borderColor: COLORS.coral,
    backgroundColor: COLORS.coralSoft,
  },
  memPickImg: { width: '100%', height: 64, borderRadius: 8 },
  memPickFallback: {
    width: '100%',
    height: 64,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memPickTitle: { fontSize: 10, fontWeight: '800', color: COLORS.ink, textAlign: 'center' },
  orderBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  orderBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },

  watermarkRowCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  watermarkSub: { fontSize: 11, color: COLORS.inkMuted, marginTop: 2, lineHeight: 15 },

  badgePill: {
    backgroundColor: COLORS.amberSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
  },
  badgePillAi: { backgroundColor: '#F3E8FF' },
  badgePillText: { fontSize: 10, fontWeight: '900', color: '#92400E' },

  toneChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  toneChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  hashtagChipActive: { backgroundColor: COLORS.skySoft, borderColor: '#7DD3FC' },
  toneChipText: { fontSize: 12, fontWeight: '800', color: COLORS.inkMuted },

  captionInput: {
    backgroundColor: COLORS.canvas,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    minHeight: 124,
    fontSize: 13,
    color: COLORS.ink,
    lineHeight: 19,
    textAlignVertical: 'top',
    fontWeight: '500',
  },
  captionActionsRow: { flexDirection: 'row', gap: 10 },
  copyBtn: {
    flex: 1,
    backgroundColor: COLORS.skySoft,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnText: { fontSize: 13, fontWeight: '800', color: '#0369A1' },
  aiBtn: {
    flex: 1,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#D8B4FE',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBtnText: { fontSize: 13, fontWeight: '800', color: '#6D28D9' },
});
