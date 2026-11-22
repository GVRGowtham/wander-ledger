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
import { getTripStatus } from '../db/database';
import { COLORS, formatMoney, SHADOWS } from '../theme/tokens';

interface Props {
  onOpenTrip: (tripId: string) => void;
}

export const WorldMapScreen: React.FC<Props> = ({ onOpenTrip }) => {
  const { trips, allFlights, getSummaryForTrip, getMemoriesForTrip } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(trips[0]?.id ?? null);

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedId) ?? trips[0] ?? null,
    [trips, selectedId]
  );

  const totalMiles = allFlights.reduce((sum, f) => sum + f.distanceMiles, 0);
  const earthCircumferenceMiles = 24901;
  const earthLaps = (totalMiles / earthCircumferenceMiles).toFixed(2);
  const countriesCount = new Set(trips.map((t) => t.countryCode)).size;
  const citiesCount = new Set(trips.map((t) => t.destinationCity)).size;

  const selectedSummary = selectedTrip ? getSummaryForTrip(selectedTrip.id) : null;
  const selectedHighlight = selectedTrip
    ? getMemoriesForTrip(selectedTrip.id)[0]
    : undefined;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🌍 Your World Map</Text>
          <Text style={styles.subtitle}>Tap any glowing pin to peek at its postcard!</Text>
        </View>
        <View style={styles.orbitBadge}>
          <Text style={styles.orbitText}>{earthLaps}x Earth!</Text>
        </View>
      </View>

      <WorldMapSvg
        trips={trips}
        flights={allFlights}
        selectedTripId={selectedTrip?.id ?? null}
        onSelectTrip={setSelectedId}
      />

      {/* Quick Destination Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {trips.map((t) => {
          const active = t.id === selectedTrip?.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setSelectedId(t.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t.flagEmoji} {t.destinationCity}
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
              <Text style={styles.flag}>{selectedTrip.flagEmoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cityTitle}>{selectedTrip.title}</Text>
                <Text style={styles.dateSub}>
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
              ✈️ {selectedSummary.totalMilesFlown.toLocaleString()} mi • 📸{' '}
              {selectedSummary.memoriesCount} memories
            </Text>
            <Text style={styles.footerSpend}>
              {formatMoney(selectedSummary.totalSpentHome, selectedTrip.homeCurrency)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.postcard}>
          <Text style={styles.cityTitle}>🧭 Your map is waiting for its first pin!</Text>
          <Text style={styles.subtitle}>
            Add a trip or log a flight (even without a boarding pass) to draw your first geodesic arc across the globe.
          </Text>
        </View>
      )}

      {/* Lifetime Footprint Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: COLORS.coral }]}>{countriesCount}</Text>
          <Text style={styles.statLabel}>Countries</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: COLORS.sky }]}>{citiesCount}</Text>
          <Text style={styles.statLabel}>Cities</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: COLORS.emerald }]}>
            {totalMiles.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Miles Flown</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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
    borderColor: '#FCD34D',
  },
  orbitText: { fontSize: 12, fontWeight: '900', color: '#92400E' },
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.ink },
  chipTextActive: { color: '#FFFFFF' },
  postcard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    padding: 16,
    gap: 12,
    ...SHADOWS.card,
  },
  postcardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  postcardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  flag: { fontSize: 28 },
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
    paddingTop: 4,
  },
  footerStat: { fontSize: 12, color: COLORS.inkMuted, fontWeight: '600' },
  footerSpend: { fontSize: 13, fontWeight: '900', color: COLORS.ink },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statNum: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '700', marginTop: 2 },
});
