import { CoTravelerRole, Trip, TripAccessRole, UserProfile } from '../types/models';

export function normalizeCoTravelerKey(value: string): string {
  return value.trim().toLowerCase();
}

export function isLocalOwnerId(ownerId?: string | null): boolean {
  if (!ownerId) return true;
  return (
    ownerId === 'local_user' ||
    ownerId === 'local_wanderer' ||
    ownerId.startsWith('local_') ||
    ownerId.startsWith('google_local_')
  );
}

/**
 * Resolves a co-traveler's role on a trip, defaulting legacy entries without an explicit role to 'editor'.
 */
export function getCoTravelerRole(
  trip: Pick<Trip, 'coTravelerRoles'>,
  member: string
): CoTravelerRole {
  const key = normalizeCoTravelerKey(member);
  const raw = trip.coTravelerRoles?.[key] ?? trip.coTravelerRoles?.[member];
  return raw === 'viewer' ? 'viewer' : 'editor';
}

/**
 * Determines the current user's effective access role ('owner' | 'editor' | 'viewer') for a trip.
 */
export function getTripAccessRole(
  trip: Pick<Trip, 'ownerId' | 'coTravelerRoles'>,
  profile: Pick<UserProfile, 'id' | 'email' | 'authMode'> | null | undefined
): TripAccessRole {
  if (!profile || profile.authMode !== 'google') return 'owner';
  if (isLocalOwnerId(trip.ownerId) || trip.ownerId === profile.id) return 'owner';
  const myEmail = normalizeCoTravelerKey(profile.email || '');
  if (myEmail && trip.coTravelerRoles?.[myEmail]) {
    return trip.coTravelerRoles[myEmail];
  }
  return 'editor';
}

/**
 * True when a trip is an actual collaborative trip (has co-travelers or is owned by someone else).
 * One-off Postcard shares never make a trip collaborative.
 */
export function isCollaborativeTrip(
  trip: Pick<Trip, 'ownerId' | 'coTravelers'>,
  profile?: Pick<UserProfile, 'id' | 'authMode'> | null
): boolean {
  if ((trip.coTravelers?.length ?? 0) > 0) return true;
  if (profile?.authMode === 'google' && !isLocalOwnerId(trip.ownerId) && trip.ownerId !== profile.id) {
    return true;
  }
  return false;
}

/**
 * Counts how many editors participate in a trip (1 owner + all co-travelers with 'editor' role).
 * Viewers are excluded since they do not participate in trip expenses.
 */
export function getEditorCount(trip: Pick<Trip, 'coTravelers' | 'coTravelerRoles'>): number {
  const editorBuddies = (trip.coTravelers ?? []).filter(
    (member) => getCoTravelerRole(trip, member) === 'editor'
  ).length;
  return 1 + editorBuddies;
}

/**
 * Builds deduplicated `public.trip_members` upsert rows for Supabase sync.
 */
export function buildTripMemberRows(
  trip: Pick<Trip, 'id' | 'coTravelers' | 'coTravelerRoles'>
): Array<{ trip_id: string; invited_email: string; role: CoTravelerRole }> {
  const seen = new Set<string>();
  const rows: Array<{ trip_id: string; invited_email: string; role: CoTravelerRole }> = [];
  for (const raw of trip.coTravelers ?? []) {
    const email = normalizeCoTravelerKey(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    rows.push({
      trip_id: trip.id,
      invited_email: email,
      role: getCoTravelerRole(trip, raw),
    });
  }
  return rows;
}
