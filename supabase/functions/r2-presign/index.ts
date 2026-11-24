// Supabase Edge Function: r2-presign
// Authorizes the user's Google/Supabase JWT & trip membership, then returns a short-lived
// Cloudflare R2 presigned PUT, GET, or DELETE URL for compressed WebP memories (~200KB),
// trip covers, or private receipts (~70KB).
// Memory photos live under `memories/{tripId}/{id}.webp`.
// Trip cover photos live under `covers/{tripId}/{id}.webp`.
// Private receipts live under `receipts/{tripId}/{userId}/{id}.webp` (never exposed on Postcards).

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

    const { tripId, mediaKind, fileId, action, objectKey } = await req.json();
    const kind =
      mediaKind === 'receipt' ? 'receipt' : mediaKind === 'cover' ? 'cover' : 'memory';
    const op = action === 'delete' ? 'delete' : action === 'get' ? 'get' : 'put';

    // Verify user belongs to trip via RLS
    const { data: trip } = await supabase
      .from('trips')
      .select('id')
      .eq('id', tripId)
      .maybeSingle();

    if (!trip) {
      return new Response('Forbidden', { status: 403 });
    }

    let key: string;
    if ((op === 'get' || op === 'delete') && typeof objectKey === 'string' && objectKey.trim()) {
      // Ensure requested objectKey strictly belongs to this trip (and user for receipts)
      const normalized = objectKey.trim().replace(/^\/+/, '');
      const allowedPrefixes = [
        `memories/${tripId}/`,
        `covers/${tripId}/`,
        `receipts/${tripId}/${userData.user.id}/`,
      ];
      if (!allowedPrefixes.some((p) => normalized.startsWith(p))) {
        return new Response('Forbidden object key', { status: 403 });
      }
      key = normalized;
    } else {
      const cleanFileId = String(fileId || '').replace(/\.webp$/i, '');
      key =
        kind === 'receipt'
          ? `receipts/${tripId}/${userData.user.id}/${cleanFileId}.webp`
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
