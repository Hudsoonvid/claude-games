// Turns one 16x16 column of the voxel grid into three meshes' worth of buffers:
// solid (lit, shadowed), fluid (translucent water + steam) and glow (lava + fire).
import { Color } from 'three';
import { W, H, D, RIM, CH, AIR, STONE, SOIL, TURF, SAND, WATER, LAVA, STEAM, WOOD, LEAF, TUFT, WEED, SEED, FIRE, BASALT, OPAQUE } from './world.js';

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

const S = new Buf(120000), F = new Buf(60000), G = new Buf(30000), L = new Buf(40000);
const Q = new Float32Array(12);
const AOS = [0.5, 0.68, 0.85, 1];

const lin = (hex) => { const c = new Color(hex); return [c.r, c.g, c.b]; };
const COL = [];
COL[STONE] = lin(0x9a9aa6); COL[SOIL] = lin(0x84593a); COL[TURF] = lin(0x74b84c); COL[SAND] = lin(0xecd79c);
COL[WOOD] = lin(0x8f5c33); COL[LEAF] = lin(0x4a9f52); COL[BASALT] = lin(0x45434d); COL[SEED] = lin(0xd0a65c);
const C_WATER = lin(0x45b4d8), C_DEEP = lin(0x1f6fb5), C_STEAM = lin(0xffffff);
const C_LAVA1 = lin(0xff5a12), C_LAVA2 = lin(0xffc23a), C_FIRE = lin(0xffb028);
const C_TUFT = lin(0x7cc452), C_TUFT2 = lin(0x63b04a), C_WEED = lin(0x2f9a72);
const FLOWERS = [lin(0x9af0ff), lin(0xffd24a), lin(0xff8fc0), lin(0xb99cff)];

const hash = (i) => (Math.imul(i ^ (i >>> 15), 0x2c1b3c6d) >>> 24) / 255;

let mat, aux;
function op(x, y, z) {
  if (y < 0) return 1;
  if (y >= H) return 0;
  if (x < 0 || x >= W || z < 0 || z >= D) return y < RIM ? 1 : 0;
  return OPAQUE[mat[x + W * (z + D * y)]];
}
const P3 = [0, 0, 0], N3 = [0, 0, 0];

function cube(x, y, z, m, i) {
  const base = COL[m], j = 0.86 + 0.28 * hash(i);
  for (let f = 0; f < 6; f++) {
    const a = f >> 1, s = f & 1, u = (a + 1) % 3, v = (a + 2) % 3;
    N3[0] = x; N3[1] = y; N3[2] = z; N3[a] += s ? 1 : -1;
    if (op(N3[0], N3[1], N3[2])) continue;
    // faces touching water are flagged (alpha 0) so the shader can paint caustics on them
    let wet = 1;
    if (N3[1] < H && N3[0] >= 0 && N3[0] < W && N3[2] >= 0 && N3[2] < D) { const nm = mat[N3[0] + W * (N3[2] + D * N3[1])]; if (nm === WATER || nm === WEED) wet = 0; }
    let r = base[0], g = base[1], b = base[2];
    if (m === TURF && f !== 3) { const so = COL[SOIL]; const k = f === 2 ? 0 : 0.22; r = so[0] + (r - so[0]) * k; g = so[1] + (g - so[1]) * k; b = so[2] + (b - so[2]) * k; }
    else if (m === WOOD && a === 1) { r *= 1.35; g *= 1.3; b *= 1.15; }
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
    S.quad(Q, a === 0 ? (s ? 1 : -1) : 0, a === 1 ? (s ? 1 : -1) : 0, a === 2 ? (s ? 1 : -1) : 0, r, g, b, wet, sh0, sh1, sh2, sh3);
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

// alpha channel: 0 = rooted, 0.5 = sways, 1 = sways and glows at night
function cross(x, y, z, h, r, g, b, tr, tg, tb, wob, tipA) {
  const a = 0.12 + wob * 0.1, c = 0.5;
  for (let k = 0; k < 2; k++) {
    const x0 = x + (k ? 1 - a : a), z0 = z + a, x1 = x + (k ? a : 1 - a), z1 = z + 1 - a;
    setQ(x0, y, z0, x1, y, z1, x1 + (c - x1 + x) * 0.75, y + h, z1 + (c - z1 + z) * 0.75, x0 + (c - x0 + x) * 0.75, y + h, z0 + (c - z0 + z) * 0.75);
    const v = L.v;
    L.quad(Q, 0, 1, 0, r, g, b, 0, 1, 1, 1, 1);
    if (L.v > v) { // tint the tips
      const cc = L.col; for (let q = 2; q < 4; q++) { const o = (v + q) * 4; cc[o] = tr; cc[o + 1] = tg; cc[o + 2] = tb; cc[o + 3] = tipA; }
    }
  }
}

// cls 0 = water (and waterweed, which counts as full water), 1 = lava
function same(cls, x, y, z) {
  if (x < 0 || x >= W || z < 0 || z >= D || y < 0 || y >= H) return false;
  const m = mat[x + W * (z + D * y)];
  return cls ? m === LAVA : (m === WATER || m === WEED);
}
function hOf(cls, x, y, z) {
  if (!same(cls, x, y, z)) return -1;
  if (same(cls, x, y + 1, z)) return 1;
  const i = x + W * (z + D * y);
  return mat[i] === WEED ? 1 : Math.max(0.1, aux[i] / 8);
}
const HC = [0, 0, 0, 0];
function fluid(B, cls, x, y, z, i) {
  for (let c = 0; c < 4; c++) {
    const ox = c & 1, oz = c >> 1; let sum = 0, n = 0, full = false;
    for (let k = 0; k < 4; k++) {
      const h = hOf(cls, x + ox - (k & 1), y, z + oz - (k >> 1));
      if (h < 0) continue;
      if (h >= 1) full = true;
      sum += h; n++;
    }
    HC[c] = full ? 1 : sum / n;
  }
  const h00 = HC[0], h10 = HC[1], h01 = HC[2], h11 = HC[3];
  let r, g, b, a;
  if (cls) { const k = hash(i + (aux[i] << 3)); r = C_LAVA1[0] + (C_LAVA2[0] - C_LAVA1[0]) * k * k; g = C_LAVA1[1] + (C_LAVA2[1] - C_LAVA1[1]) * k * k; b = C_LAVA1[2]; a = 1; }
  else {
    const thin = mat[i] === WATER && !same(0, x, y - 1, z) ? Math.min(1, aux[i] / 5) : 1;
    let dep = 0; while (dep < 6 && same(0, x, y - 1 - dep, z)) dep++;
    const k = dep / 6;
    r = C_WATER[0] + (C_DEEP[0] - C_WATER[0]) * k; g = C_WATER[1] + (C_DEEP[1] - C_WATER[1]) * k; b = C_WATER[2] + (C_DEEP[2] - C_WATER[2]) * k;
    a = (0.42 + 0.4 * k) * (0.45 + 0.55 * thin);
  }
  if (!same(cls, x, y + 1, z)) {
    setQ(x, y + h00, z, x, y + h01, z + 1, x + 1, y + h11, z + 1, x + 1, y + h10, z);
    B.quad(Q, 0, 1, 0, r, g, b, a, 1, 1, 1, 1);
  }
  const dr = cls ? r * 0.8 : C_DEEP[0], dg = cls ? g * 0.7 : C_DEEP[1], db = cls ? b : C_DEEP[2];
  if (!same(cls, x + 1, y, z) && !op(x + 1, y, z)) { setQ(x + 1, y, z, x + 1, y + h10, z, x + 1, y + h11, z + 1, x + 1, y, z + 1); B.quad(Q, 1, 0, 0, dr, dg, db, a, 1, 1, 1, 1); }
  if (!same(cls, x - 1, y, z) && !op(x - 1, y, z)) { setQ(x, y, z, x, y, z + 1, x, y + h01, z + 1, x, y + h00, z); B.quad(Q, -1, 0, 0, dr, dg, db, a, 1, 1, 1, 1); }
  if (!same(cls, x, y, z + 1) && !op(x, y, z + 1)) { setQ(x, y, z + 1, x + 1, y, z + 1, x + 1, y + h11, z + 1, x, y + h01, z + 1); B.quad(Q, 0, 0, 1, dr, dg, db, a, 1, 1, 1, 1); }
  if (!same(cls, x, y, z - 1) && !op(x, y, z - 1)) { setQ(x, y, z, x, y + h00, z, x + 1, y + h10, z, x + 1, y, z); B.quad(Q, 0, 0, -1, dr, dg, db, a, 1, 1, 1, 1); }
  if (!same(cls, x, y - 1, z) && !op(x, y - 1, z)) { setQ(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1); B.quad(Q, 0, -1, 0, dr, dg, db, a, 1, 1, 1, 1); }
}

export function buildChunk(world, cx, cz) {
  mat = world.mat; aux = world.aux;
  S.reset(); F.reset(); G.reset(); L.reset();
  const x0 = cx * CH, z0 = cz * CH;
  for (let y = 0; y < H; y++) for (let z = z0; z < z0 + CH; z++) {
    let i = x0 + W * (z + D * y);
    for (let x = x0; x < x0 + CH; x++, i++) {
      const m = mat[i];
      if (m === AIR) continue;
      if (OPAQUE[m]) { cube(x, y, z, m, i); continue; }
      switch (m) {
        case WATER: fluid(F, 0, x, y, z, i); break;
        case WEED: {
          fluid(F, 0, x, y, z, i);
          const k = hash(i); cross(x, y, z, 1, C_WEED[0] * 0.7, C_WEED[1] * 0.7, C_WEED[2] * 0.7, C_WEED[0] * 0.6, C_WEED[1] * (1.1 + k * 0.4), C_WEED[2] * 1.3, k, 1);
          break;
        }
        case LAVA: fluid(G, 1, x, y, z, i); break;
        case STEAM: { const k = hash(i); box(F, x + 0.5, y + 0.5, z + 0.5, 0.3 + k * 0.15, 0.25, 0.3 + k * 0.15, C_STEAM[0], C_STEAM[1], C_STEAM[2], 0.28); break; }
        case FIRE: { const k = hash(i + aux[i]); box(G, x + 0.5, y + 0.4, z + 0.5, 0.36, 0.4, 0.36, C_FIRE[0], C_FIRE[1] * (0.6 + k * 0.6), C_FIRE[2], 1); break; }
        case SEED: box(S, x + 0.5, y + 0.14, z + 0.5, 0.16, 0.14, 0.16, COL[SEED][0], COL[SEED][1], COL[SEED][2], 1); break;
        case TUFT: {
          const a = aux[i], k = hash(i), c = k < 0.5 ? C_TUFT : C_TUFT2;
          let tr = c[0] * 1.25, tg = c[1] * 1.25, tb = c[2] * 1.25, h = 0.45 + k * 0.4, tip = 0.5;
          if (a % 4 === 0) { const fl = FLOWERS[(a >> 2) & 3]; tr = fl[0]; tg = fl[1]; tb = fl[2]; h += 0.15; tip = 1; }
          cross(x, y, z, h, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, tr, tg, tb, k, tip);
          break;
        }
      }
    }
  }
  return { solid: S.out(), fluid: F.out(), glow: G.out(), flora: L.out() };
}

export const MATERIAL_COLORS = { [STONE]: 0x9a9aa6, [SOIL]: 0x84593a, [TURF]: 0x74b84c, [SAND]: 0xecd79c, [WATER]: 0x3fb0d6, [LAVA]: 0xff6a1a, [WOOD]: 0x8f5c33, [LEAF]: 0x4a9f52, [BASALT]: 0x45434d, [SEED]: 0xd0a65c, [TUFT]: 0x86cf58, [WEED]: 0x2f9a72 };
