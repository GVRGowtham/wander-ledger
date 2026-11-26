import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useThemedStyles } from '../../context/ThemeContext';
import { formatDistance } from '../../services/distanceUtils';
import {
  formatMoney,
  getTransportModeMeta,
  ThemeColors,
  ThemeShadows,
} from '../../theme/tokens';
import { DistanceUnit, TransportLeg } from '../../types/models';

interface Props {
  transport: TransportLeg;
  distanceUnit?: DistanceUnit;
  homeCurrency: string;
  fuelSpentHome?: number;
  fuelCount?: number;
  onLogFuel?: () => void;
}

const MODE_GRADIENTS: Record<TransportLeg['mode'], [string, string]> = {
  train: ['#0D9488', '#0284C7'],
  bus: ['#0284C7', '#4F46E5'],
  ferry: ['#2563EB', '#0891B2'],
  rental_car: ['#F97316', '#EA580C'],
  own_car: ['#D97706', '#EA580C'],
};

const LIGHT_MODE_BORDERS: Record<TransportLeg['mode'], string> = {
  train: '#99F6E4',
  bus: '#BAE6FD',
  ferry: '#BFDBFE',
  rental_car: '#FED7AA',
  own_car: '#FDE68A',
};

const DARK_MODE_BORDERS: Record<TransportLeg['mode'], string> = {
  train: '#1E5450',
  bus: '#1D4D70',
  ferry: '#254378',
  rental_car: '#6B361F',
  own_car: '#61471A',
};

export const TransportCard: React.FC<Props> = ({
  transport,
  distanceUnit = 'km',
  homeCurrency,
  fuelSpentHome = 0,
  fuelCount = 0,
  onLogFuel,
}) => {
  const { isDark, colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const meta = getTransportModeMeta(isDark)[transport.mode];
  const gradient = MODE_GRADIENTS[transport.mode];
  const borderColor = (isDark ? DARK_MODE_BORDERS : LIGHT_MODE_BORDERS)[transport.mode];
  const isCar = transport.mode === 'rental_car' || transport.mode === 'own_car';

  const dateRange =
    transport.endDate && transport.endDate.slice(0, 10) !== transport.startDate.slice(0, 10)
      ? `${transport.startDate.slice(0, 10)} → ${transport.endDate.slice(0, 10)}`
      : transport.startDate.slice(0, 10);

  return (
    <View style={[styles.card, { borderColor }]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {meta.emoji} {transport.title}
          </Text>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{meta.label.toUpperCase()}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {/* Route Row */}
        <View style={styles.routeRow}>
          <View style={styles.endpoint}>
            <Text style={styles.endpointLabel}>{isCar ? 'START / PICKUP' : 'FROM'}</Text>
            <Text style={styles.endpointCity} numberOfLines={2}>
              {transport.origin}
            </Text>
          </View>

          <View style={styles.midCol}>
            <View style={styles.dashLineWrap}>
              <View style={[styles.dashLine, { borderColor }]} />
              <Text style={styles.modeMini}>{meta.emoji}</Text>
            </View>
            {Boolean(transport.distanceKm && transport.distanceKm > 0) && (
              <Text style={styles.distanceText}>
                {formatDistance(transport.distanceKm!, distanceUnit)}
              </Text>
            )}
          </View>

          <View style={[styles.endpoint, { alignItems: 'flex-end' }]}>
            <Text style={styles.endpointLabel}>{isCar ? 'DESTINATION' : 'TO'}</Text>
            <Text style={[styles.endpointCity, { textAlign: 'right' }]} numberOfLines={2}>
              {transport.destination}
            </Text>
          </View>
        </View>

        {/* Meta Grid */}
        <View style={styles.metaRow}>
          <MetaItem label="DATE" value={dateRange} styles={styles} />
          {transport.operatorName ? (
            <MetaItem label={isCar ? 'COMPANY' : 'OPERATOR'} value={transport.operatorName} styles={styles} />
          ) : null}
          {transport.seatOrVehicle ? (
            <MetaItem label={isCar ? 'VEHICLE' : 'COACH / SEAT'} value={transport.seatOrVehicle} styles={styles} />
          ) : null}
          {transport.referenceCode ? (
            <MetaItem label="REF / PNR" value={transport.referenceCode} styles={styles} />
          ) : null}
        </View>

        {transport.notes ? (
          <View style={[styles.noteStrip, { backgroundColor: meta.bg }]}>
            <Text style={[styles.noteText, { color: meta.color }]} numberOfLines={2}>
              {transport.notes}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Footer: Cost + Live Fuel Summary & 1-tap Fuel Shortcut for Car Trips */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: isCar
              ? isDark
                ? colors.amberSoft
                : '#FFFBEB'
              : isDark
                ? colors.surfaceMuted
                : '#F8FAFC',
          },
        ]}
      >
        {isCar ? (
          <View style={styles.carFooterRow}>
            <View style={{ flex: 1 }}>
              {transport.costAmount && transport.costAmount > 0 ? (
                <Text style={styles.costLine}>
                  Rental: {formatMoney(transport.costAmount, transport.currency || homeCurrency)}
                </Text>
              ) : null}
              <Text style={styles.fuelSummaryText}>
                ⛽ Fuel & Tolls:{' '}
                {fuelCount > 0
                  ? `${formatMoney(fuelSpentHome, homeCurrency)} (${fuelCount} ${fuelCount === 1 ? 'log' : 'logs'})`
                  : 'None logged yet'}
              </Text>
            </View>
            {onLogFuel ? (
              <TouchableOpacity onPress={onLogFuel} style={styles.fuelBtn} activeOpacity={0.85}>
                <Text style={styles.fuelBtnText}>+ ⛽ Log Fuel</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.rowBetween}>
            <Text style={styles.footerLabel}>
              {transport.operatorName || `${meta.label} Ticket`}
            </Text>
            <Text style={styles.footerCost}>
              {transport.costAmount && transport.costAmount > 0
                ? formatMoney(transport.costAmount, transport.currency || homeCurrency)
                : 'Logged ✓'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

type TransportStyles = ReturnType<typeof createStyles>;

const MetaItem = ({ label, value, styles }: { label: string; value: string; styles: TransportStyles }) => (
  <View>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const createStyles = (COLORS: ThemeColors, SHADOWS: ThemeShadows) =>
  StyleSheet.create({
    card: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
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
      gap: 8,
    },
    headerTitle: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: 13,
      flex: 1,
    },
    modeBadge: {
      backgroundColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 99,
    },
    modeBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 12,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    endpoint: {
      flex: 1.15,
    },
    endpointLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: COLORS.inkSoft,
      letterSpacing: 0.6,
    },
    endpointCity: {
      fontSize: 16,
      fontWeight: '900',
      color: COLORS.ink,
      marginTop: 2,
    },
    midCol: {
      flex: 0.9,
      alignItems: 'center',
      paddingHorizontal: 6,
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
    },
    modeMini: {
      position: 'absolute',
      backgroundColor: COLORS.card,
      paddingHorizontal: 4,
      fontSize: 14,
    },
    distanceText: {
      fontSize: 11,
      color: COLORS.inkMuted,
      fontWeight: '700',
      marginTop: 4,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: COLORS.borderSoft,
    },
    metaLabel: {
      fontSize: 9,
      color: COLORS.inkSoft,
      fontWeight: '700',
    },
    metaValue: {
      fontSize: 12,
      color: COLORS.ink,
      fontWeight: '800',
      marginTop: 2,
      maxWidth: 140,
    },
    noteStrip: {
      marginTop: 10,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    noteText: {
      fontSize: 11,
      fontWeight: '700',
    },
    footer: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: COLORS.borderSoft,
    },
    footerLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: COLORS.inkMuted,
      flex: 1,
    },
    footerCost: {
      fontSize: 12,
      fontWeight: '900',
      color: COLORS.ink,
    },
    carFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    costLine: {
      fontSize: 11,
      fontWeight: '800',
      color: COLORS.ink,
    },
    fuelSummaryText: {
      fontSize: 11,
      fontWeight: '700',
      color: COLORS.amberText,
    },
    fuelBtn: {
      backgroundColor: COLORS.amberSoft,
      borderWidth: 1,
      borderColor: COLORS.amberBorder,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 99,
    },
    fuelBtnText: {
      fontSize: 11,
      fontWeight: '900',
      color: COLORS.amberText,
    },
  });
