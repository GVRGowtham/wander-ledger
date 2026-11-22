import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BottomSheetModal } from '../components/layout/BottomSheetModal';
import { useApp } from '../context/AppContext';
import { formatDistanceValue, milesToKm } from '../services/distanceUtils';
import { COLORS, SHADOWS } from '../theme/tokens';
import { DistanceUnit } from '../types/models';

const STAMP_STYLES = [
  { border: '#E11D48', bg: '#FFF1F2', text: '#BE123C', tilt: '-5deg' },
  { border: '#0284C7', bg: '#F0F9FF', text: '#0369A1', tilt: '4deg' },
  { border: '#059669', bg: '#ECFDF5', text: '#047857', tilt: '-3deg' },
  { border: '#7C3AED', bg: '#F5F3FF', text: '#6D28D9', tilt: '5deg' },
];

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'];

interface Props {
  onOpenWelcome: () => void;
}

export const PassportScreen: React.FC<Props> = ({ onOpenWelcome }) => {
  const {
    profile,
    trips,
    allFlights,
    allTransports,
    allExpenses,
    loyaltyAccounts,
    fxSource,
    updateProfileSettings,
    clearAllData,
  } = useApp();

  const [renameModal, setRenameModal] = useState(false);
  const [draftName, setDraftName] = useState('');

  // Deduplicate countries for passport ink stamps
  const countryStamps = Array.from(
    new Map(
      trips.map((t) => [
        t.countryCode,
        {
          code: t.countryCode,
          country: t.destinationCountry,
          flag: t.flagEmoji,
          date: t.startDate,
        },
      ])
    ).values()
  );

  const distanceUnit: DistanceUnit = profile?.distanceUnit ?? 'km';
  const totalDistanceKm =
    allFlights.reduce((acc, f) => acc + milesToKm(f.distanceMiles), 0) +
    allTransports.reduce((acc, t) => acc + (t.distanceKm ?? 0), 0);
  const totalDistanceDisplay = formatDistanceValue(totalDistanceKm, distanceUnit);
  const totalPoints = loyaltyAccounts.reduce((acc, l) => acc + l.balance, 0);

  const openRename = () => {
    setDraftName(profile?.displayName === 'Wanderer' ? '' : profile?.displayName || '');
    setRenameModal(true);
  };

  const handleSaveName = async () => {
    const clean = draftName.trim() || 'Wanderer';
    const parts = clean.split(/\s+/);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : clean.slice(0, 2).toUpperCase() || 'WL';
    await updateProfileSettings({ displayName: clean, avatarInitials: initials });
    setRenameModal(false);
  };

  const handleExportCsv = async () => {
    try {
      const header = 'Date,Merchant,Category,LocalAmount,LocalCurrency,HomeAmount,HomeCurrency\n';
      const rows = allExpenses
        .map(
          (e) =>
            `${e.expenseDate},"${e.merchant.replace(/"/g, '""')}",${e.category},${e.localAmount},${e.localCurrency},${e.homeAmount},${e.homeCurrency}`
        )
        .join('\n');
      const baseDir = (FileSystem as unknown as { cacheDirectory?: string }).cacheDirectory ?? '';
      const uri = `${baseDir}wanderers_ledger_expenses.csv`;
      await FileSystem.writeAsStringAsync(uri, header + rows);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export Travel Spend CSV' });
      } else {
        Alert.alert('Export Ready', `Saved ${allExpenses.length} expenses to CSV.`);
      }
    } catch {
      Alert.alert('Export Error', 'Unable to export CSV on this device.');
    }
  };

  const handleResetLocalData = () => {
    Alert.alert(
      'Reset Local Travelogue?',
      'This removes all locally stored trips, flights, transports, stays, expenses, memories, and loyalty balances on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearAllData();
            Alert.alert('Clean Slate ✨', 'All local travelogue data has been cleared.');
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Navy & Gold Tactile Passport Cover */}
      <TouchableOpacity onPress={openRename} activeOpacity={0.9}>
        <LinearGradient
          colors={['#1E1B4B', '#312E81', '#1E293B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.passportCover}
        >
          <LinearGradient colors={['#FDE047', '#F97316']} style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.avatarInitials || 'WL'}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.passportLabel}>PASSPORT • WANDERER'S LEDGER</Text>
            <Text style={styles.userName}>{profile?.displayName || 'Wanderer'}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {profile?.authMode === 'google' && profile?.email
                ? `${profile.email} • Google Synced ✓`
                : 'Saved privately on this device ✓ • Tap to rename'}
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Cumulative Lifetime Strip */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: COLORS.coral }]} numberOfLines={1} adjustsFontSizeToFit>
            {countryStamps.length}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>Countries</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: COLORS.sky }]} numberOfLines={1} adjustsFontSizeToFit>
            {totalDistanceDisplay.toLocaleString()}
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>
            {distanceUnit === 'mi' ? 'Miles Traveled' : 'Km Traveled'}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: '#B45309' }]} numberOfLines={1} adjustsFontSizeToFit>
            {(totalPoints / 1000).toFixed(1)}k
          </Text>
          <Text style={styles.statLbl} numberOfLines={1}>Vault Pts</Text>
        </View>
      </View>

      {/* Ink-Stamped Passport Pages */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>🛂 Passport Ink Stamps</Text>
          <Text style={styles.cardMeta}>{countryStamps.length} collected</Text>
        </View>

        {countryStamps.length === 0 ? (
          <Text style={styles.prefSub}>
            No ink stamps yet — log your first trip to stamp your first country!
          </Text>
        ) : (
          <View style={styles.stampsGrid}>
            {countryStamps.map((s, idx) => {
              const st = STAMP_STYLES[idx % STAMP_STYLES.length];
              return (
                <View
                  key={s.code}
                  style={[
                    styles.stamp,
                    {
                      borderColor: st.border,
                      backgroundColor: st.bg,
                      transform: [{ rotate: st.tilt }],
                    },
                  ]}
                >
                  <Text
                    style={[styles.stampCountry, { color: st.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {s.flag} {s.country.toUpperCase()}
                  </Text>
                  <Text style={[styles.stampDate, { color: st.text }]}>{s.date}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Loyalty Miles & Points Vault */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🏆 Loyalty Miles & Points Vault</Text>
        {loyaltyAccounts.length === 0 ? (
          <Text style={styles.prefSub}>
            Miles and loyalty balances appear here automatically whenever you scan or log flights.
          </Text>
        ) : (
          loyaltyAccounts.map((acc) => (
            <View key={acc.id} style={styles.loyaltyRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.loyaltyName} numberOfLines={1}>
                  {acc.category === 'airline' ? '✈️ ' : acc.category === 'hotel' ? '🏨 ' : '💳 '}
                  {acc.programName}
                </Text>
                {acc.memberNumber && (
                  <Text style={styles.loyaltyNum}>Member #{acc.memberNumber}</Text>
                )}
              </View>
              <Text style={styles.loyaltyBal}>
                {acc.balance.toLocaleString()} {acc.unitLabel}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Preferences & Controls */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚙️ Travel Preferences</Text>

        <Text style={styles.prefSub}>Home Currency (FX rates: {fxSource === 'live' ? 'Live ECB ✓' : 'Cached Offline'})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {CURRENCIES.map((c) => {
            const active = profile?.homeCurrency === c;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => updateProfileSettings({ homeCurrency: c })}
                style={[styles.currChip, active && styles.currChipActive]}
              >
                <Text style={[styles.currText, active && { color: '#FFFFFF' }]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.prefSub}>Distance Unit 📏 (applies to trips, map, transport & IG Studio)</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
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
                onPress={() => updateProfileSettings({ distanceUnit: u.id })}
                style={[styles.currChip, active && styles.currChipActive]}
              >
                <Text style={[styles.currText, active && { color: '#FFFFFF' }]}>{u.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Upload Full Photos on Wi-Fi Only</Text>
            <Text style={styles.switchSub}>Saves roaming data while traveling abroad</Text>
          </View>
          <Switch
            value={Boolean(profile?.wifiOnlyPhotoSync)}
            onValueChange={(val) => updateProfileSettings({ wifiOnlyPhotoSync: val })}
            trackColor={{ false: '#D6D3D1', true: '#FDBA74' }}
            thumbColor={profile?.wifiOnlyPhotoSync ? COLORS.coral : '#FFFFFF'}
          />
        </View>

        <View style={styles.footerActions}>
          <TouchableOpacity onPress={handleExportCsv} style={styles.exportBtn} activeOpacity={0.85}>
            <Text style={styles.exportBtnText}>📊 Export Spend CSV</Text>
          </TouchableOpacity>
          <View style={styles.footerSubRow}>
            <TouchableOpacity onPress={onOpenWelcome} style={styles.guideBtn} activeOpacity={0.85}>
              <Text style={styles.guideBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                👋 Welcome Guide
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleResetLocalData} style={styles.resetBtn} activeOpacity={0.85}>
              <Text style={styles.resetBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                🧹 Reset Data
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Personalize Passport Name Modal */}
      <BottomSheetModal
        visible={renameModal}
        title="✏️ Personalize Your Passport"
        onClose={() => setRenameModal(false)}
        footer={
          <TouchableOpacity onPress={handleSaveName} style={styles.saveNameBtn} activeOpacity={0.9}>
            <Text style={styles.saveNameBtnText}>Save Name ✨</Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.prefSub}>
          Leave blank to go by Wanderer ✨
        </Text>
        <TextInput
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Your first name (optional)"
          placeholderTextColor={COLORS.inkSoft}
          autoCapitalize="words"
          style={styles.nameInput}
        />
      </BottomSheetModal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  passportCover: {
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 2,
    borderColor: 'rgba(251, 191, 36, 0.45)',
    ...SHADOWS.card,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '900', color: '#1C1917' },
  passportLabel: { fontSize: 10, fontWeight: '900', color: '#FDE047', letterSpacing: 1.2 },
  userName: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', marginTop: 2 },
  userEmail: { fontSize: 11, color: '#C7D2FE', marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statVal: { fontSize: 18, fontWeight: '900' },
  statLbl: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '700', marginTop: 3 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    gap: 12,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink, flexShrink: 1 },
  cardMeta: { fontSize: 12, fontWeight: '800', color: COLORS.coralDark },

  stampsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 6 },
  stamp: {
    width: '47%',
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  stampCountry: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  stampDate: { fontSize: 10, fontFamily: 'monospace', fontWeight: '700', marginTop: 3 },

  loyaltyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  loyaltyName: { fontSize: 13, fontWeight: '800', color: COLORS.ink },
  loyaltyNum: { fontSize: 11, color: COLORS.inkSoft, marginTop: 2 },
  loyaltyBal: { fontSize: 13, fontWeight: '900', color: '#B45309' },

  prefSub: { fontSize: 12, color: COLORS.inkMuted, fontWeight: '600', lineHeight: 17 },
  currChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
  },
  currChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  currText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  switchTitle: { fontSize: 13, fontWeight: '800', color: COLORS.ink },
  switchSub: { fontSize: 11, color: COLORS.inkMuted, marginTop: 2 },
  footerActions: { gap: 10, marginTop: 6 },
  footerSubRow: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    backgroundColor: COLORS.skySoft,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  exportBtnText: { color: '#0369A1', fontWeight: '800', fontSize: 13 },
  guideBtn: {
    flex: 1,
    backgroundColor: COLORS.indigoSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  guideBtnText: { color: COLORS.indigo, fontWeight: '800', fontSize: 13 },
  resetBtn: {
    flex: 1,
    backgroundColor: COLORS.roseSoft,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  resetBtnText: { color: COLORS.rose, fontWeight: '800', fontSize: 13 },
  nameInput: {
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.ink,
    fontWeight: '600',
  },
  saveNameBtn: {
    backgroundColor: COLORS.coral,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveNameBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
});
