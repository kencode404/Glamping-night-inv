/* ================================================================
   Under The Stars — cinematic intro + RSVP flow
   ================================================================ */

(() => {
  const intro      = document.getElementById('intro');
  const rsvp       = document.getElementById('rsvp');
  const confirm    = document.getElementById('confirm');
  const skipBtn    = document.getElementById('skipBtn');
  const form       = document.getElementById('rsvpForm');
  const chairsVid  = document.querySelector('.hero-video.chairs');
  const sofaVid    = document.querySelector('.hero-video.sofa');
  const chairsBg   = document.querySelector('.hero-video.chairs-bg');
  const sofaBg     = document.querySelector('.hero-video.sofa-bg');

  // Sharp + blurred-backdrop pair, kept in lockstep
  const chairsPair = [chairsVid, chairsBg].filter(Boolean);
  const sofaPair   = [sofaVid, sofaBg].filter(Boolean);

  /* ---------- 1) Cinematic intro sequencing ----------
     Chairs assemble plays first (starting from its 2s mark via
     the #t=2 URL fragment); when it nears the end, sofa toss
     crossfades in.                                              */

  const safePlay = (v) => v && v.play().catch(() => { /* swallow */ });

  const CROSSFADE_SEC   = 0.9;  // seconds before chairs ends → start sofa
  const HOLD_AFTER_SOFA = 900;  // ms to linger on the title after sofa ends
  const SAFETY_MS       = 14000;// hard fallback if video events never fire

  // Kick off chairs once title eyebrow has appeared
  setTimeout(() => {
    chairsPair.forEach((v) => { v.classList.add('is-playing'); safePlay(v); });
  }, 900);

  // Crossfade chairs → sofa when chairs nears the end
  let sofaStarted = false;
  const startSofa = () => {
    if (sofaStarted) return;
    sofaStarted = true;
    sofaPair.forEach((v)   => { v.classList.add('is-playing'); safePlay(v); });
    chairsPair.forEach((v) => { v.classList.remove('is-playing'); v.classList.add('is-fading'); });
  };

  chairsVid.addEventListener('timeupdate', () => {
    const d = chairsVid.duration;
    if (!isFinite(d) || d <= 0) return;
    if (chairsVid.currentTime >= d - CROSSFADE_SEC) startSofa();
  });
  chairsVid.addEventListener('ended', startSofa); // belt-and-braces

  // End the intro after sofa finishes, with a safety fallback
  const introTimer = setTimeout(endIntro, SAFETY_MS);
  sofaVid.addEventListener('ended', () => {
    setTimeout(endIntro, HOLD_AFTER_SOFA);
  });

  function endIntro() {
    if (intro.classList.contains('is-leaving')) return;
    intro.classList.add('is-leaving');
    rsvp.classList.add('is-active');
    rsvp.setAttribute('aria-hidden', 'false');

    // After fade, remove from layout
    setTimeout(() => intro.classList.add('is-done'), 1300);

    // Pause videos to save battery
    setTimeout(() => {
      [...chairsPair, ...sofaPair].forEach((v) => { try { v.pause(); } catch (_) {} });
    }, 1400);
  }

  skipBtn.addEventListener('click', () => {
    clearTimeout(introTimer);
    endIntro();
  });

  // Allow Enter / Space / click anywhere on the intro to skip after first second
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
