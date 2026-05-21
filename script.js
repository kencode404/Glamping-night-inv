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
  const introVid   = document.querySelector('.hero-video.intro-video');
  const introText  = document.querySelector('.intro-text');
  const bgMusic    = document.getElementById('bgMusic');

  /* ---------- 1) Cinematic intro sequencing ----------
     Gate tap → music starts → title card reveals + fades →
     muted intro video plays → video ends → endIntro. */

  const safePlay = (v) => v && v.play().catch(() => { /* swallow */ });

  // Mobile browsers (iOS Safari in particular) require each <video>
  // to be "activated" inside a user gesture before a later play()
  // (off-gesture) will work. play()+pause() in the gate handler primes it.
  function primeVideo(video, startAt) {
    if (!video) return;
    try {
      video.muted = true;
      const p = video.play();
      if (p && p.then) {
        p.then(() => {
          try { video.pause(); } catch (_) {}
          try { video.currentTime = startAt || 0; } catch (_) {}
        }).catch(() => {});
      }
    } catch (_) { /* swallow */ }
  }

  // Linear ramp UP from 0 → target volume. No-op on iOS where the
  // .volume property is read-only — there the music just plays at
  // user system volume.
  const fadeInVolume = (media, target, durationMs) => {
    if (!media) return;
    try { media.volume = 0; } catch (_) {}
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / durationMs);
      try { media.volume = target * p; } catch (_) {}
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const HOLD_AFTER_VIDEO = 900;   // ms to linger after the video ends
  const SAFETY_MS        = 30000; // hard fallback if the video never ends

  // Single video — no crossfade, no sofa, just play until ended.
  introVid.addEventListener('ended', () => {
    setTimeout(endIntro, HOLD_AFTER_VIDEO);
  });

  // Intro is gated by the user tap so the video can play (mobile) and
  // the music can start (autoplay policy).
  let introTimer       = null;
  let introStarted     = false;
  let titleFadeTimer   = null;
  let videoPlayTimer   = null;
  let musicShouldPlay  = false;

  // Title-card sequence timings (all from the gate tap):
  //   ~0.6s  eyebrow fades in
  //   ~1.0s  title fades in
  //   ~1.5s  subtitle fades in
  //   ~2.9s  title fully revealed
  //   +HOLD_MS hold
  //   +TITLE_FADE_MS fade out, then video plays
  const TITLE_REVEAL_MS = 2900;
  const HOLD_MS         = 700;
  const TITLE_FADE_MS   = 800;

  function beginIntro() {
    if (introStarted) return;
    introStarted = true;

    // Prime the (muted) intro video so a later play() works on mobile.
    primeVideo(introVid, 0);

    // Music plays continuously from the gate tap all the way through
    // the title card, video, RSVP form, and detail page. Start it
    // synchronously inside the user gesture so mobile browsers permit
    // it. The fadeInVolume call ramps the volume up on browsers that
    // respect .volume; on iOS (read-only volume) the music just plays
    // at user system level.
    if (bgMusic) {
      try {
        bgMusic.muted = false;
        const p = bgMusic.play();
        if (p && p.catch) p.catch(() => {});
        fadeInVolume(bgMusic, 0.4, 1500);
      } catch (_) { /* swallow */ }

      musicShouldPlay = true;

      // Auto-resume if iOS suspends the audio behind our back
      // (sometimes happens when sibling <video> pauses).
      bgMusic.addEventListener('pause', () => {
        if (!musicShouldPlay) return;
        setTimeout(() => {
          if (musicShouldPlay && bgMusic.paused) safePlay(bgMusic);
        }, 50);
      });
    }

    // Dismiss the gate and arm the title-card animations
    beginGate.classList.add('is-dismissing');
    setTimeout(() => beginGate.classList.add('is-done'), 1000);
    intro.classList.add('is-ready');

    // After the title card reveals + holds, fade it out
    titleFadeTimer = setTimeout(() => {
      if (introText) introText.classList.add('is-fading');
    }, TITLE_REVEAL_MS + HOLD_MS);

    // Start the intro video once the title has finished fading.
    // Force currentTime back to 0 right before play — the prime step
    // can leave the video at a non-zero position (the play() promise
    // resolves after the video has been running for some ms, and the
    // post-pause seek to 0 is async and not guaranteed to complete
    // before this point). Without this re-seek, the video occasionally
    // appeared mid-clip.
    videoPlayTimer = setTimeout(() => {
      try { introVid.currentTime = 0; } catch (_) {}
      introVid.classList.add('is-playing');
      safePlay(introVid);
    }, TITLE_REVEAL_MS + HOLD_MS + TITLE_FADE_MS);

    // Safety fallback in case the 'ended' event never fires
    introTimer = setTimeout(endIntro, SAFETY_MS);
  }

  beginGate.addEventListener('click', beginIntro);

  function endIntro() {
    if (intro.classList.contains('is-leaving')) return;
    intro.classList.add('is-leaving');

    // Cancel pending transitions if the user skipped during the title
    // card (otherwise the video would start playing in the background).
    clearTimeout(titleFadeTimer);
    clearTimeout(videoPlayTimer);
    clearTimeout(introTimer);

    // Let the intro (video) fade FIRST, then bring the RSVP form in.
    // Intro's CSS transition is 1.2s; activate the form near the end
    // of that fade so it crossfades cleanly without competing with the
    // video underneath. Scroll the form to top so its header is in
    // view on phones where the form is taller than the viewport.
    setTimeout(() => {
      rsvp.classList.add('is-active');
      rsvp.setAttribute('aria-hidden', 'false');
      try { rsvp.scrollTo(0, 0); } catch (_) {}
    }, 1000);

    // After fade, remove from layout
    setTimeout(() => intro.classList.add('is-done'), 1300);

    // Pause the video to save battery; ensure the music keeps going
    // (iOS may otherwise suspend it when the video pauses).
    setTimeout(() => {
      try { introVid.pause(); } catch (_) {}
      if (musicShouldPlay) safePlay(bgMusic);
    }, 1400);
  }

  skipBtn.addEventListener('click', endIntro);

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

  // Format an ISO timestamp into a short, friendly label.
  // Example output: "Jul 18 · 2:34 PM"
  function formatRsvpTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${date} · ${time}`;
  }

  function renderGuestList(currentName, serverGuests) {
    const ul = document.getElementById('guestList');
    if (!ul) return;

    let entries;
    if (Array.isArray(serverGuests)) {
      // API responded. Trust it verbatim — even an empty array means
      // "database is genuinely empty," not "fall back to fake names."
      entries = serverGuests
        .map((g) => ({
          name: g && g.name ? String(g.name).trim() : '',
          time: g && g.created_at ? g.created_at : null,
        }))
        .filter((e) => e.name);
    } else {
      // No API response at all (local static dev, network drop) — use a
      // local fallback so the page never looks broken or empty. No
      // timestamps in this path; they only exist on database rows.
      let local = [];
      try {
        const stored = JSON.parse(localStorage.getItem('glampingRsvps') || '[]');
        local = stored.map((r) => (r && r.name ? r.name.trim() : '')).filter(Boolean).reverse();
      } catch (_) { /* ignore */ }
      entries = [...local, ...SEEDED_GUESTS].map((name) => ({ name, time: null }));
    }

    // Case-insensitive dedupe
    const seen = new Set();
    const unique = entries.filter((e) => {
      const key = e.name.toLowerCase();
      if (seen.has(key)) return false;
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

    unique.forEach((entry, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--i', i);
      if (currKey && entry.name.toLowerCase() === currKey) li.classList.add('you');

      const nameEl = document.createElement('span');
      nameEl.className = 'g-name';
      nameEl.textContent = entry.name;
      li.appendChild(nameEl);

      const label = formatRsvpTime(entry.time);
      if (label) {
        const timeEl = document.createElement('time');
        timeEl.className = 'g-time';
        timeEl.dateTime = entry.time;
        timeEl.textContent = label;
        li.appendChild(timeEl);
      }

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
