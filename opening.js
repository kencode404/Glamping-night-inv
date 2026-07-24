/* ================================================================
   Rooftop Party 2026 — Opening Ceremony
   One tap → the night bursts out of the button and swallows the
   screen → stars sprinkle in, drifting slowly west → fireworks.
   Stars, shooting stars, rockets, bursts and embers all live on a
   single canvas; sounds are synthesized with WebAudio (no assets).
   ================================================================ */

(() => {
  'use strict';

  const body       = document.body;
  const canvas     = document.getElementById('sky');
  const ctx        = canvas.getContext('2d');
  const igniteBtn  = document.getElementById('igniteBtn');
  const stageArmed = document.getElementById('stageArmed');
  const stageBegun = document.getElementById('stageBegun');
  const skyNight   = document.querySelector('.sky-night');

  const TAU = Math.PI * 2;
  // Deliberately NOT gated on prefers-reduced-motion: this page is a
  // single-purpose cinematic for the party, and machines with OS
  // animation effects turned off were collapsing the whole ceremony
  // (instant night, no fireworks) through that media query.
  const IRIS_CLIP = typeof CSS !== 'undefined' && CSS.supports &&
    CSS.supports('clip-path', 'circle(10px at 10px 10px)');

  /* ---------- 1) Canvas + starfield ---------- */

  let W = 0, H = 0;
  let stars = [];

  function seedStars() {
    // Density scales with viewport; stars live in the upper ~3/4 so the
    // blurred camp scene owns the horizon.
    const count = Math.round((W * H) / 3800);
    stars = [];
    for (let i = 0; i < count; i++) {
      const r = 0.4 + Math.random() * 1.1;
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.75,
        r,
        // Per-frame draw alpha. The trail-fade below repaints stars every
        // frame, so steady-state brightness ≈ base / FADE (~3.8×).
        base: 0.03 + Math.random() * 0.1,
        phase: Math.random() * TAU,
        speed: 0.4 + Math.random() * 1.2,
        // The whole sky drifts gently west (~1.5–6 px/s); bigger
        // (nearer) stars a touch faster for a hint of parallax.
        drift: 0.02 + r * 0.05,
        glint: 0,
      });
    }
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
  }
  window.addEventListener('resize', resize);

  /* ---------- 2) Fireworks engine ---------- */

  const rockets = [];
  const sparks  = [];
  const embers  = [];

  const MAX_SPARKS = 1200;

  // Warm palette only — golds, ambers, champagne — to match the invite.
  function pickHue() {
    const roll = Math.random();
    if (roll < 0.60) return 42 + Math.random() * 10;  // gold
    if (roll < 0.85) return 28 + Math.random() * 8;   // amber
    return 48 + Math.random() * 8;                    // champagne
  }

  function launchRocket(tx, ty) {
    if (sparks.length > MAX_SPARKS) return;
    const sx = tx + (Math.random() * 140 - 70);
    const frames = 52 + Math.random() * 22;           // time to apex
    rockets.push({
      x: sx,
      y: H + 8,
      tx, ty,
      vx: (tx - sx) / frames,
      vy: -(H + 8 - ty) / frames,
      hue: pickHue(),
    });
    sound.launch();
  }

  function explode(x, y, hue, scale) {
    scale = scale || 1;
    const roll = Math.random();
    const ring   = roll < 0.15;                       // clean circle
    const willow = roll > 0.72;                       // long drooping trails
    // Clamp to the particle budget rather than skipping entirely — a
    // rocket must never reach its apex and vanish without a burst.
    const count = Math.min(
      Math.round((ring ? 54 : 70 + Math.random() * 50) * scale),
      Math.max(12, MAX_SPARKS - sparks.length)
    );

    for (let i = 0; i < count; i++) {
      const ang = (TAU * i) / count + Math.random() * 0.12;
      const speed = ring
        ? (4.2 + Math.random() * 0.4) * scale
        : Math.pow(Math.random(), 0.6) * (willow ? 3.4 : 5.6) * scale;
      sparks.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        gravity: willow ? 0.05 : 0.032,
        drag: willow ? 0.988 : 0.975,
        life: willow ? 120 + Math.random() * 50 : 65 + Math.random() * 40,
        age: 0,
        hue: hue + (Math.random() * 12 - 6),
        r: 0.9 + Math.random() * 1.4,
        crackle: !willow && Math.random() < 0.22,
        flash: false,
      });
    }
    // One fat, fast-fading particle = the initial flash of the burst.
    sparks.push({
      x, y, vx: 0, vy: 0, gravity: 0, drag: 1,
      life: 9, age: 0, hue, r: 30 * scale, crackle: false, flash: true,
    });
    sound.boom(scale);
  }

  function randTarget() {
    return {
      x: W * (0.15 + Math.random() * 0.7),
      y: H * (0.16 + Math.random() * 0.34),
    };
  }

  /* ---------- 3) Frame loop ---------- */

  const FADE = 0.26;   // how fast trails dissolve (destination-out alpha, per 60fps tick)

  let last = performance.now();
  let shoot = null;
  let shootAt = 0;
  let emberOn = false;
  let emberTimer = 0;
  let nightOn = false; // the button has been pressed, night is spreading
  let nightStart = 0;  // when stars start fading in (mid-iris)
  let irisActive = false;
  let irisStart = 0, irisFX = 0.5, irisFY = 0.68;
  let skyward = false;   // final act: gazing up into the stars
  let panning = false, panStart = 0, panPrev = 0;
  let comet = null, cometAt = Infinity;

  function frame(now) {
    // Normalize to 60fps ticks; clamp so a background tab doesn't
    // fast-forward physics on return.
    const dt = Math.min(3, (now - last) / 16.667) || 1;
    last = now;

    // The night iris — driven here, frame by frame, so no OS motion
    // setting or CSS transition quirk can shorten the spread. Linear
    // edge speed: full cover in exactly IRIS_MS. Centre and radius are
    // recomputed from viewport fractions every frame, so the resize
    // when the page goes fullscreen can't mis-aim or under-cover it.
    if (irisActive) {
      const t = Math.min(1, (now - irisStart) / IRIS_MS);
      const ix = irisFX * W, iy = irisFY * H;
      const ir = Math.hypot(Math.max(ix, W - ix), Math.max(iy, H - iy)) * 1.05;
      skyNight.style.clipPath =
        'circle(' + (ir * t) + 'px at ' + ix + 'px ' + iy + 'px)';
      if (t >= 1) {
        skyNight.style.clipPath = 'none';   // resize-proof full reveal
        irisActive = false;
      }
    }

    // Skyward pan — the whole luminous world slides down (camera up).
    if (panning) {
      const t = Math.min(1, (now - panStart) / 1900);
      const ease = t * t * (3 - 2 * t);            // smoothstep
      const dy = (ease - panPrev) * H * 0.65;
      panPrev = ease;
      for (const s of stars) {
        s.y += dy;
        if (s.y > H + 3) { s.y -= H + 6; s.x = Math.random() * W; }
      }
      for (const p of sparks)  p.y += dy;
      for (const e of embers)  e.y += dy;
      for (const rk of rockets) { rk.y += dy; rk.ty += dy; }
      if (shoot) shoot.y += dy;
      if (comet) comet.y += dy;
      if (t >= 1) panning = false;
    }

    // Fade the previous frame toward *transparency* (not black) so the
    // CSS backdrop stays visible underneath — this is what draws trails.
    // The erase amount must scale with dt or trails come out half as
    // long on 90/120Hz screens (erase runs per frame, motion per second).
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, ' + (1 - Math.pow(1 - FADE, dt)) + ')';
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';

    // Stars — sprinkling in as the night spreads, then drifting
    // slowly westward forever (wrap at the edge).
    const starRamp = nightOn ? Math.min(1, Math.max(0, (now - nightStart) / 3500)) : 0;
    if (starRamp > 0) {
      for (const s of stars) {
        s.x -= s.drift * dt;
        if (s.x < -3) s.x = W + 3;
        // Once we're gazing up, stars occasionally glint sharply.
        if (skyward && Math.random() < 0.0012 * dt) s.glint = 1;
        if (s.glint > 0.01) s.glint *= Math.pow(0.92, dt);
        const born = s.born ? Math.min(1, (now - s.born) / 1500) : 1;
        const tw = 0.55 + 0.45 * Math.sin(s.phase + now * 0.001 * s.speed);
        const a = Math.min(0.95, (s.base * tw * starRamp + s.glint * 0.55) * born);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + s.glint * 0.9, 0, TAU);
        ctx.fillStyle = 'rgba(243, 230, 207, ' + a + ')';
        ctx.fill();
      }
    }

    // A lone shooting star now and then (night only)
    if (nightOn && !shoot && now > shootAt) {
      shoot = {
        x: W * (0.15 + Math.random() * 0.7),
        y: H * (0.04 + Math.random() * 0.15),
        vx: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2.2),
        vy: 1.1 + Math.random() * 0.9,
        life: 55,
      };
    }
    if (shoot) {
      shoot.x += shoot.vx * dt;
      shoot.y += shoot.vy * dt;
      shoot.life -= dt;
      ctx.beginPath();
      ctx.arc(shoot.x, shoot.y, 1.3, 0, TAU);
      ctx.fillStyle = 'rgba(243, 230, 207, 0.9)';
      ctx.fill();
      if (shoot.life <= 0 || shoot.x < -20 || shoot.x > W + 20 || shoot.y > H * 0.7) {
        shoot = null;
        shootAt = now + 6000 + Math.random() * 9000;
      }
    }

    // The big comet — top right to bottom left across the finale sky:
    // bright core, long gradient tail, sparkles shed along the way.
    if (skyward && !comet && now > cometAt) {
      const sx = W * (0.88 + Math.random() * 0.17);
      const sy = -40;
      const tx = -W * 0.12;
      const ty = H * (0.55 + Math.random() * 0.3);
      const frames = 200 + Math.random() * 50;      // ~3.5–4s crossing
      comet = { x: sx, y: sy, vx: (tx - sx) / frames, vy: (ty - sy) / frames };
    }
    if (comet) {
      comet.x += comet.vx * dt;
      comet.y += comet.vy * dt;
      const mag = Math.hypot(comet.vx, comet.vy) || 1;
      const ux = comet.vx / mag, uy = comet.vy / mag;
      const tailLen = Math.min(220, W * 0.25);
      const tail = ctx.createLinearGradient(
        comet.x, comet.y,
        comet.x - ux * tailLen, comet.y - uy * tailLen
      );
      tail.addColorStop(0, 'rgba(255, 246, 222, 0.85)');
      tail.addColorStop(0.25, 'rgba(232, 205, 160, 0.4)');
      tail.addColorStop(1, 'rgba(232, 205, 160, 0)');
      ctx.strokeStyle = tail;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(comet.x, comet.y);
      ctx.lineTo(comet.x - ux * tailLen, comet.y - uy * tailLen);
      ctx.stroke();
      // halo + white-hot core
      ctx.beginPath();
      ctx.arc(comet.x, comet.y, 9, 0, TAU);
      ctx.fillStyle = 'rgba(255, 240, 205, 0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(comet.x, comet.y, 3.2, 0, TAU);
      ctx.fillStyle = 'rgba(255, 250, 235, 0.95)';
      ctx.fill();
      // sparkling dust falling off the tail
      if (Math.random() < 0.5 * dt && sparks.length < MAX_SPARKS) {
        const back = 10 + Math.random() * 70;
        sparks.push({
          x: comet.x - ux * back + (Math.random() * 8 - 4),
          y: comet.y - uy * back + (Math.random() * 8 - 4),
          vx: Math.random() * 0.6 - 0.3,
          vy: Math.random() * 0.6 - 0.3,
          gravity: 0.002, drag: 0.99,
          life: 40 + Math.random() * 30, age: 0,
          hue: 45, r: 0.7 + Math.random() * 0.8,
          crackle: false, flash: false,
        });
      }
      if (comet.x < -tailLen - 60 || comet.y > H + 60) {
        comet = null;
        cometAt = now + 25000 + Math.random() * 20000;   // rare encore
      }
    }

    // Rockets — bright heads rising; the frame-fade paints their tails
    for (let i = rockets.length - 1; i >= 0; i--) {
      const rk = rockets[i];
      rk.x += rk.vx * dt;
      rk.y += rk.vy * dt;
      ctx.beginPath();
      ctx.arc(rk.x, rk.y, 1.7, 0, TAU);
      ctx.fillStyle = 'hsla(' + rk.hue + ', 65%, 82%, 0.95)';
      ctx.fill();
      if (rk.y <= rk.ty) {
        rockets.splice(i, 1);
        explode(rk.x, rk.y, rk.hue, 0.9 + Math.random() * 0.5);
      }
    }

    // Burst sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) { sparks.splice(i, 1); continue; }

      const k = Math.pow(p.drag, dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const t = p.age / p.life;
      let alpha = (1 - t) * (p.flash ? 0.35 : 1);
      if (p.crackle && t > 0.55) alpha *= (Math.random() < 0.5 ? 0.15 : 1);
      const light = p.flash ? 85 : 80 - t * 30;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fillStyle = 'hsla(' + p.hue + ', 70%, ' + light + '%, ' + Math.min(1, alpha) + ')';
      ctx.fill();
    }

    // Embers drifting up from the camp once the night is open
    if (emberOn) {
      emberTimer -= dt;
      if (emberTimer <= 0 && embers.length < 60) {
        embers.push({
          x: Math.random() * W,
          y: H + 4,
          vy: 0.25 + Math.random() * 0.4,
          amp: 0.3 + Math.random() * 0.5,
          phase: Math.random() * TAU,
          r: 0.8 + Math.random() * 1.2,
          age: 0,
          life: 420 + Math.random() * 240,
        });
        emberTimer = 14 + Math.random() * 12;
      }
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.age += dt;
      if (e.age >= e.life || e.y < -8) { embers.splice(i, 1); continue; }
      e.y -= e.vy * dt;
      e.x += Math.sin(e.phase + e.age * 0.03) * e.amp * dt;
      const a = 0.28 * Math.min(1, e.age / 40) * (1 - e.age / e.life);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fillStyle = 'hsla(40, 75%, 68%, ' + a + ')';
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  /* ---------- 4) Synthesized sound (WebAudio, no assets) ---------- */

  const sound = (() => {
    let ac = null, master = null, noiseBuf = null;

    function ensure() {
      if (ac) return true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        // Route as 'playback' so the iPhone ring/silent switch doesn't
        // mute the show — WebAudio is 'ambient' by default on iOS and
        // would otherwise play a completely silent ceremony.
        try {
          if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
        } catch (_) {}
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
        // 1s of white noise, reused by every whoosh and boom.
        const len = Math.floor(ac.sampleRate);
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return true;
      } catch (_) { ac = null; return false; }
    }

    // Must be called inside a user gesture so iOS unlocks the context.
    // Checks !== 'running' (not === 'suspended') to also catch WebKit's
    // non-standard 'interrupted' state after calls / app switches.
    function resume() {
      if (!ensure()) return;
      try { if (ac.state !== 'running') ac.resume().catch(() => {}); } catch (_) {}
    }

    // Quiet rising whoosh as a rocket climbs.
    function launch() {
      if (!ensure()) return;
      try {
        const t = ac.currentTime;
        const n = ac.createBufferSource();
        n.buffer = noiseBuf;
        n.loop = true;
        const f = ac.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 9;
        f.frequency.setValueAtTime(260, t);
        f.frequency.exponentialRampToValueAtTime(1300, t + 0.8);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.045, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
        n.connect(f);
        f.connect(g);
        g.connect(master);
        n.start(t);
        n.stop(t + 0.9);
      } catch (_) {}
    }

    // Deep thump + filtered noise tail. Slight delay ≈ light-before-sound.
    function boom(size) {
      if (!ensure()) return;
      try {
        const t = ac.currentTime + 0.06;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.min(0.5, 0.3 * size + 0.1), t + 0.025);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        g.connect(master);

        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(110 + Math.random() * 40, t);
        o.frequency.exponentialRampToValueAtTime(34, t + 1.0);
        o.connect(g);
        o.start(t);
        o.stop(t + 1.2);

        const n = ac.createBufferSource();
        n.buffer = noiseBuf;
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1000, t);
        f.frequency.exponentialRampToValueAtTime(140, t + 0.8);
        const ng = ac.createGain();
        ng.gain.setValueAtTime(0.5, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        n.connect(f);
        f.connect(ng);
        ng.connect(g);
        n.start(t);
        n.stop(t + 1);
      } catch (_) {}
    }

    return { resume, launch, boom };
  })();

  /* ---------- 5) The ceremony sequence ---------- */

  const IRIS_MS = 4500;   // must match the .sky-night clip-path transition

  let counting = false;
  let begun    = false;

  function startCeremony() {
    if (counting || begun) return;
    counting = true;

    // The audio engine must be created inside this tap (autoplay policy)
    // so the firework booms are allowed to play.
    sound.resume();
    igniteBtn.blur();   // don't leave focus stranded on the dissolving button

    // Take the whole screen for the show — allowed only inside this
    // tap. iPhones don't support page fullscreen; they simply skip it.
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (_) {}

    // Aim the night at the button's centre — stored as viewport
    // fractions (see the frame loop) so it expands out of the tap
    // until it has swallowed the whole screen.
    const rect = igniteBtn.getBoundingClientRect();
    irisFX = (rect.left + rect.width / 2) / W;
    irisFY = (rect.top + rect.height / 2) / H;
    if (IRIS_CLIP) {
      skyNight.style.clipPath =
        'circle(0px at ' + (irisFX * 100) + '% ' + (irisFY * 100) + '%)';
      irisStart = performance.now();
      irisActive = true;
    }
    body.classList.add('is-night');   // non-clip browsers get the CSS crossfade
    stageArmed.classList.remove('is-active');

    nightOn = true;
    nightStart = performance.now() + IRIS_MS * 0.55;   // stars sprinkle in mid-spread
    shootAt = performance.now() + IRIS_MS + 5000 + Math.random() * 5000;

    // Once the night has the screen, the celebration begins.
    setTimeout(openTheNight, IRIS_MS + 250);
  }

  function openTheNight() {
    begun = true;
    body.classList.add('is-begun');
    setTimeout(() => {
      stageBegun.classList.add('is-active');
      // Move focus to the declaration (tabindex="-1" + aria-label in the
      // HTML) so screen readers announce the end state and keyboard
      // focus isn't stranded on the dissolved button.
      try { stageBegun.focus({ preventScroll: true }); } catch (_) {}
    }, 250);

    // Three instant bursts right on the beat of "zero" …
    explode(W * 0.50, H * 0.28, 44, 1.5);
    setTimeout(() => explode(W * 0.27, H * 0.24, 32, 1.1), 280);
    setTimeout(() => explode(W * 0.74, H * 0.33, 50, 1.2), 540);
    // … then a volley of real rockets while the title reveals.
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const tgt = randTarget();
        launchRocket(tgt.x, tgt.y);
      }, 750 + i * 430);
    }

    emberOn = true;
    scheduleAutoShow();

    // The finale: once the words have landed and a few bursts have
    // bloomed, tilt the camera up into the stars.
    setTimeout(goSkyward, 6500);
  }

  // Looking up: everything terrestrial sinks below the frame (CSS),
  // the star field streams downward and doubles in density.
  function goSkyward() {
    if (skyward) return;
    skyward = true;
    body.classList.add('is-skyward');
    emberOn = false;             // the camp has left the frame
    panning = true;
    panStart = performance.now();
    panPrev = 0;
    cometAt = performance.now() + 4200;   // the comet, once the camera settles
    // Thicken the heavens — extra stars across the full height,
    // fading in as the camera settles.
    const extra = Math.round((W * H) / 2400);
    for (let i = 0; i < extra; i++) {
      const r = 0.4 + Math.random() * 1.3;
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r,
        base: 0.05 + Math.random() * 0.12,
        phase: Math.random() * TAU,
        speed: 0.5 + Math.random() * 1.6,
        drift: 0.02 + r * 0.05,
        glint: 0,
        born: performance.now(),
      });
    }
  }

  // The sky keeps celebrating on its own until we look up — then the
  // fireworks bow out and the stars take the stage.
  function scheduleAutoShow() {
    setTimeout(() => {
      if (skyward) return;
      if (!document.hidden && sparks.length < 700) {
        const tgt = randTarget();
        launchRocket(tgt.x, tgt.y);
        if (Math.random() < 0.35) {
          setTimeout(() => {
            const t2 = randTarget();
            launchRocket(t2.x, t2.y);
          }, 300 + Math.random() * 400);
        }
      }
      scheduleAutoShow();
    }, 2600 + Math.random() * 2800);
  }

  igniteBtn.addEventListener('click', startCeremony);

  // After the opening: tap (or press Enter/Space) anywhere for more.
  // Each gesture also revives the AudioContext in case iOS suspended it
  // while the guest was in another app (call, camera, …).
  window.addEventListener('pointerdown', (e) => {
    if (!begun) return;
    if (e.target.closest('a, button')) return;
    sound.resume();
    const x = Math.min(Math.max(e.clientX, 30), W - 30);
    const y = Math.min(Math.max(e.clientY, H * 0.10), H * 0.72);
    launchRocket(x, y);
  });
  window.addEventListener('keydown', (e) => {
    if (!begun) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sound.resume();
      const tgt = randTarget();
      launchRocket(tgt.x, tgt.y);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && begun) sound.resume();
  });

  /* ---------- 6) Go ---------- */

  resize();
  requestAnimationFrame(frame);
})();
