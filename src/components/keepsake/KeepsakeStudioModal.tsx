import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheetModal } from '../layout/BottomSheetModal';
import { PhotoReframeModal } from '../instagram/PhotoReframeModal';
import {
  buildStructuredJourneyRoute,
  formatDistance,
  milesToKm,
} from '../../services/distanceUtils';
import {
  computeCroppedImageLayout,
  DEFAULT_PHOTO_CROP,
  ImageDimensions,
  PhotoCrop,
} from '../../services/igStudioHelpers';
import {
  getKeepsakeTemplateMeta,
  KEEPSAKE_A4_HEIGHT,
  KEEPSAKE_A4_WIDTH,
  KEEPSAKE_TEMPLATES,
  KeepsakeTemplateId,
} from '../../services/keepsakePdfBuilder';
import { useThemedStyles } from '../../context/ThemeContext';
import { deriveTripGeography } from '../../services/travelGeography';
import { ThemeColors } from '../../theme/tokens';
import {
  DistanceUnit,
  Flight,
  Memory,
  Stay,
  TransportLeg,
  Trip,
  TripStop,
} from '../../types/models';

export interface KeepsakeExportConfig {
  templateId: KeepsakeTemplateId;
  coverPhotoUri: string | null;
  coverDimensions?: ImageDimensions;
  coverCrop: PhotoCrop;
}

interface Props {
  visible: boolean;
  trip: Trip;
  flights: Flight[];
  transports: TransportLeg[];
  stops: TripStop[];
  stays: Stay[];
  memories: Memory[];
  distanceUnit: DistanceUnit;
  exporting: boolean;
  onClose: () => void;
  onExport: (config: KeepsakeExportConfig) => void;
}

const PREVIEW_W = 216;
const PREVIEW_H = Math.round((PREVIEW_W * KEEPSAKE_A4_HEIGHT) / KEEPSAKE_A4_WIDTH); // 306px (exact A4 ratio)

const VIBE_GRADIENT_COLORS: Record<Trip['vibe'], [string, string, string]> = {
  japan: ['#2D1B36', '#9D174D', '#F97316'],
  coastal: ['#0C2D48', '#0369A1', '#38BDF8'],
  alpine: ['#0F172A', '#1E3A8A', '#60A5FA'],
  tropical: ['#064E3B', '#0D9488', '#34D399'],
  desert: ['#431407', '#C2410C', '#F59E0B'],
  city: ['#1E1B4B', '#6D28D9', '#EC4899'],
};

export const KeepsakeStudioModal: React.FC<Props> = ({
  visible,
  trip,
  flights,
  transports,
  stops,
  memories,
  distanceUnit,
  exporting,
  onClose,
  onExport,
}) => {
  const styles = useThemedStyles(createStyles);
  const photoMemories = useMemo(
    () => memories.filter((m) => Boolean(m.photoUri)),
    [memories]
  );

  const defaultCoverUri = useMemo(
    () => trip.coverPhotoUri || photoMemories[0]?.photoUri || null,
    [trip.coverPhotoUri, photoMemories]
  );

  const [templateId, setTemplateId] = useState<KeepsakeTemplateId>('magazine');
  const [selectedCoverUri, setSelectedCoverUri] = useState<string | null>(defaultCoverUri);
  const [galleryExtraUris, setGalleryExtraUris] = useState<string[]>([]);
  const [coverDimsMap, setCoverDimsMap] = useState<Record<string, ImageDimensions>>({});
  const [cropsByTemplate, setCropsByTemplate] = useState<
    Partial<Record<KeepsakeTemplateId, PhotoCrop>>
  >({});
  const [reframeOpen, setReframeOpen] = useState(false);

  // Sync default cover whenever modal opens on a trip
  useEffect(() => {
    if (visible) {
      setSelectedCoverUri(defaultCoverUri);
    }
  }, [visible, trip.id, defaultCoverUri]);

  // Measure selected cover photo dimensions for exact 1:1 WYSIWYG crop math
  useEffect(() => {
    if (!visible || !selectedCoverUri || coverDimsMap[selectedCoverUri]) return;
    Image.getSize(
      selectedCoverUri,
      (width, height) => {
        if (width > 0 && height > 0) {
          setCoverDimsMap((prev) => ({
            ...prev,
            [selectedCoverUri]: { width, height },
          }));
        }
      },
      () => {}
    );
  }, [visible, selectedCoverUri, coverDimsMap]);

  const tpl = getKeepsakeTemplateMeta(templateId);
  const activeCrop = cropsByTemplate[templateId] ?? DEFAULT_PHOTO_CROP;
  const activeDims = selectedCoverUri ? coverDimsMap[selectedCoverUri] : undefined;

  const geo = useMemo(
    () => deriveTripGeography(trip, flights, transports, stops),
    [trip, flights, transports, stops]
  );
  const structuredRoute = useMemo(
    () => buildStructuredJourneyRoute(flights, transports, stops),
    [flights, transports, stops]
  );
  const routeText = structuredRoute.nodes.map((n) => n.city).join(' → ');
  const flags = geo.visitedCountries.length > 0 ? geo.flagsLabel : trip.flagEmoji || '🌍';
  const subtitleGeo =
    geo.visitedCountries.length > 0
      ? geo.countriesLabel
      : [trip.destinationCity, trip.destinationCountry].filter(Boolean).join(', ');
  const totalKm = Math.round(
    flights.reduce((s, f) => s + milesToKm(f.distanceMiles || 0), 0) +
      transports.reduce((s, t) => s + (t.distanceKm || 0), 0)
  );
  const days = Math.max(
    1,
    Math.round(
      (Date.parse(`${trip.endDate.slice(0, 10)}T00:00:00Z`) -
        Date.parse(`${trip.startDate.slice(0, 10)}T00:00:00Z`)) /
        86400000
    ) + 1
  );

  // Preview photo slot dimensions scaled identically to A4 PDF dimensions
  const previewScale = PREVIEW_W / KEEPSAKE_A4_WIDTH;
  const previewSlotW = Math.round(tpl.coverSlotWidth * previewScale);
  const previewSlotH = Math.round(tpl.coverSlotHeight * previewScale);

  const previewImgLayout = useMemo(() => {
    if (!selectedCoverUri) return null;
    const imgW = activeDims?.width || 1200;
    const imgH = activeDims?.height || 900;
    return computeCroppedImageLayout(previewSlotW, previewSlotH, imgW, imgH, activeCrop);
  }, [selectedCoverUri, activeDims, previewSlotW, previewSlotH, activeCrop]);

  const isLandscapeCover =
    Boolean(activeDims) && (activeDims!.width / Math.max(1, activeDims!.height)) > 1.25;

  const handlePickGalleryCover = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (!res.canceled && res.assets[0]?.uri) {
        const asset = res.assets[0];
        setSelectedCoverUri(asset.uri);
        setGalleryExtraUris((prev) =>
          prev.includes(asset.uri) ? prev : [asset.uri, ...prev]
        );
        if (asset.width && asset.height) {
          setCoverDimsMap((prev) => ({
            ...prev,
            [asset.uri]: { width: asset.width!, height: asset.height! },
          }));
        }
        // Reset crop for newly picked photo
        setCropsByTemplate({});
        Haptics.selectionAsync().catch(() => {});
      }
    } catch {
      Alert.alert('Photo Picker', 'Could not open your photo library on this device.');
    }
  };

  const handleSelectPhoto = (uri: string | null) => {
    setSelectedCoverUri(uri);
    setCropsByTemplate({});
    Haptics.selectionAsync().catch(() => {});
  };

  const handleApplyCrop = (nextCrop: PhotoCrop) => {
    setCropsByTemplate((prev) => ({ ...prev, [templateId]: nextCrop }));
    setReframeOpen(false);
  };

  const renderCroppedPreviewPhoto = (borderRadius = 0) => {
    if (!selectedCoverUri || !previewImgLayout) return null;
    return (
      <View
        style={{
          width: previewSlotW,
          height: previewSlotH,
          overflow: 'hidden',
          borderRadius,
          position: 'relative',
          backgroundColor: '#1E293B',
        }}
      >
        <Image
          source={{ uri: selectedCoverUri }}
          resizeMode="stretch"
          style={{
            position: 'absolute',
            left: previewImgLayout.left,
            top: previewImgLayout.top,
            width: previewImgLayout.width,
            height: previewImgLayout.height,
          }}
        />
      </View>
    );
  };

  const renderLiveCoverPreview = () => {
    const gradColors = VIBE_GRADIENT_COLORS[trip.vibe] || VIBE_GRADIENT_COLORS.city;

    if (templateId === 'magazine') {
      return (
        <View style={[styles.previewCard, { backgroundColor: '#0F172A' }]}>
          {selectedCoverUri ? (
            <View style={StyleSheet.absoluteFill}>{renderCroppedPreviewPhoto(0)}</View>
          ) : (
            <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(15,23,42,0.58)', 'rgba(15,23,42,0.06)', 'rgba(15,23,42,0.88)']}
            locations={[0, 0.42, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.magPrevInner}>
            <View style={styles.magPrevMasthead}>
              <Text style={styles.magPrevBrand}>WANDERER'S LEDGER</Text>
              <Text style={styles.magPrevIssue}>TRIP KEEPSAKE EDITION</Text>
            </View>
            <View style={{ gap: 3 }}>
              <Text style={{ fontSize: 11 }}>{flags}</Text>
              <Text style={styles.magPrevTitle} numberOfLines={2}>
                {trip.title}
              </Text>
              <Text style={styles.magPrevSub} numberOfLines={1}>
                {subtitleGeo}
              </Text>
              <View style={styles.magPrevFooter}>
                <Text style={styles.magPrevStats}>
                  {days} {days === 1 ? 'DAY' : 'DAYS'} • {formatDistance(totalKm, distanceUnit)}
                </Text>
                {routeText ? (
                  <Text style={styles.magPrevRoute} numberOfLines={2}>
                    {routeText}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      );
    }

    if (templateId === 'artbook') {
      return (
        <View style={[styles.previewCard, { backgroundColor: '#FBF8F3', padding: 11 }]}>
          <View style={styles.artPrevFrame}>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text style={styles.artPrevKicker}>WANDERER'S LEDGER</Text>
              <Text style={styles.artPrevTitle} numberOfLines={2}>
                {trip.title}
              </Text>
              <Text style={styles.artPrevSub} numberOfLines={1}>
                {flags} {subtitleGeo}
              </Text>
            </View>
            <View style={styles.artPrevPhotoBox}>
              {selectedCoverUri ? (
                renderCroppedPreviewPhoto(2)
              ) : (
                <LinearGradient
                  colors={gradColors}
                  style={{ width: previewSlotW, height: previewSlotH, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 22 }}>🧭</Text>
                </LinearGradient>
              )}
            </View>
            <View style={styles.artPrevFoot}>
              {routeText ? (
                <Text style={styles.artPrevRoute} numberOfLines={2}>
                  {routeText}
                </Text>
              ) : null}
              <Text style={styles.artPrevStats}>
                {days} {days === 1 ? 'DAY' : 'DAYS'} · {formatDistance(totalKm, distanceUnit)}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.previewCard, { backgroundColor: '#131A36', padding: 11 }]}>
        <View style={styles.passPrevOuter}>
          <View style={styles.passPrevInner}>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.passPrevKicker}>TRAVELOGUE PASSPORT</Text>
              <Text style={styles.passPrevBrand}>WANDERER'S LEDGER</Text>
            </View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              {selectedCoverUri ? (
                <View style={styles.passPrevCameoRing}>{renderCroppedPreviewPhoto(6)}</View>
              ) : (
                <Text style={{ fontSize: 34, marginVertical: 10 }}>🧭</Text>
              )}
              <Text style={styles.passPrevTitle} numberOfLines={2}>
                {trip.title}
              </Text>
              <Text style={styles.passPrevSub} numberOfLines={1}>
                {flags} {subtitleGeo}
              </Text>
            </View>
            <View style={styles.passPrevFoot}>
              {routeText ? (
                <Text style={styles.passPrevRoute} numberOfLines={2}>
                  {routeText}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const uniqueThumbUris = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ uri: string; label: string }> = [];
    for (const uri of galleryExtraUris) {
      if (!seen.has(uri)) {
        seen.add(uri);
        list.push({ uri, label: 'Gallery' });
      }
    }
    if (trip.coverPhotoUri && !seen.has(trip.coverPhotoUri)) {
      seen.add(trip.coverPhotoUri);
      list.push({ uri: trip.coverPhotoUri, label: 'Cover' });
    }
    for (const m of photoMemories) {
      if (m.photoUri && !seen.has(m.photoUri)) {
        seen.add(m.photoUri);
        list.push({ uri: m.photoUri, label: m.title });
      }
    }
    return list;
  }, [galleryExtraUris, trip.coverPhotoUri, photoMemories]);

  return (
    <>
      <BottomSheetModal
        visible={visible}
        title="📖 Keepsake Studio"
        onClose={onClose}
        footer={
          <TouchableOpacity
            onPress={() =>
              onExport({
                templateId,
                coverPhotoUri: selectedCoverUri,
                coverDimensions: activeDims,
                coverCrop: activeCrop,
              })
            }
            disabled={exporting}
            style={[styles.exportBtn, exporting && { opacity: 0.72 }]}
            activeOpacity={0.9}
          >
            {exporting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.exportBtnText}>
                📖 Export {tpl.label} PDF (Zero Spend)
              </Text>
            )}
          </TouchableOpacity>
        }
      >
        {/* 1. 3 Magazine Style Templates */}
        <View style={{ gap: 6 }}>
          <Text style={styles.sectionLabel}>1. CHOOSE KEEPSAKE STYLE</Text>
          <View style={styles.tplRow}>
            {KEEPSAKE_TEMPLATES.map((t) => {
              const active = templateId === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => {
                    setTemplateId(t.id);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={[
                    styles.tplCard,
                    active && { borderColor: t.accentColor, backgroundColor: '#FFF9F2' },
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={{ fontSize: 18 }}>{t.emoji}</Text>
                  <Text
                    style={[
                      styles.tplTitle,
                      active && { color: t.accentColor },
                    ]}
                    numberOfLines={1}
                  >
                    {t.label}
                  </Text>
                  <Text style={styles.tplSub} numberOfLines={2}>
                    {t.tagline}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2. Live A4 Cover Preview + Reframe Button */}
        <View style={styles.previewStage}>
          <View style={styles.previewFrameShadow}>
            {renderLiveCoverPreview()}
          </View>

          <View style={styles.previewActionsCol}>
            {selectedCoverUri ? (
              <TouchableOpacity
                onPress={() => setReframeOpen(true)}
                style={styles.reframeBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.reframeBtnText}>✂️ Drag &amp; Zoom Cover</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.noPhotoHint}>
                Using {tpl.label} art cover — pick a photo below anytime!
              </Text>
            )}

            {templateId === 'magazine' && isLandscapeCover && (
              <TouchableOpacity
                onPress={() => setTemplateId('artbook')}
                style={styles.landscapeTipBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.landscapeTipText}>
                  💡 Wide landscape photo detected — try <Text style={{ fontWeight: '900' }}>🖼️ Art Book</Text> or tap Drag &amp; Zoom!
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 3. Cover Photo Picker Strip */}
        <View style={{ gap: 6 }}>
          <Text style={styles.sectionLabel}>2. COVER PHOTO (OPTIONAL)</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
          >
            <TouchableOpacity
              onPress={handlePickGalleryCover}
              style={styles.specialThumb}
              activeOpacity={0.82}
            >
              <Text style={{ fontSize: 18 }}>📷</Text>
              <Text style={styles.specialThumbText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSelectPhoto(null)}
              style={[
                styles.specialThumb,
                selectedCoverUri === null && styles.thumbActive,
              ]}
              activeOpacity={0.82}
            >
              <Text style={{ fontSize: 18 }}>🎨</Text>
              <Text style={styles.specialThumbText}>Art Cover</Text>
            </TouchableOpacity>

            {uniqueThumbUris.map((item) => {
              const active = selectedCoverUri === item.uri;
              return (
                <TouchableOpacity
                  key={item.uri}
                  onPress={() => handleSelectPhoto(item.uri)}
                  style={[styles.photoThumbWrap, active && styles.thumbActive]}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: item.uri }} style={styles.photoThumb} />
                  {active && (
                    <View style={styles.thumbCheck}>
                      <Text style={styles.thumbCheckText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <Text style={styles.privacyFoot}>
          🔒 100% offline • Includes cover, country passport stamps, grouped boarding passes &amp; stories — expenses &amp; receipts are never included.
        </Text>
      </BottomSheetModal>

      {/* Reuse IG Studio's proven drag & zoom PhotoReframeModal locked to the chosen template's exact A4 slot */}
      <PhotoReframeModal
        visible={reframeOpen && Boolean(selectedCoverUri)}
        photoUri={selectedCoverUri ?? undefined}
        title={`Reframe ${tpl.label} Cover`}
        slotAspectRatio={tpl.coverSlotWidth / tpl.coverSlotHeight}
        imageDimensions={activeDims}
        initialCrop={activeCrop}
        onApply={handleApplyCrop}
        onClose={() => setReframeOpen(false)}
      />
    </>
  );
};

const createStyles = (COLORS: ThemeColors) =>
  StyleSheet.create({
    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: COLORS.inkMuted,
      letterSpacing: 0.7,
    },
    tplRow: {
      flexDirection: 'row',
      gap: 8,
    },
    tplCard: {
      flex: 1,
      backgroundColor: COLORS.canvas,
      borderWidth: 1.5,
      borderColor: COLORS.border,
      borderRadius: 14,
      padding: 9,
      alignItems: 'center',
      gap: 2,
    },
    tplTitle: {
      fontSize: 12,
      fontWeight: '900',
      color: COLORS.ink,
    },
    tplSub: {
      fontSize: 9.5,
      color: COLORS.inkMuted,
      textAlign: 'center',
      lineHeight: 12.5,
    },
    previewStage: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    previewFrameShadow: {
      borderRadius: 12,
      shadowColor: '#000',
      shadowOpacity: 0.24,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
      backgroundColor: '#FFFFFF',
    },
    previewCard: {
      width: PREVIEW_W,
      height: PREVIEW_H,
      borderRadius: 10,
      overflow: 'hidden',
      position: 'relative',
    },
    magPrevInner: {
      flex: 1,
      padding: 15,
      justifyContent: 'space-between',
    },
    magPrevMasthead: {
      alignItems: 'center',
      borderTopWidth: 0.7,
      borderBottomWidth: 0.7,
      borderColor: 'rgba(255,255,255,0.45)',
      paddingVertical: 5,
    },
    magPrevBrand: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 2,
      color: '#FFFFFF',
    },
    magPrevIssue: {
      fontSize: 6,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: 'rgba(255,255,255,0.82)',
      marginTop: 1,
    },
    magPrevTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: '#FFFFFF',
      lineHeight: 19,
    },
    magPrevSub: {
      fontSize: 7.5,
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '600',
    },
    magPrevFooter: {
      marginTop: 5,
      paddingTop: 5,
      borderTopWidth: 0.7,
      borderTopColor: 'rgba(255,255,255,0.35)',
      gap: 2,
    },
    magPrevStats: {
      fontSize: 6.5,
      fontWeight: '800',
      color: '#FDE68A',
      letterSpacing: 0.6,
    },
    magPrevRoute: {
      fontSize: 6.5,
      color: 'rgba(255,255,255,0.88)',
      lineHeight: 9,
    },
    artPrevFrame: {
      flex: 1,
      borderWidth: 1,
      borderColor: '#DED5C5',
      paddingVertical: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    artPrevKicker: {
      fontSize: 6,
      fontWeight: '800',
      letterSpacing: 1.4,
      color: '#78716C',
    },
    artPrevTitle: {
      fontSize: 15,
      fontWeight: '900',
      color: '#1C1917',
      textAlign: 'center',
      lineHeight: 17,
    },
    artPrevSub: {
      fontSize: 7,
      color: '#57534E',
      fontWeight: '600',
    },
    artPrevPhotoBox: {
      borderWidth: 2.5,
      borderColor: '#FFFFFF',
      borderRadius: 3,
      overflow: 'hidden',
      elevation: 2,
    },
    artPrevFoot: {
      width: '100%',
      borderTopWidth: 0.7,
      borderTopColor: '#E7DFD1',
      paddingTop: 5,
      alignItems: 'center',
      gap: 2,
    },
    artPrevRoute: {
      fontSize: 6.5,
      color: '#292524',
      textAlign: 'center',
      lineHeight: 9,
    },
    artPrevStats: {
      fontSize: 6,
      fontWeight: '700',
      color: '#78716C',
      letterSpacing: 0.8,
    },
    passPrevOuter: {
      flex: 1,
      borderWidth: 1.4,
      borderColor: '#D4AF37',
      borderRadius: 7,
      padding: 3,
    },
    passPrevInner: {
      flex: 1,
      borderWidth: 0.7,
      borderColor: 'rgba(212,175,55,0.55)',
      borderRadius: 5,
      padding: 10,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    passPrevKicker: {
      fontSize: 6,
      fontWeight: '800',
      letterSpacing: 1.6,
      color: '#D4AF37',
    },
    passPrevBrand: {
      fontSize: 7.5,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: '#F6E6B4',
    },
    passPrevCameoRing: {
      padding: 3,
      borderWidth: 1,
      borderColor: '#D4AF37',
      borderRadius: 8,
    },
    passPrevTitle: {
      fontSize: 14,
      fontWeight: '900',
      color: '#FDF3D0',
      textAlign: 'center',
      lineHeight: 16,
    },
    passPrevSub: {
      fontSize: 7,
      color: '#E8D59B',
    },
    passPrevFoot: {
      width: '100%',
      borderTopWidth: 0.6,
      borderTopColor: 'rgba(212,175,55,0.35)',
      paddingTop: 5,
      alignItems: 'center',
    },
    passPrevRoute: {
      fontSize: 6.3,
      color: '#F6E6B4',
      textAlign: 'center',
      lineHeight: 9,
    },
    previewActionsCol: {
      width: '100%',
      alignItems: 'center',
      gap: 6,
    },
    reframeBtn: {
      backgroundColor: COLORS.navy,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 99,
    },
    reframeBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    noPhotoHint: {
      fontSize: 11,
      color: COLORS.inkMuted,
      textAlign: 'center',
    },
    landscapeTipBtn: {
      backgroundColor: COLORS.coralSoft,
      borderWidth: 1,
      borderColor: COLORS.coralBorder,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    landscapeTipText: {
      fontSize: 11,
      color: COLORS.coralDark,
      textAlign: 'center',
    },
    thumbStrip: {
      gap: 8,
      paddingVertical: 2,
    },
    specialThumb: {
      width: 60,
      height: 60,
      borderRadius: 12,
      backgroundColor: COLORS.canvas,
      borderWidth: 1.5,
      borderColor: COLORS.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    specialThumbText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: COLORS.inkMuted,
    },
    photoThumbWrap: {
      width: 60,
      height: 60,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'transparent',
      position: 'relative',
    },
    photoThumb: {
      width: '100%',
      height: '100%',
    },
    thumbActive: {
      borderColor: COLORS.coral,
    },
    thumbCheck: {
      position: 'absolute',
      right: 3,
      bottom: 3,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: COLORS.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbCheckText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '900',
    },
    privacyFoot: {
      fontSize: 10.5,
      color: COLORS.inkMuted,
      lineHeight: 15,
      textAlign: 'center',
    },
    exportBtn: {
      backgroundColor: COLORS.coral,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exportBtnText: {
      color: '#FFFFFF',
      fontSize: 14.5,
      fontWeight: '900',
    },
  });
