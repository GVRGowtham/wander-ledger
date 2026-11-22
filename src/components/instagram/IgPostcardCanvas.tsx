import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { DestinationBanner } from '../banners/DestinationBanner';
import { MemoryIllustration } from '../cards/MemoryIllustration';
import {
  CollageLayoutId,
  computeCroppedImageLayout,
  DEFAULT_PHOTO_CROP,
  formatEditorialDateRange,
  formatLocationLabel,
  formatShortDate,
  formatStampMonthYear,
  getDefaultPostcardNote,
  getPaletteSpec,
  getRouteStatsItems,
  getTripDaysCount,
  IgFormat,
  IgPaletteId,
  IgTemplate,
  ImageDimensions,
  isGenericPlaceholderNote,
  PhotoCrop,
  resolveLayoutForCount,
  RouteOverlayMode,
} from '../../services/igStudioHelpers';
import {
  formatDistance,
  formatDistanceValue,
  getTransportModeEmoji,
  milesToKm,
} from '../../services/distanceUtils';
import { COLORS } from '../../theme/tokens';
import { DistanceUnit, Flight, Memory, TransportLeg, Trip } from '../../types/models';

export type { IgFormat, IgTemplate };

export interface CarouselSlideSpec {
  id: string;
  label: string;
  kind: 'cover' | 'memory' | 'recap';
  memory?: Memory;
  slideIndex: number;
  totalSlides: number;
}

export interface SlotTapPayload {
  cropKey: string;
  memoryId?: string;
  photoUri: string;
  title: string;
  slotAspectRatio: number;
  slotIndex?: number;
}

/**
 * Tracks when every <Image> mounted inside an offscreen export canvas has
 * finished decoding & painting (onLoadEnd / onError), eliminating blank or
 * half-faded slides during Carousel & high-res PNG capture.
 */
interface ImageLoadRegistry {
  register: (id: string) => void;
  markDone: (id: string) => void;
  unregister: (id: string) => void;
}

const ImageLoadContext = createContext<ImageLoadRegistry | null>(null);

export const CanvasImageLoadScope: React.FC<{
  jobKey: string;
  onAllLoaded: () => void;
  children: React.ReactNode;
}> = ({ jobKey, onAllLoaded, children }) => {
  const registeredRef = useRef<Set<string>>(new Set());
  const doneRef = useRef<Set<string>>(new Set());
  const firedRef = useRef(false);
  const onAllLoadedRef = useRef(onAllLoaded);
  onAllLoadedRef.current = onAllLoaded;

  const checkReady = () => {
    if (firedRef.current) return;
    if (doneRef.current.size >= registeredRef.current.size) {
      firedRef.current = true;
      // Wait 2 animation frames after last onLoadEnd so Android commits pixels to GPU/Canvas
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onAllLoadedRef.current();
        });
      });
    }
  };

  useEffect(() => {
    // If the slide has zero <Image> elements (e.g. Passport Finale or illustration-only),
    // fire ready shortly after mount.
    const zeroImgTimer = setTimeout(() => {
      if (registeredRef.current.size === 0) {
        checkReady();
      }
    }, 80);

    // Absolute safety net so export can never hang on a corrupt/missing file
    const safetyTimer = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true;
        onAllLoadedRef.current();
      }
    }, 2800);

    return () => {
      clearTimeout(zeroImgTimer);
      clearTimeout(safetyTimer);
    };
  }, [jobKey]);

  const registry = useRef<ImageLoadRegistry>({
    register: (id: string) => {
      registeredRef.current.add(id);
    },
    markDone: (id: string) => {
      doneRef.current.add(id);
      checkReady();
    },
    unregister: (id: string) => {
      registeredRef.current.delete(id);
      doneRef.current.delete(id);
    },
  }).current;

  return <ImageLoadContext.Provider value={registry}>{children}</ImageLoadContext.Provider>;
};

interface CroppedImageProps {
  uri: string;
  slotWidth: number;
  slotHeight: number;
  borderRadius?: number;
  crop?: PhotoCrop;
  imageDimensions?: ImageDimensions;
  style?: object;
}

const CroppedImage: React.FC<CroppedImageProps> = ({
  uri,
  slotWidth,
  slotHeight,
  borderRadius = 0,
  crop,
  imageDimensions,
  style,
}) => {
  const tracker = useContext(ImageLoadContext);
  const instanceId = useId();
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    if (!tracker) return;
    tracker.register(instanceId);
    return () => tracker.unregister(instanceId);
  }, [tracker, instanceId, uri]);

  const sw = measured?.w && measured.w > 1 ? measured.w : slotWidth;
  const sh = measured?.h && measured.h > 1 ? measured.h : slotHeight;
  const iw = imageDimensions?.width || 1200;
  const ih = imageDimensions?.height || 900;

  const rect = computeCroppedImageLayout(sw, sh, iw, ih, crop ?? DEFAULT_PHOTO_CROP);

  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 1 && height > 1) {
          setMeasured((prev) =>
            prev && Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
              ? prev
              : { w: width, h: height }
          );
        }
      }}
      style={[
        {
          width: '100%',
          height: slotHeight,
          borderRadius,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#1F2937',
        },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        fadeDuration={0}
        resizeMethod="scale"
        onLoadEnd={() => tracker?.markDone(instanceId)}
        onError={() => tracker?.markDone(instanceId)}
        style={{
          position: 'absolute',
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
        }}
      />
    </View>
  );
};

interface PhotoSlotProps {
  memory?: Memory;
  fallbackVibe: Trip['vibe'];
  fallbackCover?: string;
  slotWidth: number;
  slotHeight: number;
  borderRadius?: number;
  cropKey?: string;
  slotIndex?: number;
  photoCrops?: Record<string, PhotoCrop>;
  imageDims?: Record<string, ImageDimensions>;
  onPressSlot?: (payload: SlotTapPayload) => void;
}

const PhotoSlot: React.FC<PhotoSlotProps> = ({
  memory,
  fallbackVibe,
  fallbackCover,
  slotWidth,
  slotHeight,
  borderRadius = 8,
  cropKey,
  slotIndex,
  photoCrops,
  imageDims,
  onPressSlot,
}) => {
  const effectiveKey = cropKey ?? memory?.id ?? '__fallback__';

  if (memory?.photoUri) {
    const uri = memory.photoUri;
    const content = (
      <CroppedImage
        uri={uri}
        slotWidth={slotWidth}
        slotHeight={slotHeight}
        borderRadius={borderRadius}
        crop={photoCrops?.[effectiveKey]}
        imageDimensions={imageDims?.[uri]}
      />
    );

    if (onPressSlot) {
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() =>
            onPressSlot({
              cropKey: effectiveKey,
              memoryId: memory.id,
              photoUri: uri,
              title: memory.title || 'Memory Photo',
              slotAspectRatio: slotWidth / Math.max(1, slotHeight),
              slotIndex,
            })
          }
        >
          {content}
        </TouchableOpacity>
      );
    }
    return content;
  }

  if (memory) {
    return (
      <View style={{ borderRadius, overflow: 'hidden', height: slotHeight }}>
        <MemoryIllustration illustrationKey={memory.illustrationKey} height={slotHeight} />
      </View>
    );
  }

  return (
    <View style={{ borderRadius, overflow: 'hidden', height: slotHeight }}>
      <DestinationBanner vibe={fallbackVibe} coverPhotoUri={fallbackCover} height={slotHeight} />
    </View>
  );
};

const WatermarkBar: React.FC<{ dark?: boolean; scale?: number }> = ({
  dark = false,
  scale = 1,
}) => (
  <View
    style={[
      styles.watermarkPill,
      dark ? styles.watermarkDark : styles.watermarkLight,
      {
        paddingHorizontal: 10 * scale,
        paddingVertical: 4 * scale,
      },
    ]}
  >
    <Text
      style={[
        styles.watermarkText,
        { fontSize: 8.5 * scale, letterSpacing: 0.85 * scale },
        dark && { color: '#FDE68A' },
      ]}
    >
      ✈️ STAMPED WITH WANDERER'S LEDGER
    </Text>
  </View>
);

const FlightArcGraphic: React.FC<{
  origin: string;
  dest: string;
  distanceKm: number;
  distanceUnit?: DistanceUnit;
  modeEmoji?: string;
  subtitleVerb?: string;
  lightText?: boolean;
  scale?: number;
}> = ({
  origin,
  dest,
  distanceKm,
  distanceUnit = 'km',
  modeEmoji = '✈️',
  subtitleVerb = 'across the sky',
  lightText = true,
  scale = 1,
}) => {
  const strokeColor = lightText ? '#FDE047' : '#F97316';
  const textColor = lightText ? '#FFFFFF' : COLORS.ink;
  const subColor = lightText ? 'rgba(255,255,255,0.85)' : COLORS.inkMuted;
  const endpointFontSize = origin.length > 4 || dest.length > 4 ? 14 * scale : 20 * scale;

  return (
    <View
      style={[
        styles.arcWrap,
        {
          borderRadius: 16 * scale,
          paddingVertical: 11 * scale,
          paddingHorizontal: 14 * scale,
          gap: 3 * scale,
        },
      ]}
    >
      <View style={[styles.arcEndpoints, { gap: 8 * scale }]}>
        <Text
          style={[styles.arcCode, { color: textColor, fontSize: endpointFontSize, maxWidth: 88 * scale }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {origin}
        </Text>
        <View style={styles.arcSvgBox}>
          <Svg width="100%" height={32 * scale} viewBox="0 0 140 36">
            <Path
              d="M 8 28 Q 70 -4 132 28"
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.4}
              strokeDasharray="5,4"
            />
            <Circle cx={8} cy={28} r={4} fill={strokeColor} />
            <Circle cx={132} cy={28} r={4} fill={strokeColor} />
          </Svg>
          <Text style={[styles.arcPlane, { fontSize: 13 * scale, top: 1 * scale }]}>{modeEmoji}</Text>
        </View>
        <Text
          style={[styles.arcCode, { color: textColor, fontSize: endpointFontSize, maxWidth: 88 * scale }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {dest}
        </Text>
      </View>
      {distanceKm > 0 && (
        <Text style={[styles.arcMiles, { color: subColor, fontSize: 9.5 * scale }]}>
          {formatDistance(distanceKm, distanceUnit)} {subtitleVerb}
        </Text>
      )}
    </View>
  );
};

export interface SingleCanvasProps {
  trip: Trip;
  memories: Memory[];
  flights: Flight[];
  transports?: TransportLeg[];
  distanceUnit?: DistanceUnit;
  format: 'story' | 'feed';
  template: IgTemplate;
  showWatermark: boolean;
  canvasWidth?: number;
  layout?: CollageLayoutId;
  paletteId?: IgPaletteId;
  showPhotoLabels?: boolean;
  showPostcardNote?: boolean;
  postcardNote?: string;
  routeOverlay?: RouteOverlayMode;
  routeBackdropMemoryId?: string;
  photoCrops?: Record<string, PhotoCrop>;
  imageDims?: Record<string, ImageDimensions>;
  onPressSlot?: (payload: SlotTapPayload) => void;
}

export interface CarouselSlideCanvasProps {
  trip: Trip;
  flights: Flight[];
  transports?: TransportLeg[];
  distanceUnit?: DistanceUnit;
  allSelectedMemories: Memory[];
  slide: CarouselSlideSpec;
  showWatermark: boolean;
  canvasWidth?: number;
  paletteId?: IgPaletteId;
  showPhotoLabels?: boolean;
  coverMemoryId?: string;
  photoCrops?: Record<string, PhotoCrop>;
  imageDims?: Record<string, ImageDimensions>;
  onPressSlot?: (payload: SlotTapPayload) => void;
}

/**
 * Renders high-craft Story (9:16) or Feed Collage (4:5) postcard canvases
 * with proportional scaling so native 1080px exports match the preview 1:1.
 */
export const IgSingleCanvas: React.FC<SingleCanvasProps> = ({
  trip,
  memories,
  flights,
  transports = [],
  distanceUnit = 'km',
  format,
  template,
  showWatermark,
  canvasWidth = 312,
  layout,
  paletteId = 'sunlit',
  showPhotoLabels = true,
  showPostcardNote = true,
  postcardNote,
  routeOverlay = 'minimal',
  routeBackdropMemoryId,
  photoCrops,
  imageDims,
  onPressSlot,
}) => {
  const s = canvasWidth / 312;
  const height = Math.round(format === 'story' ? (canvasWidth * 16) / 9 : (canvasWidth * 5) / 4);
  const days = getTripDaysCount(trip.startDate, trip.endDate);
  const totalMiles = flights.reduce((sum, f) => sum + (f.distanceMiles || 0), 0);
  const totalDistanceKm =
    milesToKm(totalMiles) + transports.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
  const primaryFlight = flights[0];
  const primaryTransport = transports[0];
  const palette = getPaletteSpec(paletteId);
  const editorialDateRange = formatEditorialDateRange(trip.startDate, trip.endDate);

  const picked = memories.slice(0, 4);
  const activeLayout = resolveLayoutForCount(picked.length, layout);
  const isStory = format === 'story';

  // Helper to render a Polaroid card inside Scrapbook
  const renderPolaroid = (
    m: Memory | undefined,
    idx: number,
    slotW: number,
    slotH: number,
    tiltDeg: string,
    compact = false
  ) => {
    const pad = (compact ? 5.5 : 8) * s;
    const innerW = Math.max(20, slotW - pad * 2);
    return (
      <View
        key={m?.id ?? `empty_${idx}`}
        style={{
          width: slotW,
          backgroundColor: palette.polaroidBg,
          borderRadius: (compact ? 9 : 12) * s,
          padding: pad,
          paddingBottom: (showPhotoLabels ? (compact ? 6.5 : 10) : pad) * s,
          borderWidth: 1,
          borderColor: palette.polaroidBorder,
          transform: [{ rotate: tiltDeg }],
          shadowColor: '#000',
          shadowOpacity: palette.dark ? 0.28 : 0.09,
          shadowRadius: 6 * s,
          elevation: 3,
        }}
      >
        <View
          style={{
            width: (compact ? 28 : 44) * s,
            height: (compact ? 6.5 : 10) * s,
            backgroundColor: palette.tapeColor,
            alignSelf: 'center',
            marginTop: -(pad + 3.5 * s),
            marginBottom: (compact ? 3 : 5) * s,
            borderRadius: 2 * s,
          }}
        />
        <PhotoSlot
          memory={m}
          fallbackVibe={trip.vibe}
          fallbackCover={trip.coverPhotoUri}
          slotWidth={innerW}
          slotHeight={slotH}
          borderRadius={(compact ? 5 : 8) * s}
          slotIndex={idx}
          photoCrops={photoCrops}
          imageDims={imageDims}
          onPressSlot={onPressSlot}
        />
        {showPhotoLabels && m ? (
          <Text
            style={{
              fontSize: (compact ? 9.5 : 12.5) * s,
              fontWeight: '800',
              color: palette.ink,
              marginTop: (compact ? 4 : 6) * s,
              textAlign: 'center',
            }}
            numberOfLines={1}
          >
            {m.title}
          </Text>
        ) : null}
      </View>
    );
  };

  // =========================================================================
  // TEMPLATE 1: POLAROID SCRAPBOOK COLLAGE
  // =========================================================================
  if (template === 'scrapbook') {
    const bodyW = canvasWidth - 28 * s;
    const gap = 8 * s;
    const halfW = (bodyW - gap) / 2;
    const thirdW = (bodyW - gap * 2) / 3;
    const labelAllowance = showPhotoLabels ? 16 * s : 0;

    return (
      <LinearGradient
        colors={palette.scrapGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.canvasBase, { width: canvasWidth, height, borderRadius: 20 * s }]}
      >
        {/* Top Scrapbook Header */}
        <View
          style={{
            paddingTop: 14 * s,
            paddingHorizontal: 16 * s,
            alignItems: 'center',
            gap: 3 * s,
          }}
        >
          <View
            style={{
              backgroundColor: palette.accentSoft,
              paddingHorizontal: 10 * s,
              paddingVertical: 3 * s,
              borderRadius: 99,
            }}
          >
            <Text
              style={{
                fontSize: 9 * s,
                fontWeight: '900',
                color: palette.accent,
                letterSpacing: 0.7 * s,
              }}
            >
              {trip.flagEmoji} {trip.destinationCity.toUpperCase()} • {days}D
            </Text>
          </View>
          <Text
            style={{ fontSize: 18 * s, fontWeight: '900', color: palette.ink }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {trip.title}
          </Text>
          <Text style={{ fontSize: 10 * s, fontWeight: '700', color: palette.inkMuted }}>
            {editorialDateRange}
          </Text>
        </View>

        {/* Polaroid Collage Body (Layout-aware!) */}
        <View
          style={{
            flex: 1,
            paddingHorizontal: 14 * s,
            paddingVertical: 8 * s,
            justifyContent: 'center',
          }}
        >
          {picked.length <= 1 ? (
            <View
              style={{
                backgroundColor: palette.polaroidBg,
                borderRadius: 12 * s,
                padding: 10 * s,
                paddingBottom: 12 * s,
                borderWidth: 1,
                borderColor: palette.polaroidBorder,
                transform: [{ rotate: '-1.2deg' }],
                elevation: 4,
              }}
            >
              <View
                style={{
                  width: 48 * s,
                  height: 11 * s,
                  backgroundColor: palette.tapeColor,
                  alignSelf: 'center',
                  marginTop: -15 * s,
                  marginBottom: 6 * s,
                  borderRadius: 2 * s,
                }}
              />
              <PhotoSlot
                memory={picked[0]}
                fallbackVibe={trip.vibe}
                fallbackCover={trip.coverPhotoUri}
                slotWidth={bodyW - 20 * s}
                slotHeight={(isStory ? 285 : 184) * s}
                borderRadius={8 * s}
                slotIndex={0}
                photoCrops={photoCrops}
                imageDims={imageDims}
                onPressSlot={onPressSlot}
              />
              {showPhotoLabels && (
                <View style={{ paddingTop: 8 * s, gap: 3 * s }}>
                  <Text
                    style={{ fontSize: 13.5 * s, fontWeight: '900', color: palette.ink }}
                    numberOfLines={1}
                  >
                    {picked[0]?.title || `${trip.destinationCity} Highlights`}
                  </Text>
                  {picked[0]?.note && !isGenericPlaceholderNote(picked[0].note) ? (
                    <Text
                      style={{ fontSize: 10.5 * s, color: palette.inkMuted, lineHeight: 14 * s }}
                      numberOfLines={2}
                    >
                      {picked[0].note}
                    </Text>
                  ) : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 2 * s,
                    }}
                  >
                    <Text style={{ fontSize: 9.5 * s, fontWeight: '800', color: palette.accent }}>
                      {picked[0]?.moodSticker || '🌅 Core Memory'}
                    </Text>
                    {picked[0]?.placeName ? (
                      <Text
                        style={{ fontSize: 9.5 * s, fontWeight: '700', color: palette.inkMuted }}
                        numberOfLines={1}
                      >
                        📍 {picked[0].placeName}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
            </View>
          ) : picked.length === 2 ? (
            activeLayout === 'side_by_side' ? (
              <View style={{ flexDirection: 'row', gap, alignItems: 'center' }}>
                {renderPolaroid(
                  picked[0],
                  0,
                  halfW,
                  (isStory ? 285 : 188) * s,
                  '-1.3deg',
                  true
                )}
                {renderPolaroid(
                  picked[1],
                  1,
                  halfW,
                  (isStory ? 285 : 188) * s,
                  '1.3deg',
                  true
                )}
              </View>
            ) : activeLayout === 'hero_inset' ? (
              <View style={{ gap: gap * 1.1, alignItems: 'center' }}>
                {renderPolaroid(
                  picked[0],
                  0,
                  bodyW,
                  (isStory ? 210 : 126) * s,
                  '-1deg',
                  true
                )}
                {renderPolaroid(
                  picked[1],
                  1,
                  bodyW * 0.78,
                  (isStory ? 120 : 76) * s,
                  '1.5deg',
                  true
                )}
              </View>
            ) : (
              // 'stacked'
              <View style={{ gap: gap * 1.2 }}>
                {renderPolaroid(
                  picked[0],
                  0,
                  bodyW,
                  (isStory ? 156 : 98) * s,
                  '-1.3deg',
                  true
                )}
                {renderPolaroid(
                  picked[1],
                  1,
                  bodyW,
                  (isStory ? 156 : 98) * s,
                  '1.2deg',
                  true
                )}
              </View>
            )
          ) : picked.length === 3 ? (
            activeLayout === 'portrait_left' ? (
              <View style={{ flexDirection: 'row', gap, alignItems: 'center' }}>
                {renderPolaroid(
                  picked[0],
                  0,
                  bodyW * 0.52,
                  (isStory ? 316 : 206) * s + labelAllowance,
                  '-1deg',
                  true
                )}
                <View style={{ gap, flex: 1 }}>
                  {renderPolaroid(
                    picked[1],
                    1,
                    bodyW * 0.48 - gap,
                    (isStory ? 148 : 94) * s,
                    '1.2deg',
                    true
                  )}
                  {renderPolaroid(
                    picked[2],
                    2,
                    bodyW * 0.48 - gap,
                    (isStory ? 148 : 94) * s,
                    '-1.1deg',
                    true
                  )}
                </View>
              </View>
            ) : activeLayout === 'hero_bottom' ? (
              <View style={{ gap }}>
                <View style={{ flexDirection: 'row', gap }}>
                  {renderPolaroid(picked[0], 0, halfW, (isStory ? 142 : 88) * s, '-1.3deg', true)}
                  {renderPolaroid(picked[1], 1, halfW, (isStory ? 142 : 88) * s, '1.2deg', true)}
                </View>
                {renderPolaroid(picked[2], 2, bodyW, (isStory ? 168 : 108) * s, '-0.8deg', true)}
              </View>
            ) : activeLayout === 'triptych' ? (
              <View style={{ flexDirection: 'row', gap: gap * 0.75, alignItems: 'center' }}>
                {picked.map((m, i) =>
                  renderPolaroid(
                    m,
                    i,
                    (bodyW - gap * 1.5) / 3,
                    (isStory ? 280 : 185) * s,
                    i === 0 ? '-1.2deg' : i === 2 ? '1.2deg' : '0deg',
                    true
                  )
                )}
              </View>
            ) : (
              // 'hero_top'
              <View style={{ gap }}>
                {renderPolaroid(picked[0], 0, bodyW, (isStory ? 168 : 108) * s, '-1deg', true)}
                <View style={{ flexDirection: 'row', gap }}>
                  {renderPolaroid(picked[1], 1, halfW, (isStory ? 142 : 88) * s, '1.3deg', true)}
                  {renderPolaroid(picked[2], 2, halfW, (isStory ? 142 : 88) * s, '-1.2deg', true)}
                </View>
              </View>
            )
          ) : // 4 photos
          activeLayout === 'hero_top_3' ? (
            <View style={{ gap }}>
              {renderPolaroid(picked[0], 0, bodyW, (isStory ? 190 : 118) * s, '-0.8deg', true)}
              <View style={{ flexDirection: 'row', gap: gap * 0.75 }}>
                {picked.slice(1, 4).map((m, i) =>
                  renderPolaroid(
                    m,
                    i + 1,
                    (bodyW - gap * 1.5) / 3,
                    (isStory ? 122 : 76) * s,
                    i === 1 ? '1deg' : '-1deg',
                    true
                  )
                )}
              </View>
            </View>
          ) : activeLayout === 'tall_left_3' ? (
            <View style={{ flexDirection: 'row', gap, alignItems: 'center' }}>
              {renderPolaroid(
                picked[0],
                0,
                bodyW * 0.54,
                (isStory ? 324 : 212) * s + labelAllowance * 1.6,
                '-0.9deg',
                true
              )}
              <View style={{ gap: gap * 0.8, flex: 1 }}>
                {picked.slice(1, 4).map((m, i) =>
                  renderPolaroid(
                    m,
                    i + 1,
                    bodyW * 0.46 - gap,
                    (isStory ? 96 : 60) * s,
                    i % 2 === 0 ? '1deg' : '-1deg',
                    true
                  )
                )}
              </View>
            </View>
          ) : (
            // 'grid_2x2'
            <View style={{ gap }}>
              <View style={{ flexDirection: 'row', gap }}>
                {renderPolaroid(picked[0], 0, halfW, (isStory ? 150 : 92) * s, '-1.3deg', true)}
                {renderPolaroid(picked[1], 1, halfW, (isStory ? 150 : 92) * s, '1.2deg', true)}
              </View>
              <View style={{ flexDirection: 'row', gap }}>
                {renderPolaroid(picked[2], 2, halfW, (isStory ? 150 : 92) * s, '1.1deg', true)}
                {renderPolaroid(picked[3], 3, halfW, (isStory ? 150 : 92) * s, '-1.3deg', true)}
              </View>
            </View>
          )}
        </View>

        {/* Bottom Footer */}
        <View
          style={{
            paddingBottom: 12 * s,
            paddingHorizontal: 14 * s,
            alignItems: 'center',
            gap: 5 * s,
          }}
        >
          {totalDistanceKm > 0 && (
            <Text style={{ fontSize: 9.5 * s, fontWeight: '800', color: palette.inkMuted }}>
              {primaryFlight ? '✈️' : primaryTransport ? getTransportModeEmoji(primaryTransport.mode) : '🧭'}{' '}
              {formatDistance(totalDistanceKm, distanceUnit)} • 📸 {memories.length} memories
            </Text>
          )}
          {showWatermark && <WatermarkBar dark={palette.dark} scale={s} />}
        </View>
      </LinearGradient>
    );
  }

  // =========================================================================
  // TEMPLATE 2: FLIGHT / JOURNEY ROUTE & STATS RECAP
  // =========================================================================
  if (template === 'route') {
    const backdropMem =
      (routeBackdropMemoryId
        ? memories.find((m) => m.id === routeBackdropMemoryId && m.photoUri)
        : undefined) ?? memories.find((m) => m.photoUri);
    const heroPhoto = backdropMem?.photoUri ?? trip.coverPhotoUri;
    const backdropCropKey = backdropMem ? `route_${backdropMem.id}` : '__route_backdrop__';
    const statItems = getRouteStatsItems(trip, memories, flights, transports, distanceUnit);

    const renderCenterpiece = () => {
      if (primaryFlight) {
        return (
          <FlightArcGraphic
            origin={primaryFlight.originIata}
            dest={primaryFlight.destIata}
            distanceKm={totalDistanceKm}
            distanceUnit={distanceUnit}
            modeEmoji="✈️"
            subtitleVerb="across the sky"
            lightText
            scale={s}
          />
        );
      }
      if (primaryTransport) {
        return (
          <FlightArcGraphic
            origin={primaryTransport.origin}
            dest={primaryTransport.destination}
            distanceKm={totalDistanceKm}
            distanceUnit={distanceUnit}
            modeEmoji={getTransportModeEmoji(primaryTransport.mode)}
            subtitleVerb={
              primaryTransport.mode === 'own_car' || primaryTransport.mode === 'rental_car'
                ? 'on the open road'
                : 'on the journey'
            }
            lightText
            scale={s}
          />
        );
      }
      if (routeOverlay === 'minimal') {
        return null;
      }
      return (
        <View
          style={[
            styles.destSeal,
            {
              borderRadius: 18 * s,
              paddingHorizontal: 20 * s,
              paddingVertical: 11 * s,
              gap: 2 * s,
            },
          ]}
        >
          <Text style={{ fontSize: 24 * s }}>{trip.flagEmoji}</Text>
          <Text style={[styles.destSealCity, { fontSize: 16 * s }]}>
            {trip.destinationCity.toUpperCase()}
          </Text>
          <Text style={[styles.destSealSub, { fontSize: 8.5 * s }]}>PASSPORT STAMPED ✨</Text>
        </View>
      );
    };

    const backdropNode = heroPhoto ? (
      <CroppedImage
        uri={heroPhoto}
        slotWidth={canvasWidth}
        slotHeight={height}
        crop={photoCrops?.[backdropCropKey] ?? photoCrops?.[backdropMem?.id ?? '']}
        imageDimensions={imageDims?.[heroPhoto]}
        style={StyleSheet.absoluteFill}
      />
    ) : (
      <DestinationBanner vibe={trip.vibe} height={height} />
    );

    return (
      <View
        style={[
          styles.canvasBase,
          { width: canvasWidth, height, backgroundColor: '#1E1B4B', borderRadius: 20 * s },
        ]}
      >
        {/* Full-bleed scenic photo backdrop (tappable to reframe!) */}
        <View style={StyleSheet.absoluteFill}>
          {backdropNode}
          <LinearGradient
            colors={
              routeOverlay === 'minimal'
                ? ['rgba(15,23,42,0.72)', 'rgba(15,23,42,0.06)', 'rgba(15,23,42,0.88)']
                : ['rgba(15,23,42,0.72)', 'rgba(30,27,75,0.42)', 'rgba(15,23,42,0.90)']
            }
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        {/* Tappable transparent hit layer for reframing the Route backdrop */}
        {heroPhoto && onPressSlot ? (
          <TouchableOpacity
            activeOpacity={0.95}
            style={StyleSheet.absoluteFill}
            onPress={() =>
              onPressSlot({
                cropKey: backdropCropKey,
                memoryId: backdropMem?.id,
                photoUri: heroPhoto,
                title: backdropMem?.title || `${trip.title} Backdrop`,
                slotAspectRatio: canvasWidth / height,
              })
            }
          />
        ) : null}

        {/* Top Header */}
        <View
          pointerEvents="none"
          style={{
            paddingTop: 18 * s,
            paddingHorizontal: 18 * s,
            alignItems: 'center',
            gap: 4 * s,
          }}
        >
          <View
            style={[
              styles.routePill,
              { paddingHorizontal: 11 * s, paddingVertical: 4 * s },
            ]}
          >
            <Text style={[styles.routePillText, { fontSize: 8.5 * s }]}>
              {trip.flagEmoji} TRIP RECAP • {trip.destinationCountry.toUpperCase()}
            </Text>
          </View>
          <Text
            style={[styles.routeTitle, { fontSize: 22 * s, marginTop: 2 * s }]}
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {trip.title}
          </Text>
          <Text style={[styles.routeDate, { fontSize: 10.5 * s }]}>{editorialDateRange}</Text>
        </View>

        {/* Flexible Middle Region (respects Top / Center / Bottom / Clean placement) */}
        <View
          pointerEvents="none"
          style={{
            flex: 1,
            justifyContent:
              routeOverlay === 'top'
                ? 'flex-start'
                : routeOverlay === 'bottom'
                ? 'flex-end'
                : 'center',
            paddingHorizontal: 18 * s,
            paddingVertical: 12 * s,
            gap: 12 * s,
          }}
        >
          {renderCenterpiece()}

          {isStory && picked.length >= 2 && routeOverlay !== 'minimal' && (
            <View style={{ flexDirection: 'row', gap: 8 * s }}>
              {picked.slice(0, 3).map((m, idx) => (
                <View
                  key={m.id}
                  style={{
                    flex: 1,
                    borderRadius: 10 * s,
                    borderWidth: 2 * s,
                    borderColor: 'rgba(255,255,255,0.85)',
                    overflow: 'hidden',
                  }}
                >
                  <PhotoSlot
                    memory={m}
                    fallbackVibe={trip.vibe}
                    slotWidth={(canvasWidth - 52 * s) / 3}
                    slotHeight={74 * s}
                    borderRadius={8 * s}
                    slotIndex={idx}
                    photoCrops={photoCrops}
                    imageDims={imageDims}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Bottom Glass Stats Strip (Zero Spend, Zero Duplicate Labels!) */}
        <View
          pointerEvents="none"
          style={{ paddingHorizontal: 16 * s, paddingBottom: 15 * s, gap: 10 * s }}
        >
          <View
            style={[
              styles.glassStatsRow,
              { borderRadius: 16 * s, paddingVertical: 10 * s },
            ]}
          >
            {statItems.map((item, idx) => (
              <React.Fragment key={`${item.label}_${idx}`}>
                {idx > 0 && <View style={[styles.glassDivider, { height: 24 * s }]} />}
                <View style={styles.glassStat}>
                  <Text style={[styles.glassStatVal, { fontSize: 16 * s }]}>{item.value}</Text>
                  <Text style={[styles.glassStatLbl, { fontSize: 8 * s, marginTop: 2 * s }]}>
                    {item.label}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>
          {showWatermark && <WatermarkBar dark scale={s} />}
        </View>
      </View>
    );
  }

  // =========================================================================
  // TEMPLATE 3: VINTAGE AIRMAIL POSTCARD
  // =========================================================================
  const innerW = canvasWidth - 30 * s;
  const gap = 8 * s;
  const halfW = (innerW - gap) / 2;
  const thirdW = (innerW - gap * 2) / 3;

  const cityEqualsCountry =
    trip.destinationCity.trim().toLowerCase() === trip.destinationCountry.trim().toLowerCase();
  const postcardSubLine = cityEqualsCountry
    ? `${days} ${days === 1 ? 'Day' : 'Days'} • ${memories.length || 1} ${
        memories.length === 1 ? 'Memory' : 'Memories'
      }`
    : `${trip.destinationCountry} • ${days} ${days === 1 ? 'Day' : 'Days'}`;

  const resolvedNote =
    postcardNote !== undefined ? postcardNote.trim() : getDefaultPostcardNote(trip, picked);
  const noteVisible = showPostcardNote && resolvedNote.length > 0;
  const noteBonusH = noteVisible ? 0 : 28 * s;

  return (
    <View
      style={[
        styles.canvasBase,
        {
          width: canvasWidth,
          height,
          borderRadius: 20 * s,
          backgroundColor: palette.postcardBg,
          borderWidth: 1,
          borderColor: palette.postcardBorder,
          justifyContent: 'space-between',
        },
      ]}
    >
      {/* Colorful Airmail Stripe Top */}
      <View style={[styles.airmailStripeRow, { height: 8 * s, gap: 4 * s, paddingHorizontal: 4 * s }]}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View
            key={`t_${i}`}
            style={[
              styles.airmailDash,
              { backgroundColor: i % 2 === 0 ? '#F43F5E' : '#0EA5E9' },
            ]}
          />
        ))}
      </View>

      <View
        style={{
          flex: 1,
          paddingHorizontal: 15 * s,
          paddingVertical: 10 * s,
          justifyContent: 'space-between',
          gap: 8 * s,
        }}
      >
        {/* Header with Single Clean Date in Rubber Stamp (no duplicate date or country!) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 * s }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 8.5 * s,
                fontWeight: '900',
                color: palette.accent,
                letterSpacing: 1.2 * s,
              }}
            >
              GREETINGS FROM
            </Text>
            <Text
              style={{ fontSize: 20 * s, fontWeight: '900', color: palette.ink }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {trip.destinationCity} {trip.flagEmoji}
            </Text>
            <Text style={{ fontSize: 10 * s, fontWeight: '700', color: palette.inkMuted }}>
              {postcardSubLine}
            </Text>
          </View>
          <View
            style={{
              borderWidth: 2 * s,
              borderColor: palette.stampColor,
              backgroundColor: palette.stampBg,
              borderRadius: 10 * s,
              paddingHorizontal: 9 * s,
              paddingVertical: 5 * s,
              alignItems: 'center',
              transform: [{ rotate: '6deg' }],
            }}
          >
            <Text
              style={{
                fontSize: 11.5 * s,
                fontWeight: '900',
                color: palette.stampColor,
                letterSpacing: 1 * s,
              }}
            >
              {trip.countryCode}
            </Text>
            <Text
              style={{
                fontSize: 8 * s,
                fontWeight: '800',
                color: palette.stampColor,
                fontFamily: 'monospace',
              }}
            >
              {formatStampMonthYear(trip.startDate)}
            </Text>
          </View>
        </View>

        {/* Clean Editorial Photo Frame / Layout-Aware Grid */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {picked.length <= 1 ? (
            <PhotoSlot
              memory={picked[0]}
              fallbackVibe={trip.vibe}
              fallbackCover={trip.coverPhotoUri}
              slotWidth={innerW}
              slotHeight={(isStory ? 310 : 196) * s + noteBonusH}
              borderRadius={14 * s}
              slotIndex={0}
              photoCrops={photoCrops}
              imageDims={imageDims}
              onPressSlot={onPressSlot}
            />
          ) : picked.length === 2 ? (
            activeLayout === 'stacked' ? (
              <View style={{ gap }}>
                {picked.map((m, idx) => (
                  <PhotoSlot
                    key={m.id}
                    memory={m}
                    fallbackVibe={trip.vibe}
                    slotWidth={innerW}
                    slotHeight={(isStory ? 155 : 96) * s + noteBonusH / 2}
                    borderRadius={12 * s}
                    slotIndex={idx}
                    photoCrops={photoCrops}
                    imageDims={imageDims}
                    onPressSlot={onPressSlot}
                  />
                ))}
              </View>
            ) : activeLayout === 'hero_inset' ? (
              <View style={{ gap }}>
                <PhotoSlot
                  memory={picked[0]}
                  fallbackVibe={trip.vibe}
                  slotWidth={innerW}
                  slotHeight={(isStory ? 204 : 128) * s + noteBonusH * 0.6}
                  borderRadius={12 * s}
                  slotIndex={0}
                  photoCrops={photoCrops}
                  imageDims={imageDims}
                  onPressSlot={onPressSlot}
                />
                <PhotoSlot
                  memory={picked[1]}
                  fallbackVibe={trip.vibe}
                  slotWidth={innerW}
                  slotHeight={(isStory ? 104 : 66) * s + noteBonusH * 0.4}
                  borderRadius={12 * s}
                  slotIndex={1}
                  photoCrops={photoCrops}
                  imageDims={imageDims}
                  onPressSlot={onPressSlot}
                />
              </View>
            ) : (
              // 'side_by_side'
              <View style={{ flexDirection: 'row', gap }}>
                {picked.map((m, idx) => (
                  <View key={m.id} style={{ flex: 1 }}>
                    <PhotoSlot
                      memory={m}
                      fallbackVibe={trip.vibe}
                      slotWidth={halfW}
                      slotHeight={(isStory ? 295 : 194) * s + noteBonusH}
                      borderRadius={12 * s}
                      slotIndex={idx}
                      photoCrops={photoCrops}
                      imageDims={imageDims}
                      onPressSlot={onPressSlot}
                    />
                  </View>
                ))}
              </View>
            )
          ) : picked.length === 3 ? (
            activeLayout === 'portrait_left' ? (
              <View style={{ flexDirection: 'row', gap }}>
                <View style={{ width: innerW * 0.54 }}>
                  <PhotoSlot
                    memory={picked[0]}
                    fallbackVibe={trip.vibe}
                    slotWidth={innerW * 0.54}
                    slotHeight={(isStory ? 308 : 198) * s + noteBonusH}
                    borderRadius={12 * s}
                    slotIndex={0}
                    photoCrops={photoCrops}
                    imageDims={imageDims}
                    onPressSlot={onPressSlot}
                  />
                </View>
                <View style={{ flex: 1, gap }}>
                  {[picked[1], picked[2]].map((m, i) => (
                    <PhotoSlot
                      key={m.id}
                      memory={m}
                      fallbackVibe={trip.vibe}
                      slotWidth={innerW * 0.46 - gap}
                      slotHeight={((isStory ? 308 : 198) * s + noteBonusH - gap) / 2}
                      borderRadius={10 * s}
                      slotIndex={i + 1}
                      photoCrops={photoCrops}
                      imageDims={imageDims}
                      onPressSlot={onPressSlot}
                    />
                  ))}
                </View>
              </View>
            ) : activeLayout === 'hero_bottom' ? (
              <View style={{ gap }}>
                <View style={{ flexDirection: 'row', gap }}>
                  {[picked[0], picked[1]].map((m, i) => (
                    <View key={m.id} style={{ flex: 1 }}>
                      <PhotoSlot
                        memory={m}
                        fallbackVibe={trip.vibe}
                        slotWidth={halfW}
                        slotHeight={(isStory ? 132 : 84) * s + noteBonusH * 0.45}
                        borderRadius={10 * s}
                        slotIndex={i}
                        photoCrops={photoCrops}
                        imageDims={imageDims}
                        onPressSlot={onPressSlot}
                      />
                    </View>
                  ))}
                </View>
                <PhotoSlot
                  memory={picked[2]}
                  fallbackVibe={trip.vibe}
                  slotWidth={innerW}
                  slotHeight={(isStory ? 174 : 110) * s + noteBonusH * 0.55}
                  borderRadius={12 * s}
                  slotIndex={2}
                  photoCrops={photoCrops}
                  imageDims={imageDims}
                  onPressSlot={onPressSlot}
                />
              </View>
            ) : activeLayout === 'triptych' ? (
              <View style={{ flexDirection: 'row', gap: gap * 0.8 }}>
                {picked.map((m, i) => (
                  <View key={m.id} style={{ flex: 1 }}>
                    <PhotoSlot
                      memory={m}
                      fallbackVibe={trip.vibe}
                      slotWidth={thirdW}
                      slotHeight={(isStory ? 295 : 194) * s + noteBonusH}
                      borderRadius={10 * s}
                      slotIndex={i}
                      photoCrops={photoCrops}
                      imageDims={imageDims}
                      onPressSlot={onPressSlot}
                    />
                  </View>
                ))}
              </View>
            ) : (
              // 'hero_top'
              <View style={{ gap }}>
                <PhotoSlot
                  memory={picked[0]}
                  fallbackVibe={trip.vibe}
                  slotWidth={innerW}
                  slotHeight={(isStory ? 174 : 110) * s + noteBonusH * 0.55}
                  borderRadius={12 * s}
                  slotIndex={0}
                  photoCrops={photoCrops}
                  imageDims={imageDims}
                  onPressSlot={onPressSlot}
                />
                <View style={{ flexDirection: 'row', gap }}>
                  {[picked[1], picked[2]].map((m, i) => (
                    <View key={m.id} style={{ flex: 1 }}>
                      <PhotoSlot
                        memory={m}
                        fallbackVibe={trip.vibe}
                        slotWidth={halfW}
                        slotHeight={(isStory ? 132 : 84) * s + noteBonusH * 0.45}
                        borderRadius={10 * s}
                        slotIndex={i + 1}
                        photoCrops={photoCrops}
                        imageDims={imageDims}
                        onPressSlot={onPressSlot}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )
          ) : // 4 photos
          activeLayout === 'hero_top_3' ? (
            <View style={{ gap }}>
              <PhotoSlot
                memory={picked[0]}
                fallbackVibe={trip.vibe}
                slotWidth={innerW}
                slotHeight={(isStory ? 190 : 118) * s + noteBonusH * 0.6}
                borderRadius={12 * s}
                slotIndex={0}
                photoCrops={photoCrops}
                imageDims={imageDims}
                onPressSlot={onPressSlot}
              />
              <View style={{ flexDirection: 'row', gap: gap * 0.8 }}>
                {picked.slice(1, 4).map((m, i) => (
                  <View key={m.id} style={{ flex: 1 }}>
                    <PhotoSlot
                      memory={m}
                      fallbackVibe={trip.vibe}
                      slotWidth={thirdW}
                      slotHeight={(isStory ? 114 : 74) * s + noteBonusH * 0.4}
                      borderRadius={10 * s}
                      slotIndex={i + 1}
                      photoCrops={photoCrops}
                      imageDims={imageDims}
                      onPressSlot={onPressSlot}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : activeLayout === 'tall_left_3' ? (
            <View style={{ flexDirection: 'row', gap }}>
              <View style={{ width: innerW * 0.56 }}>
                <PhotoSlot
                  memory={picked[0]}
                  fallbackVibe={trip.vibe}
                  slotWidth={innerW * 0.56}
                  slotHeight={(isStory ? 310 : 198) * s + noteBonusH}
                  borderRadius={12 * s}
                  slotIndex={0}
                  photoCrops={photoCrops}
                  imageDims={imageDims}
                  onPressSlot={onPressSlot}
                />
              </View>
              <View style={{ flex: 1, gap: gap * 0.75 }}>
                {picked.slice(1, 4).map((m, i) => (
                  <PhotoSlot
                    key={m.id}
                    memory={m}
                    fallbackVibe={trip.vibe}
                    slotWidth={innerW * 0.44 - gap}
                    slotHeight={((isStory ? 310 : 198) * s + noteBonusH - gap * 1.5) / 3}
                    borderRadius={9 * s}
                    slotIndex={i + 1}
                    photoCrops={photoCrops}
                    imageDims={imageDims}
                    onPressSlot={onPressSlot}
                  />
                ))}
              </View>
            </View>
          ) : (
            // 'grid_2x2'
            <View style={{ gap }}>
              <View style={{ flexDirection: 'row', gap }}>
                {[picked[0], picked[1]].map((m, i) => (
                  <View key={m.id} style={{ flex: 1 }}>
                    <PhotoSlot
                      memory={m}
                      fallbackVibe={trip.vibe}
                      slotWidth={halfW}
                      slotHeight={(isStory ? 150 : 95) * s + noteBonusH * 0.5}
                      borderRadius={10 * s}
                      slotIndex={i}
                      photoCrops={photoCrops}
                      imageDims={imageDims}
                      onPressSlot={onPressSlot}
                    />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap }}>
                {[picked[2], picked[3]].map((m, i) => (
                  <View key={m.id} style={{ flex: 1 }}>
                    <PhotoSlot
                      memory={m}
                      fallbackVibe={trip.vibe}
                      slotWidth={halfW}
                      slotHeight={(isStory ? 150 : 95) * s + noteBonusH * 0.5}
                      borderRadius={10 * s}
                      slotIndex={i + 2}
                      photoCrops={photoCrops}
                      imageDims={imageDims}
                      onPressSlot={onPressSlot}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Editable / Hideable Postcard Note Line */}
        {noteVisible && (
          <View
            style={{
              backgroundColor: palette.noteBg,
              borderRadius: 10 * s,
              paddingHorizontal: 11 * s,
              paddingVertical: 7 * s,
              borderLeftWidth: 3 * s,
              borderLeftColor: palette.accent,
            }}
          >
            <Text
              style={{
                fontSize: 10.5 * s,
                fontStyle: 'italic',
                color: palette.inkMuted,
                lineHeight: 14.5 * s,
              }}
              numberOfLines={2}
            >
              “{resolvedNote}”
            </Text>
          </View>
        )}

        {showWatermark && <WatermarkBar dark={palette.dark} scale={s} />}
      </View>

      {/* Colorful Airmail Stripe Bottom */}
      <View style={[styles.airmailStripeRow, { height: 8 * s, gap: 4 * s, paddingHorizontal: 4 * s }]}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View
            key={`b_${i}`}
            style={[
              styles.airmailDash,
              { backgroundColor: i % 2 === 0 ? '#0EA5E9' : '#F43F5E' },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

/**
 * Renders an individual 4:5 slide in a cohesive Multi-Slide Instagram Carousel Pack:
 * - Cover Postcard slide (tappable to reframe!)
 * - Adaptive Polaroid Memory story slide (portrait-aware + tappable to reframe!)
 * - Passport Stamp & Flight Route finale slide
 */
export const IgCarouselSlideCanvas: React.FC<CarouselSlideCanvasProps> = ({
  trip,
  flights,
  transports = [],
  distanceUnit = 'km',
  allSelectedMemories,
  slide,
  showWatermark,
  canvasWidth = 312,
  paletteId = 'sunlit',
  showPhotoLabels = true,
  coverMemoryId,
  photoCrops,
  imageDims,
  onPressSlot,
}) => {
  const s = canvasWidth / 312;
  const height = Math.round((canvasWidth * 5) / 4);
  const days = getTripDaysCount(trip.startDate, trip.endDate);
  const totalMiles = flights.reduce((sum, f) => sum + (f.distanceMiles || 0), 0);
  const totalDistanceKm =
    milesToKm(totalMiles) + transports.reduce((sum, t) => sum + (t.distanceKm || 0), 0);
  const totalDistanceDisplay = formatDistanceValue(totalDistanceKm, distanceUnit);
  const primaryFlight = flights[0];
  const primaryTransport = transports[0];
  const palette = getPaletteSpec(paletteId);
  const editorialDateRange = formatEditorialDateRange(trip.startDate, trip.endDate);

  if (slide.kind === 'cover') {
    const coverMem =
      (coverMemoryId
        ? allSelectedMemories.find((m) => m.id === coverMemoryId && m.photoUri)
        : undefined) ?? allSelectedMemories.find((m) => m.photoUri);
    const heroPhoto = coverMem?.photoUri ?? trip.coverPhotoUri;
    const coverCropKey = coverMem ? `cover_${coverMem.id}` : '__carousel_cover__';

    return (
      <View
        style={[
          styles.canvasBase,
          { width: canvasWidth, height, backgroundColor: '#1C1917', borderRadius: 20 * s },
        ]}
      >
        <View style={StyleSheet.absoluteFill}>
          {heroPhoto ? (
            <CroppedImage
              uri={heroPhoto}
              slotWidth={canvasWidth}
              slotHeight={height}
              crop={photoCrops?.[coverCropKey] ?? photoCrops?.[coverMem?.id ?? '']}
              imageDimensions={imageDims?.[heroPhoto]}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <DestinationBanner vibe={trip.vibe} height={height} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.34)', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.84)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        {heroPhoto && onPressSlot ? (
          <TouchableOpacity
            activeOpacity={0.95}
            style={StyleSheet.absoluteFill}
            onPress={() =>
              onPressSlot({
                cropKey: coverCropKey,
                memoryId: coverMem?.id,
                photoUri: heroPhoto,
                title: coverMem?.title || `${trip.title} Cover`,
                slotAspectRatio: canvasWidth / height,
              })
            }
          />
        ) : null}

        <View
          pointerEvents="none"
          style={[styles.coverTopRow, { padding: 14 * s }]}
        >
          <View style={[styles.routePill, { paddingHorizontal: 10 * s, paddingVertical: 4 * s }]}>
            <Text style={[styles.routePillText, { fontSize: 8.5 * s }]}>
              {trip.flagEmoji} {trip.destinationCity.toUpperCase()}
            </Text>
          </View>
          <View style={[styles.slideCounter, { paddingHorizontal: 9 * s, paddingVertical: 3 * s }]}>
            <Text style={[styles.slideCounterText, { fontSize: 9.5 * s }]}>
              1 / {slide.totalSlides}
            </Text>
          </View>
        </View>

        <View
          pointerEvents="none"
          style={[styles.coverBottom, { padding: 18 * s, gap: 4 * s }]}
        >
          <Text style={[styles.coverOverline, { fontSize: 8.5 * s }]}>
            POSTCARDS FROM {trip.destinationCountry.toUpperCase()}
          </Text>
          <Text style={[styles.coverTitle, { fontSize: 23 * s }]} numberOfLines={2} adjustsFontSizeToFit>
            {trip.title}
          </Text>
          <Text style={[styles.coverSub, { fontSize: 10.5 * s }]}>
            {editorialDateRange} • {days} {days === 1 ? 'day' : 'days'}
          </Text>
          <View style={[styles.coverSwipeRow, { marginTop: 9 * s }]}>
            {showWatermark ? <WatermarkBar dark scale={s} /> : <View />}
            <View style={[styles.swipeBadge, { paddingHorizontal: 11 * s, paddingVertical: 4 * s }]}>
              <Text style={[styles.swipeBadgeText, { fontSize: 8.5 * s }]}>SWIPE →</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (slide.kind === 'memory' && slide.memory) {
    const m = slide.memory;
    const dims = m.photoUri ? imageDims?.[m.photoUri] : undefined;
    const isPortraitPhoto = dims ? dims.height > dims.width * 1.05 : false;
    const hasCustomNote = !isGenericPlaceholderNote(m.note);
    // Give portrait photos a taller Polaroid window so faces aren't squished!
    const photoHeight = (
      showPhotoLabels
        ? isPortraitPhoto
          ? hasCustomNote
            ? 208
            : 226
          : hasCustomNote
          ? 188
          : 206
        : 266
    ) * s;
    const polaroidInnerW = canvasWidth - 52 * s;

    return (
      <LinearGradient
        colors={palette.carouselMemGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.canvasBase,
          {
            width: canvasWidth,
            height,
            borderRadius: 20 * s,
            padding: 16 * s,
            justifyContent: 'space-between',
          },
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text
            style={{ fontSize: 11.5 * s, fontWeight: '900', color: palette.ink, flex: 1 }}
            numberOfLines={1}
          >
            {trip.flagEmoji} {trip.title}
          </Text>
          <Text style={{ fontSize: 10.5 * s, fontWeight: '800', color: palette.accent }}>
            {slide.slideIndex + 1} / {slide.totalSlides}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: palette.polaroidBg,
            borderRadius: 12 * s,
            padding: 10 * s,
            paddingBottom: (showPhotoLabels ? 11 : 10) * s,
            borderWidth: 1,
            borderColor: palette.polaroidBorder,
            transform: [{ rotate: slide.slideIndex % 2 === 0 ? '0.8deg' : '-0.8deg' }],
            elevation: 4,
          }}
        >
          <View
            style={{
              width: 48 * s,
              height: 10 * s,
              backgroundColor: palette.tapeColor,
              alignSelf: 'center',
              marginTop: -15 * s,
              marginBottom: 6 * s,
              borderRadius: 2 * s,
            }}
          />
          <PhotoSlot
            memory={m}
            fallbackVibe={trip.vibe}
            slotWidth={polaroidInnerW}
            slotHeight={photoHeight}
            borderRadius={8 * s}
            cropKey={`carousel_${m.id}`}
            slotIndex={slide.slideIndex - 1}
            photoCrops={{
              ...photoCrops,
              [`carousel_${m.id}`]:
                photoCrops?.[`carousel_${m.id}`] ?? photoCrops?.[m.id] ?? DEFAULT_PHOTO_CROP,
            }}
            imageDims={imageDims}
            onPressSlot={onPressSlot}
          />
          {showPhotoLabels && (
            <View style={{ paddingTop: 8 * s, gap: 3 * s }}>
              <Text
                style={{ fontSize: 13.5 * s, fontWeight: '900', color: palette.ink }}
                numberOfLines={1}
              >
                {m.title}
              </Text>
              {m.placeName ? (
                <Text
                  style={{ fontSize: 9.5 * s, fontWeight: '700', color: palette.accent }}
                  numberOfLines={1}
                >
                  📍 {m.placeName}
                </Text>
              ) : null}
              {hasCustomNote ? (
                <Text
                  style={{ fontSize: 10.5 * s, color: palette.inkMuted, lineHeight: 14 * s }}
                  numberOfLines={2}
                >
                  {m.note}
                </Text>
              ) : null}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 3 * s,
                }}
              >
                <Text style={{ fontSize: 9.5 * s, fontWeight: '800', color: palette.accent }}>
                  {m.moodSticker}
                </Text>
                <Text style={{ fontSize: 9.5 * s, fontWeight: '700', color: palette.inkMuted }}>
                  {formatShortDate(m.capturedAt)}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ alignItems: 'center' }}>
          {showWatermark && <WatermarkBar dark={palette.dark} scale={s} />}
        </View>
      </LinearGradient>
    );
  }

  // Final Carousel Slide: Navy & Gold Passport Stamp + Flight Route Finale
  const locationLabel = formatLocationLabel(trip.destinationCity, trip.destinationCountry);
  return (
    <LinearGradient
      colors={['#1E1B4B', '#312E81', '#0F172A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.canvasBase,
        {
          width: canvasWidth,
          height,
          borderRadius: 20 * s,
          padding: 20 * s,
          justifyContent: 'space-between',
          borderWidth: 2 * s,
          borderColor: 'rgba(251, 191, 36, 0.5)',
        },
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[styles.passportHeaderLbl, { fontSize: 8.5 * s }]}>
          PASSPORT STAMP • FINALE
        </Text>
        <View style={[styles.slideCounter, { paddingHorizontal: 9 * s, paddingVertical: 3 * s }]}>
          <Text style={[styles.slideCounterText, { fontSize: 9.5 * s }]}>
            {slide.slideIndex + 1} / {slide.totalSlides}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: 14 * s }}>
        <View
          style={[
            styles.finaleStamp,
            {
              borderRadius: 18 * s,
              paddingHorizontal: 22 * s,
              paddingVertical: 14 * s,
              borderWidth: 2 * s,
            },
          ]}
        >
          <Text style={{ fontSize: 30 * s }}>{trip.flagEmoji}</Text>
          <Text style={[styles.finaleCountry, { fontSize: 15.5 * s, marginTop: 4 * s }]}>
            {trip.destinationCountry.toUpperCase()}
          </Text>
          <Text style={[styles.finaleDates, { fontSize: 10 * s, marginTop: 3 * s }]}>
            {editorialDateRange}
          </Text>
        </View>

        {primaryFlight ? (
          <FlightArcGraphic
            origin={primaryFlight.originIata}
            dest={primaryFlight.destIata}
            distanceKm={totalDistanceKm}
            distanceUnit={distanceUnit}
            modeEmoji="✈️"
            subtitleVerb="across the sky"
            lightText
            scale={s}
          />
        ) : primaryTransport ? (
          <FlightArcGraphic
            origin={primaryTransport.origin}
            dest={primaryTransport.destination}
            distanceKm={totalDistanceKm}
            distanceUnit={distanceUnit}
            modeEmoji={getTransportModeEmoji(primaryTransport.mode)}
            subtitleVerb={
              primaryTransport.mode === 'own_car' || primaryTransport.mode === 'rental_car'
                ? 'on the open road'
                : 'on the journey'
            }
            lightText
            scale={s}
          />
        ) : (
          <Text style={[styles.finaleSub, { fontSize: 11.5 * s }]}>
            {locationLabel} • {days} unforgettable {days === 1 ? 'day' : 'days'} ✨
          </Text>
        )}
      </View>

      <View style={{ gap: 10 * s }}>
        <View style={[styles.glassStatsRow, { borderRadius: 16 * s, paddingVertical: 10 * s }]}>
          <View style={styles.glassStat}>
            <Text style={[styles.glassStatVal, { fontSize: 15.5 * s }]}>{days}</Text>
            <Text style={[styles.glassStatLbl, { fontSize: 8 * s, marginTop: 2 * s }]}>
              {days === 1 ? 'DAY' : 'DAYS'}
            </Text>
          </View>
          <View style={[styles.glassDivider, { height: 24 * s }]} />
          <View style={styles.glassStat}>
            <Text style={[styles.glassStatVal, { fontSize: 15.5 * s }]}>
              {allSelectedMemories.length || 1}
            </Text>
            <Text style={[styles.glassStatLbl, { fontSize: 8 * s, marginTop: 2 * s }]}>
              {allSelectedMemories.length === 1 ? 'MEMORY' : 'MEMORIES'}
            </Text>
          </View>
          <View style={[styles.glassDivider, { height: 24 * s }]} />
          <View style={styles.glassStat}>
            <Text style={[styles.glassStatVal, { fontSize: 15.5 * s }]}>
              {totalDistanceDisplay > 0 ? totalDistanceDisplay.toLocaleString() : '1'}
            </Text>
            <Text style={[styles.glassStatLbl, { fontSize: 8 * s, marginTop: 2 * s }]}>
              {totalDistanceDisplay > 0 ? (distanceUnit === 'mi' ? 'MILES' : 'KM') : 'STAMP'}
            </Text>
          </View>
        </View>
        {showWatermark && (
          <View style={{ alignItems: 'center' }}>
            <WatermarkBar dark scale={s} />
          </View>
        )}
      </View>
    </LinearGradient>
  );
};

export function buildCarouselSlides(memories: Memory[]): CarouselSlideSpec[] {
  const picked = memories.slice(0, 5);
  const total = 2 + picked.length; // Cover + Memory slides + Passport Finale
  return [
    {
      id: 'slide_cover',
      label: 'Cover',
      kind: 'cover',
      slideIndex: 0,
      totalSlides: total,
    },
    ...picked.map((m, idx) => ({
      id: `slide_mem_${m.id}`,
      label: m.title.length > 12 ? `${m.title.slice(0, 11)}…` : m.title,
      kind: 'memory' as const,
      memory: m,
      slideIndex: idx + 1,
      totalSlides: total,
    })),
    {
      id: 'slide_recap',
      label: 'Stamp',
      kind: 'recap',
      slideIndex: total - 1,
      totalSlides: total,
    },
  ];
}

const styles = StyleSheet.create({
  canvasBase: {
    overflow: 'hidden',
    position: 'relative',
  },

  watermarkPill: {
    alignSelf: 'center',
    borderRadius: 99,
  },
  watermarkLight: {
    backgroundColor: 'rgba(30, 27, 75, 0.08)',
  },
  watermarkDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  watermarkText: {
    fontWeight: '900',
    color: COLORS.navy,
  },

  // Route & Stats
  routePill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  routePillText: { fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.8 },
  routeTitle: {
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  routeDate: { color: '#FDE68A', fontWeight: '700' },

  arcWrap: {
    backgroundColor: 'rgba(15,23,42,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.38)',
    alignItems: 'center',
  },
  arcEndpoints: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  arcCode: { fontWeight: '900', letterSpacing: 1 },
  arcSvgBox: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  arcPlane: { position: 'absolute' },
  arcMiles: { fontWeight: '700', letterSpacing: 0.4 },

  destSeal: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.44)',
    borderWidth: 1.5,
    borderColor: 'rgba(253,224,71,0.58)',
  },
  destSealCity: { fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  destSealSub: { fontWeight: '800', color: '#FDE047', letterSpacing: 1 },

  glassStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  glassStat: { flex: 1, alignItems: 'center' },
  glassStatVal: { fontWeight: '900', color: '#FFFFFF' },
  glassStatLbl: { fontWeight: '800', color: '#E2E8F0', letterSpacing: 0.6 },
  glassDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.22)' },

  // Airmail
  airmailStripeRow: {
    flexDirection: 'row',
  },
  airmailDash: { flex: 1, height: '100%' },

  // Carousel Cover & Finale
  coverTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slideCounter: {
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius: 99,
  },
  slideCounterText: { fontWeight: '800', color: '#FFFFFF' },
  coverBottom: {
    marginTop: 'auto',
  },
  coverOverline: { fontWeight: '900', color: '#FDE047', letterSpacing: 1.2 },
  coverTitle: { fontWeight: '900', color: '#FFFFFF' },
  coverSub: { color: '#E2E8F0', fontWeight: '700' },
  coverSwipeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  swipeBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 99,
  },
  swipeBadgeText: { fontWeight: '900', color: COLORS.ink, letterSpacing: 0.7 },
  passportHeaderLbl: { fontWeight: '900', color: '#FDE047', letterSpacing: 1.1 },
  finaleStamp: {
    borderColor: '#FDE047',
    backgroundColor: 'rgba(253, 224, 71, 0.1)',
    alignItems: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  finaleCountry: { fontWeight: '900', color: '#FFFFFF', letterSpacing: 1.2 },
  finaleDates: { fontFamily: 'monospace', color: '#FDE68A' },
  finaleSub: { fontWeight: '700', color: '#C7D2FE', textAlign: 'center' },
});
