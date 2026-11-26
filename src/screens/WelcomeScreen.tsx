import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { DriveBackupMetadata, formatBytes } from '../services/driveBackupHelpers';
import { COLORS, SHADOWS } from '../theme/tokens';
import { DistanceUnit, UserProfile } from '../types/models';

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD'];

const HOW_IT_WORKS = [
  {
    emoji: '📷',
    title: 'Smart Magic Scan',
    desc: 'Scan boarding passes, train tickets, car rentals, hotel PDFs & fuel/food receipts offline.',
    bg: '#FFF7ED',
    border: '#FED7AA',
  },
  {
    emoji: '📸',
    title: 'Polaroid Memories & IG Studio',
    desc: 'Tag memories to trip stops and turn them into Instagram collages, carousels & draft captions.',
    bg: '#FFF1F2',
    border: '#FECDD3',
  },
  {
    emoji: '🧾',
    title: 'Private Spend, Fuel & Miles',
    desc: 'Multi-currency bills & petrol logs stay tucked privately in Spend while miles track automatically.',
    bg: '#ECFDF5',
    border: '#A7F3D0',
  },
  {
    emoji: '☁️',
    title: 'Personal Google Drive Backup',
    desc: 'Offline-first by default, with optional private backup & restore straight to your own Google Drive.',
    bg: '#F0F9FF',
    border: '#BAE6FD',
  },
];

interface Props {
  isRevisit?: boolean;
  onDone?: () => void;
}

interface PendingGoogleRestore {
  profile: UserProfile;
  remoteBackup: DriveBackupMetadata;
  accessToken: string;
}

function formatBackupDate(iso?: string): string {
  if (!iso) return 'Recently';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export const WelcomeScreen: React.FC<Props> = ({ isRevisit = false, onDone }) => {
  const {
    profile,
    driveBusyMode,
    driveProgress,
    startLocalTravelogue,
    updateProfileSettings,
    signInWithGoogleAccount,
    commitGoogleProfile,
    restoreFromGoogleDrive,
  } = useApp();
  const keyboardHeight = useKeyboardHeight();
  const [homeCurrency, setHomeCurrency] = useState(profile?.homeCurrency || 'USD');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(profile?.distanceUnit || 'km');
  const [firstName, setFirstName] = useState(
    profile && profile.displayName !== 'Wanderer' ? profile.displayName : ''
  );
  const [loadingOffline, setLoadingOffline] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<PendingGoogleRestore | null>(null);

  const isGoogleBusy =
    driveBusyMode === 'signing_in' ||
    driveBusyMode === 'checking' ||
    driveBusyMode === 'restoring';

  const handleStartOffline = async () => {
    setLoadingOffline(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      if (isRevisit && profile) {
        const cleanName = firstName.trim() || 'Wanderer';
        const initials = cleanName.slice(0, 2).toUpperCase() || 'WL';
        await updateProfileSettings({
          displayName: cleanName,
          avatarInitials: initials,
          homeCurrency,
          distanceUnit,
        });
        onDone?.();
      } else {
        await startLocalTravelogue(homeCurrency, firstName, distanceUnit);
      }
    } finally {
      setLoadingOffline(false);
    }
  };

  const handleContinueWithGoogle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const outcome = await signInWithGoogleAccount({
      homeCurrency,
      distanceUnit,
      deferCommitIfBackupFound: true,
    });

    if (outcome.status === 'cancelled') {
      return;
    }
    if (outcome.status === 'error') {
      Alert.alert(
        'Google Sign-In Unavailable',
        `${outcome.message}\n\nNo worries — you can tap "Continue Offline" right now and connect Google Drive anytime from Passport.`
      );
      return;
    }

    // Respect manually typed first name if user entered one before tapping Google
    const customName = firstName.trim();
    const finalProfile: UserProfile = customName
      ? {
          ...outcome.profile,
          displayName: customName,
          avatarInitials: customName.slice(0, 2).toUpperCase() || 'WL',
        }
      : outcome.profile;

    if (outcome.deferred && outcome.remoteBackup.exists) {
      setFirstName(finalProfile.displayName);
      setPendingRestore({
        profile: finalProfile,
        remoteBackup: outcome.remoteBackup,
        accessToken: outcome.accessToken,
      });
    } else if (customName) {
      await commitGoogleProfile(finalProfile);
    }
  };

  const handleRestoreFromPending = async () => {
    if (!pendingRestore) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const res = await restoreFromGoogleDrive('replace', pendingRestore.accessToken);
    if (res.status === 'success') {
      await commitGoogleProfile(pendingRestore.profile);
    } else {
      Alert.alert(
        'Restore Paused',
        res.error || 'Could not finish downloading your backup right now. You can retry anytime from Passport.'
      );
    }
  };

  const handleStartFreshFromPending = async () => {
    if (!pendingRestore) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await commitGoogleProfile(pendingRestore.profile);
  };

  // Celebratory Restore View when a returning traveler signs in with Google on a fresh device
  if (pendingRestore) {
    const rb = pendingRestore.remoteBackup;
    const restoring = driveBusyMode === 'restoring';
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <DestinationBanner vibe="coastal" height={158} />
          <View style={styles.heroBody}>
            <View style={styles.logoBadge}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.brandTitle}>
              Welcome back, {pendingRestore.profile.displayName}! 🎉
            </Text>
            <Text style={styles.tagline}>
              We found your private Wanderer&apos;s Ledger backup in Google Drive ({pendingRestore.profile.email}).
            </Text>
          </View>
        </View>

        <View style={styles.restoreFoundCard}>
          <View style={styles.restoreBadge}>
            <Text style={styles.restoreBadgeText}>☁️ BACKUP FOUND IN GOOGLE DRIVE</Text>
          </View>
          <Text style={styles.restoreHeadline}>
            {rb.tripsCount} {rb.tripsCount === 1 ? 'Trip' : 'Trips'} • {rb.memoriesCount}{' '}
            {rb.memoriesCount === 1 ? 'Memory' : 'Memories'}
          </Text>
          <Text style={styles.restoreMeta}>
            {rb.mediaCount} compressed {rb.mediaCount === 1 ? 'photo/receipt' : 'photos & receipts'}
            {rb.totalMediaBytes > 0 ? ` (${formatBytes(rb.totalMediaBytes)})` : ''} • Last backed up{' '}
            {formatBackupDate(rb.updatedAt)}
          </Text>

          {restoring && driveProgress ? (
            <View style={styles.progressBox}>
              <ActivityIndicator color={COLORS.coral} size="small" />
              <Text style={styles.progressText}>{driveProgress.label}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={handleRestoreFromPending}
            disabled={restoring}
            activeOpacity={0.9}
            style={styles.fullWidthBtn}
          >
            <LinearGradient
              colors={['#F97316', '#F43F5E', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              {restoring ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={styles.ctaBtnText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  📥 Restore My Travelogue
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleStartFreshFromPending}
            disabled={restoring}
            style={styles.secondaryGhostBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryGhostBtnText} numberOfLines={2}>
              ✨ Start Fresh (Keep Cloud Backup)
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footnote}>
          Auto-backup stays off until you enable it in Passport — your existing Drive backup will never be overwritten without your consent.
        </Text>
      </ScrollView>
    );
  }

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
          <Text style={styles.brandTitle}>Welcome to Wanderer&apos;s Ledger</Text>
          <Text style={styles.tagline}>
            Your sunlit pocket travelogue — every flight, train, road trip, hotel bill &amp; Polaroid memory in one happy place.
          </Text>
        </View>
      </View>

      {/* Primary Onboarding Choice (Google Drive Backup OR 100% Offline) */}
      {!isRevisit && (
        <View style={styles.authChoiceCard}>
          <TouchableOpacity
            onPress={handleContinueWithGoogle}
            disabled={isGoogleBusy || loadingOffline}
            style={styles.googleBtn}
            activeOpacity={0.88}
          >
            {isGoogleBusy ? (
              <View style={styles.googleBtnRow}>
                <ActivityIndicator color={COLORS.navy} size="small" />
                <Text style={[styles.googleBtnTitle, { flex: 1 }]}>
                  {driveProgress?.label || 'Signing in with Google…'}
                </Text>
              </View>
            ) : (
              <View style={styles.googleBtnRow}>
                <View style={styles.googleG}>
                  <Text style={styles.googleGText}>G</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.googleBtnTitle}>Continue with Google</Text>
                  <Text style={styles.googleBtnSub}>
                    Restore an existing backup or enable private Google Drive backup
                  </Text>
                </View>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR STAY 100% OFFLINE</Text>
            <View style={styles.orLine} />
          </View>

          <TouchableOpacity
            onPress={handleStartOffline}
            disabled={loadingOffline || isGoogleBusy}
            activeOpacity={0.9}
            style={styles.fullWidthBtn}
          >
            <LinearGradient
              colors={['#F97316', '#F43F5E', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              {loadingOffline ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={styles.ctaBtnText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  ✈️ Continue Offline (No Account)
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Optional First Name + Home Currency + Distance Unit */}
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

        <Text style={styles.fieldLabel}>Distance Unit 📏</Text>
        <View style={styles.currencyWrap}>
          {(
            [
              { id: 'km', label: 'Kilometers (km)' },
              { id: 'mi', label: 'Miles (mi)' },
            ] as const
          ).map((u) => {
            const active = distanceUnit === u.id;
            return (
              <TouchableOpacity
                key={u.id}
                onPress={() => setDistanceUnit(u.id)}
                style={[styles.currChip, active && styles.currChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.currText, active && styles.currTextActive]}>{u.label}</Text>
              </TouchableOpacity>
            );
          })}
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

      {isRevisit && (
        <TouchableOpacity
          onPress={handleStartOffline}
          disabled={loadingOffline}
          activeOpacity={0.9}
          style={styles.fullWidthBtn}
        >
          <LinearGradient
            colors={['#F97316', '#F43F5E', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaBtn}
          >
            {loadingOffline ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                style={styles.ctaBtnText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                ✈️ Back to My Travelogue
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      )}

      <Text style={styles.footnote}>
        Works 100% offline in airplane mode • Optional backups go strictly to your own hidden Google Drive app folder ✨
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

  authChoiceCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    gap: 12,
    ...SHADOWS.card,
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 13,
    ...SHADOWS.card,
  },
  googleBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  googleG: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2563EB',
  },
  googleBtnTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.ink,
  },
  googleBtnSub: {
    fontSize: 11.5,
    color: COLORS.inkMuted,
    marginTop: 1,
    lineHeight: 15,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  orText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.inkSoft,
    letterSpacing: 0.7,
  },

  restoreFoundCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    gap: 12,
    ...SHADOWS.card,
  },
  restoreBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  restoreBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  restoreHeadline: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.ink,
  },
  restoreMeta: {
    fontSize: 13,
    color: COLORS.inkMuted,
    lineHeight: 19,
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  progressText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.coralDark,
    flex: 1,
  },
  fullWidthBtn: {
    width: '100%',
  },
  secondaryGhostBtn: {
    width: '100%',
    backgroundColor: COLORS.canvas,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  secondaryGhostBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.inkMuted,
    textAlign: 'center',
    lineHeight: 18,
    width: '100%',
    includeFontPadding: false,
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
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...SHADOWS.fab,
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.2,
    textAlign: 'center',
    width: '100%',
    includeFontPadding: false,
  },
  footnote: {
    fontSize: 12,
    color: COLORS.inkSoft,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
});
