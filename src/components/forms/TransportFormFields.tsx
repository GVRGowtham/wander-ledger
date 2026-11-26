import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme, useThemedStyles } from '../../context/ThemeContext';
import { ThemeColors, TRANSPORT_MODE_META } from '../../theme/tokens';
import { DistanceUnit, TransportMode } from '../../types/models';

export interface TransportDraft {
  mode: TransportMode;
  title: string;
  operatorName: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  referenceCode: string;
  seatOrVehicle: string;
  distanceInput: string;
  costAmount: string;
  currency: string;
  payLater?: boolean;
  notes: string;
}

interface Props {
  draft: TransportDraft;
  onChange: (patch: Partial<TransportDraft>) => void;
  distanceUnit: DistanceUnit;
}

const MODES: TransportMode[] = ['train', 'bus', 'ferry', 'rental_car', 'own_car'];

export const TransportFormFields: React.FC<Props> = ({
  draft,
  onChange,
  distanceUnit,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isCar = draft.mode === 'rental_car' || draft.mode === 'own_car';
  const isOwnCar = draft.mode === 'own_car';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>TRAVEL MODE</Text>
      <View style={styles.modeWrap}>
        {MODES.map((m) => {
          const meta = TRANSPORT_MODE_META[m];
          const active = draft.mode === m;
          return (
            <TouchableOpacity
              key={m}
              onPress={() => onChange({ mode: m })}
              style={[
                styles.modeChip,
                active && { backgroundColor: meta.color, borderColor: meta.color },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeChipText, active && { color: '#FFFFFF' }]}>
                {meta.emoji} {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{isCar ? 'START / PICKUP CITY' : 'FROM (STATION / CITY)'}</Text>
          <TextInput
            value={draft.origin}
            onChangeText={(v) => onChange({ origin: v })}
            placeholder={isCar ? 'e.g. Bengaluru' : 'e.g. Zurich HB'}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{isCar ? 'DESTINATION CITY' : 'TO (STATION / CITY)'}</Text>
          <TextInput
            value={draft.destination}
            onChangeText={(v) => onChange({ destination: v })}
            placeholder={isCar ? 'e.g. Coorg' : 'e.g. Lucerne'}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>
      </View>

      <Text style={styles.label}>
        {isOwnCar
          ? 'ROAD TRIP / CAR NAME'
          : draft.mode === 'rental_car'
          ? 'RENTAL COMPANY & CAR'
          : 'TRAIN / OPERATOR NAME'}
      </Text>
      <TextInput
        value={draft.title}
        onChangeText={(v) => onChange({ title: v })}
        placeholder={
          isOwnCar
            ? 'e.g. Road Trip in Honda City'
            : draft.mode === 'rental_car'
            ? 'e.g. Sixt VW Golf'
            : 'e.g. SBB InterCity 8 / Vande Bharat'
        }
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>START DATE</Text>
          <TextInput
            value={draft.startDate}
            onChangeText={(v) => onChange({ startDate: v })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{isCar ? 'RETURN / END DATE' : 'ARRIVAL DATE (OPT.)'}</Text>
          <TextInput
            value={draft.endDate}
            onChangeText={(v) => onChange({ endDate: v })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>
            EST. DISTANCE ({distanceUnit.toUpperCase()}, OPT.)
          </Text>
          <TextInput
            value={draft.distanceInput}
            onChangeText={(v) => onChange({ distanceInput: v })}
            placeholder={distanceUnit === 'mi' ? 'e.g. 160' : 'e.g. 260'}
            keyboardType="numeric"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{isCar ? 'VEHICLE / PLATE (OPT.)' : 'COACH / SEAT (OPT.)'}</Text>
          <TextInput
            value={draft.seatOrVehicle}
            onChangeText={(v) => onChange({ seatOrVehicle: v })}
            placeholder={isCar ? 'e.g. SUV / Automatic' : 'e.g. B4 • 32'}
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
          />
        </View>
      </View>

      {!isOwnCar && (
        <View style={styles.row}>
          <View style={{ flex: 1.2 }}>
            <Text style={styles.label}>TICKET / RENTAL COST (OPT.)</Text>
            <TextInput
              value={draft.costAmount}
              onChangeText={(v) => onChange({ costAmount: v })}
              placeholder="e.g. 145"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 0.8 }}>
            <Text style={styles.label}>CURRENCY</Text>
            <TextInput
              value={draft.currency}
              onChangeText={(v) => onChange({ currency: v.toUpperCase() })}
              autoCapitalize="characters"
              maxLength={4}
              placeholder="CHF"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>PNR / REF</Text>
            <TextInput
              value={draft.referenceCode}
              onChangeText={(v) => onChange({ referenceCode: v })}
              autoCapitalize="characters"
              placeholder="Optional"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
            />
          </View>
        </View>
      )}

      {!isOwnCar &&
        parseFloat(draft.costAmount) > 0 &&
        draft.startDate.trim().slice(0, 10) > new Date().toISOString().slice(0, 10) && (
          <View style={{ gap: 4 }}>
            <Text style={styles.label}>PAYMENT TIMING (FOR FX RATE)</Text>
            <View style={styles.modeWrap}>
              <TouchableOpacity
                onPress={() => onChange({ payLater: false })}
                style={[
                  styles.modeChip,
                  !draft.payLater && { backgroundColor: colors.indigo, borderColor: colors.indigo },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeChipText, !draft.payLater && { color: '#FFFFFF' }]}>
                  🔒 Paid now (lock today’s rate)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onChange({ payLater: true })}
                style={[
                  styles.modeChip,
                  draft.payLater && { backgroundColor: colors.coral, borderColor: colors.coral },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeChipText, draft.payLater && { color: '#FFFFFF' }]}>
                  ⏳ Pay at pickup (live rate)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      {isOwnCar && (
        <View style={styles.tipBox}>
          <Text style={styles.tipText}>
            ⛽ Tip: After saving, tap "+ ⛽ Log Fuel" right on this card (or scan any petrol / toll bill) to track road-trip fuel spend!
          </Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (COLORS: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    label: {
      fontSize: 10,
      fontWeight: '800',
      color: COLORS.inkMuted,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    modeWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    modeChip: {
      backgroundColor: COLORS.canvas,
      borderWidth: 1,
      borderColor: COLORS.border,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 99,
    },
    modeChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: COLORS.ink,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    input: {
      backgroundColor: COLORS.canvas,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.ink,
    },
    tipBox: {
      backgroundColor: COLORS.amberSoft,
      borderWidth: 1,
      borderColor: COLORS.amberBorder,
      borderRadius: 12,
      padding: 10,
    },
    tipText: {
      fontSize: 11,
      fontWeight: '700',
      color: COLORS.amberText,
      lineHeight: 16,
    },
  });
