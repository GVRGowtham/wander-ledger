import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import {
  clearProfile,
  getSupabaseClient,
  isCloudConfigured,
  loadSavedProfile,
  saveProfile,
  signInWithGoogle,
  startLocalSession,
} from '../services/authService';
import {
  clearAllLocalData,
  clearSyncMutation,
  deleteExpense,
  deleteFlight,
  deleteMemory,
  deleteStay,
  deleteTransport,
  deleteTrip,
  deleteTripStop,
  FlightEditablePatch,
  getDb,
  getPendingSyncCount,
  getTripSummary,
  insertExpense,
  insertFlight,
  insertMemory,
  insertStay,
  insertTransport,
  insertTrip,
  insertTripStop,
  listExpenses,
  listFlights,
  listLoyaltyAccounts,
  listMemories,
  listStays,
  listTransports,
  listTrips,
  listTripStops,
  loadAllFxRateSnapshots,
  loadCachedFxRates,
  MemoryEditablePatch,
  purgeLegacySeedDataIfNeeded,
  saveFxRates,
  saveFxRateSnapshot,
  TripEditablePatch,
  updateFlight,
  updateMemory,
  updateSpendItemFxSettings,
  updateTrip,
  updateTripCover,
  updateTripSharing,
} from '../db/database';
import {
  deleteEntityFromCloud,
  deleteMemoryFromCloud,
  deleteTripFromCloud,
  updateMemoryInCloud,
} from '../services/cloudDeleteService';
import {
  CloudSyncResult,
  CloudSyncStatus,
  getLastSyncedAt,
  runFullCloudSync,
} from '../services/cloudSyncService';
import {
  deleteLocalPhotoFiles,
  deleteLocalTripMediaDir,
} from '../services/mediaService';
import {
  DEFAULT_USD_RATES,
  fetchHistoricalUsdRates,
  fetchLatestUsdRates,
  FxRatesMap,
  FxRateSnapshotsMap,
} from '../services/fxService';
import { collectRequiredFxDates, getTodayYmd } from '../services/spendCurrencyUtils';
import {
  cancelAllTravelReminders,
  getTravelRemindersEnabled,
  requestReminderPermissions,
  setTravelRemindersEnabledMeta,
  syncTravelReminders,
} from '../services/reminderService';
import {
  DriveBackupMetadata,
  formatDriveFirstName,
} from '../services/driveBackupHelpers';
import {
  checkDriveBackupMetadata,
  configureGoogleDriveAuth,
  deleteGoogleDriveBackup,
  DriveBackupLocalSummary,
  DriveBackupRunResult,
  DriveProgress,
  DriveRestoreRunResult,
  getLastDriveBackupAt,
  getLastDriveBackupSummary,
  isPendingWifiDriveBackup,
  markLocalDataModified,
  runGoogleDriveBackup,
  runGoogleDriveRestore,
  setPendingWifiDriveBackup,
  setStoredWifiOnlyBackup,
  signInWithGoogleDrive,
  signOutGoogleDrive,
} from '../services/googleDriveBackupService';
import {
  disableDailyDriveBackup,
  enableDailyDriveBackup,
  isDailyDriveBackupEnabled,
  maybeRunForegroundCatchUpBackup,
} from '../services/driveAutoBackupTask';
import {
  CoTravelerRole,
  DistanceUnit,
  Expense,
  Flight,
  LoyaltyAccount,
  Memory,
  Stay,
  TransportLeg,
  Trip,
  TripStop,
  TripSummaryStats,
  UserProfile,
} from '../types/models';

export type DriveBusyMode =
  | 'idle'
  | 'signing_in'
  | 'checking'
  | 'backing_up'
  | 'restoring'
  | 'deleting';

export type GoogleAccountSignInOutcome =
  | { status: 'cancelled' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      profile: UserProfile;
      remoteBackup: DriveBackupMetadata;
      accessToken: string;
      deferred: boolean;
    };

interface AppContextValue {
  ready: boolean;
  profile: UserProfile | null;
  cloudConfigured: boolean;
  syncStatus: CloudSyncStatus;
  pendingSyncCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  lastSyncSummary: string | null;
  // Personal Google Drive Backup & Restore (v0.7.0)
  driveBusyMode: DriveBusyMode;
  driveProgress: DriveProgress | null;
  driveError: string | null;
  lastDriveBackupAt: string | null;
  lastDriveBackupSummary: DriveBackupLocalSummary | null;
  driveRemoteBackup: DriveBackupMetadata | null;
  driveAutoBackupEnabled: boolean;
  drivePendingWifiBackup: boolean;
  signInWithGoogleAccount: (options?: {
    homeCurrency?: string;
    distanceUnit?: DistanceUnit;
    deferCommitIfBackupFound?: boolean;
  }) => Promise<GoogleAccountSignInOutcome>;
  commitGoogleProfile: (nextProfile: UserProfile) => Promise<void>;
  signOutGoogleAccount: () => Promise<void>;
  backUpToGoogleDrive: (options?: {
    allowCellularOverride?: boolean;
  }) => Promise<DriveBackupRunResult>;
  queueDriveBackupForWifi: () => void;
  restoreFromGoogleDrive: (
    mode: 'merge' | 'replace',
    accessToken?: string
  ) => Promise<DriveRestoreRunResult>;
  deleteGoogleDriveCloudBackup: () => Promise<{
    status: 'success' | 'signed_out' | 'error';
    deletedCount?: number;
    error?: string;
  }>;
  toggleDailyDriveBackup: (enable: boolean) => Promise<{ enabled: boolean; reason?: string }>;
  refreshDriveBackupMetadata: () => Promise<DriveBackupMetadata>;
  trips: Trip[];
  allFlights: Flight[];
  allTransports: TransportLeg[];
  allStops: TripStop[];
  allStays: Stay[];
  allExpenses: Expense[];
  allMemories: Memory[];
  loyaltyAccounts: LoyaltyAccount[];
  fxRates: FxRatesMap;
  fxSnapshots: FxRateSnapshotsMap;
  fxSource: 'live' | 'fallback';
  remindersEnabled: boolean;
  scheduledRemindersCount: number;
  toggleTravelReminders: (enable: boolean) => Promise<boolean>;
  refreshAll: () => void;
  clearAllData: () => void;
  syncNow: () => Promise<CloudSyncResult>;
  connectGoogleCloud: () => Promise<boolean>;
  disconnectCloud: () => Promise<void>;
  startLocalTravelogue: (
    homeCurrency?: string,
    firstName?: string,
    distanceUnit?: DistanceUnit
  ) => Promise<void>;
  loginWithGoogle: (
    homeCurrency?: string,
    email?: string,
    name?: string,
    distanceUnit?: DistanceUnit
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfileSettings: (patch: Partial<UserProfile>) => Promise<void>;
  addTrip: (trip: Trip) => void;
  editTrip: (tripId: string, patch: TripEditablePatch) => void;
  removeTrip: (tripId: string) => Promise<void>;
  setTripCoverPhoto: (tripId: string, uri: string | null) => void;
  saveTripSharing: (
    tripId: string,
    isShared: boolean,
    coTravelers: string[],
    shareToken: string,
    coTravelerRoles?: Record<string, CoTravelerRole>
  ) => void;
  addFlight: (flight: Flight) => void;
  editFlight: (flightId: string, patch: FlightEditablePatch) => void;
  removeFlight: (flightId: string) => Promise<void>;
  addTransport: (transport: TransportLeg) => void;
  editTransport: (transport: TransportLeg) => void;
  removeTransport: (transportId: string) => Promise<void>;
  addTripStop: (stop: TripStop) => void;
  removeTripStop: (stopId: string) => Promise<void>;
  addStay: (stay: Stay) => void;
  editStay: (stay: Stay) => void;
  removeStay: (stayId: string) => Promise<void>;
  addExpense: (expense: Expense) => void;
  removeExpense: (expenseId: string) => Promise<void>;
  updateSpendItemFxDate: (
    source: 'expense' | 'transport' | 'stay',
    id: string,
    fxDate: string | null,
    payLater: boolean
  ) => void;
  addMemory: (memory: Memory) => void;
  editMemory: (memoryId: string, patch: MemoryEditablePatch) => Promise<void>;
  removeMemory: (memoryId: string) => Promise<{ cloudSynced: boolean }>;
  getFlightsForTrip: (tripId: string) => Flight[];
  getTransportsForTrip: (tripId: string) => TransportLeg[];
  getStopsForTrip: (tripId: string) => TripStop[];
  getStaysForTrip: (tripId: string) => Stay[];
  getExpensesForTrip: (tripId: string) => Expense[];
  getMemoriesForTrip: (tripId: string) => Memory[];
  getSummaryForTrip: (tripId: string) => TripSummaryStats;
}

const AppContext = createContext<AppContextValue | null>(null);

function makeAvatarInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return 'WL';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'WL';
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const cloudReady = isCloudConfigured();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [allFlights, setAllFlights] = useState<Flight[]>([]);
  const [allTransports, setAllTransports] = useState<TransportLeg[]>([]);
  const [allStops, setAllStops] = useState<TripStop[]>([]);
  const [allStays, setAllStays] = useState<Stay[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [loyaltyAccounts, setLoyaltyAccounts] = useState<LoyaltyAccount[]>([]);
  const [fxRates, setFxRates] = useState<FxRatesMap>(DEFAULT_USD_RATES);
  const [fxSnapshots, setFxSnapshots] = useState<FxRateSnapshotsMap>({});
  const [fxSource, setFxSource] = useState<'live' | 'fallback'>('fallback');
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [scheduledRemindersCount, setScheduledRemindersCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(
    cloudReady ? 'signed_out' : 'offline_only'
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = useState<string | null>(null);

  // Personal Google Drive Backup & Restore state
  const [driveBusyMode, setDriveBusyMode] = useState<DriveBusyMode>('idle');
  const [driveProgress, setDriveProgress] = useState<DriveProgress | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [lastDriveBackupAt, setLastDriveBackupAt] = useState<string | null>(null);
  const [lastDriveBackupSummary, setLastDriveBackupSummary] =
    useState<DriveBackupLocalSummary | null>(null);
  const [driveRemoteBackup, setDriveRemoteBackup] = useState<DriveBackupMetadata | null>(null);
  const [driveAutoBackupEnabled, setDriveAutoBackupEnabled] = useState(false);
  const [drivePendingWifiBackup, setDrivePendingWifiBackup] = useState(false);

  const syncInFlightRef = useRef(false);
  const catchUpInFlightRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  const fxSnapshotsRef = useRef<FxRateSnapshotsMap>({});
  const fxFetchingDatesRef = useRef<Set<string>>(new Set());
  profileRef.current = profile;
  fxSnapshotsRef.current = fxSnapshots;

  const ensureFxSnapshotsForDates = useCallback((dates: string[]) => {
    const missing = dates.filter(
      (d) => !fxSnapshotsRef.current[d] && !fxFetchingDatesRef.current.has(d)
    );
    if (missing.length === 0) return;

    missing.forEach((d) => fxFetchingDatesRef.current.add(d));
    (async () => {
      const fetched: FxRateSnapshotsMap = {};
      // Fetch sequentially in small gentle batches so we never hammer Frankfurter API
      for (const dateKey of missing.slice(0, 20)) {
        try {
          const res = await fetchHistoricalUsdRates(dateKey);
          if (res?.rates) {
            saveFxRateSnapshot(dateKey, res.rates, 'live');
            fetched[dateKey] = res.rates;
          }
        } catch {
          // Offline or timeout — skip cleanly and try again next launch
        } finally {
          fxFetchingDatesRef.current.delete(dateKey);
        }
      }
      if (Object.keys(fetched).length > 0) {
        setFxSnapshots((prev) => {
          const next = { ...prev, ...fetched };
          fxSnapshotsRef.current = next;
          return next;
        });
      }
    })();
  }, []);

  const loadLocalSnapshotIntoState = useCallback(() => {
    const nextTrips = listTrips();
    const nextFlights = listFlights();
    const nextTransports = listTransports();
    const nextStays = listStays();
    const nextExpenses = listExpenses();
    const storedFxSnapshots = loadAllFxRateSnapshots();
    setTrips(nextTrips);
    setAllFlights(nextFlights);
    setAllTransports(nextTransports);
    setAllStops(listTripStops());
    setAllStays(nextStays);
    setAllExpenses(nextExpenses);
    setAllMemories(listMemories());
    setLoyaltyAccounts(listLoyaltyAccounts());
    setPendingSyncCount(getPendingSyncCount());
    setFxSnapshots(storedFxSnapshots);
    fxSnapshotsRef.current = storedFxSnapshots;

    const requiredDates = collectRequiredFxDates({
      expenses: nextExpenses,
      transports: nextTransports,
      stays: nextStays,
    });
    if (requiredDates.length > 0) {
      ensureFxSnapshotsForDates(requiredDates);
    }

    const remEnabled = getTravelRemindersEnabled();
    setRemindersEnabled(remEnabled);
    if (remEnabled) {
      syncTravelReminders({
        trips: nextTrips,
        flights: nextFlights,
        stays: nextStays,
        transports: nextTransports,
      })
        .then((r) => setScheduledRemindersCount(r.scheduledCount))
        .catch(() => {});
    }
  }, [ensureFxSnapshotsForDates]);

  const toggleTravelReminders = useCallback(async (enable: boolean): Promise<boolean> => {
    if (!enable) {
      setTravelRemindersEnabledMeta(false);
      setRemindersEnabled(false);
      setScheduledRemindersCount(0);
      await cancelAllTravelReminders();
      return false;
    }
    const granted = await requestReminderPermissions();
    if (!granted) {
      setTravelRemindersEnabledMeta(false);
      setRemindersEnabled(false);
      setScheduledRemindersCount(0);
      return false;
    }
    setTravelRemindersEnabledMeta(true);
    setRemindersEnabled(true);
    const res = await syncTravelReminders({
      trips: listTrips(),
      flights: listFlights(),
      stays: listStays(),
      transports: listTransports(),
    });
    setScheduledRemindersCount(res.scheduledCount);
    return true;
  }, []);

  const syncNowWithProfile = useCallback(
    async (targetProfile: UserProfile | null): Promise<CloudSyncResult> => {
      if (!cloudReady) {
        setSyncStatus('offline_only');
        return {
          status: 'unconfigured',
          pushedRows: 0,
          pulledRows: 0,
          deletedRows: 0,
          mediaUploaded: 0,
          mediaDownloaded: 0,
        };
      }
      if (!targetProfile || targetProfile.authMode !== 'google') {
        setSyncStatus('signed_out');
        return {
          status: 'signed_out',
          pushedRows: 0,
          pulledRows: 0,
          deletedRows: 0,
          mediaUploaded: 0,
          mediaDownloaded: 0,
        };
      }
      if (syncInFlightRef.current) {
        return {
          status: 'synced',
          pushedRows: 0,
          pulledRows: 0,
          deletedRows: 0,
          mediaUploaded: 0,
          mediaDownloaded: 0,
          syncedAt: lastSyncedAt ?? undefined,
        };
      }

      syncInFlightRef.current = true;
      setSyncStatus('syncing');
      setSyncError(null);
      try {
        const res = await runFullCloudSync(targetProfile, { uploadMedia: true });
        loadLocalSnapshotIntoState();
        if (res.status === 'synced') {
          setSyncStatus('synced');
          if (res.syncedAt) {
            setLastSyncedAt(res.syncedAt);
            const updatedProfile: UserProfile = { ...targetProfile, lastSyncedAt: res.syncedAt };
            await saveProfile(updatedProfile);
            setProfile(updatedProfile);
          }
          const parts: string[] = [];
          if (res.pushedRows > 0) parts.push(`↑ ${res.pushedRows} backed up`);
          if (res.pulledRows > 0) parts.push(`↓ ${res.pulledRows} restored`);
          if (res.mediaUploaded > 0) parts.push(`📸 ${res.mediaUploaded} uploaded`);
          if (res.mediaDownloaded > 0) parts.push(`📥 ${res.mediaDownloaded} downloaded`);
          setLastSyncSummary(parts.length > 0 ? parts.join(' • ') : 'Everything up to date ✓');
        } else if (res.status === 'signed_out') {
          setSyncStatus('signed_out');
        } else if (res.status === 'unconfigured') {
          setSyncStatus('offline_only');
        } else {
          setSyncStatus('error');
          setSyncError(res.error || 'Sync failed — local changes are still safe.');
        }
        return res;
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [cloudReady, lastSyncedAt, loadLocalSnapshotIntoState]
  );

  const scheduleBackgroundSync = useCallback(() => {
    if (!cloudReady) return;
    const p = profileRef.current;
    if (!p || p.authMode !== 'google') return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      syncNowWithProfile(profileRef.current).catch(() => {});
    }, 2500);
  }, [cloudReady, syncNowWithProfile]);

  const refreshAll = useCallback(() => {
    markLocalDataModified();
    loadLocalSnapshotIntoState();
    scheduleBackgroundSync();
  }, [loadLocalSnapshotIntoState, scheduleBackgroundSync]);

  const syncNow = useCallback(
    () => syncNowWithProfile(profileRef.current),
    [syncNowWithProfile]
  );

  // ------------------------------------------------------------------
  // Personal Google Drive Backup & Restore (v0.7.0)
  // ------------------------------------------------------------------

  const refreshDriveMetaFromDb = useCallback(() => {
    const savedAt = getLastDriveBackupAt();
    setLastDriveBackupAt(savedAt && savedAt.trim() ? savedAt : null);
    setLastDriveBackupSummary(getLastDriveBackupSummary());
    setDriveAutoBackupEnabled(isDailyDriveBackupEnabled());
    setDrivePendingWifiBackup(isPendingWifiDriveBackup());
  }, []);

  const commitGoogleProfile = useCallback(
    async (nextProfile: UserProfile) => {
      setStoredWifiOnlyBackup(Boolean(nextProfile.wifiOnlyPhotoSync));
      await saveProfile(nextProfile);
      setProfile(nextProfile);
      profileRef.current = nextProfile;
      loadLocalSnapshotIntoState();
      refreshDriveMetaFromDb();
    },
    [loadLocalSnapshotIntoState, refreshDriveMetaFromDb]
  );

  const signInWithGoogleAccount = useCallback(
    async (options?: {
      homeCurrency?: string;
      distanceUnit?: DistanceUnit;
      deferCommitIfBackupFound?: boolean;
    }): Promise<GoogleAccountSignInOutcome> => {
      setDriveBusyMode('signing_in');
      setDriveError(null);
      setDriveProgress({
        phase: 'checking',
        completed: 0,
        total: 1,
        label: 'Signing in with Google…',
      });

      try {
        const res = await signInWithGoogleDrive();
        if (res.status === 'cancelled') {
          return { status: 'cancelled' };
        }
        if (res.status === 'error') {
          setDriveError(res.message);
          return { status: 'error', message: res.message };
        }

        setDriveBusyMode('checking');
        setDriveProgress({
          phase: 'checking',
          completed: 0,
          total: 1,
          label: 'Checking Google Drive for an existing backup…',
        });

        const remoteBackup = await checkDriveBackupMetadata(res.accessToken);
        setDriveRemoteBackup(remoteBackup);

        const cur = profileRef.current;
        const googleFirstName = formatDriveFirstName(
          res.user.givenName,
          res.user.name,
          res.user.email
        );
        // If user already customized their Passport name (not default 'Wanderer'), preserve it!
        // Otherwise pre-fill their Google first name (still editable anytime in Passport).
        const resolvedName =
          cur && cur.displayName && cur.displayName !== 'Wanderer'
            ? cur.displayName
            : googleFirstName;

        const nextProfile: UserProfile = {
          id: cur?.id && cur.id !== 'local_wanderer' ? cur.id : `google_${res.user.id}`,
          email: res.user.email,
          displayName: resolvedName,
          avatarInitials: makeAvatarInitials(resolvedName),
          avatarUrl: res.user.photo ?? cur?.avatarUrl,
          homeCurrency: options?.homeCurrency || cur?.homeCurrency || 'USD',
          distanceUnit: options?.distanceUnit || cur?.distanceUnit || 'km',
          wifiOnlyPhotoSync: cur?.wifiOnlyPhotoSync ?? true,
          authMode: 'google',
          lastSyncedAt: remoteBackup.updatedAt ?? cur?.lastSyncedAt,
        };

        const shouldDefer = Boolean(options?.deferCommitIfBackupFound && remoteBackup.exists);
        if (!shouldDefer) {
          await commitGoogleProfile(nextProfile);
        }

        return {
          status: 'success',
          profile: nextProfile,
          remoteBackup,
          accessToken: res.accessToken,
          deferred: shouldDefer,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
        setDriveError(msg);
        return { status: 'error', message: msg };
      } finally {
        setDriveBusyMode('idle');
        setDriveProgress(null);
      }
    },
    [commitGoogleProfile]
  );

  const signOutGoogleAccount = useCallback(async (): Promise<void> => {
    await disableDailyDriveBackup();
    await signOutGoogleDrive();
    const cur = profileRef.current;
    if (cur) {
      const localOnly: UserProfile = {
        ...cur,
        email: '',
        avatarUrl: undefined,
        authMode: 'local_test',
      };
      await saveProfile(localOnly);
      setProfile(localOnly);
      profileRef.current = localOnly;
    }
    setDriveAutoBackupEnabled(false);
    setDrivePendingWifiBackup(false);
    setDriveRemoteBackup(null);
    setDriveError(null);
    setDriveProgress(null);
  }, []);

  const queueDriveBackupForWifi = useCallback(() => {
    setPendingWifiDriveBackup(true);
    setDrivePendingWifiBackup(true);
    setDriveError(null);
  }, []);

  const backUpToGoogleDrive = useCallback(
    async (options?: { allowCellularOverride?: boolean }): Promise<DriveBackupRunResult> => {
      const wifiOnly = Boolean(profileRef.current?.wifiOnlyPhotoSync ?? true);
      setStoredWifiOnlyBackup(wifiOnly);
      setDriveBusyMode('backing_up');
      setDriveError(null);
      setDriveProgress({
        phase: 'checking',
        completed: 0,
        total: 1,
        label: 'Preparing backup…',
      });
      try {
        const res = await runGoogleDriveBackup({
          wifiOnly,
          allowCellularOverride: options?.allowCellularOverride,
          onProgress: (p) => setDriveProgress(p),
        });
        refreshDriveMetaFromDb();
        if (res.status === 'success') {
          setDriveRemoteBackup({
            exists: true,
            updatedAt: res.updatedAt,
            appVersion: '0.7.1',
            tripsCount: res.tripsCount ?? 0,
            flightsCount: allFlights.length,
            memoriesCount: res.memoriesCount ?? 0,
            mediaCount: (res.mediaUploaded ?? 0) + (res.mediaSkipped ?? 0),
            totalMediaBytes: res.totalBytes ?? 0,
          });
        } else if (res.status === 'error' || res.status === 'signed_out') {
          setDriveError(res.error || 'Backup could not complete right now.');
        }
        return res;
      } finally {
        setDriveBusyMode('idle');
        setDriveProgress(null);
      }
    },
    [allFlights.length, refreshDriveMetaFromDb]
  );

  const restoreFromGoogleDrive = useCallback(
    async (mode: 'merge' | 'replace', accessToken?: string): Promise<DriveRestoreRunResult> => {
      setDriveBusyMode('restoring');
      setDriveError(null);
      setDriveProgress({
        phase: 'downloading_manifest',
        completed: 0,
        total: 1,
        label: 'Reading your Google Drive backup…',
      });
      try {
        const res = await runGoogleDriveRestore(mode, {
          accessToken,
          onProgress: (p) => setDriveProgress(p),
        });
        if (res.status === 'success') {
          loadLocalSnapshotIntoState();
          refreshDriveMetaFromDb();
        } else if (res.status === 'error' || res.status === 'signed_out') {
          setDriveError(res.error || 'Restore could not complete right now.');
        }
        return res;
      } finally {
        setDriveBusyMode('idle');
        setDriveProgress(null);
      }
    },
    [loadLocalSnapshotIntoState, refreshDriveMetaFromDb]
  );

  const deleteGoogleDriveCloudBackup = useCallback(async () => {
    setDriveBusyMode('deleting');
    setDriveError(null);
    try {
      const res = await deleteGoogleDriveBackup((p) => setDriveProgress(p));
      if (res.status === 'success') {
        setDriveRemoteBackup({
          exists: false,
          tripsCount: 0,
          flightsCount: 0,
          memoriesCount: 0,
          mediaCount: 0,
          totalMediaBytes: 0,
        });
        refreshDriveMetaFromDb();
      } else if (res.error) {
        setDriveError(res.error);
      }
      return res;
    } finally {
      setDriveBusyMode('idle');
      setDriveProgress(null);
    }
  }, [refreshDriveMetaFromDb]);

  const toggleDailyDriveBackup = useCallback(
    async (enable: boolean): Promise<{ enabled: boolean; reason?: string }> => {
      if (!enable) {
        await disableDailyDriveBackup();
        setDriveAutoBackupEnabled(false);
        return { enabled: false };
      }
      const res = await enableDailyDriveBackup();
      setDriveAutoBackupEnabled(res.enabled);
      return res;
    },
    []
  );

  const refreshDriveBackupMetadata = useCallback(async (): Promise<DriveBackupMetadata> => {
    const meta = await checkDriveBackupMetadata();
    setDriveRemoteBackup(meta);
    return meta;
  }, []);

  const connectGoogleCloud = useCallback(async (): Promise<boolean> => {
    if (!cloudReady) return false;
    const cur = profileRef.current;
    const signedIn = await signInWithGoogle(
      cur?.homeCurrency || 'USD',
      cur?.email,
      cur?.displayName,
      cur?.distanceUnit || 'km'
    );
    if (signedIn.authMode !== 'google') {
      return false;
    }
    // Preserve local preferences if user already personalized them
    const merged: UserProfile = {
      ...signedIn,
      homeCurrency: cur?.homeCurrency || signedIn.homeCurrency,
      distanceUnit: cur?.distanceUnit || signedIn.distanceUnit,
      wifiOnlyPhotoSync: cur?.wifiOnlyPhotoSync ?? true,
    };
    await saveProfile(merged);
    setProfile(merged);
    profileRef.current = merged;
    await syncNowWithProfile(merged);
    return true;
  }, [cloudReady, syncNowWithProfile]);

  const disconnectCloud = useCallback(async (): Promise<void> => {
    const sb = getSupabaseClient();
    if (sb) {
      try {
        await sb.auth.signOut();
      } catch {
        // Ignore offline sign-out errors
      }
    }
    const cur = profileRef.current;
    if (cur) {
      const localOnly: UserProfile = {
        ...cur,
        email: '',
        authMode: 'local_test',
      };
      await saveProfile(localOnly);
      setProfile(localOnly);
      profileRef.current = localOnly;
    }
    setSyncStatus(cloudReady ? 'signed_out' : 'offline_only');
    setSyncError(null);
    setLastSyncSummary(null);
  }, [cloudReady]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        getDb();
        purgeLegacySeedDataIfNeeded();
        configureGoogleDriveAuth();
        const saved = await loadSavedProfile();
        const cachedFx = loadCachedFxRates();
        const storedSnapshots = loadAllFxRateSnapshots();
        const savedSyncTime = getLastSyncedAt();
        const savedDriveAt = getLastDriveBackupAt();
        const savedDriveSummary = getLastDriveBackupSummary();
        const savedAutoBackup = isDailyDriveBackupEnabled();
        const savedPendingWifi = isPendingWifiDriveBackup();
        if (saved) {
          setStoredWifiOnlyBackup(Boolean(saved.wifiOnlyPhotoSync));
        }
        if (mounted) {
          setFxRates(cachedFx);
          setFxSnapshots(storedSnapshots);
          fxSnapshotsRef.current = storedSnapshots;
          setLastSyncedAt(savedSyncTime || saved?.lastSyncedAt || null);
          setLastDriveBackupAt(savedDriveAt && savedDriveAt.trim() ? savedDriveAt : null);
          setLastDriveBackupSummary(savedDriveSummary);
          setDriveAutoBackupEnabled(savedAutoBackup);
          setDrivePendingWifiBackup(savedPendingWifi);
          if (saved) {
            setProfile(saved);
            profileRef.current = saved;
            loadLocalSnapshotIntoState();
            if (!cloudReady) {
              setSyncStatus('offline_only');
            } else if (saved.authMode === 'google') {
              setSyncStatus('idle');
            } else {
              setSyncStatus('signed_out');
            }
          }
          setReady(true);
        }

        // Silent foreground catch-up for Daily Google Drive Auto-Backup or deferred Wi-Fi backup
        if (mounted && saved?.authMode === 'google' && (savedAutoBackup || savedPendingWifi)) {
          maybeRunForegroundCatchUpBackup()
            .then((status) => {
              if ((status === 'ran' || status === 'waiting_wifi') && mounted) {
                refreshDriveMetaFromDb();
              }
            })
            .catch(() => {});
        }

        // Silent background sync on startup ONLY when legacy Supabase cloud is configured
        if (mounted && cloudReady && saved?.authMode === 'google') {
          syncNowWithProfile(saved).catch(() => {});
        }

        // Background daily FX rate refresh (free Frankfurter ECB API)
        const latest = await fetchLatestUsdRates();
        if (mounted) {
          setFxRates(latest.rates);
          setFxSource(latest.source);
          if (latest.source === 'live') {
            saveFxRates(latest.rates, latest.updatedAt);
            const todayKey = getTodayYmd();
            saveFxRateSnapshot(todayKey, latest.rates, 'live');
            setFxSnapshots((prev) => {
              const next = { ...prev, [todayKey]: latest.rates };
              fxSnapshotsRef.current = next;
              return next;
            });
          }
        }
      } catch {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [cloudReady, loadLocalSnapshotIntoState, refreshDriveMetaFromDb, syncNowWithProfile]);

  // Live Wi-Fi & Foreground Resume Listener: automatically resumes any skipped daily backup
  // the instant Wi-Fi becomes available (or when returning to the app on Wi-Fi).
  useEffect(() => {
    const runCatchUp = () => {
      const p = profileRef.current;
      if (!p || p.authMode !== 'google') return;
      if (catchUpInFlightRef.current) return;
      if (!isPendingWifiDriveBackup() && !isDailyDriveBackupEnabled()) return;

      catchUpInFlightRef.current = true;
      maybeRunForegroundCatchUpBackup()
        .then((status) => {
          if (status === 'ran' || status === 'waiting_wifi') {
            refreshDriveMetaFromDb();
          }
        })
        .catch(() => {})
        .finally(() => {
          catchUpInFlightRef.current = false;
        });
    };

    let netSub: { remove: () => void } | null = null;
    try {
      netSub = Network.addNetworkStateListener((event) => {
        const isWifiOrEth =
          event.type === Network.NetworkStateType.WIFI ||
          event.type === Network.NetworkStateType.ETHERNET;
        if (event.isConnected && event.isInternetReachable !== false && isWifiOrEth) {
          runCatchUp();
        }
      });
    } catch {
      netSub = null;
    }

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        runCatchUp();
      }
    });

    return () => {
      try {
        netSub?.remove();
      } catch {
        // Non-fatal cleanup error
      }
      appStateSub.remove();
    };
  }, [refreshDriveMetaFromDb]);

  const startLocalTravelogue = useCallback(
    async (homeCurrency = 'USD', firstName?: string, distanceUnit: DistanceUnit = 'km') => {
      const p = await startLocalSession(homeCurrency, firstName, distanceUnit);
      setProfile(p);
      profileRef.current = p;
      loadLocalSnapshotIntoState();
      setSyncStatus(cloudReady ? 'signed_out' : 'offline_only');
    },
    [cloudReady, loadLocalSnapshotIntoState]
  );

  const loginWithGoogle = useCallback(
    async (
      homeCurrency = 'USD',
      email?: string,
      name?: string,
      distanceUnit: DistanceUnit = 'km'
    ) => {
      const p = await signInWithGoogle(homeCurrency, email, name, distanceUnit);
      setProfile(p);
      profileRef.current = p;
      loadLocalSnapshotIntoState();
      if (cloudReady && p.authMode === 'google') {
        await syncNowWithProfile(p);
      }
    },
    [cloudReady, loadLocalSnapshotIntoState, syncNowWithProfile]
  );

  const clearAllData = useCallback(() => {
    const existingTrips = listTrips();
    clearAllLocalData();
    loadLocalSnapshotIntoState();
    existingTrips.forEach((t) => {
      deleteLocalTripMediaDir(t.id).catch(() => {});
    });
  }, [loadLocalSnapshotIntoState]);

  const logout = useCallback(async () => {
    await clearProfile();
    setProfile(null);
    profileRef.current = null;
  }, []);

  const updateProfileSettings = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (!profile) return;
      const updated: UserProfile = { ...profile, ...patch };
      if (typeof patch.wifiOnlyPhotoSync === 'boolean') {
        setStoredWifiOnlyBackup(patch.wifiOnlyPhotoSync);
        // If user turns OFF Wi-Fi-only while a backup was waiting for Wi-Fi, resume right away
        if (!patch.wifiOnlyPhotoSync && updated.authMode === 'google' && isPendingWifiDriveBackup()) {
          maybeRunForegroundCatchUpBackup()
            .then((status) => {
              if (status === 'ran') refreshDriveMetaFromDb();
            })
            .catch(() => {});
        }
      }
      await saveProfile(updated);
      setProfile(updated);
      profileRef.current = updated;
      scheduleBackgroundSync();
    },
    [profile, refreshDriveMetaFromDb, scheduleBackgroundSync]
  );

  const addTrip = useCallback(
    (trip: Trip) => {
      insertTrip(trip);
      refreshAll();
    },
    [refreshAll]
  );

  const editTrip = useCallback(
    (tripId: string, patch: TripEditablePatch) => {
      updateTrip(tripId, patch);
      refreshAll();
    },
    [refreshAll]
  );

  const removeTrip = useCallback(
    async (tripId: string) => {
      const tripMemories = listMemories(tripId);
      deleteTrip(tripId);
      refreshAll();
      await deleteLocalTripMediaDir(tripId);
      const res = await deleteTripFromCloud(tripId, tripMemories);
      if (res.synced) {
        clearSyncMutation('trips', tripId, 'delete');
      }
    },
    [refreshAll]
  );

  const setTripCoverPhoto = useCallback(
    (tripId: string, uri: string | null) => {
      updateTripCover(tripId, uri);
      refreshAll();
    },
    [refreshAll]
  );

  const saveTripSharing = useCallback(
    (
      tripId: string,
      isShared: boolean,
      coTravelers: string[],
      shareToken: string,
      coTravelerRoles?: Record<string, CoTravelerRole>
    ) => {
      updateTripSharing(tripId, isShared, coTravelers, shareToken, coTravelerRoles);
      refreshAll();
    },
    [refreshAll]
  );

  const addFlight = useCallback(
    (flight: Flight) => {
      insertFlight(flight);
      refreshAll();
    },
    [refreshAll]
  );

  const editFlight = useCallback(
    (flightId: string, patch: FlightEditablePatch) => {
      updateFlight(flightId, patch);
      refreshAll();
    },
    [refreshAll]
  );

  const removeFlight = useCallback(
    async (flightId: string) => {
      deleteFlight(flightId);
      refreshAll();
      const res = await deleteEntityFromCloud('flights', flightId);
      if (res.synced) clearSyncMutation('flights', flightId, 'delete');
    },
    [refreshAll]
  );

  const addTransport = useCallback(
    (transport: TransportLeg) => {
      insertTransport(transport);
      refreshAll();
    },
    [refreshAll]
  );

  const editTransport = useCallback(
    (transport: TransportLeg) => {
      insertTransport(transport);
      refreshAll();
    },
    [refreshAll]
  );

  const removeTransport = useCallback(
    async (transportId: string) => {
      deleteTransport(transportId);
      refreshAll();
      const res = await deleteEntityFromCloud('transports', transportId);
      if (res.synced) clearSyncMutation('transports', transportId, 'delete');
    },
    [refreshAll]
  );

  const addTripStop = useCallback(
    (stop: TripStop) => {
      insertTripStop(stop);
      refreshAll();
    },
    [refreshAll]
  );

  const removeTripStop = useCallback(
    async (stopId: string) => {
      deleteTripStop(stopId);
      refreshAll();
      const res = await deleteEntityFromCloud('trip_stops', stopId);
      if (res.synced) clearSyncMutation('trip_stops', stopId, 'delete');
    },
    [refreshAll]
  );

  const addStay = useCallback(
    (stay: Stay) => {
      insertStay(stay);
      refreshAll();
    },
    [refreshAll]
  );

  const editStay = useCallback(
    (stay: Stay) => {
      insertStay(stay);
      refreshAll();
    },
    [refreshAll]
  );

  const removeStay = useCallback(
    async (stayId: string) => {
      deleteStay(stayId);
      refreshAll();
      const res = await deleteEntityFromCloud('stays', stayId);
      if (res.synced) clearSyncMutation('stays', stayId, 'delete');
    },
    [refreshAll]
  );

  const addExpense = useCallback(
    (expense: Expense) => {
      insertExpense(expense);
      refreshAll();
    },
    [refreshAll]
  );

  const removeExpense = useCallback(
    async (expenseId: string) => {
      const { receiptUri } = deleteExpense(expenseId);
      refreshAll();
      await deleteLocalPhotoFiles([receiptUri]);
      const res = await deleteEntityFromCloud('expenses', expenseId);
      if (res.synced) clearSyncMutation('expenses', expenseId, 'delete');
    },
    [refreshAll]
  );

  const updateSpendItemFxDate = useCallback(
    (
      source: 'expense' | 'transport' | 'stay',
      id: string,
      fxDate: string | null,
      payLater: boolean
    ) => {
      updateSpendItemFxSettings(source, id, payLater ? null : fxDate, payLater);
      refreshAll();
    },
    [refreshAll]
  );

  const addMemory = useCallback(
    (memory: Memory) => {
      insertMemory(memory);
      refreshAll();
    },
    [refreshAll]
  );

  const editMemory = useCallback(
    async (memoryId: string, patch: MemoryEditablePatch) => {
      const res = updateMemory(memoryId, patch);
      refreshAll();
      if (!res) return;

      if (res.previousPhotoUri || res.previousThumbUri) {
        await deleteLocalPhotoFiles([res.previousPhotoUri, res.previousThumbUri]);
      }
      const cloudRes = await updateMemoryInCloud(res.updated);
      if (cloudRes.synced) {
        clearSyncMutation('memories', memoryId, 'upsert');
      }
    },
    [refreshAll]
  );

  const removeMemory = useCallback(
    async (memoryId: string): Promise<{ cloudSynced: boolean }> => {
      const deleted = deleteMemory(memoryId);
      refreshAll();
      if (!deleted) return { cloudSynced: false };

      await deleteLocalPhotoFiles([deleted.photoUri, deleted.thumbUri]);
      const cloudRes = await deleteMemoryFromCloud(deleted);
      if (cloudRes.synced) {
        clearSyncMutation('memories', memoryId, 'delete');
      }
      return { cloudSynced: cloudRes.synced };
    },
    [refreshAll]
  );

  return (
    <AppContext.Provider
      value={{
        ready,
        profile,
        cloudConfigured: cloudReady,
        syncStatus,
        pendingSyncCount,
        lastSyncedAt,
        syncError,
        lastSyncSummary,
        driveBusyMode,
        driveProgress,
        driveError,
        lastDriveBackupAt,
        lastDriveBackupSummary,
        driveRemoteBackup,
        driveAutoBackupEnabled,
        drivePendingWifiBackup,
        signInWithGoogleAccount,
        commitGoogleProfile,
        signOutGoogleAccount,
        backUpToGoogleDrive,
        queueDriveBackupForWifi,
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
        clearAllData,
        syncNow,
        connectGoogleCloud,
        disconnectCloud,
        startLocalTravelogue,
        loginWithGoogle,
        logout,
        updateProfileSettings,
        addTrip,
        editTrip,
        removeTrip,
        setTripCoverPhoto,
        saveTripSharing,
        addFlight,
        editFlight,
        removeFlight,
        addTransport,
        editTransport,
        removeTransport,
        addTripStop,
        removeTripStop,
        addStay,
        editStay,
        removeStay,
        addExpense,
        removeExpense,
        updateSpendItemFxDate,
        addMemory,
        editMemory,
        removeMemory,
        getFlightsForTrip: (id) => listFlights(id),
        getTransportsForTrip: (id) => listTransports(id),
        getStopsForTrip: (id) => listTripStops(id),
        getStaysForTrip: (id) => listStays(id),
        getExpensesForTrip: (id) => listExpenses(id),
        getMemoriesForTrip: (id) => listMemories(id),
        getSummaryForTrip: (id) =>
          getTripSummary(id, profile?.homeCurrency, fxRates, fxSnapshots),
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
