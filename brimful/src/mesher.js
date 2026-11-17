// Turns one 16x16 column of the voxel grid into buffers for four meshes:
// solid (lit, shadowed cubes), flora (grass blades, flowers, waterweed), mist (steam) and
// glow (lava + fire). Water is not meshed here: it is a simulated surface drawn by its own shader.
import { Color } from 'three';
import { W, H, D, RIM, CH, AIR, STONE, SOIL, TURF, SAND, ICE, LAVA, STEAM, WOOD, LEAF, TUFT, WEED, SEED, FIRE, BASALT, PLANK, THATCH, SPRING, DRAIN, LAMP, CROP, SNOW, REED, MUSH, HEARTH, OPAQUE } from './world.js';

class Buf {
  constructor(cap) {
    this.pos = new Float32Array(cap * 3); this.nor = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4); this.idx = new Uint32Array(cap * 1.5);
    this.cap = cap; this.v = 0; this.i = 0;
  }
  reset() { this.v = 0; this.i = 0; }
  // four corners (CCW seen from outside), one normal, rgb + alpha, per-corner brightness
  quad(P, nx, ny, nz, r, g, b, a, s0, s1, s2, s3) {
    if (this.v + 4 > this.cap) return;
    const v = this.v, p = this.pos, n = this.nor, c = this.col;
    for (let k = 0; k < 4; k++) {
      const o = (v + k) * 3;
      p[o] = P[k * 3]; p[o + 1] = P[k * 3 + 1]; p[o + 2] = P[k * 3 + 2];
      n[o] = nx; n[o + 1] = ny; n[o + 2] = nz;
      const s = k === 0 ? s0 : k === 1 ? s1 : k === 2 ? s2 : s3, q = (v + k) * 4;
      c[q] = r * s; c[q + 1] = g * s; c[q + 2] = b * s; c[q + 3] = a;
    }
    const ix = this.idx, i = this.i;
    if (s0 + s2 >= s1 + s3) { ix[i] = v; ix[i + 1] = v + 1; ix[i + 2] = v + 2; ix[i + 3] = v; ix[i + 4] = v + 2; ix[i + 5] = v + 3; }
    else { ix[i] = v + 1; ix[i + 1] = v + 2; ix[i + 2] = v + 3; ix[i + 3] = v + 1; ix[i + 4] = v + 3; ix[i + 5] = v; }
    this.v += 4; this.i += 6;
  }
  out() {
    return { pos: this.pos.slice(0, this.v * 3), nor: this.nor.slice(0, this.v * 3), col: this.col.slice(0, this.v * 4), idx: this.idx.slice(0, this.i), count: this.i };
  }
}

const S = new Buf(120000), F = new Buf(20000), G = new Buf(30000), L = new Buf(90000);
const Q = new Float32Array(12);
const AOS = [0.5, 0.68, 0.85, 1];

const lin = (hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; };
const COL = [];
COL[STONE] = lin(0x9d9ca6); COL[SOIL] = lin(0x7f5638); COL[TURF] = lin(0x6aa846); COL[SAND] = lin(0xecd79c);
COL[WOOD] = lin(0x8a5a34); COL[LEAF] = lin(0x4f9f4c); COL[BASALT] = lin(0x45434d); COL[SEED] = lin(0xd0a65c);
COL[SPRING] = lin(0x6fb6d6); COL[DRAIN] = lin(0x55565e);
COL[ICE] = lin(0xbfe6f7); COL[PLANK] = lin(0xc79a62); COL[THATCH] = lin(0xd9b65a);
const C_STEAM = lin(0xffffff), C_LAVA1 = lin(0xff5a12), C_LAVA2 = lin(0xffc23a), C_FIRE = lin(0xffb028);
const C_G1 = lin(0x4f9a3c), C_G2 = lin(0x78bf4e), C_G3 = lin(0xa6d568), C_DRY = lin(0xb9b96a), C_WEED = lin(0x2f9a72);
const FLOWERS = [lin(0x9af0ff), lin(0xffd24a), lin(0xff8fc0), lin(0xb99cff), lin(0xfff6f0)];
// biome palettes: turf, grass base x2, grass tip, leaves x3
export const BIOMES = [
  ['Meadow', 0x6aa846, 0x4f9a3c, 0x78bf4e, 0xa6d568, [0x4f9f4c, 0x5fae4e, 0x3f8f52]],
  ['Forest', 0x4c8a3c, 0x356f30, 0x4f9440, 0x7ab85a, [0x2f7a3c, 0x3a8a40, 0x276a38]],
  ['Autumn', 0x9aa046, 0x8a8a34, 0xb7a640, 0xe0c860, [0xd9722a, 0xe3a02c, 0xb8442a]],
  ['Blossom', 0x7cc05c, 0x5ea848, 0x8fd068, 0xc8ec90, [0xf5a8c8, 0xfbc4d8, 0xe88ab4]],
  ['Savanna', 0xb0a04c, 0x9a8a3a, 0xc4b050, 0xe6d47a, [0x8a9a3c, 0x9aa648, 0x7a8a34]],
  ['Tundra', 0xcfe0e0, 0x9fbfc0, 0xc8dede, 0xf4fbff, [0x3f7a6a, 0x4a8a78, 0x346a5c]],
  ['Swamp', 0x5a7a3a, 0x3f5f2c, 0x5a7c36, 0x86a04c, [0x4a6a34, 0x58783a, 0x3c5a2e]],
  ['Jungle', 0x3fae4a, 0x1f8a3a, 0x38b44a, 0x8ae05a, [0x1f9a44, 0x2cb04e, 0x148a3c]],
  ['Heath', 0x8a8a5a, 0x6a7a44, 0x9a6aa0, 0xd08ad8, [0x6a8a4a, 0x7a9a54, 0x5a7a42]],
].map(([name, t, a, b, c, lf]) => ({ name, hex: t, turf: lin(t), g1: lin(a), g2: lin(b), tip: lin(c), leaf: lf.map(lin) }));
let bio = BIOMES[0];

const hash = (i) => (Math.imul(i ^ (i >>> 15), 0x2c1b3c6d) >>> 24) / 255;
let hs = 1;
const hr = () => { hs = Math.imul(hs ^ (hs >>> 13), 0x5bd1e995) + 0x6b43a9b5 | 0; return ((hs >>> 8) & 0xffff) / 65536; };

let grassDensity = 12;
export function setGrassDensity(n) { grassDensity = n; }

let mat, aux, cd, cs, biome;
function op(x, y, z) {
  if (y < 0) return 1;
  if (y >= H) return 0;
  if (x < 0 || x >= W || z < 0 || z >= D) return y < RIM ? 1 : 0;
  return OPAQUE[mat[x + W * (z + D * y)]];
}
const P3 = [0, 0, 0], N3 = [0, 0, 0];

function cube(x, y, z, m, i) {
  let base = COL[m]; const j = 0.88 + 0.24 * hash(i);
  const bb = biome[x + z * W], evergreen = m === LEAF && (bb === 1 || bb === 5 || bb === 7);   // conifers and jungle keep their colour all year
  if (m === LEAF) base = BIOMES[bb].leaf[Math.min(2, (hash(i * 7 + 3) * 3) | 0)];
  else if (m === TURF) base = BIOMES[biome[x + z * W]].turf;
  for (let f = 0; f < 6; f++) {
    const a = f >> 1, s = f & 1, u = (a + 1) % 3, v = (a + 2) % 3;
    N3[0] = x; N3[1] = y; N3[2] = z; N3[a] += s ? 1 : -1;
    if (op(N3[0], N3[1], N3[2])) continue;
    let r = base[0], g = base[1], b = base[2];
    if (m === TURF && f !== 3) { const so = COL[SOIL]; const k = f === 2 ? 0 : 0.22; r = so[0] + (r - so[0]) * k; g = so[1] + (g - so[1]) * k; b = so[2] + (b - so[2]) * k; }
    else if ((m === WOOD || m === PLANK) && a === 1) { r *= 1.3; g *= 1.25; b *= 1.12; }
    r *= j; g *= j; b *= j;
    let sh0, sh1, sh2, sh3;
    for (let k = 0; k < 4; k++) {
      // corner order: CCW from outside for the + face, reversed for the - face
      const cu = s ? (k === 1 || k === 2 ? 1 : 0) : (k === 2 || k === 3 ? 1 : 0);
      const cv = s ? (k >= 2 ? 1 : 0) : (k === 1 || k === 2 ? 1 : 0);
      P3[0] = x; P3[1] = y; P3[2] = z; P3[a] += s; P3[u] += cu; P3[v] += cv;
      Q[k * 3] = P3[0]; Q[k * 3 + 1] = P3[1]; Q[k * 3 + 2] = P3[2];
      const du = cu ? 1 : -1, dv = cv ? 1 : -1;
      P3[0] = N3[0]; P3[1] = N3[1]; P3[2] = N3[2]; P3[u] += du;
      const s1 = op(P3[0], P3[1], P3[2]);
      P3[v] += dv; const cc = op(P3[0], P3[1], P3[2]);
      P3[u] -= du; const s2 = op(P3[0], P3[1], P3[2]);
      const sh = AOS[s1 && s2 ? 0 : 3 - s1 - s2 - cc];
      if (k === 0) sh0 = sh; else if (k === 1) sh1 = sh; else if (k === 2) sh2 = sh; else sh3 = sh;
    }
    // alpha doubles as a material hint for the shader: 0.5 = ice
    S.quad(Q, a === 0 ? (s ? 1 : -1) : 0, a === 1 ? (s ? 1 : -1) : 0, a === 2 ? (s ? 1 : -1) : 0, r, g, b, m === ICE ? 0.5 : evergreen ? 0.85 : 1, sh0, sh1, sh2, sh3);
  }
}

function setQ(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
  Q[0] = x0; Q[1] = y0; Q[2] = z0; Q[3] = x1; Q[4] = y1; Q[5] = z1; Q[6] = x2; Q[7] = y2; Q[8] = z2; Q[9] = x3; Q[10] = y3; Q[11] = z3;
}

function box(B, cx, cy, cz, hx, hy, hz, r, g, b, a) {
  const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
  setQ(x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1); B.quad(Q, 1, 0, 0, r, g, b, a, 1, 1, 1, 1);
  setQ(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0); B.quad(Q, -1, 0, 0, r, g, b, a, 1, 1, 1, 1);
  setQ(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0); B.quad(Q, 0, 1, 0, r, g, b, a, 1, 1, 1, 1);
  setQ(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1); B.quad(Q, 0, -1, 0, r, g, b, a, 0.7, 0.7, 0.7, 0.7);
  setQ(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1); B.quad(Q, 0, 0, 1, r, g, b, a, 1, 1, 1, 1);
  setQ(x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0); B.quad(Q, 0, 0, -1, r, g, b, a, 1, 1, 1, 1);
}

// One tapered blade. Vertex alpha tells the shader what to do: 0 = rooted, 0.5 = sways, 1 = sways + glows at night.
function blade(bx, by, bz, h, w, ang, lean, r, g, b, tr, tg, tb, tipA) {
  const dx = Math.cos(ang) * w, dz = Math.sin(ang) * w, lx = -Math.sin(ang) * lean, lz = Math.cos(ang) * lean;
  setQ(bx - dx, by, bz - dz, bx + dx, by, bz + dz, bx + dx * 0.15 + lx, by + h, bz + dz * 0.15 + lz, bx - dx * 0.15 + lx, by + h, bz - dz * 0.15 + lz);
  const v = L.v;
  L.quad(Q, 0, 1, 0, r, g, b, 0, 1, 1, 1, 1);
  if (L.v > v) { const cc = L.col; for (let q = 2; q < 4; q++) { const o = (v + q) * 4; cc[o] = tr; cc[o + 1] = tg; cc[o + 2] = tb; cc[o + 3] = tipA; } }
}
// a little upright flower head: two crossed quads
function head(x, y, z, s, c) {
  for (let k = 0; k < 2; k++) {
    const dx = k ? s : 0, dz = k ? 0 : s;
    setQ(x - dx, y - s, z - dz, x + dx, y - s, z + dz, x + dx, y + s, z + dz, x - dx, y + s, z - dz);
    L.quad(Q, 0, 1, 0, c[0], c[1], c[2], 1, 1, 1, 1, 1);
  }
  setQ(x - s, y + s * 0.2, z - s, x - s, y + s * 0.2, z + s, x + s, y + s * 0.2, z + s, x + s, y + s * 0.2, z - s);
  L.quad(Q, 0, 1, 0, c[0], c[1], c[2], 1, 1, 1, 1, 1);
}

function grass(x, y, z, i, n, tall) {
  bio = BIOMES[biome[x + z * W]];
  hs = (i * 2654435761) | 0 || 1;
  for (let k = 0; k < n; k++) {
    const bx = x + 0.06 + hr() * 0.88, bz = z + 0.06 + hr() * 0.88, t = hr();
    const h = tall ? 0.55 + hr() * 0.55 : 0.16 + hr() * 0.3;
    const c = t < 0.1 ? C_DRY : t < 0.55 ? bio.g1 : bio.g2, sh = 0.5 + hr() * 0.16;
    const tip = t < 0.1 ? C_DRY : bio.tip, ts = 0.74 + hr() * 0.16;
    blade(bx, y, bz, h, tall ? 0.055 : 0.042, hr() * 6.283, (hr() - 0.3) * h * 0.5, c[0] * sh, c[1] * sh, c[2] * sh, tip[0] * ts, tip[1] * ts, tip[2] * ts, 0.5);
  }
}

function lavaTop(x, y, z) { return x >= 0 && x < W && z >= 0 && z < D && y >= 0 && y < H && mat[x + W * (z + D * y)] === LAVA; }
function lavaH(x, y, z) {
  if (!lavaTop(x, y, z)) return -1;
  if (lavaTop(x, y + 1, z)) return 1;
  return Math.max(0.1, aux[x + W * (z + D * y)] / 8);
}
const HC = [0, 0, 0, 0];
function lava(x, y, z, i) {
  const B = G;
  for (let c = 0; c < 4; c++) {
    const ox = c & 1, oz = c >> 1; let sum = 0, n = 0, full = false;
    for (let k = 0; k < 4; k++) {
      const h = lavaH(x + ox - (k & 1), y, z + oz - (k >> 1));
      if (h < 0) continue;
      if (h >= 1) full = true;
      sum += h; n++;
    }
    HC[c] = full ? 1 : sum / n;
  }
  const h00 = HC[0], h10 = HC[1], h01 = HC[2], h11 = HC[3];
  const k = hash(i + (aux[i] << 3)), r = C_LAVA1[0] + (C_LAVA2[0] - C_LAVA1[0]) * k * k, g = C_LAVA1[1] + (C_LAVA2[1] - C_LAVA1[1]) * k * k, b = C_LAVA1[2];
  if (!lavaTop(x, y + 1, z)) { setQ(x, y + h00, z, x, y + h01, z + 1, x + 1, y + h11, z + 1, x + 1, y + h10, z); B.quad(Q, 0, 1, 0, r, g, b, 1, 1, 1, 1, 1); }
  const dr = r * 0.8, dg = g * 0.7, db = b;
  if (!lavaTop(x + 1, y, z) && !op(x + 1, y, z)) { setQ(x + 1, y, z, x + 1, y + h10, z, x + 1, y + h11, z + 1, x + 1, y, z + 1); B.quad(Q, 1, 0, 0, dr, dg, db, 1, 1, 1, 1, 1); }
  if (!lavaTop(x - 1, y, z) && !op(x - 1, y, z)) { setQ(x, y, z, x, y, z + 1, x, y + h01, z + 1, x, y + h00, z); B.quad(Q, -1, 0, 0, dr, dg, db, 1, 1, 1, 1, 1); }
  if (!lavaTop(x, y, z + 1) && !op(x, y, z + 1)) { setQ(x, y, z + 1, x + 1, y, z + 1, x + 1, y + h11, z + 1, x, y + h01, z + 1); B.quad(Q, 0, 0, 1, dr, dg, db, 1, 1, 1, 1, 1); }
  if (!lavaTop(x, y, z - 1) && !op(x, y, z - 1)) { setQ(x, y, z, x, y + h00, z, x + 1, y + h10, z, x + 1, y, z); B.quad(Q, 0, 0, -1, dr, dg, db, 1, 1, 1, 1, 1); }
  if (!lavaTop(x, y - 1, z) && !op(x, y - 1, z)) { setQ(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1); B.quad(Q, 0, -1, 0, dr, dg, db, 1, 1, 1, 1, 1); }
}

export function buildChunk(world, cx, cz) {
  mat = world.mat; aux = world.aux; cd = world.cd; cs = world.cs; biome = world.biome;
  S.reset(); F.reset(); G.reset(); L.reset();
  const x0 = cx * CH, z0 = cz * CH;
  for (let y = 0; y < H; y++) for (let z = z0; z < z0 + CH; z++) {
    let i = x0 + W * (z + D * y);
    for (let x = x0; x < x0 + CH; x++, i++) {
      const m = mat[i];
      if (m === AIR) continue;
      if (OPAQUE[m]) {
        cube(x, y, z, m, i);
        if (m === TURF && grassDensity > 0 && y < H - 1) {
          const up = mat[i + W * D], c = x + z * W;
          if ((up === AIR || up === TUFT) && !(cd[c] > 0.15 && cs[c] > y + 1.1)) grass(x, y + 1, z, i, grassDensity, false);
        }
        continue;
      }
      switch (m) {
        case WEED: {
          hs = (i * 40503) | 0 || 1;
          for (let k = 0; k < 3; k++) {
            const s = 0.5 + hr() * 0.3;
            blade(x + 0.2 + hr() * 0.6, y, z + 0.2 + hr() * 0.6, 0.85 + hr() * 0.3, 0.13, hr() * 6.283, (hr() - 0.5) * 0.4,
              C_WEED[0] * s * 0.6, C_WEED[1] * s * 0.7, C_WEED[2] * s * 0.7, C_WEED[0] * 0.7, C_WEED[1] * 1.3, C_WEED[2] * 1.4, 1);
          }
          break;
        }
        case LAVA: lava(x, y, z, i); break;
        case REED: { // cattails standing in the shallows
          hs = (i * 6151 + aux[i]) | 0 || 1;
          for (let k = 0; k < 4; k++) {
            const bx = x + 0.15 + hr() * 0.7, bz = z + 0.15 + hr() * 0.7, h = 1.0 + hr() * 0.9, s = 0.55 + hr() * 0.25;
            blade(bx, y, bz, h, 0.045, hr() * 6.283, (hr() - 0.5) * 0.25, 0.2 * s, 0.34 * s, 0.1 * s, 0.42 * s, 0.6 * s, 0.2 * s, 0.5);
            if (k < 2) { const hy = y + h * 0.86; box(L, bx, hy, bz, 0.045, 0.14, 0.045, 0.24, 0.13, 0.06, 0.5); }
          }
          break;
        }
        case MUSH: {
          hs = (i * 4073 + aux[i]) | 0 || 1;
          const glow = biome[x + z * W] === 6, n = 1 + (aux[i] & 1);
          for (let k = 0; k < n; k++) {
            const bx = x + 0.25 + hr() * 0.5, bz = z + 0.25 + hr() * 0.5, h = 0.14 + hr() * 0.14, r = 0.09 + hr() * 0.07;
            box(L, bx, y + h * 0.5, bz, 0.035, h * 0.5, 0.035, 0.85, 0.8, 0.7, 0);
            if (glow) box(L, bx, y + h + 0.045, bz, r, 0.045, r, 0.3, 0.85, 0.8, 1);
            else if (aux[i] & 2) box(L, bx, y + h + 0.045, bz, r, 0.045, r, 0.62, 0.42, 0.26, 0);
            else box(L, bx, y + h + 0.045, bz, r, 0.045, r, 0.8, 0.16, 0.12, 0);
          }
          break;
        }
        case SNOW: { const h = 0.06 + aux[i] * 0.07, k = 0.92 + hash(i) * 0.08; box(S, x + 0.5, y + h, z + 0.5, 0.5, h, 0.5, 0.93 * k, 0.96 * k, 1.0 * k, 1); break; }
        case HEARTH: {
          box(S, x + 0.5, y + 0.08, z + 0.5, 0.42, 0.08, 0.42, 0.3, 0.29, 0.31, 1);            // ring of stones
          box(S, x + 0.5, y + 0.2, z + 0.5, 0.3, 0.06, 0.09, 0.3, 0.17, 0.08, 1); box(S, x + 0.5, y + 0.2, z + 0.5, 0.09, 0.06, 0.3, 0.3, 0.17, 0.08, 1);   // crossed logs
          const k = hash(i); box(G, x + 0.5, y + 0.5, z + 0.5, 0.2, 0.26, 0.2, C_FIRE[0], C_FIRE[1] * (0.7 + k * 0.4), C_FIRE[2], 1);
          break;
        }
        case LAMP: box(G, x + 0.5, y + 0.22, z + 0.5, 0.16, 0.2, 0.16, 2.6, 1.5, 0.5, 1); break;
        case CROP: {
          const a = aux[i], ripe = a >= 3; hs = (i * 7919) | 0 || 1;
          const g0 = ripe ? [0.5, 0.36, 0.08] : [0.14, 0.36, 0.08], g1 = ripe ? [0.86, 0.62, 0.16] : [0.3, 0.6, 0.16];
          for (let k = 0; k < 5; k++) {
            const bx = x + 0.15 + hr() * 0.7, bz = z + 0.15 + hr() * 0.7, h = 0.25 + a * 0.22 + hr() * 0.1;
            blade(bx, y, bz, h, 0.05, hr() * 6.283, 0, g0[0], g0[1], g0[2], g1[0], g1[1], g1[2], 0.5);
            if (ripe) head(bx, y + h, bz, 0.07, [0.95, 0.72, 0.2]);
          }
          break;
        }
        case STEAM: { const k = hash(i); box(F, x + 0.5, y + 0.5, z + 0.5, 0.3 + k * 0.15, 0.25, 0.3 + k * 0.15, C_STEAM[0], C_STEAM[1], C_STEAM[2], 0.28); break; }
        case FIRE: { const k = hash(i + aux[i]); box(G, x + 0.5, y + 0.4, z + 0.5, 0.36, 0.4, 0.36, C_FIRE[0], C_FIRE[1] * (0.6 + k * 0.6), C_FIRE[2], 1); break; }
        case SEED: box(S, x + 0.5, y + 0.14, z + 0.5, 0.16, 0.14, 0.16, COL[SEED][0], COL[SEED][1], COL[SEED][2], 1); break;
        case TUFT: {
          grass(x, y, z, i ^ 0x5a5a, Math.max(4, grassDensity), true);
          const a = aux[i];
          if (a % 3 === 0) { // flowers on stems
            hs = (i * 9176 + a) | 0 || 1;
            const fl = FLOWERS[(a >> 2) % 5], nf = 1 + (a & 1);
            for (let k = 0; k < nf; k++) {
              const fx = x + 0.25 + hr() * 0.5, fz = z + 0.25 + hr() * 0.5, fh = 0.6 + hr() * 0.4;
              blade(fx, y, fz, fh, 0.03, hr() * 6.283, 0, C_G1[0] * 0.6, C_G1[1] * 0.6, C_G1[2] * 0.6, C_G2[0], C_G2[1], C_G2[2], 0.5);
              head(fx, y + fh, fz, 0.11, fl);
            }
          }
          break;
        }
      }
    }
  }
  return { solid: S.out(), mist: F.out(), glow: G.out(), flora: L.out() };
}

export const MATERIAL_COLORS = { [STONE]: 0x9d9ca6, [SOIL]: 0x7f5638, [TURF]: 0x6aa846, [SAND]: 0xecd79c, [LAVA]: 0xff6a1a, [WOOD]: 0x8a5a34, [LEAF]: 0x4f9f4c, [BASALT]: 0x45434d, [SEED]: 0xd0a65c, [TUFT]: 0x86cf58, [WEED]: 0x2f9a72, [ICE]: 0xbfe6f7, [PLANK]: 0xc79a62, [THATCH]: 0xd9b65a, [SPRING]: 0x6fb6d6, [DRAIN]: 0x55565e, [CROP]: 0xd9a53a, [SNOW]: 0xf2f6ff, [REED]: 0x6a8a3a, [MUSH]: 0xcc2a1e };
export const WATER_COLOR = 0x3fb0d6;
