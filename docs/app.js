/* ==========================================================================
   Wanderer's Ledger — Landing Page Interactions & Native Google Form Bridge
   ========================================================================== */

/**
 * NATIVE GOOGLE FORMS CONFIGURATION
 * To connect submissions directly to your Google Sheet (zero Google Forms UI shown):
 * 1. Create a Google Form with 4 short-answer / choice questions:
 *    - Name
 *    - Platform
 *    - Email
 *    - Next Trip (Optional)
 * 2. Click "..." -> "Get pre-filled link", fill dummy values, click "Get link",
 *    and paste your formId + entry.* IDs below (or share that pre-filled link
 *    with your assistant to wire it automatically!).
 */
const EARLY_ACCESS_CONFIG = {
  googleFormActionUrl:
    'https://docs.google.com/forms/d/e/1FAIpQLSf_QZIpEWylUvMiYgYxoQDLhAvUT3KAf_-ESg9zzr5MLxcyFQ/formResponse',
  fields: {
    name: 'entry.1775615350',
    platform: 'entry.1531470188',
    email: 'entry.1111102350',
    nextTrip: 'entry.1035916571',
  },
  fallbackMailto: 'vg.life.apps@gmail.com',
};

/* --------------------------------------------------------------------------
   1. Mobile Navigation Toggle
   -------------------------------------------------------------------------- */
(function initNav() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('primary-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
})();

/* --------------------------------------------------------------------------
   2. Hero Vertical Story Video Overlay Control
   -------------------------------------------------------------------------- */
(function initHeroVideo() {
  const video = document.getElementById('story-video');
  const playBtn = document.getElementById('video-play-btn');
  if (!video || !playBtn) return;

  playBtn.addEventListener('click', () => {
    video.controls = true;
    playBtn.classList.add('is-hidden');
    video.play().catch(() => {
      playBtn.classList.remove('is-hidden');
    });
  });

  video.addEventListener('play', () => {
    video.controls = true;
    playBtn.classList.add('is-hidden');
  });

  video.addEventListener('ended', () => {
    playBtn.classList.remove('is-hidden');
  });
})();

/* --------------------------------------------------------------------------
   3. Interactive 5-Tab Feature Explorer
   -------------------------------------------------------------------------- */
(function initFeatureTabs() {
  const FEATURES = {
    scan: {
      img: 'assets/screen-scan.webp',
      alt: "Wanderer's Ledger Smart Magic Scan multi-leg review screen",
      heading: 'Share one PDF. Every leg falls into place.',
      summary:
        'Forward multi-page airline e-tickets, hotel vouchers, train tickets, or restaurant receipts straight from Gmail or WhatsApp. On-device ML Kit OCR reads routes, times, addresses, and totals offline — with every field editable before you save.',
      points: [
        [
          'Multi-Leg & Open-Jaw Flight PDFs',
          'Splits 4-leg itineraries into individual chronological flights while creating only one combined Spend entry.',
        ],
        [
          'Clean Hotel Name & Address Extraction',
          'Extracts real property names and PIN-code addresses while ignoring greetings and boilerplate disclaimers.',
        ],
        [
          '1-Tap Amount Chips & Auto HH:MM',
          'Swap between Base Fare and Grand Total in a tap, and type 4 digits to auto-format departure times cleanly.',
        ],
      ],
    },
    drive: {
      img: 'assets/screen-passport.webp',
      alt: "Wanderer's Ledger Passport screen showing Private Google Drive Backup and Auto Daily Sync",
      heading: 'Private Google Drive backup — strictly in your own Drive.',
      summary:
        'Stay 100% offline-first with optional personal cloud backup directly to your own hidden Google Drive app folder. Trips, expenses, FX snapshots, and compressed travel photos back up incrementally — with zero developer servers in between.',
      points: [
        [
          'Auto Daily Backup & Wi-Fi-Only Full Photos',
          'Enable quiet daily background backups while keeping full photo uploads on Wi-Fi only so roaming cellular data stays safe.',
        ],
        [
          '1-Tap Restore on a New Phone',
          'Sign in with Google on a new or reinstalled device to detect your existing backup and restore your entire travelogue in one tap.',
        ],
        [
          'Private App Folder & Instant Cloud Delete',
          'Uses only Google’s narrow drive.appdata scope — Wanderer’s Ledger never sees your other Drive files, and Delete Cloud Backup works anytime.',
        ],
      ],
    },
    passport: {
      img: 'assets/screen-map.webp',
      alt: "Wanderer's Ledger World Map with year filters, flight arcs, and transit hubs",
      heading: 'Real ink stamps & year-filtered maps for places you truly explored.',
      summary:
        'Your World Map draws curved geodesic flight arcs across every trip and filters cleanly by year, while your Digital Passport collects crisp vintage country ink stamps derived strictly from logged flights, trains, drives, and city Stops.',
      points: [
        [
          'Year Filters & Compact Multi-Country Chips',
          'Slice your global footprint by year (All Years, 2026, 2025…) and tap any pin or trip chip to preview highlight quotes and stats.',
        ],
        [
          'Short Layovers Stay Separate',
          'Airside airport connections under 24 hours appear as hollow Transit Hub rings without inflating your visited country count.',
        ],
        [
          '100% Offline Travel Reminders & Miles Vault',
          'Optional on-device alerts for 24-hour flight check-in, 3-hour departures, and hotel mornings — plus automatic airline miles tracking.',
        ],
      ],
    },
    spend: {
      img: 'assets/screen-spend.webp',
      alt: "Wanderer's Ledger unified multi-currency spend ledger with historical FX",
      heading: 'Private multi-currency spend, locked to the day you paid.',
      summary:
        'Log meals, trains, hotels, and tickets in CHF, EUR, JPY, USD, or INR. Wanderer’s Ledger converts everything into your Home Currency using historical date-locked FX snapshots stored right on your phone.',
      points: [
        [
          'Bookings Auto-Sync With Zero Duplication',
          'Priced trains, buses, ferries, rentals, and hotel stays logged in Bookings automatically flow into Spend.',
        ],
        [
          'Historical FX & Optional Pay Later',
          'Prepaid bookings lock to their payment date; toggle Pay Later on check-in hotels to track live rates until arrival.',
        ],
        [
          'Instant Currency Switch & CSV Export',
          'Change your Home Currency in Passport to re-calculate every trip live, or export clean CSV spreadsheets anytime.',
        ],
      ],
    },
    bookings: {
      img: 'assets/screen-bookings.webp',
      alt: "Wanderer's Ledger chronological Bookings timeline with editable trains and Google Maps",
      heading: 'Every flight, train, drive & hotel in one editable timeline.',
      summary:
        'See your entire journey unfold chronologically from departure to return — with connecting flights stitched cleanly together, editable trains, buses, cars, and stays, and 1-tap Google Maps navigation.',
      points: [
        [
          'Revisit-Preserving Multi-Hop Routes',
          'Connecting layovers stitch cleanly (BOM → ZRH via DXB) while hub-and-spoke city revisits stay in exact travel order.',
        ],
        [
          'Editable Trains, Buses, Cars & Stays',
          'Tap Edit on any transport or hotel card to adjust dates, routes, or cost (with instant Spend sync) and free OpenStreetMap address lookup.',
        ],
        [
          '1-Tap Google Maps Directions',
          'Tap Maps on any stay card while traveling to launch native turn-by-turn navigation instantly.',
        ],
      ],
    },
    studio: {
      img: 'assets/screen-studio.webp',
      alt: "Wanderer's Ledger dedicated Studio tab with IG Studio, Keepsake PDF Book, and Postcard actions",
      heading: 'One dedicated Studio tab for every spend-free keepsake.',
      summary:
        'Browse every trip from the new bottom-bar Studio tab and craft a printable 3-theme A4 Keepsake Magazine PDF, a 1080p Instagram collage or Story, or a 1-tap Family Postcard — 100% offline with zero prices ever shown.',
      points: [
        [
          '3-Theme Printable A4 Keepsake Books',
          'Switch between Magazine, Art Book, and Passport folios with 1:1 WYSIWYG drag-and-zoom cover framing.',
        ],
        [
          '1080p Instagram Studio & Spend-Free Captions',
          'Build 4:5 Feed collages, 9:16 Stories, and Carousels paired with offline captions that never mention fares or budgets.',
        ],
        [
          '1-Tap Family Postcards',
          'Share crisp route & photo postcards straight to WhatsApp or Messages in a single tap — guaranteed receipt-free.',
        ],
      ],
    },
  };

  const tabs = document.querySelectorAll('.feature-tab');
  const img = document.getElementById('feature-screen-img');
  const heading = document.getElementById('feature-heading');
  const summary = document.getElementById('feature-summary');
  const pointsEl = document.getElementById('feature-points');
  if (!tabs.length || !img || !heading || !summary || !pointsEl) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.getAttribute('data-feature');
      const data = key ? FEATURES[key] : null;
      if (!data) return;

      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });

      img.style.opacity = '0.35';
      setTimeout(() => {
        img.src = data.img;
        img.alt = data.alt;
        img.style.opacity = '1';
      }, 110);

      heading.textContent = data.heading;
      summary.textContent = data.summary;
      pointsEl.innerHTML = data.points
        .map(
          ([title, desc], idx) => `
          <li>
            <span class="pt-num">0${idx + 1}</span>
            <div>
              <strong>${title}</strong>
              <span>${desc}</span>
            </div>
          </li>`
        )
        .join('');
    });
  });
})();

/* --------------------------------------------------------------------------
   4. Interactive Instagram Studio (Format Switcher + Illustrated Scenes)
   -------------------------------------------------------------------------- */
(function initInstagramStudio() {
  const card = document.getElementById('ig-card');
  const fmtBtns = document.querySelectorAll('.format-btn');
  const sceneBtns = document.querySelectorAll('.scene-btn');
  const heroImg = document.getElementById('ig-hero-img');
  const subImg = document.getElementById('ig-sub-img');
  const subCaption = document.getElementById('ig-sub-caption');
  const stampPill = document.getElementById('ig-stamp-pill');
  const collageStamp = document.getElementById('ig-collage-stamp');
  const collageRoute = document.getElementById('ig-collage-route');
  const routeTag = document.getElementById('ig-route-tag');
  const titleEl = document.getElementById('ig-title');
  const statsLeft = document.getElementById('ig-stats-left');
  const statsRight = document.getElementById('ig-stats-right');
  const captionText = document.getElementById('studio-caption-text');
  const specRatio = document.getElementById('studio-spec-ratio');
  const copyBtn = document.getElementById('copy-caption-btn');

  if (!card || !fmtBtns.length || !sceneBtns.length) return;

  const FORMAT_SPECS = {
    story: '1080×1920 · 9:16 Story PNG',
    collage: '1080×1350 · 4:5 Feed Collage PNG',
    stamp: '1080×1350 · 4:5 Passport Card PNG',
  };

  const SCENES = {
    alps: {
      heroImg: 'assets/scene-alps.svg',
      heroAlt: 'Illustrated Swiss Alps red scenic train crossing stone viaduct over turquoise lake',
      subImg: 'assets/scene-alps-2.svg',
      subAlt: 'Illustrated Alpine cable car over wildflower meadow',
      subCaption: 'Mt. Pilatus · Sep 15',
      stamp: 'ADMITTED · SWITZERLAND',
      shortRoute: 'BOM → ZRH → LUCERNE',
      routeTag: 'SEP 12 – SEP 21 · BOM → ZRH → LUCERNE',
      title: 'Swiss Alps Autumn',
      statsLeft: '14,680 KM · 2 COUNTRIES',
      statsRight: '6 MEMORIES',
      caption:
        "From boarding gates to alpine train windows — 9 sunlit days winding through Zurich, Lake Lucerne, and the peaks beyond.\n\nRoute: Mumbai → Zurich → Lucerne → Munich\n14,680 km logged · 2 new passport stamps · 6 favorite frames.\n\nLogged offline with Wanderer's Ledger.\n#SwissAlps #TravelJournal #WanderersLedger",
    },
    kyoto: {
      heroImg: 'assets/scene-kyoto.svg',
      heroAlt: 'Illustrated Kyoto vermilion torii gate, pagoda, paper lanterns, and autumn maple trees',
      subImg: 'assets/scene-kyoto-2.svg',
      subAlt: 'Illustrated Shinkansen bullet train passing snow-capped Mount Fuji',
      subCaption: 'Shinkansen · Nov 06',
      stamp: 'ADMITTED · JAPAN',
      shortRoute: 'BLR → HND → KYOTO',
      routeTag: 'NOV 02 – NOV 11 · BLR → HND → KYOTO',
      title: 'Kyoto Lanterns',
      statsLeft: '13,240 KM · 1 COUNTRY',
      statsRight: '12 MEMORIES',
      caption:
        "Quiet stone pathways, glowing paper lanterns, and crimson maples at twilight — nine unhurried days between Tokyo and Kyoto.\n\nRoute: Bengaluru → Tokyo → Kyoto → Osaka\n13,240 km logged · 1 new passport stamp · 12 favorite frames.\n\nLogged offline with Wanderer's Ledger.\n#KyotoAutumn #JapanTravel #WanderersLedger",
    },
    amalfi: {
      heroImg: 'assets/scene-amalfi.svg',
      heroAlt: 'Illustrated Amalfi Coast pastel cliffside villas, lemon branches, and white sailboat on turquoise sea',
      subImg: 'assets/scene-amalfi-2.svg',
      subAlt: 'Illustrated vintage red scooter and striped umbrellas along a sunlit Mediterranean terrace',
      subCaption: 'Positano · Jun 19',
      stamp: 'ADMITTED · ITALY',
      shortRoute: 'DEL → FCO → AMALFI',
      routeTag: 'JUN 16 – JUN 23 · DEL → FCO → AMALFI',
      title: 'Amalfi Sunsets',
      statsLeft: '12,110 KM · 1 COUNTRY',
      statsRight: '9 MEMORIES',
      caption:
        "Lemon groves above the cliffs, coastal ferries, and slow Mediterranean evenings — a week of warm sea breeze along the Amalfi Coast.\n\nRoute: New Delhi → Rome → Naples → Positano\n12,110 km logged · 1 new passport stamp · 9 favorite frames.\n\nLogged offline with Wanderer's Ledger.\n#AmalfiCoast #ItalyDiaries #WanderersLedger",
    },
  };

  fmtBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const fmt = btn.getAttribute('data-studio-format') || 'story';
      card.setAttribute('data-format', fmt);
      fmtBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      if (specRatio) specRatio.textContent = FORMAT_SPECS[fmt] || FORMAT_SPECS.story;
    });
  });

  sceneBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-studio-scene') || 'alps';
      const s = SCENES[key] || SCENES.alps;

      sceneBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });

      if (heroImg) {
        heroImg.src = s.heroImg;
        heroImg.alt = s.heroAlt;
      }
      if (subImg) {
        subImg.src = s.subImg;
        subImg.alt = s.subAlt;
      }
      if (subCaption) subCaption.textContent = s.subCaption;
      if (stampPill) stampPill.textContent = s.stamp;
      if (collageStamp) collageStamp.textContent = s.stamp;
      if (collageRoute) collageRoute.textContent = s.shortRoute;
      if (routeTag) routeTag.textContent = s.routeTag;
      if (titleEl) titleEl.textContent = s.title;
      if (statsLeft) statsLeft.textContent = s.statsLeft;
      if (statsRight) statsRight.textContent = s.statsRight;
      if (captionText) captionText.textContent = s.caption;
      if (copyBtn) copyBtn.textContent = 'Copy Sample Caption';
    });
  });

  if (copyBtn && captionText) {
    copyBtn.addEventListener('click', async () => {
      const text = captionText.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied to Clipboard ✓';
      } catch {
        copyBtn.textContent = 'Caption Ready ✓';
      }
      setTimeout(() => {
        copyBtn.textContent = 'Copy Sample Caption';
      }, 2200);
    });
  }
})();

/* --------------------------------------------------------------------------
   5. Native Early Access Form -> Silent Google Forms POST
   -------------------------------------------------------------------------- */
(function initEarlyAccessForm() {
  const form = document.getElementById('early-access-form');
  const errorEl = document.getElementById('ea-error');
  const submitBtn = document.getElementById('ea-submit-btn');
  const successBox = document.getElementById('ea-success');
  const successMsg = document.getElementById('ea-success-msg');
  const emailLabel = document.getElementById('ea-email-label');
  const emailHint = document.getElementById('ea-email-hint');
  const emailInput = document.getElementById('ea-email');
  if (!form || !errorEl || !submitBtn || !successBox) return;

  // Dynamically tailor email helper copy for Android Play Store vs iOS TestFlight
  form.querySelectorAll('input[name="platform"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isIos = radio.value.toLowerCase().includes('ios');
      if (emailLabel) {
        emailLabel.textContent = isIos ? 'Apple ID / Email Address' : 'Google Play Email Address';
      }
      if (emailHint) {
        emailHint.textContent = isIos
          ? "Watch your inbox — you'll be first to receive a TestFlight invite when iOS takes off."
          : 'Enter your Google Play Gmail so we can unlock your private Play Store access.';
      }
      if (emailInput) {
        emailInput.placeholder = isIos ? 'you@icloud.com' : 'you@gmail.com';
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.remove('is-visible');
    errorEl.textContent = '';

    const name = (document.getElementById('ea-name')?.value || '').trim();
    const email = (emailInput?.value || '').trim();
    const platform =
      form.querySelector('input[name="platform"]:checked')?.value || 'Android';
    const nextTrip = (document.getElementById('ea-trip')?.value || '').trim();

    if (name.length < 2) {
      errorEl.textContent = 'Please enter your name so we know who to invite.';
      errorEl.classList.add('is-visible');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.classList.add('is-visible');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Issuing your pass...';

    try {
      if (EARLY_ACCESS_CONFIG.googleFormActionUrl) {
        const body = new URLSearchParams();
        body.append(EARLY_ACCESS_CONFIG.fields.name, name);
        body.append(EARLY_ACCESS_CONFIG.fields.platform, platform);
        body.append(EARLY_ACCESS_CONFIG.fields.email, email);
        if (EARLY_ACCESS_CONFIG.fields.nextTrip) {
          body.append(EARLY_ACCESS_CONFIG.fields.nextTrip, nextTrip || '—');
        }

        // Silent no-cors POST straight into Google Forms -> lands cleanly in your Google Sheet
        await fetch(EARLY_ACCESS_CONFIG.googleFormActionUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          body: body.toString(),
        });
      } else {
        // Fallback if Google Form URL has not been pasted yet: opens pre-filled email cleanly
        const subject = encodeURIComponent(`Wanderer's Ledger Early Access — ${name}`);
        const mailBody = encodeURIComponent(
          `Hi! I'd love early access to Wanderer's Ledger.\n\nName: ${name}\nPlatform: ${platform}\nEmail: ${email}\nNext Trip: ${nextTrip || 'TBD'}\n`
        );
        window.location.href = `mailto:${EARLY_ACCESS_CONFIG.fallbackMailto}?subject=${subject}&body=${mailBody}`;
      }

      form.style.display = 'none';
      if (successMsg) {
        const isIos = platform.toLowerCase().includes('ios');
        successMsg.textContent = isIos
          ? `You're on the founding iOS list, ${name}! Watch ${email} — you'll be first to receive a TestFlight invite when iOS takes off.`
          : `You're in, ${name}! We're unlocking early access for ${email} — watch your inbox for your private Google Play invite and be among the first travelers inside.`;
      }
      successBox.classList.add('is-visible');
    } catch {
      errorEl.textContent = 'Something went wrong while sending — please try again in a moment.';
      errorEl.classList.add('is-visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request Early Access';
    }
  });
})();

/* --------------------------------------------------------------------------
   6. Accessible FAQ Accordion
   -------------------------------------------------------------------------- */
(function initFaq() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach((item) => {
    const btn = item.querySelector('.faq-trigger');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const willOpen = !item.classList.contains('is-open');
      items.forEach((other) => {
        other.classList.remove('is-open');
        const ob = other.querySelector('.faq-trigger');
        if (ob) ob.setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        item.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
})();
