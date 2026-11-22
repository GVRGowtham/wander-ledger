import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useApp } from '../context/AppContext';
import { COLORS, SHADOWS } from '../theme/tokens';

const STAMP_STYLES = [
  { border: '#E11D48', bg: '#FFF1F2', text: '#BE123C', tilt: '-5deg' },
  { border: '#0284C7', bg: '#F0F9FF', text: '#0369A1', tilt: '4deg' },
  { border: '#059669', bg: '#ECFDF5', text: '#047857', tilt: '-3deg' },
  { border: '#7C3AED', bg: '#F5F3FF', text: '#6D28D9', tilt: '5deg' },
];

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'];

export const PassportScreen: React.FC = () => {
  const {
    profile,
    trips,
    allFlights,
    allExpenses,
    loyaltyAccounts,
    fxSource,
    updateProfileSettings,
    clearAllData,
    logout,
  } = useApp();

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

  const totalMiles = allFlights.reduce((acc, f) => acc + f.distanceMiles, 0);
  const totalPoints = loyaltyAccounts.reduce((acc, l) => acc + l.balance, 0);

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
      const uri = `${baseDir}wanderledger_expenses.csv`;
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
      'This removes all locally stored trips, flights, stays, expenses, memories, and loyalty balances on this device.',
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
          <Text style={styles.passportLabel}>PASSPORT • WANDERLEDGER</Text>
          <Text style={styles.userName}>{profile?.displayName || 'Traveler'}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>
            {profile?.email} • {profile?.authMode === 'google' ? 'Google Synced ✓' : 'Local SQLite ✓'}
          </Text>
        </View>
      </LinearGradient>

      {/* Cumulative Lifetime Strip */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: COLORS.coral }]}>{countryStamps.length}</Text>
          <Text style={styles.statLbl}>Countries</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: COLORS.sky }]}>
            {totalMiles.toLocaleString()}
          </Text>
          <Text style={styles.statLbl}>Miles Flown</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statVal, { color: '#B45309' }]}>
            {(totalPoints / 1000).toFixed(1)}k
          </Text>
          <Text style={styles.statLbl}>Vault Pts</Text>
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
                  <Text style={[styles.stampCountry, { color: st.text }]}>
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
              <View style={{ flex: 1 }}>
                <Text style={styles.loyaltyName}>
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

      {/* Preferences & Sync Controls */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚙️ Travel Preferences</Text>

        <Text style={styles.prefSub}>Home Currency (FX rates: {fxSource === 'live' ? 'Live ECB ✓' : 'Cached Offline'})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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
          <TouchableOpacity onPress={handleExportCsv} style={styles.exportBtn}>
            <Text style={styles.exportBtnText}>📊 Export Spend CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleResetLocalData} style={styles.logoutBtn}>
            <Text style={styles.logoutBtnText}>🧹 Reset Data</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
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
    alignItems: 'center',
  },
  statVal: { fontSize: 18, fontWeight: '900' },
  statLbl: { fontSize: 11, color: COLORS.inkMuted, fontWeight: '700', marginTop: 2 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '900', color: COLORS.ink },
  cardMeta: { fontSize: 12, fontWeight: '800', color: COLORS.coralDark },

  stampsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 4 },
  stamp: {
    width: '46%',
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  stampCountry: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  stampDate: { fontSize: 10, fontFamily: 'monospace', fontWeight: '700', marginTop: 3 },

  loyaltyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  loyaltyName: { fontSize: 13, fontWeight: '800', color: COLORS.ink },
  loyaltyNum: { fontSize: 11, color: COLORS.inkSoft, marginTop: 1 },
  loyaltyBal: { fontSize: 13, fontWeight: '900', color: '#B45309' },

  prefSub: { fontSize: 12, color: COLORS.inkMuted, fontWeight: '600' },
  currChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  switchSub: { fontSize: 11, color: COLORS.inkMuted, marginTop: 1 },
  footerActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  exportBtn: {
    flex: 1,
    backgroundColor: COLORS.skySoft,
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
  },
  exportBtnText: { color: '#0369A1', fontWeight: '800', fontSize: 13 },
  logoutBtn: {
    backgroundColor: COLORS.roseSoft,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
  },
  logoutBtnText: { color: COLORS.rose, fontWeight: '800', fontSize: 13 },
});
