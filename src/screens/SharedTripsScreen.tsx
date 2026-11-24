import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import {
  getCoTravelerRole,
  getTripAccessRole,
  isCollaborativeTrip,
} from '../services/sharingHelpers';
import { COLORS, SHADOWS } from '../theme/tokens';

interface Props {
  onOpenTrip: (tripId: string) => void;
}

export const SharedTripsScreen: React.FC<Props> = ({ onOpenTrip }) => {
  const { trips, profile, getSummaryForTrip } = useApp();

  const sharedTrips = trips.filter((t) => isCollaborativeTrip(t, profile));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={styles.title}>🤝 Shared Trips</Text>
        <Text style={styles.subtitle}>
          Collaborative trips with travel buddies & family viewers.
        </Text>
      </View>

      {sharedTrips.length > 0 ? (
        sharedTrips.map((trip) => {
          const stats = getSummaryForTrip(trip.id);
          const myRole = getTripAccessRole(trip, profile);
          const roleBadge =
            myRole === 'owner'
              ? { label: '👑 OWNER', bg: '#FEF3C7', color: '#B45309' }
              : myRole === 'viewer'
                ? { label: '👀 VIEWER (READ-ONLY)', bg: COLORS.skySoft, color: '#0369A1' }
                : { label: '✏️ EDITOR', bg: '#DCFCE7', color: '#15803D' };

          return (
            <TouchableOpacity
              key={trip.id}
              onPress={() => onOpenTrip(trip.id)}
              style={styles.sharedCard}
              activeOpacity={0.88}
            >
              <View style={styles.rowBetween}>
                <View style={[styles.badge, { backgroundColor: roleBadge.bg }]}>
                  <Text style={[styles.badgeText, { color: roleBadge.color }]}>
                    {roleBadge.label}
                  </Text>
                </View>
                <Text style={styles.flag}>{trip.flagEmoji}</Text>
              </View>

              <Text style={styles.tripTitle}>{trip.title}</Text>
              <Text style={styles.tripSub}>
                {trip.startDate} → {trip.endDate} • 📸 {stats.memoriesCount}{' '}
                {stats.memoriesCount === 1 ? 'memory' : 'memories'}
              </Text>

              {trip.coTravelers.length > 0 && (
                <View style={styles.membersWrap}>
                  {trip.coTravelers.map((member) => {
                    const mRole = getCoTravelerRole(trip, member);
                    return (
                      <View
                        key={member}
                        style={[
                          styles.memberChip,
                          mRole === 'viewer' && styles.memberChipViewer,
                        ]}
                      >
                        <Text
                          style={[
                            styles.memberChipText,
                            mRole === 'viewer' && styles.memberChipTextViewer,
                          ]}
                          numberOfLines={1}
                        >
                          {mRole === 'viewer' ? '👀' : '✏️'} {member}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.footerRow}>
                <Text style={styles.privacyNote}>
                  {myRole === 'viewer'
                    ? '🔒 Expenses & receipts are hidden for viewers'
                    : '🔒 Personal expenses stay private'}
                </Text>
                <View style={styles.openPill}>
                  <Text style={styles.openPillText}>Open Trip →</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 34 }}>🤝</Text>
          <Text style={styles.emptyTitle}>No shared trips yet</Text>
          <Text style={styles.emptySub}>
            Open any trip and tap “👥 Co-Travelers” to invite friends as Editors or family as Viewers.
          </Text>
        </View>
      )}

      <View style={styles.infoBanner}>
        <Text style={styles.infoTitle}>✨ Co-Travelers vs. Postcards</Text>
        <Text style={styles.infoSub}>
          • <Text style={{ fontWeight: '800' }}>👥 Co-Travelers</Text>: Invite buddies as{' '}
          <Text style={{ fontWeight: '800' }}>Editor</Text> (can add photos, bookings & shared expenses) or{' '}
          <Text style={{ fontWeight: '800' }}>Viewer</Text> (read-only itinerary & photos, zero spend visible).{'\n'}
          • <Text style={{ fontWeight: '800' }}>📮 Postcard</Text>: Inside any trip, tap Postcard to instantly share a one-off collage or route summary with anyone — no login required and no history stored.
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
    borderColor: COLORS.border,
    padding: 16,
    gap: 8,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  badgeText: { fontSize: 10, fontWeight: '900' },
  flag: { fontSize: 24 },
  tripTitle: { fontSize: 17, fontWeight: '900', color: COLORS.ink },
  tripSub: { fontSize: 12, color: COLORS.inkMuted },
  membersWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  memberChip: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    maxWidth: '100%',
  },
  memberChipViewer: {
    backgroundColor: COLORS.skySoft,
    borderColor: '#BAE6FD',
  },
  memberChipText: { fontSize: 11, fontWeight: '700', color: '#166534' },
  memberChipTextViewer: { color: '#0369A1' },
  footerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  privacyNote: { fontSize: 11, fontWeight: '700', color: '#047857', flex: 1, minWidth: 150 },
  openPill: {
    backgroundColor: COLORS.coralSoft,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
  },
  openPillText: { color: COLORS.coral, fontWeight: '800', fontSize: 12 },
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
  infoSub: { fontSize: 12, color: '#0C4A6E', lineHeight: 19 },
});
