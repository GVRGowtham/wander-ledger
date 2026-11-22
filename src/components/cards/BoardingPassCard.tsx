import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { formatDuration } from '../../db/airportsData';
import { COLORS, SHADOWS } from '../../theme/tokens';
import { Flight } from '../../types/models';

interface Props {
  flight: Flight;
}

export const BoardingPassCard: React.FC<Props> = ({ flight }) => {
  const depDateLabel = flight.departureTime.slice(0, 10);

  return (
    <View style={styles.card}>
      {/* Colorful Airline Header */}
      <LinearGradient
        colors={['#0EA5E9', '#4F46E5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.airlineTitle}>
            ✈️ {flight.airlineName.split(' ')[0]} • {flight.flightNumber}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {flight.enrichedOnline ? 'LIVE ENRICHED' : 'BOARDING PASS'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Main Route Body */}
      <View style={styles.body}>
        <View style={styles.routeRow}>
          <View style={styles.endpoint}>
            <Text style={styles.iata}>{flight.originIata}</Text>
            <Text style={styles.city} numberOfLines={1}>
              {flight.originCity}
            </Text>
          </View>

          <View style={styles.midCol}>
            <Text style={styles.durationText}>{formatDuration(flight.durationMinutes)}</Text>
            <View style={styles.dashLineWrap}>
              <View style={styles.dashLine} />
              <Text style={styles.planeMini}>✈️</Text>
            </View>
            <Text style={styles.milesText}>{flight.distanceMiles.toLocaleString()} mi</Text>
          </View>

          <View style={[styles.endpoint, { alignItems: 'flex-end' }]}>
            <Text style={styles.iata}>{flight.destIata}</Text>
            <Text style={styles.city} numberOfLines={1}>
              {flight.destCity}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <MetaItem label="DATE" value={depDateLabel} />
          <MetaItem label="SEAT" value={flight.seat || 'TBD'} />
          <MetaItem label="CABIN" value={flight.cabinClass || 'Economy'} />
          <MetaItem label="PNR" value={flight.pnr || '—'} />
        </View>

        {(flight.aircraft || flight.terminal || flight.gate) && (
          <View style={styles.extraStrip}>
            <Text style={styles.extraText}>
              {[
                flight.aircraft,
                flight.terminal ? `Terminal ${flight.terminal}` : null,
                flight.gate ? `Gate ${flight.gate}` : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          </View>
        )}
      </View>

      {/* Perforated Scalloped Footer */}
      <View style={styles.perforationWrap}>
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={styles.perforatedLine} />
        <View style={[styles.notch, styles.notchRight]} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.loyaltyLabel} numberOfLines={1}>
          🏆 {flight.loyaltyProgram || 'Frequent Flyer'}
        </Text>
        <Text style={styles.loyaltyPoints}>
          +{flight.milesEarned.toLocaleString()} mi ✨
        </Text>
      </View>
    </View>
  );
};

const MetaItem = ({ label, value }: { label: string; value: string }) => (
  <View>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  airlineTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  endpoint: {
    width: 82,
  },
  iata: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.ink,
    letterSpacing: 0.5,
  },
  city: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginTop: 1,
  },
  midCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.sky,
  },
  dashLineWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  dashLine: {
    width: '100%',
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#7DD3FC',
  },
  planeMini: {
    position: 'absolute',
    backgroundColor: COLORS.card,
    paddingHorizontal: 4,
    fontSize: 13,
  },
  milesText: {
    fontSize: 11,
    color: COLORS.inkMuted,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  metaLabel: {
    fontSize: 10,
    color: COLORS.inkSoft,
    fontWeight: '700',
  },
  metaValue: {
    fontSize: 12,
    color: COLORS.ink,
    fontWeight: '800',
    marginTop: 2,
  },
  extraStrip: {
    marginTop: 10,
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  extraText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600',
  },
  perforationWrap: {
    height: 16,
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: '#F8FAFC',
  },
  perforatedLine: {
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    marginHorizontal: 12,
  },
  notch: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  notchLeft: { left: -9 },
  notchRight: { right: -9 },
  footer: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loyaltyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkMuted,
    flex: 1,
    marginRight: 8,
  },
  loyaltyPoints: {
    fontSize: 12,
    fontWeight: '900',
    color: '#B45309',
  },
});
