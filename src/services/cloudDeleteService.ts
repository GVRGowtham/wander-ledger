import { getSupabaseClient } from './authService';
import { Memory } from '../types/models';

function extractFileIdFromUri(uri?: string): string | null {
  if (!uri) return null;
  const last = uri.split('/').pop();
  if (!last) return null;
  return last.replace(/\.webp$/i, '');
}

async function deleteR2Object(
  tripId: string,
  mediaKind: 'memory' | 'receipt',
  fileId: string,
  accessToken: string
): Promise<boolean> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return false;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/r2-presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnon,
      },
      body: JSON.stringify({
        tripId,
        mediaKind,
        fileId,
        action: 'delete',
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.deleteUrl) return false;

    const delRes = await fetch(data.deleteUrl, { method: 'DELETE' });
    return delRes.ok || delRes.status === 404;
  } catch {
    return false;
  }
}

/**
 * Deletes a memory row from Supabase Postgres and removes its photo + thumbnail objects
 * from Cloudflare R2 when cloud sync is configured & online.
 * If offline/unconfigured, returns { synced: false } so the queued sync_queue tombstone retries later.
 */
export async function deleteMemoryFromCloud(
  memory: Pick<Memory, 'id' | 'tripId' | 'photoUri' | 'thumbUri'>
): Promise<{ synced: boolean }> {
  const sb = getSupabaseClient();
  if (!sb) return { synced: false };

  try {
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { synced: false };

    // 1. Delete photo & thumbnail from Cloudflare R2
    const fileIds = Array.from(
      new Set(
        [
          extractFileIdFromUri(memory.photoUri),
          extractFileIdFromUri(memory.thumbUri),
          memory.id,
          `${memory.id}_thumb`,
        ].filter(Boolean) as string[]
      )
    );
    await Promise.all(
      fileIds.map((fid) => deleteR2Object(memory.tripId, 'memory', fid, token))
    );

    // 2. Delete memory row from Supabase Postgres
    const { error } = await sb.from('memories').delete().eq('id', memory.id);
    return { synced: !error };
  } catch {
    return { synced: false };
  }
}

/**
 * Deletes a trip (and its cascaded rows in Supabase Postgres) plus associated memory objects from R2.
 */
export async function deleteTripFromCloud(
  tripId: string,
  memories: Array<Pick<Memory, 'id' | 'tripId' | 'photoUri' | 'thumbUri'>> = []
): Promise<{ synced: boolean }> {
  const sb = getSupabaseClient();
  if (!sb) return { synced: false };

  try {
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { synced: false };

    await Promise.all(
      memories.map((m) => deleteMemoryFromCloud(m))
    );

    const { error } = await sb.from('trips').delete().eq('id', tripId);
    return { synced: !error };
  } catch {
    return { synced: false };
  }
}

/**
 * Syncs edited memory fields (title, note, place, mood, date) to Supabase Postgres when cloud sync is active.
 */
export async function updateMemoryInCloud(
  memory: Pick<Memory, 'id' | 'title' | 'note' | 'placeName' | 'moodSticker' | 'capturedAt'>
): Promise<{ synced: boolean }> {
  const sb = getSupabaseClient();
  if (!sb) return { synced: false };

  try {
    const { data: sessionData } = await sb.auth.getSession();
    if (!sessionData.session?.access_token) return { synced: false };
    const { error } = await sb
      .from('memories')
      .update({
        title: memory.title,
        note: memory.note,
        place_name: memory.placeName ?? null,
        mood_sticker: memory.moodSticker,
        captured_at: memory.capturedAt,
      })
      .eq('id', memory.id);
    return { synced: !error };
  } catch {
    return { synced: false };
  }
}

/**
 * Deletes a flight, stay, or expense row from Supabase Postgres when cloud sync is active.
 */
export async function deleteEntityFromCloud(
  table: 'flights' | 'stays' | 'expenses',
  id: string
): Promise<{ synced: boolean }> {
  const sb = getSupabaseClient();
  if (!sb) return { synced: false };

  try {
    const { data: sessionData } = await sb.auth.getSession();
    if (!sessionData.session?.access_token) return { synced: false };
    const { error } = await sb.from(table).delete().eq('id', id);
    return { synced: !error };
  } catch {
    return { synced: false };
  }
}
