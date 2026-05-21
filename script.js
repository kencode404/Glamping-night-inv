/* ================================================================
   Under The Stars — cinematic intro + RSVP flow
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

    // Skip-anywhere handlers (click on intro or Enter/Space/Escape)
    setTimeout(() => {
      intro.addEventListener('click', (e) => {
        if (e.target === skipBtn) return;
        clearTimeout(introTimer);
        endIntro();
      });
      window.addEventListener('keydown', (e) => {
        if (intro.classList.contains('is-done')) return;
        if (['Enter', ' ', 'Escape'].includes(e.key)) {
          clearTimeout(introTimer);
          endIntro();
        }
      });
    }, 800);
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

  /* ---------- 2) RSVP form ---------- */

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^[+\d][\d\s\-()]{6,}$/;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const fields = {
      name:  form.elements.name,
      email: form.elements.email,
      phone: form.elements.phone,
    };

    let firstInvalid = null;
    Object.entries(fields).forEach(([key, input]) => {
      const wrap = input.closest('.field');
      const val  = input.value.trim();
      let ok = val.length > 0;
      if (key === 'email') ok = emailRe.test(val);
      if (key === 'phone') ok = phoneRe.test(val);

      wrap.classList.toggle('has-error', !ok);
      if (!ok && !firstInvalid) firstInvalid = input;
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const data = {
      name:  fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      at:    new Date().toISOString(),
    };

    // Local demo persistence — view via console: JSON.parse(localStorage.glampingRsvps)
    try {
      const list = JSON.parse(localStorage.getItem('glampingRsvps') || '[]');
      list.push(data);
      localStorage.setItem('glampingRsvps', JSON.stringify(list));
    } catch (_) { /* ignore */ }

    // Personalize confirmation
    const firstName = data.name.split(/\s+/)[0];
    document.getElementById('confirmName').textContent =
      `Your seat is saved, ${firstName}.`;

    // Cross-fade RSVP → Confirmation
    rsvp.classList.remove('is-active');
    rsvp.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      confirm.classList.add('is-active');
      confirm.setAttribute('aria-hidden', 'false');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 250);
  });

  // Clear error state as user types
  form.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      input.closest('.field').classList.remove('has-error');
    });
  });
})();
