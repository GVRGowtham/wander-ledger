import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WorldMapSvg } from '../components/map/WorldMapSvg';
import { useApp } from '../context/AppContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { getTripStatus } from '../db/database';
import { formatDistance, formatDistanceValue, milesToKm } from '../services/distanceUtils';
import { deriveGlobalTravelGeography } from '../services/travelGeography';
import { formatMoney, ThemeColors, ThemeShadows } from '../theme/tokens';

interface Props {
  onOpenTrip: (tripId: string) => void;
}

export const WorldMapScreen: React.FC<Props> = ({ onOpenTrip }) => {
  const {
    profile,
    trips,
    allFlights,
    allTransports,
    allStops,
    getSummaryForTrip,
    getMemoriesForTrip,
  } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(trips[0]?.id ?? null);

  // Extract distinct trip years newest-first (e.g. ['2026', '2025'])
  const availableYears = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of trips) {
      const yr = (t.startDate || '').slice(0, 4);
      if (/^\d{4}$/.test(yr)) {
        counts.set(yr, (counts.get(yr) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, count]) => ({ year, count }));
  }, [trips]);

  const activeYear =
    selectedYear && availableYears.some((y) => y.year === selectedYear)
      ? selectedYear
      : null;

  const visibleTrips = useMemo(() => {
    const filtered = activeYear
      ? trips.filter((t) => (t.startDate || '').startsWith(activeYear))
      : trips;
    return [...filtered].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [trips, activeYear]);

  const visibleTripIds = useMemo(
    () => new Set(visibleTrips.map((t) => t.id)),
    [visibleTrips]
  );

  const visibleFlights = useMemo(
    () => allFlights.filter((f) => visibleTripIds.has(f.tripId)),
    [allFlights, visibleTripIds]
  );

  const visibleTransports = useMemo(
    () => allTransports.filter((t) => visibleTripIds.has(t.tripId)),
    [allTransports, visibleTripIds]
  );

  const visibleStops = useMemo(
    () => allStops.filter((s) => visibleTripIds.has(s.tripId)),
    [allStops, visibleTripIds]
  );

  const selectedTrip = useMemo(
    () => visibleTrips.find((t) => t.id === selectedId) ?? visibleTrips[0] ?? null,
    [visibleTrips, selectedId]
  );

  const geography = useMemo(
    () =>
      deriveGlobalTravelGeography(
        visibleTrips,
        visibleFlights,
        visibleTransports,
        visibleStops
      ),
    [visibleTrips, visibleFlights, visibleTransports, visibleStops]
  );

  const distanceUnit = profile?.distanceUnit ?? 'km';
  const totalDistanceKm =
    visibleFlights.reduce((sum, f) => sum + milesToKm(f.distanceMiles), 0) +
    visibleTransports.reduce((sum, t) => sum + (t.distanceKm ?? 0), 0);
  const totalDistanceDisplay = formatDistanceValue(totalDistanceKm, distanceUnit);
  const earthCircumferenceKm = 40075;
  const earthLaps = (totalDistanceKm / earthCircumferenceKm).toFixed(2);
  const countriesCount = geography.countryStamps.length;
  const citiesCount = new Set(
    geography.visitedCities.map((c) => `${c.countryCode}:${c.city.toLowerCase()}`)
  ).size;

  const selectedSummary = selectedTrip ? getSummaryForTrip(selectedTrip.id) : null;
  const selectedGeo = selectedTrip ? geography.byTripId[selectedTrip.id] : null;
  const selectedHighlight = selectedTrip
    ? getMemoriesForTrip(selectedTrip.id)[0]
    : undefined;
  const selectedPrimaryFlag =
    selectedGeo?.visitedCountries[0]?.flag || selectedTrip?.flagEmoji || '🌍';
  const selectedExtraCountries =
    selectedGeo && selectedGeo.visitedCountries.length > 1
      ? selectedGeo.visitedCountries.length - 1
      : 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🌍 Your World Map</Text>
          <Text style={styles.subtitle}>
            {activeYear
              ? `Showing your ${activeYear} journeys • tap any pin to peek`
              : 'Tap any glowing pin to peek at its postcard!'}
          </Text>
        </View>
        <View style={styles.orbitBadge}>
          <Text style={styles.orbitText}>{earthLaps}x Earth!</Text>
        </View>
      </View>

      <WorldMapSvg
        trips={visibleTrips}
        flights={visibleFlights}
        visitedPins={geography.visitedCities}
        transitHubs={geography.transitHubs}
        selectedTripId={selectedTrip?.id ?? null}
        onSelectTrip={setSelectedId}
      />

      {geography.transitHubs.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.inkSoft }}>
            ◯ Transit hubs (not counted as countries):{' '}
            {geography.transitHubs.map((h) => `${h.flag} ${h.iata}`).join('  •  ')}
          </Text>
        </View>
      )}

      {/* Year Filter Strip (auto-shown once trips span 2+ years) */}
      {availableYears.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.yearRow}
        >
          <TouchableOpacity
            onPress={() => setSelectedYear(null)}
            style={[styles.yearPill, activeYear === null && styles.yearPillActive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.yearText, activeYear === null && styles.yearTextActive]}>
              All ({trips.length})
            </Text>
          </TouchableOpacity>
          {availableYears.map(({ year, count }) => {
            const active = activeYear === year;
            return (
              <TouchableOpacity
                key={year}
                onPress={() => setSelectedYear(year)}
                style={[styles.yearPill, active && styles.yearPillActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.yearText, active && styles.yearTextActive]}>
                  {year} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Compact Trip Selector Chips (1 flag + N for multi-country trips) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {visibleTrips.map((t) => {
          const active = t.id === selectedTrip?.id;
          const tGeo = geography.byTripId[t.id];
          const primaryFlag = tGeo?.visitedCountries[0]?.flag || t.flagEmoji || '🌍';
          const extraCountries =
            tGeo && tGeo.visitedCountries.length > 1
              ? tGeo.visitedCountries.length - 1
              : 0;
          const chipLabel = (t.title || t.destinationCity || 'Trip').trim();
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setSelectedId(t.id)}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.8}
            >
              <Text style={styles.chipFlag}>{primaryFlag}</Text>
              {extraCountries > 0 && (
                <View style={[styles.chipPlusBadge, active && styles.chipPlusBadgeActive]}>
                  <Text style={[styles.chipPlusText, active && styles.chipPlusTextActive]}>
                    +{extraCountries}
                  </Text>
                </View>
              )}
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
              >
                {chipLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Selected Pin Mini Postcard or Empty Map Prompt */}
      {selectedTrip && selectedSummary ? (
        <View style={styles.postcard}>
          <View style={styles.postcardTop}>
            <View style={styles.postcardLeft}>
              <View style={styles.flagWrap}>
                <Text style={styles.flag}>{selectedPrimaryFlag}</Text>
                {selectedExtraCountries > 0 && (
                  <View style={styles.flagPlusPill}>
                    <Text style={styles.flagPlusText}>+{selectedExtraCountries}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cityTitle} numberOfLines={1}>
                  {selectedTrip.title}
                </Text>
                <Text style={styles.dateSub}>
                  {selectedGeo && selectedGeo.visitedCountries.length > 0
                    ? `${selectedGeo.countriesLabel} • `
                    : ''}
                  {selectedTrip.startDate} → {selectedTrip.endDate} •{' '}
                  {getTripStatus(selectedTrip).toUpperCase()}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => onOpenTrip(selectedTrip.id)}
              style={styles.openBtn}
            >
              <Text style={styles.openBtnText}>Open →</Text>
            </TouchableOpacity>
          </View>

          {selectedHighlight && (
            <View style={styles.quoteBox}>
              <Text style={styles.quoteText} numberOfLines={2}>
                "{selectedHighlight.note}"
              </Text>
            </View>
          )}

          <View style={styles.postcardFooter}>
            <Text style={styles.footerStat}>
              🧭 {formatDistance(selectedSummary.totalDistanceKm, distanceUnit)} • 📸{' '}
              {selectedSummary.memoriesCount} memories
            </Text>
            <Text style={styles.footerSpend}>
              {formatMoney(
                selectedSummary.totalSpentHome,
                profile?.homeCurrency || selectedTrip.homeCurrency
              )}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.postcard}>
          <Text style={styles.cityTitle}>🧭 Your map is waiting for its first pin!</Text>
          <Text style={styles.subtitle}>
            Add a trip or log a flight, train, or road trip to light up your world map.
          </Text>
        </View>
      )}

      {/* Lifetime / Year Footprint Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: colors.coral }]}>{countriesCount}</Text>
          <Text style={styles.statLabel}>
            {activeYear ? `Countries (${activeYear})` : 'Countries'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: colors.sky }]}>{citiesCount}</Text>
          <Text style={styles.statLabel}>
            {activeYear ? `Cities (${activeYear})` : 'Cities'}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: colors.emerald }]}>
            {totalDistanceDisplay.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>
            {distanceUnit === 'mi' ? 'Miles Traveled' : 'Km Traveled'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (COLORS: ThemeColors, SHADOWS: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.canvas },
    content: { padding: 16, paddingBottom: 36, gap: 14 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    title: { fontSize: 20, fontWeight: '900', color: COLORS.ink },
    subtitle: { fontSize: 12, color: COLORS.inkMuted, marginTop: 2 },
    orbitBadge: {
      backgroundColor: COLORS.amberSoft,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: COLORS.amberBorder,
    },
    orbitText: { fontSize: 12, fontWeight: '900', color: COLORS.amberText },
    yearRow: { gap: 6, paddingVertical: 2 },
    yearPill: {
      backgroundColor: COLORS.card,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    yearPillActive: {
      backgroundColor: isDark ? COLORS.coral : COLORS.ink,
      borderColor: isDark ? COLORS.coral : COLORS.ink,
    },
    yearText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: COLORS.inkMuted,
      includeFontPadding: false,
    },
    yearTextActive: { color: '#FFFFFF' },
    chipsRow: { gap: 8, paddingVertical: 2 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: COLORS.card,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: COLORS.border,
      maxWidth: 200,
    },
    chipActive: {
      backgroundColor: COLORS.coral,
      borderColor: COLORS.coral,
    },
    chipFlag: {
      fontSize: 13,
      includeFontPadding: false,
    },
    chipPlusBadge: {
      backgroundColor: COLORS.coralSoft,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 99,
    },
    chipPlusBadgeActive: {
      backgroundColor: 'rgba(255,255,255,0.24)',
    },
    chipPlusText: {
      fontSize: 10,
      fontWeight: '700',
      color: COLORS.coralDark,
      includeFontPadding: false,
    },
    chipPlusTextActive: {
      color: '#FFFFFF',
    },
    chipText: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.ink,
      flexShrink: 1,
      includeFontPadding: false,
    },
    chipTextActive: { color: '#FFFFFF' },
    postcard: {
      backgroundColor: COLORS.card,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: COLORS.coralBorder,
      padding: 16,
      gap: 12,
      ...SHADOWS.card,
    },
    postcardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    postcardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    flagWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 38,
      gap: 2,
    },
    flag: { fontSize: 28, includeFontPadding: false },
    flagPlusPill: {
      backgroundColor: COLORS.coralSoft,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 99,
    },
    flagPlusText: {
      fontSize: 10,
      fontWeight: '700',
      color: COLORS.coralDark,
      includeFontPadding: false,
    },
    cityTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink },
    dateSub: { fontSize: 11, color: COLORS.coralDark, fontWeight: '700', marginTop: 2 },
    openBtn: {
      backgroundColor: COLORS.coralSoft,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 99,
    },
    openBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.coralDark },
    quoteBox: {
      backgroundColor: COLORS.canvas,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: COLORS.borderSoft,
    },
    quoteText: { fontSize: 12, color: COLORS.inkMuted, fontStyle: 'italic', lineHeight: 18 },
    postcardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      paddingTop: 4,
    },
    footerStat: { fontSize: 12, color: COLORS.inkMuted, fontWeight: '600', flex: 1 },
    footerSpend: { fontSize: 13, fontWeight: '900', color: COLORS.ink },
    statsRow: { flexDirection: 'row', gap: 10 },
    statCard: {
      flex: 1,
      backgroundColor: COLORS.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    statNum: { fontSize: 18, fontWeight: '900' },
    statLabel: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '700', marginTop: 3 },
  });
