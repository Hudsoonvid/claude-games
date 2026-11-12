// The Wick: movement, combat and the procedurally animated puppet.
import * as THREE from 'three';
import { input } from './input.js';
import { audio } from './audio.js';
import { quad, glow } from './art.js';
import { sprite } from './sprites.js';
import { ORDER } from './world.js';
import { T } from './rooms.js';
import { approach, clamp, damp, lerp } from './util.js';

const RUN = 8.5;
const GRAV = 62;
const JUMP = 21.5;
const MAXFALL = -24;
const DASH_SPEED = 23;
const DASH_TIME = 0.17;
export const CINDER_MAX = 99;
export const CINDER_COST = 33;

export class Player {
  constructor(game) {
    this.g = game;
    this.w = 0.6;
    this.h = 1.3;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.maxHp = 5;
    this.hp = 5;
    this.cinder = 0;
    this.glints = 0;
    this.abilities = { dash: false, grip: false };
    this.dead = false;
    this.resetTimers();
    this.buildVisual();
  }

  resetTimers() {
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumpHeld = false;
    this.dashT = 0;
    this.dashCd = 0;
    this.airDash = true;
    this.atkT = 0;
    this.atkCd = 0;
    this.atkDir = 'side';
    this.atkHits = new Set();
    this.atkBounced = false;
    this.invuln = 0;
    this.knockT = 0;
    this.wallLock = 0;
    this.wallSlide = 0;
    this.wallCoyote = 0;
    this.wallDir = 0;
    this.focusT = 0;
    this.focusing = false;
    this.flareCd = 0;
    this.landT = 0;
    this.dropT = 0;
    this.dropThrough = false;
    this.safeT = 0;
    this.runPhase = 0;
    this.idleT = 0;
    this.frozen = false; // cutscenes / menus
    this.onGround = false;
    this.wasGround = false;
    this.ghostT = 0;
    this.pogoGrace = 0;
  }

  buildVisual() {
    const root = (this.root = new THREE.Group());
    const rig = (this.rig = new THREE.Group());
    root.add(rig);
    this.flash = { value: 0 };
    const mk = (name, w, h, o = {}) => quad(sprite(name), w, h, { flash: this.flash, order: ORDER.player, ...o });
    this.legL = mk('leg', 0.17, 0.32, { anchor: 't' });
    this.legR = mk('leg', 0.17, 0.32, { anchor: 't' });
    this.legL.position.set(-0.1, 0.3, 0);
    this.legR.position.set(0.12, 0.3, 0);
    this.cloak = mk('cloak', 0.92, 1.0, { anchor: 'b' });
    this.cloak.position.set(0, 0.1, 0.01);
    this.flame = quad(sprite('flame'), 0.34, 0.5, { add: true, order: ORDER.player });
    this.flame.position.set(0, 1.27, 0.02);
    this.head = mk('head', 0.8, 0.8);
    this.head.position.set(0, 1.26, 0.03);
    this.bladePivot = new THREE.Group();
    this.bladePivot.position.set(0.08, 0.74, 0.04);
    this.blade = mk('blade', 1.3, 0.32);
    this.blade.position.set(0.52, 0, 0);
    this.bladePivot.add(this.blade);
    rig.add(this.legL, this.legR, this.cloak, this.flame, this.head, this.bladePivot);
    this.halo = glow('#ffb060', 5.5, 0.2);
    this.halo.position.set(0, 1.2, -0.05);
    this.halo.renderOrder = ORDER.player - 2;
    root.add(this.halo);
    root.position.z = 0.5;

    // scarf ribbon (simulated in world space)
    const N = (this.scarfN = 11);
    this.scarf = [];
    for (let i = 0; i < N; i++) this.scarf.push({ x: 0, y: 0, px: 0, py: 0 });
    const geo = new THREE.BufferGeometry();
    this.scarfPos = new Float32Array(N * 2 * 3);
    const col = new Float32Array(N * 2 * 3);
    const c0 = new THREE.Color('#4ff0cf');
    const c1 = new THREE.Color('#0d5f72');
    const idx = [];
    for (let i = 0; i < N; i++) {
      const c = c0.clone().lerp(c1, i / (N - 1));
      for (let k = 0; k < 2; k++) col.set([c.r, c.g, c.b], (i * 2 + k) * 3);
      if (i < N - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.scarfPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    this.scarfMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false }));
    this.scarfMesh.frustumCulled = false;
    this.scarfMesh.renderOrder = ORDER.player - 1;
  }

  addTo(scene) {
    scene.add(this.scarfMesh, this.root);
  }

  place(x, y, facing = 1) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.safe = { x, y };
    for (const p of this.scarf) {
      p.x = p.px = x;
      p.y = p.py = y + 0.95;
    }
    this.syncVisual(0);
  }

  get cx() {
    return this.x;
  }
  get cy() {
    return this.y + this.h * 0.5;
  }

  touchingWall(dir) {
    const w = this.g.world;
    const tx = Math.floor(this.x + dir * (this.w / 2 + 0.06));
    return w.solid(tx, Math.floor(this.y + 0.35)) && w.solid(tx, Math.floor(this.y + 1.0));
  }

  gainCinder(n) {
    this.cinder = clamp(this.cinder + n, 0, CINDER_MAX);
  }

  update(dt) {
    const g = this.g;
    const world = g.world;
    const fx = g.fx;
    if (this.dead) {
      this.syncVisual(dt);
      return;
    }
    const ctl = !this.frozen;
    const ax = ctl ? input.axisX : 0;
    const ay = ctl ? input.axisY : 0;

    // timers
    this.coyote -= dt;
    this.jumpBuf -= dt;
    this.dashCd -= dt;
    this.atkCd -= dt;
    this.invuln -= dt;
    this.knockT -= dt;
    this.wallLock -= dt;
    this.wallCoyote -= dt;
    this.flareCd -= dt;
    this.landT -= dt;
    this.dropT -= dt;
    this.pogoGrace -= dt;
    this.dropThrough = this.dropT > 0;

    if (ctl && input.hit('jump')) this.jumpBuf = 0.13;

    const dashing = this.dashT > 0;
    const locked = dashing || this.knockT > 0 || this.wallLock > 0;

    // ── focus (mend) ──
    const wantFocus = ctl && input.down('focus') && this.onGround && !dashing && this.knockT <= 0 && this.cinder >= CINDER_COST && this.hp < this.maxHp && this.atkT <= 0;
    if (wantFocus) {
      if (!this.focusing) {
        this.focusing = true;
        this.focusT = 0;
        audio.sfx('focus');
      }
      this.focusT += dt;
      fx.gather(this.x, this.y + 1.2, '#ffc46b', 2, 2.4);
      if (this.focusT >= 0.85) {
        this.focusT = 0;
        this.hp = Math.min(this.maxHp, this.hp + 1);
        this.cinder -= CINDER_COST;
        audio.sfx('heal');
        fx.ring(this.x, this.y + 0.9, '#ffd28a', 22, 7);
        fx.burst(this.x, this.y + 1.2, 16, { color: '#fff0c0', speed: 5, grav: -4, life: 0.9 });
        g.hud.pulse();
        if (this.cinder >= CINDER_COST && this.hp < this.maxHp) audio.sfx('focus');
      }
    } else this.focusing = false;

    // ── horizontal ──
    if (!locked) {
      const target = this.focusing ? 0 : ax * RUN;
      const acc = this.onGround ? 95 : 70;
      this.vx = approach(this.vx, target, acc * dt);
      if (ax !== 0 && this.atkT <= 0 && !this.focusing) this.facing = ax;
    }

    // ── wall slide ──
    this.wallSlide = 0;
    if (this.abilities.grip && !this.onGround && !dashing && this.knockT <= 0 && this.vy < 2) {
      for (const d of [1, -1]) {
        if (ax === d && this.touchingWall(d)) {
          this.wallSlide = d;
          this.wallDir = d;
          this.wallCoyote = 0.13;
          this.airDash = true;
        }
      }
    }

    // ── jump ──
    if (this.jumpBuf > 0 && !dashing && !this.focusing) {
      if (ay < 0 && this.onGround && this.standingOnPlat()) {
        this.dropT = 0.2;
        this.jumpBuf = 0;
        this.coyote = 0;
      } else if (this.coyote > 0) {
        this.vy = JUMP;
        this.jumpHeld = true;
        this.jumpBuf = 0;
        this.coyote = 0;
        audio.sfx('jump');
        fx.dust(this.x, this.y, 5);
        this.stretch = 1;
      } else if (this.abilities.grip && (this.wallSlide || this.wallCoyote > 0)) {
        const d = this.wallSlide || this.wallDir;
        this.vy = JUMP * 0.93;
        this.vx = -d * 10;
        this.facing = -d;
        this.wallLock = 0.15;
        this.wallCoyote = 0;
        this.jumpHeld = true;
        this.jumpBuf = 0;
        audio.sfx('walljump');
        fx.dust(this.x + d * 0.3, this.y + 0.5, 6, -d);
        this.stretch = 1;
      }
    }
    if (this.jumpHeld && (!ctl || !input.down('jump'))) {
      if (this.vy > 5) this.vy *= 0.45;
      this.jumpHeld = false;
    }
    if (this.vy <= 0) this.jumpHeld = false;

    // ── dash ──
    if (ctl && input.hit('dash') && this.abilities.dash && this.dashCd <= 0 && this.airDash && !dashing && this.knockT <= 0) {
      this.dashT = DASH_TIME;
      this.dashCd = 0.42;
      if (this.wallSlide) this.facing = -this.wallSlide;
      else if (ax !== 0) this.facing = ax;
      this.vx = this.facing * DASH_SPEED;
      this.vy = 0;
      this.focusing = false;
      if (!this.onGround) this.airDash = false;
      audio.sfx('dash');
      fx.shake(0.06, 0.12);
      fx.burst(this.x, this.y + 0.7, 10, { color: '#7ff5e0', angle: this.facing > 0 ? Math.PI : 0, spread: 0.5, speed: 7, grav: 0 });
      this.ghostT = 0;
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.facing * DASH_SPEED;
      this.vy = 0;
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.028;
        fx.sprite(sprite('cloak'), { x: this.x, y: this.y + 0.6, w: 0.92 * this.facing, h: 1.0, tint: 0x3fe8d0, alpha: 0.45, life: 0.22, grow: -0.2, z: 0.4 });
        fx.trail(this.x, this.y + 1.2, '#ffb060', 0.5, 0.3);
      }
      if (this.dashT <= 0) this.vx = this.facing * RUN * 0.8;
    } else {
      // ── gravity ──
      this.vy -= GRAV * dt;
      if (this.vy < MAXFALL) this.vy = MAXFALL;
      if (this.wallSlide && this.vy < -3.6) {
        this.vy = -3.6;
        if (Math.random() < 0.5) fx.dust(this.x + this.wallSlide * 0.3, this.y + 1.0, 1);
      }
    }

    // ── attack ──
    if (ctl && input.hit('attack') && this.atkCd <= 0 && !dashing && !this.focusing && this.knockT <= 0) {
      this.startAttack(ay > 0 ? 'up' : ay < 0 && !this.onGround ? 'down' : 'side');
    }
    if (this.atkT > 0) {
      this.atkT -= dt;
      if (this.atkT > 0.05 && !this.atkFake) this.attackScan();
    }

    // ── flare ──
    if (ctl && input.hit('flare') && this.flareCd <= 0 && this.cinder >= CINDER_COST && !dashing && this.knockT <= 0) {
      this.cinder -= CINDER_COST;
      this.flareCd = 0.5;
      this.vx -= this.facing * 5;
      g.spawnFlare(this.x + this.facing * 0.6, this.y + 0.85, this.facing);
      audio.sfx('flare');
      fx.shake(0.12, 0.15);
      this.atkT = 0.14;
      this.atkDir = 'side';
      this.atkFake = true;
    }

    // ── move ──
    this.wasGround = this.onGround;
    const vyBefore = this.vy;
    world.move(this, dt);
    if (this.hitWall && this.dashT > 0) this.dashT = 0;
    if (this.hitWall) this.vx = 0;
    if (this.onGround) {
      this.coyote = 0.1;
      this.airDash = true;
      if (!this.wasGround) {
        this.landT = 0.14;
        this.squash = clamp(-vyBefore / 24, 0.2, 1);
        if (vyBefore < -8) {
          audio.sfx('land');
          fx.dust(this.x, this.y, 7);
        }
      }
      // remember solid, hazard-free footing
      this.safeT -= dt;
      if (this.safeT <= 0 && this.invuln <= 0) {
        this.safeT = 0.2;
        const ty = Math.floor(this.y - 0.5);
        const ok = [-0.6, 0.6].every((o) => world.tile(Math.floor(this.x + o), ty) !== T.EMPTY && world.tile(Math.floor(this.x + o), ty) !== T.THORN);
        if (ok && !world.thornsIn(this.x - 1.6, this.y, 3.2, 1)) this.safe = { x: this.x, y: this.y };
      }
    }

    // ── hazards ──
    if (this.invuln <= 0 && this.pogoGrace <= 0 && world.thornsIn(this.x - this.w / 2 + 0.1, this.y, this.w - 0.2, this.h * 0.6)) {
      g.onHazard();
    }

    // run feedback
    if (this.onGround && Math.abs(this.vx) > 2) {
      const before = Math.floor(this.runPhase);
      this.runPhase += Math.abs(this.vx) * dt * 0.42;
      if (Math.floor(this.runPhase) !== before) {
        audio.sfx('step');
        if (Math.random() < 0.6) fx.dust(this.x - this.facing * 0.2, this.y, 1);
      }
    }
    this.idleT = this.onGround && Math.abs(this.vx) < 0.1 && this.atkT <= 0 ? this.idleT + dt : 0;

    this.syncVisual(dt);
  }

  standingOnPlat() {
    const w = this.g.world;
    const ty = Math.floor(this.y - 0.5);
    const a = w.tile(Math.floor(this.x - this.w / 2 + 0.01), ty);
    const b = w.tile(Math.floor(this.x + this.w / 2 - 0.01), ty);
    return (a === T.PLAT || b === T.PLAT) && a !== T.SOLID && b !== T.SOLID;
  }

  startAttack(dir) {
    this.atkDir = dir;
    this.atkFake = false;
    this.atkT = 0.17;
    this.atkCd = 0.36;
    this.atkHits = new Set();
    this.atkBounced = false;
    this.atkFlip = Math.random() < 0.5;
    audio.sfx('slash');
    const f = this.facing;
    const o = { w: 3.1, h: 2.9, life: 0.16, grow: 0.18, tint: 0xffe9c8, parent: this.root, z: 0.2, flipY: this.atkFlip };
    if (dir === 'side') this.g.fx.sprite(sprite('slash'), { ...o, x: f * 0.55, y: 0.8, rot: f > 0 ? 0 : Math.PI });
    else if (dir === 'up') this.g.fx.sprite(sprite('slash'), { ...o, x: 0, y: 1.3, rot: Math.PI / 2 });
    else this.g.fx.sprite(sprite('slash'), { ...o, x: 0, y: 0.25, rot: -Math.PI / 2 });
  }

  attackBox() {
    if (this.atkDir === 'side') return { x: this.facing > 0 ? this.x - 0.1 : this.x - 2.25, y: this.y + 0.05, w: 2.35, h: 1.55 };
    if (this.atkDir === 'up') return { x: this.x - 1.0, y: this.y + 0.8, w: 2.0, h: 2.25 };
    return { x: this.x - 1.0, y: this.y - 1.75, w: 2.0, h: 2.1 };
  }

  attackScan() {
    const g = this.g;
    const b = this.attackBox();
    const kx = this.atkDir === 'side' ? this.facing : 0;
    const ky = this.atkDir === 'up' ? 1 : this.atkDir === 'down' ? -1 : 0;
    const n = g.hitScan(b, 1, kx, ky, this.atkHits);
    let bounce = false;
    if (n > 0) {
      this.gainCinder(11 * n);
      g.fx.freeze(0.055);
      g.fx.shake(0.14, 0.14);
      input.rumble(0.3, 0.5, 70);
      if (this.atkDir === 'side' && !this.atkBounced) {
        this.vx = -this.facing * 5.5;
        this.atkBounced = true;
      }
      if (this.atkDir === 'down') bounce = true;
      if (this.atkDir === 'up' && this.vy > 0) this.vy *= 0.5;
    }
    if (this.atkDir === 'down' && !this.atkBounced && g.world.thornsIn(b.x + 0.3, b.y, b.w - 0.6, 1.6)) {
      bounce = true;
      audio.sfx('clink');
      g.fx.burst(this.x, this.y - 0.5, 8, { color: '#dfeaff', speed: 6, angle: Math.PI / 2, spread: 1.2 });
    }
    if (bounce && !this.atkBounced) {
      this.atkBounced = true;
      this.vy = 17.5;
      this.jumpHeld = false;
      this.airDash = true;
      this.pogoGrace = 0.12;
    }
    // blade tip clinks against walls
    if (this.atkDir === 'side' && n === 0 && !this.atkBounced) {
      const tx = this.x + this.facing * 1.7;
      if (g.world.solid(Math.floor(tx), Math.floor(this.y + 0.75))) {
        this.atkBounced = true;
        const wx = this.facing > 0 ? Math.floor(tx) : Math.floor(tx) + 1;
        audio.sfx('clink');
        g.fx.burst(wx, this.y + 0.8, 7, { color: '#fff1d0', speed: 6, angle: this.facing > 0 ? Math.PI : 0, spread: 1 });
        this.vx = -this.facing * 3;
      }
    }
  }

  hurt(dmg, fromX) {
    if (this.invuln > 0 || this.dead || this.frozen) return false;
    const g = this.g;
    this.hp -= dmg;
    this.invuln = 1.25;
    this.knockT = 0.24;
    this.dashT = 0;
    this.focusing = false;
    this.atkT = 0;
    this.vx = (this.x < fromX ? -1 : 1) * 8.5;
    this.vy = 11;
    audio.sfx('hurt');
    g.fx.freeze(0.13);
    g.fx.shake(0.4, 0.35);
    input.rumble(1, 1, 220);
    g.fx.burst(this.x, this.y + 0.8, 22, { color: '#ffb060', speed: 9, life: 0.7 });
    g.fx.burst(this.x, this.y + 0.8, 12, { color: '#0b0d1e', speed: 6, normal: true, size: 0.4, alpha: 0.8 });
    g.onPlayerHurt();
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    this.dead = true;
    this.hp = 0;
    this.vx = 0;
    this.vy = 0;
    audio.sfx('death');
    const fx = this.g.fx;
    fx.freeze(0.3);
    fx.shake(0.6, 0.6);
    fx.ring(this.x, this.y + 1, '#ffb060', 40, 12);
    fx.burst(this.x, this.y + 1, 60, { color: '#ffcf8a', speed: 12, life: 1.6, grav: 4 });
    fx.burst(this.x, this.y + 0.6, 30, { color: '#0b0d1e', speed: 5, normal: true, size: 0.6, alpha: 0.7, life: 1.4, grav: -1 });
    this.root.visible = false;
    this.scarfMesh.visible = false;
    this.g.onPlayerDeath();
  }

  revive() {
    this.dead = false;
    this.hp = this.maxHp;
    this.resetTimers();
    this.root.visible = true;
    this.scarfMesh.visible = true;
  }

  syncVisual(dt) {
    const t = this.g.time;
    const rig = this.rig;
    this.root.position.x = this.x;
    this.root.position.y = this.y;
    const running = this.onGround && Math.abs(this.vx) > 1;
    const dashing = this.dashT > 0;

    // squash & stretch
    this.squash = Math.max(0, (this.squash || 0) - dt * 6);
    this.stretch = Math.max(0, (this.stretch || 0) - dt * 4);
    let sx = 1;
    let sy = 1;
    if (!this.onGround) {
      const k = clamp(Math.abs(this.vy) / 24, 0, 1);
      sy += k * 0.16;
      sx -= k * 0.1;
    }
    sy += this.stretch * 0.12 - this.squash * 0.24;
    sx += this.squash * 0.22 - this.stretch * 0.08;
    if (dashing) {
      sx = 1.35;
      sy = 0.78;
    }
    if (this.focusing) {
      sy *= 0.88;
      sx *= 1.06;
    }
    const face = this.wallSlide ? -this.wallSlide : this.facing;
    rig.scale.x = damp(Math.abs(rig.scale.x), sx, 30, dt || 0.016) * face;
    rig.scale.y = damp(rig.scale.y, sy, 30, dt || 0.016);

    // lean
    const lean = dashing ? -0.35 : running ? -0.13 : this.wallSlide ? 0.12 : clamp(-this.vx * 0.012, -0.1, 0.1) * face;
    rig.rotation.z = damp(rig.rotation.z, lean * face, 18, dt || 0.016);

    // legs
    const ph = this.runPhase * Math.PI;
    if (running) {
      this.legL.rotation.z = Math.sin(ph) * 0.9;
      this.legR.rotation.z = Math.sin(ph + Math.PI) * 0.9;
    } else if (!this.onGround) {
      this.legL.rotation.z = damp(this.legL.rotation.z, this.vy > 0 ? -0.5 : 0.35, 14, dt || 0.016);
      this.legR.rotation.z = damp(this.legR.rotation.z, this.vy > 0 ? 0.3 : -0.25, 14, dt || 0.016);
    } else {
      this.legL.rotation.z = damp(this.legL.rotation.z, 0, 14, dt || 0.016);
      this.legR.rotation.z = damp(this.legR.rotation.z, 0, 14, dt || 0.016);
    }

    // bob
    const bob = running ? Math.abs(Math.sin(ph)) * 0.07 : Math.sin(t * 2.2) * 0.025;
    this.cloak.position.y = 0.1 + bob;
    this.head.position.y = 1.26 + bob * 1.4 + (this.focusing ? -0.08 : 0);
    this.head.rotation.z = running ? -0.08 : Math.sin(t * 1.3) * 0.03;
    this.cloak.scale.x = 0.92 * (1 + (this.onGround ? 0 : clamp(-this.vy / 60, -0.08, 0.25)));

    // flame flicker
    const fl = 1 + Math.sin(t * 17) * 0.08 + Math.sin(t * 31.7) * 0.06;
    const charge = this.focusing ? 1.5 + this.focusT : 1;
    this.flame.position.y = this.head.position.y + 0.0;
    this.flame.scale.set(0.34 * (2 - fl) * charge, 0.5 * fl * charge, 1);
    this.flame.rotation.z = Math.sin(t * 9) * 0.1 - this.vx * 0.012 * face;
    this.halo.material.uniforms.uAlpha.value = (0.17 + 0.03 * Math.sin(t * 13)) * (this.focusing ? 1.8 : 1) * (0.5 + 0.5 * (this.hp / this.maxHp));
    this.halo.scale.setScalar(5.5 * (this.focusing ? 1.25 : 1));

    // blade
    let target = -1.95;
    if (running) target = -2.25 + Math.sin(ph) * 0.12;
    if (!this.onGround) target = -2.5;
    if (this.atkT > 0) {
      const k = clamp(1 - this.atkT / 0.17, 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      if (this.atkDir === 'side') target = lerp(1.5, -1.15, e);
      else if (this.atkDir === 'up') target = lerp(2.9, 0.5, e);
      else target = lerp(-0.3, -2.75, e);
      this.bladePivot.rotation.z = target;
    } else this.bladePivot.rotation.z = damp(this.bladePivot.rotation.z, target, 16, dt || 0.016);

    // invulnerability blink + hit flash
    this.flash.value = this.invuln > 1.05 ? 1 : 0;
    this.rig.visible = !(this.invuln > 0 && this.invuln < 1.05 && Math.floor(t * 22) % 2 === 0);

    this.updateScarf(dt || 0.016, t, face);
  }

  updateScarf(dt, t, face) {
    const pts = this.scarf;
    const ax = this.x - face * 0.14;
    const ay = this.y + 0.98 + (this.cloak.position.y - 0.1);
    pts[0].x = ax;
    pts[0].y = ay;
    const seg = 0.135;
    const h = Math.min(dt, 0.033);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * 0.9;
      const vy = (p.y - p.py) * 0.9;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + (-face * 5 + Math.sin(t * 3 + i * 0.7) * 3.5) * h * h;
      p.y += vy + (-7 + Math.cos(t * 2.3 + i) * 2.5) * h * h;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const p = pts[i];
        let dx = p.x - a.x;
        let dy = p.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        if (d > seg * 6) {
          p.x = p.px = a.x;
          p.y = p.py = a.y;
          continue;
        }
        const diff = (d - seg) / d;
        p.x -= dx * diff;
        p.y -= dy * diff;
      }
    }
    const pos = this.scarfPos;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1;
      const w = lerp(0.13, 0.015, i / (pts.length - 1)) * (1 + 0.3 * Math.sin(i * 1.3));
      nx = (nx / l) * w;
      ny = (ny / l) * w;
      pos.set([pts[i].x + nx, pts[i].y + ny, 0.45, pts[i].x - nx, pts[i].y - ny, 0.45], i * 6);
    }
    this.scarfMesh.geometry.attributes.position.needsUpdate = true;
  }
}
