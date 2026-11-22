import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { COLORS, SHADOWS } from '../theme/tokens';

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD'];

const HOW_IT_WORKS = [
  {
    emoji: '📷',
    title: 'Smart Magic Scan',
    desc: 'Auto-scan boarding pass barcodes live, or snap booking confirmations & receipts offline.',
    bg: '#FFF7ED',
    border: '#FED7AA',
  },
  {
    emoji: '📸',
    title: 'Polaroid Memories & IG Studio',
    desc: 'Save clean photo stories and turn them into Instagram collages, carousels & draft captions.',
    bg: '#FFF1F2',
    border: '#FECDD3',
  },
  {
    emoji: '🧾',
    title: 'Private Spend & Miles',
    desc: 'Multi-currency bills stay tucked privately in Spend while flight miles & points track automatically.',
    bg: '#ECFDF5',
    border: '#A7F3D0',
  },
  {
    emoji: '🗺️',
    title: 'World Map & Passport',
    desc: 'Watch geodesic flight arcs, earn ink country stamps, and share family-safe postcards.',
    bg: '#F0F9FF',
    border: '#BAE6FD',
  },
];

interface Props {
  isRevisit?: boolean;
  onDone?: () => void;
}

export const WelcomeScreen: React.FC<Props> = ({ isRevisit = false, onDone }) => {
  const { profile, startLocalTravelogue, updateProfileSettings } = useApp();
  const keyboardHeight = useKeyboardHeight();
  const [homeCurrency, setHomeCurrency] = useState(profile?.homeCurrency || 'USD');
  const [firstName, setFirstName] = useState(
    profile && profile.displayName !== 'Wanderer' ? profile.displayName : ''
  );
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      if (isRevisit && profile) {
        const cleanName = firstName.trim() || 'Wanderer';
        const initials = cleanName.slice(0, 2).toUpperCase() || 'WL';
        await updateProfileSettings({
          displayName: cleanName,
          avatarInitials: initials,
          homeCurrency,
        });
        onDone?.();
      } else {
        await startLocalTravelogue(homeCurrency, firstName);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        keyboardHeight > 0 && { paddingBottom: keyboardHeight + 56 },
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      {/* Joyful Illustrated Welcome Postcard */}
      <View style={styles.heroCard}>
        <DestinationBanner vibe="japan" height={158} />
        <View style={styles.heroBody}>
          <View style={styles.logoBadge}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.brandTitle}>Welcome to WanderLedger</Text>
          <Text style={styles.tagline}>
            Your sunlit pocket travelogue — every boarding pass, mile earned, restaurant bill & Polaroid memory in one happy place.
          </Text>
        </View>
      </View>

      {/* Quick Visual Overview: How to Use */}
      <View style={styles.guideSection}>
        <Text style={styles.sectionLabel}>✨ HOW IT WORKS</Text>
        {HOW_IT_WORKS.map((item) => (
          <View
            key={item.title}
            style={[
              styles.guideCard,
              { backgroundColor: item.bg, borderColor: item.border },
            ]}
          >
            <View style={styles.guideIconWrap}>
              <Text style={styles.guideEmoji}>{item.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guideTitle}>{item.title}</Text>
              <Text style={styles.guideDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Optional First Name + Home Currency */}
      <View style={styles.setupCard}>
        <Text style={styles.setupTitle}>Quick Setup (Optional)</Text>

        <Text style={styles.fieldLabel}>Your First Name (Optional)</Text>
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Skip to go by Wanderer ✨"
          placeholderTextColor={COLORS.inkSoft}
          autoCapitalize="words"
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Home Currency 💱</Text>
        <View style={styles.currencyWrap}>
          {CURRENCIES.map((c) => {
            const active = c === homeCurrency;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => setHomeCurrency(c)}
                style={[styles.currChip, active && styles.currChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.currText, active && styles.currTextActive]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Single Primary CTA */}
      <TouchableOpacity onPress={handleStart} disabled={loading} activeOpacity={0.9}>
        <LinearGradient
          colors={['#F97316', '#F43F5E', '#EC4899']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaBtn}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaBtnText}>
              {isRevisit ? '✈️ Back to My Travelogue' : "✈️ Let's Capture Travel"}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.footnote}>
        Works 100% offline in airplane mode • Your trips, photos & receipts stay private on your device ✨
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  content: {
    padding: 18,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 16,
  },
  heroCard: {
    backgroundColor: COLORS.card,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    ...SHADOWS.card,
  },
  heroBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -36,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: '#0EA5E9',
    ...SHADOWS.fab,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.ink,
    marginTop: 10,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    color: COLORS.inkMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },

  guideSection: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.coralDark,
    letterSpacing: 1,
    paddingLeft: 4,
  },
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
  },
  guideIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideEmoji: {
    fontSize: 20,
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.ink,
  },
  guideDesc: {
    fontSize: 12,
    color: COLORS.inkMuted,
    lineHeight: 17,
    marginTop: 2,
  },

  setupCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...SHADOWS.card,
  },
  setupTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.ink,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.inkMuted,
    marginTop: 2,
  },
  input: {
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    color: COLORS.ink,
    fontWeight: '600',
  },
  currencyWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currChipActive: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral,
  },
  currText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.inkMuted,
  },
  currTextActive: {
    color: '#FFFFFF',
  },

  ctaBtn: {
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.fab,
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  footnote: {
    fontSize: 12,
    color: COLORS.inkSoft,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
});
