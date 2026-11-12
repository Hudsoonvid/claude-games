// The expansion bosses: the Briar Queen, the Bellows and the Cold Wick.
import * as THREE from 'three';
import { audio } from './audio.js';
import { quad, glow } from './art.js';
import { sprite } from './sprites.js';
import { ORDER } from './world.js';
import { Entity, Enemy, Seed, Shockwave, Glint, Drop, Warden } from './entities.js';
import { approach, clamp, damp, lerp, overlap, smooth } from './util.js';

const COLD = '#bfe4ff';
const PINK = '#ff7ad9';
const HOT = '#ff8a3c';
const rnd = (a, b) => a + Math.random() * (b - a);

// Shared death throes: shake, pop, then hand off to the game.
function dyingFx(b, dt, colors, cy) {
  const g = b.g;
  b.rig.position.x = Math.sin(g.time * 60) * 0.08;
  if (Math.random() < dt * 40) {
    g.fx.burst(b.x + rnd(-1.4, 1.4), b.y + cy + rnd(-1.6, 1.6), 10, { color: colors[Math.floor(Math.random() * colors.length)], speed: 10, life: 0.8 });
    if (Math.random() < 0.3) {
      audio.sfx('hit');
      g.fx.shake(0.25, 0.15);
    }
  }
}
function finalBlast(b, cy, color) {
  const g = b.g;
  b.dead = true;
  audio.sfx('kill');
  audio.sfx('slam');
  g.fx.shake(1, 0.8);
  g.fx.ring(b.x, b.y + cy, color, 60, 16);
  g.fx.burst(b.x, b.y + cy, 120, { color, speed: 16, life: 1.8, grav: 3 });
  g.fx.burst(b.x, b.y + cy, 40, { color: '#15121c', speed: 9, normal: true, size: 0.9, alpha: 0.8, life: 1.5 });
  for (let i = 0; i < 36; i++) g.spawn(new Glint(g, b.x + rnd(-1, 1), b.y + cy + rnd(-1, 1)));
  g.onBossDead(b);
}

// ───────────────────────── the Briar Queen ─────────────────────────
class ThornSpike extends Entity {
  constructor(g, x, floorY, delay) {
    super(g, x, floorY);
    this.delay = delay;
    this.contact = false;
    this.life = 0.5;
    this.mark = glow(PINK, 1.6, 0.0);
    this.mark.scale.set(1.8, 0.5, 1);
    this.mark.position.y = 0.05;
    this.spike = quad(sprite('briarSpike'), 1.0, 2.7, { anchor: 'b', order: ORDER.entity + 1 });
    this.spike.visible = false;
    this.root.add(this.mark, this.spike);
    this.k = 0;
    this.sync();
  }
  get box() {
    return { x: this.x - 0.36, y: this.y, w: 0.72, h: 2.3 * this.k };
  }
  update(dt) {
    this.delay -= dt;
    if (this.delay > 0) {
      this.mark.material.uniforms.uAlpha.value = 0.5 + 0.4 * Math.sin(this.g.time * 34);
      if (Math.random() < dt * 20) this.g.fx.dust(this.x, this.y, 1);
      return;
    }
    if (!this.spike.visible) {
      this.spike.visible = true;
      this.contact = true;
      this.mark.material.uniforms.uAlpha.value = 0.25;
      this.g.fx.burst(this.x, this.y + 0.2, 6, { color: '#3a2a30', speed: 6, angle: Math.PI / 2, spread: 0.8, normal: true, size: 0.3 });
    }
    this.life -= dt;
    this.k = this.life > 0.12 ? approach(this.k, 1, dt * 14) : approach(this.k, 0, dt * 9);
    this.spike.scale.y = 2.7 * Math.max(0.02, this.k);
    if (this.life < 0.12) this.contact = false;
    if (this.life <= 0 && this.k <= 0.02) this.dead = true;
  }
}

export class BriarQueen extends Enemy {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 2.4;
    this.h = 3.0;
    this.maxHp = this.hp = 34;
    this.heavy = true;
    this.drop = 0;
    this.key = 'briar';
    this.title = 'The Briar Queen';
    this.sub = 'she drank the warmth and kept it';
    this.fallen = 'the roots let go';
    this.state = 'sleep';
    this.contact = false;
    this.hurtable = false;
    this.t = 0;
    this.k = 0.32; // how far she has risen out of the ground
    this.step = 0;
    this.rig = new THREE.Group();
    this.body = this.part('briar', 4.8, 4.8, { anchor: 'b', sway: 0.05 });
    this.gl = glow(PINK, 6.5, 0.05);
    this.gl.position.set(0, 1.6, 0.02);
    this.rig.add(this.body, this.gl);
    this.root.add(this.rig);
    this.root.position.z = 0.2;
    this.sync();
  }
  get phase2() {
    return this.hp <= this.maxHp * 0.5;
  }
  wake() {
    if (this.state !== 'sleep') return;
    this.state = 'wake';
    this.t = 1.5;
    audio.sfx('roar');
    this.g.fx.shake(0.4, 1.0);
  }
  die() {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.t = 2.6;
    this.contact = false;
    this.hurtable = false;
    audio.sfx('roar');
    this.g.fx.freeze(0.3);
    this.g.onBossDying(this);
  }
  next() {
    const seq = ['erupt', 'volley', 'burrow', 'erupt', 'volley', 'erupt', 'burrow', 'volley'];
    const a = seq[this.step++ % seq.length];
    this.state = a + 'Wind';
    this.t = (a === 'burrow' ? 0.55 : 0.65) * (this.phase2 ? 0.8 : 1);
    audio.sfx(a === 'volley' ? 'windup' : 'gate');
  }
  update(dt) {
    this.tick(dt);
    const g = this.g;
    const p = g.player;
    const fx = g.fx;
    const A = g.arena;
    this.t -= dt;
    let k = 1;
    let swell = 0;
    let glowA = this.phase2 ? 0.4 + Math.sin(g.time * 9) * 0.1 : 0.22;
    switch (this.state) {
      case 'sleep':
        k = 0.32;
        glowA = 0.05;
        break;
      case 'wake':
        glowA = 0.7;
        if (Math.random() < dt * 30) fx.burst(this.x + rnd(-2, 2), this.y + rnd(0, 3), 2, { color: PINK, speed: 5 });
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = 0.6;
          this.contact = true;
          this.hurtable = true;
        }
        break;
      case 'idle':
        if (this.t <= 0 && !p.dead) this.next();
        break;
      case 'eruptWind':
        this.rig.position.x = Math.sin(g.time * 70) * 0.06;
        swell = -0.12;
        glowA = 0.6;
        if (this.t <= 0) {
          const n = this.phase2 ? 4 : 3;
          for (let i = -n; i <= n; i++) {
            const x = clamp(p.x + i * 2.0, A.x0 + 0.5, A.x1 - 0.5);
            if (Math.abs(x - this.x) > 1.6) g.spawn(new ThornSpike(g, x, this.y, 0.5 + Math.abs(i) * 0.13));
          }
          this.state = 'recover';
          this.t = 1.25;
        }
        break;
      case 'volleyWind':
        swell = 0.2 * (1 - this.t / 0.65);
        glowA = 0.8;
        if (this.t <= 0) {
          const n = this.phase2 ? 7 : 5;
          const gv = 20;
          for (let i = 0; i < n; i++) {
            const tx = p.x + (i - (n - 1) / 2) * 2.3;
            const T2 = 0.95 + Math.abs(i - (n - 1) / 2) * 0.09;
            const sy = this.y + 3.7;
            g.spawn(new Seed(g, this.x, sy, (tx - this.x) / T2, (p.y + 0.3 - sy) / T2 + 0.5 * gv * T2, gv));
          }
          audio.sfx('spit');
          fx.burst(this.x, this.y + 3.8, 20, { color: '#ff9ae0', speed: 8, angle: Math.PI / 2, spread: 1 });
          this.squish = 1;
          this.state = 'recover';
          this.t = 1.5;
        }
        break;
      case 'burrowWind':
        k = 0.6;
        if (this.t <= 0) {
          this.state = 'burrow';
          this.t = 0.4;
          this.contact = false;
          this.hurtable = false;
          fx.dust(this.x, this.y, 16);
        }
        break;
      case 'burrow':
        k = 0;
        if (this.t <= 0) {
          const spots = [A.x0 + 4.5, (A.x0 + A.x1) / 2, A.x1 - 4.5].filter((s) => Math.abs(s - this.x) > 5 && Math.abs(s - p.x) > 2.5);
          this.x = spots.length ? spots[Math.floor(Math.random() * spots.length)] : (A.x0 + A.x1) / 2;
          this.state = 'tunnel';
          this.t = 0.8;
          g.spawn(new ThornSpike(g, this.x - 1.9, this.y, 0.8));
          g.spawn(new ThornSpike(g, this.x + 1.9, this.y, 0.8));
        }
        break;
      case 'tunnel':
        k = 0;
        if (Math.random() < dt * 50) fx.dust(this.x + rnd(-1.2, 1.2), this.y, 1);
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = this.phase2 ? 0.5 : 0.8;
          this.contact = true;
          this.hurtable = true;
          audio.sfx('slam');
          fx.shake(0.4, 0.3);
          fx.burst(this.x, this.y + 0.3, 24, { color: '#2a3a30', speed: 9, angle: Math.PI / 2, spread: 1.2, normal: true, size: 0.4 });
        }
        break;
      case 'recover':
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = this.phase2 ? rnd(0.2, 0.5) : rnd(0.5, 0.9);
        }
        break;
      case 'dying':
        k = 0.5 + 0.5 * (this.t / 2.6);
        glowA = 1;
        dyingFx(this, dt, [PINK, '#7dffd0'], 2);
        if (this.t <= 0) finalBlast(this, 2, '#ffb0ea');
        break;
    }
    if (this.state !== 'eruptWind' && this.state !== 'dying') this.rig.position.x = 0;
    this.k = damp(this.k, k, this.state === 'tunnel' || this.state === 'idle' ? 14 : 9, dt);
    this.squish = Math.max(0, (this.squish || 0) - dt * 3);
    const breathe = 1 + Math.sin(g.time * 2.2) * 0.02 + swell - this.squish * 0.15;
    this.body.scale.set(4.8 * (2 - breathe), 4.8 * breathe * Math.max(0.02, this.k), 1);
    this.body.visible = this.k > 0.03;
    this.h = 3.0 * this.k;
    this.gl.material.uniforms.uAlpha.value = damp(this.gl.material.uniforms.uAlpha.value, glowA * this.k, 8, dt);
    this.sync();
  }
}

// ───────────────────────── the Bellows ─────────────────────────
export class Bellows extends Enemy {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 2.5;
    this.h = 2.5;
    this.maxHp = this.hp = 40;
    this.heavy = true;
    this.drop = 0;
    this.key = 'bellows';
    this.title = 'The Bellows';
    this.sub = 'it breathes so the slag never sleeps';
    this.fallen = 'the forge exhales';
    this.floor = y;
    this.hover = y + 7.2;
    this.state = 'sleep';
    this.contact = false;
    this.t = 0;
    this.step = 0;
    this.rig = new THREE.Group();
    this.rig.position.y = 1.25;
    this.wingL = new THREE.Group();
    this.wingR = new THREE.Group();
    this.wingL.position.set(-1.0, 0.1, -0.01);
    this.wingR.position.set(1.0, 0.1, -0.01);
    const wl = this.part('bellowsWing', -2.9, 2.2);
    wl.position.x = -1.35;
    const wr = this.part('bellowsWing', 2.9, 2.2);
    wr.position.x = 1.35;
    this.wingL.add(wl);
    this.wingR.add(wr);
    this.body = this.part('bellowsBody', 3.5, 3.5);
    this.gl = glow(HOT, 8, 0.05);
    this.gl.position.z = 0.02;
    this.rig.add(this.wingL, this.wingR, this.body, this.gl);
    this.root.add(this.rig);
    this.flap = 0;
    this.sync();
  }
  get phase2() {
    return this.hp <= this.maxHp * 0.5;
  }
  wake() {
    if (this.state !== 'sleep') return;
    this.state = 'wake';
    this.t = 1.6;
    this.contact = true;
    audio.sfx('roar');
    this.g.fx.shake(0.45, 1.1);
  }
  die() {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.t = 2.8;
    this.contact = false;
    this.hurtable = false;
    audio.sfx('roar');
    this.g.fx.freeze(0.3);
    this.g.onBossDying(this);
  }
  next() {
    const seq = ['swoop', 'drip', 'ring', 'swoop', 'ring', 'drip'];
    const a = seq[this.step++ % seq.length];
    this.state = a + 'Wind';
    this.t = (a === 'ring' ? 0.75 : 0.6) * (this.phase2 ? 0.8 : 1);
    audio.sfx(a === 'ring' ? 'roar' : 'windup');
  }
  tire() {
    this.state = 'tired';
    this.t = this.phase2 ? 1.5 : 1.9;
  }
  update(dt) {
    this.tick(dt);
    const g = this.g;
    const p = g.player;
    const fx = g.fx;
    const A = g.arena;
    this.t -= dt;
    let tx = this.x;
    let ty = this.y;
    let rate = 3;
    let flapSpeed = 7;
    let droop = 0;
    let glowA = this.phase2 ? 0.45 + Math.sin(g.time * 9) * 0.1 : 0.25;
    switch (this.state) {
      case 'sleep':
        ty = this.floor + 0.1;
        flapSpeed = 0;
        droop = 0.9;
        glowA = 0.05;
        break;
      case 'wake':
        ty = this.hover;
        flapSpeed = 14;
        glowA = 0.8;
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = 0.7;
        }
        break;
      case 'idle':
        tx = clamp(p.x + (this.x > p.x ? 4.5 : -4.5), A.x0 + 2, A.x1 - 2);
        ty = this.hover + Math.sin(g.time * 1.7) * 0.5;
        if (this.t <= 0 && !p.dead) this.next();
        break;
      case 'swoopWind':
        ty = this.hover + 1.2;
        flapSpeed = 16;
        glowA = 0.7;
        if (this.t <= 0) {
          this.state = 'swoop';
          this.T = this.phase2 ? 0.95 : 1.15;
          this.t = this.T;
          this.sx = this.x;
          this.sy = this.y;
          const dir = p.x > this.x ? 1 : -1;
          this.ex = clamp(p.x + dir * 7, A.x0 + 2, A.x1 - 2);
          this.py = Math.max(this.floor + 0.3, p.y - 0.2);
          audio.sfx('dash');
        }
        break;
      case 'swoop': {
        const u = clamp(1 - this.t / this.T, 0, 1);
        this.x = lerp(this.sx, this.ex, smooth(u));
        this.y = this.sy - (this.sy - this.py) * Math.sin(Math.PI * u);
        tx = this.x;
        ty = this.y;
        flapSpeed = 3;
        droop = -0.5;
        fx.trail(this.x + rnd(-1, 1), this.y + 1.2 + rnd(-1, 1), HOT, 0.6, 0.4, 0.7);
        if (this.t <= 0) this.tire();
        break;
      }
      case 'dripWind':
        tx = this.x < (A.x0 + A.x1) / 2 ? A.x0 + 2.5 : A.x1 - 2.5;
        ty = this.hover + 0.8;
        rate = 5;
        if (this.t <= 0) {
          this.state = 'drip';
          this.t = this.phase2 ? 2.3 : 2.8;
          this.dripDir = this.x < (A.x0 + A.x1) / 2 ? 1 : -1;
          this.dropT = 0;
        }
        break;
      case 'drip':
        this.x = clamp(this.x + this.dripDir * ((A.x1 - A.x0 - 5) / (this.phase2 ? 2.3 : 2.8)) * dt, A.x0 + 2, A.x1 - 2);
        tx = this.x;
        ty = this.hover + 0.8;
        flapSpeed = 12;
        this.dropT -= dt;
        if (this.dropT <= 0) {
          this.dropT = this.phase2 ? 0.2 : 0.27;
          g.spawn(new Drop(g, this.x + rnd(-0.6, 0.6), this.y + 0.2, 0, -2, 24));
          audio.sfx('spit');
        }
        if (this.t <= 0) this.tire();
        break;
      case 'ringWind':
        tx = clamp(this.x, A.x0 + 6, A.x1 - 6);
        ty = this.hover - 1.5;
        flapSpeed = 18;
        glowA = 1;
        fx.gather(this.x, this.y + 1.25, HOT, 2, 4);
        if (this.t <= 0) {
          this.rings = this.phase2 ? 2 : 1;
          this.state = 'ring';
          this.t = 0;
        }
        break;
      case 'ring':
        if (this.t <= 0) {
          const n = this.phase2 ? 12 : 10;
          const off = this.rings % 2 ? 0 : Math.PI / n;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + off;
            const o = g.spawn(new Drop(g, this.x, this.y + 1.0, Math.cos(a) * 6.5, Math.sin(a) * 6.5, 0, 'orb'));
            o.life = 3.4;
          }
          audio.sfx('flare');
          fx.shake(0.3, 0.25);
          fx.ring(this.x, this.y + 1.25, HOT, 30, 9);
          this.rings--;
          this.t = 0.45;
          if (this.rings <= 0) this.tire();
        }
        break;
      case 'tired':
        ty = this.floor + 1.0;
        flapSpeed = 2.5;
        droop = 0.6;
        glowA = 0.12;
        rate = 4.5;
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = this.phase2 ? 0.5 : 0.9;
        }
        break;
      case 'dying':
        ty = this.floor + 0.2;
        rate = 2;
        flapSpeed = 0;
        droop = 0.9;
        glowA = 1;
        dyingFx(this, dt, [HOT, '#ffd98a'], 1.3);
        if (this.t <= 0) finalBlast(this, 1.3, '#ffc070');
        break;
    }
    if (this.state !== 'swoop' && this.state !== 'drip') {
      this.x = damp(this.x, tx, rate, dt);
      this.y = damp(this.y, ty, rate, dt);
    }
    if (this.state !== 'dying') this.rig.position.x = 0;
    this.flap += dt * flapSpeed;
    const f = Math.sin(this.flap) * 0.45;
    this.wingL.rotation.z = -f + droop * 0.9;
    this.wingR.rotation.z = f - droop * 0.9;
    this.rig.rotation.z = clamp((tx - this.x) * -0.03, -0.25, 0.25);
    this.body.position.y = Math.sin(this.flap) * 0.08;
    this.gl.material.uniforms.uAlpha.value = damp(this.gl.material.uniforms.uAlpha.value, glowA, 8, dt);
    this.sync();
  }
}

// ───────────────────────── the Cold Wick (final) ─────────────────────────
class ColdBolt extends Entity {
  constructor(g, x, y, dir) {
    super(g, x, y);
    this.w = 0.9;
    this.h = 0.6;
    this.dir = dir;
    this.life = 2.2;
    this.contact = true;
    this.hurtable = true;
    this.body = quad(sprite('coldflame'), 0.9, 1.8, { add: true, order: ORDER.entity + 2 });
    this.body.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.body.position.y = 0.3;
    const gl = glow(COLD, 3.5, 0.35);
    gl.position.y = 0.3;
    this.root.add(gl, this.body);
    this.sync();
  }
  takeHit() {
    this.pop();
    audio.sfx('clink');
    return 0;
  }
  pop() {
    if (this.dead) return;
    this.dead = true;
    this.g.fx.burst(this.x, this.y + 0.3, 14, { color: COLD, speed: 7, life: 0.5 });
  }
  update(dt) {
    this.x += this.dir * 14 * dt;
    this.life -= dt;
    this.g.fx.trail(this.x - this.dir * 0.4, this.y + 0.3, COLD, 0.4, 0.3, 0.7);
    if (this.life <= 0 || this.g.world.solid(Math.floor(this.x + this.dir * 0.4), Math.floor(this.y + 0.3))) this.pop();
    this.sync();
  }
}

export class ColdWick extends Enemy {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 0.95;
    this.h = 1.95;
    this.maxHp = this.hp = 54;
    this.heavy = true;
    this.drop = 0;
    this.key = 'wick';
    this.final = true;
    this.title = 'The Cold Wick';
    this.sub = 'the light that chose to go out';
    this.fallen = '';
    this.state = 'sleep';
    this.contact = false;
    this.t = 0;
    this.dir = -1;
    this.stagger = 0;
    this.last = '';
    this.floor = y;
    const S = 1.5;
    this.rig = new THREE.Group();
    this.rig.scale.setScalar(S);
    const mk = (name, w, h, o = {}) => this.part(name, w, h, o);
    this.legL = mk('leg', 0.17, 0.32, { anchor: 't', tint: 0x8aa0c8 });
    this.legR = mk('leg', 0.17, 0.32, { anchor: 't', tint: 0x8aa0c8 });
    this.legL.position.set(-0.1, 0.3, 0);
    this.legR.position.set(0.12, 0.3, 0);
    this.cloak = mk('cloak', 0.92, 1.0, { anchor: 'b', tint: 0xb9ccf0 });
    this.cloak.position.set(0, 0.1, 0.01);
    this.flame = quad(sprite('coldflame'), 0.34, 0.5, { add: true, order: ORDER.entity });
    this.flame.position.set(0, 1.27, 0.02);
    this.head = mk('head', 0.8, 0.8, { tint: 0x9cc4ff });
    this.head.position.set(0, 1.26, 0.03);
    this.bladePivot = new THREE.Group();
    this.bladePivot.position.set(0.08, 0.74, 0.04);
    this.blade = mk('blade', 1.5, 0.36, { tint: 0xd8f0ff });
    this.blade.position.set(0.6, 0, 0);
    this.bladePivot.add(this.blade);
    this.rig.add(this.legL, this.legR, this.cloak, this.flame, this.head, this.bladePivot);
    this.halo = glow(COLD, 6, 0.06);
    this.halo.position.set(0, 1.8, -0.05);
    this.halo.renderOrder = ORDER.entity - 1;
    this.root.add(this.halo, this.rig);
    this.bladeA = -1.95;
    this.ph = 0;
    this.sync();
  }
  get phase2() {
    return this.hp <= this.maxHp * 0.5;
  }
  wake() {
    if (this.state !== 'sleep') return;
    this.state = 'wake';
    this.t = 1.5;
    this.contact = true;
    audio.sfx('roar');
    this.g.fx.shake(0.35, 0.9);
    this.g.fx.ring(this.x, this.y + 1.8, COLD, 40, 10);
  }
  onHit(dmg) {
    this.stagger += dmg;
    if (this.stagger >= 14 && !['dying', 'leap', 'hang', 'plunge', 'vanish'].includes(this.state)) {
      this.stagger = 0;
      this.state = 'stagger';
      this.t = 1.15;
      this.vx = -this.dir * 6;
      audio.sfx('slam');
      this.g.fx.ring(this.x, this.y + 1.2, COLD, 24, 9);
    }
  }
  die() {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.t = 3.0;
    this.contact = false;
    this.hurtable = false;
    this.vx = 0;
    audio.sfx('death');
    this.g.fx.freeze(0.4);
    this.g.onBossDying(this);
  }
  choose() {
    const p = this.g.player;
    const d = Math.abs(p.x - this.x);
    this.dir = p.x > this.x ? 1 : -1;
    const r = Math.random();
    let a;
    if (this.phase2 && r < 0.22) a = 'blink';
    else if (d < 3.4) a = r < 0.62 ? 'combo' : 'flare';
    else if (d < 9) a = r < 0.5 ? 'dash' : r < 0.8 ? 'plunge' : 'flare';
    else a = r < 0.4 ? 'flare' : r < 0.7 ? 'dash' : 'plunge';
    if (a === this.last) a = a === 'dash' ? 'plunge' : a === 'plunge' ? 'flare' : 'dash';
    // keep the whole move set in rotation
    this.since = this.since || { dash: 0, plunge: 0, flare: 0, combo: 0 };
    for (const k of Object.keys(this.since)) this.since[k]++;
    for (const k of Object.keys(this.since)) if (this.since[k] > 5) a = k;
    if (this.since[a] !== undefined) this.since[a] = 0;
    this.last = a;
    const q = this.phase2 ? 0.8 : 1;
    if (a === 'blink') {
      this.state = 'vanish';
      this.t = 0.28;
      this.contact = false;
      this.hurtable = false;
      this.g.fx.burst(this.x, this.y + 1.2, 30, { color: COLD, speed: 8, grav: 0 });
      audio.sfx('dash');
    } else {
      this.state = a + 'Wind';
      this.t = { dash: 0.42, plunge: 0.32, flare: 0.45, combo: 0.3 }[a] * q;
      audio.sfx('windup');
    }
  }
  slashAt(reach, hgt) {
    const p = this.g.player;
    const bx = this.dir > 0 ? this.x - 0.2 : this.x - reach + 0.2;
    if (overlap(bx, this.y, reach, hgt, p.x - p.w / 2, p.y, p.w, p.h)) p.hurt(1, this.x);
  }
  slashFx(w, h) {
    this.g.fx.sprite(sprite('slash'), { x: this.dir * 1.0, y: 1.3, w, h, rot: this.dir > 0 ? 0 : Math.PI, life: 0.18, grow: 0.15, tint: 0xbfe4ff, parent: this.root, z: 0.3, flipY: Math.random() < 0.5 });
    audio.sfx('slash');
  }
  update(dt) {
    this.tick(dt);
    const g = this.g;
    const p = g.player;
    const fx = g.fx;
    const A = g.arena;
    this.t -= dt;
    let blade = -1.95;
    let crouch = 0;
    let lean = 0;
    let flameK = 1;
    let glowA = this.phase2 ? 0.3 + Math.sin(g.time * 9) * 0.08 : 0.16;
    let grav = 60;
    let visible = true;
    switch (this.state) {
      case 'sleep':
        crouch = 0.5;
        flameK = 0.25;
        glowA = 0.03;
        blade = -2.6;
        break;
      case 'wake':
        crouch = Math.max(0, this.t - 0.8) * 0.6;
        flameK = 2.2;
        glowA = 0.6;
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = 0.5;
        }
        break;
      case 'idle':
        this.dir = p.x > this.x ? 1 : -1;
        this.vx = approach(this.vx, this.dir * (Math.abs(p.x - this.x) > 4 ? 3 : 0), 30 * dt);
        if (this.t <= 0 && !p.dead) this.choose();
        break;
      case 'dashWind':
        this.vx = approach(this.vx, 0, 60 * dt);
        crouch = 0.3;
        blade = -3.0;
        lean = 0.25;
        glowA = 0.5;
        if (this.t <= 0) {
          this.state = 'dash';
          this.t = 0.36;
          this.vx = this.dir * 27;
          this.slashFx(5.2, 4);
          audio.sfx('dash');
        }
        break;
      case 'dash':
        this.vx = this.dir * 27;
        this.vy = 0;
        grav = 0;
        lean = -0.4;
        blade = 0.2;
        this.slashAt(2.6, 1.9);
        if (Math.random() < 0.8) fx.sprite(sprite('cloak'), { x: this.x, y: this.y + 0.9, w: 1.38 * this.dir, h: 1.5, tint: 0x9fd0ff, alpha: 0.4, life: 0.2, grow: -0.2, z: 0.2 });
        if (this.t <= 0 || this.hitWall) {
          this.state = 'recover';
          this.t = this.phase2 ? 0.4 : 0.6;
          this.vx = this.dir * 4;
        }
        break;
      case 'plungeWind':
        this.vx = approach(this.vx, 0, 60 * dt);
        crouch = 0.4;
        if (this.t <= 0) {
          this.state = 'leap';
          this.vy = 25;
          this.vx = clamp((p.x + p.vx * 0.25 - this.x) / 0.42, -15, 15);
          this.onGround = false;
          audio.sfx('jump');
          fx.dust(this.x, this.y, 8);
        }
        break;
      case 'leap':
        blade = 2.6;
        if (this.vy <= 0) {
          this.state = 'hang';
          this.t = 0.2;
        }
        break;
      case 'hang':
        this.vx = 0;
        this.vy = 0;
        grav = 0;
        blade = 2.9;
        glowA = 0.7;
        if (this.t <= 0) {
          this.state = 'plunge';
          this.vy = -36;
        }
        break;
      case 'plunge':
        this.vy = -36;
        grav = 0;
        blade = -1.57;
        fx.trail(this.x, this.y + 1.5, COLD, 0.6, 0.3, 0.7);
        if (this.onGround) {
          audio.sfx('slam');
          fx.shake(0.6, 0.35);
          fx.freeze(0.05);
          fx.dust(this.x, this.y, 16);
          fx.burst(this.x, this.y + 0.3, 24, { color: COLD, speed: 11, angle: Math.PI / 2, spread: 1.4 });
          g.spawn(new Shockwave(g, this.x + 1.2, this.y, 1));
          g.spawn(new Shockwave(g, this.x - 1.2, this.y, -1));
          this.state = 'recover';
          this.t = this.phase2 ? 0.7 : 0.95;
        }
        break;
      case 'flareWind':
        this.vx = approach(this.vx, -this.dir * 3, 40 * dt);
        blade = 1.2;
        flameK = 1.8;
        glowA = 0.7;
        fx.gather(this.x + this.dir * 0.8, this.y + 1.3, COLD, 1, 1.6);
        if (this.t <= 0) {
          this.state = 'flare';
          this.bolts = this.phase2 ? 3 : 1;
          this.t = 0;
        }
        break;
      case 'flare':
        this.vx = approach(this.vx, 0, 40 * dt);
        blade = 0;
        if (this.t <= 0) {
          // alternate low and chest-high so they can be jumped or ducked under
          const hy = this.bolts % 2 ? 0.25 : 1.9;
          g.spawn(new ColdBolt(g, this.x + this.dir * 0.8, this.y + hy, this.dir));
          audio.sfx('flare');
          this.bolts--;
          this.t = 0.34;
          if (this.bolts <= 0) {
            this.state = 'recover';
            this.t = 0.55;
          }
        }
        break;
      case 'comboWind':
        this.vx = approach(this.vx, 0, 60 * dt);
        blade = 1.7;
        lean = 0.15;
        if (this.t <= 0) {
          this.state = 'slash1';
          this.t = 0.18;
          this.vx = this.dir * 8;
          this.slashFx(4.4, 3.6);
        }
        break;
      case 'slash1':
      case 'slash2': {
        const k = 1 - clamp(this.t / 0.18, 0, 1);
        blade = this.state === 'slash1' ? lerp(1.7, -1.2, k) : lerp(-1.4, 1.6, k);
        lean = -0.2;
        this.slashAt(2.9, 2.2);
        if (this.t <= 0) {
          if (this.state === 'slash1') {
            this.state = 'slashGap';
            this.t = 0.2;
          } else {
            this.state = 'recover';
            this.t = this.phase2 ? 0.5 : 0.7;
          }
        }
        break;
      }
      case 'slashGap':
        this.vx = approach(this.vx, 0, 50 * dt);
        blade = -1.4;
        if (this.t <= 0) {
          this.dir = p.x > this.x ? 1 : -1;
          this.state = 'slash2';
          this.t = 0.18;
          this.vx = this.dir * 10;
          this.slashFx(4.8, 3.8);
        }
        break;
      case 'vanish':
        visible = false;
        this.vx = 0;
        if (this.t <= 0) {
          this.x = clamp(p.x - p.facing * 2.4, A.x0 + 1, A.x1 - 1);
          this.y = this.floor;
          this.vy = 0;
          this.dir = p.x > this.x ? 1 : -1;
          this.contact = true;
          this.hurtable = true;
          fx.burst(this.x, this.y + 1.2, 30, { color: COLD, speed: 8, grav: 0 });
          this.state = 'comboWind';
          this.t = 0.3;
          audio.sfx('windup');
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 50 * dt);
        crouch = 0.15;
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = this.phase2 ? rnd(0.15, 0.4) : rnd(0.35, 0.75);
        }
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 30 * dt);
        crouch = 0.5;
        flameK = 0.5;
        glowA = 0.05;
        blade = -2.7;
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = 0.25;
        }
        break;
      case 'dying':
        crouch = 0.5;
        flameK = Math.max(0.05, this.t / 3) * (1 + Math.sin(g.time * 50) * 0.4);
        glowA = 0.8;
        blade = -2.7;
        dyingFx(this, dt, [COLD, '#ffb060'], 1.4);
        if (this.t <= 0) finalBlast(this, 1.4, '#ffd9a0');
        break;
    }
    this.vy -= grav * dt;
    g.world.move(this, dt);
    this.x = clamp(this.x, A.x0 + 0.5, A.x1 - 0.5);

    // pose
    this.ph += Math.abs(this.vx) * dt * 0.42;
    const face = this.dir;
    const running = this.onGround && Math.abs(this.vx) > 1 && this.state === 'idle';
    this.rig.visible = visible;
    this.halo.visible = visible;
    this.rig.scale.set(1.5 * face, 1.5 * (1 - crouch * 0.3), 1);
    if (this.state !== 'dying') this.rig.position.x = 0;
    this.rig.rotation.z = damp(this.rig.rotation.z, lean * face, 18, dt);
    this.legL.rotation.z = running ? Math.sin(this.ph * Math.PI) * 0.9 : 0;
    this.legR.rotation.z = running ? -Math.sin(this.ph * Math.PI) * 0.9 : 0;
    const fl = 1 + Math.sin(g.time * 17) * 0.08 + Math.sin(g.time * 31.7) * 0.06;
    this.flame.scale.set(0.34 * (2 - fl) * flameK, 0.5 * fl * flameK, 1);
    this.bladeA = damp(this.bladeA, blade, ['dash', 'slash1', 'slash2', 'plunge'].includes(this.state) ? 60 : 14, dt);
    this.bladePivot.rotation.z = this.bladeA;
    this.halo.material.uniforms.uAlpha.value = damp(this.halo.material.uniforms.uAlpha.value, glowA, 8, dt);
    this.sync();
  }
}

export const BOSS_KINDS = { warden: Warden, briar: BriarQueen, bellows: Bellows, wick: ColdWick };
