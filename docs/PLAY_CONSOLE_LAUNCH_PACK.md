# Wanderer's Ledger — Google Play Console Launch Pack (`v0.5.0`)

> **Built for 100% phone or laptop use:** Open [Google Play Console](https://play.google.com/console) (on mobile Chrome, turn ON **Desktop site**), and follow Sections 1–7 in exact order. Every field below is verified against your live `v0.5.0` (`versionCode 5`) release bundle, `AndroidManifest.xml`, and `docs/privacy.html`.

---

## 0. One-Time 30-Second Prerequisite — Publish Your Free Privacy Policy URL

Google Play Console requires a live `https://` Privacy Policy URL before you can submit. Your privacy policy is already committed in your GitHub repo at `docs/privacy.html`!

1. Open your GitHub repository: `https://github.com/GVRGowtham/wander-ledger/settings/pages`
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Set **Branch** = `main` and **Folder** = `/docs` → click **Save**.
4. Wait ~30 seconds, then verify this live URL opens cleanly:
   - **Privacy Policy URL:** `https://gvrgowtham.github.io/wander-ledger/privacy.html`
   - **Website URL:** `https://gvrgowtham.github.io/wander-ledger/privacy.html` *(or your GitHub repo URL)*

---

## 1. Create App (First Screen in Play Console)

| Field | Value to Enter |
| :--- | :--- |
| **App name** | `Wanderer's Ledger` |
| **Package name** | `com.wanderledger.app` |
| **Default language** | `English (United States)` |
| **App or game** | `App` |
| **Free or paid** | `Free` |
| **Developer Program Policies & US export laws** | Check both boxes |

---

## 2. Main Store Listing (Copy-Paste Ready)

### App Name (17 / 30 chars)
```text
Wanderer's Ledger
```
*(Optional keyword-rich alternative: `Wanderer's Ledger: Travel Log` — 29/30 chars.)*

### Short Description (78 / 80 chars)
```text
Offline travel journal, multi-leg flight PDF scanner, private spend & map.
```

### Full Description (~2,450 / 4,000 chars)
```text
Wanderer's Ledger is your sunlit, offline-first pocket travelogue—bringing every flight, train, road trip, hotel stay, multi-currency expense, world map arc, and Polaroid memory into one private, ad-free place. No forced accounts, no clutter, and zero subscriptions.

✈️ SMART MAGIC SCAN — 100% OFFLINE OCR & PDF READER
Stop typing flight numbers and hotel confirmations by hand. Import airline e-ticket PDFs, screenshots, or paper boarding passes—or share any PDF straight from Gmail, WhatsApp, or Files into Wanderer's Ledger:
• Auto-splits round-trip & open-jaw itineraries (e.g., BLR → AUH → ZRH + FRA → AUH → BLR) into separate chronological flight legs while logging ONE combined Spend entry
• Reads Booking.com, Agoda, MakeMyTrip & Airbnb hotel vouchers, IRCTC/SBB train tickets, Sixt/Hertz car rentals, and restaurant or fuel bills offline
• Every detected flight leg, date, 24h departure time, fare, and currency is 1-tap editable

🧭 CHRONOLOGICAL MULTI-MODE BOOKINGS
Track every way you travel in one clean timeline sorted by exact date and time:
• Flights (with offline lookup across 150+ world airports, great-circle distance & loyalty miles)
• Trains, Buses, Ferries, Rental Cars & Own-Car Road Trips
• Hotels, Airbnbs, Hostels & Multi-City Trip Stops

🧾 PRIVATE MULTI-CURRENCY SPEND LEDGER
Log bills in CHF, EUR, GBP, JPY, AED, USD, INR, and more with automatic conversion into your Home Currency (cached offline + live ECB rates):
• Track optional trip budgets across 8 categories (Flights, Stays, Food & Drink, Transit, Fuel & Tolls, Experiences, Souvenirs, Other)
• Export all expenses to CSV for Excel or Google Sheets in 1 tap
• Your budgets and receipt images stay strictly private—never leaked into shared postcards or Instagram captions

🗺️ MULTI-COUNTRY WORLD MAP & PASSPORT INK STAMPS
• Watch dashed geodesic flight arcs connect your adventures across an interactive World Map
• Collect colorful Passport ink stamps derived automatically from your real flights, trains/drives, and Trip Stops
• Short airside airport layovers (<24h) appear as subtle hollow Transit Hub rings without inflating your visited country count—and automatically upgrade if you stay ≥24h or add a Trip Stop
• Automatic Loyalty Miles & Points Vault for every airline you fly

📸 POLAROID MEMORIES & 1080p INSTAGRAM STUDIO
• Auto-reads photo EXIF dates & GPS to match memories to the right city stop
• Add mood stickers, filter by stop, and turn trips into 1080p 4:5 Feed collages, 9:16 Stories, multi-slide Carousels & offline privacy-safe captions

🔒 100% OFFLINE-FIRST, PRIVATE & AD-FREE
• Everything stays locally on your device in private SQLite storage
• Zero ads, zero third-party trackers, and 1-tap Local JSON Backup & Reset anytime
```

### Store Settings & Contact Details

| Field | Value |
| :--- | :--- |
| **App category** | `Travel & Local` |
| **Tags (up to 5)** | `Travel`, `Trip planner`, `Travel journal`, `Expense tracker`, `Flight tracker` |
| **Email address** | `vg.life.apps@gmail.com` |
| **Website** | `https://gvrgowtham.github.io/wander-ledger/privacy.html` |
| **Phone number** | *(Leave blank)* |
| **Marketing opt-out** | Optional (leave unchecked to allow Play Store featuring) |

### Store Graphics (All Ready in Your Google Drive Backup Folder)

| Asset | File in `Wanderer's Ledger Play Store Backup` | Specs |
| :--- | :--- | :--- |
| **App Icon** | `play_store_icon_512.png` | `512 × 512` RGB PNG |
| **Feature Graphic** | `play_store_feature_graphic_1024x500.png` | `1024 × 500` RGB PNG |
| **Phone Screenshots (8)** | `Play Store Screenshots / 01_trips_hub.png` … `08_instagram_studio.png` | `1080 × 1920` (9:16) RGB PNG |

---

## 3. Uploading Your Release Bundle (`.aab`) & App Signing

> [!IMPORTANT]
> **Always upload the `.aab` file** (`WanderersLedger-v0.5.0-release.aab`) to Google Play Console — **NOT** the `.apk`! The `.apk` (`WanderersLedger-v0.5.0.apk`) is included in your Drive folder only for direct sideload testing on your own Android phone.

1. In Play Console, open **Test and release → Testing → Closed testing** (recommended for Personal accounts) → **Manage track → Create new release**.
2. Under **App signing**, leave **Let Google manage and protect your app signing key** enabled (Play App Signing).
3. Upload **`WanderersLedger-v0.5.0-release.aab`** (`versionCode 5`, `versionName 0.5.0`) from your Drive folder.
4. Keep **`wanderledger-upload-key.jks`**, **`keystore.properties`**, and **`KEYSTORE-CREDENTIALS.txt`** safely in this Google Drive folder forever — every future update to Google Play must be signed with this exact upload key!
5. *(Note for the future: If you later turn on optional Supabase Google Sign-In, copy Play Console's **App signing key certificate SHA-1 & SHA-256** from **App integrity → App signing** into your Google Cloud OAuth client — no `.aab` rebuild needed!)*

---

## 4. App Content & Policy Declarations (Exact Answers)

Go to **Policy and programs → App content** and complete every section:

### 4.1 Privacy Policy
- **Privacy policy URL:** `https://gvrgowtham.github.io/wander-ledger/privacy.html`

### 4.2 App Access
- Select: **All functionality in my app is available without any access restrictions**
  *(Wanderer's Ledger works 100% immediately on first launch with zero login wall! Reviewers can tap "Start My Travelogue ✨" and test every feature right away.)*

### 4.3 Ads
- **Does your app contain ads?** → **No, my app does not contain ads**

### 4.4 Content Rating (IARC)
- **Email address:** `vg.life.apps@gmail.com`
- **Category:** `Reference, News, or Educational` or `All Other App Types` *(choose **All Other App Types**)*
- **Violence / Sexuality / Language / Controlled Substances / Crude Humor / Gambling / Horror:** **No** to all
- **Natively allows users to interact or exchange content with other users?** → **No** *(Sharing uses Android's standard OS share sheet to send text/images to WhatsApp/Instagram/Email; there is no built-in public social network or chat)*
- **Shares user's current physical location with other users?** → **No**
- **Allows users to purchase digital goods?** → **No**
- **Web browser / search engine / news aggregator?** → **No**

### 4.5 Target Audience and Content
- **Target age group:** Check **18 and over** ONLY *(cleanest choice for personal travel expense/booking journals and avoids Families Policy complexity)*
- **Could your store listing unintentionally appeal to children?** → **No**

### 4.6 Other Policy Declarations
- **News apps:** **No**
- **COVID-19 contact tracing and status apps:** **No**
- **Government apps:** **No**
- **Financial features:** **My app doesn't provide any financial features** *(Wanderer's Ledger is an offline personal travel log/calculator only — it does not connect to banks, process payments, offer loans, or transfer money)*
- **Health apps:** **My app does not have any health features**
- **Advertising ID:** **No** *(Wanderer's Ledger has zero advertising SDKs and does NOT declare `AD_ID`!)*

### 4.7 Photo and Video Permissions Declaration (If Prompted by Play Console)
Because `Wanderer's Ledger` includes `expo-media-library` to save exported 1080p Instagram postcards and read EXIF dates on imported travel photos, if Play Console asks about `READ_MEDIA_IMAGES`:
- **Core use case:** *"Wanderer's Ledger is a travel photo journal and collage creator. Users import travel photos from their gallery to build stop-organized Polaroid memories (reading EXIF capture dates/GPS to auto-match trip stops) and save exported 1080p Instagram travel collages & postcards back to their photo library."*

---

## 5. Data Safety Form (Verified Against `v0.5.0` Code & Binary)

> [!IMPORTANT]
> In `v0.5.0` (offline-first build with no cloud keys enabled), **all trips, PDFs, OCR text, expenses, receipts, and photos stay 100% locally on the user's device**. There are no analytics SDKs, no crash-reporting SDKs, and no ad SDKs bundled.

### Overview Questions
| Question | Answer |
| :--- | :--- |
| **Does your app collect or share any of the required user data types?** | **No** |
| **Is all of the user data collected by your app encrypted in transit?** | *(Not applicable when "No" is selected above)* |
| **Independent security review (MASA)?** | **No** |

*(When you later enable optional Supabase + Cloudflare R2 Cloud Sync in a future update, simply revisit Data Safety and update it to **Yes — Encrypted in transit — Optional Google OAuth** with Name, Email, User ID, Photos, and User-Entered Travel Content, and set Delete Account URL to `https://gvrgowtham.github.io/wander-ledger/privacy.html#account-deletion`.)*

---

## 6. Closed Testing Kit (12 Testers × 14 Continuous Days)

For personal Google Play developer accounts, Google requires **at least 12 opted-in testers continuously for 14 days** before unlocking Production. *(If your account was created before Nov 13, 2023, you can skip Closed Testing and publish straight to Production!)*

### Quick Playbook
1. **Recruit 16–20 testers** (friends/family with Android phones) so you stay comfortably above 12 even if a few people forget.
2. In Play Console → **Test and release → Testing → Closed testing → Manage track → Testers**:
   - Create an email list (e.g., `Wanderer's Ledger Founding Testers`) and add their **Gmail addresses** (exact Google account used in Play Store).
   - Add your feedback email: `vg.life.apps@gmail.com`.
3. Create your Closed Testing release with **`WanderersLedger-v0.5.0-release.aab`** and paste these **Release Notes**:
```text
Initial Closed Testing release of Wanderer's Ledger (v0.5.0):
• 100% offline-first pocket travelogue (zero ads, zero login wall)
• Smart Magic Scan for multi-leg airline PDFs, hotel confirmations, train tickets, car rentals & receipts
• Multi-country World Map with geodesic flight arcs & distinct <24h Airport Transit Hubs
• Digital Passport with vintage country ink stamps, automatic Loyalty Miles Vault & CSV/JSON export
• Polaroid Memories by city stop + 1080p Instagram Postcard & Collage Studio
```
4. Submit for review. Once approved (usually 1–3 days), copy the **Join on Android / Join on the web** link and send the message below!

### Ready-to-Forward WhatsApp / SMS Tester Invite
```text
Hey! ✈️ I'm launching my new Android travel journal & flight PDF scanner app, Wanderer's Ledger, on Google Play and need 12+ early testers for Google's 14-day closed test!

Could you help me out? It takes 60 seconds:
1. Reply with your Gmail address (the one signed into your Google Play Store) so I can add you to the tester list.
2. Once I confirm, tap this link on your Android phone and tap "Become a tester" -> Download from Google Play:
[PASTE YOUR PLAY STORE OPT-IN LINK HERE]
3. Open the app once (no account sign-up needed!), try creating a sample trip or scanning a ticket PDF, and just keep it installed on your phone for 14 days!

Thank you so much! 🌍📸
```

### Day-14 Production Access Questionnaire (Save for Later!)
When your 14 days finish, Play Console will ask 3 short questions about your closed test:
- **How did you recruit testers?** *"Recruited friends, family members, and frequent travelers via personal outreach and messaging groups to test trip planning, offline airline/hotel PDF scanning, Polaroid memories, World Map pins, and Instagram collage exports across diverse Android devices."*
- **How did testers engage with your app?** *"Testers created single- and multi-country trips, imported real round-trip/open-jaw airline e-ticket PDFs and hotel vouchers via Smart Scan and Android Share Intents, logged multi-currency expenses, added Polaroid memories, explored their World Map & Passport stamps, and exported 1080p postcards over 14+ days."*
- **What changes/checks did you make based on feedback?** *"Improved spatial OCR table parsing for multi-leg airline PDFs, added editable flight dates/24h times and fares, separated short <24h airport layovers into distinct Transit Hubs on the Map and Passport, renamed the trip destination label for multi-country trips, and verified 100% offline stability."*

---

## 7. Files Stored in Your Google Drive Backup Folder (`Wanderer's Ledger Play Store Backup`)

| File | Purpose |
| :--- | :--- |
| `WanderersLedger-v0.5.0-release.aab` | **Upload this** to Google Play Console (signed `versionCode 5`) |
| `WanderersLedger-v0.5.0.apk` | Signed APK for direct sideload testing on Android phones |
| `wanderledger-upload-key.jks` | **CRITICAL — Keep forever!** Your Google Play upload signing keystore |
| `keystore.properties` & `KEYSTORE-CREDENTIALS.txt` | Keystore passwords, alias & SHA-1/SHA-256 fingerprints |
| `PLAY_CONSOLE_LAUNCH_PACK.md` | This complete copy-paste Play Console publishing guide |
| `privacy.html` | Backup copy of your Privacy Policy (also live in GitHub `docs/privacy.html`) |
| `Wanderers_Ledger_User_Manual_v0.4.7.pdf` | 15-page illustrated PDF User Manual |
| `play_store_icon_512.png` | `512 × 512` RGB PNG App Icon |
| `play_store_feature_graphic_1024x500.png` | `1024 × 500` RGB PNG Feature Graphic |
| `Play Store Screenshots/01_…08_.png` | 8 crisp `1080 × 1920` (9:16) RGB PNG Play Store phone screenshots |
