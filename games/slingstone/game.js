/* Slingstone — an original physics slingshot game.
 * Controls: drag (mouse / touch / trackpad click-drag), two-finger trackpad
 * scroll to pan, pinch to zoom, keyboard, or a gamepad. Physics by matter.js. */
(function () {
  'use strict';
  var M = Matter, Engine = M.Engine, Bodies = M.Bodies, Body = M.Body, Composite = M.Composite, Events = M.Events;

  var GROUND = 600, WORLD_W = 1800, VIEW_H = 720;
  var SLING = { x: 230, y: GROUND - 130 }, MAX_PULL = 120, POWER = 0.17;

  var MATS = {
    wood:  { hp: 60,  density: 0.001,  fill: '#b9834f', edge: '#7a5230' },
    stone: { hp: 170, density: 0.0022, fill: '#8d95a6', edge: '#596070' },
    glass: { hp: 18,  density: 0.0008, fill: 'rgba(160,225,240,.55)', edge: '#d6f6ff' }
  };
  var AMMO = {
    stone:   { r: 16, density: 0.004, color: '#d9d2c3', label: 'Stone' },
    boulder: { r: 24, density: 0.005, color: '#8a7f77', label: 'Boulder' },
    split:   { r: 13, density: 0.004, color: '#ffb057', label: 'Splitter' }
  };

  // Level helpers: x is centre, y is height of the piece's base above the ground.
  function B(x, base, w, h, mat) { return { t: 'b', x: x, y: GROUND - base - h / 2, w: w, h: h, mat: mat || 'wood' }; }
  function G(x, base) { return { t: 'g', x: x, y: GROUND - base - 15 }; }
  function tower(x, floors, mat) {
    var out = [], y = 0;
    for (var i = 0; i < floors; i++) {
      out.push(B(x - 45, y, 18, 80, mat), B(x + 45, y, 18, 80, mat), B(x, y + 80, 130, 18, mat));
      y += 98;
    }
    return out;
  }
  var LEVELS = [
    { name: 'First Throw', ammo: ['stone', 'stone', 'stone'],
      parts: [].concat(tower(900, 1), [G(900, 0), G(900, 98)]) },
    { name: 'Two Towers', ammo: ['stone', 'stone', 'stone', 'stone'],
      parts: [].concat(tower(820, 1), tower(1080, 2), [G(820, 98), G(1080, 0), G(1080, 196)]) },
    { name: 'Glasshouse', ammo: ['stone', 'split', 'stone'],
      parts: [].concat(tower(880, 2, 'glass'), [G(880, 0), G(880, 98), B(1100, 0, 40, 120, 'stone'), G(1100, 120),
        B(1220, 0, 18, 70, 'glass'), B(1300, 0, 18, 70, 'glass'), B(1260, 70, 110, 16, 'glass'), G(1260, 0)]) },
    { name: 'Stone Wall', ammo: ['boulder', 'stone', 'boulder', 'stone'],
      parts: [B(780, 0, 40, 200, 'stone'), B(780, 200, 90, 18, 'wood'), G(780, 218)]
        .concat(tower(980, 2), [G(980, 0), G(980, 98), G(980, 196), B(1160, 0, 60, 60, 'stone'), B(1160, 60, 60, 60, 'wood'), G(1160, 120)]) },
    { name: 'Scatter', ammo: ['split', 'split', 'stone', 'split'],
      parts: [B(760, 0, 30, 60), G(760, 60), B(900, 0, 30, 130), G(900, 130), B(1040, 0, 30, 90, 'glass'), G(1040, 90),
        B(1180, 0, 30, 170), G(1180, 170), B(1320, 0, 30, 50, 'stone'), G(1320, 50)] },
    { name: 'The Keep', ammo: ['boulder', 'split', 'stone', 'boulder', 'stone'],
      parts: [].concat(tower(900, 3, 'wood'), tower(1100, 3, 'stone'),
        [B(1000, 294, 330, 18, 'wood'), G(900, 0), G(1100, 0), G(900, 196), G(1100, 196), G(1000, 312),
         B(740, 0, 30, 150, 'stone'), B(1260, 0, 30, 150, 'glass')]) }
  ];

  // ---- state ---------------------------------------------------------------------
  var cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var W = 0, H = 0, dpr = 1, baseScale = 1, zoom = 1;
  var cam = { x: 0, target: 0, manual: 0 };
  var engine, levelIdx = 0, blocks = [], gems = [], shots = [], particles = [], trail = [], lastTrail = [];
  var ammo = [], loaded = null, pull = { x: 0, y: 0 }, aiming = null;      // aiming: 'drag' | 'pad' | 'kb' | null
  var kb = { angle: 38, power: 0.75 }, flying = null, flightTime = 0, restTime = 0;
  var state = 'play', endTimer = 0, score = 0, t = 0;
  var save = {};
  try { save = JSON.parse(localStorage.getItem('slingstone') || '{}'); } catch (e) {}
  save.unlocked = save.unlocked || 0; save.stars = save.stars || {};
  function persist() { try { localStorage.setItem('slingstone', JSON.stringify(save)); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    baseScale = Math.min(H / VIEW_H, W / 900);
  }
  window.addEventListener('resize', resize);
  resize();
  function S() { return baseScale * zoom; }
  function viewW() { return W / S(); }
  function toWorld(sx, sy) { return { x: cam.x + sx / S(), y: VIEW_H - (H - sy) / S() }; }
  function clampCam() { cam.x = Math.max(-80, Math.min(Math.max(-80, WORLD_W - viewW()), cam.x)); }

  // ---- level setup -----------------------------------------------------------------
  function load(i) {
    levelIdx = Math.max(0, Math.min(LEVELS.length - 1, i));
    var L = LEVELS[levelIdx];
    engine = Engine.create();
    engine.gravity.y = 1;
    blocks = []; gems = []; shots = []; particles = []; trail = []; lastTrail = [];
    var ground = Bodies.rectangle(WORLD_W / 2, GROUND + 100, WORLD_W * 3, 200, { isStatic: true, friction: 0.9, label: 'ground' });
    Composite.add(engine.world, ground);
    L.parts.forEach(function (p) {
      var body;
      if (p.t === 'b') {
        var m = MATS[p.mat];
        body = Bodies.rectangle(p.x, p.y, p.w, p.h, { density: m.density, friction: 0.7, restitution: 0.05, label: 'block' });
        body.g = { kind: 'block', mat: p.mat, hp: m.hp, max: m.hp, w: p.w, h: p.h };
        blocks.push(body);
      } else {
        body = Bodies.circle(p.x, p.y, 15, { density: 0.001, friction: 0.6, restitution: 0.1, label: 'gem' });
        body.g = { kind: 'gem', hp: 1, phase: Math.random() * 6 };
        gems.push(body);
      }
      Composite.add(engine.world, body);
    });
    Events.on(engine, 'collisionStart', onCollide);
    // Let the structures settle before play so nothing breaks on spawn.
    settling = 40;
    ammo = L.ammo.slice();
    loaded = null; flying = null; aiming = null; pull = { x: 0, y: 0 };
    state = 'play'; endTimer = 0; score = 0; cam.manual = 0; cam.target = 0; cam.x = 0;
    nextStone();
    $('title').textContent = (levelIdx + 1) + ' · ' + L.name;
    $('prev').disabled = levelIdx === 0;
    $('next').disabled = levelIdx >= save.unlocked || levelIdx >= LEVELS.length - 1;
    $('panel').classList.remove('show');
  }
  var settling = 0;

  function nextStone() {
    loaded = ammo.length ? ammo.shift() : null;
    pull = { x: 0, y: 0 };
  }

  function launch() {
    if (!loaded || state !== 'play') return;
    var mag = Math.hypot(pull.x, pull.y);
    if (mag < 18) { pull = { x: 0, y: 0 }; aiming = null; return; }
    var a = AMMO[loaded];
    var body = Bodies.circle(SLING.x + pull.x, SLING.y + pull.y, a.r, {
      density: a.density, friction: 0.5, restitution: 0.25, frictionAir: 0.002, label: 'shot'
    });
    body.g = { kind: 'shot', type: loaded, used: false, life: 0 };
    Body.setVelocity(body, { x: -pull.x * POWER, y: -pull.y * POWER });
    Composite.add(engine.world, body);
    shots.push(body);
    flying = body; flightTime = 0; restTime = 0;
    lastTrail = trail; trail = [];
    loaded = null; aiming = null; pull = { x: 0, y: 0 };
    cam.manual = 0;
  }

  function ability() {
    if (!flying || flying.g.used || flying.g.type !== 'split') return false;
    flying.g.used = true;
    var v = flying.velocity, p = flying.position;
    [-0.22, 0.22].forEach(function (da) {
      var c = Math.cos(da), s = Math.sin(da);
      var b = Bodies.circle(p.x, p.y, AMMO.split.r, { density: AMMO.split.density, friction: 0.5, restitution: 0.25, frictionAir: 0.002, label: 'shot' });
      b.g = { kind: 'shot', type: 'split', used: true, life: 0 };
      Body.setVelocity(b, { x: v.x * c - v.y * s, y: v.x * s + v.y * c });
      Composite.add(engine.world, b);
      shots.push(b);
    });
    burst(p.x, p.y, '#ffb057', 10);
    return true;
  }

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 1 + Math.random() * 4;
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 30 + Math.random() * 25, color: color, r: 2 + Math.random() * 3 });
    }
  }

  function kill(body) {
    var g = body.g;
    if (g.dead) return;
    g.dead = true;
    Composite.remove(engine.world, body);
    if (g.kind === 'gem') { score += 500; burst(body.position.x, body.position.y, '#7ff0d8', 18); }
    else if (g.kind === 'block') { score += 50; burst(body.position.x, body.position.y, MATS[g.mat].edge, 10); }
  }

  function onCollide(ev) {
    if (settling > 0) return;
    ev.pairs.forEach(function (pair) {
      var a = pair.bodyA, b = pair.bodyB;
      var rel = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (rel < 2.6) return;
      hit(a, b, rel); hit(b, a, rel);
    });
  }
  function hit(self, other, rel) {
    var g = self.g;
    if (!g || g.dead) return;
    if (g.kind === 'gem') { if (rel > 3.2) kill(self); return; }
    if (g.kind !== 'block') return;
    var m = other.isStatic ? self.mass : Math.min(other.mass, 12);
    g.hp -= rel * m * (other.label === 'shot' ? 1.15 : 0.5);
    if (g.hp <= 0) kill(self);
  }

  // ---- update -------------------------------------------------------------------
  function step() {
    t++;
    if (settling > 0) settling--;
    Engine.update(engine, 1000 / 60);

    blocks = blocks.filter(function (b) { return !b.g.dead; });
    gems.forEach(function (g) { if (!g.g.dead && (g.position.y > GROUND + 60 || g.position.x < -200 || g.position.x > WORLD_W + 300)) kill(g); });
    gems = gems.filter(function (b) { return !b.g.dead; });

    shots.forEach(function (s) {
      s.g.life++;
      var out = s.position.x < -300 || s.position.x > WORLD_W + 400 || s.position.y > GROUND + 200;
      if (out || s.g.life > 540) { s.g.dead = true; Composite.remove(engine.world, s); if (!out) burst(s.position.x, s.position.y, '#cfc8ba', 6); }
    });
    shots = shots.filter(function (s) { return !s.g.dead; });

    if (flying) {
      flightTime++;
      if (!flying.g.dead && flightTime % 3 === 0 && trail.length < 80) trail.push({ x: flying.position.x, y: flying.position.y });
      var slow = flying.g.dead || flying.speed < 0.35;
      restTime = slow ? restTime + 1 : 0;
      if (restTime > 50 || flightTime > 420) { flying = null; if (state === 'play') nextStone(); }
    }

    // Gamepad analog aim: the stick is the pull-back direction.
    var A = window.ArcadeInput;
    if (A && loaded && state === 'play' && aiming !== 'drag') {
      var ax = A.axis();
      var mag = Math.hypot(ax[0], ax[1]);
      if (A.device() === 'gamepad' && mag > 0.25) {
        aiming = 'pad';
        pull.x += (ax[0] * MAX_PULL - pull.x) * 0.25;
        pull.y += (ax[1] * MAX_PULL - pull.y) * 0.25;
      } else if (aiming === 'pad') { aiming = null; pull = { x: 0, y: 0 }; }
    }
    if (aiming === 'kb' && loaded) {
      var r = kb.angle * Math.PI / 180;
      pull.x = -Math.cos(r) * kb.power * MAX_PULL;
      pull.y = Math.sin(r) * kb.power * MAX_PULL;
    }

    // Right stick pans the camera.
    var aim = A && A.aim();
    if (aim) { cam.manual = 1; cam.x += aim[0] * 14; }
    if (keys.pan) { cam.manual = 1; cam.x += keys.pan * 14; }

    if (!cam.manual) {
      cam.target = flying && !flying.g.dead ? flying.position.x - viewW() * 0.45 : 0;
      cam.x += (cam.target - cam.x) * 0.08;
    }
    clampCam();

    particles.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--; });
    particles = particles.filter(function (p) { return p.life > 0; });

    if (state === 'play') {
      if (!gems.length) { if (++endTimer > 55) finish(true); }
      else if (!loaded && !flying && !ammo.length) { if (++endTimer > 110) finish(false); }
      else endTimer = 0;
    }
  }

  function finish(won) {
    state = won ? 'won' : 'lost';
    var left = ammo.length + (loaded ? 1 : 0);
    var stars = won ? Math.min(3, 1 + left) : 0;
    if (won) {
      score += left * 1000;
      save.stars[levelIdx] = Math.max(save.stars[levelIdx] || 0, stars);
      save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length - 1, levelIdx + 1));
      persist();
    }
    var last = levelIdx === LEVELS.length - 1;
    $('ph').textContent = won ? (last ? 'All clear!' : 'Cleared!') : 'Out of stones';
    $('pstars').textContent = won ? '★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars) : '';
    $('pp').textContent = won ? 'Score ' + score : gems.length + (gems.length === 1 ? ' crystal' : ' crystals') + ' left standing.';
    $('pb1').textContent = won && !last ? 'Next level' : 'Play again';
    $('pb1').onclick = function () { load(won && !last ? levelIdx + 1 : levelIdx); };
    $('pb2').textContent = won && !last ? 'Replay' : 'Arcade';
    $('pb2').onclick = function () { if (won && !last) load(levelIdx); else ArcadeInput.hub(); };
    $('panel').classList.add('show');
    $('next').disabled = levelIdx >= save.unlocked || last;
  }

  // ---- input: pointer (mouse, touch, trackpad drag) ---------------------------------
  var ptr = { id: null, mode: null, lastX: 0 };
  cv.addEventListener('pointerdown', function (e) {
    if (state !== 'play') return;
    if (ptr.id !== null) return;
    var w = toWorld(e.clientX, e.clientY);
    var grab = Math.max(70, 46 / S());       // generous grab radius for fingers
    if (loaded && Math.hypot(w.x - SLING.x - pull.x, w.y - SLING.y - pull.y) < grab) {
      ptr.mode = 'sling'; aiming = 'drag';
    } else if (flying && ability()) {
      return;
    } else {
      ptr.mode = 'pan'; cam.manual = 1;
    }
    ptr.id = e.pointerId; ptr.lastX = e.clientX;
    cv.setPointerCapture(e.pointerId);
    cv.style.cursor = 'grabbing';
    if (ptr.mode === 'sling') dragTo(w);
  });
  function dragTo(w) {
    var dx = w.x - SLING.x, dy = w.y - SLING.y, m = Math.hypot(dx, dy);
    if (m > MAX_PULL) { dx *= MAX_PULL / m; dy *= MAX_PULL / m; }
    pull.x = dx; pull.y = dy;
  }
  cv.addEventListener('pointermove', function (e) {
    if (e.pointerId !== ptr.id) return;
    if (ptr.mode === 'sling') dragTo(toWorld(e.clientX, e.clientY));
    else { cam.x -= (e.clientX - ptr.lastX) / S(); ptr.lastX = e.clientX; }
  });
  function ptrEnd(e) {
    if (e.pointerId !== ptr.id) return;
    if (ptr.mode === 'sling') { if (e.type === 'pointerup') launch(); else { pull = { x: 0, y: 0 }; aiming = null; } }
    ptr.id = null; ptr.mode = null; cv.style.cursor = 'grab';
  }
  cv.addEventListener('pointerup', ptrEnd);
  cv.addEventListener('pointercancel', ptrEnd);
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Trackpad: two-finger scroll pans, pinch (ctrl+wheel) zooms. Mouse wheel pans too.
  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (e.ctrlKey) {
      var before = toWorld(e.clientX, e.clientY);
      zoom = Math.max(0.55, Math.min(1.8, zoom * Math.exp(-e.deltaY * 0.01)));
      cam.x = before.x - e.clientX / S();
    } else {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) d *= 30;
      cam.x += d / S();
    }
    cam.manual = 1;
    clampCam();
  }, { passive: false });
  // Safari trackpad pinch.
  var gz = 1;
  window.addEventListener('gesturestart', function (e) { e.preventDefault(); gz = zoom; });
  window.addEventListener('gesturechange', function (e) { e.preventDefault(); zoom = Math.max(0.55, Math.min(1.8, gz * e.scale)); clampCam(); });

  // ---- input: keyboard + gamepad buttons ---------------------------------------------
  var keys = { pan: 0 };
  function primary() {
    if (state !== 'play') { $('pb1').click(); return; }
    if (loaded && aiming && aiming !== 'drag') launch();
    else if (loaded && !aiming) { aiming = 'kb'; }
    else ability();
  }
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === ' ' || k === 'Enter') { e.preventDefault(); if (!e.repeat) primary(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (!loaded || state !== 'play' || aiming === 'drag') return;
      aiming = 'kb';
      if (k === 'ArrowUp') kb.angle = Math.min(85, kb.angle + 2);
      if (k === 'ArrowDown') kb.angle = Math.max(-20, kb.angle - 2);
      if (k === 'ArrowLeft') kb.power = Math.min(1, kb.power + 0.03);     // pull further back
      if (k === 'ArrowRight') kb.power = Math.max(0.2, kb.power - 0.03);
    }
    else if (k === 'r' || k === 'R') load(levelIdx);
    else if (k === 'Escape') { aiming = null; pull = { x: 0, y: 0 }; }
    else if (k === '[' || k === 'a') keys.pan = -1;
    else if (k === ']' || k === 'd') keys.pan = 1;
    else if (k === 'n' && !$('next').disabled) load(levelIdx + 1);
    else if (k === 'p' && levelIdx > 0) load(levelIdx - 1);
  });
  window.addEventListener('keyup', function (e) { if ('[]ad'.indexOf(e.key) >= 0) keys.pan = 0; });
  // The d-pad arrives as synthetic arrow keys (fine aim); buttons arrive here.
  window.addEventListener('arcade-button', function (e) {
    var n = e.detail.name;
    if (!e.detail.down) return;
    if (n === 'a') {
      if (state !== 'play') $('pb1').click();
      else if (loaded && aiming === 'pad') launch();
      else if (loaded && aiming === 'kb') launch();
      else ability();
    }
    if (n === 'b' && state !== 'play') $('pb2').click();
    if (n === 'y' || n === 'start') load(levelIdx);
    if (n === 'rb' && !$('next').disabled) load(levelIdx + 1);
    if (n === 'lb' && levelIdx > 0) load(levelIdx - 1);
  });

  $('retry').onclick = function () { load(levelIdx); };
  $('prev').onclick = function () { load(levelIdx - 1); };
  $('next').onclick = function () { load(levelIdx + 1); };

  var HINTS = {
    mouse: 'Drag the stone back and release · two-finger scroll to look around · pinch to zoom',
    keyboard: 'Drag the stone back and release · or arrows to aim, Space to throw · R restarts',
    touch: 'Drag the stone back and let go · drag the sky to look around · tap mid-flight to split',
    gamepad: 'Left stick pulls back · A throws / splits · right stick looks · Y restarts · LB/RB level'
  };
  function hint(d) { $('hint').textContent = HINTS[d] || HINTS.mouse; }
  hint(window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');
  window.addEventListener('arcade-device', function (e) { hint(e.detail); });

  // ---- render --------------------------------------------------------------------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function hills(par, base, amp, color) {
    ctx.fillStyle = color; ctx.beginPath();
    var x0 = cam.x - 50, x1 = cam.x + viewW() + 50;
    ctx.moveTo(x0, GROUND);
    for (var x = x0; x <= x1; x += 40) {
      var u = x - cam.x * par;
      ctx.lineTo(x, GROUND - base - Math.sin(u * 0.004) * amp - Math.sin(u * 0.011 + 2) * amp * 0.4);
    }
    ctx.lineTo(x1, GROUND); ctx.closePath(); ctx.fill();
  }

  function draw() {
    var s = S() * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var sky = ctx.createLinearGradient(0, 0, 0, cv.height);
    sky.addColorStop(0, '#1b2440'); sky.addColorStop(0.55, '#4a4a7a'); sky.addColorStop(1, '#e79a6b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cv.width, cv.height);

    // World transform: world y = VIEW_H sits on the bottom edge of the screen.
    ctx.setTransform(s, 0, 0, s, -cam.x * s, cv.height - VIEW_H * s);
    var top = VIEW_H - H / S();

    ctx.fillStyle = 'rgba(255,240,210,.9)';
    for (var i = 0; i < 40; i++) {
      var sx = cam.x * 0.95 + ((i * 397) % 2000), sy = top + ((i * 211) % 380);
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 0.03 + i);
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    hills(0.8, 150, 60, '#3a3966');
    hills(0.5, 70, 40, '#2c2b52');

    ctx.fillStyle = '#23352f'; ctx.fillRect(cam.x - 100, GROUND, viewW() + 200, 400);
    ctx.fillStyle = '#3f6b4a'; ctx.fillRect(cam.x - 100, GROUND, viewW() + 200, 10);

    // previous + current flight trails
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    lastTrail.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.3); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    trail.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.3); ctx.fill(); });

    // sling: back arm, band, stone, front arm
    var px = SLING.x + pull.x, py = SLING.y + pull.y;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5a3d25'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(SLING.x, GROUND); ctx.lineTo(SLING.x, SLING.y + 45); ctx.lineTo(SLING.x + 22, SLING.y - 8); ctx.stroke();
    if (loaded) {
      ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(SLING.x + 22, SLING.y - 8); ctx.lineTo(px, py); ctx.stroke();
    }
    // aim preview
    if (loaded && Math.hypot(pull.x, pull.y) > 18) {
      var vx = -pull.x * POWER, vy = -pull.y * POWER, qx = px, qy = py;
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (var k = 1; k <= 36; k++) {
        vx *= 0.998; vy = vy * 0.998 + 0.2778; qx += vx; qy += vy;
        if (k % 4 === 0) { ctx.beginPath(); ctx.arc(qx, qy, Math.max(1.5, 4.5 - k * 0.08), 0, 6.3); ctx.fill(); }
      }
    }
    if (loaded) stone(px, py, loaded, 0);
    ctx.strokeStyle = '#7a5433'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(SLING.x, SLING.y + 45); ctx.lineTo(SLING.x - 22, SLING.y - 8); ctx.stroke();
    if (loaded) {
      ctx.strokeStyle = '#3a2416'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(SLING.x - 22, SLING.y - 8); ctx.lineTo(px, py); ctx.stroke();
    }
    // queued stones on the ground behind the sling
    ammo.forEach(function (a, i) { stone(SLING.x - 60 - i * 44, GROUND - AMMO[a].r, a, 0); });

    blocks.forEach(function (b) {
      var g = b.g, m = MATS[g.mat];
      ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
      rr(-g.w / 2, -g.h / 2, g.w, g.h, 3);
      ctx.fillStyle = m.fill; ctx.fill();
      ctx.strokeStyle = m.edge; ctx.lineWidth = 2; ctx.stroke();
      var dmg = 1 - g.hp / g.max;
      if (dmg > 0.3) {
        ctx.strokeStyle = 'rgba(20,10,5,.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(-g.w * 0.3, -g.h * 0.4); ctx.lineTo(0, 0); ctx.lineTo(g.w * 0.15, g.h * 0.35);
        if (dmg > 0.65) { ctx.moveTo(g.w * 0.35, -g.h * 0.3); ctx.lineTo(0, 0); ctx.lineTo(-g.w * 0.25, g.h * 0.3); }
        ctx.stroke();
      }
      ctx.restore();
    });

    gems.forEach(function (b) {
      var glow = 0.5 + 0.5 * Math.sin(t * 0.06 + b.g.phase);
      ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
      ctx.shadowColor = '#7ff0d8'; ctx.shadowBlur = (10 + glow * 12) * s;
      ctx.fillStyle = '#3fd6b8';
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(14, -4); ctx.lineTo(8, 15); ctx.lineTo(-8, 15); ctx.lineTo(-14, -4); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(14, -4); ctx.lineTo(0, 0); ctx.lineTo(-14, -4); ctx.closePath(); ctx.fill();
      ctx.restore();
    });

    shots.forEach(function (b) { stone(b.position.x, b.position.y, b.g.type, b.angle); });

    particles.forEach(function (p) {
      ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    });
    ctx.globalAlpha = 1;
  }

  function stone(x, y, type, ang) {
    var a = AMMO[type];
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(0, 0, a.r, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(a.r * 0.3, a.r * 0.25, a.r * 0.35, 0, 6.3); ctx.fill();
    if (type === 'split') { ctx.strokeStyle = 'rgba(90,40,0,.6)'; ctx.beginPath(); ctx.moveTo(-a.r, 0); ctx.lineTo(a.r, 0); ctx.moveTo(0, -a.r); ctx.lineTo(0, a.r); ctx.stroke(); }
    ctx.restore();
  }

  // ---- loop ----------------------------------------------------------------------
  var acc = 0, prev = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min(100, now - (prev || now)); prev = now;
    var n = 0;
    while (acc >= 1000 / 60 && n++ < 4) { step(); acc -= 1000 / 60; }
    draw();
  }

  window.__slingstone = { load: load, state: function () { return { state: state, gems: gems.length, ammo: ammo.length, loaded: loaded, level: levelIdx, score: score, blocks: blocks.length }; } };
  load(Math.min(save.unlocked, LEVELS.length - 1));
  requestAnimationFrame(frame);
})();
