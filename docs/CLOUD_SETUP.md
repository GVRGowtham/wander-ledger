# WanderLedger — \$0/Month Cloud Setup Guide (Google Login, Sync, Photos & Live Flights)

WanderLedger works **100% offline out-of-the-box** using local SQLite, bundled airports/airlines, offline IATA BCBP boarding pass decoding, and on-device Google ML Kit OCR.

When you are ready to enable **live Google Sign-In, cross-device cloud sync, co-traveler trip sharing, Cloudflare R2 photo storage, and live Flight API details** for your ~100 users at **\$0/month**, follow these 4 steps (~5 minutes):

---

## 1. Supabase Project (Free Tier — \$0/mo)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/migrations/001_init.sql` from this repository.
3. Go to **Project Settings → API** and copy your **Project URL** and **Anon Key** into `.env`:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   ```

## 2. Google Sign-In OAuth (Free)
1. In **Google Cloud Console → APIs & Services → Credentials**, create an **OAuth 2.0 Web Client ID**.
2. Add your Supabase callback URL (`https://YOUR_PROJECT.supabase.co/auth/v1/callback`) as an Authorized Redirect URI.
3. In **Supabase → Authentication → Providers → Google**, paste the Client ID & Client Secret, and add `wanderledger://` under **Authentication → URL Configuration → Redirect URLs**.

## 3. Cloudflare R2 Photo & Receipt Storage (10 GB Free, \$0 Egress)
1. Create a free Cloudflare account and create an R2 bucket named `wanderledger-media`.
2. Create an R2 API Token with Object Read & Write permissions.
3. Set secrets and deploy the presign Edge Function:
   ```bash
   supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=wanderledger-media
   supabase functions deploy r2-presign
   ```

## 4. Live Flight Details Enrichment (1,000 Free Requests/Mo + Shared Cache)
1. Grab a free API key at [airlabs.co](https://airlabs.co) (1,000 requests/month free).
2. Set the secret and deploy `enrich-flight`:
   ```bash
   supabase secrets set AIRLABS_API_KEY=...
   supabase functions deploy enrich-flight
   ```
   *Or for direct client-side testing without Supabase, set `EXPO_PUBLIC_AIRLABS_API_KEY` in `.env`.*
