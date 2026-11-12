// Emberwake — game orchestration: rooms, camera, state machine, saving.
import * as THREE from 'three';
import { input } from './input.js';
import { audio } from './audio.js';
import { World, CAM_DIST, ORDER } from './world.js';
import { ROOMS, START_ROOM } from './rooms.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { createPost, MAX_LIGHTS } from './post.js';
import { quad, glow, globalUniforms } from './art.js';
import { sprite } from './sprites.js';
import { ENEMY_KINDS, Pot, Hearth, Tablet, Shrine, EmberShard, Gate, Flare } from './entities.js';
import { BOSS_KINDS } from './bosses.js';
import { approach, clamp, damp, lerp, overlap } from './util.js';

const FOV = 40;
const VIEW_H = 15;
const SAVE_KEY = 'emberwake.save.v1';

const freshSave = () => ({
  hearth: null, abilities: { dash: false, grip: false, wing: false }, maxHp: 5, glints: 0, embers: {}, bosses: {}, deaths: 0, time: 0, started: false,
});

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.started) {
      const f = freshSave();
      const out = { ...f, ...s, abilities: { ...f.abilities, ...s.abilities }, bosses: { ...(s.bosses || {}) } };
      if (s.bossDead) out.bosses.warden = true; // saves from before the expansion
      return out;
    }
  } catch (e) {
    /* storage may be unavailable */
  }
  return freshSave();
}

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, 1.6);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.perf = { t: 0, n: 0 };
    this.renderer.setClearColor(0x05060c);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 300);
    this.camera.position.z = CAM_DIST;
    this.post = createPost(this.renderer, this.scene, this.camera);
    this.world = new World(this.scene);
    this.fx = new FX(this.scene);
    this.hud = new HUD();
    this.input = input;
    this.player = new Player(this);
    this.player.addTo(this.scene);
    this.entities = [];
    this.timers = [];
    this.time = 0;
    this.state = 'boot';
    this.fade = 1;
    this.fadeTarget = 0;
    this.cam = { x: 0, y: 0, lookX: 0, lookY: 0 };
    this.hurtFlash = 0;
    this.save = loadSave();
    this.seen = new Set();
    this.flickers = [];
    this.v = new THREE.Vector3();
    this.params = new URLSearchParams(location.search);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    input.onDevice(() => {
      this.hud.refreshKeys();
      this.hud.last.hint = this.hud.last.prompt = undefined;
    });
    this.hud.refreshKeys();
    window.addEventListener('pointerdown', () => audio.init());
    window.addEventListener('keydown', () => audio.init());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.pause();
    });

    this.toTitle(true);
    this.last = performance.now();
    this.hud.loaded();
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (!this.manual) this.frame(now);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.composer.setSize(w, h);
    this.aspect = w / h;
    // tall, narrow screens zoom out so there is still room to see ahead
    this.viewH = clamp(17 / this.aspect, VIEW_H, 22);
    this.camera.fov = (2 * Math.atan(this.viewH / (2 * CAM_DIST)) * 180) / Math.PI;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.fx.setScale(h * this.renderer.getPixelRatio(), this.camera.fov);
    this.post.u.uAspect.value = this.aspect;
  }

  after(t, fn) {
    this.timers.push({ t, fn });
  }

  persist() {
    const p = this.player;
    Object.assign(this.save, { abilities: p.abilities, maxHp: p.maxHp, glints: p.glints, started: true });
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch (e) {
      /* ignore */
    }
  }

  // ───────────────────────── title / menus ─────────────────────────
  toTitle(first) {
    this.state = 'title';
    this.timers.length = 0;
    this.post.u.uFadeCol.value.set(0, 0, 0);
    this.hud.show(false);
    this.hud.hideEnding();
    this.hud.hideBanner();
    this.hud.hideLore();
    this.hud.hint(null);
    this.hud.prompt(null);
    audio.setBoss(false);
    const p = this.player;
    p.abilities = { dash: false, grip: false, wing: false };
    p.maxHp = p.hp = 5;
    p.revive();
    p.frozen = true;
    this.loadRoom(START_ROOM, {});
    this.fade = 1;
    this.fadeTarget = 0;
    const items = [];
    if (this.save.started) items.push({ label: 'CONTINUE', action: () => this.begin(false) });
    items.push({ label: this.save.started ? 'NEW JOURNEY' : 'BEGIN', action: () => this.begin(true) });
    items.push({ label: audio.muted ? 'SOUND: OFF' : 'SOUND: ON', action: () => this.hud.relabel(items.length - 1, audio.toggleMute() ? 'SOUND: OFF' : 'SOUND: ON') });
    this.hud.openMenu('title', 'titleMenu', items);
    if (!first) audio.setBiome('kiln');
  }

  begin(isNew) {
    audio.init();
    this.hud.closeMenu();
    if (isNew) this.save = freshSave();
    const s = this.save;
    const p = this.player;
    // debug shortcuts: ?room=vault2&dash=1&grip=1
    if (this.params.get('dash')) s.abilities.dash = true;
    if (this.params.get('grip')) s.abilities.grip = true;
    if (this.params.get('wing')) s.abilities.wing = true;
    p.abilities = { ...s.abilities };
    p.maxHp = s.maxHp;
    p.hp = p.maxHp;
    p.glints = s.glints;
    p.cinder = this.params.get('cinder') ? 99 : 0;
    p.revive();
    this.seen.clear();
    this.state = 'transition';
    this.fadeTarget = 1;
    this.trans = () => {
      const dbg = this.params.get('room');
      if (dbg && ROOMS[dbg]) {
        const at = this.params.get('at');
        const x = this.params.get('x');
        this.loadRoom(dbg, at ? { exit: at } : x ? { pos: { x: +x, y: +(this.params.get('y') || 3) } } : { exit: ROOMS[dbg].exits[0].key });
      } else if (s.hearth) this.loadRoom(s.hearth.room, { pos: s.hearth });
      else this.loadRoom(START_ROOM, {});
      this.hud.show(true);
      this.persist();
    };
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    const items = [
      { label: 'RESUME', action: () => this.resume() },
      { label: audio.muted ? 'SOUND: OFF' : 'SOUND: ON', action: () => this.hud.relabel(1, audio.toggleMute() ? 'SOUND: OFF' : 'SOUND: ON') },
      { label: 'RETURN TO TITLE', action: () => { this.hud.closeMenu(); this.persist(); this.toTitle(); } },
    ];
    this.hud.openMenu('pause', 'pauseMenu', items);
  }
  resume() {
    this.hud.closeMenu();
    this.state = 'play';
  }

  // ───────────────────────── rooms ─────────────────────────
  spawn(e) {
    this.entities.push(e);
    this.scene.add(e.root);
    return e;
  }
  clearEntities() {
    for (const e of this.entities) {
      this.scene.remove(e.root);
      e.dispose();
    }
    this.entities.length = 0;
  }

  loadRoom(id, { exit, pos }) {
    this.clearEntities();
    this.fx.clear();
    const room = this.world.load(id);
    this.roomId = id;
    this.room = room;
    this.hints = [];
    this.flickers = [];
    this.gates = [];
    this.boss = null;
    this.arena = { x0: 0, x1: room.w };
    this.trigger = null;
    this.heart = null;
    const G = this.world.group;
    const p = this.player;
    let start = null;
    room.marks.forEach((m, i) => {
      switch (m.type) {
        case 'start':
          start = m;
          break;
        case 'kiln': {
          const ks = m.size || 8.5;
          const k = quad(sprite('kiln'), ks, ks, { anchor: 'b', order: ORDER.back, tint: 0xb8c4e0 });
          k.position.set(m.x, m.y - 0.15, -0.6);
          G.add(k);
          break;
        }
        case 'heart': {
          const k = quad(sprite('kiln'), 12, 12, { anchor: 'b', order: ORDER.back, tint: 0xc8c0e8 });
          k.position.set(m.x, m.y - 0.2, -0.8);
          const flame = quad(sprite('flame'), 3.2, 5.2, { anchor: 'b', add: true, order: ORDER.back + 1 });
          flame.position.set(m.x, m.y - 0.1, -0.75);
          const gl = glow('#ffa040', 22, 0);
          gl.position.set(m.x, m.y + 3, -0.7);
          gl.renderOrder = ORDER.back + 1;
          G.add(k, flame, gl);
          this.heart = { x: m.x, y: m.y, flame, gl, k: this.save.bosses.wick ? 1 : 0, lit: !!this.save.bosses.wick, light: this.world.addLight(m.x, m.y + 3, 16, '#ffa040', 0) };
          break;
        }
        case 'lantern': {
          const q = quad(sprite('lantern'), 1.25, 3.1, { anchor: 'b', order: ORDER.back + 1 });
          q.position.set(m.x, m.y - 0.06, -0.3);
          const gl = glow('#ffb050', 6.5, 0.3);
          gl.position.set(m.x + 0.2, m.y + 2.28, -0.25);
          gl.renderOrder = ORDER.back;
          G.add(gl, q);
          this.flickers.push({ gl, ph: Math.random() * 9, light: this.world.addLight(m.x + 0.2, m.y + 2.3, 6.5, '#ffb050', 1) });
          break;
        }
        case 'hint':
          this.hints.push(m);
          break;
        case 'hearth':
          this.spawn(new Hearth(this, m.x, m.y, !!(this.save.hearth && this.save.hearth.room === id)));
          break;
        case 'tablet':
          this.spawn(new Tablet(this, m.x, m.y, m.text));
          break;
        case 'pot':
          this.spawn(new Pot(this, m.x, m.y));
          break;
        case 'enemy':
          this.spawn(new ENEMY_KINDS[m.kind](this, m.x, m.y));
          break;
        case 'shrine':
          this.spawn(new Shrine(this, m.x, m.y, m.ability));
          break;
        case 'ember':
          if (!this.save.embers[id + i]) this.spawn(new EmberShard(this, m.x, m.y, id + i));
          break;
        case 'gate':
          this.gates.push(this.spawn(new Gate(this, m.x, m.y, m.h)));
          break;
        case 'bossTrigger':
          this.trigger = m;
          break;
        case 'boss':
          this.arena = { x0: m.x0, x1: m.x1 };
          if (!this.save.bosses[m.kind]) this.boss = this.spawn(new BOSS_KINDS[m.kind](this, m.x, m.y));
          break;
      }
    });

    let x;
    let y;
    let facing = 1;
    if (pos) {
      x = pos.x;
      y = pos.y;
    } else if (exit) {
      const e = room.exits.find((k) => k.key === exit);
      x = e.side === 'left' ? 2.3 : room.w - 2.3;
      y = e.y;
      facing = e.side === 'left' ? 1 : -1;
    } else {
      x = start ? start.x : 4;
      y = start ? start.y : 3;
    }
    p.place(x, y, facing);
    p.frozen = this.state === 'title';
    audio.setBiome(room.biome);
    audio.setBoss(false);
    const b = this.world.biome;
    this.post.u.uDark.value = b.dark;
    this.post.u.uTint.value.set(...b.tint);
    this.cam.lookX = facing * 1.8;
    this.cam.lookY = 0;
    this.updateCamera(0, true);
    if (this.state !== 'title' && !this.seen.has(id)) {
      this.seen.add(id);
      const subs = { kiln: 'where the fire was kept', root: 'where the warmth was drunk', vault: 'where the cold was shaped', forge: 'where the mistakes were poured', rime: 'where the light stood still' };
      this.after(0.5, () => this.hud.areaCard(room.name, subs[room.biome]));
    }
  }

  transition(to, at) {
    if (this.state !== 'play') return;
    this.state = 'transition';
    this.fadeTarget = 1;
    this.trans = () => this.loadRoom(to, { exit: at });
  }

  // ───────────────────────── gameplay callbacks ─────────────────────────
  hitScan(box, dmg, kx, ky, set) {
    let n = 0;
    for (const e of this.entities) {
      if (!e.hurtable || e.dead || set.has(e)) continue;
      const b = e.box;
      if (overlap(box.x, box.y, box.w, box.h, b.x, b.y, b.w, b.h)) {
        set.add(e);
        n += e.takeHit(dmg, kx, ky);
      }
    }
    return n;
  }

  spawnFlare(x, y, dir) {
    this.spawn(new Flare(this, x, y - 0.35, dir));
  }

  onPlayerHurt() {
    this.hurtFlash = 1;
  }

  onHazard() {
    const p = this.player;
    if (!p.hurt(1, p.x + p.facing * 0.01)) return;
    if (p.dead) return;
    p.frozen = true;
    this.after(0.28, () => (this.fadeTarget = 1));
    this.after(0.55, () => {
      if (p.dead) return;
      p.place(p.safe.x, p.safe.y, p.facing);
      p.frozen = false;
      p.knockT = 0;
      this.updateCamera(0, true);
      this.fadeTarget = 0;
    });
  }

  onPlayerDeath() {
    this.save.deaths++;
    audio.setBoss(false);
    this.after(1.7, () => (this.fadeTarget = 1));
    this.after(2.5, () => {
      const p = this.player;
      p.glints = Math.floor(p.glints / 2);
      p.cinder = 0;
      const h = this.save.hearth;
      p.revive();
      if (h) this.loadRoom(h.room, { pos: h });
      else this.loadRoom(START_ROOM, {});
      this.persist();
      this.fadeTarget = 0;
      this.hud.areaCard('Rekindled', 'the wick does not stay dark for long', 2.6);
    });
  }

  rest(hearth) {
    const p = this.player;
    p.hp = p.maxHp;
    this.save.hearth = { room: this.roomId, x: hearth.x + 1.3, y: hearth.y };
    this.persist();
    audio.sfx('rest');
    this.hud.pulse();
    this.hud.showLore('The hearth takes your flame, and gives it back whole.', 3.2);
    this.fx.ring(p.x, p.y + 0.9, '#ffd28a', 24, 6);
  }

  grantAbility(a) {
    const p = this.player;
    p.abilities[a] = true;
    p.hp = p.maxHp;
    this.persist();
    audio.sfx('pickup');
    this.fx.shake(0.3, 0.5);
    const k = (n) => `<kbd>${input.label(n)}</kbd>`;
    const text = {
      dash: ['GUST STEP', `Press ${k('dash')} to surge forward on a borrowed wind — on the ground or in mid-air. It returns when you touch earth, or bounce off something sharp.`],
      grip: ['EMBER GRIP', `Push against a wall while falling to cling to it. Press ${k('jump')} to kick away. Two walls make a ladder.`],
      wing: ['KINDLED LEAP', `Press ${k('jump')} again in mid-air for a second jump. It returns when you land, cling to a wall, or bounce off something sharp.`],
    }[a];
    this.banner('A GIFT OF THE OLD MAKERS', text[0], text[1]);
  }

  collectEmber(key) {
    const p = this.player;
    this.save.embers[key] = true;
    p.maxHp++;
    p.hp = p.maxHp;
    this.persist();
    audio.sfx('ember');
    this.banner('KILN EMBER', 'YOUR FLAME GROWS', 'A coal that never quite went out. You can now carry one more flame.');
  }

  banner(kicker, title, body) {
    this.state = 'banner';
    this.bannerT = 0;
    this.hud.showBanner(kicker, title, body);
  }

  onBossDying() {
    audio.setBoss(false);
  }

  onBossDead(boss) {
    this.save.bosses[boss.key] = true;
    this.persist();
    this.gates.forEach((gt) => gt.set(false));
    this.boss = null;
    const p = this.player;
    if (!boss.final) {
      // an ordinary boss: the way on opens, and the wick is made whole
      this.after(1.4, () => {
        p.hp = p.maxHp;
        this.hud.pulse();
        audio.sfx('rest');
        this.hud.areaCard(boss.title, boss.fallen, 3.4);
      });
      return;
    }
    this.after(1.6, () => {
      if (!this.heart) return;
      this.heart.lit = true;
      audio.sfx('pickup');
      audio.sfx('flareHit');
      this.fx.shake(0.5, 1.2);
      this.fx.burst(this.heart.x, this.heart.y + 2, 120, { color: '#ffc070', speed: 14, angle: Math.PI / 2, spread: 1.2, grav: 2, life: 2.2 });
    });
    this.after(6.5, () => {
      this.state = 'ending';
      this.endT = 0;
      this.player.frozen = true;
      this.post.u.uFadeCol.value.set(1, 0.93, 0.8);
      this.fadeTarget = 1;
      const t = Math.floor(this.save.time);
      const mm = Math.floor(t / 60);
      const ss = String(t % 60).padStart(2, '0');
      this.hud.show(false);
      this.hud.showEnding(`TIME ${mm}:${ss}   ·   GLINTS ${this.player.glints}   ·   REKINDLED ${this.save.deaths}×`);
    });
  }

  hintText(key) {
    const k = (n) => `<kbd>${input.label(n)}</kbd>`;
    const p = this.player;
    switch (key) {
      case 'move': return `${k('move')} to walk`;
      case 'jump': return `${k('jump')} to jump — hold it to rise higher`;
      case 'attack': return `${k('attack')} to strike`;
      case 'thorns': return `In mid-air, hold ${k('down')} and strike to bounce off thorns`;
      case 'focus': return p.hp < p.maxHp ? `Striking foes gathers Cinder. Hold ${k('focus')} to mend a flame, or ${k('flare')} to cast it.` : `Striking foes gathers Cinder. Spend it with ${k('focus')} (mend) or ${k('flare')} (flare).`;
      case 'dashgap': return p.abilities.dash ? `Jump, then ${k('dash')} in mid-air` : 'Too wide for small legs. The roots to the west remember a shrine.';
      case 'shaft': return p.abilities.grip ? `Jump into the shaft and push toward a wall to cling. ${k('jump')} kicks you across to the other wall.` : 'A shaft climbs out of reach. Something at the far end of this chamber might help.';
      case 'wing': return p.abilities.wing ? `${k('jump')} again in mid-air to reach the high planks` : 'These planks hang higher than one jump can reach.';
      default: return null;
    }
  }

  // ───────────────────────── frame ─────────────────────────
  // Test hook: advance n fixed steps without the real-time loop.
  step(n = 1, dt = 1 / 60, draw = false) {
    this.manual = true;
    for (let i = 0; i < n; i++) this.tick(dt, draw && i === n - 1);
  }

  frame(now) {
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(raw, 1 / 30);
    this.last = now;
    // adaptive resolution: if frames run long, render fewer pixels
    if (raw < 0.25) {
      this.perf.t += raw;
      if (++this.perf.n >= 50) {
        const avg = this.perf.t / this.perf.n;
        this.perf.t = this.perf.n = 0;
        if (avg > 0.023 && this.ratio > 0.6) {
          this.ratio = Math.max(0.6, this.ratio - 0.2);
          this.renderer.setPixelRatio(this.ratio);
          this.resize();
        }
      }
    }
    this.tick(dt, true);
  }

  tick(dt, draw) {
    input.poll();
    audio.update();
    this.time += dt;
    globalUniforms.uTime.value = this.time;
    const p = this.player;

    this.fade = approach(this.fade, this.fadeTarget, dt * 4);

    switch (this.state) {
      case 'title':
        this.hud.menuInput();
        this.simulate(dt);
        break;
      case 'transition':
        if (this.fade >= 1) {
          this.state = 'play';
          this.trans();
          this.trans = null;
          this.fadeTarget = 0;
        }
        break;
      case 'play':
        if (input.hit('pause')) {
          this.pause();
          break;
        }
        this.save.time += dt;
        if (this.fx.freezeT > 0) this.fx.freezeT -= dt;
        else this.simulate(dt);
        this.playLogic(dt);
        break;
      case 'pause':
        this.hud.menuInput();
        if (input.hit('pause')) this.resume();
        break;
      case 'banner':
        this.bannerT += dt;
        this.fx.update(dt, this.time);
        if (this.bannerT > 1.3) {
          this.hud.bannerReady();
          if (input.hit('confirm') || input.hit('attack') || input.hit('jump')) {
            this.hud.hideBanner();
            this.state = 'play';
          }
        }
        break;
      case 'ending':
        this.endT += dt;
        this.simulate(dt);
        if (this.endT > 7 && (input.hit('confirm') || input.hit('attack') || input.hit('jump'))) this.toTitle();
        break;
    }

    this.hud.update(p, dt);
    this.updateCamera(dt);
    if (draw) this.render(dt);
  }

  simulate(dt) {
    const p = this.player;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    p.update(dt);
    const es = this.entities;
    for (let i = 0; i < es.length; i++) es[i].update(dt);
    if (!p.dead && p.invuln <= 0) {
      for (const e of es) {
        if (!e.contact || e.dead) continue;
        const b = e.box;
        if (overlap(b.x, b.y, b.w, b.h, p.x - p.w / 2 + 0.05, p.y + 0.05, p.w - 0.1, p.h - 0.15)) {
          if (p.hurt(1, e.x)) {
            if (e.pop) e.pop();
            break;
          }
        }
      }
    }
    for (let i = es.length - 1; i >= 0; i--) {
      if (es[i].dead) {
        this.scene.remove(es[i].root);
        es[i].dispose();
        es.splice(i, 1);
      }
    }
    const hh = this.viewH / 2;
    this.fx.ambient(dt, this.world.biome.particles, this.cam.x, this.cam.y, hh * this.aspect, hh);
    this.fx.update(dt, this.time);

    for (const f of this.flickers) {
      const k = 0.85 + 0.1 * Math.sin(this.time * 11 + f.ph) + 0.05 * Math.sin(this.time * 23.7 + f.ph * 2);
      f.gl.material.uniforms.uAlpha.value = 0.3 * k;
      f.light.intensity = k;
    }
    if (this.heart) {
      const h = this.heart;
      h.k = damp(h.k, h.lit ? 1 : 0, 1.5, dt);
      const fl = 1 + Math.sin(this.time * 13) * 0.08 + Math.sin(this.time * 29) * 0.05;
      h.flame.scale.set(3.2 * h.k * (2 - fl), 5.2 * h.k * fl, 1);
      h.gl.material.uniforms.uAlpha.value = 0.45 * h.k;
      h.light.intensity = h.k * 1.2;
      if (h.lit && Math.random() < dt * 30) {
        this.fx.add.spawn({ x: h.x + (Math.random() - 0.5) * 3, y: h.y + 1 + Math.random() * 2, z: -0.5, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 4, life: 1 + Math.random() * 2, size: 0.08 + Math.random() * 0.12, color: [1, 0.6, 0.25], alpha: 1, wobble: 1 });
      }
    }
  }

  playLogic(dt) {
    const p = this.player;
    const room = this.room;
    if (p.dead) {
      this.hud.prompt(null);
      return;
    }
    // boss trigger
    if (this.boss && this.boss.state === 'sleep' && this.trigger && p.x > this.trigger.x) {
      this.gates.forEach((gt) => gt.set(true));
      this.boss.wake();
      audio.setBoss(true);
      this.hud.areaCard(this.boss.title, this.boss.sub, 3.2);
    }
    // interaction
    let near = null;
    for (const e of this.entities) {
      if (e.interact && Math.abs(e.x - p.x) < e.radius && Math.abs(e.y - p.y) < 1.6) near = e;
    }
    this.hud.prompt(near && p.onGround ? `<kbd>${input.label('up')}</kbd> ${near.interact.toUpperCase()}` : null);
    if (near && p.onGround && !p.frozen && input.hit('up')) near.use();
    if (this.hud.loreOpen && !near && this.hud.loreT < 8) this.hud.hideLore();
    // hints
    let hint = null;
    for (const h of this.hints) {
      if (Math.abs(h.x - p.x) < h.r && Math.abs(h.y - p.y) < 4) hint = this.hintText(h.text);
    }
    this.hud.hint(hint);
    // exits
    for (const ex of room.exits) {
      const out = ex.side === 'left' ? p.x < 0.75 : p.x > room.w - 0.75;
      if (out && p.y + 1 > ex.y && p.y < ex.y + ex.h) {
        this.transition(ex.to, ex.at);
        break;
      }
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
  }

  updateCamera(dt, snap) {
    const p = this.player;
    const c = this.cam;
    const room = this.room;
    if (!room) return;
    const hh = this.viewH / 2;
    const hw = hh * this.aspect;
    const fight = this.boss && this.boss.state !== 'sleep';
    c.lookX = damp(c.lookX, p.facing * (fight ? 0.6 : 1.9), 2.2, dt);
    let ly = 0;
    if (p.idleT > 0.45 && !p.frozen && this.state === 'play') ly = input.axisY * 4.2;
    c.lookY = damp(c.lookY, ly, 4, dt);
    let tx = p.x + c.lookX;
    let ty = p.y + 2.6 + c.lookY + clamp(p.vy * 0.06, -1.6, 0.4);
    if (fight) tx = lerp(p.x, this.boss.x, 0.28);
    if (this.state === 'title') {
      tx = 13 + Math.sin(this.time * 0.15) * 1.5;
      ty = 8.2;
    }
    const cl = (v, lo, hi, mid) => (hi > lo ? clamp(v, lo, hi) : mid);
    tx = cl(tx, hw, room.w - hw, room.w / 2);
    ty = cl(ty, hh, room.h - hh, room.h / 2);
    if (snap) {
      c.x = tx;
      c.y = ty;
    } else {
      c.x = damp(c.x, tx, 6.5, dt);
      c.y = damp(c.y, ty, p.vy < -18 ? 11 : 5.5, dt);
    }
    c.x = cl(c.x, hw, room.w - hw, room.w / 2);
    c.y = cl(c.y, hh, room.h - hh, room.h / 2);
    this.camera.position.set(c.x + this.fx.offset.x, c.y + this.fx.offset.y, CAM_DIST);
    this.camera.updateMatrixWorld();
  }

  render() {
    const u = this.post.u;
    const p = this.player;
    this.world.update(this.time, this.camera, this.viewH, this.aspect);
    // nearest lights → grade pass
    const L = u.uLights.value;
    const LC = u.uLightCol.value;
    const col = new THREE.Color();
    const put = (i, x, y, radius, intensity, color) => {
      this.v.set(x, y, 0).project(this.camera);
      L[i].set(this.v.x * 0.5 + 0.5, this.v.y * 0.5 + 0.5, radius / this.viewH, intensity);
      col.set(color);
      LC[i].set(col.r, col.g, col.b);
    };
    const flick = 1 + Math.sin(this.time * 13) * 0.02;
    put(0, p.x, p.y + 1.1, (p.focusing ? 10.5 : 9) * flick, p.dead ? 0.25 : 1, '#ffb866');
    const ls = this.world.lights
      .filter((l) => l.intensity > 0.01)
      .map((l) => ({ l, d: Math.abs(l.x - this.cam.x) + Math.abs(l.y - this.cam.y) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 1; i < MAX_LIGHTS; i++) {
      const e = ls[i - 1];
      if (e) put(i, e.l.x, e.l.y, e.l.radius, e.l.intensity, e.l.color);
      else L[i].set(0, 0, 0, 0);
    }
    u.uTime.value = this.time;
    u.uFade.value = this.fade;
    u.uHurt.value = this.hurtFlash;
    u.uLow.value = this.state === 'play' && !p.dead && p.hp === 1 ? 1 : 0;
    this.post.composer.render();
  }
}

window.__game = new Game();
