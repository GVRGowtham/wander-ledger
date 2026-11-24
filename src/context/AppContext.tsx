import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  loadCachedFxRates,
  MemoryEditablePatch,
  purgeLegacySeedDataIfNeeded,
  saveFxRates,
  TripEditablePatch,
  updateFlight,
  updateMemory,
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
  fetchLatestUsdRates,
  FxRatesMap,
} from '../services/fxService';
import {
  cancelAllTravelReminders,
  getTravelRemindersEnabled,
  requestReminderPermissions,
  setTravelRemindersEnabledMeta,
  syncTravelReminders,
} from '../services/reminderService';
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

interface AppContextValue {
  ready: boolean;
  profile: UserProfile | null;
  cloudConfigured: boolean;
  syncStatus: CloudSyncStatus;
  pendingSyncCount: number;
  lastSyncedAt: string | null;
  syncError: string | null;
  lastSyncSummary: string | null;
  trips: Trip[];
  allFlights: Flight[];
  allTransports: TransportLeg[];
  allStops: TripStop[];
  allStays: Stay[];
  allExpenses: Expense[];
  allMemories: Memory[];
  loyaltyAccounts: LoyaltyAccount[];
  fxRates: FxRatesMap;
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
  removeTransport: (transportId: string) => Promise<void>;
  addTripStop: (stop: TripStop) => void;
  removeTripStop: (stopId: string) => Promise<void>;
  addStay: (stay: Stay) => void;
  removeStay: (stayId: string) => Promise<void>;
  addExpense: (expense: Expense) => void;
  removeExpense: (expenseId: string) => Promise<void>;
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

  const syncInFlightRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;

  const loadLocalSnapshotIntoState = useCallback(() => {
    const nextTrips = listTrips();
    const nextFlights = listFlights();
    const nextTransports = listTransports();
    const nextStays = listStays();
    setTrips(nextTrips);
    setAllFlights(nextFlights);
    setAllTransports(nextTransports);
    setAllStops(listTripStops());
    setAllStays(nextStays);
    setAllExpenses(listExpenses());
    setAllMemories(listMemories());
    setLoyaltyAccounts(listLoyaltyAccounts());
    setPendingSyncCount(getPendingSyncCount());
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
  }, []);

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
    loadLocalSnapshotIntoState();
    scheduleBackgroundSync();
  }, [loadLocalSnapshotIntoState, scheduleBackgroundSync]);

  const syncNow = useCallback(
    () => syncNowWithProfile(profileRef.current),
    [syncNowWithProfile]
  );

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
        const saved = await loadSavedProfile();
        const cachedFx = loadCachedFxRates();
        const savedSyncTime = getLastSyncedAt();
        if (mounted) {
          setFxRates(cachedFx);
          setLastSyncedAt(savedSyncTime || saved?.lastSyncedAt || null);
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

        // Silent background sync on startup ONLY when cloud is configured & user signed into Google
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
  }, [cloudReady, loadLocalSnapshotIntoState, syncNowWithProfile]);

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
      await saveProfile(updated);
      setProfile(updated);
      profileRef.current = updated;
      scheduleBackgroundSync();
    },
    [profile, scheduleBackgroundSync]
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
        trips,
        allFlights,
        allTransports,
        allStops,
        allStays,
        allExpenses,
        allMemories,
        loyaltyAccounts,
        fxRates,
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
        removeTransport,
        addTripStop,
        removeTripStop,
        addStay,
        removeStay,
        addExpense,
        removeExpense,
        addMemory,
        editMemory,
        removeMemory,
        getFlightsForTrip: (id) => listFlights(id),
        getTransportsForTrip: (id) => listTransports(id),
        getStopsForTrip: (id) => listTripStops(id),
        getStaysForTrip: (id) => listStays(id),
        getExpensesForTrip: (id) => listExpenses(id),
        getMemoriesForTrip: (id) => listMemories(id),
        getSummaryForTrip: (id) => getTripSummary(id),
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
