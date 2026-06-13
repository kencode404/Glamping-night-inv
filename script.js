/* ================================================================
   Rooftop Party 2026 — cinematic intro + detail page
   ================================================================ */

(() => {
  const intro      = document.getElementById('intro');
  const confirm    = document.getElementById('confirm');
  const skipBtn    = document.getElementById('skipBtn');
  const beginGate  = document.getElementById('beginGate');
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
    // the title card, video, and detail page. Start it
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

    // The RSVP window has closed — go straight to the detail page.
    // Let the intro (video) fade FIRST, then bring the detail page in
    // near the end of that 1.2s fade so it crossfades cleanly.
    showDetailPage();

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

  /* ---------- 2) Detail page ---------- */

  // Reveal the detail page and populate the guest list.
  function showDetailPage() {
    renderGuestList();

    // Toggle .is-active off → reflow → on so the staggered .reveal
    // transitions play. Combined with renderGuestList() recreating
    // the <li>s, the per-name animation also plays.
    confirm.classList.remove('is-active');
    void confirm.offsetWidth;
    setTimeout(() => {
      confirm.classList.add('is-active');
      confirm.setAttribute('aria-hidden', 'false');
      try { confirm.scrollTo(0, 0); } catch (_) {}
    }, 1000);
  }

  /* ---------- 3) Guest list ----------
     The list is hardcoded in guests.js (window.GUESTS). Only names are
     shown on the page; allergies live in that data but are never
     rendered here — they're only written into the downloaded CSV. */

  function getGuests() {
    return Array.isArray(window.GUESTS) ? window.GUESTS : [];
  }

  function renderGuestList() {
    const ol = document.getElementById('guestList');
    if (!ol) return;

    const guests = getGuests().filter((g) => g && g.name);
    ol.innerHTML = '';

    if (!guests.length) {
      const empty = document.createElement('li');
      empty.className = 'guest-list-empty';
      empty.textContent = 'No guests yet';
      ol.appendChild(empty);
      return;
    }

    guests.forEach((g, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--i', i);

      const nameEl = document.createElement('span');
      nameEl.className = 'g-name';
      nameEl.textContent = g.name;
      li.appendChild(nameEl);

      ol.appendChild(li);
    });
  }

  // Build a CSV (with the private allergy column) from the hardcoded
  // guest list and trigger a download — entirely client-side, no server.
  function csvEscape(value) {
    if (value == null) return '';
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function downloadGuestCSV() {
    const guests = getGuests().filter((g) => g && g.name);
    const header = ['No.', 'Name', 'Phone', 'Food Allergy'];
    const rows = guests.map((g, i) => [i + 1, g.name, g.phone || '', g.allergy || '']);
    // Leading BOM so Excel opens the UTF-8 file cleanly.
    const csv = '﻿' + [header, ...rows]
      .map((r) => r.map(csvEscape).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rooftop-party-2026-guests.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadGuestCSV);

  /* ---------- 4) Live countdown to the event ----------
     Ticks every second. Local time interpretation — fine since the
     guests are in the same timezone as the rooftop venue. */

  const EVENT_DATE = new Date('2026-07-25T18:30:00');

  function updateCountdown() {
    const els = document.querySelectorAll('[data-countdown]');
    if (!els.length) return;
    const diff = EVENT_DATE.getTime() - Date.now();
    let html;
    if (diff <= 0) {
      html = '<span class="ready">It’s tonight — see you up there.</span>';
    } else {
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      html =
        `<span class="num">${d}</span><span class="unit">d</span>` +
        `<span class="num">${h}</span><span class="unit">h</span>` +
        `<span class="num">${m}</span><span class="unit">m</span>` +
        `<span class="num">${String(s).padStart(2, '0')}</span><span class="unit">s</span>`;
    }
    els.forEach((el) => { el.innerHTML = html; });
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
})();
