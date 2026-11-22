# ✈️ WanderLedger — Joyful Offline-First Travelogue (Android)

**WanderLedger** combines a warm, **Sunlit Postcard & Passport Journal** experience with a fast, offline-first travel ledger—tracking your flights, hotels, multi-currency expenses, airline miles, interactive world map, and Polaroid memories for **\$0/month**.

## Key Features
* **☀️ Sunlit Postcard UX**: Dynamic destination-aware illustrated SVG banners (Mt. Fuji for Japan, Mediterranean Coast, Snow-Capped Alps, Tropical Lagoon, Golden Dunes, Twilight Skyline) plus one-tap *"⭐ Set My Photo as Cover"*.
* **📷 Smart Magic Camera Scanner (\$0 On-Device)**:
  * **Boarding Passes**: Live 2D barcode scanning (`PDF417` / `Aztec` / `QR`) → 100% offline **IATA BCBP** parser + bundled global airport/airline DB (Haversine miles & duration) + hybrid online Flight API enrichment.
  * **Restaurant Bills & Hotel Confirmations**: On-device **Google ML Kit OCR** (works offline!) extracting merchant, total, foreign currency conversion, check-in/out dates, and confirmation codes.
  * **Your Choice Every Scan**: Attach directly to an **Existing Trip** or **Auto-Create a New Trip** from the scanned ticket.
* **📸 Clean Polaroid Memories vs. 🔒 Tucked-Away Receipts**:
  * **Memories Tab**: Purely photos, stories, and mood stickers—zero receipt clutter!
  * **Spend Tab**: Multi-currency category ledger with compressed grayscale receipts safely tucked away inside each expense row.
* **🗺️ Interactive World Map & 🛂 Ink-Stamped Passport**: Geodesic flight arcs, tappable destination pins, Earth-orbit milestones, rotated rubber country stamps, and an auto-updating **Loyalty Miles & Points Vault**.
* **💌 Shareable Trips & Postcards**: Co-traveler invites (via Google Sign-In) + read-only Family Postcards that automatically hide private spend & receipts.

## Development & Building Android APK

```bash
# Install dependencies
npm install

# Run unit tests (BCBP boarding pass parser, OCR parser, Haversine math, FX)
npm test

# TypeScript check
npx tsc --noEmit

# Build standalone Android Release APK
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

See [docs/CLOUD_SETUP.md](./docs/CLOUD_SETUP.md) for the 5-minute \$0 setup of live Google Sign-In, Supabase Postgres sync, Cloudflare R2 photo storage, and AirLabs live flight lookup.
