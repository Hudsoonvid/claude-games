// The living things: minnows (water), mossbacks (land grazers) and glimmers (night fliers).
import * as THREE from 'three';
import { W, H, D, AIR, WATER, LAVA, STEAM, TUFT, WEED, FIRE, OPAQUE, rnd, ri } from './world.js';

export const KINDS = {
  minnow: { name: 'minnow', cap: 60, hint: 'WASD swim · Space up · Shift down' },
  mossback: { name: 'mossback', cap: 45, hint: 'WASD walk · Space hop' },
  glimmer: { name: 'glimmer', cap: 45, hint: 'WASD fly · Space up · Shift down' },
};

const std = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const G = {
  body: new THREE.SphereGeometry(0.5, 10, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 6),
  dome: new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  wing: new THREE.PlaneGeometry(1, 1),
};
const M = {
  fish: [std(0xff9a4a), std(0xf4f1e6), std(0x6fd0d8), std(0xffd257)],
  fin: std(0xfff3dc),
  eye: std(0x1c1c22),
  shell: [std(0x6a8f3c), std(0x8a6a3c), std(0x4f8a6a)],
  skin: std(0xf2d9a8),
  bug: std(0x2b2a33),
  wing: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.8, 1.0) }),
};
export function setNightGlow(n) { for (const m of M.fish) m.emissive.copy(m.color).multiplyScalar(0.55 * n); }
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(240,255,170,1)'); gr.addColorStop(0.3, 'rgba(210,255,120,.45)'); gr.addColorStop(1, 'rgba(180,255,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let glowTex = null;

function part(geo, mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; return m;
}

function build(kind) {
  const g = new THREE.Group(); // models face +Z
  if (kind === 'minnow') {
    const mat = M.fish[ri(M.fish.length)];
    g.add(part(G.body, mat, 0.34, 0.42, 0.95));
    const tail = new THREE.Group(); tail.position.z = -0.42;
    const t = part(G.cone, M.fin, 0.08, 0.36, 0.5, 0, 0, -0.14); t.rotation.x = Math.PI / 2; tail.add(t);
    g.add(tail); g.userData.tail = tail;
    g.add(part(G.body, M.eye, 0.08, 0.08, 0.08, 0.13, 0.06, 0.3), part(G.body, M.eye, 0.08, 0.08, 0.08, -0.13, 0.06, 0.3));
    const fin = part(G.cone, M.fin, 0.05, 0.22, 0.3, 0, 0.22, -0.02); fin.rotation.x = -0.5; g.add(fin);
  } else if (kind === 'mossback') {
    g.add(part(G.dome, M.shell[ri(M.shell.length)], 0.8, 0.95, 0.95, 0, 0.05, -0.05));
    g.add(part(G.body, M.skin, 0.36, 0.3, 0.36, 0, 0.17, 0.42));
    g.add(part(G.body, M.eye, 0.08, 0.08, 0.08, 0.1, 0.24, 0.57), part(G.body, M.eye, 0.08, 0.08, 0.08, -0.1, 0.24, 0.57));
    g.add(part(G.body, M.skin, 0.62, 0.14, 0.8, 0, 0.07, 0));
  } else {
    g.add(part(G.body, M.bug, 0.16, 0.16, 0.26));
    const lamp = part(G.body, M.glow, 0.17, 0.17, 0.2, 0, 0, -0.17); lamp.castShadow = false; g.add(lamp);
    const wl = part(G.wing, M.wing, 0.34, 0.2, 1, 0.17, 0.1, 0), wr = part(G.wing, M.wing, 0.34, 0.2, 1, -0.17, 0.1, 0);
    wl.rotation.x = wr.rotation.x = -Math.PI / 2; wl.castShadow = wr.castShadow = false;
    g.add(wl, wr); g.userData.wings = [wl, wr];
    glowTex ||= glowTexture();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.setScalar(2.2); g.add(sp); g.userData.halo = sp;
  }
  return g;
}

export class Critters {
  constructor(world, scene, fx) {
    this.world = world; this.scene = scene; this.fx = fx;
    this.list = [];
    this.counts = { minnow: 0, mossback: 0, glimmer: 0 };
    this.possessed = null;
    this.onEvent = () => {};
  }

  spawn(kind, x, y, z, quiet) {
    if (this.counts[kind] >= KINDS[kind].cap) return null;
    const c = {
      kind, x, y, z, vx: 0, vy: 0, vz: 0, yaw: rnd() * 6.28, food: 0, age: 0, dry: 0, t: rnd() * 10,
      tx: x, ty: y, tz: z, retarget: 0, ground: false, eatCd: 0, mesh: build(kind), dead: false, size: quiet ? 1 : 0.2,
    };
    c.mesh.position.set(x, y, z);
    this.scene.add(c.mesh);
    this.list.push(c); this.counts[kind]++;
    return c;
  }

  remove(c, puff) {
    if (c.dead) return;
    c.dead = true; this.counts[c.kind]--;
    this.scene.remove(c.mesh);
    if (puff) this.fx.burst(c.x, c.y + 0.2, c.z, 10, puff, 2.5);
    if (this.possessed === c) { this.possessed = null; this.onEvent('lost', c); }
  }

  clear() { for (const c of this.list) { this.scene.remove(c.mesh); } this.list = []; this.counts = { minnow: 0, mossback: 0, glimmer: 0 }; this.possessed = null; }

  serialize() { return this.list.filter(c => !c.dead).map(c => [c.kind[1] === 'i' ? 0 : c.kind[1] === 'o' ? 1 : 2, +c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1), c.food]); }
  deserialize(arr) {
    this.clear();
    for (const a of arr || []) { const c = this.spawn(['minnow', 'mossback', 'glimmer'][a[0]], a[1], a[2], a[3], true); if (c) c.food = a[4] || 0; }
  }

  // nearest creature to a ray (grid space)
  pick(o, d) {
    let best = null, bt = 1e9;
    for (const c of this.list) {
      const px = c.x - o.x, py = c.y + 0.2 - o.y, pz = c.z - o.z;
      const t = px * d.x + py * d.y + pz * d.z; if (t < 0) continue;
      const dx = px - d.x * t, dy = py - d.y * t, dz = pz - d.z * t;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1.6 && t + dist * 6 < bt) { bt = t + dist * 6; best = c; }
    }
    return best;
  }

  update(dt, input, night) {
    const w = this.world;
    for (const c of this.list) {
      if (c.dead) continue;
      c.age += dt; c.t += dt; c.eatCd -= dt;
      if (c.size < 1) c.size = Math.min(1, c.size + dt * 0.25);
      const ctl = this.possessed === c ? input : null;
      const cx = Math.floor(c.x), cy = Math.floor(c.y + 0.2), cz = Math.floor(c.z);
      const here = w.get(cx, cy, cz);
      if (here === LAVA || here === FIRE) { this.remove(c, 0xff9a3a); continue; }
      if (c.kind === 'minnow') this.minnow(c, dt, ctl, here, cx, cy, cz);
      else if (c.kind === 'mossback') this.mossback(c, dt, ctl, here, cx, cy, cz);
      else this.glimmer(c, dt, ctl);
      if (c.dead) continue;
      const m = c.mesh;
      m.position.set(c.x, c.y, c.z);
      m.scale.setScalar(c.size * (c.kind === 'glimmer' ? 0.9 : 1));
      if (c.kind === 'minnow') {
        const sp = Math.hypot(c.vx, c.vz);
        m.rotation.set(-Math.atan2(c.vy, Math.max(0.6, sp)) * 0.6, c.yaw, c.dry > 0.3 ? Math.PI / 2 : 0, 'YXZ');
        m.userData.tail.rotation.y = Math.sin(c.t * (6 + sp * 4)) * 0.5;
      } else if (c.kind === 'mossback') {
        m.rotation.set(0, c.yaw, Math.sin(c.t * 9) * 0.05 * Math.min(1, Math.hypot(c.vx, c.vz)), 'YXZ');
      } else {
        m.rotation.set(0, c.yaw, 0);
        const f = Math.sin(c.t * 60) * 0.7;
        m.userData.wings[0].rotation.y = f; m.userData.wings[1].rotation.y = -f;
        m.userData.halo.material.opacity = (0.12 + night * 0.88) * (0.65 + 0.35 * Math.sin(c.t * 2.3));
      }
    }
    if (this.list.some(c => c.dead)) this.list = this.list.filter(c => !c.dead);
  }

  swimmable(x, y, z) {
    const w = this.world; if (!w.inb(x, y, z)) return false;
    const m = w.get(x, y, z);
    return m === WEED || (m === WATER && (w.getAux(x, y, z) >= 4 || w.get(x, y + 1, z) === WATER));
  }

  minnow(c, dt, ctl, here, cx, cy, cz) {
    const w = this.world;
    if (here === STEAM) { this.remove(c, 0xffffff); return; }
    const wet = this.swimmable(cx, cy, cz);
    if (wet) {
      c.dry = 0;
      let dx = 0, dy = 0, dz = 0, sp = 2.6;
      if (ctl) { dx = ctl.x; dz = ctl.z; dy = ctl.up; sp = 4.5; }
      else {
        c.retarget -= dt;
        const tdx = c.tx - c.x, tdy = c.ty - c.y, tdz = c.tz - c.z, dist = Math.hypot(tdx, tdy, tdz);
        if (c.retarget <= 0 || dist < 0.5) {
          c.retarget = 1.5 + rnd() * 3;
          for (let k = 0; k < 10; k++) {
            const x = cx + ri(13) - 6, y = cy + ri(7) - 3, z = cz + ri(13) - 6;
            if (!this.swimmable(x, y, z)) continue;
            c.tx = x + 0.5; c.ty = y + 0.3; c.tz = z + 0.5;
            if (c.food < 3 && w.get(x, y, z) !== WEED && k < 6) continue; // keep looking for weed while hungry
            break;
          }
        } else { dx = tdx / dist; dy = tdy / dist; dz = tdz / dist; }
        sp *= 0.5 + 0.5 * Math.sin(c.t * 1.7) ** 2;
      }
      const k = Math.min(1, dt * 4);
      c.vx += (dx * sp - c.vx) * k; c.vy += (dy * sp - c.vy) * k; c.vz += (dz * sp - c.vz) * k;
      const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, nz = c.z + c.vz * dt;
      if (this.swimmable(Math.floor(nx), cy, cz)) c.x = nx; else { c.vx *= -0.3; c.retarget = 0; }
      if (this.swimmable(Math.floor(c.x), Math.floor(ny + 0.2), cz)) c.y = ny; else { c.vy = 0; if (!ctl) c.retarget = Math.min(c.retarget, 0.3); }
      if (this.swimmable(Math.floor(c.x), Math.floor(c.y + 0.2), Math.floor(nz))) c.z = nz; else { c.vz *= -0.3; c.retarget = 0; }
      if (Math.hypot(c.vx, c.vz) > 0.2) c.yaw = lerpAngle(c.yaw, Math.atan2(c.vx, c.vz), Math.min(1, dt * 8));
      if (here === WEED && c.eatCd <= 0 && c.food < 6) {
        w.set(cx, cy, cz, WATER, 8); c.food++; c.eatCd = 4; this.fx.burst(c.x, c.y, c.z, 4, 0x58c08a, 1);
      }
      if (c.food >= 4 && c.age > 70 && c.eatCd <= 0 && this.counts.minnow < KINDS.minnow.cap) {
        c.food = 0; c.age = 0; this.spawn('minnow', c.x, c.y, c.z);
      }
    } else {
      // stranded: flop about and hope for water
      if (w.solid(cx, cy, cz)) { c.y += 3 * dt; return; }
      c.dry += dt;
      c.vy -= 22 * dt;
      const ny = c.y + c.vy * dt;
      if (w.solid(cx, Math.floor(ny), cz)) {
        c.y = Math.floor(ny) + 1.02; c.vy = rnd() < 0.5 ? 3 + rnd() * 2 : 0;
        if (c.vy) { c.vx = (rnd() - 0.5) * 3; c.vz = (rnd() - 0.5) * 3; }
      } else c.y = ny;
      const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      if (!w.solid(Math.floor(nx), Math.floor(c.y + 0.2), Math.floor(nz))) { c.x = nx; c.z = nz; }
      c.vx *= 0.96; c.vz *= 0.96;
      if (c.dry > 9) this.remove(c, 0xcfd8dc);
    }
  }

  mossback(c, dt, ctl, here, cx, cy, cz) {
    const w = this.world;
    if (w.solid(cx, cy, cz)) { c.y += 4 * dt; c.vy = 0; return; } // dig out when buried
    const inWater = here === WATER && w.getAux(cx, cy, cz) >= 4 || here === WEED;
    let dx = 0, dz = 0, sp = 1.3;
    if (ctl) {
      dx = ctl.x; dz = ctl.z; sp = 3.2;
      if (ctl.up > 0 && (c.ground || inWater)) { c.vy = 7.5; c.ground = false; }
    } else {
      c.retarget -= dt;
      if (c.retarget <= 0) {
        c.retarget = 2 + rnd() * 4;
        c.walk = rnd() < 0.8;
        let ang = c.yaw + (rnd() - 0.5) * 2.4;
        if (c.food < 4) {
          for (let k = 0; k < 8; k++) {
            const x = cx + ri(11) - 5, z = cz + ri(11) - 5, y = cy + ri(5) - 2;
            if (w.get(x, y, z) === TUFT) { ang = Math.atan2(x + 0.5 - c.x, z + 0.5 - c.z); c.walk = true; break; }
          }
        }
        c.heading = ang;
      }
      if (c.walk) { dx = Math.sin(c.heading); dz = Math.cos(c.heading); }
    }
    if (inWater) { sp *= 0.6; c.vy += (2.2 - c.vy) * Math.min(1, dt * 5); }
    else c.vy -= 24 * dt;
    c.vx = dx * sp; c.vz = dz * sp;
    // horizontal with one-block step-up
    for (let axis = 0; axis < 2; axis++) {
      const v = axis ? c.vz : c.vx; if (!v) continue;
      const n = (axis ? c.z : c.x) + v * dt, pad = n + Math.sign(v) * 0.3;
      const px = Math.floor(axis ? c.x : pad), pz = Math.floor(axis ? pad : c.z), fy = Math.floor(c.y + 0.1);
      if (pad < 0.2 || pad > (axis ? D : W) - 0.2) { if (!ctl) c.heading = (c.heading || 0) + Math.PI; continue; }
      if (!w.solid(px, fy, pz)) { if (axis) c.z = n; else c.x = n; }
      else if ((c.ground || inWater) && !w.solid(px, fy + 1, pz) && !w.solid(Math.floor(c.x), fy + 1, Math.floor(c.z))) {
        c.y = fy + 1.02; if (axis) c.z = n; else c.x = n;
      } else if (!ctl) c.retarget = Math.min(c.retarget, 0.2);
    }
    const ny = c.y + c.vy * dt;
    c.ground = false;
    if (c.vy <= 0 && w.solid(Math.floor(c.x), Math.floor(ny), Math.floor(c.z))) { c.y = Math.floor(ny) + 1; c.vy = 0; c.ground = true; }
    else if (c.vy > 0 && w.solid(Math.floor(c.x), Math.floor(ny + 0.6), Math.floor(c.z))) c.vy = 0;
    else c.y = ny;
    if (c.y > H - 1) c.y = H - 1;
    if (dx || dz) c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 7));
    if (here === TUFT && c.eatCd <= 0 && c.food < 6) {
      w.set(cx, cy, cz, AIR); c.food++; c.eatCd = 3; this.fx.burst(c.x, c.y + 0.3, c.z, 4, 0x86cf58, 1);
    }
    if (c.food >= 5 && c.age > 80 && this.counts.mossback < KINDS.mossback.cap) {
      c.food = 0; c.age = 0; this.spawn('mossback', c.x, c.y + 0.2, c.z);
    }
  }

  glimmer(c, dt, ctl) {
    const w = this.world;
    let dx = 0, dy = 0, dz = 0, sp = 2.2;
    if (ctl) { dx = ctl.x; dz = ctl.z; dy = ctl.up; sp = 6; }
    else {
      c.retarget -= dt;
      const tx = c.tx - c.x, ty = c.ty - c.y, tz = c.tz - c.z, dist = Math.hypot(tx, ty, tz);
      if (c.retarget <= 0 || dist < 0.6) {
        c.retarget = 2 + rnd() * 4;
        c.tx = Math.min(W - 2, Math.max(2, c.x + (rnd() - 0.5) * 18));
        c.tz = Math.min(D - 2, Math.max(2, c.z + (rnd() - 0.5) * 18));
        c.ty = Math.min(H - 2, w.groundY(c.tx, c.tz) + 1.5 + rnd() * 3.5);
      } else { dx = tx / dist; dy = ty / dist; dz = tz / dist; }
      dx += Math.sin(c.t * 2.1) * 0.5; dz += Math.cos(c.t * 1.7) * 0.5; dy += Math.sin(c.t * 3.3) * 0.4;
    }
    const k = Math.min(1, dt * 3);
    c.vx += (dx * sp - c.vx) * k; c.vy += (dy * sp - c.vy) * k; c.vz += (dz * sp - c.vz) * k;
    const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, nz = c.z + c.vz * dt;
    const free = (x, y, z) => { if (x < 0.5 || z < 0.5 || x > W - 0.5 || z > D - 0.5 || y < 0.3 || y > H - 0.5) return false; const m = w.get(Math.floor(x), Math.floor(y), Math.floor(z)); return !OPAQUE[m] && m !== WATER && m !== WEED; };
    if (free(nx, c.y, c.z)) c.x = nx; else { c.vx *= -0.5; c.retarget = 0; }
    if (free(c.x, ny, c.z)) c.y = ny; else { c.vy = Math.abs(c.vy) * 0.5 + 0.5; c.retarget = 0; if (!free(c.x, c.y, c.z)) c.y += 3 * dt; }
    if (free(c.x, c.y, nz)) c.z = nz; else { c.vz *= -0.5; c.retarget = 0; }
    if (Math.hypot(c.vx, c.vz) > 0.3) c.yaw = lerpAngle(c.yaw, Math.atan2(c.vx, c.vz), Math.min(1, dt * 6));
  }
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
