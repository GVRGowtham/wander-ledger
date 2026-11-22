import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { DestinationBanner } from '../banners/DestinationBanner';
import { MemoryIllustration } from '../cards/MemoryIllustration';
import { COLORS } from '../../theme/tokens';
import { Flight, Memory, Trip } from '../../types/models';

export type IgFormat = 'story' | 'feed' | 'carousel';
export type IgTemplate = 'scrapbook' | 'route' | 'postcard';

export interface CarouselSlideSpec {
  id: string;
  label: string;
  kind: 'cover' | 'memory' | 'recap';
  memory?: Memory;
  slideIndex: number;
  totalSlides: number;
}

interface SingleCanvasProps {
  trip: Trip;
  memories: Memory[];
  flights: Flight[];
  format: 'story' | 'feed';
  template: IgTemplate;
  showWatermark: boolean;
  canvasWidth?: number;
}

interface CarouselSlideCanvasProps {
  trip: Trip;
  flights: Flight[];
  allSelectedMemories: Memory[];
  slide: CarouselSlideSpec;
  showWatermark: boolean;
  canvasWidth?: number;
}

function getTripDays(startDate: string, endDate: string): number {
  const s = new Date(`${startDate}T00:00:00Z`).getTime();
  const e = new Date(`${endDate}T00:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 1;
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

const WatermarkBar: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <View
    style={[
      styles.watermarkPill,
      dark ? styles.watermarkDark : styles.watermarkLight,
    ]}
  >
    <Text style={[styles.watermarkText, dark && { color: '#FDE68A' }]}>
      ✈️ STAMPED WITH WANDERLEDGER
    </Text>
  </View>
);

const FlightArcGraphic: React.FC<{
  origin: string;
  dest: string;
  miles: number;
  lightText?: boolean;
}> = ({ origin, dest, miles, lightText = true }) => {
  const strokeColor = lightText ? '#FDE047' : '#F97316';
  const textColor = lightText ? '#FFFFFF' : COLORS.ink;
  const subColor = lightText ? 'rgba(255,255,255,0.82)' : COLORS.inkMuted;

  return (
    <View style={styles.arcWrap}>
      <View style={styles.arcEndpoints}>
        <Text style={[styles.arcCode, { color: textColor }]}>{origin}</Text>
        <View style={styles.arcSvgBox}>
          <Svg width="100%" height={36} viewBox="0 0 140 36">
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
          <Text style={styles.arcPlane}>✈️</Text>
        </View>
        <Text style={[styles.arcCode, { color: textColor }]}>{dest}</Text>
      </View>
      {miles > 0 && (
        <Text style={[styles.arcMiles, { color: subColor }]}>
          {miles.toLocaleString()} miles across the sky
        </Text>
      )}
    </View>
  );
};

const PhotoSlot: React.FC<{
  memory?: Memory;
  fallbackVibe: Trip['vibe'];
  fallbackCover?: string;
  height: number;
  borderRadius?: number;
}> = ({ memory, fallbackVibe, fallbackCover, height, borderRadius = 8 }) => {
  if (memory?.photoUri) {
    return (
      <Image
        source={{ uri: memory.photoUri }}
        style={{ width: '100%', height, borderRadius }}
        resizeMode="cover"
      />
    );
  }
  if (memory) {
    return (
      <View style={{ borderRadius, overflow: 'hidden' }}>
        <MemoryIllustration illustrationKey={memory.illustrationKey} height={height} />
      </View>
    );
  }
  return (
    <View style={{ borderRadius, overflow: 'hidden' }}>
      <DestinationBanner vibe={fallbackVibe} coverPhotoUri={fallbackCover} height={height} />
    </View>
  );
};

/**
 * Renders high-craft Story (9:16) or Feed Collage (4:5) postcard canvases
 * ready for crisp on-device capture via react-native-view-shot.
 */
export const IgSingleCanvas: React.FC<SingleCanvasProps> = ({
  trip,
  memories,
  flights,
  format,
  template,
  showWatermark,
  canvasWidth = 312,
}) => {
  const height = Math.round(format === 'story' ? (canvasWidth * 16) / 9 : (canvasWidth * 5) / 4);
  const days = getTripDays(trip.startDate, trip.endDate);
  const totalMiles = flights.reduce((sum, f) => sum + (f.distanceMiles || 0), 0);
  const primaryFlight = flights[0];
  const heroPhoto = memories.find((m) => m.photoUri)?.photoUri ?? trip.coverPhotoUri;
  const picked = memories.slice(0, 4);

  // TEMPLATE 1: POLAROID SCRAPBOOK COLLAGE
  if (template === 'scrapbook') {
    const isStory = format === 'story';
    return (
      <LinearGradient
        colors={['#FFF9F2', '#FEF3C7', '#FFE4E6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.canvasBase, { width: canvasWidth, height }]}
      >
        {/* Top Scrapbook Header */}
        <View style={styles.scrapHeader}>
          <View style={styles.scrapTagPill}>
            <Text style={styles.scrapTagText}>
              {trip.flagEmoji} {trip.destinationCity.toUpperCase()} • {days}D
            </Text>
          </View>
          <Text style={styles.scrapTitle} numberOfLines={1} adjustsFontSizeToFit>
            {trip.title}
          </Text>
          <Text style={styles.scrapDates}>
            {trip.startDate} → {trip.endDate}
          </Text>
        </View>

        {/* Polaroid Collage Body */}
        <View style={styles.scrapBody}>
          {picked.length <= 1 ? (
            <View style={[styles.polaroidFrame, { transform: [{ rotate: '-1.5deg' }] }]}>
              <View style={styles.tape} />
              <PhotoSlot
                memory={picked[0]}
                fallbackVibe={trip.vibe}
                fallbackCover={trip.coverPhotoUri}
                height={isStory ? 265 : 170}
              />
              <View style={styles.polMeta}>
                <Text style={styles.polTitle} numberOfLines={1}>
                  {picked[0]?.title || `${trip.destinationCity} Highlights`}
                </Text>
                <Text style={styles.polNote} numberOfLines={isStory ? 3 : 2}>
                  {picked[0]?.note || `Sunlit memories from ${trip.destinationCity}, ${trip.destinationCountry} ✨`}
                </Text>
                <View style={styles.polBottom}>
                  <Text style={styles.polMood}>{picked[0]?.moodSticker || '🌅 Core Memory'}</Text>
                  {picked[0]?.placeName ? (
                    <Text style={styles.polPlace} numberOfLines={1}>
                      📍 {picked[0].placeName}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : picked.length === 2 ? (
            <View style={{ gap: isStory ? 14 : 8, flex: 1, justifyContent: 'center' }}>
              {picked.map((m, idx) => (
                <View
                  key={m.id}
                  style={[
                    styles.polaroidFrameCompact,
                    { transform: [{ rotate: idx === 0 ? '-1.8deg' : '1.6deg' }] },
                  ]}
                >
                  <View style={styles.tapeSmall} />
                  <PhotoSlot
                    memory={m}
                    fallbackVibe={trip.vibe}
                    height={isStory ? 132 : 84}
                    borderRadius={6}
                  />
                  <View style={styles.polRowCompact}>
                    <Text style={styles.polTitleSm} numberOfLines={1}>
                      {m.title}
                    </Text>
                    <Text style={styles.polMoodSm}>{m.moodSticker}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.gridCollage}>
              {picked.map((m, idx) => {
                const tilts = ['-1.6deg', '1.4deg', '1.3deg', '-1.5deg'];
                const isHeroTop = picked.length === 3 && idx === 0;
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.polaroidGridCard,
                      isHeroTop ? { width: '100%' } : { width: '47.5%' },
                      { transform: [{ rotate: tilts[idx % 4] }] },
                    ]}
                  >
                    <View style={styles.tapeTiny} />
                    <PhotoSlot
                      memory={m}
                      fallbackVibe={trip.vibe}
                      height={
                        isHeroTop
                          ? isStory
                            ? 145
                            : 96
                          : isStory
                          ? 122
                          : 78
                      }
                      borderRadius={5}
                    />
                    <Text style={styles.polGridCaption} numberOfLines={1}>
                      {m.title}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Bottom Footer */}
        <View style={styles.scrapFooter}>
          {totalMiles > 0 && (
            <Text style={styles.scrapMiles}>
              ✈️ {totalMiles.toLocaleString()} mi • 📸 {memories.length} memories
            </Text>
          )}
          {showWatermark && <WatermarkBar />}
        </View>
      </LinearGradient>
    );
  }

  // TEMPLATE 2: FLIGHT ROUTE & STATS RECAP
  if (template === 'route') {
    const isStory = format === 'story';
    return (
      <View style={[styles.canvasBase, { width: canvasWidth, height, backgroundColor: '#1E1B4B' }]}>
        {/* Full-bleed scenic photo or illustrated banner backdrop */}
        <View style={StyleSheet.absoluteFill}>
          {heroPhoto ? (
            <Image source={{ uri: heroPhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <DestinationBanner vibe={trip.vibe} height={height} />
          )}
          <LinearGradient
            colors={['rgba(15,23,42,0.72)', 'rgba(30,27,75,0.48)', 'rgba(15,23,42,0.92)']}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Top Badge */}
        <View style={styles.routeTop}>
          <View style={styles.routePill}>
            <Text style={styles.routePillText}>
              {trip.flagEmoji} TRIP RECAP • {trip.destinationCountry.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.routeTitle} numberOfLines={2} adjustsFontSizeToFit>
            {trip.title}
          </Text>
          <Text style={styles.routeDate}>
            {trip.startDate} → {trip.endDate}
          </Text>
        </View>

        {/* Centerpiece Flight Arc + Mini Photo Strip */}
        <View style={styles.routeMiddle}>
          {primaryFlight ? (
            <FlightArcGraphic
              origin={primaryFlight.originIata}
              dest={primaryFlight.destIata}
              miles={totalMiles}
              lightText
            />
          ) : (
            <View style={styles.destSeal}>
              <Text style={{ fontSize: 32 }}>{trip.flagEmoji}</Text>
              <Text style={styles.destSealCity}>{trip.destinationCity.toUpperCase()}</Text>
              <Text style={styles.destSealSub}>PASSPORT STAMPED ✨</Text>
            </View>
          )}

          {isStory && picked.length >= 2 && (
            <View style={styles.routeMiniStrip}>
              {picked.slice(0, 3).map((m) => (
                <View key={m.id} style={styles.routeMiniThumb}>
                  <PhotoSlot memory={m} fallbackVibe={trip.vibe} height={74} borderRadius={8} />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Bottom Glass Stats Strip (Zero Spend!) */}
        <View style={styles.routeBottom}>
          <View style={styles.glassStatsRow}>
            <View style={styles.glassStat}>
              <Text style={styles.glassStatVal}>
                {totalMiles > 0 ? totalMiles.toLocaleString() : days}
              </Text>
              <Text style={styles.glassStatLbl}>
                {totalMiles > 0 ? 'MILES FLOWN' : 'DAYS'}
              </Text>
            </View>
            <View style={styles.glassDivider} />
            <View style={styles.glassStat}>
              <Text style={styles.glassStatVal}>{days}</Text>
              <Text style={styles.glassStatLbl}>{days === 1 ? 'DAY' : 'DAYS'}</Text>
            </View>
            <View style={styles.glassDivider} />
            <View style={styles.glassStat}>
              <Text style={styles.glassStatVal}>{memories.length || 1}</Text>
              <Text style={styles.glassStatLbl}>MEMORIES</Text>
            </View>
          </View>
          {showWatermark && <WatermarkBar dark />}
        </View>
      </View>
    );
  }

  // TEMPLATE 3: VINTAGE AIRMAIL POSTCARD
  const isStory = format === 'story';
  return (
    <View style={[styles.canvasBase, styles.airmailOuter, { width: canvasWidth, height }]}>
      {/* Colorful Airmail Stripe Top & Bottom */}
      <View style={styles.airmailStripeRow}>
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

      <View style={styles.postcardInner}>
        {/* Header with Rubber Country Stamp */}
        <View style={styles.pcHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pcGreetings}>GREETINGS FROM</Text>
            <Text style={styles.pcCity} numberOfLines={1} adjustsFontSizeToFit>
              {trip.destinationCity} {trip.flagEmoji}
            </Text>
            <Text style={styles.pcSub}>
              {trip.destinationCountry} • {trip.startDate}
            </Text>
          </View>
          <View style={styles.inkStampBox}>
            <Text style={styles.inkStampTop}>{trip.countryCode}</Text>
            <Text style={styles.inkStampDate}>{trip.startDate.slice(0, 7)}</Text>
          </View>
        </View>

        {/* Clean Editorial Photo Frame / Grid */}
        <View style={styles.pcPhotosWrap}>
          {picked.length <= 1 ? (
            <PhotoSlot
              memory={picked[0]}
              fallbackVibe={trip.vibe}
              fallbackCover={trip.coverPhotoUri}
              height={isStory ? 285 : 185}
              borderRadius={14}
            />
          ) : picked.length === 2 ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {picked.map((m) => (
                <View key={m.id} style={{ flex: 1 }}>
                  <PhotoSlot
                    memory={m}
                    fallbackVibe={trip.vibe}
                    height={isStory ? 255 : 175}
                    borderRadius={12}
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <PhotoSlot
                memory={picked[0]}
                fallbackVibe={trip.vibe}
                height={isStory ? 165 : 108}
                borderRadius={12}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {picked.slice(1, 4).map((m) => (
                  <View key={m.id} style={{ flex: 1 }}>
                    <PhotoSlot
                      memory={m}
                      fallbackVibe={trip.vibe}
                      height={isStory ? 105 : 74}
                      borderRadius={10}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Postcard Note Line */}
        <View style={styles.pcNoteBox}>
          <Text style={styles.pcNoteText} numberOfLines={2}>
            “{picked[0]?.note || `Wishing you were here in ${trip.destinationCity}!`}”
          </Text>
        </View>

        {showWatermark && <WatermarkBar />}
      </View>

      <View style={styles.airmailStripeRow}>
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
 * - Cover Postcard slide
 * - Polaroid Memory story slide
 * - Passport Stamp & Flight Route finale slide
 */
export const IgCarouselSlideCanvas: React.FC<CarouselSlideCanvasProps> = ({
  trip,
  flights,
  allSelectedMemories,
  slide,
  showWatermark,
  canvasWidth = 312,
}) => {
  const height = Math.round((canvasWidth * 5) / 4);
  const days = getTripDays(trip.startDate, trip.endDate);
  const totalMiles = flights.reduce((sum, f) => sum + (f.distanceMiles || 0), 0);
  const primaryFlight = flights[0];

  if (slide.kind === 'cover') {
    const heroPhoto =
      allSelectedMemories.find((m) => m.photoUri)?.photoUri ?? trip.coverPhotoUri;
    return (
      <View style={[styles.canvasBase, { width: canvasWidth, height, backgroundColor: '#1C1917' }]}>
        <View style={StyleSheet.absoluteFill}>
          {heroPhoto ? (
            <Image source={{ uri: heroPhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <DestinationBanner vibe={trip.vibe} height={height} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.82)']}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.coverTopRow}>
          <View style={styles.routePill}>
            <Text style={styles.routePillText}>
              {trip.flagEmoji} {trip.destinationCity.toUpperCase()}
            </Text>
          </View>
          <View style={styles.slideCounter}>
            <Text style={styles.slideCounterText}>
              1 / {slide.totalSlides}
            </Text>
          </View>
        </View>

        <View style={styles.coverBottom}>
          <Text style={styles.coverOverline}>POSTCARDS FROM {trip.destinationCountry.toUpperCase()}</Text>
          <Text style={styles.coverTitle} numberOfLines={2} adjustsFontSizeToFit>
            {trip.title}
          </Text>
          <Text style={styles.coverSub}>
            {trip.startDate} → {trip.endDate} • {days} {days === 1 ? 'day' : 'days'}
          </Text>
          <View style={styles.coverSwipeRow}>
            {showWatermark ? <WatermarkBar dark /> : <View />}
            <View style={styles.swipeBadge}>
              <Text style={styles.swipeBadgeText}>SWIPE →</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (slide.kind === 'memory' && slide.memory) {
    const m = slide.memory;
    return (
      <LinearGradient
        colors={['#FFF9F2', '#FFEDD5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.canvasBase, { width: canvasWidth, height, padding: 16, justifyContent: 'space-between' }]}
      >
        <View style={styles.coverTopRow}>
          <Text style={styles.memSlideTrip} numberOfLines={1}>
            {trip.flagEmoji} {trip.title}
          </Text>
          <Text style={styles.memSlideNum}>
            {slide.slideIndex + 1} / {slide.totalSlides}
          </Text>
        </View>

        <View style={[styles.polaroidFrame, { transform: [{ rotate: slide.slideIndex % 2 === 0 ? '1deg' : '-1deg' }] }]}>
          <View style={styles.tape} />
          <PhotoSlot memory={m} fallbackVibe={trip.vibe} height={192} borderRadius={8} />
          <View style={styles.polMeta}>
            <Text style={styles.polTitle} numberOfLines={1}>
              {m.title}
            </Text>
            {m.placeName ? (
              <Text style={styles.polPlace} numberOfLines={1}>
                📍 {m.placeName}
              </Text>
            ) : null}
            <Text style={styles.polNote} numberOfLines={2}>
              {m.note}
            </Text>
            <View style={styles.polBottom}>
              <Text style={styles.polMood}>{m.moodSticker}</Text>
              <Text style={styles.polDate}>{m.capturedAt.slice(0, 10)}</Text>
            </View>
          </View>
        </View>

        <View style={{ alignItems: 'center' }}>
          {showWatermark && <WatermarkBar />}
        </View>
      </LinearGradient>
    );
  }

  // Final Carousel Slide: Navy & Gold Passport Stamp + Flight Route Finale
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
          padding: 20,
          justifyContent: 'space-between',
          borderWidth: 2,
          borderColor: 'rgba(251, 191, 36, 0.5)',
        },
      ]}
    >
      <View style={styles.coverTopRow}>
        <Text style={styles.passportHeaderLbl}>PASSPORT STAMP • FINALE</Text>
        <View style={styles.slideCounter}>
          <Text style={styles.slideCounterText}>
            {slide.slideIndex + 1} / {slide.totalSlides}
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: 14 }}>
        <View style={styles.finaleStamp}>
          <Text style={styles.finaleFlag}>{trip.flagEmoji}</Text>
          <Text style={styles.finaleCountry}>{trip.destinationCountry.toUpperCase()}</Text>
          <Text style={styles.finaleDates}>
            {trip.startDate} → {trip.endDate}
          </Text>
        </View>

        {primaryFlight ? (
          <FlightArcGraphic
            origin={primaryFlight.originIata}
            dest={primaryFlight.destIata}
            miles={totalMiles}
            lightText
          />
        ) : (
          <Text style={styles.finaleSub}>
            {trip.destinationCity} • {days} unforgettable {days === 1 ? 'day' : 'days'} ✨
          </Text>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <View style={styles.glassStatsRow}>
          <View style={styles.glassStat}>
            <Text style={styles.glassStatVal}>{days}</Text>
            <Text style={styles.glassStatLbl}>DAYS</Text>
          </View>
          <View style={styles.glassDivider} />
          <View style={styles.glassStat}>
            <Text style={styles.glassStatVal}>{allSelectedMemories.length || 1}</Text>
            <Text style={styles.glassStatLbl}>MEMORIES</Text>
          </View>
          <View style={styles.glassDivider} />
          <View style={styles.glassStat}>
            <Text style={styles.glassStatVal}>
              {totalMiles > 0 ? totalMiles.toLocaleString() : '1'}
            </Text>
            <Text style={styles.glassStatLbl}>
              {totalMiles > 0 ? 'MILES' : 'STAMP'}
            </Text>
          </View>
        </View>
        {showWatermark && (
          <View style={{ alignItems: 'center' }}>
            <WatermarkBar dark />
          </View>
        )}
      </View>
    </LinearGradient>
  );
};

export function buildCarouselSlides(memories: Memory[]): CarouselSlideSpec[] {
  const picked = memories.slice(0, 5);
  const total = 2 + picked.length; // Cover + Memory slides + Passport Finale
  const slides: CarouselSlideSpec[] = [
    {
      id: 'slide_cover',
      label: 'Cover',
      kind: 'cover',
      slideIndex: 0,
      totalSlides: total,
    },
    ...picked.map((m, idx) => ({
      id: `slide_mem_${m.id}`,
      label: `Memory ${idx + 1}`,
      kind: 'memory' as const,
      memory: m,
      slideIndex: idx + 1,
      totalSlides: total,
    })),
    {
      id: 'slide_recap',
      label: 'Passport Stamp',
      kind: 'recap',
      slideIndex: total - 1,
      totalSlides: total,
    },
  ];
  return slides;
}

const styles = StyleSheet.create({
  canvasBase: {
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },

  // Watermark
  watermarkPill: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  watermarkLight: {
    backgroundColor: 'rgba(30, 27, 75, 0.08)',
  },
  watermarkDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  watermarkText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: COLORS.navy,
  },

  // Scrapbook Template
  scrapHeader: {
    paddingTop: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 3,
  },
  scrapTagPill: {
    backgroundColor: 'rgba(249, 115, 22, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
  },
  scrapTagText: { fontSize: 9, fontWeight: '900', color: COLORS.coralDark, letterSpacing: 0.7 },
  scrapTitle: { fontSize: 18, fontWeight: '900', color: COLORS.ink },
  scrapDates: { fontSize: 10, fontWeight: '700', color: COLORS.inkMuted },
  scrapBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  polaroidFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  polaroidFrameCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 7,
    borderWidth: 1,
    borderColor: '#FED7AA',
    elevation: 3,
  },
  tape: {
    width: 52,
    height: 12,
    backgroundColor: 'rgba(253, 224, 71, 0.65)',
    alignSelf: 'center',
    marginTop: -16,
    marginBottom: 6,
    borderRadius: 2,
  },
  tapeSmall: {
    width: 40,
    height: 9,
    backgroundColor: 'rgba(253, 224, 71, 0.65)',
    alignSelf: 'center',
    marginTop: -11,
    marginBottom: 4,
    borderRadius: 2,
  },
  tapeTiny: {
    width: 30,
    height: 7,
    backgroundColor: 'rgba(253, 224, 71, 0.65)',
    alignSelf: 'center',
    marginTop: -9,
    marginBottom: 3,
    borderRadius: 2,
  },
  polMeta: { paddingTop: 8, gap: 3 },
  polTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
  polPlace: { fontSize: 10, fontWeight: '700', color: COLORS.coralDark },
  polNote: { fontSize: 11, color: COLORS.inkMuted, lineHeight: 15 },
  polBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  polMood: { fontSize: 10, fontWeight: '800', color: COLORS.coralDark },
  polDate: { fontSize: 10, fontWeight: '700', color: COLORS.inkSoft },
  polRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 5,
    gap: 6,
  },
  polTitleSm: { fontSize: 11, fontWeight: '900', color: COLORS.ink, flex: 1 },
  polMoodSm: { fontSize: 9, fontWeight: '800', color: COLORS.coralDark },
  gridCollage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  polaroidGridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    padding: 6,
    paddingBottom: 7,
    borderWidth: 1,
    borderColor: '#FED7AA',
    elevation: 3,
  },
  polGridCaption: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.ink,
    marginTop: 4,
    textAlign: 'center',
  },
  scrapFooter: {
    paddingBottom: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 5,
  },
  scrapMiles: { fontSize: 10, fontWeight: '800', color: COLORS.inkMuted },

  // Route & Stats Template
  routeTop: {
    paddingTop: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 5,
  },
  routePill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  routePillText: { fontSize: 9, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.8 },
  routeTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 2,
  },
  routeDate: { fontSize: 11, color: '#FDE68A', fontWeight: '700' },
  routeMiddle: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 16,
  },
  arcWrap: {
    backgroundColor: 'rgba(15,23,42,0.45)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.35)',
    alignItems: 'center',
    gap: 4,
  },
  arcEndpoints: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  arcCode: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  arcSvgBox: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  arcPlane: { position: 'absolute', top: 2, fontSize: 14 },
  arcMiles: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  destSeal: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1.5,
    borderColor: 'rgba(253,224,71,0.55)',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 14,
    gap: 3,
  },
  destSealCity: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  destSealSub: { fontSize: 9, fontWeight: '800', color: '#FDE047', letterSpacing: 1 },
  routeMiniStrip: { flexDirection: 'row', gap: 8 },
  routeMiniThumb: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  },
  routeBottom: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  glassStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 10,
  },
  glassStat: { flex: 1, alignItems: 'center' },
  glassStatVal: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
  glassStatLbl: { fontSize: 8, fontWeight: '800', color: '#E2E8F0', letterSpacing: 0.6, marginTop: 2 },
  glassDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.22)' },

  // Airmail Postcard Template
  airmailOuter: {
    backgroundColor: '#FFFDF9',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    justifyContent: 'space-between',
  },
  airmailStripeRow: {
    flexDirection: 'row',
    height: 8,
    gap: 4,
    paddingHorizontal: 4,
  },
  airmailDash: { flex: 1, height: '100%' },
  postcardInner: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
    justifyContent: 'space-between',
    gap: 8,
  },
  pcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pcGreetings: { fontSize: 9, fontWeight: '900', color: COLORS.coral, letterSpacing: 1.2 },
  pcCity: { fontSize: 20, fontWeight: '900', color: COLORS.ink },
  pcSub: { fontSize: 10, fontWeight: '700', color: COLORS.inkMuted },
  inkStampBox: {
    borderWidth: 2,
    borderColor: '#E11D48',
    backgroundColor: '#FFF1F2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    transform: [{ rotate: '6deg' }],
  },
  inkStampTop: { fontSize: 12, fontWeight: '900', color: '#BE123C', letterSpacing: 1 },
  inkStampDate: { fontSize: 8, fontWeight: '800', color: '#BE123C', fontFamily: 'monospace' },
  pcPhotosWrap: { flex: 1, justifyContent: 'center' },
  pcNoteBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.coral,
  },
  pcNoteText: { fontSize: 11, fontStyle: 'italic', color: COLORS.inkMuted, lineHeight: 15 },

  // Carousel Cover & Finale
  coverTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  slideCounter: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 99,
  },
  slideCounterText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  coverBottom: {
    marginTop: 'auto',
    padding: 18,
    gap: 4,
  },
  coverOverline: { fontSize: 9, fontWeight: '900', color: '#FDE047', letterSpacing: 1.2 },
  coverTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  coverSub: { fontSize: 11, color: '#E2E8F0', fontWeight: '700' },
  coverSwipeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  swipeBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 99,
  },
  swipeBadgeText: { fontSize: 9, fontWeight: '900', color: COLORS.ink, letterSpacing: 0.7 },
  memSlideTrip: { fontSize: 12, fontWeight: '900', color: COLORS.ink, flex: 1 },
  memSlideNum: { fontSize: 11, fontWeight: '800', color: COLORS.coralDark },
  passportHeaderLbl: { fontSize: 9, fontWeight: '900', color: '#FDE047', letterSpacing: 1.1 },
  finaleStamp: {
    borderWidth: 2,
    borderColor: '#FDE047',
    backgroundColor: 'rgba(253, 224, 71, 0.1)',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  finaleFlag: { fontSize: 32 },
  finaleCountry: { fontSize: 16, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1.2, marginTop: 4 },
  finaleDates: { fontSize: 10, fontFamily: 'monospace', color: '#FDE68A', marginTop: 3 },
  finaleSub: { fontSize: 12, fontWeight: '700', color: '#C7D2FE', textAlign: 'center' },
});
