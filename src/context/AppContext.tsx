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
  updateTripCover,
  updateTripSharing,
} from '../db/database';
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
  removeTrip: (tripId: string) => void;
  setTripCoverPhoto: (tripId: string, uri: string) => void;
  saveTripSharing: (tripId: string, isShared: boolean, coTravelers: string[], shareToken: string) => void;
  addFlight: (flight: Flight) => void;
  addStay: (stay: Stay) => void;
  addExpense: (expense: Expense) => void;
  addMemory: (memory: Memory) => void;
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
    clearAllLocalData();
    refreshAll();
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

  const removeTrip = useCallback(
    (tripId: string) => {
      deleteTrip(tripId);
      refreshAll();
    },
    [refreshAll]
  );

  const setTripCoverPhoto = useCallback(
    (tripId: string, uri: string) => {
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

  const addStay = useCallback(
    (stay: Stay) => {
      insertStay(stay);
      refreshAll();
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

  const addMemory = useCallback(
    (memory: Memory) => {
      insertMemory(memory);
      refreshAll();
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
        removeTrip,
        setTripCoverPhoto,
        saveTripSharing,
        addFlight,
        addStay,
        addExpense,
        addMemory,
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
