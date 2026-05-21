/* ================================================================
   Rooftop Party 2026 — cinematic intro + RSVP flow
   ================================================================ */

(() => {
  const intro      = document.getElementById('intro');
  const rsvp       = document.getElementById('rsvp');
  const confirm    = document.getElementById('confirm');
  const skipBtn    = document.getElementById('skipBtn');
  const beginGate  = document.getElementById('beginGate');
  const form       = document.getElementById('rsvpForm');
  const chairsVid  = document.querySelector('.hero-video.chairs');
  const sofaVid    = document.querySelector('.hero-video.sofa');
  const introText  = document.querySelector('.intro-text');

  /* ---------- 1) Cinematic intro sequencing ----------
     Chairs assemble plays first (starting from its 2s mark via
     the #t=2 URL fragment); when it nears the end, sofa toss
     crossfades in.                                              */

  const safePlay = (v) => v && v.play().catch(() => { /* swallow */ });

  // Linear volume ramp to 0. No-op if muted or already silent.
  const fadeAudio = (video, durationMs) => {
    if (!video || video.muted || video.volume === 0) return;
    const start = video.volume;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / durationMs);
      try { video.volume = start * (1 - p); } catch (_) {}
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const CROSSFADE_SEC      = 0.9;   // seconds before chairs ends → start sofa
  const SOFA_AUDIO_FADE_SEC = 1.5;  // audio fade-out at sofa's natural end
  const HOLD_AFTER_SOFA    = 900;   // ms to linger on the title after sofa ends
  const SAFETY_MS          = 14000; // hard fallback if video events never fire

  // Crossfade chairs → sofa when chairs nears the end
  let sofaStarted = false;
  const startSofa = () => {
    if (sofaStarted) return;
    sofaStarted = true;
    fadeAudio(chairsVid, CROSSFADE_SEC * 1000); // duck chairs audio under sofa
    if (introText) introText.classList.add('is-fading'); // hide 'Rooftop Party 2026' before sofa
    sofaVid.classList.add('is-playing');
    safePlay(sofaVid);
    chairsVid.classList.remove('is-playing');
    chairsVid.classList.add('is-fading');
  };

  chairsVid.addEventListener('timeupdate', () => {
    const d = chairsVid.duration;
    if (!isFinite(d) || d <= 0) return;
    if (chairsVid.currentTime >= d - CROSSFADE_SEC) startSofa();
  });
  chairsVid.addEventListener('ended', startSofa); // belt-and-braces

  // Fade sofa audio in the last SOFA_AUDIO_FADE_SEC of its natural play
  let sofaAudioFaded = false;
  sofaVid.addEventListener('timeupdate', () => {
    if (sofaAudioFaded) return;
    const d = sofaVid.duration;
    if (!isFinite(d) || d <= 0) return;
    if (sofaVid.currentTime >= d - SOFA_AUDIO_FADE_SEC) {
      sofaAudioFaded = true;
      fadeAudio(sofaVid, SOFA_AUDIO_FADE_SEC * 1000);
    }
  });

  sofaVid.addEventListener('ended', () => {
    setTimeout(endIntro, HOLD_AFTER_SOFA);
  });

  // Intro is gated by the user tap so videos can play with sound.
  // introTimer / skip handlers are armed only once the tap fires.
  let introTimer = null;
  let introStarted = false;
  function beginIntro() {
    if (introStarted) return;
    introStarted = true;

    // User gesture unlocks unmuted playback in all major browsers
    try { chairsVid.muted = false; } catch (_) {}
    try { sofaVid.muted = false; } catch (_) {}

    // Dismiss the gate
    beginGate.classList.add('is-dismissing');
    setTimeout(() => beginGate.classList.add('is-done'), 1000);

    // Kick off chairs (short delay so the gate has begun fading)
    setTimeout(() => {
      chairsVid.classList.add('is-playing');
      safePlay(chairsVid);
    }, 500);

    // Safety fallback if video events never fire
    introTimer = setTimeout(endIntro, SAFETY_MS);
  }

  beginGate.addEventListener('click', beginIntro);

  function endIntro() {
    if (intro.classList.contains('is-leaving')) return;
    intro.classList.add('is-leaving');
    rsvp.classList.add('is-active');
    rsvp.setAttribute('aria-hidden', 'false');

    // Fade audio in step with the visual fade so skipping isn't a hard cut
    fadeAudio(chairsVid, 900);
    fadeAudio(sofaVid, 900);

    // After fade, remove from layout
    setTimeout(() => intro.classList.add('is-done'), 1300);

    // Pause videos to save battery
    setTimeout(() => {
      [chairsVid, sofaVid].forEach((v) => { try { v.pause(); } catch (_) {} });
    }, 1400);
  }

  skipBtn.addEventListener('click', () => {
    clearTimeout(introTimer);
    endIntro();
  });

  /* ---------- 2) RSVP form + page switching ---------- */

  const phoneRe = /^[+\d][\d\s\-()]{6,}$/;

  const viewDetailsBtn = document.getElementById('viewDetailsBtn');
  const backToRsvpBtn  = document.getElementById('backToRsvpBtn');
  const confirmName    = document.getElementById('confirmName');

  // Fetch the public guest list from the API (returns null on failure).
  async function fetchGuestList() {
    try {
      const resp = await fetch('/api/rsvp', { method: 'GET' });
      if (!resp.ok) return null;
      const json = await resp.json();
      return Array.isArray(json.guests) ? json.guests : null;
    } catch (_) {
      return null;
    }
  }

  // Switch from the RSVP form to the detail page.
  // - personalized: if truthy, show "Your seat is saved, <First>."; otherwise neutral preview header
  // - serverGuests: optional list from a recent API call (e.g. POST response).
  //   If absent, we render the fallback immediately and re-render with the
  //   real database list as soon as GET /api/rsvp resolves.
  function showDetailPage(personalized, serverGuests) {
    if (personalized) {
      const firstName = personalized.split(/\s+/)[0];
      confirmName.textContent = `Your seat is saved, ${firstName}.`;
    } else {
      confirmName.textContent = 'All you need to know.';
    }

    // Render whatever we have right now so the transition isn't blocked
    // by network latency. If serverGuests is null we'll backfill below.
    renderGuestList(personalized || '', serverGuests);

    rsvp.classList.remove('is-active');
    rsvp.setAttribute('aria-hidden', 'true');

    // Toggle .is-active off → reflow → on so the staggered .reveal
    // transitions replay each visit. Combined with renderGuestList()
    // recreating the <li>s, the per-name animation also replays.
    confirm.classList.remove('is-active');
    void confirm.offsetWidth;
    setTimeout(() => {
      confirm.classList.add('is-active');
      confirm.setAttribute('aria-hidden', 'false');
      try { confirm.scrollTo(0, 0); } catch (_) {}
    }, 50);

    // Backfill from the database if we don't already have a fresh list.
    if (!Array.isArray(serverGuests)) {
      fetchGuestList().then((guests) => {
        if (guests) renderGuestList(personalized || '', guests);
      });
    }
  }

  function showRsvpPage() {
    confirm.classList.remove('is-active');
    confirm.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      rsvp.classList.add('is-active');
      rsvp.setAttribute('aria-hidden', 'false');
      try { rsvp.scrollTo(0, 0); } catch (_) {}
    }, 250);
  }

  if (viewDetailsBtn) viewDetailsBtn.addEventListener('click', () => showDetailPage('', null));
  if (backToRsvpBtn)  backToRsvpBtn.addEventListener('click', showRsvpPage);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fields = {
      name:  form.elements.name,
      phone: form.elements.phone,
    };

    let firstInvalid = null;
    Object.entries(fields).forEach(([key, input]) => {
      const wrap = input.closest('.field');
      const val  = input.value.trim();
      let ok = val.length > 0;
      if (key === 'phone') ok = phoneRe.test(val);

      wrap.classList.toggle('has-error', !ok);
      if (!ok && !firstInvalid) firstInvalid = input;
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const allergyInput = form.elements.allergy;
    const data = {
      name:    fields.name.value.trim(),
      phone:   fields.phone.value.trim(),
      allergy: allergyInput ? allergyInput.value.trim() : '',
    };

    // Disable the button while we save
    const submitBtn = form.querySelector('.submit-btn');
    const originalLabel = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Reserving…</span>';

    // POST to the shared RSVP store. If the API is unreachable (local
    // static dev, network drop), we still proceed with the detail page
    // using a local-only fallback so the user sees confirmation.
    let serverGuests = null;
    try {
      const resp = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json.guests)) serverGuests = json.guests;
      }
    } catch (_) { /* swallow; fall through to local fallback */ }

    // Also keep a local copy as a belt-and-braces backup
    try {
      const list = JSON.parse(localStorage.getItem('glampingRsvps') || '[]');
      list.push({ ...data, at: new Date().toISOString() });
      localStorage.setItem('glampingRsvps', JSON.stringify(list));
    } catch (_) { /* ignore */ }

    submitBtn.disabled = false;
    submitBtn.innerHTML = originalLabel;

    showDetailPage(data.name, serverGuests);
  });

  /* ---------- 3) Guest list ----------
     Source-of-truth is the /api/rsvp endpoint (Upstash Redis on Vercel).
     If the API returned a list (`serverGuests`), use it verbatim — that
     is the real shared list. If not (local static dev, network drop),
     fall back to localStorage + a small set of seed names so the page
     never looks empty. */

  const SEEDED_GUESTS = [
    'Maria Lopez',
    'James Chen',
    'Sarah Williams',
    'David Park',
    'Emily Tan',
  ];

  function renderGuestList(currentName, serverGuests) {
    const ul = document.getElementById('guestList');
    if (!ul) return;

    let names;
    if (Array.isArray(serverGuests)) {
      // API responded. Trust it verbatim — even an empty array means
      // "database is genuinely empty," not "fall back to fake names."
      names = serverGuests.map((g) => (g && g.name) || '').filter(Boolean);
    } else {
      // No API response at all (local static dev, network drop) — use a
      // local fallback so the page never looks broken or empty.
      let local = [];
      try {
        const stored = JSON.parse(localStorage.getItem('glampingRsvps') || '[]');
        local = stored.map((r) => (r && r.name ? r.name.trim() : '')).filter(Boolean).reverse();
      } catch (_) { /* ignore */ }
      names = [...local, ...SEEDED_GUESTS];
    }

    // Case-insensitive dedupe
    const seen = new Set();
    const unique = names.filter((n) => {
      const key = (n || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const currKey = (currentName || '').trim().toLowerCase();
    ul.innerHTML = '';

    if (!unique.length) {
      const empty = document.createElement('li');
      empty.className = 'guest-list-empty';
      empty.textContent = 'Be the first to RSVP';
      ul.appendChild(empty);
      return;
    }

    unique.forEach((name, i) => {
      const li = document.createElement('li');
      li.textContent = name;
      li.style.setProperty('--i', i);
      if (currKey && name.toLowerCase() === currKey) li.classList.add('you');
      ul.appendChild(li);
    });
  }

  // Clear error state as user types
  form.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      input.closest('.field').classList.remove('has-error');
    });
  });
})();
