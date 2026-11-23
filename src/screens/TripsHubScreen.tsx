import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DestinationBanner } from '../components/banners/DestinationBanner';
import { useApp } from '../context/AppContext';
import { getTripDayProgress, getTripStatus } from '../db/database';
import { formatDistance, milesToKm } from '../services/distanceUtils';
import { deriveGlobalTravelGeography } from '../services/travelGeography';
import { COLORS, formatMoney, SHADOWS } from '../theme/tokens';
import { DistanceUnit, Trip } from '../types/models';

interface Props {
  onOpenTrip: (tripId: string) => void;
  onNewTrip: () => void;
  onOpenScanner: () => void;
  onOpenPassport: () => void;
}

export const TripsHubScreen: React.FC<Props> = ({
  onOpenTrip,
  onNewTrip,
  onOpenScanner,
  onOpenPassport,
}) => {
  const { profile, trips, allFlights, allTransports, allStops, getSummaryForTrip } = useApp();

  const activeTrips = trips.filter((t) => getTripStatus(t) === 'active');
  const upcomingTrips = trips
    .filter((t) => getTripStatus(t) === 'upcoming')
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const pastTrips = trips.filter((t) => getTripStatus(t) === 'past');

  const distanceUnit: DistanceUnit = profile?.distanceUnit ?? 'km';
  const geography = deriveGlobalTravelGeography(trips, allFlights, allTransports, allStops);
  const uniqueCountries = geography.countryStamps.length;
  const totalDistanceKm =
    allFlights.reduce((s, f) => s + milesToKm(f.distanceMiles), 0) +
    allTransports.reduce((s, t) => s + (t.distanceKm ?? 0), 0);

  const firstName = profile?.displayName.split(' ')[0] || 'Wanderer';
  const heroTrip = activeTrips[0];
  const nextUpcoming = upcomingTrips[0];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Cheerful Top Greeting */}
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.userRow} onPress={onOpenPassport} activeOpacity={0.8}>
          <LinearGradient colors={['#FBBF24', '#F43F5E']} style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.avatarInitials || 'WL'}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting} numberOfLines={1}>
              Ready to wander, {firstName}? ✨
            </Text>
            <Text style={styles.subGreeting} numberOfLines={1}>
              {uniqueCountries} {uniqueCountries === 1 ? 'country' : 'countries'} •{' '}
              {formatDistance(totalDistanceKm, distanceUnit)} explored
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.newTripPill} onPress={onNewTrip} activeOpacity={0.8}>
          <Text style={styles.newTripPillText}>+ Trip</Text>
        </TouchableOpacity>
      </View>

      {/* HERO SECTION: Active Trip OR Countdown OR Brand-New Welcome */}
      {heroTrip ? (
        <ActiveHeroCard
          trip={heroTrip}
          flagsLabel={geography.byTripId[heroTrip.id]?.flagsLabel || heroTrip.flagEmoji}
          countriesLabel={geography.byTripId[heroTrip.id]?.countriesLabel || ''}
          summary={getSummaryForTrip(heroTrip.id)}
          distanceUnit={distanceUnit}
          onOpen={() => onOpenTrip(heroTrip.id)}
          onScan={onOpenScanner}
        />
      ) : nextUpcoming ? (
        <CountdownHeroCard
          trip={nextUpcoming}
          flagsLabel={geography.byTripId[nextUpcoming.id]?.flagsLabel || nextUpcoming.flagEmoji}
          countriesLabel={geography.byTripId[nextUpcoming.id]?.countriesLabel || ''}
          onOpen={() => onOpenTrip(nextUpcoming.id)}
          onScan={onOpenScanner}
          onNewTrip={onNewTrip}
        />
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🌴✈️🚆🚗</Text>
          <Text style={styles.emptyTitle}>Where to first, {firstName}?</Text>
          <Text style={styles.emptySub}>
            Scan a flight, train ticket, hotel PDF or receipt — or plan a road trip manually!
          </Text>
          <TouchableOpacity onPress={onOpenScanner} style={styles.emptyPrimaryBtn} activeOpacity={0.88}>
            <Text style={styles.emptyPrimaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              📷 Smart Scan a Ticket or PDF
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNewTrip} style={styles.emptySecondaryBtn} activeOpacity={0.85}>
            <Text style={styles.emptySecondaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              ✨ Create My First Trip
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* UPCOMING ADVENTURES CAROUSEL */}
      {trips.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>🎟️ Upcoming Adventures</Text>
            <Text style={styles.sectionMeta}>{upcomingTrips.length} planned</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          >
            {upcomingTrips.map((trip) => {
              const { daysUntil } = getTripDayProgress(trip);
              const stats = getSummaryForTrip(trip.id);
              const legsCount = stats.flightsCount + stats.transportsCount;
              const flags = geography.byTripId[trip.id]?.flagsLabel || trip.flagEmoji;
              return (
                <TouchableOpacity
                  key={trip.id}
                  onPress={() => onOpenTrip(trip.id)}
                  style={styles.upcomingCard}
                  activeOpacity={0.85}
                >
                  <View style={styles.upcomingTop}>
                    <View style={styles.countdownBadge}>
                      <Text style={styles.countdownBadgeText}>In {daysUntil} days</Text>
                    </View>
                    <Text style={styles.flagLg}>{flags}</Text>
                  </View>
                  <Text style={styles.upcomingTitle} numberOfLines={1}>
                    {trip.title}
                  </Text>
                  <Text style={styles.upcomingSub} numberOfLines={1}>
                    {trip.startDate} • {legsCount} {legsCount === 1 ? 'leg' : 'legs'}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={onNewTrip}
              style={styles.planNewCard}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 22 }}>🗺️</Text>
              <Text style={styles.planNewText}>Dream a Trip</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* PAST MEMORY SHELF */}
      {pastTrips.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>📖 Memory Shelf (Past)</Text>
            <Text style={styles.sectionMeta}>{pastTrips.length} stories</Text>
          </View>

          <View style={styles.pastGrid}>
            {pastTrips.map((trip, idx) => {
              const stats = getSummaryForTrip(trip.id);
              const flags = geography.byTripId[trip.id]?.flagsLabel || trip.flagEmoji;
              const bgTint = idx % 2 === 0 ? '#F0F9FF' : '#ECFDF5';
              const borderTint = idx % 2 === 0 ? '#BAE6FD' : '#A7F3D0';
              return (
                <TouchableOpacity
                  key={trip.id}
                  onPress={() => onOpenTrip(trip.id)}
                  style={[
                    styles.pastCard,
                    { backgroundColor: bgTint, borderColor: borderTint },
                  ]}
                  activeOpacity={0.85}
                >
                  <View style={styles.pastTopRow}>
                    <Text style={styles.flagLg}>{flags}</Text>
                    <View style={styles.photoCountBadge}>
                      <Text style={styles.photoCountText}>{stats.memoriesCount} 📸</Text>
                    </View>
                  </View>
                  <Text style={styles.pastTitle} numberOfLines={1}>
                    {trip.title}
                  </Text>
                  <Text style={styles.pastSub}>
                    {trip.startDate.slice(0, 7)} • {formatMoney(stats.totalSpentHome, trip.homeCurrency)}
                  </Text>
                  <Text style={styles.pastMiles}>
                    🧭 {formatDistance(stats.totalDistanceKm, distanceUnit)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const ActiveHeroCard: React.FC<{
  trip: Trip;
  flagsLabel: string;
  countriesLabel: string;
  summary: ReturnType<ReturnType<typeof useApp>['getSummaryForTrip']>;
  distanceUnit: DistanceUnit;
  onOpen: () => void;
  onScan: () => void;
}> = ({ trip, flagsLabel, countriesLabel, summary, distanceUnit, onOpen, onScan }) => {
  const { currentDay, totalDays } = getTripDayProgress(trip);
  const pct = trip.budget > 0 ? Math.min(100, Math.round((summary.totalSpentHome / trip.budget) * 100)) : 0;

  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.92} style={styles.heroCard}>
      <View style={styles.bannerWrap}>
        <DestinationBanner vibe={trip.vibe} coverPhotoUri={trip.coverPhotoUri} height={142} />
        <View style={styles.bannerTopBadges}>
          <View style={styles.dayPill}>
            <Text style={styles.dayPillText}>
              ☀️ DAY {currentDay} OF {totalDays}
            </Text>
          </View>
          {trip.isShared && (
            <View style={styles.sharedPill}>
              <Text style={styles.sharedPillText}>
                💌 Shared ({trip.coTravelers.length + 1})
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.heroBody}>
        <View style={styles.heroTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {trip.title} {flagsLabel}
            </Text>
            <Text style={styles.heroSubtitle}>
              {countriesLabel || trip.destinationCity} is treating you well! • {trip.startDate} → {trip.endDate}
            </Text>
          </View>
          <Text style={styles.openArrow}>Open →</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
            <Text style={styles.metricLabel}>Trip Spend</Text>
            <Text style={styles.metricValue}>
              {formatMoney(summary.totalSpentHome, trip.homeCurrency)}
              {trip.budget > 0 ? (
                <Text style={styles.metricMuted}> / {formatMoney(trip.budget, trip.homeCurrency)}</Text>
              ) : null}
            </Text>
            {trip.budget > 0 && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
            )}
          </View>

          <View style={[styles.metricBox, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
            <Text style={styles.metricLabel}>Distance & Pts</Text>
            <Text style={[styles.metricValue, { color: '#0369A1' }]}>
              {formatDistance(summary.totalDistanceKm, distanceUnit)}
            </Text>
            <Text style={styles.metricSub}>
              +{summary.totalPointsEarned.toLocaleString()} pts ✨
            </Text>
          </View>
        </View>

        <View style={styles.heroActions}>
          <TouchableOpacity onPress={onScan} style={{ flex: 1 }} activeOpacity={0.9}>
            <LinearGradient
              colors={['#F97316', '#F43F5E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.heroActionPrimary}
            >
              <Text
                style={styles.heroActionPrimaryText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                📷 Scan Pass / Bill
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={onOpen} style={styles.heroActionSecondary} activeOpacity={0.85}>
            <Text
              style={styles.heroActionSecondaryText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              📸 Add Memory
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const CountdownHeroCard: React.FC<{
  trip: Trip;
  flagsLabel: string;
  countriesLabel: string;
  onOpen: () => void;
  onScan: () => void;
  onNewTrip: () => void;
}> = ({ trip, flagsLabel, countriesLabel, onOpen, onScan, onNewTrip }) => {
  const { daysUntil } = getTripDayProgress(trip);
  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.92}>
      <LinearGradient
        colors={['#0EA5E9', '#6366F1', '#8B5CF6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.countdownHero}
      >
        <View style={styles.upcomingTop}>
          <View style={styles.cdBadge}>
            <Text style={styles.cdBadgeText}>🎒 PACKING SOON • {daysUntil} DAYS</Text>
          </View>
          <Text style={{ fontSize: 22 }}>{flagsLabel}</Text>
        </View>
        <Text style={styles.cdTitle}>{trip.title}</Text>
        <Text style={styles.cdSub}>
          {countriesLabel || trip.destinationCity} • {trip.startDate}
        </Text>
        <View style={styles.heroActions}>
          <TouchableOpacity onPress={onScan} style={styles.cdBtnWhite} activeOpacity={0.88}>
            <Text style={styles.cdBtnWhiteText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              📷 Scan Booking
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNewTrip} style={styles.cdBtnGhost} activeOpacity={0.85}>
            <Text style={styles.cdBtnGhostText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              + Plan Another
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: 16, paddingBottom: 48, gap: 18 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  greeting: { fontSize: 15, fontWeight: '900', color: COLORS.ink },
  subGreeting: { fontSize: 12, color: COLORS.inkMuted, marginTop: 1 },
  newTripPill: {
    backgroundColor: COLORS.coralSoft,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  newTripPillText: { color: COLORS.coralDark, fontWeight: '800', fontSize: 13 },

  // Active Hero
  heroCard: {
    backgroundColor: COLORS.card,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    ...SHADOWS.card,
  },
  bannerWrap: { position: 'relative' },
  bannerTopBadges: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  dayPill: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
  },
  dayPillText: { fontSize: 11, fontWeight: '900', color: COLORS.coralDark },
  sharedPill: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
  },
  sharedPillText: { fontSize: 11, fontWeight: '800', color: COLORS.rose },
  heroBody: { padding: 16, gap: 12 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  heroTitle: { fontSize: 18, fontWeight: '900', color: COLORS.ink },
  heroSubtitle: { fontSize: 12, color: COLORS.inkMuted, marginTop: 2 },
  openArrow: { fontSize: 13, fontWeight: '800', color: COLORS.coral, marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  metricLabel: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '600' },
  metricValue: { fontSize: 14, fontWeight: '900', color: COLORS.ink, marginTop: 2 },
  metricMuted: { fontSize: 11, fontWeight: '600', color: COLORS.inkSoft },
  metricSub: { fontSize: 11, color: '#0284C7', marginTop: 2, fontWeight: '600' },
  progressTrack: {
    height: 5,
    borderRadius: 99,
    backgroundColor: '#FED7AA',
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.coral, borderRadius: 99 },
  heroActions: { flexDirection: 'row', gap: 10 },
  heroActionPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  heroActionSecondary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  heroActionSecondaryText: { color: '#92400E', fontWeight: '800', fontSize: 13 },

  // Countdown Hero
  countdownHero: {
    borderRadius: 26,
    padding: 18,
    gap: 10,
    ...SHADOWS.card,
  },
  cdBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 99,
  },
  cdBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  cdTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  cdSub: { color: '#E0F2FE', fontSize: 13 },
  cdBtnWhite: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cdBtnWhiteText: { color: '#4338CA', fontWeight: '800', fontSize: 13 },
  cdBtnGhost: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cdBtnGhostText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },

  // Empty
  emptyCard: {
    backgroundColor: COLORS.cardWarm,
    borderRadius: 26,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FDBA74',
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: COLORS.ink, textAlign: 'center' },
  emptySub: { fontSize: 13, color: COLORS.inkMuted, textAlign: 'center', lineHeight: 19 },
  emptyPrimaryBtn: {
    width: '100%',
    backgroundColor: COLORS.coral,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  emptyPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  emptySecondaryBtn: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySecondaryText: { color: COLORS.coralDark, fontWeight: '800', fontSize: 14 },

  // Sections
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink, flexShrink: 1 },
  sectionMeta: { fontSize: 12, color: COLORS.inkMuted, fontWeight: '600' },
  horizontalList: { gap: 12, paddingRight: 8 },
  upcomingCard: {
    width: 195,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    padding: 14,
    gap: 5,
    ...SHADOWS.card,
  },
  upcomingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  countdownBadge: {
    backgroundColor: COLORS.indigoSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
  },
  countdownBadgeText: { color: COLORS.indigo, fontSize: 11, fontWeight: '800' },
  flagLg: { fontSize: 22 },
  upcomingTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink, marginTop: 4 },
  upcomingSub: { fontSize: 12, color: COLORS.inkMuted },
  planNewCard: {
    width: 126,
    backgroundColor: '#FFFBEB',
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#FCD34D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  planNewText: { fontSize: 12, fontWeight: '800', color: '#92400E', textAlign: 'center' },

  // Past Memory Shelf
  pastGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pastCard: {
    width: '47.5%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  pastTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  photoCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  photoCountText: { fontSize: 11, fontWeight: '800', color: COLORS.ink },
  pastTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink, marginTop: 4 },
  pastSub: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '600' },
  pastMiles: { fontSize: 11, color: COLORS.coralDark, fontWeight: '700', marginTop: 2 },
});
