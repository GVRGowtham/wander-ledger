import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { BottomSheetModal } from '../components/layout/BottomSheetModal';
import { useApp } from '../context/AppContext';
import {
  buildLocalBackupSnapshot,
  restoreFromBackupSnapshot,
  validateBackupSnapshot,
} from '../services/cloudSyncService';
import { DriveBackupMetadata, formatBytes } from '../services/driveBackupHelpers';
import { formatDistanceValue, milesToKm } from '../services/distanceUtils';
import { shareLocalFileSafely } from '../services/shareMediaService';
import { buildTripSpendLedger } from '../services/spendCurrencyUtils';
import {
  deriveGlobalTravelGeography,
  formatPassportStampMonthYear,
} from '../services/travelGeography';
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
    driveBusyMode,
    driveProgress,
    driveError,
    lastDriveBackupAt,
    lastDriveBackupSummary,
    driveRemoteBackup,
    driveAutoBackupEnabled,
    signInWithGoogleAccount,
    signOutGoogleAccount,
    backUpToGoogleDrive,
    restoreFromGoogleDrive,
    deleteGoogleDriveCloudBackup,
    toggleDailyDriveBackup,
    refreshDriveBackupMetadata,
    trips,
    allFlights,
    allTransports,
    allStops,
    allStays,
    allExpenses,
    allMemories,
    loyaltyAccounts,
    fxRates,
    fxSnapshots,
    fxSource,
    remindersEnabled,
    scheduledRemindersCount,
    toggleTravelReminders,
    refreshAll,
    updateProfileSettings,
    clearAllData,
  } = useApp();

  const [renameModal, setRenameModal] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [togglingReminders, setTogglingReminders] = useState(false);
  const [togglingAutoBackup, setTogglingAutoBackup] = useState(false);

  const isDriveBusy = driveBusyMode !== 'idle';
  const isGoogleConnected = profile?.authMode === 'google' && Boolean(profile?.email);

  // Multi-country geography: counts visited countries across trips, stops & open-jaw legs,
  // while keeping <24h airside airport layovers separate as Transit Hubs.
  const geography = deriveGlobalTravelGeography(trips, allFlights, allTransports, allStops);
  const countryStamps = geography.countryStamps;
  const transitHubs = geography.transitHubs;

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

  const executeDriveRestore = async (mode: 'merge' | 'replace', accessToken?: string) => {
    const res = await restoreFromGoogleDrive(mode, accessToken);
    if (res.status === 'success') {
      Alert.alert(
        'Backup Restored ✨',
        `Restored ${res.tripsRestored ?? 0} ${(res.tripsRestored ?? 0) === 1 ? 'trip' : 'trips'}, ${res.itemsRestored ?? 0} entries, and ${res.mediaDownloaded ?? 0} ${(res.mediaDownloaded ?? 0) === 1 ? 'photo/receipt' : 'photos & receipts'} from Google Drive.`
      );
    } else if (res.status === 'no_backup') {
      Alert.alert(
        'No Backup Found',
        'There is no Wanderer’s Ledger backup in your Google Drive yet. Tap "Back Up Now" to create your first backup!'
      );
    } else {
      Alert.alert(
        'Restore Paused',
        res.error || 'Could not reach Google Drive right now. Your local data is safe.'
      );
    }
  };

  const promptRestoreChoices = (meta: DriveBackupMetadata, accessToken?: string) => {
    const sizeText = meta.totalMediaBytes > 0 ? ` (${formatBytes(meta.totalMediaBytes)})` : '';
    const backupSummary = `${meta.tripsCount} ${meta.tripsCount === 1 ? 'trip' : 'trips'} • ${meta.memoriesCount} ${meta.memoriesCount === 1 ? 'memory' : 'memories'} • ${meta.mediaCount} ${meta.mediaCount === 1 ? 'photo' : 'photos'}${sizeText}`;

    if (trips.length > 0) {
      Alert.alert(
        'Google Drive Backup Found ☁️',
        `Drive backup has ${backupSummary}.\n\nYou also have ${trips.length} ${trips.length === 1 ? 'trip' : 'trips'} on this device. How would you like to restore?`,
        [
          {
            text: 'Merge Both (Recommended)',
            onPress: () => {
              executeDriveRestore('merge', accessToken).catch(() => {});
            },
          },
          {
            text: 'Replace This Device',
            style: 'destructive',
            onPress: () => {
              executeDriveRestore('replace', accessToken).catch(() => {});
            },
          },
          { text: 'Not Now', style: 'cancel' },
        ]
      );
    } else {
      Alert.alert(
        'Restore Google Drive Backup? 📥',
        `Found ${backupSummary} in your private Google Drive app folder.`,
        [
          { text: 'Not Now', style: 'cancel' },
          {
            text: 'Restore Now',
            onPress: () => {
              executeDriveRestore('replace', accessToken).catch(() => {});
            },
          },
        ]
      );
    }
  };

  const handleConnectGoogleDrive = async () => {
    const outcome = await signInWithGoogleAccount({ deferCommitIfBackupFound: false });
    if (outcome.status === 'cancelled') return;
    if (outcome.status === 'error') {
      Alert.alert(
        'Google Sign-In Error',
        `${outcome.message}\n\nYour local travelogue remains 100% safe on this device.`
      );
      return;
    }

    if (outcome.remoteBackup.exists) {
      promptRestoreChoices(outcome.remoteBackup, outcome.accessToken);
    } else {
      Alert.alert(
        'Google Account Connected ✓',
        'Auto-backup is off by default. Tap "Back Up Now" or turn on Daily Auto-Backup whenever you are ready!'
      );
    }
  };

  const handleBackUpNow = async () => {
    const res = await backUpToGoogleDrive();
    if (res.status === 'success') {
      const sizeStr = res.totalBytes ? ` (${formatBytes(res.totalBytes)})` : '';
      const photoNote =
        (res.mediaUploaded ?? 0) > 0
          ? `${res.mediaUploaded} new ${(res.mediaUploaded ?? 0) === 1 ? 'photo/receipt' : 'photos & receipts'} uploaded`
          : 'all photos already up to date';
      Alert.alert(
        'Backed Up to Google Drive ☁️',
        `Saved ${res.tripsCount ?? trips.length} ${(res.tripsCount ?? trips.length) === 1 ? 'trip' : 'trips'} and ${photoNote}${sizeStr}.`
      );
    } else if (res.status === 'signed_out') {
      Alert.alert('Sign-In Needed', res.error || 'Please sign in with Google again to back up.');
    } else if (res.status === 'error') {
      Alert.alert(
        'Backup Paused',
        res.error || 'Could not reach Google Drive right now. Your local data is safe.'
      );
    }
  };

  const handleRestoreFromDrivePress = async () => {
    const meta = await refreshDriveBackupMetadata();
    if (!meta.exists) {
      Alert.alert(
        'No Backup Found Yet',
        'There is no Wanderer’s Ledger backup in your Google Drive yet. Tap "Back Up Now" to create your first backup!'
      );
      return;
    }
    promptRestoreChoices(meta);
  };

  const handleToggleAutoBackup = async (val: boolean) => {
    if (togglingAutoBackup) return;
    setTogglingAutoBackup(true);
    try {
      const res = await toggleDailyDriveBackup(val);
      if (val && res.reason) {
        Alert.alert('Daily Auto-Backup Enabled ☁️', res.reason);
      }
    } finally {
      setTogglingAutoBackup(false);
    }
  };

  const handleDeleteCloudBackup = () => {
    Alert.alert(
      'Delete Google Drive Backup?',
      'This removes your Wanderer’s Ledger backup from Google Drive ONLY. All trips, bookings, expenses, and photos on this phone stay 100% untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Cloud Backup',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteGoogleDriveCloudBackup();
            if (res.status === 'success') {
              Alert.alert(
                'Cloud Backup Deleted ✓',
                'Removed your backup from Google Drive. Your local travelogue on this phone is untouched.'
              );
            } else {
              Alert.alert(
                'Could Not Delete',
                res.error || 'Unable to reach Google Drive right now.'
              );
            }
          },
        },
      ]
    );
  };

  const handleSignOutGoogle = () => {
    Alert.alert(
      'Sign Out of Google?',
      'Your phone will keep all your trips, flights, memories & receipts locally, and simply pause Google Drive backup until you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            signOutGoogleAccount().catch(() => {});
          },
        },
      ]
    );
  };

  const handleExportLocalBackup = async () => {
    try {
      const snapshot = buildLocalBackupSnapshot();
      const dateTag = new Date().toISOString().slice(0, 10);
      const baseDir = (FileSystem as unknown as { cacheDirectory?: string }).cacheDirectory ?? '';
      const uri = `${baseDir}wanderers_ledger_backup_${dateTag}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(snapshot, null, 2));
      const shared = await shareLocalFileSafely({
        fileUri: uri,
        mimeType: 'application/json',
        uti: 'public.json',
        title: "Export Wanderer's Ledger Backup (.json)",
      });
      if (!shared) {
        Alert.alert(
          'Backup Ready 📦',
          `Saved ${snapshot.trips.length} trips and ${snapshot.flights.length + snapshot.transports.length} travel legs.`
        );
      }
    } catch {
      Alert.alert('Backup Error', 'Unable to export local backup file on this device.');
    }
  };

  const handleImportLocalBackup = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      const rawText = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      const parsed = JSON.parse(rawText);
      const snapshot = validateBackupSnapshot(parsed);
      if (!snapshot) {
        Alert.alert(
          'Invalid Backup File',
          "Please select a valid Wanderer's Ledger (.json) backup exported from this app."
        );
        return;
      }

      const itemCount =
        snapshot.flights.length +
        snapshot.transports.length +
        snapshot.stops.length +
        snapshot.stays.length +
        snapshot.expenses.length +
        snapshot.memories.length +
        snapshot.loyaltyAccounts.length;

      Alert.alert(
        'Restore Local Backup? 📥',
        `Found ${snapshot.trips.length} ${snapshot.trips.length === 1 ? 'trip' : 'trips'} and ${itemCount} bookings, memories & loyalty entries.\n\nExisting trips on this device will be kept and merged cleanly.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: () => {
              const res = restoreFromBackupSnapshot(snapshot);
              refreshAll();
              Alert.alert(
                'Backup Restored ✨',
                `Restored ${res.tripsRestored} ${res.tripsRestored === 1 ? 'trip' : 'trips'} and ${res.itemsRestored} entries onto this device.`
              );
            },
          },
        ]
      );
    } catch {
      Alert.alert(
        'Import Failed',
        "Could not read that file. Make sure you pick a Wanderer's Ledger .json backup file."
      );
    }
  };

  const handleToggleReminders = async (val: boolean) => {
    if (togglingReminders) return;
    setTogglingReminders(true);
    try {
      const enabled = await toggleTravelReminders(val);
      if (val && !enabled) {
        Alert.alert(
          'Notifications Disabled',
          'Allow notifications for Wanderer’s Ledger in your phone Settings to receive offline flight check-in and hotel reminders.'
        );
      }
    } finally {
      setTogglingReminders(false);
    }
  };

  const formatSyncTime = (iso: string | null): string => {
    if (!iso) return 'Not synced yet';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
      return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
    } catch {
      return iso.slice(0, 16);
    }
  };

  const handleExportCsv = async () => {
    try {
      const preferredCurrency = (profile?.homeCurrency || 'USD').toUpperCase();
      const ledger = buildTripSpendLedger({
        expenses: allExpenses,
        transports: allTransports,
        stays: allStays,
        preferredCurrency,
        fxRates,
        fxSnapshots,
      });
      const header = 'Date,Merchant,Category,Source,LocalAmount,LocalCurrency,ConvertedAmount,PreferredCurrency,FxDate\n';
      const rows = ledger.items
        .map(
          (i) =>
            `${i.date},"${i.title.replace(/"/g, '""')}",${i.category},${i.source},${i.originalAmount},${i.originalCurrency},${i.convertedAmount},${i.preferredCurrency},${i.fxDate ?? 'live'}`
        )
        .join('\n');
      const baseDir = (FileSystem as unknown as { cacheDirectory?: string }).cacheDirectory ?? '';
      const uri = `${baseDir}wanderers_ledger_expenses.csv`;
      await FileSystem.writeAsStringAsync(uri, header + rows);
      const shared = await shareLocalFileSafely({
        fileUri: uri,
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
        title: 'Export Travel Spend CSV',
      });
      if (!shared) {
        Alert.alert('Export Ready', `Saved ${ledger.items.length} spend items to CSV.`);
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
              {isGoogleConnected && profile?.email
                ? `${profile.email} • Google Drive ✓`
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
            No ink stamps yet — log a flight, train/road leg, or Trip Stop to stamp your visited countries!
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
                  <Text
                    style={[styles.stampDate, { color: st.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {(() => {
                      const monthYear = formatPassportStampMonthYear(s.lastVisitedDate || s.date);
                      const cityLabel =
                        s.cities.length > 0
                          ? `${s.cities.length} ${s.cities.length === 1 ? 'city' : 'cities'}`
                          : '';
                      return cityLabel && monthYear
                        ? `${cityLabel} • ${monthYear}`
                        : cityLabel || monthYear;
                    })()}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {transitHubs.length > 0 && (
          <View style={styles.transitBox}>
            <Text style={styles.transitTitle}>✈️ Airport Transit Hubs (Not Counted)</Text>
            <View style={styles.transitChipsRow}>
              {transitHubs.map((hub) => (
                <View key={hub.iata} style={styles.transitChip}>
                  <Text style={styles.transitChipText}>
                    {hub.flag} {hub.city} ({hub.iata})
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.transitHint}>
              Airside layovers under 24h stay separate from visited countries — add a Trip Stop if you explored the city!
            </Text>
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

      {/* Personal Google Drive Backup & Restore Card (WhatsApp-style private appDataFolder) */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>☁️ Google Drive Backup</Text>
          {isDriveBusy ? (
            <View style={styles.syncPillSyncing}>
              <Text style={styles.syncPillSyncingText}>
                {driveBusyMode === 'restoring'
                  ? 'Restoring…'
                  : driveBusyMode === 'backing_up'
                    ? 'Backing up…'
                    : driveBusyMode === 'deleting'
                      ? 'Deleting…'
                      : 'Checking…'}
              </Text>
            </View>
          ) : !isGoogleConnected ? (
            <View style={styles.syncPillOffline}>
              <Text style={styles.syncPillOfflineText}>📱 Local Only</Text>
            </View>
          ) : driveError ? (
            <View style={styles.syncPillError}>
              <Text style={styles.syncPillErrorText}>⚠️ Retry</Text>
            </View>
          ) : lastDriveBackupAt ? (
            <View style={styles.syncPillSynced}>
              <Text style={styles.syncPillSyncedText}>✓ Backed Up</Text>
            </View>
          ) : (
            <View style={styles.syncPillPending}>
              <Text style={styles.syncPillPendingText}>Not Backed Up</Text>
            </View>
          )}
        </View>

        {!isGoogleConnected ? (
          <>
            <Text style={styles.prefSub}>
              Running 100% offline on this device ({trips.length}{' '}
              {trips.length === 1 ? 'trip' : 'trips'} •{' '}
              {allFlights.length + allTransports.length} travel legs • {allMemories.length}{' '}
              memories). Sign in with Google to back up your trips, compressed photos &amp; receipts
              to your own hidden Google Drive app folder.
            </Text>

            <TouchableOpacity
              onPress={handleConnectGoogleDrive}
              disabled={isDriveBusy}
              activeOpacity={0.9}
              style={styles.googleConnectBtn}
            >
              {isDriveBusy ? (
                <ActivityIndicator color={COLORS.navy} size="small" />
              ) : (
                <View style={styles.googleConnectRow}>
                  <View style={styles.googleGBadge}>
                    <Text style={styles.googleGBadgeText}>G</Text>
                  </View>
                  <Text style={styles.googleConnectBtnText}>Sign in with Google</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.footerSubRow}>
              <TouchableOpacity
                onPress={handleExportLocalBackup}
                style={[styles.backupBtn, { flex: 1 }]}
                activeOpacity={0.85}
              >
                <Text style={styles.backupBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  📦 Export (.json)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleImportLocalBackup}
                style={[styles.backupBtn, { flex: 1 }]}
                activeOpacity={0.85}
              >
                <Text style={styles.backupBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  📥 Import (.json)
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.syncMetaBox}>
              <Text style={styles.syncAccountText} numberOfLines={1}>
                Google Drive: {profile?.email}
              </Text>
              <Text style={styles.syncTimeText}>
                Last backup:{' '}
                {lastDriveBackupAt
                  ? formatSyncTime(lastDriveBackupAt)
                  : driveRemoteBackup?.exists && driveRemoteBackup.updatedAt
                    ? formatSyncTime(driveRemoteBackup.updatedAt)
                    : 'Not backed up yet'}
              </Text>
              {lastDriveBackupSummary ? (
                <Text style={styles.syncSummaryText}>
                  {lastDriveBackupSummary.tripsCount}{' '}
                  {lastDriveBackupSummary.tripsCount === 1 ? 'trip' : 'trips'} •{' '}
                  {lastDriveBackupSummary.memoriesCount}{' '}
                  {lastDriveBackupSummary.memoriesCount === 1 ? 'memory' : 'memories'} •{' '}
                  {lastDriveBackupSummary.mediaCount}{' '}
                  {lastDriveBackupSummary.mediaCount === 1 ? 'photo/receipt' : 'photos & receipts'}
                  {lastDriveBackupSummary.totalBytes > 0
                    ? ` (${formatBytes(lastDriveBackupSummary.totalBytes)})`
                    : ''}
                </Text>
              ) : (
                <Text style={styles.syncHintText}>
                  Stored privately in your hidden Drive app folder — Wanderer&apos;s Ledger cannot see any other Drive files.
                </Text>
              )}
              {driveProgress ? (
                <View style={styles.driveProgressRow}>
                  <ActivityIndicator color={COLORS.coral} size="small" />
                  <Text style={styles.driveProgressText}>{driveProgress.label}</Text>
                </View>
              ) : null}
              {driveError ? <Text style={styles.syncErrorText}>{driveError}</Text> : null}
            </View>

            {/* Optional Daily Background Auto-Backup (OFF by default on first sign-in) */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.switchTitle}>🔄 Daily Auto-Backup</Text>
                <Text style={styles.switchSub}>
                  {driveAutoBackupEnabled
                    ? 'Automatically backs up changes once a day when online'
                    : 'Off — back up manually anytime, or enable daily auto-backup'}
                </Text>
              </View>
              <Switch
                value={driveAutoBackupEnabled}
                disabled={togglingAutoBackup || isDriveBusy}
                onValueChange={handleToggleAutoBackup}
                trackColor={{ false: '#D6D3D1', true: '#FDBA74' }}
                thumbColor={driveAutoBackupEnabled ? COLORS.coral : '#FFFFFF'}
              />
            </View>

            {/* Primary Manual Actions: Back Up Now + Restore */}
            <View style={styles.footerSubRow}>
              <TouchableOpacity
                onPress={handleBackUpNow}
                disabled={isDriveBusy}
                style={[styles.cloudPrimaryBtn, { flex: 1.25 }]}
                activeOpacity={0.9}
              >
                {driveBusyMode === 'backing_up' ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.cloudPrimaryBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
                    ☁️ Back Up Now
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRestoreFromDrivePress}
                disabled={isDriveBusy}
                style={[styles.restoreDriveBtn, { flex: 0.95 }]}
                activeOpacity={0.85}
              >
                {driveBusyMode === 'restoring' ? (
                  <ActivityIndicator color={COLORS.navy} size="small" />
                ) : (
                  <Text style={styles.restoreDriveBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
                    📥 Restore
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Portable Offline JSON Export / Import */}
            <View style={styles.footerSubRow}>
              <TouchableOpacity
                onPress={handleExportLocalBackup}
                style={[styles.backupBtn, { flex: 1 }]}
                activeOpacity={0.85}
              >
                <Text style={styles.backupBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  📦 Export (.json)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleImportLocalBackup}
                style={[styles.backupBtn, { flex: 1 }]}
                activeOpacity={0.85}
              >
                <Text style={styles.backupBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                  📥 Import (.json)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Subtle Account & Cloud Backup Controls */}
            <View style={styles.driveSubActionsRow}>
              <TouchableOpacity
                onPress={handleDeleteCloudBackup}
                disabled={isDriveBusy}
                style={styles.driveSubActionBtn}
                activeOpacity={0.75}
              >
                <Text style={styles.driveSubActionDanger}>🗑️ Delete Cloud Backup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSignOutGoogle}
                disabled={isDriveBusy}
                style={styles.driveSubActionBtn}
                activeOpacity={0.75}
              >
                <Text style={styles.driveSubActionMuted}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </>
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
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.switchTitle}>🔔 Offline Travel Reminders</Text>
            <Text style={styles.switchSub}>
              {remindersEnabled
                ? `${scheduledRemindersCount} upcoming ${scheduledRemindersCount === 1 ? 'alert' : 'alerts'} scheduled (24h check-in, 3h flight & hotel morning)`
                : 'Local alerts for flight check-in, departures & hotel check-in (100% offline)'}
            </Text>
          </View>
          <Switch
            value={remindersEnabled}
            disabled={togglingReminders}
            onValueChange={handleToggleReminders}
            trackColor={{ false: '#D6D3D1', true: '#FDBA74' }}
            thumbColor={remindersEnabled ? COLORS.coral : '#FFFFFF'}
          />
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
  transitBox: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    gap: 6,
  },
  transitTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  transitChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  transitChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  transitChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.inkMuted,
  },
  transitHint: {
    fontSize: 11,
    color: COLORS.inkSoft,
    lineHeight: 15,
  },
  syncPillOffline: {
    backgroundColor: COLORS.emeraldSoft,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  syncPillOfflineText: { fontSize: 11, fontWeight: '800', color: '#047857' },
  syncPillSynced: {
    backgroundColor: COLORS.emeraldSoft,
    borderWidth: 1,
    borderColor: '#6EE7B7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  syncPillSyncedText: { fontSize: 11, fontWeight: '800', color: '#047857' },
  syncPillSyncing: {
    backgroundColor: COLORS.skySoft,
    borderWidth: 1,
    borderColor: '#7DD3FC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  syncPillSyncingText: { fontSize: 11, fontWeight: '800', color: '#0369A1' },
  syncPillPending: {
    backgroundColor: COLORS.amberSoft,
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  syncPillPendingText: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  syncPillError: {
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  syncPillErrorText: { fontSize: 11, fontWeight: '800', color: COLORS.rose },
  syncMetaBox: {
    backgroundColor: COLORS.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: 11,
    gap: 3,
  },
  syncAccountText: { fontSize: 12, fontWeight: '800', color: COLORS.ink },
  syncTimeText: { fontSize: 11, color: COLORS.inkMuted },
  syncSummaryText: { fontSize: 11, fontWeight: '700', color: '#047857', marginTop: 2 },
  syncHintText: { fontSize: 11, color: COLORS.inkSoft, lineHeight: 15, marginTop: 2 },
  syncErrorText: { fontSize: 11, fontWeight: '700', color: COLORS.rose, marginTop: 2 },
  driveProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  driveProgressText: { fontSize: 11.5, fontWeight: '700', color: COLORS.coralDark, flex: 1 },
  googleConnectBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleConnectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleGBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGBadgeText: { fontSize: 13, fontWeight: '900', color: '#2563EB' },
  googleConnectBtnText: { color: COLORS.ink, fontWeight: '900', fontSize: 13.5 },
  cloudPrimaryBtn: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudPrimaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  restoreDriveBtn: {
    backgroundColor: COLORS.indigoSoft,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreDriveBtnText: { color: COLORS.navy, fontWeight: '800', fontSize: 13 },
  disconnectBtn: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectBtnText: { color: COLORS.inkMuted, fontWeight: '800', fontSize: 12 },
  backupBtn: {
    backgroundColor: COLORS.cardWarm,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupBtnText: { color: COLORS.coralDark, fontWeight: '800', fontSize: 12.5 },
  driveSubActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  driveSubActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  driveSubActionDanger: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.rose,
  },
  driveSubActionMuted: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.inkMuted,
  },
});
