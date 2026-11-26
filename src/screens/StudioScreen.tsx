import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PixelRatio,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { DestinationBanner } from '../components/banners/DestinationBanner';
import {
  CanvasImageLoadScope,
  IgSingleCanvas,
} from '../components/instagram/IgPostcardCanvas';
import {
  KeepsakeExportConfig,
  KeepsakeStudioModal,
} from '../components/keepsake/KeepsakeStudioModal';
import { useApp } from '../context/AppContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { generateOfflineIgCaption } from '../services/igCaptionService';
import {
  CollageLayoutId,
  computeNativeExportCanvasWidth,
  ImageDimensions,
  PhotoCrop,
} from '../services/igStudioHelpers';
import { exportTripKeepsakePdf } from '../services/keepsakePdfService';
import { formatTripTitleWithFlags } from '../services/placeLookupService';
import { shareImageWithCaption } from '../services/shareMediaService';
import { deriveTripGeography } from '../services/travelGeography';
import { ThemeColors, ThemeShadows } from '../theme/tokens';
import { DistanceUnit, Flight, Memory, TransportLeg, Trip } from '../types/models';

interface Props {
  onOpenTrip: (tripId: string) => void;
  onOpenIgStudio: (tripId: string) => void;
  onNewTrip: () => void;
}

interface PostcardJob {
  jobKey: string;
  trip: Trip;
  flights: Flight[];
  transports: TransportLeg[];
  memories: Memory[];
  layout: CollageLayoutId;
  imageDims: Record<string, ImageDimensions>;
  photoCrops: Record<string, PhotoCrop>;
}

function formatShortDateRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const year = start.slice(0, 4);
  if (!end || end.slice(0, 10) === start.slice(0, 10)) {
    return `${fmt(start)}, ${year}`;
  }
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
}

export const StudioScreen: React.FC<Props> = ({
  onOpenTrip,
  onOpenIgStudio,
  onNewTrip,
}) => {
  const {
    profile,
    trips,
    getFlightsForTrip,
    getTransportsForTrip,
    getStopsForTrip,
    getStaysForTrip,
    getMemoriesForTrip,
  } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const distanceUnit: DistanceUnit = profile?.distanceUnit ?? 'km';
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [keepsakeTripId, setKeepsakeTripId] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sharingPostcardTripId, setSharingPostcardTripId] = useState<string | null>(null);
  const [postcardJob, setPostcardJob] = useState<PostcardJob | null>(null);

  const postcardShotRef = useRef<ViewShotRef>(null);
  const postcardReadyResolverRef = useRef<(() => void) | null>(null);
  const postcardExportCanvasWidth = computeNativeExportCanvasWidth(PixelRatio.get());

  const handlePostcardImagesReady = useCallback(() => {
    postcardReadyResolverRef.current?.();
    postcardReadyResolverRef.current = null;
  }, []);

  const sortedTrips = useMemo(
    () =>
      [...trips].sort((a, b) =>
        (b.startDate || '').localeCompare(a.startDate || '')
      ),
    [trips]
  );

  const availableYears = useMemo(() => {
    const yrs = new Set<string>();
    sortedTrips.forEach((t) => {
      const y = (t.startDate || '').slice(0, 4);
      if (/^\d{4}$/.test(y)) yrs.add(y);
    });
    return Array.from(yrs).sort((a, b) => b.localeCompare(a));
  }, [sortedTrips]);

  const visibleTrips = useMemo(() => {
    if (selectedYear === 'all') return sortedTrips;
    return sortedTrips.filter((t) => (t.startDate || '').startsWith(selectedYear));
  }, [sortedTrips, selectedYear]);

  const keepsakeTrip = keepsakeTripId
    ? trips.find((t) => t.id === keepsakeTripId) ?? null
    : null;

  const handleExportKeepsakePdf = async (config: KeepsakeExportConfig) => {
    if (!keepsakeTrip || exportingPdf) return;
    setExportingPdf(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await exportTripKeepsakePdf({
        trip: keepsakeTrip,
        flights: getFlightsForTrip(keepsakeTrip.id),
        transports: getTransportsForTrip(keepsakeTrip.id),
        stops: getStopsForTrip(keepsakeTrip.id),
        stays: getStaysForTrip(keepsakeTrip.id),
        memories: getMemoriesForTrip(keepsakeTrip.id),
        distanceUnit,
        templateId: config.templateId,
        coverPhotoUriOverride: config.coverPhotoUri,
        coverDimensions: config.coverDimensions,
        coverCrop: config.coverCrop,
      });
      setKeepsakeTripId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate keepsake PDF.';
      Alert.alert('Keepsake PDF Error', msg);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleQuickPostcard = async (trip: Trip) => {
    if (sharingPostcardTripId) return;
    setSharingPostcardTripId(trip.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    try {
      const flights = getFlightsForTrip(trip.id);
      const transports = getTransportsForTrip(trip.id);
      const memories = getMemoriesForTrip(trip.id);
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

      if (sortedForCollage.length === 0) {
        await Share.share({
          title: `${trip.title} ${trip.flagEmoji} — Wanderer's Ledger Postcard`,
          message: routeStatsCaption,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return;
      }

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
          smartCrops[m.id] = { offsetX: 0, offsetY: 0.38, zoom: 1 };
        }
      });

      const readyPromise = new Promise<void>((resolve) => {
        postcardReadyResolverRef.current = resolve;
      });
      setPostcardJob({
        jobKey: `studio_postcard_${trip.id}_${Date.now()}`,
        trip,
        flights,
        transports,
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
      setPostcardJob(null);
      postcardReadyResolverRef.current = null;
      setSharingPostcardTripId(null);
    }
  };

  return (
    <View style={styles.root}>
      {/* Offscreen 1080p Postcard Renderer (mounted only during 1-tap Postcard share) */}
      {postcardJob ? (
        <View
          pointerEvents="none"
          collapsable={false}
          style={styles.offscreenPostcardHost}
        >
          <CanvasImageLoadScope
            key={postcardJob.jobKey}
            jobKey={postcardJob.jobKey}
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
                trip={postcardJob.trip}
                memories={postcardJob.memories}
                flights={postcardJob.flights}
                transports={postcardJob.transports}
                distanceUnit={distanceUnit}
                format="feed"
                template="postcard"
                showWatermark
                canvasWidth={postcardExportCanvasWidth}
                layout={postcardJob.layout}
                paletteId="sunlit"
                showPostcardNote
                photoCrops={postcardJob.photoCrops}
                imageDims={postcardJob.imageDims}
              />
            </ViewShot>
          </CanvasImageLoadScope>
        </View>
      ) : null}

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View>
          <Text style={styles.title}>🎨 Studio</Text>
          <Text style={styles.subtitle}>
            Craft &amp; share spend-free travel keepsakes in 1 tap.
          </Text>
        </View>

        {/* Privacy Promise Pill */}
        <View style={styles.privacyBanner}>
          <Text style={styles.privacyBannerText}>
            🔒 100% spend-free — ticket prices, hotel bills &amp; receipts are never included in Studio exports.
          </Text>
        </View>

        {/* Optional Year Filter Chips */}
        {availableYears.length >= 2 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.yearRow}
          >
            <TouchableOpacity
              onPress={() => setSelectedYear('all')}
              style={[styles.yearChip, selectedYear === 'all' && styles.yearChipActive]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.yearChipText,
                  selectedYear === 'all' && styles.yearChipTextActive,
                ]}
              >
                All ({sortedTrips.length})
              </Text>
            </TouchableOpacity>
            {availableYears.map((yr) => {
              const active = selectedYear === yr;
              return (
                <TouchableOpacity
                  key={yr}
                  onPress={() => setSelectedYear(yr)}
                  style={[styles.yearChip, active && styles.yearChipActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>
                    {yr}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Trip-Card-First Studio Gallery */}
        {visibleTrips.length > 0 ? (
          visibleTrips.map((trip) => {
            const flights = getFlightsForTrip(trip.id);
            const transports = getTransportsForTrip(trip.id);
            const stops = getStopsForTrip(trip.id);
            const memories = getMemoriesForTrip(trip.id);
            const photoCount = memories.filter((m) => Boolean(m.photoUri)).length;
            const legsCount = flights.length + transports.length;
            const geo = deriveTripGeography(trip, flights, transports, stops);
            const flagsLabel =
              geo.visitedCountries.length > 0 ? geo.flagsLabel : trip.flagEmoji;
            const isSharingThisPostcard = sharingPostcardTripId === trip.id;

            return (
              <View key={trip.id} style={styles.tripStudioCard}>
                {/* Visual Cover Header (tap to open Trip) */}
                <TouchableOpacity
                  onPress={() => onOpenTrip(trip.id)}
                  activeOpacity={0.92}
                  style={styles.bannerWrap}
                >
                  <DestinationBanner
                    vibe={trip.vibe}
                    coverPhotoUri={trip.coverPhotoUri}
                    height={128}
                  />
                  <LinearGradient
                    colors={['rgba(15,23,42,0.18)', 'rgba(15,23,42,0.72)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.bannerTopRow}>
                    <View style={styles.statBadge}>
                      <Text style={styles.statBadgeText}>
                        📸 {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
                        {legsCount > 0 ? ` • ✈️ ${legsCount}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bannerBottom}>
                    <Text style={styles.cardTripTitle} numberOfLines={1}>
                      {formatTripTitleWithFlags(trip.title, flagsLabel)}
                    </Text>
                    <Text style={styles.cardTripMeta} numberOfLines={1}>
                      {formatShortDateRange(trip.startDate, trip.endDate)}
                      {memories.length === 0 ? ' • Route card ready' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* 3 Crisp 1-Tap Keepsake Actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => onOpenIgStudio(trip.id)}
                    style={[styles.studioActionBtn, styles.igActionBtn]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={styles.igActionText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                    >
                      🎨 IG Studio
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setKeepsakeTripId(trip.id)}
                    style={[styles.studioActionBtn, styles.pdfActionBtn]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={styles.pdfActionText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                    >
                      📄 PDF Book
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleQuickPostcard(trip)}
                    disabled={Boolean(sharingPostcardTripId)}
                    style={[
                      styles.studioActionBtn,
                      styles.postcardActionBtn,
                      isSharingThisPostcard && { opacity: 0.72 },
                    ]}
                    activeOpacity={0.85}
                  >
                    {isSharingThisPostcard ? (
                      <ActivityIndicator size="small" color={colors.coralDark} />
                    ) : (
                      <Text
                        style={styles.postcardActionText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                      >
                        📮 Postcard
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎨</Text>
            <Text style={styles.emptyTitle}>Your Travel Keepsake Studio</Text>
            <Text style={styles.emptySub}>
              Once you log a trip, turn your memories and routes into share-ready creations offline:
            </Text>
            <View style={styles.emptyList}>
              <Text style={styles.emptyBullet}>
                • <Text style={{ fontWeight: '800' }}>🎨 Instagram Studio</Text> — 1080p collages, carousels &amp; draft captions
              </Text>
              <Text style={styles.emptyBullet}>
                • <Text style={{ fontWeight: '800' }}>📄 Keepsake PDF Book</Text> — Printable A4 magazine journal
              </Text>
              <Text style={styles.emptyBullet}>
                • <Text style={{ fontWeight: '800' }}>📮 Family Postcard</Text> — 1-tap photo &amp; route card for WhatsApp
              </Text>
            </View>
            <TouchableOpacity onPress={onNewTrip} activeOpacity={0.9} style={{ width: '100%' }}>
              <LinearGradient
                colors={['#F97316', '#F43F5E', '#EC4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyCta}
              >
                <Text style={styles.emptyCtaText}>✈️ Start Your First Trip</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Keepsake Magazine PDF Studio Modal */}
      {keepsakeTrip ? (
        <KeepsakeStudioModal
          visible={Boolean(keepsakeTrip)}
          trip={keepsakeTrip}
          flights={getFlightsForTrip(keepsakeTrip.id)}
          transports={getTransportsForTrip(keepsakeTrip.id)}
          stops={getStopsForTrip(keepsakeTrip.id)}
          stays={getStaysForTrip(keepsakeTrip.id)}
          memories={getMemoriesForTrip(keepsakeTrip.id)}
          distanceUnit={distanceUnit}
          exporting={exportingPdf}
          onClose={() => setKeepsakeTripId(null)}
          onExport={handleExportKeepsakePdf}
        />
      ) : null}
    </View>
  );
};

const createStyles = (COLORS: ThemeColors, SHADOWS: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.canvas },
    content: { padding: 16, paddingBottom: 42, gap: 14 },
    title: { fontSize: 22, fontWeight: '900', color: COLORS.ink, letterSpacing: -0.3 },
    subtitle: { fontSize: 12.5, color: COLORS.inkMuted, marginTop: 2 },
    privacyBanner: {
      backgroundColor: isDark ? COLORS.emeraldSoft : '#ECFDF5',
      borderWidth: 1,
      borderColor: COLORS.emeraldBorder,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    privacyBannerText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: COLORS.emeraldText,
      lineHeight: 16,
    },
    yearRow: {
      gap: 8,
      paddingVertical: 2,
    },
    yearChip: {
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 99,
    },
    yearChipActive: {
      backgroundColor: isDark ? COLORS.coral : COLORS.navy,
      borderColor: isDark ? COLORS.coral : COLORS.navy,
    },
    yearChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.inkMuted,
    },
    yearChipTextActive: {
      color: '#FFFFFF',
    },
    tripStudioCard: {
      backgroundColor: COLORS.card,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: COLORS.border,
      overflow: 'hidden',
      ...SHADOWS.card,
    },
    bannerWrap: {
      position: 'relative',
      width: '100%',
      height: 128,
    },
    bannerTopRow: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      gap: 6,
    },
    statBadge: {
      backgroundColor: 'rgba(15,23,42,0.68)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 99,
    },
    statBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    bannerBottom: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 12,
    },
    cardTripTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: '#FFFFFF',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    cardTripMeta: {
      fontSize: 11.5,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.9)',
      marginTop: 2,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      backgroundColor: COLORS.card,
    },
    studioActionBtn: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    igActionBtn: {
      backgroundColor: COLORS.coral,
      borderColor: COLORS.coral,
    },
    igActionText: {
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 12,
    },
    pdfActionBtn: {
      backgroundColor: COLORS.indigoSoft,
      borderColor: COLORS.indigoBorder,
    },
    pdfActionText: {
      color: COLORS.navyText,
      fontWeight: '800',
      fontSize: 12,
    },
    postcardActionBtn: {
      backgroundColor: COLORS.cardWarm,
      borderColor: COLORS.coralBorder,
    },
    postcardActionText: {
      color: COLORS.coralDark,
      fontWeight: '800',
      fontSize: 12,
    },
    emptyCard: {
      backgroundColor: COLORS.card,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: COLORS.coralBorder,
      padding: 22,
      alignItems: 'center',
      gap: 10,
      ...SHADOWS.card,
    },
    emptyEmoji: { fontSize: 38 },
    emptyTitle: { fontSize: 18, fontWeight: '900', color: COLORS.ink, textAlign: 'center' },
    emptySub: {
      fontSize: 12.5,
      color: COLORS.inkMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
    emptyList: {
      width: '100%',
      backgroundColor: COLORS.canvas,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      padding: 12,
      gap: 6,
      marginVertical: 4,
    },
    emptyBullet: {
      fontSize: 12,
      color: COLORS.ink,
      lineHeight: 17,
    },
    emptyCta: {
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      ...SHADOWS.fab,
    },
    emptyCtaText: {
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 14.5,
    },
    offscreenPostcardHost: {
      position: 'absolute',
      left: -12000,
      top: 0,
      opacity: 0.01,
    },
  });
