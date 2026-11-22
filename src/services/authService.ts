import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { UserProfile } from '../types/models';

WebBrowser.maybeCompleteAuthSession();

const PROFILE_KEY = 'wanderledger_user_profile_v1';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anon, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return supabaseInstance;
}

export function isCloudConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function loadSavedProfile(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function clearProfile(): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch {
      // Ignore network errors during sign-out
    }
  }
  await AsyncStorage.removeItem(PROFILE_KEY);
}

/**
 * Initiates Google OAuth via Supabase + Expo AuthSession when cloud keys are configured.
 * When testing locally before Google Cloud OAuth keys are added, gracefully creates a
 * local Google-linked traveler profile so every screen works immediately on Android APK.
 */
export async function signInWithGoogle(
  homeCurrency = 'USD',
  customEmail?: string,
  customName?: string
): Promise<UserProfile> {
  const sb = getSupabaseClient();

  if (sb) {
    try {
      const redirectTo = AuthSession.makeRedirectUri({ scheme: 'wanderledger' });
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (!error && data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type === 'success' && res.url) {
          const params = new URL(res.url.replace('#', '?')).searchParams;
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { data: sessionData } = await sb.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            const u = sessionData.user;
            if (u) {
              const name =
                (u.user_metadata?.full_name as string) ||
                u.email?.split('@')[0] ||
                'Traveler';
              const profile: UserProfile = {
                id: u.id,
                email: u.email ?? 'traveler@gmail.com',
                displayName: name,
                avatarInitials: getInitials(name),
                avatarUrl: u.user_metadata?.avatar_url as string | undefined,
                homeCurrency,
                distanceUnit: 'mi',
                wifiOnlyPhotoSync: true,
                authMode: 'google',
                lastSyncedAt: new Date().toISOString(),
              };
              await saveProfile(profile);
              return profile;
            }
          }
        }
      }
    } catch {
      // Fall through to local traveler profile below if OAuth cancelled/unconfigured
    }
  }

  const displayName = customName?.trim() || 'Wanderer';
  const email = customEmail?.trim() || '';
  const profile: UserProfile = {
    id: email ? `google_local_${email.replace(/[^a-z0-9]/gi, '_')}` : 'local_wanderer',
    email,
    displayName,
    avatarInitials: getInitials(displayName),
    homeCurrency,
    distanceUnit: 'mi',
    wifiOnlyPhotoSync: true,
    authMode: 'local_test',
    lastSyncedAt: new Date().toISOString(),
  };
  await saveProfile(profile);
  return profile;
}

/**
 * Starts a frictionless, offline-first local WanderLedger session with no login wall.
 * If the user leaves firstName blank, addresses them warmly as "Wanderer".
 */
export async function startLocalSession(
  homeCurrency = 'USD',
  firstName?: string
): Promise<UserProfile> {
  const displayName = firstName?.trim() || 'Wanderer';
  const profile: UserProfile = {
    id: 'local_wanderer',
    email: '',
    displayName,
    avatarInitials: getInitials(displayName),
    homeCurrency,
    distanceUnit: 'mi',
    wifiOnlyPhotoSync: true,
    authMode: 'local_test',
    lastSyncedAt: new Date().toISOString(),
  };
  await saveProfile(profile);
  return profile;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'WL';
}
