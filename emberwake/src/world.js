// Room loading: collision grid + all of the room's static visuals.
import * as THREE from 'three';
import { ROOMS, T } from './rooms.js';
import { BIOMES, terrainMaterial, skyMaterial, paintLayer, decorTex, quad, glow, rayTex, spriteMat } from './art.js';
import { sprite } from './sprites.js';
import { rng, hashStr } from './util.js';

export const CAM_DIST = 20.6;
export const ORDER = { sky: 0, layer: 1, ray: 4, back: 5, decor: 6, terrain: 10, prop: 11, entity: 20, player: 30, front: 35, fx: 40, fg: 50 };

const PPT = 12; // mask pixels per tile
const PAD = 8; // tiles of solid padding around a room

function buildMask(room) {
  const W = (room.w + PAD * 2) * PPT;
  const H = (room.h + PAD * 2) * PPT;
  let a = new Float32Array(W * H);
  let b = new Float32Array(W * H);
  const exitRow = (ty) => room.exits.find((e) => ty >= e.y && ty < e.y + e.h);
  for (let py = 0; py < H; py++) {
    const ty = Math.floor(py / PPT) - PAD;
    for (let px = 0; px < W; px++) {
      const tx = Math.floor(px / PPT) - PAD;
      let s;
      if (tx < 0 || tx >= room.w || ty < 0 || ty >= room.h) {
        const e = ty >= 0 && ty < room.h ? exitRow(ty) : null;
        s = e && ((e.side === 'left' && tx < 0) || (e.side === 'right' && tx >= room.w)) ? 0 : 1;
      } else s = room.tiles[ty * room.w + tx] === T.SOLID ? 1 : 0;
      a[py * W + px] = s;
    }
  }
  // three box-blur passes ≈ gaussian
  const R = 3;
  const inv = 1 / (R * 2 + 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      let acc = 0;
      const row = y * W;
      for (let i = -R; i <= R; i++) acc += a[row + Math.min(W - 1, Math.max(0, i))];
      for (let x = 0; x < W; x++) {
        b[row + x] = acc * inv;
        acc += a[row + Math.min(W - 1, x + R + 1)] - a[row + Math.max(0, x - R)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let i = -R; i <= R; i++) acc += b[Math.min(H - 1, Math.max(0, i)) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = acc * inv;
        acc += b[Math.min(H - 1, y + R + 1) * W + x] - b[Math.max(0, y - R) * W + x];
      }
    }
  }
  const data = new Uint8Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(a[i] * 255);
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, W, H };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.room = null;
    this.tiles = null;
    this.lights = [];
    this.rays = [];
    this.sky = null;
    this.disposables = [];
  }

  load(id) {
    if (this.group) {
      this.scene.remove(this.group);
      this.disposables.forEach((d) => d.dispose());
      this.group.traverse((o) => {
        if (o.material && o.material.dispose) o.material.dispose();
      });
    }
    this.disposables = [];
    this.lights = [];
    this.rays = [];
    const room = ROOMS[id];
    this.room = room;
    this.w = room.w;
    this.h = room.h;
    this.tiles = room.tiles.slice();
    this.biome = BIOMES[room.biome];
    const G = (this.group = new THREE.Group());
    this.scene.add(G);
    const r = rng(hashStr(id));
    const bname = room.biome;

    // sky (follows the camera)
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMaterial(bname));
    this.sky.renderOrder = ORDER.sky;
    this.sky.frustumCulled = false;
    G.add(this.sky);

    // parallax layers
    [-36, -21, -9].forEach((z, i) => {
      const m = 19 * ((CAM_DIST - z) / CAM_DIST - 1) + 5;
      const Wu = room.w + m * 2;
      const Hu = room.h + m * 2;
      const tex = paintLayer(bname, Wu, Hu, i / 2, hashStr(id) + i * 101);
      this.disposables.push(tex);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(Wu, Hu),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }),
      );
      mesh.position.set(room.w / 2, room.h / 2, z);
      mesh.renderOrder = ORDER.layer + i;
      G.add(mesh);
    });

    // light shafts
    for (let i = 0; i < room.w / 9; i++) {
      const ray = quad(rayTex(), r.range(2.5, 6), r.range(16, 30), { add: true, tint: this.biome.fog, alpha: 0.2, anchor: 't', order: ORDER.ray });
      ray.position.set(r.range(0, room.w), room.h - r.range(0, room.h * 0.4), -4);
      ray.rotation.z = r.range(0.2, 0.42);
      ray.userData.a = r.range(0.1, 0.24);
      ray.userData.ph = r() * 7;
      this.rays.push(ray);
      G.add(ray);
    }

    // terrain
    const mask = buildMask(room);
    this.disposables.push(mask.tex);
    const terr = new THREE.Mesh(
      new THREE.PlaneGeometry(room.w + PAD * 2, room.h + PAD * 2),
      terrainMaterial(mask.tex, new THREE.Vector2(1 / mask.W, 1 / mask.H), bname),
    );
    terr.position.set(room.w / 2, room.h / 2, 0);
    terr.renderOrder = ORDER.terrain;
    G.add(terr);

    // thorns, planks and scattered decor
    const floorSets = {
      kiln: ['grass', 'grass', 'rock', 'shards', 'bricks', 'grass'],
      root: ['grass', 'grass', 'fern', 'pod', 'rock', 'fern', 'grass'],
      vault: ['crystal', 'grass', 'rock', 'crystal', 'grass'],
    }[bname];
    const ceilSets = { kiln: ['chain', 'stalactite', 'stalactite'], root: ['vine', 'vine', 'stalactite', 'vine'], vault: ['stalactite', 'crystal', 'vine'] }[bname];
    const sizes = {
      grass: [1.5, 1.05], fern: [1.7, 1.7], rock: [1.5, 0.95], shards: [1.4, 0.7], bricks: [1.9, 0.95], crystal: [1.5, 1.5], pod: [0.9, 1.5],
      vine: [0.6, 3], chain: [0.42, 2.8], stalactite: [1.1, 2.2],
    };
    const addDecor = (kind, x, y, hang, front) => {
      const v = r.int(0, 2);
      const [w, h] = sizes[kind];
      const s = r.range(0.75, 1.25);
      const sway = kind === 'grass' || kind === 'fern' ? 0.12 : kind === 'vine' ? 0.2 : kind === 'chain' ? 0.05 : kind === 'pod' ? 0.06 : 0;
      const flip = hang && kind === 'crystal';
      const q = quad(decorTex(kind, bname, v), w * s * (r() < 0.5 ? -1 : 1), h * s * (flip ? -1 : 1), {
        anchor: hang && !flip ? 't' : 'b', sway, hang, order: front ? ORDER.front : ORDER.decor,
      });
      q.position.set(x, y + (hang ? 0.12 : -0.1), front ? 0.6 : -0.15);
      G.add(q);
      if ((kind === 'crystal' || kind === 'pod') && r() < 0.6) {
        const gl = glow(this.biome.glow, 3.2 * s, 0.22);
        gl.position.set(x, y + (hang ? -0.7 : 0.8), -0.1);
        gl.renderOrder = ORDER.decor;
        G.add(gl);
      }
    };
    for (let y = 0; y < room.h; y++) {
      let runStart = -1;
      for (let x = 0; x <= room.w; x++) {
        const t = x < room.w ? this.tiles[y * room.w + x] : 0;
        // contiguous one-way platforms become a single plank
        if (t === T.PLAT && runStart < 0) runStart = x;
        if (t !== T.PLAT && runStart >= 0) {
          const len = x - runStart;
          const p = quad(decorTex('plank', bname, r.int(0, 2)), len + 0.25, 0.5, { anchor: 't', order: ORDER.prop });
          p.position.set(runStart + len / 2, y + 1.05, 0.02);
          G.add(p);
          runStart = -1;
        }
        if (x >= room.w) continue;
        if (t === T.THORN) {
          const q = quad(decorTex('thorn', bname, r.int(0, 2)), 1.3 * (r() < 0.5 ? -1 : 1), r.range(0.95, 1.2), { anchor: 'b', order: ORDER.prop });
          q.position.set(x + 0.5, y - 0.08, 0.05);
          G.add(q);
        }
        if (t !== T.SOLID) continue;
        const above = y + 1 < room.h ? this.tiles[(y + 1) * room.w + x] : 1;
        const below = y > 0 ? this.tiles[(y - 1) * room.w + x] : 1;
        if (above === T.EMPTY) {
          if (r() < 0.55) addDecor(r.pick(floorSets), x + r(), y + 1, false, r() < 0.22);
          if (r() < 0.035) {
            const f = quad(decorTex('fgRock', bname, r.int(0, 2)), r.range(5, 8), r.range(4, 6), { anchor: 'b', order: ORDER.fg });
            f.position.set(x, y - 3.4, 5.5);
            G.add(f);
          }
        }
        if (below === T.EMPTY) {
          if (r() < 0.3) addDecor(r.pick(ceilSets), x + r(), y, true, false);
          if (r() < 0.03) {
            const f = quad(decorTex('fgHang', bname, r.int(0, 2)), r.range(4, 7), r.range(5, 8), { anchor: 't', order: ORDER.fg });
            f.position.set(x, y + 3.2, 5.5);
            G.add(f);
          }
        }
      }
    }
    return room;
  }

  addLight(x, y, radius, color, intensity = 1) {
    const l = { x, y, radius, color, intensity, flicker: Math.random() * 10 };
    this.lights.push(l);
    return l;
  }

  tile(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return T.SOLID;
    return this.tiles[y * this.w + x];
  }
  solid(x, y) {
    return this.tile(x, y) === T.SOLID;
  }
  setTile(x, y, v) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[y * this.w + x] = v;
  }
  // is there walkable ground just below point (x,y)?
  groundBelow(x, y) {
    const t = this.tile(Math.floor(x), Math.floor(y - 0.2));
    return t === T.SOLID || t === T.PLAT;
  }

  // Axis-separated AABB movement. Body: x (centre), y (feet), w, h, vx, vy.
  move(e, dt) {
    e.onGround = false;
    e.hitWall = 0;
    e.hitCeil = false;
    const hw = e.w / 2;
    if (e.vx !== 0) {
      const dir = e.vx > 0 ? 1 : -1;
      let nx = e.x + e.vx * dt;
      const tx = Math.floor(nx + dir * hw);
      const y0 = Math.floor(e.y + 0.001);
      const y1 = Math.floor(e.y + e.h - 0.001);
      for (let ty = y0; ty <= y1; ty++) {
        if (this.solid(tx, ty)) {
          nx = dir > 0 ? tx - hw - 0.0005 : tx + 1 + hw + 0.0005;
          e.hitWall = dir;
          break;
        }
      }
      e.x = nx;
    }
    let ny = e.y + e.vy * dt;
    const x0 = Math.floor(e.x - hw + 0.001);
    const x1 = Math.floor(e.x + hw - 0.001);
    if (e.vy <= 0) {
      const ty = Math.floor(ny - 0.0001);
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.tile(tx, ty);
        if (t === T.SOLID || (t === T.PLAT && !e.dropThrough && e.y >= ty + 1 - 0.0005)) {
          ny = ty + 1;
          e.onGround = true;
          break;
        }
      }
    } else {
      const ty = Math.floor(ny + e.h);
      for (let tx = x0; tx <= x1; tx++) {
        if (this.solid(tx, ty)) {
          ny = ty - e.h - 0.0005;
          e.hitCeil = true;
          break;
        }
      }
    }
    e.y = ny;
    if (e.onGround && e.vy < 0) e.vy = 0;
    if (e.hitCeil && e.vy > 0) e.vy = 0;
  }

  // does a box touch thorns? (box given by left, bottom, w, h)
  thornsIn(x, y, w, h) {
    for (let ty = Math.floor(y); ty <= Math.floor(y + h); ty++) {
      for (let tx = Math.floor(x); tx <= Math.floor(x + w); tx++) {
        if (this.tile(tx, ty) === T.THORN && y < ty + 0.66 && x + w > tx + 0.2 && x < tx + 0.8) return true;
      }
    }
    return false;
  }

  solidIn(x, y, w, h) {
    for (let ty = Math.floor(y); ty <= Math.floor(y + h); ty++) {
      for (let tx = Math.floor(x); tx <= Math.floor(x + w); tx++) if (this.solid(tx, ty)) return true;
    }
    return false;
  }

  update(time, camera, viewH, aspect) {
    if (this.sky) {
      const d = CAM_DIST + 60;
      const s = (d / CAM_DIST) * viewH * 1.25;
      this.sky.position.set(camera.position.x, camera.position.y, -60);
      this.sky.scale.set(s * aspect, s, 1);
      this.sky.material.uniforms.uOff.value.set(camera.position.x * 0.03, camera.position.y * 0.03);
    }
    for (const ray of this.rays) {
      ray.material.uniforms.uAlpha.value = ray.userData.a * (0.65 + 0.35 * Math.sin(time * 0.5 + ray.userData.ph));
    }
  }
}

export { spriteMat, sprite };
