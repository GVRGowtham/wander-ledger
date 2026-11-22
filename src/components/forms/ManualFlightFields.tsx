import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AirportInfo,
  calculateDistanceMiles,
  estimateFlightDurationMinutes,
  formatDuration,
} from '../../db/airportsData';
import {
  parseFlightNumberInput,
  resolveAirportOrCity,
  searchAirports,
} from '../../services/manualFlightBuilder';
import { COLORS } from '../../theme/tokens';
import { DatePickerField } from './DatePickerField';

export interface ManualFlightDraft {
  flightNumber: string;
  airlineName: string;
  originInput: string;
  destInput: string;
  flightDate: string;
  departureTimeHm: string;
  arrivalTimeHm: string;
  cabinClass: string;
  seat: string;
  pnr: string;
  terminal: string;
  gate: string;
  aircraft: string;
  milesEarned: string;
  frequentFlyerNumber: string;
  ticketPrice: string;
  ticketCurrency: string;
  addReturnFlight: boolean;
  returnDate: string;
  returnFlightNumber: string;
}

export function createEmptyFlightDraft(
  defaultDate: string,
  defaultReturnDate: string,
  defaultCurrency: string,
  defaultDest = ''
): ManualFlightDraft {
  return {
    flightNumber: '',
    airlineName: '',
    originInput: '',
    destInput: defaultDest,
    flightDate: defaultDate,
    departureTimeHm: '',
    arrivalTimeHm: '',
    cabinClass: '',
    seat: '',
    pnr: '',
    terminal: '',
    gate: '',
    aircraft: '',
    milesEarned: '',
    frequentFlyerNumber: '',
    ticketPrice: '',
    ticketCurrency: defaultCurrency || 'USD',
    addReturnFlight: false,
    returnDate: defaultReturnDate,
    returnFlightNumber: '',
  };
}

export function hasAnyFlightDraftData(d: ManualFlightDraft): boolean {
  return Boolean(
    d.flightNumber.trim() ||
      d.airlineName.trim() ||
      d.originInput.trim() ||
      d.destInput.trim() ||
      d.pnr.trim()
  );
}

const CABINS = ['Economy', 'Premium Eco', 'Business', 'First'];

interface Props {
  draft: ManualFlightDraft;
  onChange: (next: ManualFlightDraft) => void;
  onDestinationAirportPicked?: (ap: AirportInfo) => void;
}

export const ManualFlightFields: React.FC<Props> = ({
  draft,
  onChange,
  onDestinationAirportPicked,
}) => {
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const patch = (p: Partial<ManualFlightDraft>) => onChange({ ...draft, ...p });

  const parsedNum = useMemo(
    () => parseFlightNumberInput(draft.flightNumber),
    [draft.flightNumber]
  );

  const originSuggestions = useMemo(
    () => (originFocused ? searchAirports(draft.originInput, 4) : []),
    [originFocused, draft.originInput]
  );

  const destSuggestions = useMemo(
    () => (destFocused ? searchAirports(draft.destInput, 4) : []),
    [destFocused, draft.destInput]
  );

  const routePreview = useMemo(() => {
    const o = resolveAirportOrCity(draft.originInput);
    const d = resolveAirportOrCity(draft.destInput);
    if (!o?.airport || !d?.airport) return null;
    if (o.airport.iata === d.airport.iata) return null;
    const miles = calculateDistanceMiles(
      o.airport.lat,
      o.airport.lng,
      d.airport.lat,
      d.airport.lng
    );
    const dur = estimateFlightDurationMinutes(miles);
    return {
      label: `${o.airport.iata} → ${d.airport.iata}`,
      miles,
      durationText: formatDuration(dur),
    };
  }, [draft.originInput, draft.destInput]);

  const handleFlightNumberChange = (val: string) => {
    const parsed = parseFlightNumberInput(val);
    const prevParsed = parseFlightNumberInput(draft.flightNumber);
    const shouldAutoFillAirline =
      !draft.airlineName.trim() ||
      (prevParsed && draft.airlineName.trim() === prevParsed.airlineName);

    patch({
      flightNumber: val,
      airlineName: parsed && shouldAutoFillAirline ? parsed.airlineName : draft.airlineName,
    });
  };

  const handleSwapEndpoints = () => {
    patch({
      originInput: draft.destInput,
      destInput: draft.originInput,
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Lost your boarding pass? Fill whatever you remember — even just a flight #, airline, or route!
      </Text>

      {/* Flight # + Airline */}
      <View style={styles.twoCol}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Flight # (Optional)</Text>
          <TextInput
            value={draft.flightNumber}
            onChangeText={handleFlightNumberChange}
            placeholder="e.g. 6E 412, NH 105"
            placeholderTextColor={COLORS.inkSoft}
            autoCapitalize="characters"
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1.2 }}>
          <Text style={styles.label}>Airline (Optional)</Text>
          <TextInput
            value={draft.airlineName}
            onChangeText={(v) => patch({ airlineName: v })}
            placeholder="e.g. IndiGo, ANA, Delta"
            placeholderTextColor={COLORS.inkSoft}
            style={styles.input}
          />
        </View>
      </View>

      {parsedNum && (
        <View style={styles.detectedPill}>
          <Text style={styles.detectedText}>
            ✨ Detected: {parsedNum.airlineName} • {parsedNum.loyaltyProgram}
          </Text>
        </View>
      )}

      {/* From -> To with offline airport autocomplete */}
      <View style={styles.routeInputRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>From (Airport / City)</Text>
          <TextInput
            value={draft.originInput}
            onChangeText={(v) => patch({ originInput: v })}
            onFocus={() => setOriginFocused(true)}
            onBlur={() => setTimeout(() => setOriginFocused(false), 180)}
            placeholder="BLR, LAX, Bengaluru..."
            placeholderTextColor={COLORS.inkSoft}
            style={styles.input}
          />
        </View>

        <TouchableOpacity
          onPress={handleSwapEndpoints}
          style={styles.swapBtn}
          activeOpacity={0.8}
        >
          <Text style={styles.swapBtnText}>⇄</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.label}>To (Airport / City)</Text>
          <TextInput
            value={draft.destInput}
            onChangeText={(v) => patch({ destInput: v })}
            onFocus={() => setDestFocused(true)}
            onBlur={() => setTimeout(() => setDestFocused(false), 180)}
            placeholder="GOI, HND, Tokyo..."
            placeholderTextColor={COLORS.inkSoft}
            style={styles.input}
          />
        </View>
      </View>

      {originSuggestions.length > 0 && (
        <View style={styles.suggestBox}>
          {originSuggestions.map((ap) => (
            <TouchableOpacity
              key={`orig_${ap.iata}`}
              onPress={() => {
                patch({ originInput: `${ap.iata} - ${ap.city}` });
                setOriginFocused(false);
              }}
              style={styles.suggestItem}
            >
              <Text style={styles.suggestText}>
                {ap.flag} <Text style={styles.suggestCode}>{ap.iata}</Text> • {ap.city}, {ap.country}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {destSuggestions.length > 0 && (
        <View style={styles.suggestBox}>
          {destSuggestions.map((ap) => (
            <TouchableOpacity
              key={`dest_${ap.iata}`}
              onPress={() => {
                patch({ destInput: `${ap.iata} - ${ap.city}` });
                setDestFocused(false);
                onDestinationAirportPicked?.(ap);
              }}
              style={styles.suggestItem}
            >
              <Text style={styles.suggestText}>
                {ap.flag} <Text style={styles.suggestCode}>{ap.iata}</Text> • {ap.city}, {ap.country}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {routePreview && (
        <View style={styles.routeBadge}>
          <Text style={styles.routeBadgeText}>
            🗺️ {routePreview.label} • {routePreview.miles.toLocaleString()} mi • ~{routePreview.durationText} est.
          </Text>
        </View>
      )}

      {/* Flight Date + Optional Times */}
      <View style={styles.twoCol}>
        <View style={{ flex: 1.45 }}>
          <DatePickerField
            label="Flight Date"
            value={draft.flightDate}
            onChange={(v) => patch({ flightDate: v })}
            placeholder="Pick date"
            compact
          />
        </View>
        <View style={{ flex: 0.78 }}>
          <Text style={styles.label}>Dep Time</Text>
          <TextInput
            value={draft.departureTimeHm}
            onChangeText={(v) => patch({ departureTimeHm: v })}
            placeholder="14:30"
            placeholderTextColor={COLORS.inkSoft}
            style={styles.input}
          />
        </View>
        <View style={{ flex: 0.78 }}>
          <Text style={styles.label}>Arr Time</Text>
          <TextInput
            value={draft.arrivalTimeHm}
            onChangeText={(v) => patch({ arrivalTimeHm: v })}
            placeholder="17:45"
            placeholderTextColor={COLORS.inkSoft}
            style={styles.input}
          />
        </View>
      </View>

      {/* Expandable extra details */}
      <TouchableOpacity
        onPress={() => setShowMore(!showMore)}
        style={styles.moreToggle}
        activeOpacity={0.8}
      >
        <Text style={styles.moreToggleText}>
          {showMore
            ? '▲ Hide extra flight details'
            : '➕ More I remember (Seat, PNR, Cabin, Return leg, Price...)'}
        </Text>
      </TouchableOpacity>

      {showMore && (
        <View style={styles.moreSection}>
          <Text style={styles.label}>Cabin Class</Text>
          <View style={styles.cabinRow}>
            {CABINS.map((c) => {
              const active = draft.cabinClass === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => patch({ cabinClass: active ? '' : c })}
                  style={[styles.cabinChip, active && styles.cabinChipActive]}
                >
                  <Text style={[styles.cabinText, active && styles.cabinTextActive]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Seat</Text>
              <TextInput
                value={draft.seat}
                onChangeText={(v) => patch({ seat: v })}
                placeholder="e.g. 14A"
                placeholderTextColor={COLORS.inkSoft}
                autoCapitalize="characters"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PNR / Booking Ref</Text>
              <TextInput
                value={draft.pnr}
                onChangeText={(v) => patch({ pnr: v })}
                placeholder="e.g. 7X9K2P"
                placeholderTextColor={COLORS.inkSoft}
                autoCapitalize="characters"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Terminal</Text>
              <TextInput
                value={draft.terminal}
                onChangeText={(v) => patch({ terminal: v })}
                placeholder="e.g. T2"
                placeholderTextColor={COLORS.inkSoft}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Gate</Text>
              <TextInput
                value={draft.gate}
                onChangeText={(v) => patch({ gate: v })}
                placeholder="e.g. B12"
                placeholderTextColor={COLORS.inkSoft}
                autoCapitalize="characters"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1.3 }}>
              <Text style={styles.label}>Aircraft</Text>
              <TextInput
                value={draft.aircraft}
                onChangeText={(v) => patch({ aircraft: v })}
                placeholder="e.g. A320neo"
                placeholderTextColor={COLORS.inkSoft}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Miles Earned</Text>
              <TextInput
                value={draft.milesEarned}
                onChangeText={(v) => patch({ milesEarned: v })}
                placeholder={
                  routePreview ? `${routePreview.miles} (auto)` : 'Auto / optional'
                }
                placeholderTextColor={COLORS.inkSoft}
                keyboardType="numeric"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Frequent Flyer #</Text>
              <TextInput
                value={draft.frequentFlyerNumber}
                onChangeText={(v) => patch({ frequentFlyerNumber: v })}
                placeholder="Optional"
                placeholderTextColor={COLORS.inkSoft}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={{ flex: 1.3 }}>
              <Text style={styles.label}>Ticket Cost (Logs to Spend)</Text>
              <TextInput
                value={draft.ticketPrice}
                onChangeText={(v) => patch({ ticketPrice: v })}
                placeholder="Optional, e.g. 420"
                placeholderTextColor={COLORS.inkSoft}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
            <View style={{ flex: 0.7 }}>
              <Text style={styles.label}>Currency</Text>
              <TextInput
                value={draft.ticketCurrency}
                onChangeText={(v) => patch({ ticketCurrency: v.toUpperCase() })}
                placeholder="USD"
                autoCapitalize="characters"
                maxLength={3}
                style={[styles.input, { textAlign: 'center' }]}
              />
            </View>
          </View>

          {/* Return Flight Toggle */}
          <View style={styles.returnBox}>
            <View style={styles.returnRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.returnTitle}>🔁 Also log Return Flight</Text>
                <Text style={styles.returnSub}>
                  Automatically reverses From ↔ To on your return date
                </Text>
              </View>
              <Switch
                value={draft.addReturnFlight}
                onValueChange={(val) => patch({ addReturnFlight: val })}
                trackColor={{ false: '#D6D3D1', true: '#7DD3FC' }}
                thumbColor={draft.addReturnFlight ? COLORS.sky : '#FFFFFF'}
              />
            </View>

            {draft.addReturnFlight && (
              <View style={[styles.twoCol, { marginTop: 8 }]}>
                <View style={{ flex: 1.15 }}>
                  <DatePickerField
                    label="Return Date"
                    value={draft.returnDate}
                    onChange={(v) => patch({ returnDate: v })}
                    placeholder="Pick date"
                    backgroundColor="#FFFFFF"
                    compact
                  />
                </View>
                <View style={{ flex: 0.9 }}>
                  <Text style={styles.label}>Return Flight #</Text>
                  <TextInput
                    value={draft.returnFlightNumber}
                    onChangeText={(v) => patch({ returnFlightNumber: v })}
                    placeholder="Optional"
                    placeholderTextColor={COLORS.inkSoft}
                    autoCapitalize="characters"
                    style={[styles.input, { backgroundColor: '#FFFFFF' }]}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { fontSize: 11, color: COLORS.inkMuted, lineHeight: 16 },
  twoCol: { flexDirection: 'row', gap: 8 },
  routeInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  swapBtn: {
    width: 34,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.skySoft,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapBtnText: { fontSize: 16, fontWeight: '900', color: '#0369A1' },
  label: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.ink,
    fontWeight: '600',
  },
  detectedPill: {
    backgroundColor: COLORS.emeraldSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  detectedText: { fontSize: 11, fontWeight: '800', color: '#047857' },
  suggestBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    overflow: 'hidden',
  },
  suggestItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestText: { fontSize: 12, color: COLORS.ink, fontWeight: '600' },
  suggestCode: { fontWeight: '900', color: '#0369A1' },
  routeBadge: {
    backgroundColor: COLORS.skySoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  routeBadgeText: { fontSize: 11, fontWeight: '800', color: '#0369A1' },
  moreToggle: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.amberSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    marginTop: 4,
  },
  moreToggleText: { fontSize: 12, fontWeight: '800', color: '#92400E', textAlign: 'center', lineHeight: 17 },
  moreSection: { gap: 10, paddingTop: 4 },
  cabinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cabinChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cabinChipActive: { backgroundColor: COLORS.sky, borderColor: COLORS.sky },
  cabinText: { fontSize: 12, fontWeight: '700', color: COLORS.inkMuted },
  cabinTextActive: { color: '#FFFFFF', fontWeight: '900' },
  returnBox: {
    backgroundColor: COLORS.skySoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 12,
  },
  returnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  returnTitle: { fontSize: 12, fontWeight: '800', color: '#0369A1' },
  returnSub: { fontSize: 11, color: '#0C4A6E', marginTop: 2 },
});
