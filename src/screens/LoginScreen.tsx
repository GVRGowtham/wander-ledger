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
import { DestinationBanner } from '../components/banners/DestinationBanner';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../theme/tokens';

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD'];

export const LoginScreen: React.FC = () => {
  const { loginWithGoogle, cloudConfigured } = useApp();
  const [homeCurrency, setHomeCurrency] = useState('USD');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onContinue = async () => {
    setLoading(true);
    try {
      await loginWithGoogle(homeCurrency, email, name);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Joyful Illustrated Welcome Postcard */}
      <View style={styles.heroCard}>
        <DestinationBanner vibe="japan" height={165} />
        <View style={styles.heroBody}>
          <View style={styles.logoBadge}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.brandTitle}>WanderLedger</Text>
          <Text style={styles.tagline}>
            Every sunrise, boarding pass, mile earned & little memory — tucked in one happy travel journal.
          </Text>
        </View>
      </View>

      {/* 3 Delight Highlights */}
      <View style={styles.pillsRow}>
        <View style={[styles.pillCard, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Text style={styles.pillEmoji}>📷</Text>
          <Text style={styles.pillLabel}>Snap & Log</Text>
        </View>
        <View style={[styles.pillCard, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
          <Text style={styles.pillEmoji}>🗺️</Text>
          <Text style={styles.pillLabel}>World Map</Text>
        </View>
        <View style={[styles.pillCard, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
          <Text style={styles.pillEmoji}>💌</Text>
          <Text style={styles.pillLabel}>Share Trips</Text>
        </View>
      </View>

      {/* Quick Home Currency Selector */}
      <View style={styles.setupCard}>
        <Text style={styles.setupTitle}>Choose your Home Currency 💱</Text>
        <View style={styles.currencyWrap}>
          {CURRENCIES.map((c) => {
            const active = c === homeCurrency;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => setHomeCurrency(c)}
                style={[styles.currChip, active && styles.currChipActive]}
              >
                <Text style={[styles.currText, active && styles.currTextActive]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!cloudConfigured && (
          <View style={styles.localBox}>
            <Text style={styles.localTitle}>Traveler Profile (Offline / Test Build)</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your Name"
              placeholderTextColor={COLORS.inkSoft}
              style={styles.input}
            />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="your.email@gmail.com"
              placeholderTextColor={COLORS.inkSoft}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>
        )}
      </View>

      {/* Google Sign-In CTA */}
      <TouchableOpacity onPress={onContinue} disabled={loading} activeOpacity={0.9}>
        <LinearGradient
          colors={['#F97316', '#F43F5E', '#EC4899']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.googleBtn}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <View style={styles.gCircle}>
                <Text style={styles.gLetter}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.footnote}>
        {cloudConfigured
          ? 'Synced securely to your Google account • Works 100% offline in airplane mode ✨'
          : 'Works 100% offline now • Plug in Supabase Google OAuth keys anytime for cloud sync ✨'}
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
    padding: 20,
    paddingTop: 18,
    paddingBottom: 40,
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
    paddingBottom: 22,
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
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.ink,
    marginTop: 8,
    letterSpacing: -0.4,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.inkMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pillCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  pillEmoji: {
    fontSize: 20,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.ink,
  },
  setupCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  setupTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
  },
  currencyWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    fontWeight: '700',
    color: COLORS.inkMuted,
  },
  currTextActive: {
    color: '#FFFFFF',
  },
  localBox: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    gap: 8,
  },
  localTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.inkMuted,
  },
  input: {
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.ink,
    fontWeight: '600',
  },
  googleBtn: {
    borderRadius: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...SHADOWS.fab,
  },
  gCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: {
    fontWeight: '900',
    color: '#292524',
    fontSize: 13,
  },
  googleBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  footnote: {
    fontSize: 12,
    color: COLORS.inkSoft,
    textAlign: 'center',
    lineHeight: 17,
  },
});
