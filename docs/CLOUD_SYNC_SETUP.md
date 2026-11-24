# Cloud Sync Setup Guide (Supabase + Cloudflare R2 — $0/month Free Tier)

Wanderer's Ledger runs **100% offline-first** on local SQLite with zero configuration required.
Whenever you are ready to enable **automatic cloud backup & multi-device sync**, everything in the app is already wired — just connect your free Supabase & Cloudflare R2 credentials below!

---

## 1. Create a Free Supabase Project (~2 mins)
1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Open **SQL Editor** and run all three migrations in order:
   - [`supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql)
   - [`supabase/migrations/002_transports_stops_and_sync.sql`](../supabase/migrations/002_transports_stops_and_sync.sql)
   - [`supabase/migrations/003_roles_and_shared_expenses.sql`](../supabase/migrations/003_roles_and_shared_expenses.sql)
3. Enable **Google OAuth** under **Authentication → Providers → Google**, and add the redirect URL:
   - `wanderledger://`
4. Copy your **Project URL** and **anon public key** from **Project Settings → API**.

---

## 2. Create a Free Cloudflare R2 Bucket for Photos & Receipts (~2 mins)
*(Optional — Postgres metadata sync works even without R2, and R2 adds encrypted WebP photo & receipt backup with 10 GB free storage & $0 egress!)*

1. In [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2 Object Storage**, create a private bucket named `wanderledger-media`.
2. Under **Manage R2 API Tokens**, create an API token with **Object Read & Write** permission on `wanderledger-media`.
3. Deploy the bundled `r2-presign` Edge Function and set its secrets:
   ```bash
   npx supabase login
   npx supabase link --project-ref <YOUR_PROJECT_REF>
   npx supabase secrets set \
     R2_ACCOUNT_ID=<YOUR_CF_ACCOUNT_ID> \
     R2_BUCKET_NAME=wanderledger-media \
     R2_ACCESS_KEY_ID=<YOUR_R2_ACCESS_KEY> \
     R2_SECRET_ACCESS_KEY=<YOUR_R2_SECRET_KEY>
   npx supabase functions deploy r2-presign
   ```

---

## 3. Add Your Keys to `.env` & Rebuild (~1 min)
Copy `.env.example` to `.env` and fill in your Supabase keys:
```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

Rebuild your Android APK or iOS app — the **☁️ Cloud Backup & Sync** card in **Passport** will automatically switch from *Local Offline Vault* to **Sign in with Google**, and signing in will immediately upload all your existing local trips, flights, transports, stops, stays, expenses, memories, and loyalty miles!
