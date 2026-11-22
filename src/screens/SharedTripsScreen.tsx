import React from 'react';
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../theme/tokens';
import { Trip } from '../types/models';

interface Props {
  onOpenTrip: (tripId: string) => void;
}

export const SharedTripsScreen: React.FC<Props> = ({ onOpenTrip }) => {
  const { trips, getSummaryForTrip, saveTripSharing } = useApp();
  const sharedTrips = trips.filter((t) => t.isShared);

  const sharePostcard = async (trip: Trip) => {
    const token = trip.shareToken || `wl_${trip.id.slice(-8)}`;
    if (!trip.isShared) {
      saveTripSharing(trip.id, true, trip.coTravelers, token);
    }
    const stats = getSummaryForTrip(trip.id);
    await Share.share({
      title: `${trip.title} ${trip.flagEmoji} — WanderLedger Postcard`,
      message: `📮 Check out our ${trip.title} ${trip.flagEmoji} travelogue!\n${trip.startDate} → ${trip.endDate}\n✈️ ${stats.totalMilesFlown.toLocaleString()} miles • 📸 ${stats.memoriesCount} memories\n(Private spend & receipts stay hidden automatically ✨)`,
    });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={styles.title}>💌 Shared & Postcards</Text>
        <Text style={styles.subtitle}>
          Co-log memories with travel buddies or send read-only postcards to family.
        </Text>
      </View>

      {sharedTrips.length > 0 ? (
        sharedTrips.map((trip) => {
          const stats = getSummaryForTrip(trip.id);
          return (
            <TouchableOpacity
              key={trip.id}
              onPress={() => onOpenTrip(trip.id)}
              style={styles.sharedCard}
              activeOpacity={0.88}
            >
              <View style={styles.rowBetween}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {trip.coTravelers.length > 0 ? 'CO-TRAVELER TRIP' : 'POSTCARD SHARED'}
                  </Text>
                </View>
                <Text style={styles.flag}>{trip.flagEmoji}</Text>
              </View>

              <Text style={styles.tripTitle}>{trip.title}</Text>
              <Text style={styles.tripSub}>
                {trip.coTravelers.length > 0
                  ? `With ${trip.coTravelers.join(', ')} • ${stats.memoriesCount} shared Polaroids`
                  : `Read-only Family Postcard • ${stats.memoriesCount} memories`}
              </Text>

              <View style={styles.footerRow}>
                <Text style={styles.privacyNote}>🔒 Private receipts hidden</Text>
                <TouchableOpacity
                  onPress={() => sharePostcard(trip)}
                  style={styles.shareBtn}
                >
                  <Text style={styles.shareBtnText}>Share Postcard 📮</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 32 }}>💌</Text>
          <Text style={styles.emptyTitle}>No shared trips yet</Text>
          <Text style={styles.emptySub}>
            Open any trip and tap “💌 Share” to invite co-travelers or send a family postcard!
          </Text>
        </View>
      )}

      {/* Quick Share Any Trip */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoTitle}>📮 Family-Safe Read-Only Postcards</Text>
        <Text style={styles.infoSub}>
          Whenever you send a Postcard link to family or friends, WanderLedger automatically shares only your Polaroid photos, stories & World Map arcs—keeping your restaurant bills and budgets 100% private.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: 16, paddingBottom: 36, gap: 14 },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.ink },
  subtitle: { fontSize: 12, color: COLORS.inkMuted, marginTop: 2 },
  sharedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    padding: 16,
    gap: 8,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    backgroundColor: COLORS.roseSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  badgeText: { fontSize: 10, fontWeight: '900', color: COLORS.rose },
  flag: { fontSize: 24 },
  tripTitle: { fontSize: 17, fontWeight: '900', color: COLORS.ink },
  tripSub: { fontSize: 12, color: COLORS.inkMuted },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  privacyNote: { fontSize: 11, fontWeight: '700', color: '#047857' },
  shareBtn: {
    backgroundColor: COLORS.sky,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
  },
  shareBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  emptyBox: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink },
  emptySub: { fontSize: 12, color: COLORS.inkMuted, textAlign: 'center', lineHeight: 18 },
  infoBanner: {
    backgroundColor: COLORS.skySoft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 15,
    gap: 6,
  },
  infoTitle: { fontSize: 13, fontWeight: '900', color: '#0369A1' },
  infoSub: { fontSize: 12, color: '#0C4A6E', lineHeight: 18 },
});
