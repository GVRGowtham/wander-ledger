import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DestinationBanner } from '../components/banners/DestinationBanner';
import { useApp } from '../context/AppContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { getTripDayProgress, getTripStatus } from '../db/database';
import { formatDistance, milesToKm } from '../services/distanceUtils';
import {
  deriveGlobalTravelGeography,
  formatCompactFlags,
} from '../services/travelGeography';
import {
  extractTripYears,
  filterTripsBySearchAndYear,
} from '../services/tripSearchHelpers';
import { convertAmountToPreferred } from '../services/spendCurrencyUtils';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { formatTripTitleWithFlags } from '../services/placeLookupService';
import { formatMoney, ThemeColors, ThemeShadows } from '../theme/tokens';
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
  const {
    profile,
    trips,
    allFlights,
    allTransports,
    allStops,
    allStays,
    allMemories,
    fxRates,
    getSummaryForTrip,
  } = useApp();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);

  const preferredCurrency = (profile?.homeCurrency || 'USD').toUpperCase();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  const tripYears = useMemo(() => extractTripYears(trips), [trips]);
  const activeYear =
    selectedYear !== 'all' && tripYears.includes(selectedYear) ? selectedYear : 'all';
  const isFiltering = searchQuery.trim().length > 0 || activeYear !== 'all';

  const filteredTrips = useMemo(
    () =>
      filterTripsBySearchAndYear(trips, searchQuery, activeYear, {
        flights: allFlights,
        transports: allTransports,
        stops: allStops,
        stays: allStays,
        memories: allMemories,
      }),
    [trips, searchQuery, activeYear, allFlights, allTransports, allStops, allStays, allMemories]
  );

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

      {/* Search & Year Filter Strip (shown once user has at least 1 trip) */}
      {trips.length > 0 && (
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search trips, cities, flights, memories..."
              placeholderTextColor={colors.inkSoft}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.searchClearBtn}
              >
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {tripYears.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.yearChipsRow}
            >
              {['all', ...tripYears].map((yr) => {
                const active = activeYear === yr;
                return (
                  <TouchableOpacity
                    key={yr}
                    onPress={() => setSelectedYear(yr)}
                    style={[styles.yearChip, active && styles.yearChipActive]}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>
                      {yr === 'all' ? `All (${trips.length})` : yr}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* FILTERED RESULTS VIEW (when search or year filter is active) */}
      {isFiltering ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              🔎 Matching Trips ({filteredTrips.length})
            </Text>
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSelectedYear('all');
              }}
            >
              <Text style={styles.clearFilterLink}>Clear filters</Text>
            </TouchableOpacity>
          </View>

          {filteredTrips.length === 0 ? (
            <View style={styles.filterEmptyBox}>
              <Text style={{ fontSize: 28 }}>🗺️</Text>
              <Text style={styles.filterEmptyTitle}>No matching trips found</Text>
              <Text style={styles.filterEmptySub}>
                Try searching by city, country, airline, hotel, or a word from your memory notes.
              </Text>
            </View>
          ) : (
            <View style={styles.pastGrid}>
              {filteredTrips.map((trip, idx) => {
                const stats = getSummaryForTrip(trip.id);
                const status = getTripStatus(trip);
                const compactFlags = formatCompactFlags(
                  geography.byTripId[trip.id]?.visitedCountries,
                  trip.flagEmoji,
                  3
                );
                const bgTint =
                  status === 'active'
                    ? isDark
                      ? colors.coralSoft
                      : '#FFF7ED'
                    : status === 'upcoming'
                      ? isDark
                        ? colors.indigoSoft
                        : '#EEF2FF'
                      : idx % 2 === 0
                        ? isDark
                          ? colors.skySoft
                          : '#F0F9FF'
                        : isDark
                          ? colors.emeraldSoft
                          : '#ECFDF5';
                const borderTint =
                  status === 'active'
                    ? colors.coralBorder
                    : status === 'upcoming'
                      ? colors.indigoBorder
                      : idx % 2 === 0
                        ? colors.skyBorder
                        : colors.emeraldBorder;
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
                      <View style={styles.flagRow}>
                        <Text style={styles.flagCompact} numberOfLines={1}>
                          {compactFlags.flagsText}
                        </Text>
                        {compactFlags.overflowCount > 0 && (
                          <View style={styles.flagMorePill}>
                            <Text style={styles.flagMoreText}>
                              +{compactFlags.overflowCount}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.photoCountBadge}>
                        <Text style={styles.photoCountText} numberOfLines={1}>
                          {status === 'active'
                            ? '☀️ Live'
                            : status === 'upcoming'
                              ? '🎟️ Soon'
                              : `${stats.memoriesCount} 📸`}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.pastTitle} numberOfLines={1}>
                      {trip.title}
                    </Text>
                    <Text style={styles.pastSub} numberOfLines={1}>
                      {trip.startDate} • {formatMoney(stats.totalSpentHome, preferredCurrency)}
                    </Text>
                    <Text style={styles.pastMiles}>
                      🧭 {formatDistance(stats.totalDistanceKm, distanceUnit)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        <>
          {/* HERO SECTION: Active Trip OR Countdown OR Brand-New Welcome */}
          {heroTrip ? (
            <ActiveHeroCard
              trip={heroTrip}
              flagsLabel={geography.byTripId[heroTrip.id]?.flagsLabel || heroTrip.flagEmoji}
              countriesLabel={geography.byTripId[heroTrip.id]?.countriesLabel || ''}
              summary={getSummaryForTrip(heroTrip.id)}
              preferredCurrency={preferredCurrency}
              convertedBudget={
                heroTrip.budget > 0
                  ? convertAmountToPreferred(
                      heroTrip.budget,
                      heroTrip.homeCurrency,
                      preferredCurrency,
                      fxRates
                    ).amount
                  : 0
              }
              distanceUnit={distanceUnit}
              onOpen={() => onOpenTrip(heroTrip.id)}
              onScan={onOpenScanner}
            />
          ) : nextUpcoming ? (
            <CountdownHeroCard
              trip={nextUpcoming}
              visitedCountries={geography.byTripId[nextUpcoming.id]?.visitedCountries}
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
                  const compactFlags = formatCompactFlags(
                    geography.byTripId[trip.id]?.visitedCountries,
                    trip.flagEmoji,
                    3
                  );
                  return (
                    <TouchableOpacity
                      key={trip.id}
                      onPress={() => onOpenTrip(trip.id)}
                      style={styles.upcomingCard}
                      activeOpacity={0.85}
                    >
                      <View style={styles.upcomingTop}>
                        <View style={styles.countdownBadge}>
                          <Text style={styles.countdownBadgeText}>
                            In {daysUntil} {daysUntil === 1 ? 'day' : 'days'}
                          </Text>
                        </View>
                        <View style={styles.flagRowEnd}>
                          <Text style={styles.flagCompact} numberOfLines={1}>
                            {compactFlags.flagsText}
                          </Text>
                          {compactFlags.overflowCount > 0 && (
                            <View style={styles.flagMorePill}>
                              <Text style={styles.flagMoreText}>
                                +{compactFlags.overflowCount}
                              </Text>
                            </View>
                          )}
                        </View>
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
                <Text style={styles.sectionMeta}>
                  {pastTrips.length} {pastTrips.length === 1 ? 'story' : 'stories'}
                </Text>
              </View>

              <View style={styles.pastGrid}>
                {pastTrips.map((trip, idx) => {
                  const stats = getSummaryForTrip(trip.id);
                  const compactFlags = formatCompactFlags(
                    geography.byTripId[trip.id]?.visitedCountries,
                    trip.flagEmoji,
                    3
                  );
                  const bgTint =
                    idx % 2 === 0
                      ? isDark
                        ? colors.skySoft
                        : '#F0F9FF'
                      : isDark
                        ? colors.emeraldSoft
                        : '#ECFDF5';
                  const borderTint = idx % 2 === 0 ? colors.skyBorder : colors.emeraldBorder;
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
                        <View style={styles.flagRow}>
                          <Text style={styles.flagCompact} numberOfLines={1}>
                            {compactFlags.flagsText}
                          </Text>
                          {compactFlags.overflowCount > 0 && (
                            <View style={styles.flagMorePill}>
                              <Text style={styles.flagMoreText}>
                                +{compactFlags.overflowCount}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.photoCountBadge}>
                          <Text style={styles.photoCountText} numberOfLines={1}>
                            {stats.memoriesCount} 📸
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.pastTitle} numberOfLines={1}>
                        {trip.title}
                      </Text>
                      <Text style={styles.pastSub} numberOfLines={1}>
                        {trip.startDate.slice(0, 7)} • {formatMoney(stats.totalSpentHome, preferredCurrency)}
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
        </>
      )}
    </ScrollView>
  );
};

const ActiveHeroCard: React.FC<{
  trip: Trip;
  flagsLabel: string;
  countriesLabel: string;
  summary: ReturnType<ReturnType<typeof useApp>['getSummaryForTrip']>;
  preferredCurrency: string;
  convertedBudget: number;
  distanceUnit: DistanceUnit;
  onOpen: () => void;
  onScan: () => void;
}> = ({
  trip,
  flagsLabel,
  countriesLabel,
  summary,
  preferredCurrency,
  convertedBudget,
  distanceUnit,
  onOpen,
  onScan,
}) => {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { currentDay, totalDays } = getTripDayProgress(trip);
  const pct =
    convertedBudget > 0
      ? Math.min(100, Math.round((summary.totalSpentHome / convertedBudget) * 100))
      : 0;

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
          {FEATURE_FLAGS.CLOUD_COLLAB_ENABLED && trip.coTravelers.length > 0 && (
            <View style={styles.sharedPill}>
              <Text style={styles.sharedPillText}>
                🤝 Shared ({trip.coTravelers.length + 1})
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.heroBody}>
        <View style={styles.heroTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {formatTripTitleWithFlags(trip.title, flagsLabel)}
            </Text>
            <Text style={styles.heroSubtitle}>
              {countriesLabel || trip.destinationCity} is treating you well! • {trip.startDate} → {trip.endDate}
            </Text>
          </View>
          <Text style={styles.openArrow}>Open →</Text>
        </View>

        <View style={styles.metricsRow}>
          <View
            style={[
              styles.metricBox,
              {
                backgroundColor: isDark ? colors.coralSoft : '#FFF7ED',
                borderColor: colors.coralBorder,
              },
            ]}
          >
            <Text style={styles.metricLabel}>Trip Spend</Text>
            <Text style={styles.metricValue}>
              {formatMoney(summary.totalSpentHome, preferredCurrency)}
              {convertedBudget > 0 ? (
                <Text style={styles.metricMuted}> / {formatMoney(convertedBudget, preferredCurrency)}</Text>
              ) : null}
            </Text>
            {convertedBudget > 0 && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
            )}
          </View>

          <View
            style={[
              styles.metricBox,
              {
                backgroundColor: isDark ? colors.skySoft : '#F0F9FF',
                borderColor: colors.skyBorder,
              },
            ]}
          >
            <Text style={styles.metricLabel}>Distance & Pts</Text>
            <Text style={[styles.metricValue, { color: isDark ? '#7DD3FC' : '#0369A1' }]}>
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
  visitedCountries?: ReadonlyArray<{ flag: string }>;
  countriesLabel: string;
  onOpen: () => void;
  onScan: () => void;
  onNewTrip: () => void;
}> = ({ trip, visitedCountries, countriesLabel, onOpen, onScan, onNewTrip }) => {
  const styles = useThemedStyles(createStyles);
  const { daysUntil } = getTripDayProgress(trip);
  const compactFlags = formatCompactFlags(visitedCountries, trip.flagEmoji, 4);
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
            <Text style={styles.cdBadgeText}>
              🎒 PACKING SOON • {daysUntil} {daysUntil === 1 ? 'DAY' : 'DAYS'}
            </Text>
          </View>
          <View style={styles.flagRowEnd}>
            <Text style={{ fontSize: 20 }} numberOfLines={1}>
              {compactFlags.flagsText}
            </Text>
            {compactFlags.overflowCount > 0 && (
              <View style={styles.cdFlagMorePill}>
                <Text style={styles.cdFlagMoreText}>+{compactFlags.overflowCount}</Text>
              </View>
            )}
          </View>
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

const createStyles = (COLORS: ThemeColors, SHADOWS: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
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
      borderColor: COLORS.card,
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
      borderColor: COLORS.coralBorder,
    },
    newTripPillText: { color: COLORS.coralDark, fontWeight: '800', fontSize: 13 },

    // Active Hero
    heroCard: {
      backgroundColor: COLORS.card,
      borderRadius: 26,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: COLORS.coralBorder,
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
      backgroundColor: isDark ? 'rgba(14,17,27,0.84)' : 'rgba(255,255,255,0.92)',
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 99,
    },
    dayPillText: { fontSize: 11, fontWeight: '900', color: COLORS.coralDark },
    sharedPill: {
      backgroundColor: isDark ? 'rgba(14,17,27,0.84)' : 'rgba(255,255,255,0.92)',
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
    metricSub: { fontSize: 11, color: isDark ? '#7DD3FC' : '#0284C7', marginTop: 2, fontWeight: '600' },
    progressTrack: {
      height: 5,
      borderRadius: 99,
      backgroundColor: COLORS.coralBorder,
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
      borderColor: COLORS.amberBorder,
    },
    heroActionSecondaryText: { color: COLORS.amberText, fontWeight: '800', fontSize: 13 },

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
      borderColor: COLORS.coralBorder,
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
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.coralBorder,
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
      borderColor: COLORS.indigoBorder,
      padding: 14,
      gap: 5,
      overflow: 'hidden',
      ...SHADOWS.card,
    },
    upcomingTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 6,
    },
    countdownBadge: {
      backgroundColor: COLORS.indigoSoft,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 99,
      flexShrink: 0,
    },
    countdownBadgeText: { color: COLORS.indigo, fontSize: 11, fontWeight: '800' },
    flagLg: { fontSize: 22 },
    flagRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    flagRowEnd: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
    },
    flagCompact: { fontSize: 18, lineHeight: 22, flexShrink: 1 },
    flagMorePill: {
      backgroundColor: isDark ? 'rgba(14,17,27,0.72)' : 'rgba(255,255,255,0.85)',
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 99,
      flexShrink: 0,
    },
    flagMoreText: { fontSize: 10, fontWeight: '900', color: COLORS.inkMuted },
    cdFlagMorePill: {
      backgroundColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 99,
      flexShrink: 0,
    },
    cdFlagMoreText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
    upcomingTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink, marginTop: 4 },
    upcomingSub: { fontSize: 12, color: COLORS.inkMuted },
    planNewCard: {
      width: 126,
      backgroundColor: isDark ? COLORS.amberSoft : '#FFFBEB',
      borderRadius: 20,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: COLORS.amberBorder,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: 12,
    },
    planNewText: { fontSize: 12, fontWeight: '800', color: COLORS.amberText, textAlign: 'center' },

    // Past Memory Shelf
    pastGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    pastCard: {
      width: '47.5%',
      borderRadius: 20,
      borderWidth: 1,
      padding: 14,
      gap: 4,
      overflow: 'hidden',
    },
    pastTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 6,
    },
    photoCountBadge: {
      backgroundColor: isDark ? 'rgba(14,17,27,0.72)' : 'rgba(255,255,255,0.85)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 99,
      flexShrink: 0,
    },
    photoCountText: { fontSize: 11, fontWeight: '800', color: COLORS.ink },
    pastTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink, marginTop: 4 },
    pastSub: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '600' },
    pastMiles: { fontSize: 11, color: COLORS.coralDark, fontWeight: '700', marginTop: 2 },
    searchSection: { gap: 8 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    searchIcon: { fontSize: 14 },
    searchInput: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: '600',
      color: COLORS.ink,
      paddingVertical: 2,
    },
    searchClearBtn: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: isDark ? COLORS.surfaceMuted : '#F3F4F6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchClearText: { fontSize: 11, fontWeight: '900', color: COLORS.inkMuted },
    yearChipsRow: { gap: 8, paddingVertical: 2 },
    yearChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 99,
      backgroundColor: COLORS.card,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    yearChipActive: {
      backgroundColor: isDark ? COLORS.coral : COLORS.ink,
      borderColor: isDark ? COLORS.coral : COLORS.ink,
    },
    yearChipText: { fontSize: 12, fontWeight: '800', color: COLORS.inkMuted },
    yearChipTextActive: { color: '#FFFFFF' },
    clearFilterLink: { fontSize: 12, fontWeight: '800', color: COLORS.coral },
    filterEmptyBox: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: COLORS.border,
      padding: 22,
      alignItems: 'center',
      gap: 6,
    },
    filterEmptyTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
    filterEmptySub: {
      fontSize: 12,
      color: COLORS.inkMuted,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
