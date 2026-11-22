import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearProfile,
  isCloudConfigured,
  loadSavedProfile,
  saveProfile,
  signInWithGoogle,
} from '../services/authService';
import {
  clearAllLocalData,
  clearSyncMutation,
  deleteExpense,
  deleteFlight,
  deleteMemory,
  deleteStay,
  deleteTrip,
  getDb,
  getTripSummary,
  insertExpense,
  insertFlight,
  insertMemory,
  insertStay,
  insertTrip,
  listExpenses,
  listFlights,
  listLoyaltyAccounts,
  listMemories,
  listStays,
  listTrips,
  loadCachedFxRates,
  purgeLegacySeedDataIfNeeded,
  saveFxRates,
  TripEditablePatch,
  updateTrip,
  updateTripCover,
  updateTripSharing,
} from '../db/database';
import {
  deleteEntityFromCloud,
  deleteMemoryFromCloud,
  deleteTripFromCloud,
} from '../services/cloudDeleteService';
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
  Expense,
  Flight,
  LoyaltyAccount,
  Memory,
  Stay,
  Trip,
  TripSummaryStats,
  UserProfile,
} from '../types/models';

interface AppContextValue {
  ready: boolean;
  profile: UserProfile | null;
  cloudConfigured: boolean;
  trips: Trip[];
  allFlights: Flight[];
  allExpenses: Expense[];
  allMemories: Memory[];
  loyaltyAccounts: LoyaltyAccount[];
  fxRates: FxRatesMap;
  fxSource: 'live' | 'fallback';
  refreshAll: () => void;
  clearAllData: () => void;
  loginWithGoogle: (homeCurrency?: string, email?: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfileSettings: (patch: Partial<UserProfile>) => Promise<void>;
  addTrip: (trip: Trip) => void;
  editTrip: (tripId: string, patch: TripEditablePatch) => void;
  removeTrip: (tripId: string) => Promise<void>;
  setTripCoverPhoto: (tripId: string, uri: string | null) => void;
  saveTripSharing: (tripId: string, isShared: boolean, coTravelers: string[], shareToken: string) => void;
  addFlight: (flight: Flight) => void;
  removeFlight: (flightId: string) => Promise<void>;
  addStay: (stay: Stay) => void;
  removeStay: (stayId: string) => Promise<void>;
  addExpense: (expense: Expense) => void;
  removeExpense: (expenseId: string) => Promise<void>;
  addMemory: (memory: Memory) => void;
  removeMemory: (memoryId: string) => Promise<{ cloudSynced: boolean }>;
  getFlightsForTrip: (tripId: string) => Flight[];
  getStaysForTrip: (tripId: string) => Stay[];
  getExpensesForTrip: (tripId: string) => Expense[];
  getMemoriesForTrip: (tripId: string) => Memory[];
  getSummaryForTrip: (tripId: string) => TripSummaryStats;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [allFlights, setAllFlights] = useState<Flight[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [loyaltyAccounts, setLoyaltyAccounts] = useState<LoyaltyAccount[]>([]);
  const [fxRates, setFxRates] = useState<FxRatesMap>(DEFAULT_USD_RATES);
  const [fxSource, setFxSource] = useState<'live' | 'fallback'>('fallback');

  const refreshAll = useCallback(() => {
    setTrips(listTrips());
    setAllFlights(listFlights());
    setAllExpenses(listExpenses());
    setAllMemories(listMemories());
    setLoyaltyAccounts(listLoyaltyAccounts());
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        getDb();
        purgeLegacySeedDataIfNeeded();
        const saved = await loadSavedProfile();
        const cachedFx = loadCachedFxRates();
        if (mounted) {
          setFxRates(cachedFx);
          if (saved) {
            setProfile(saved);
            refreshAll();
          }
          setReady(true);
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
    };
  }, [refreshAll]);

  const loginWithGoogle = useCallback(
    async (homeCurrency = 'USD', email?: string, name?: string) => {
      const p = await signInWithGoogle(homeCurrency, email, name);
      setProfile(p);
      refreshAll();
    },
    [refreshAll]
  );

  const clearAllData = useCallback(() => {
    const existingTrips = listTrips();
    clearAllLocalData();
    refreshAll();
    existingTrips.forEach((t) => {
      deleteLocalTripMediaDir(t.id).catch(() => {});
    });
  }, [refreshAll]);

  const logout = useCallback(async () => {
    await clearProfile();
    setProfile(null);
  }, []);

  const updateProfileSettings = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (!profile) return;
      const updated: UserProfile = { ...profile, ...patch };
      await saveProfile(updated);
      setProfile(updated);
    },
    [profile]
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
    (tripId: string, isShared: boolean, coTravelers: string[], shareToken: string) => {
      updateTripSharing(tripId, isShared, coTravelers, shareToken);
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

  const removeFlight = useCallback(
    async (flightId: string) => {
      deleteFlight(flightId);
      refreshAll();
      const res = await deleteEntityFromCloud('flights', flightId);
      if (res.synced) clearSyncMutation('flights', flightId, 'delete');
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
        cloudConfigured: isCloudConfigured(),
        trips,
        allFlights,
        allExpenses,
        allMemories,
        loyaltyAccounts,
        fxRates,
        fxSource,
        refreshAll,
        clearAllData,
        loginWithGoogle,
        logout,
        updateProfileSettings,
        addTrip,
        editTrip,
        removeTrip,
        setTripCoverPhoto,
        saveTripSharing,
        addFlight,
        removeFlight,
        addStay,
        removeStay,
        addExpense,
        removeExpense,
        addMemory,
        removeMemory,
        getFlightsForTrip: (id) => listFlights(id),
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
