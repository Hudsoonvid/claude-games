// Creatures, projectiles, pickups and interactive props.
import * as THREE from 'three';
import { audio } from './audio.js';
import { quad, glow, rayTex } from './art.js';
import { sprite } from './sprites.js';
import { ORDER } from './world.js';
import { T } from './rooms.js';
import { approach, clamp, damp, lerp, overlap } from './util.js';

const COLD = '#bfe4ff';
const rnd = (a, b) => a + Math.random() * (b - a);

export class Entity {
  constructor(g, x, y) {
    this.g = g;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.w = 1;
    this.h = 1;
    this.dead = false;
    this.root = new THREE.Group();
    this.root.position.set(x, y, 0.25);
    this.flash = { value: 0 };
    this.flashT = 0;
  }
  part(name, w, h, o = {}) {
    return quad(sprite(name), w, h, { flash: this.flash, order: ORDER.entity, ...o });
  }
  get box() {
    return { x: this.x - this.w / 2, y: this.y, w: this.w, h: this.h };
  }
  touches(p) {
    const b = this.box;
    return overlap(b.x, b.y, b.w, b.h, p.x - p.w / 2, p.y, p.w, p.h);
  }
  sync() {
    this.root.position.x = this.x;
    this.root.position.y = this.y;
  }
  update() {}
  dispose() {
    this.root.traverse((o) => o.material && o.material.dispose && o.material.dispose());
  }
}

// ───────────────────────── enemies ─────────────────────────
class Enemy extends Entity {
  constructor(g, x, y) {
    super(g, x, y);
    this.hurtable = true;
    this.contact = true;
    this.hp = 2;
    this.drop = 3;
    this.knockT = 0;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.heavy = false;
  }
  takeHit(dmg, kx, ky) {
    if (this.dead) return 0;
    this.hp -= dmg;
    this.flashT = 0.12;
    const fx = this.g.fx;
    const cx = this.x;
    const cy = this.y + this.h * 0.5;
    audio.sfx('hit');
    fx.burst(cx, cy, 10, { color: COLD, speed: 9, angle: Math.atan2(ky, kx || 0.001), spread: 0.9, life: 0.5 });
    fx.sprite(sprite('slash'), { x: cx, y: cy, w: 1.6, h: 0.5, rot: rnd(0, 3.1), life: 0.12, grow: 1.2, tint: 0xffffff });
    if (!this.heavy) {
      this.knockT = 0.18;
      this.vx = kx * 9;
      if (ky) this.vy = ky * 6;
    }
    this.onHit && this.onHit(dmg);
    if (this.hp <= 0) this.die();
    return 1;
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    const fx = this.g.fx;
    const cx = this.x;
    const cy = this.y + this.h * 0.5;
    audio.sfx('kill');
    fx.shake(0.22, 0.2);
    fx.freeze(0.08);
    fx.ring(cx, cy, COLD, 20, 8);
    fx.burst(cx, cy, 26, { color: COLD, speed: 10, life: 0.9 });
    fx.burst(cx, cy, 14, { color: '#1a1420', speed: 6, normal: true, size: 0.5, alpha: 0.8, life: 0.8 });
    for (let i = 0; i < this.drop; i++) this.g.spawn(new Glint(this.g, cx, cy));
  }
  tick(dt) {
    this.flashT -= dt;
    this.flash.value = this.flashT > 0 ? 1 : 0;
    this.knockT -= dt;
  }
}

export class Potling extends Enemy {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 0.9;
    this.h = 0.85;
    this.hp = 2;
    this.rig = new THREE.Group();
    this.legA = this.part('stub', 0.24, 0.3, { anchor: 't' });
    this.legB = this.part('stub', 0.24, 0.3, { anchor: 't' });
    this.legA.position.set(-0.22, 0.28, 0);
    this.legB.position.set(0.22, 0.28, 0);
    this.body = this.part('potling', 1.2, 1.2, { anchor: 'b' });
    this.body.position.y = 0.1;
    this.rig.add(this.legA, this.legB, this.body);
    const gl = glow(COLD, 2.6, 0.16);
    gl.position.set(0, 0.6, -0.02);
    gl.renderOrder = ORDER.entity - 1;
    this.root.add(gl, this.rig);
    this.ph = Math.random() * 6;
  }
  update(dt) {
    this.tick(dt);
    const w = this.g.world;
    if (this.knockT <= 0) this.vx = this.dir * 1.7;
    this.vy -= 50 * dt;
    w.move(this, dt);
    if (this.knockT <= 0 && this.onGround) {
      if (this.hitWall) this.dir = -this.hitWall;
      else if (!w.groundBelow(this.x + this.dir * 0.65, this.y) || w.tile(Math.floor(this.x + this.dir * 0.8), Math.floor(this.y + 0.2)) === T.THORN) this.dir = -this.dir;
    }
    this.ph += dt * 9;
    this.rig.scale.x = this.dir;
    this.body.rotation.z = Math.sin(this.ph) * 0.08;
    this.body.position.y = 0.1 + Math.abs(Math.sin(this.ph)) * 0.05;
    this.legA.rotation.z = Math.sin(this.ph) * 0.6;
    this.legB.rotation.z = -Math.sin(this.ph) * 0.6;
    this.sync();
  }
}

export class Wisp extends Enemy {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 0.8;
    this.h = 0.9;
    this.hp = 2;
    this.home = { x, y };
    this.body = this.part('wisp', 1.15, 1.72, { sway: 0.07, hang: true });
    this.body.position.y = 0.3;
    this.gl = glow(COLD, 3.4, 0.28);
    this.gl.position.set(0, 0.5, -0.02);
    this.gl.renderOrder = ORDER.entity - 1;
    this.root.add(this.gl, this.body);
    this.ph = Math.random() * 6;
    this.aggro = false;
  }
  update(dt) {
    this.tick(dt);
    const p = this.g.player;
    const dx = p.x - this.x;
    const dy = p.y + 0.6 - (this.y + 0.45);
    const d = Math.hypot(dx, dy);
    if (!this.aggro && d < 8.5 && !p.dead) this.aggro = true;
    if (this.aggro && (d > 14 || p.dead)) this.aggro = false;
    this.ph += dt;
    let tx;
    let ty;
    if (this.aggro) {
      tx = (dx / (d || 1)) * 4.3;
      ty = (dy / (d || 1)) * 4.3;
    } else {
      const hx = this.home.x - this.x;
      const hy = this.home.y + Math.sin(this.ph * 1.4) * 0.5 - this.y;
      tx = clamp(hx * 1.5, -2, 2);
      ty = clamp(hy * 1.5, -2, 2);
    }
    if (this.knockT <= 0) {
      this.vx = approach(this.vx, tx, 11 * dt);
      this.vy = approach(this.vy, ty, 11 * dt);
    } else {
      this.vx *= Math.exp(-4 * dt);
      this.vy *= Math.exp(-4 * dt);
    }
    this.g.world.move(this, dt);
    if (this.hitWall) this.vx = -this.hitWall * 1.5;
    if (Math.abs(this.vx) > 0.3) this.dir = this.vx > 0 ? 1 : -1;
    this.body.scale.x = 1.15 * this.dir;
    this.body.rotation.z = clamp(-this.vx * 0.06, -0.3, 0.3);
    this.body.position.y = 0.3 + Math.sin(this.ph * 3) * 0.06;
    this.gl.material.uniforms.uAlpha.value = 0.24 + Math.sin(this.ph * 5) * 0.05 + (this.aggro ? 0.12 : 0);
    if (Math.random() < dt * 8) this.g.fx.trail(this.x + rnd(-0.3, 0.3), this.y, COLD, 0.18, 0.7, 0.5);
    this.sync();
  }
}

export class Spitter extends Enemy {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 1.0;
    this.h = 1.1;
    this.hp = 3;
    this.drop = 4;
    this.heavy = true;
    this.body = this.part('spitter', 1.5, 1.5, { anchor: 'b' });
    this.gl = glow('#ff7ad9', 2.6, 0.2);
    this.gl.position.set(0, 0.9, -0.02);
    this.root.add(this.gl, this.body);
    this.t = rnd(0.5, 2);
    this.tele = 0;
  }
  update(dt) {
    this.tick(dt);
    const p = this.g.player;
    const dx = p.x - this.x;
    const dy = p.y + 0.6 - (this.y + 1.1);
    const near = Math.hypot(dx, dy) < 12 && !p.dead;
    let s = 1 + Math.sin(this.g.time * 2.4) * 0.03;
    if (this.tele > 0) {
      this.tele -= dt;
      s = 1 + (0.5 - this.tele) * 0.5;
      if (this.tele <= 0) {
        const T2 = clamp(Math.hypot(dx, dy) / 9, 0.55, 1.3);
        const gv = 14;
        this.g.spawn(new Seed(this.g, this.x, this.y + 1.15, dx / T2, dy / T2 + 0.5 * gv * T2, gv));
        audio.sfx('spit');
        this.g.fx.burst(this.x, this.y + 1.2, 8, { color: '#ff9ae0', speed: 5, angle: Math.PI / 2, spread: 0.8 });
        this.t = 2.3;
        this.squish = 1;
      }
    } else if (near) {
      this.t -= dt;
      if (this.t <= 0) this.tele = 0.5;
    }
    this.squish = Math.max(0, (this.squish || 0) - dt * 4);
    this.body.scale.set(1.5 * (2 - s) * (1 + this.squish * 0.2), 1.5 * s * (1 - this.squish * 0.25), 1);
    this.gl.material.uniforms.uAlpha.value = 0.18 + (this.tele > 0 ? 0.5 : 0);
    this.sync();
  }
}

class Seed extends Entity {
  constructor(g, x, y, vx, vy, grav) {
    super(g, x, y);
    this.w = 0.4;
    this.h = 0.4;
    this.vx = vx;
    this.vy = vy;
    this.grav = grav;
    this.life = 4;
    this.hurtable = true;
    this.contact = true;
    this.body = quad(sprite('seed'), 0.6, 0.6, { order: ORDER.entity + 1 });
    this.body.position.y = 0.2;
    this.root.add(this.body);
  }
  takeHit(d, kx) {
    this.pop();
    audio.sfx('clink');
    return 0;
  }
  pop() {
    this.dead = true;
    this.g.fx.burst(this.x, this.y + 0.2, 10, { color: '#ff9ae0', speed: 5, life: 0.4 });
  }
  update(dt) {
    this.vy -= this.grav * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.body.rotation.z += dt * 9;
    if (Math.random() < dt * 30) this.g.fx.trail(this.x, this.y + 0.2, '#ff7ad9', 0.25, 0.3, 0.6);
    if (this.life <= 0 || this.g.world.solid(Math.floor(this.x), Math.floor(this.y + 0.2))) this.pop();
    this.sync();
  }
}

export class Brute extends Enemy {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 1.7;
    this.h = 1.6;
    this.hp = 6;
    this.drop = 9;
    this.heavy = true;
    this.state = 'patrol';
    this.t = 0;
    this.rig = new THREE.Group();
    this.legA = this.part('bruteLeg', 0.5, 0.55, { anchor: 't' });
    this.legB = this.part('bruteLeg', 0.5, 0.55, { anchor: 't' });
    this.legA.position.set(-0.55, 0.5, 0);
    this.legB.position.set(0.55, 0.5, 0);
    this.body = this.part('brute', 2.5, 2.2, { anchor: 'b' });
    this.body.position.y = 0.2;
    this.gl = glow(COLD, 3, 0.2);
    this.gl.position.set(0.6, 1.0, 0.01);
    this.rig.add(this.legA, this.legB, this.body, this.gl);
    this.root.add(this.rig);
    this.ph = 0;
  }
  edgeAhead() {
    const w = this.g.world;
    return !w.groundBelow(this.x + this.dir * 1.1, this.y) || w.tile(Math.floor(this.x + this.dir * 1.2), Math.floor(this.y + 0.2)) === T.THORN;
  }
  update(dt) {
    this.tick(dt);
    const w = this.g.world;
    const p = this.g.player;
    const fx = this.g.fx;
    this.t -= dt;
    let shakeX = 0;
    switch (this.state) {
      case 'patrol': {
        this.vx = this.dir * 1.3;
        const dx = p.x - this.x;
        if (!p.dead && Math.abs(dx) < 9 && Math.abs(p.y - this.y) < 2.2 && this.t <= 0) {
          this.dir = dx > 0 ? 1 : -1;
          this.state = 'windup';
          this.t = 0.6;
          this.vx = 0;
          audio.sfx('windup');
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        shakeX = Math.sin(this.g.time * 70) * 0.05;
        if (this.t <= 0) {
          this.state = 'charge';
          this.t = 1.25;
        }
        break;
      case 'charge':
        this.vx = this.dir * 12.5;
        if (Math.random() < dt * 40) fx.dust(this.x - this.dir * 0.8, this.y, 1, -this.dir);
        if (this.t <= 0) {
          this.state = 'recover';
          this.t = 0.7;
        }
        break;
      case 'stun':
      case 'recover':
        this.vx = approach(this.vx, 0, 40 * dt);
        if (this.t <= 0) {
          this.state = 'patrol';
          this.t = 0.6;
        }
        break;
    }
    if (this.onGround && this.state !== 'stun' && this.edgeAhead()) {
      if (this.state === 'charge') {
        this.state = 'recover';
        this.t = 0.7;
        this.vx = 0;
      } else if (this.state === 'patrol') this.dir = -this.dir;
      this.vx = 0;
    }
    this.vy -= 50 * dt;
    w.move(this, dt);
    if (this.hitWall) {
      if (this.state === 'charge') {
        this.state = 'stun';
        this.t = 1.0;
        this.vx = -this.dir * 3;
        this.vy = 5;
        audio.sfx('slam');
        fx.shake(0.35, 0.3);
        fx.burst(this.x + this.dir * 0.9, this.y + 0.8, 16, { color: '#8fa3d0', speed: 7, normal: true, size: 0.4, alpha: 0.7 });
      } else if (this.state === 'patrol') this.dir = -this.hitWall;
    }
    this.ph += dt * (this.state === 'charge' ? 26 : this.state === 'patrol' ? 6 : 0);
    this.rig.scale.x = this.dir;
    this.rig.position.x = shakeX;
    const lean = this.state === 'windup' ? 0.18 : this.state === 'charge' ? -0.16 : this.state === 'stun' ? 0.25 : 0;
    this.body.rotation.z = damp(this.body.rotation.z, lean, 12, dt);
    this.body.position.y = 0.2 + Math.abs(Math.sin(this.ph)) * 0.07;
    this.legA.rotation.z = Math.sin(this.ph) * 0.5;
    this.legB.rotation.z = -Math.sin(this.ph) * 0.5;
    this.gl.material.uniforms.uAlpha.value = this.state === 'windup' || this.state === 'charge' ? 0.6 : 0.18;
    this.sync();
  }
}

// ───────────────────────── the Cold Warden (boss) ─────────────────────────
export class Warden extends Enemy {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 2.7;
    this.h = 3.9;
    this.maxHp = this.hp = 46;
    this.heavy = true;
    this.drop = 0;
    this.state = 'sleep';
    this.t = 0;
    this.dir = -1;
    this.stagger = 0;
    this.contact = false;
    this.rig = new THREE.Group();
    this.armBack = new THREE.Group();
    this.armBack.position.set(-1.0, 3.25, 0);
    const ab = this.part('wardenArm', 1.5, 3.3, { anchor: 't', tint: 0x7f88aa });
    this.armBack.add(ab);
    this.body = this.part('wardenBody', 4.0, 4.3, { anchor: 'b' });
    this.head = this.part('wardenHead', 2.2, 2.05);
    this.head.position.set(0.3, 4.55, 0.02);
    this.armFront = new THREE.Group();
    this.armFront.position.set(1.05, 3.3, 0.03);
    this.armFront.add(this.part('wardenArm', 1.6, 3.5, { anchor: 't' }));
    this.gl = glow(COLD, 6, 0.0);
    this.gl.position.set(0, 2.4, 0.04);
    this.rig.add(this.armBack, this.body, this.head, this.armFront, this.gl);
    this.root.add(this.rig);
    this.armA = 0.1;
    this.armB = -0.1;
    this.squash = 0;
    this.leaps = 0;
    this.sync();
  }
  get phase2() {
    return this.hp <= this.maxHp * 0.5;
  }
  wake() {
    if (this.state !== 'sleep') return;
    this.state = 'wake';
    this.t = 1.7;
    this.contact = true;
    audio.sfx('roar');
    this.g.fx.shake(0.45, 1.2);
  }
  onHit(dmg) {
    this.stagger += dmg;
    if (this.stagger >= 13 && this.state !== 'dying' && this.state !== 'leap') {
      this.stagger = 0;
      this.state = 'stagger';
      this.t = 1.5;
      this.vx = 0;
      audio.sfx('slam');
      this.g.fx.shake(0.3, 0.3);
      this.g.fx.ring(this.x, this.y + 2.4, COLD, 30, 10);
    }
  }
  die() {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.t = 3.0;
    this.contact = false;
    this.hurtable = false;
    this.vx = 0;
    audio.sfx('roar');
    this.g.fx.freeze(0.35);
    this.g.onBossDying();
  }
  choose() {
    const p = this.g.player;
    const d = Math.abs(p.x - this.x);
    this.dir = p.x > this.x ? 1 : -1;
    const r = Math.random();
    let a;
    if (d < 5.5) a = r < 0.55 ? 'swipe' : r < 0.8 ? 'leap' : 'rain';
    else a = r < 0.5 ? 'leap' : r < 0.8 ? 'rain' : 'swipe';
    if (a === this.last && Math.random() < 0.6) a = a === 'leap' ? 'swipe' : 'leap';
    // never go too long without the ember rain, so every fight shows the full move set
    this.sinceRain = a === 'rain' ? 0 : (this.sinceRain || 0) + 1;
    if (this.sinceRain >= 4) {
      a = 'rain';
      this.sinceRain = 0;
    }
    this.last = a;
    this.state = a + 'Wind';
    this.t = a === 'leap' ? 0.5 : a === 'swipe' ? 0.6 : 0.8;
    if (this.phase2) this.t *= 0.75;
    if (a === 'rain') audio.sfx('roar');
    else audio.sfx('windup');
    this.leaps = a === 'leap' && this.phase2 ? 1 : 0;
  }
  update(dt) {
    this.tick(dt);
    const g = this.g;
    const p = g.player;
    const fx = g.fx;
    const w = g.world;
    this.t -= dt;
    let armA = 0.1 + Math.sin(g.time * 1.6) * 0.05;
    let armB = -0.1 - Math.sin(g.time * 1.6) * 0.05;
    let crouch = 0;
    let headTilt = 0;
    let glowA = this.phase2 ? 0.4 + Math.sin(g.time * 8) * 0.12 : 0.22;
    const GRAV = 50;
    switch (this.state) {
      case 'sleep':
        crouch = 0.25;
        headTilt = 0.35;
        glowA = 0.04;
        break;
      case 'wake':
        crouch = Math.max(0, this.t - 1) * 0.3;
        headTilt = -0.25;
        armA = 1.2;
        armB = -1.2;
        glowA = 0.7;
        if (Math.random() < dt * 30) fx.burst(this.x + rnd(-2, 2), this.y + rnd(1, 4), 2, { color: COLD, speed: 6 });
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = 0.6;
        }
        break;
      case 'idle':
        this.dir = p.x > this.x ? 1 : -1;
        this.vx = approach(this.vx, 0, 30 * dt);
        if (this.t <= 0 && !p.dead) this.choose();
        break;
      case 'leapWind':
        crouch = 0.3;
        armA = -0.6;
        armB = 0.6;
        if (this.t <= 0) {
          this.state = 'leap';
          const vy0 = 27;
          const T2 = (2 * vy0) / GRAV;
          this.vy = vy0;
          this.vx = clamp((p.x + p.vx * 0.3 - this.x) / T2, -13, 13);
          this.onGround = false;
          this.squash = -0.5;
          audio.sfx('dash');
          fx.dust(this.x, this.y, 12);
        }
        break;
      case 'leap':
        armA = 2.6;
        armB = -2.6;
        if (this.onGround && this.vy <= 0 && this.t < -0.2) {
          this.vx = 0;
          this.squash = 1;
          audio.sfx('slam');
          fx.shake(0.75, 0.45);
          fx.freeze(0.06);
          fx.dust(this.x, this.y, 20);
          fx.burst(this.x, this.y + 0.3, 30, { color: COLD, speed: 12, angle: Math.PI / 2, spread: 1.4 });
          g.spawn(new Shockwave(g, this.x + 1.6, this.y, 1));
          g.spawn(new Shockwave(g, this.x - 1.6, this.y, -1));
          if (this.leaps > 0) {
            this.leaps--;
            this.state = 'leapWind';
            this.t = 0.4;
          } else {
            this.state = 'recover';
            this.t = this.phase2 ? 0.6 : 0.85;
          }
        }
        break;
      case 'swipeWind':
        armA = 2.9;
        headTilt = -0.15;
        crouch = 0.12;
        glowA = 0.6;
        if (this.t <= 0) {
          this.state = 'swipe';
          this.t = 0.3;
          this.vx = this.dir * 11;
          this.swipeHit = false;
          audio.sfx('slash');
          audio.sfx('dash');
          fx.sprite(sprite('slash'), { x: this.dir * 2.4, y: 2.0, w: 6.4, h: 5.2, rot: this.dir > 0 ? 0 : Math.PI, life: 0.28, grow: 0.15, tint: 0xbfe4ff, parent: this.root, z: 0.3 });
        }
        break;
      case 'swipe': {
        const k = 1 - clamp(this.t / 0.3, 0, 1);
        armA = lerp(2.9, -1.5, k);
        armB = 0.8;
        const bx = this.dir > 0 ? this.x + 0.3 : this.x - 4.6;
        if (!this.swipeHit && overlap(bx, this.y, 4.3, 3.6, p.x - p.w / 2, p.y, p.w, p.h)) {
          if (p.hurt(1, this.x)) this.swipeHit = true;
        }
        if (this.t <= 0) {
          this.state = 'recover';
          this.t = this.phase2 ? 0.55 : 0.8;
        }
        break;
      }
      case 'rainWind':
        armA = 2.4;
        armB = -2.4;
        headTilt = -0.35;
        glowA = 0.9;
        if (Math.random() < dt * 40) fx.gather(this.x, this.y + 2.5, COLD, 1, 4);
        if (this.t <= 0) {
          const n = this.phase2 ? 9 : 6;
          for (let i = 0; i < n; i++) {
            const x = i === 0 ? p.x : clamp(p.x + rnd(-11, 11), 23.5, 55);
            g.spawn(new EmberFall(g, x, this.y, 0.55 + i * 0.16));
          }
          this.state = 'recover';
          this.t = 1.3;
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 50 * dt);
        crouch = 0.1;
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = this.phase2 ? rnd(0.25, 0.6) : rnd(0.5, 1.0);
        }
        break;
      case 'stagger':
        crouch = 0.35;
        headTilt = 0.4;
        armA = -0.3;
        armB = 0.3;
        glowA = 0.1;
        if (this.t <= 0) {
          this.state = 'idle';
          this.t = 0.3;
        }
        break;
      case 'dying':
        crouch = 0.3;
        headTilt = 0.4 + Math.sin(g.time * 40) * 0.05;
        glowA = 1;
        this.rig.position.x = Math.sin(g.time * 60) * 0.08;
        if (Math.random() < dt * 40) {
          const ex = this.x + rnd(-1.5, 1.5);
          const ey = this.y + rnd(0.5, 4.5);
          fx.burst(ex, ey, 10, { color: Math.random() < 0.5 ? COLD : '#ffb060', speed: 10, life: 0.8 });
          if (Math.random() < 0.3) {
            audio.sfx('hit');
            fx.shake(0.25, 0.15);
          }
        }
        if (this.t <= 0) {
          this.dead = true;
          audio.sfx('kill');
          audio.sfx('slam');
          fx.shake(1, 0.8);
          fx.ring(this.x, this.y + 2.4, '#ffd9a0', 60, 16);
          fx.burst(this.x, this.y + 2.4, 120, { color: '#ffc070', speed: 16, life: 1.8, grav: 3 });
          fx.burst(this.x, this.y + 2.4, 40, { color: '#1a1e30', speed: 9, normal: true, size: 0.9, alpha: 0.8, life: 1.5 });
          for (let i = 0; i < 40; i++) g.spawn(new Glint(g, this.x + rnd(-1, 1), this.y + rnd(1, 4)));
          g.onBossDead();
        }
        break;
    }
    this.vy -= GRAV * dt;
    w.move(this, dt);
    if (this.hitWall) this.vx = 0;

    // pose
    this.squash = damp(this.squash, 0, 8, dt);
    this.rig.scale.set(this.dir * (1 + this.squash * 0.18), 1 - crouch * 0.14 - this.squash * 0.16, 1);
    if (this.state !== 'dying') this.rig.position.x = 0;
    this.armA = damp(this.armA, armA, this.state === 'swipe' ? 60 : 12, dt);
    this.armB = damp(this.armB, armB, 12, dt);
    this.armFront.rotation.z = this.armA;
    this.armBack.rotation.z = this.armB;
    this.head.rotation.z = damp(this.head.rotation.z, -headTilt, 10, dt);
    this.head.position.y = 4.55 + Math.sin(g.time * 1.6) * 0.05 - crouch * 0.3;
    this.gl.material.uniforms.uAlpha.value = damp(this.gl.material.uniforms.uAlpha.value, glowA, 8, dt);
    this.sync();
  }
}

class Shockwave extends Entity {
  constructor(g, x, y, dir) {
    super(g, x, y);
    this.w = 0.9;
    this.h = 1.35;
    this.dir = dir;
    this.contact = true;
    this.life = 3;
    this.body = quad(sprite('shock'), 1.9 * dir, 2.2, { anchor: 'b', add: true, order: ORDER.entity + 2 });
    this.root.add(this.body);
  }
  update(dt) {
    this.x += this.dir * 12 * dt;
    this.life -= dt;
    const w = this.g.world;
    if (this.life <= 0 || w.solid(Math.floor(this.x + this.dir * 0.5), Math.floor(this.y + 0.5))) {
      this.dead = true;
      this.g.fx.burst(this.x, this.y + 0.6, 14, { color: COLD, speed: 7 });
    }
    this.body.scale.y = 2.2 * (0.9 + Math.sin(this.g.time * 40) * 0.1);
    this.g.fx.trail(this.x - this.dir * 0.5, this.y + rnd(0.1, 0.9), COLD, 0.4, 0.35, 0.7);
    this.sync();
  }
}

class EmberFall extends Entity {
  constructor(g, x, floorY, delay) {
    super(g, x, floorY);
    this.w = 0.7;
    this.h = 1.2;
    this.delay = delay;
    this.contact = false;
    let top = floorY;
    while (!g.world.solid(Math.floor(x), Math.floor(top)) && top < floorY + 30) top += 1;
    this.top = Math.floor(top);
    this.floor = floorY;
    this.ray = quad(rayTex(), 0.9, this.top - floorY, { anchor: 't', add: true, tint: COLD, alpha: 0.0, order: ORDER.entity - 2 });
    this.ray.position.set(0, this.top - floorY, 0);
    this.bolt = quad(sprite('coldflame'), 0.9, -1.6, { add: true, order: ORDER.entity + 2 });
    this.bolt.visible = false;
    this.root.add(this.ray, this.bolt);
    this.by = this.top;
    this.sync();
  }
  get box() {
    return { x: this.x - 0.35, y: this.by - 0.6, w: 0.7, h: 1.2 };
  }
  update(dt) {
    this.delay -= dt;
    if (this.delay > 0) {
      this.ray.material.uniforms.uAlpha.value = 0.25 + 0.2 * Math.sin(this.g.time * 30);
      return;
    }
    if (!this.contact) {
      this.contact = true;
      this.bolt.visible = true;
      this.ray.material.uniforms.uAlpha.value = 0.12;
      audio.sfx('spit');
    }
    this.by -= 21 * dt;
    this.bolt.position.y = this.by - this.floor;
    this.g.fx.trail(this.x, this.by + 0.4, COLD, 0.45, 0.3, 0.8);
    if (this.by <= this.floor + 0.3) {
      this.dead = true;
      this.g.fx.burst(this.x, this.floor + 0.2, 16, { color: COLD, speed: 8, angle: Math.PI / 2, spread: 1.3 });
      this.g.fx.shake(0.12, 0.12);
      audio.sfx('land');
    }
  }
}

// ───────────────────────── player projectile ─────────────────────────
export class Flare extends Entity {
  constructor(g, x, y, dir) {
    super(g, x, y);
    this.dir = dir;
    this.w = 0.9;
    this.h = 0.7;
    this.life = 1.1;
    this.hits = new Set();
    this.body = quad(sprite('flame'), 1.0, 1.9, { add: true, order: ORDER.fx });
    this.body.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.body.position.y = 0.35;
    this.gl = glow('#ffb060', 4.5, 0.4);
    this.gl.position.y = 0.35;
    this.root.add(this.gl, this.body);
  }
  update(dt) {
    const g = this.g;
    this.x += this.dir * 21 * dt;
    this.life -= dt;
    this.body.scale.x = 1.0 * (0.85 + Math.random() * 0.3);
    for (let i = 0; i < 2; i++) g.fx.trail(this.x - this.dir * rnd(0, 0.8), this.y + 0.35 + rnd(-0.2, 0.2), '#ff9a40', 0.5, 0.4, 0.8);
    const n = g.hitScan(this.box, 3, this.dir, 0, this.hits);
    const wall = g.world.solid(Math.floor(this.x + this.dir * 0.4), Math.floor(this.y + 0.35));
    if (n > 0 || wall || this.life <= 0) {
      this.dead = true;
      audio.sfx('flareHit');
      g.fx.shake(0.3, 0.25);
      g.fx.ring(this.x, this.y + 0.35, '#ffc070', 24, 9);
      g.fx.burst(this.x, this.y + 0.35, 30, { color: '#ffd090', speed: 11, life: 0.8 });
    }
    this.sync();
  }
}

// ───────────────────────── pickups & props ─────────────────────────
let glintCombo = 0;
let glintTimer = 0;
export class Glint extends Entity {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 0.3;
    this.h = 0.3;
    this.vx = rnd(-5, 5);
    this.vy = rnd(5, 11);
    this.t = 0;
    this.body = quad(sprite('glint'), 0.42, 0.42, { order: ORDER.entity + 3 });
    this.body.position.y = 0.15;
    this.root.add(this.body);
    this.ph = rnd(0, 6);
  }
  update(dt) {
    const p = this.g.player;
    this.t += dt;
    const dx = p.x - this.x;
    const dy = p.y + 0.6 - this.y;
    const d = Math.hypot(dx, dy);
    if (this.t > 0.45 && d < 3.2 && !p.dead) {
      const s = 16 + this.t * 6;
      this.x += (dx / d) * s * dt;
      this.y += (dy / d) * s * dt;
    } else {
      this.vy -= 40 * dt;
      this.g.world.move(this, dt);
      if (this.hitWall) this.vx = -this.vx * 0.5;
      if (this.onGround) {
        this.vx *= Math.exp(-6 * dt);
      }
    }
    if (d < 0.6 && this.t > 0.3 && !p.dead) {
      this.dead = true;
      p.glints++;
      if (performance.now() - glintTimer > 600) glintCombo = 0;
      glintTimer = performance.now();
      audio.sfx('glint', glintCombo++);
      this.g.fx.trail(this.x, this.y + 0.2, '#ffd08a', 0.5, 0.25, 1);
    }
    this.body.scale.x = 0.42 * Math.cos(this.t * 6 + this.ph);
    this.sync();
  }
}

export class Pot extends Entity {
  constructor(g, x, y) {
    super(g, x, y);
    this.w = 0.8;
    this.h = 0.95;
    this.hurtable = true;
    const s = rnd(0.85, 1.1);
    this.body = this.part('pot', 0.95 * s, 1.1 * s, { anchor: 'b' });
    this.root.add(this.body);
    this.root.position.z = 0.1;
  }
  takeHit() {
    this.dead = true;
    audio.sfx('pot');
    const fx = this.g.fx;
    fx.burst(this.x, this.y + 0.5, 14, { color: '#6b4a3c', speed: 8, normal: true, size: 0.3, alpha: 1, grav: 25, life: 0.9 });
    fx.dust(this.x, this.y + 0.3, 6);
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.g.spawn(new Glint(this.g, this.x, this.y + 0.5));
    return 0;
  }
}

export class Hearth extends Entity {
  constructor(g, x, y, lit) {
    super(g, x, y);
    this.interact = 'Rest';
    this.radius = 1.5;
    this.lit = lit;
    this.root.position.z = -0.1;
    this.body = quad(sprite('hearth'), 2.0, 1.5, { anchor: 'b', order: ORDER.back + 1 });
    this.flame = quad(sprite('flame'), 0.9, 1.5, { add: true, anchor: 'b', order: ORDER.back + 2 });
    this.flame.position.y = 0.85;
    this.gl = glow('#ffa040', 8, 0.3);
    this.gl.position.y = 1.5;
    this.gl.renderOrder = ORDER.back;
    this.root.add(this.gl, this.body, this.flame);
    this.light = g.world.addLight(x, y + 1.5, 7, '#ffa040', lit ? 1 : 0.15);
    this.k = lit ? 1 : 0;
  }
  use() {
    this.g.rest(this);
    if (!this.lit) {
      this.lit = true;
      this.g.fx.burst(this.x, this.y + 1.2, 40, { color: '#ffc070', speed: 9, angle: Math.PI / 2, spread: 0.9, grav: 3, life: 1.2 });
    }
  }
  update(dt) {
    const t = this.g.time;
    this.k = damp(this.k, this.lit ? 1 : 0, 3, dt);
    const fl = 1 + Math.sin(t * 15) * 0.1 + Math.sin(t * 27.3) * 0.07;
    this.flame.scale.set(0.9 * this.k * (2 - fl), 1.5 * this.k * fl, 1);
    this.gl.material.uniforms.uAlpha.value = (0.06 + 0.28 * this.k) * (0.9 + 0.1 * fl);
    this.light.intensity = 0.15 + 0.85 * this.k;
    if (this.lit && Math.random() < dt * 9) {
      this.g.fx.add.spawn({ x: this.x + rnd(-0.4, 0.4), y: this.y + 1.2, z: 0, vx: rnd(-0.3, 0.3), vy: rnd(1, 2.6), life: rnd(0.8, 1.8), size: rnd(0.06, 0.13), color: [1, 0.6, 0.25], alpha: 1, wobble: 0.8 });
    }
  }
}

export class Tablet extends Entity {
  constructor(g, x, y, text) {
    super(g, x, y);
    this.interact = 'Read';
    this.radius = 1.3;
    this.text = text;
    this.root.position.z = -0.1;
    this.body = quad(sprite('tablet'), 0.95, 1.35, { anchor: 'b', order: ORDER.back + 1 });
    this.gl = glow('#ffb060', 3, 0.14);
    this.gl.position.y = 0.8;
    this.root.add(this.gl, this.body);
  }
  use() {
    audio.sfx('tablet');
    this.g.hud.showLore(this.text);
  }
}

export class Shrine extends Entity {
  constructor(g, x, y, ability) {
    super(g, x, y);
    this.ability = ability;
    this.taken = g.player.abilities[ability];
    this.color = ability === 'dash' ? '#6ff5df' : '#d8b0ff';
    this.root.position.z = -0.1;
    this.base = quad(sprite('plinth'), 2.6, 1.1, { anchor: 'b', order: ORDER.back + 1 });
    this.orbG = new THREE.Group();
    this.orbG.position.y = 2.3;
    this.ringA = quad(sprite('ring'), 1.9, 1.9, { add: true, tint: this.color, order: ORDER.back + 2 });
    this.ringB = quad(sprite('ring'), 1.3, 1.3, { add: true, tint: this.color, order: ORDER.back + 2 });
    this.core = glow('#ffffff', 1.1, 1);
    this.halo = glow(this.color, 6, 0.4);
    this.orbG.add(this.halo, this.ringA, this.ringB, this.core);
    this.root.add(this.base, this.orbG);
    this.light = g.world.addLight(x, y + 2.3, 7, this.color, this.taken ? 0.1 : 1);
    this.orbG.visible = !this.taken;
  }
  update(dt) {
    if (this.taken) return;
    const t = this.g.time;
    this.orbG.position.y = 2.3 + Math.sin(t * 1.6) * 0.15;
    this.ringA.rotation.z = t * 0.6;
    this.ringB.rotation.z = -t * 1.1;
    this.ringA.scale.x = 1.9 * Math.cos(t * 0.8);
    if (Math.random() < dt * 14) this.g.fx.gather(this.x, this.y + 2.3, this.color, 1, 2.6);
    const p = this.g.player;
    if (Math.hypot(p.x - this.x, p.y + 0.7 - (this.y + 2.3)) < 2.0 && !p.dead) {
      this.taken = true;
      this.orbG.visible = false;
      this.light.intensity = 0.1;
      this.g.fx.ring(this.x, this.y + 2.3, this.color, 50, 14);
      this.g.fx.burst(this.x, this.y + 2.3, 70, { color: this.color, speed: 14, life: 1.6, grav: 0 });
      this.g.grantAbility(this.ability);
    }
  }
}

export class EmberShard extends Entity {
  constructor(g, x, y, key) {
    super(g, x, y);
    this.key = key;
    this.body = quad(sprite('ember'), 0.6, 0.85, { order: ORDER.entity });
    this.gl = glow('#ff9a3c', 4, 0.4);
    this.root.add(this.gl, this.body);
    this.light = g.world.addLight(x, y, 5, '#ff9a3c', 0.9);
  }
  update(dt) {
    const t = this.g.time;
    this.root.position.y = this.y + Math.sin(t * 2) * 0.15;
    this.body.rotation.z = Math.sin(t * 1.3) * 0.15;
    if (Math.random() < dt * 10) this.g.fx.trail(this.x + rnd(-0.3, 0.3), this.y + rnd(-0.3, 0.3), '#ffb060', 0.2, 0.8, 0.8);
    const p = this.g.player;
    if (Math.hypot(p.x - this.x, p.y + 0.7 - this.y) < 1.0 && !p.dead) {
      this.dead = true;
      this.light.intensity = 0;
      this.g.fx.ring(this.x, this.y, '#ffc070', 40, 12);
      this.g.collectEmber(this.key);
    }
  }
}

export class Gate extends Entity {
  constructor(g, x, y, hgt) {
    super(g, x, y);
    this.tx = Math.floor(x);
    this.ty = Math.floor(y);
    this.hgt = hgt;
    this.closed = false;
    this.k = 0;
    this.body = quad(sprite('gate'), 1.1, hgt + 0.3, { anchor: 'b', order: ORDER.decor + 1 });
    this.body.position.x = 0.5;
    this.root.add(this.body);
    this.root.position.z = 0.05;
    this.setVis();
  }
  set(closed) {
    if (closed === this.closed) return;
    this.closed = closed;
    audio.sfx('gate');
    this.g.fx.shake(0.25, 0.4);
    for (let i = 0; i < this.hgt; i++) this.g.world.setTile(this.tx, this.ty + i, closed ? T.SOLID : T.EMPTY);
    if (closed) this.g.fx.dust(this.tx + 0.5, this.ty, 12);
  }
  setVis() {
    this.body.position.y = -(1 - this.k) * (this.hgt + 0.6);
    this.body.visible = this.k > 0.01;
  }
  update(dt) {
    this.k = approach(this.k, this.closed ? 1 : 0, dt * 3.2);
    this.setVis();
  }
}

export const ENEMY_KINDS = { potling: Potling, wisp: Wisp, spitter: Spitter, brute: Brute };
