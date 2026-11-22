# WanderLedger — Android App Implementation Plan

## Goal
Build **WanderLedger**, a joyful, offline-first Android travelogue mobile app with a **"Sunlit Postcard & Passport Journal"** aesthetic, backed by a **\$0/month** cloud sync architecture, push commits incrementally to a fresh GitHub repository (`wander-ledger`), and compile + share an **installable Android `.apk`** for on-device testing.

---

## Verified Build Environment
Our build VM already includes everything needed to compile and distribute a real standalone Android APK:
* **Node.js** `v22.23.5` & **npm** `12.2.2`
* **OpenJDK 21** & **Android SDK** (`/opt/android-sdk` with API levels 34, 35, 36 and Build Tools 33–35)
* **GitHub CLI (`gh`)** authenticated as `GVRGowtham` (ready to create `GVRGowtham/wander-ledger` and publish the `.apk` via a GitHub Release asset for easy phone download!)

---

## Repository & Project Architecture

We will create a fresh GitHub repository (`GVRGowtham/wander-ledger`) structured as:

```text
wander-ledger/
├── app/                         # Expo Router screens (file-based navigation)
│   ├── _layout.tsx              # Root provider (Auth, SQLite, Theme, Sync)
│   ├── login.tsx                # Sunlit Welcome + Google Sign-In (+ instant Test Mode)
│   ├── (tabs)/                  # 5-slot joyful bottom navigation
│   │   ├── _layout.tsx          # Trips | World Map | [📷 Scan] | Shared | Passport
│   │   ├── index.tsx            # Trips Hub (Active Hero, Upcoming Stubs, Memory Shelf)
│   │   ├── map.tsx              # Interactive World Map (animated flight arcs & pins)
│   │   ├── shared.tsx           # Co-Traveler Trips & Read-Only Family Postcards
│   │   └── passport.tsx         # Ink-Stamped Passport Book & Loyalty Miles Vault
│   ├── trip/
│   │   ├── [id].tsx             # Trip Workspace (📸 Memories | ✈️ Bookings | 🧾 Spend + 💌 Share)
│   │   └── new.tsx              # Create Trip (Vibe picker, dates, budget, scan shortcut)
│   └── scan.tsx                 # Smart Camera Scanner (BCBP Barcode + ML Kit OCR + User Trip Choice)
├── src/
│   ├── theme/                   # Sunlit Postcard palette (#FFF9F2, coral, teal, typography)
│   ├── components/
│   │   ├── banners/             # 12+ destination-aware illustrated SVG postcards (Japan, Coast, Alps, etc.)
│   │   ├── cards/               # PolaroidMemoryCard, PerforatedBoardingPass, HotelStayCard, InkStamp
│   │   └── map/                 # Interactive WorldMapSvg with geodesic flight arcs & pin popovers
│   ├── db/
│   │   ├── schema.ts            # Local SQLite schema (trips, flights, stays, expenses, memories, loyalty, fx, sync_queue)
│   │   ├── database.ts          # expo-sqlite initialization, migrations & repositories
│   │   └── airportsData.ts      # Bundled offline global airports & airlines lookup + Haversine miles math
│   ├── services/
│   │   ├── bcbpParser.ts        # 100% offline IATA Bar Coded Boarding Pass (PDF417/Aztec/QR) parser
│   │   ├── ocrParser.ts         # On-device ML Kit OCR + receipt & hotel confirmation heuristic parser
│   │   ├── flightEnricher.ts    # Hybrid offline airport lookup + online Flight API enrichment (cached)
│   │   ├── fxService.ts         # Frankfurter ECB daily FX rates with offline SQLite fallback
│   │   ├── mediaService.ts      # EXIF date/GPS harvest + WebP compression (200KB memory / 70KB receipt)
│   │   ├── authService.ts       # Google Sign-In + Supabase Auth (with offline Test Traveler mode)
│   │   └── syncService.ts       # Background SQLite <-> Supabase + Cloudflare R2 presigned uploads
│   └── __tests__/               # Jest unit tests for parsers, Haversine math & FX conversion
├── supabase/
│   ├── migrations/001_init.sql  # Postgres schema + RLS (owner, co-travelers, read-only postcards, private receipts)
│   └── functions/
│       ├── enrich-flight/       # Edge function with shared flight_cache table + Flight API adapter
│       └── r2-presign/          # Edge function minting short-lived Cloudflare R2 PUT/GET URLs
└── docs/
    └── CLOUD_SETUP.md           # 5-minute guide to plug in Google OAuth SHA-1, Supabase, R2 & Flight API keys
```

---

## Phased Build Plan (Incremental Commits)

### Phase 1 — Repo Creation, Expo Scaffold & Theme Foundation
* Create the fresh GitHub repository `GVRGowtham/wander-ledger`.
* Initialize the React Native + Expo TypeScript app (`com.wanderledger.app`) configured for local Android builds (`expo prebuild --platform android`).
* Build the **"Sunlit Postcard"** design system (`#FFF9F2` cream journal canvas, sunset coral, ocean sky, emerald accents, rounded cards, playful typography) and the **5-slot bottom navigation bar** (`Trips`, `World Map`, center `📷 Scan`, `Shared`, `Passport`).

### Phase 2 — Offline-First SQLite Layer, Airports DB & FX Service
* Implement local `expo-sqlite` tables (`trips`, `flights`, `stays`, `expenses`, `memories`, `loyalty_accounts`, `fx_rates`, `sync_queue`) with reactive hooks.
* Bundle an offline **Global Airports & Airlines dataset** (major global hubs, coordinates, country codes, timezones) + Haversine miles & estimated duration calculator.
* Implement **Frankfurter API** daily FX rate sync with bundled offline fallback rates.

### Phase 3 — Core Joyful Screens & Dynamic Destination Postcards
* **Welcome & Google Sign-In**: Sunlit horizon hero, native Google Sign-In integration (wired for Supabase/Google Cloud OAuth), plus an instant **"Continue with Local Test Account"** option so you can test the entire APK on your phone immediately before setting up OAuth keys.
* **Trips Hub**: Context-aware *Happening Now* hero with **destination-aware SVG postcard banners** (Japan Mt. Fuji, Mediterranean Coast, Alpine Peaks, Tropical Lagoon, India/Desert, City Skyline — plus one-tap *"Use My Photo as Cover"*), upcoming ticket stubs, and past memory shelf.
* **New Trip Creator**: Vibe selector, date range auto-sorting (*Active / Upcoming / Past*), budget, and quick scan shortcut.
* **Trip Workspace**:
  * **`📸 Memories` Tab**: Clean Polaroid photo journal (tilted frames, mood stickers, captions, photo picker/camera with on-device WebP compression & EXIF GPS/date capture — **zero receipts here**).
  * **`✈️ Bookings` Tab**: Perforated vintage boarding passes + cozy hotel stay cards (with cash vs. points value-per-point display & offline tap-to-copy address).
  * **`🧾 Spend` Tab**: Multi-currency budget progress bar, category breakdown, and **tucked-away scanned receipts** (tap any expense to view the saved receipt photo/details).
  * **`💌 Share` Modal**: Export a shareable Trip Postcard via Android's native Share Sheet, plus Co-Traveler invite & Read-Only Postcard link flows (hiding private receipts).

### Phase 4 — World Map, Shared Tab & Ink-Stamped Passport
* **🗺️ World Map Tab**: Illustrated world map with animated flight arcs, clickable glowing destination pins popping up trip postcards, and fun lifetime milestones (*"X.Xx around the Earth"*).
* **💌 Shared Tab**: View shared co-traveler trips and manage read-only Family Postcard links.
* **🛂 Passport Tab**: Rotated colorful rubber ink stamps for every visited country, auto-updating **Loyalty Miles & Points Vault**, home currency selector, Wi-Fi-only photo sync toggle, and CSV/JSON data export.

### Phase 5 — Smart Camera Scanner (`📷`) & Hybrid Flight Enrichment
* **Live Camera + Gallery Scanner**:
  * **Boarding Passes**: Real-time 2D barcode scanning (`PDF417`, `Aztec`, `QR`) → offline **IATA BCBP parser** → instant flight route, seat, PNR, miles earned, and loyalty credit.
  * **Online Flight API Enrichment**: Automatically enriches scanned flights with live schedule/terminal/gate/aircraft when connected & configured, gracefully falling back to the offline airport DB when offline.
  * **Receipts & Hotel Confirmations**: On-device **Google ML Kit Text Recognition** (works 100% offline at \$0 cost) → heuristic parser extracting merchant, currency, total, check-in/check-out dates, and confirmation number → saves compressed grayscale receipt WebP strictly inside **Spend**.
  * **Built-In Demo Scan Triggers**: Also include 1-tap sample scans inside the scanner drawer (Sample Boarding Pass, Japanese Ramen Receipt, Hotel Confirmation) so you can test the full scanning pipeline on your phone even without printing a boarding pass!
* **Explicit User Trip Choice**: Every scan confirmation sheet lets you toggle between **`📎 Add to Existing Trip`** and **`✨ Auto-Create New Trip`**.

### Phase 6 — Cloud Backend Assets (Supabase + Cloudflare R2)
* Commit complete `supabase/migrations/001_init.sql` (including Row-Level Security for Google-authenticated users, co-travelers, and public read-only postcard tokens that strictly exclude private receipts).
* Commit Edge Functions (`enrich-flight` with shared Postgres `flight_cache` + `r2-presign` for Cloudflare R2 direct uploads) and `docs/CLOUD_SETUP.md`.

---

## Verification & Android APK Delivery Plan

1. **Automated Unit Tests**: Run Jest test suite verifying:
   * IATA BCBP boarding pass decoding (single & multi-leg passes, Julian dates, frequent flyer extraction).
   * Haversine flight distance & loyalty miles calculations.
   * Receipt & Hotel OCR text parser across multiple currencies (`$`, `€`, `£`, `¥`, `₹`).
   * Offline/online FX currency conversion.
2. **TypeScript & Bundle Checks**: Run `npx tsc --noEmit` and Expo prebuild verification.
3. **Standalone Android APK Build**:
   * Compile a self-contained **Release-mode Android `.apk`** (`./gradlew assembleRelease`, signed with a release/debug test keystore so all JS + assets are bundled inside and no dev server is needed).
4. **Push & Share APK for Phone Testing**:
   * Push all code to `https://github.com/GVRGowtham/wander-ledger`.
   * Publish the compiled `WanderLedger-v0.1.0.apk` as a **GitHub Release asset** (and/or upload to your Google Drive if you prefer!) so you can tap one clean link on your Android phone, download, install, and test immediately.

---

## Quick Confirmation Needed Before Starting
1. **GitHub Repository Visibility**: Should `GVRGowtham/wander-ledger` be **Private** (recommended while in development) or **Public**?
2. **APK Delivery**: Is attaching the compiled `.apk` to a **GitHub Release** on the new repo good for downloading onto your Android phone (or would you prefer a **Google Drive** link as well)?

Click **Proceed** (or reply with your preferences above) and I'll create the repository and start building!
