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
  const smokes  = [];   // the falling moon's smoke tail + crash dust

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
  // The moon falls ONCE, top-right to bottom-left — it "lands" on
  // stage, where the physical artificial moon lights up on cue.
  let moon = null, moonAt = Infinity;
  const MOON_CRATERS = [
    { ox: -0.32, oy: -0.18, r: 0.16 },
    { ox:  0.18, oy:  0.05, r: 0.11 },
    { ox: -0.05, oy:  0.30, r: 0.13 },
    { ox:  0.30, oy: -0.32, r: 0.08 },
    { ox:  0.05, oy: -0.12, r: 0.06 },
    { ox: -0.28, oy:  0.14, r: 0.07 },
  ];

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
      if (moon) moon.y += dy;
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

    // The moon fall — enters top right, gravity carries it down and
    // left until it drops off the bottom edge, where the physical
    // stage moon "catches" it. One pass only.
    if (skyward && !moon && now > moonAt) {
      const R = Math.min(85, Math.max(38, W * 0.06));
      const sx = W + R;
      const sy = -R * 1.5;
      const T = 400;                        // ~6.5s of fall at 60fps
      const ex = -W * 0.05;                 // exit: off the bottom-left corner
      const ey = H + R * 2;
      const vy0 = ((ey - sy) / T) * 0.45;   // slow start…
      moon = {
        x: sx, y: sy, R,
        vx: (ex - sx) / T,
        vy: vy0,
        g: (2 * ((ey - sy) - vy0 * T)) / (T * T),   // …gravity does the rest
      };
    }
    if (moon) {
      // Fully erase last frame's moon + halo first — the global trail
      // fade only partially clears, which smeared the opaque disc into
      // an ugly growing blob and let the halo accumulate.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 1)';
      ctx.beginPath();
      ctx.arc(moon.x, moon.y, moon.R * 1.9, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';

      moon.vy += moon.g * dt;
      moon.x += moon.vx * dt;
      moon.y += moon.vy * dt;
      const R = moon.R;
      const vmag = Math.hypot(moon.vx, moon.vy) || 1;
      const mux = moon.vx / vmag, muy = moon.vy / vmag;   // unit forward

      // Warm re-entry glow wrapping the whole body
      const halo = ctx.createRadialGradient(moon.x, moon.y, R * 0.6, moon.x, moon.y, R * 1.8);
      halo.addColorStop(0, 'rgba(255, 220, 170, 0.3)');
      halo.addColorStop(1, 'rgba(255, 200, 140, 0)');
      ctx.beginPath();
      ctx.arc(moon.x, moon.y, R * 1.8, 0, TAU);
      ctx.fillStyle = halo;
      ctx.fill();

      // The moon is a solid body — stop additive blending while we
      // paint it (it must occlude the stars behind it).
      ctx.globalCompositeOperation = 'source-over';

      // Silvery disc lit from the upper right, cartoon-style
      const disc = ctx.createRadialGradient(
        moon.x + R * 0.25, moon.y - R * 0.3, R * 0.15,
        moon.x, moon.y, R
      );
      disc.addColorStop(0, '#f4f6f8');
      disc.addColorStop(0.7, '#e2e5ea');
      disc.addColorStop(1, '#c6cbd3');
      ctx.beginPath();
      ctx.arc(moon.x, moon.y, R, 0, TAU);
      ctx.fillStyle = disc;
      ctx.fill();
      // bold outline, like the reference illustration
      ctx.lineWidth = Math.max(2, R * 0.045);
      ctx.strokeStyle = 'rgba(126, 135, 146, 0.85)';
      ctx.stroke();

      // Rimmed craters: raised light rim, darker offset floor
      for (const c of MOON_CRATERS) {
        const cx = moon.x + c.ox * R;
        const cy = moon.y + c.oy * R;
        const cr = c.r * R;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, TAU);
        ctx.fillStyle = '#eff1f4';
        ctx.fill();
        ctx.lineWidth = Math.max(1, cr * 0.12);
        ctx.strokeStyle = 'rgba(126, 135, 146, 0.5)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + cr * 0.08, cy + cr * 0.12, cr * 0.72, 0, TAU);
        ctx.fillStyle = '#c2c8d1';
        ctx.fill();
      }

      // Soft limb shading away from the light for roundness
      const shade = ctx.createRadialGradient(
        moon.x + R * 0.35, moon.y - R * 0.35, R * 0.2,
        moon.x, moon.y, R * 1.05
      );
      shade.addColorStop(0, 'rgba(90, 100, 115, 0)');
      shade.addColorStop(0.75, 'rgba(90, 100, 115, 0)');
      shade.addColorStop(1, 'rgba(90, 100, 115, 0.3)');
      ctx.beginPath();
      ctx.arc(moon.x, moon.y, R, 0, TAU);
      ctx.fillStyle = shade;
      ctx.fill();

      ctx.globalCompositeOperation = 'lighter';

      // White-hot friction glow on the leading edge
      const lx = moon.x + mux * R * 0.6;
      const ly = moon.y + muy * R * 0.6;
      const heat = ctx.createRadialGradient(lx, ly, R * 0.1, lx, ly, R * 1.15);
      heat.addColorStop(0, 'rgba(255, 195, 125, 0.4)');
      heat.addColorStop(0.5, 'rgba(255, 150, 80, 0.18)');
      heat.addColorStop(1, 'rgba(255, 150, 80, 0)');
      ctx.beginPath();
      ctx.arc(lx, ly, R * 1.15, 0, TAU);
      ctx.fillStyle = heat;
      ctx.fill();

      // Fire streaming off into the wake (the global trail-fade
      // stretches each fleck into a streak)
      for (let i = 0; i < 3; i++) {
        if (Math.random() < 0.7 * dt && sparks.length < MAX_SPARKS) {
          const back = R * (0.55 + Math.random() * 0.8);
          const side = (Math.random() - 0.5) * R * 1.5;
          sparks.push({
            x: moon.x - mux * back - muy * side,
            y: moon.y - muy * back + mux * side,
            vx: moon.vx * 0.3 + (Math.random() * 0.6 - 0.3),
            vy: moon.vy * 0.3 - (0.2 + Math.random() * 0.4),
            gravity: -0.008, drag: 0.96,
            life: 25 + Math.random() * 30, age: 0,
            hue: 25 + Math.random() * 20, r: 1.1 + Math.random() * 1.4,
            crackle: false, flash: false,
          });
        }
      }

      // Smoke billowing out behind, past the fire
      if (Math.random() < 0.9 * dt && smokes.length < 80) {
        const back = R * (1.7 + Math.random() * 0.9);
        const side = (Math.random() - 0.5) * R * 1.2;
        smokes.push({
          x: moon.x - mux * back - muy * side,
          y: moon.y - muy * back + mux * side,
          vx: -mux * 0.4 + (Math.random() - 0.5) * 0.3,
          vy: -muy * 0.4 - 0.15,
          r: R * (0.22 + Math.random() * 0.16),
          grow: 0.35 + Math.random() * 0.3,
          age: 0, life: 90 + Math.random() * 60,
        });
      }

      // Gone below the stage — impact! The physical moon takes over.
      if (moon.y - R > H || moon.x < -R * 2) {
        moon = null;
        moonAt = Infinity;
        moonImpact();
      }
    }

    // Smoke puffs: translucent grey, expanding and thinning as they
    // drift — they outlive the moon, hanging in the air after the crash.
    if (smokes.length) {
      ctx.globalCompositeOperation = 'source-over';
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        s.age += dt;
        if (s.age >= s.life) { smokes.splice(i, 1); continue; }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.r += s.grow * dt;
        const t = s.age / s.life;
        const a = 0.16 * Math.min(1, s.age / 14) * (1 - t);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fillStyle = 'rgba(148, 145, 155, ' + a + ')';
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
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

    // Deep decaying rumble for the moon's landing — sub sine drop
    // plus low-passed noise, like thunder through the floor.
    function rumble() {
      if (!ensure()) return;
      try {
        const t = ac.currentTime;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.55, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        g.connect(master);

        const n = ac.createBufferSource();
        n.buffer = noiseBuf;
        n.loop = true;
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(140, t);
        f.frequency.exponentialRampToValueAtTime(45, t + 1.2);
        n.connect(f);
        f.connect(g);
        n.start(t);
        n.stop(t + 1.4);

        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(60, t);
        o.frequency.exponentialRampToValueAtTime(24, t + 1.1);
        const og = ac.createGain();
        og.gain.setValueAtTime(0.5, t);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        o.connect(og);
        og.connect(g);
        o.start(t);
        o.stop(t + 1.3);
      } catch (_) {}
    }

    return { resume, launch, boom, rumble };
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
    goFullscreen();     // in case this press is the first touch of the page

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
    moonAt = performance.now() + 4200;    // the moon falls once the camera settles
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

  // The moon hits the ground below the frame: the whole view shudders,
  // a deep rumble rolls through, and debris kicks up from the corner —
  // the cue for the physical stage moon to light.
  function moonImpact() {
    body.classList.add('is-quake');
    setTimeout(() => body.classList.remove('is-quake'), 1000);
    sound.rumble();
    const ix = Math.max(30, W * 0.04);
    for (let i = 0; i < 26; i++) {
      if (sparks.length > MAX_SPARKS) break;
      sparks.push({
        x: ix + Math.random() * 60 - 20,
        y: H + 6,
        vx: Math.random() * 3 - 0.8,
        vy: -(2 + Math.random() * 4),
        gravity: 0.09, drag: 0.985,
        life: 45 + Math.random() * 30, age: 0,
        hue: 40 + Math.random() * 10, r: 1 + Math.random() * 1.6,
        crackle: false, flash: false,
      });
    }
    // …and a cloud of dust rising from the crash site
    for (let i = 0; i < 12; i++) {
      if (smokes.length > 90) break;
      smokes.push({
        x: ix + Math.random() * 120 - 30,
        y: H + 10,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -(0.4 + Math.random() * 0.7),
        r: 14 + Math.random() * 18,
        grow: 0.5 + Math.random() * 0.4,
        age: 0, life: 110 + Math.random() * 70,
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

  /* ---------- Fullscreen: first tap enters, double-click exits ----------
     Browsers only allow fullscreen inside a user gesture, so "from the
     beginning" means the first touch anywhere on the page. iPhones
     don't support page fullscreen and simply skip it. */

  function goFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const el = document.documentElement;
      if (el.requestFullscreen) {
        const p = el.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (_) {}
  }
  window.addEventListener('pointerdown', goFullscreen);
  window.addEventListener('dblclick', () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        const p = exit.call(document);
        if (p && p.catch) p.catch(() => {});
      }
    } catch (_) {}
  });

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
