// Supabase Edge Function: r2-presign
// Authorizes the user's Google/Supabase JWT, trip membership, and role ('owner' | 'editor' | 'viewer'),
// then returns a short-lived Cloudflare R2 presigned PUT, GET, or DELETE URL:
//   - Memory photos:    `memories/{tripId}/{id}.webp` (Owner/Editor read+write, Viewer read-only)
//   - Trip covers:      `covers/{tripId}/{id}.webp`   (Owner/Editor read+write, Viewer read-only)
//   - Shared receipts:  `shared-receipts/{tripId}/{id}.webp` (Owner/Editor read+write, Viewer FORBIDDEN)
//   - Personal receipts:`receipts/{tripId}/{userId}/{id}.webp` (Strictly uploader-only)

// @ts-nocheck — Deno Edge Runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userId = userData.user.id;
    const userEmail = (userData.user.email || '').trim().toLowerCase();

    const { tripId, mediaKind, fileId, action, objectKey } = await req.json();
    const kind =
      mediaKind === 'shared_receipt'
        ? 'shared_receipt'
        : mediaKind === 'receipt'
          ? 'receipt'
          : mediaKind === 'cover'
            ? 'cover'
            : 'memory';
    const op = action === 'delete' ? 'delete' : action === 'get' ? 'get' : 'put';

    // Verify user belongs to trip via RLS and resolve role ('owner' | 'editor' | 'viewer')
    const { data: trip } = await supabase
      .from('trips')
      .select('id, owner_id')
      .eq('id', tripId)
      .maybeSingle();

    if (!trip) {
      return new Response('Forbidden', { status: 403 });
    }

    let canEdit = trip.owner_id === userId;
    if (!canEdit) {
      const { data: members } = await supabase
        .from('trip_members')
        .select('role, user_id, invited_email')
        .eq('trip_id', tripId);

      const myMember = (members || []).find(
        (m) =>
          m.user_id === userId ||
          (userEmail && String(m.invited_email || '').trim().toLowerCase() === userEmail)
      );
      canEdit = Boolean(myMember && (myMember.role === 'owner' || myMember.role === 'editor'));
    }

    // Viewers cannot upload/delete any files and cannot access any receipts (personal or shared)
    if ((op === 'put' || op === 'delete') && !canEdit) {
      return new Response('Forbidden: viewer role is read-only', { status: 403 });
    }
    if ((kind === 'receipt' || kind === 'shared_receipt') && !canEdit) {
      return new Response('Forbidden: receipts are hidden from viewers', { status: 403 });
    }

    let key: string;
    if ((op === 'get' || op === 'delete') && typeof objectKey === 'string' && objectKey.trim()) {
      const normalized = objectKey.trim().replace(/^\/+/, '');
      const allowedPrefixes = canEdit
        ? [
            `memories/${tripId}/`,
            `covers/${tripId}/`,
            `shared-receipts/${tripId}/`,
            `receipts/${tripId}/${userId}/`,
          ]
        : [`memories/${tripId}/`, `covers/${tripId}/`];

      if (!allowedPrefixes.some((p) => normalized.startsWith(p))) {
        return new Response('Forbidden object key', { status: 403 });
      }
      key = normalized;
    } else {
      const cleanFileId = String(fileId || '').replace(/\.webp$/i, '');
      key =
        kind === 'shared_receipt'
          ? `shared-receipts/${tripId}/${cleanFileId}.webp`
          : kind === 'receipt'
            ? `receipts/${tripId}/${userId}/${cleanFileId}.webp`
            : kind === 'cover'
              ? `covers/${tripId}/${cleanFileId}.webp`
              : `memories/${tripId}/${cleanFileId}.webp`;
    }

    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID')!;
    const r2Bucket = Deno.env.get('R2_BUCKET_NAME') || 'wanderledger-media';
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });

    const method = op === 'delete' ? 'DELETE' : op === 'get' ? 'GET' : 'PUT';
    const url = `https://${r2AccountId}.r2.cloudflarestorage.com/${r2Bucket}/${key}`;
    const signed = await aws.sign(
      new Request(url, {
        method,
        headers: op === 'put' ? { 'Content-Type': 'image/webp' } : undefined,
      }),
      { aws: { signQuery: true } }
    );

    const body =
      op === 'delete'
        ? { deleteUrl: signed.url, objectKey: key }
        : op === 'get'
          ? { downloadUrl: signed.url, objectKey: key }
          : { uploadUrl: signed.url, objectKey: key };

    return new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
