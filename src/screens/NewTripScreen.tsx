import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { DestinationBanner } from '../components/banners/DestinationBanner';
import { useApp } from '../context/AppContext';
import { inferDestinationVibe } from '../db/airportsData';
import { generateId } from '../db/database';
import { COLORS, SHADOWS } from '../theme/tokens';
import { TripVibe } from '../types/models';

interface Props {
  onBack: () => void;
  onCreated: (tripId: string) => void;
  onOpenScanner: () => void;
}

const VIBES: Array<{ id: TripVibe; label: string; emoji: string }> = [
  { id: 'japan', label: 'Japan', emoji: '🌸' },
  { id: 'coastal', label: 'Coastal', emoji: '🌊' },
  { id: 'alpine', label: 'Alpine', emoji: '🏔️' },
  { id: 'tropical', label: 'Tropical', emoji: '🏝️' },
  { id: 'desert', label: 'Desert', emoji: '🐪' },
  { id: 'city', label: 'City', emoji: '🌆' },
];

export const NewTripScreen: React.FC<Props> = ({
  onBack,
  onCreated,
  onOpenScanner,
}) => {
  const { profile, addTrip } = useApp();

  const today = new Date();
  const fmt = (offset: number) =>
    new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);

  const [destination, setDestination] = useState('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(fmt(7));
  const [endDate, setEndDate] = useState(fmt(14));
  const [budget, setBudget] = useState('2500');
  const [vibe, setVibe] = useState<TripVibe>('coastal');
  const [coTraveler, setCoTraveler] = useState('');

  const handleDestinationChange = (text: string) => {
    setDestination(text);
    if (text.trim().length >= 3) {
      const inferred = inferDestinationVibe(text);
      setVibe(inferred.vibe);
    }
  };

  const handleCreate = () => {
    const dest = destination.trim() || title.trim();
    if (!dest) {
      Alert.alert('Where are you headed?', 'Enter a destination city or country!');
      return;
    }
    const inferred = inferDestinationVibe(dest);
    const id = generateId('trip');
    const now = new Date().toISOString();
    const companions = coTraveler.trim() ? [coTraveler.trim()] : [];

    addTrip({
      id,
      ownerId: profile?.id || 'local_user',
      title: title.trim() || `${dest} Adventure`,
      destinationCity: dest,
      destinationCountry: inferred.country,
      countryCode: inferred.countryCode,
      flagEmoji: inferred.flag,
      startDate: startDate.trim() || fmt(0),
      endDate: endDate.trim() || fmt(5),
      homeCurrency: profile?.homeCurrency || 'USD',
      budget: parseFloat(budget) || 0,
      vibe,
      isShared: companions.length > 0,
      shareToken: companions.length > 0 ? `wl_${id.slice(-8)}` : undefined,
      coTravelers: companions,
      lat: inferred.lat,
      lng: inferred.lng,
      createdAt: now,
      updatedAt: now,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onCreated(id);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topRow}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>✨ Start a New Trip</Text>
        <View style={{ width: 56 }} />
      </View>

      {/* Live Preview of Dynamic Destination Postcard */}
      <View style={styles.previewCard}>
        <DestinationBanner vibe={vibe} height={118} />
        <View style={styles.previewOverlay}>
          <Text style={styles.previewLabel}>POSTCARD PREVIEW</Text>
          <Text style={styles.previewTitle}>
            {title.trim() || destination.trim() || 'Your Next Adventure'} ✈️
          </Text>
        </View>
      </View>

      {/* Scan-to-Create Magic Shortcut */}
      <TouchableOpacity onPress={onOpenScanner} activeOpacity={0.9}>
        <LinearGradient
          colors={['#F97316', '#F43F5E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.scanShortcut}
        >
          <Text style={{ fontSize: 24 }}>📷</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Scan Boarding Pass or Hotel Instead</Text>
            <Text style={styles.scanSub}>
              Camera auto-fills destination, dates & adds your booking!
            </Text>
          </View>
          <Text style={styles.scanArrow}>→</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Form Card */}
      <View style={styles.formCard}>
        <Text style={styles.label}>Destination City or Country</Text>
        <TextInput
          value={destination}
          onChangeText={handleDestinationChange}
          placeholder="e.g. Zurich, Bali, Kyoto, Lisbon, Goa"
          placeholderTextColor={COLORS.inkSoft}
          style={styles.input}
        />

        <Text style={styles.label}>Trip Name (Optional)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Swiss Alps Snow Week"
          placeholderTextColor={COLORS.inkSoft}
          style={styles.input}
        />

        <Text style={styles.label}>Postcard Vibe (Auto-matched, tap to customize)</Text>
        <View style={styles.vibeGrid}>
          {VIBES.map((v) => {
            const active = vibe === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => setVibe(v.id)}
                style={[styles.vibeChip, active && styles.vibeChipActive]}
              >
                <Text style={styles.vibeEmoji}>{v.emoji}</Text>
                <Text style={[styles.vibeText, active && styles.vibeTextActive]}>
                  {v.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-12-18"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-12-26"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>
              Target Budget ({profile?.homeCurrency || 'USD'})
            </Text>
            <TextInput
              value={budget}
              onChangeText={setBudget}
              keyboardType="numeric"
              placeholder="2500"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Co-Traveler (Optional)</Text>
            <TextInput
              value={coTraveler}
              onChangeText={setCoTraveler}
              placeholder="friend@gmail.com"
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
        </View>
      </View>

      <TouchableOpacity onPress={handleCreate} style={styles.createBtn} activeOpacity={0.9}>
        <Text style={styles.createBtnText}>Create Trip Postcard ✈️</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: 16, paddingBottom: 42, gap: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  backBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  headerTitle: { fontSize: 16, fontWeight: '900', color: COLORS.ink },

  previewCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    position: 'relative',
    ...SHADOWS.card,
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(28,25,23,0.48)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewLabel: { fontSize: 9, fontWeight: '900', color: '#FDE68A', letterSpacing: 0.8 },
  previewTitle: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },

  scanShortcut: {
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  scanTitle: { fontSize: 13, fontWeight: '900', color: '#FFFFFF' },
  scanSub: { fontSize: 11, color: '#FFEDD5', marginTop: 2 },
  scanArrow: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },

  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
  },
  label: { fontSize: 12, fontWeight: '800', color: COLORS.inkMuted, marginTop: 2 },
  input: {
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.ink,
    fontWeight: '600',
  },
  vibeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vibeChip: {
    width: '31%',
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 9,
    alignItems: 'center',
    gap: 2,
  },
  vibeChipActive: { backgroundColor: COLORS.coralSoft, borderColor: COLORS.coral, borderWidth: 2 },
  vibeEmoji: { fontSize: 18 },
  vibeText: { fontSize: 11, fontWeight: '700', color: COLORS.inkMuted },
  vibeTextActive: { color: COLORS.coralDark, fontWeight: '900' },
  twoCol: { flexDirection: 'row', gap: 10 },
  createBtn: {
    backgroundColor: COLORS.navy,
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  createBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
});
