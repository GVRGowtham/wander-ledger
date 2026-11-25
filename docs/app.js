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
    passport: {
      img: 'assets/screen-passport.webp',
      alt: "Wanderer's Ledger Digital Passport ink stamps and offline reminders",
      heading: 'Real ink stamps for places you truly explored.',
      summary:
        'Your World Map draws curved geodesic flight arcs across every trip, while your Digital Passport collects vintage country ink stamps — derived strictly from your logged flights, trains, drives, and city Stops.',
      points: [
        [
          'Short Layovers Stay Separate',
          'Airside airport connections under 24 hours appear as hollow Transit Hub rings without inflating your country count.',
        ],
        [
          '100% Offline Travel Reminders',
          'Optional on-device alerts for 24-hour flight check-in, 3-hour airport departures, and hotel check-in mornings.',
        ],
        [
          'Portable .json Backup & Loyalty Vault',
          'Export or import your entire travelogue offline anytime, and watch airline miles accumulate automatically.',
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
      alt: "Wanderer's Ledger chronological Bookings timeline with Google Maps",
      heading: 'Every flight, train, drive & hotel in one timeline.',
      summary:
        'See your entire journey unfold chronologically from departure to return — with connecting flights stitched cleanly together and every hotel card one tap away from Google Maps directions.',
      points: [
        [
          'Revisit-Preserving Multi-Hop Routes',
          'Connecting layovers stitch cleanly (BOM → ZRH via DXB) while hub-and-spoke city revisits stay in exact travel order.',
        ],
        [
          'Editable Stay Locations & Address Lookup',
          'Edit any saved stay anytime with zero-cost OpenStreetMap address lookup or verify directly on Google Maps.',
        ],
        [
          '1-Tap Google Maps Directions',
          'Tap Maps on any stay card while traveling to launch native turn-by-turn navigation instantly.',
        ],
      ],
    },
    shared: {
      img: 'assets/screen-shared.webp',
      alt: "Wanderer's Ledger co-traveler Editor/Viewer roles and family postcards",
      heading: 'Co-log trips together without exposing personal bills.',
      summary:
        'Cleanly separate collaborative Co-Traveler trips from one-tap Family Postcards — with built-in role permissions that keep your private spending strictly on your device.',
      points: [
        [
          'Editor vs. Read-Only Viewer Roles',
          'Editors co-log Polaroids, bookings, and Shared group expenses; Viewers browse Memories & Bookings with Spend hidden.',
        ],
        [
          'Personal vs. Shared Expense Split',
          'Mark shared hotel rooms or group dinners as Shared while keeping flights and shopping strictly Personal.',
        ],
        [
          'One-Tap Family Postcards',
          'Share clean trip snapshots with parents and friends without ever sending boarding numbers or receipts.',
        ],
      ],
    },
    keepsake: {
      img: 'assets/screen-keepsake.webp',
      alt: "Wanderer's Ledger Keepsake Magazine A4 PDF Studio screen",
      heading: 'Turn any journey into a printable A4 travel book.',
      summary:
        'When the trip wraps up, craft a timeless A4 PDF travelogue right on your phone — with three complete end-to-end themes, 1:1 WYSIWYG drag-and-zoom covers, grouped boarding passes, and Polaroid spreads.',
      points: [
        [
          'Three Complete End-to-End Themes',
          'Switch between Magazine, Art Book, and Passport folios — styling covers, headers, stamps, and memory pages cohesively.',
        ],
        [
          '1:1 WYSIWYG Cover Framing',
          'Drag and pinch-zoom your favorite cover photo so the exported A4 PDF matches your preview down to the pixel.',
        ],
        [
          '100% Offline & Spend-Free Forever',
          'Every fare, hotel bill, budget, and receipt is automatically left out — ready to print or gift to family.',
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
