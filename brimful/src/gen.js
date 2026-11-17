// Starting worlds. Each preset is a recipe: a height function plus which biomes, how much water, what grows.
// Everything is placed relative to the world size so any size works.
import { W, D, H, RIM, WR, WW, WH, AIR, STONE, SOIL, TURF, SAND, LAVA, WOOD, TUFT, BASALT, SNOW, HEARTH, SPRING, rnd, ri } from './world.js';
import { BIO } from './biomes.js';

function makeNoise() {
  const P = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) P[i] = rnd();
  const g = (x, z) => P[((x & 63) + (z & 63) * 64)];
  const sm = (t) => t * t * (3 - 2 * t);
  const n2 = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = sm(x - xi), fz = sm(z - zi);
    const a = g(xi, zi), b = g(xi + 1, zi), c = g(xi, zi + 1), d = g(xi + 1, zi + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  const f = (x, z) => n2(x, z) * 0.55 + n2(x * 2.1 + 9, z * 2.1 + 4) * 0.3 + n2(x * 4.3 + 3, z * 4.3 + 7) * 0.15;
  f.raw = n2;
  return f;
}

const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const quant = (h, s) => Math.round(h / s) * s;
const sum = (list, f) => { let s = 0; for (const p of list) s += f(p); return s; };
const ALL = BIO.map((_, i) => i);

// height helpers shared by the recipes
const hillsAndPonds = (amp, pondDepth) => (c, x, z) => sum(c.hills, (p) => gauss(x, z, p[0], p[1], p[2])) * amp - sum(c.ponds, (p) => gauss(x, z, p[0], p[1], p[2])) * pondDepth;
const ALPINE_BANDS = [[15, 0], [20, 1], [25, 17], [99, 5]];
const atollSand = (c, x, z, h, n) => !(h > c.WL + 2 && n > 0.42);
const meander = (c, x, amp = 0.22) => D / 2 + Math.sin(x / W * 6.28 * 1.25 + c.ph) * D * amp + (c.n(x, D / 2) - 0.5) * 6;

const P = (id, label, group, note, biomes, height, o = {}) => ({ id, label, group, note, biomes, height, ...o });

export const PRESETS = [
  // ---------------------------------------------------------------- gentle
  P('valley', 'Valley', 'Gentle', 'Ponds, hills and trees', [0, 0, 1, 3, 2], (c, x, z) => 12.5 + c.n(x, z) * 8 + c.hp(c, x, z), { hp: hillsAndPonds(9, 14) }),
  P('meadows', 'Meadows', 'Gentle', 'Soft rolling grassland', [0, 0, 3, 9, 15], (c, x, z) => 12.5 + c.n(x, z) * 4 + c.nn(x, z, 30, 7) * 4 + c.hp(c, x, z), { hp: hillsAndPonds(3, 8), pondN: 1.5, pondR: [4, 7], trees: 0.6, tufts: 1.6 }),
  P('patchwork', 'Patchwork', 'Gentle', 'Every biome side by side', ALL, (c, x, z) => 12.5 + c.n(x, z) * 8 + c.hp(c, x, z), { hp: hillsAndPonds(9, 14), bcount: 2.4, trees: 1.4 }),
  P('orchard', 'Orchard hills', 'Gentle', 'Fruit trees and farms', [21, 21, 0, 3], (c, x, z) => 12.5 + c.n(x, z) * 7 + c.hp(c, x, z), { hp: hillsAndPonds(5, 10), trees: 1.4, villages: 1.5 }),
  P('lavender', 'Lavender fields', 'Gentle', 'Purple as far as you can see', [15, 15, 15, 0, 21], (c, x, z) => 12.5 + c.n(x, z) * 3 + c.hp(c, x, z), { hp: hillsAndPonds(2, 8), trees: 0.5, tufts: 2 }),
  P('steppe', 'Steppe', 'Gentle', 'Wide dry grassland', [19, 19, 4, 8], (c, x, z) => 12.5 + c.n(x, z) * 4 + Math.sin(x / 9 + c.nn(x, z, 20, 3) * 4) * 1.2 + c.hp(c, x, z), { hp: hillsAndPonds(2, 7), pondN: 0.6, trees: 0.4 }),
  P('birch', 'Birch hills', 'Gentle', 'Pale woods on green hills', [9, 9, 1, 0], (c, x, z) => 12.5 + c.n(x, z) * 9 + c.hp(c, x, z), { hp: hillsAndPonds(10, 12), trees: 1.3 }),
  P('terraces', 'Terraced hills', 'Gentle', 'Stepped slopes and farms', [0, 21, 18, 7], (c, x, z) => quant(11 + c.n(x, z) * 6 + sum(c.hills, (p) => gauss(x, z, p[0], p[1], p[2] * 1.4)) * 13 - sum(c.ponds, (p) => gauss(x, z, p[0], p[1], p[2])) * 9, 2), { villages: 1.5 }),
  P('green', 'Village green', 'Gentle', 'Flat, friendly and busy', [0, 21, 0], (c, x, z) => 12.5 + c.n(x, z) * 2 + c.hp(c, x, z), { hp: hillsAndPonds(1, 6), pondN: 0.5, villages: 3, trees: 0.6 }),
  // ---------------------------------------------------------------- water
  P('atoll', 'Atoll', 'Water', 'A sand ring around a lagoon', [18, 18, 11], (c, x, z) => {
    const r = Math.hypot((x - W / 2) / (W / 64), (z - D / 2) / (D / 64)) + (c.n(x, z) - 0.5) * 8;
    return 5 + Math.exp(-((r - 17) ** 2) / 22) * 9.5 + c.n(x, z) * 2 + gauss(x, z, W / 2, D / 2, 6 * c.S) * 1.5;
  }, { sand: atollSand, trees: 0.6 }),
  P('archipelago', 'Archipelago', 'Water', 'Scattered islands in a shallow sea', [0, 18, 3, 4, 13], (c, x, z) => Math.min(4.5 + c.n(x, z) * 3.5 + sum(c.isles, (p) => gauss(x, z, p[0], p[1], p[2]) * (8 + p[2] * 0.5)), 19 + c.n(x, z) * 3), { sand: atollSand, trees: 0.8 }),
  P('lakes', 'Lake district', 'Water', 'Dozens of little lakes', [0, 1, 9, 13], (c, x, z) => 13 + c.n(x, z) * 5 + c.hp(c, x, z), { hp: hillsAndPonds(6, 9), pondN: 6, pondR: [3.5, 7] }),
  P('delta', 'River delta', 'Water', 'Channels braiding into the sea', [13, 6, 0, 18], (c, x, z) => {
    let h = 7 + (x / W) * 10 + c.n(x, z) * 3;
    for (let k = 0; k < 4; k++) {
      const zc = D * (0.14 + 0.24 * k) + Math.sin(x / W * 7 + k * 1.7 + c.ph) * D * 0.06;
      h -= (1 - sstep(0.8, 3, Math.abs(z - zc))) * 3.5 * (1 - sstep(0.8, 0.95, x / W));
    }
    return h;
  }, { trees: 1.2 }),
  P('fjords', 'Fjords', 'Water', 'Deep inlets between high ridges', [1, 10, 24, 17], (c, x, z) => {
    let h = 21 + c.n(x, z) * 7 + c.ridge(x, z, 12) * 4;
    for (let k = 0; k < 3; k++) {
      const z0 = D * (0.2 + 0.3 * k) + Math.sin(x / W * 5 + k) * D * 0.05, reach = c.reach[k];
      const f = (1 - sstep(1.5, 4.5, Math.abs(z - z0))) * (1 - sstep(reach - 0.15, reach, x / W));
      h = h * (1 - f) + 4 * f;
    }
    return h;
  }, { byHeight: [[16, 1], [21, 10], [26, 24], [99, 5]], snowline: 27, villages: 0.6 }),
  P('mangrove', 'Mangrove coast', 'Water', 'Tangled roots along a warm shore', [13, 13, 18, 6], (c, x, z) => 6 + (z / D) * 11 + c.n(x, z) * 4, { trees: 2 }),
  P('lagoon', 'Lagoon', 'Water', 'A crescent of beach around warm water', [18, 18, 11, 13], (c, x, z) => {
    const dx = (x - W / 2) / (W / 64), dz = (z - D / 2) / (D / 64), r = Math.hypot(dx, dz) + (c.n(x, z) - 0.5) * 7;
    let gap = Math.abs(((Math.atan2(dz, dx) - c.ph + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return 5 + Math.exp(-((r - 18) ** 2) / 40) * 12 * sstep(0.5, 1.1, gap) + c.n(x, z) * 2;
  }, { sand: atollSand, trees: 0.8 }),
  P('greatlake', 'Great lake', 'Water', 'One big lake with islands', [0, 1, 9, 2], (c, x, z) => 13.5 + c.n(x, z) * 5 + sum(c.hills, (p) => gauss(x, z, p[0], p[1], p[2])) * 5 - gauss(x, z, W / 2, D / 2, Math.min(W, D) * 0.33) * 16 + sum(c.isles, (p) => gauss(x, z, p[0], p[1], p[2] * 0.5)) * 9 * gauss(x, z, W / 2, D / 2, Math.min(W, D) * 0.3), { isleN: 1.5 }),
  P('cascades', 'Cascades', 'Water', 'Falls tumbling down stepped cliffs', [7, 20, 0, 14], (c, x, z) => {
    const t = 1 - (x / W * 0.6 + z / D * 0.4), along = Math.abs((x / W - z / D) * Math.min(W, D) * 0.7 - (c.n(x, z) - 0.5) * 6);
    return quant(6 + t * 24 + c.n(x, z) * 2, 4) - (1 - sstep(1, 3, along)) * 1.5;
  }, { springs: 3, trees: 1.3 }),
  P('oasis', 'Desert oasis', 'Water', 'Rolling sand around a palm-fringed pool', [11], (c, x, z) => 13 + Math.sin((x * 0.7 + z * 0.35) / 4.5 + c.nn(x, z, 20, 0) * 6) * 2.2 + c.n(x, z) * 5 - gauss(x, z, c.oasis[0], c.oasis[1], c.oasis[2]) * 9,
    { biomeAt: (c, x, z) => (gauss(x, z, c.oasis[0], c.oasis[1], c.oasis[2] * 1.6) > 0.25 ? 18 : 11), villages: 0.6 }),
  // ---------------------------------------------------------------- rugged
  P('canyon', 'Canyon', 'Rugged', 'A river winding through high ground', [12, 12, 4, 19], (c, x, z) => { const dist = Math.abs(z - meander(c, x)); return 7.5 + sstep(2.5, 11, dist) * 12.5 + c.n(x, z) * 3.5 + sstep(11, 24, dist) * 2; }),
  P('highlands', 'Highlands', 'Rugged', 'Stone peaks above a mountain lake', [5, 1, 8, 10], (c, x, z) => { const rg = c.ridge(x, z, 11); return 11.5 + c.n(x, z) * 5 + rg * rg * rg * 20 - gauss(x, z, c.ponds[0][0], c.ponds[0][1], 11 * c.S) * 16; }, { stoneAbove: 21 }),
  P('mesas', 'Mesas', 'Rugged', 'Flat-topped buttes over a red desert', [12, 12, 19, 11], (c, x, z) => 10.5 + c.n(x, z) * 2 + sstep(0.5, 0.56, c.nn(x, z, 16, 30)) * (9 + quant(c.nn(x, z, 40, 5) * 6, 3)), { trees: 0.5 }),
  P('alpine', 'Alpine peaks', 'Rugged', 'Snowy summits above meadows and a lake', [0], (c, x, z) => { const rg = c.ridge(x, z, 13); return 12 + c.n(x, z) * 4 + rg * rg * rg * 24 - gauss(x, z, c.ponds[0][0], c.ponds[0][1], 9 * c.S) * 10; }, { byHeight: ALPINE_BANDS, snowline: 27 }),
  P('twinpeaks', 'Twin peaks', 'Rugged', 'Two mountains and a saddle between', [0], (c, x, z) => 11 + c.n(x, z) * 4 + Math.max(0, 26 - Math.hypot(x - W * 0.3, z - D * 0.4) / c.S * 1.1) + Math.max(0, 25 - Math.hypot(x - W * 0.7, z - D * 0.62) / c.S * 1.1) - gauss(x, z, W * 0.5, D * 0.52, 7 * c.S) * 9, { byHeight: ALPINE_BANDS, snowline: 26 }),
  P('crater', 'Crater lake', 'Rugged', 'A high lake in an old crater', [1, 10, 17], (c, x, z) => {
    const r = Math.hypot(x - W / 2, z - D / 2) / c.S;
    return 11 + c.n(x, z) * 3 + Math.exp(-((r - 16) ** 2) / 18) * 16 + 6 * (1 - sstep(13, 16, r));
  }, { level: (c, x, z) => (Math.hypot(x - W / 2, z - D / 2) / c.S < 14 ? 22 : c.WL), snowline: 29 }),
  P('gorge', 'Gorge', 'Rugged', 'A narrow river gorge through a plateau', [24, 1, 9, 10], (c, x, z) => { const dist = Math.abs(z - meander(c, x, 0.18)); return 7 + sstep(1.5, 3.5, dist) * (16 + c.n(x, z) * 3); }),
  P('plateaus', 'Plateaus', 'Rugged', 'Tablelands and sheer cliffs', [4, 19, 0, 12], (c, x, z) => 11 + c.n(x, z) * 2 + quant(sstep(0.45, 0.55, c.nn(x, z, 15, 11)) * 10 + sstep(0.62, 0.68, c.nn(x, z, 15, 11)) * 7, 1), { trees: 0.7 }),
  // ---------------------------------------------------------------- wild
  P('volcano', 'Volcano', 'Wild', 'A lava crater above a plain', [22, 2, 4, 0], (c, x, z) => {
    const r = Math.hypot(x - c.vx, z - c.vz) / c.vs;
    return 12.5 + c.n(x, z) * 3 + Math.max(0, 22 - r * 1.25) - Math.max(0, 5 - r) * 3.2 - gauss(x, z, W * 0.19, D * 0.75, 9 * c.S) * 8;
  }, { cones: 1, villages: 0.6 }),
  P('twinvolcano', 'Twin volcanoes', 'Wild', 'Two smoking cones over ash fields', [22, 22, 4], (c, x, z) => 11.5 + c.n(x, z) * 3 + sum(c.cones, (q) => { const r = Math.hypot(x - q[0], z - q[1]) / c.vs; return Math.max(0, 20 - r * 1.3) - Math.max(0, 4.5 - r) * 3.2; }), { cones: 2, villages: 0.4 }),
  P('ashlands', 'Ashlands', 'Wild', 'Black rock, dead trees and lava pools', [22], (c, x, z) => 11.5 + c.n(x, z) * 5, {
    rock: (c, x, z, h, depth, n) => (depth <= 1 && c.nn(x, z, 7, 21) > 0.52 ? BASALT : 0), pools: (c, x, z, h) => (c.nn(x, z, 9, 40) > 0.68 && h < 15 ? 1 : 0), villages: 0, wl: 9 }),
  P('glacier', 'Glacier', 'Wild', 'Frozen lakes under deep snow', [23, 23, 5, 10], (c, x, z) => 12 + c.n(x, z) * 6 + c.hp(c, x, z), { hp: hillsAndPonds(7, 10), freeze: true, villages: 0.4 }),
  P('tundra', 'Tundra', 'Wild', 'Cold plains and dark taiga', [5, 5, 10], (c, x, z) => 12.5 + c.n(x, z) * 5 + c.hp(c, x, z), { hp: hillsAndPonds(4, 9) }),
  P('fungal', 'Fungal wilds', 'Wild', 'Giant mushrooms in a violet gloom', [16, 16, 6], (c, x, z) => 12.5 + c.n(x, z) * 7 + c.hp(c, x, z), { hp: hillsAndPonds(6, 10), trees: 1.4, villages: 0.5 }),
  P('jungleriver', 'Jungle river', 'Wild', 'A brown river through dense jungle', [7, 20, 18, 14], (c, x, z) => 7.5 + sstep(1.5, 6, Math.abs(z - meander(c, x, 0.25))) * 6 + c.n(x, z) * 4, { trees: 1.3 }),
  P('rainforest', 'Rainforest basin', 'Wild', 'Steamy, low and full of pools', [20, 20, 7, 13], (c, x, z) => 10.5 + c.n(x, z) * 4 + c.hp(c, x, z), { hp: hillsAndPonds(4, 6), pondN: 4, pondR: [4, 7], trees: 1.4 }),
  P('marsh', 'Marsh', 'Wild', 'Low, wet and overgrown', [6, 6, 13, 0], (c, x, z) => 8.6 + c.n(x, z) * 3.4 + c.nn(x, z, 5, 7) * 1.6, { sand: (c, x, z, h) => h < c.WL - 1, tufts: 3 }),
  P('bamboo', 'Bamboo valley', 'Wild', 'Tall green stems around a stream', [14, 14, 0, 7], (c, x, z) => 12.5 + c.n(x, z) * 6 + c.hp(c, x, z), { hp: hillsAndPonds(7, 11) }),
  P('redwoods', 'Redwood coast', 'Wild', 'Giant trees down to the sea', [24, 24, 1, 9], (c, x, z) => 13 + c.n(x, z) * 8 + c.hp(c, x, z) - (1 - sstep(0.1, 0.3, x / W)) * 8, { hp: hillsAndPonds(6, 0) }),
  P('moors', 'Moorland', 'Wild', 'Heather and wind on open hills', [25, 25, 8, 0], (c, x, z) => 13 + c.n(x, z) * 6 + c.hp(c, x, z), { hp: hillsAndPonds(5, 8), trees: 0.4 }),
  // ---------------------------------------------------------------- second batch
  P('wildflower', 'Wildflower meadow', 'Gentle', 'Every colour of bloom', [32, 32, 0, 15], (c, x, z) => 12.5 + c.n(x, z) * 4 + c.hp(c, x, z), { hp: hillsAndPonds(3, 8), trees: 0.4, tufts: 1.6 }),
  P('olivecoast', 'Olive coast', 'Gentle', 'Silver groves above a warm sea', [30, 30, 18, 19], (c, x, z) => 7 + (z / D) * 12 + c.n(x, z) * 5, { trees: 1.2, villages: 1.3 }),
  P('maple', 'Maple valley', 'Gentle', 'Red woods around a quiet pond', [29, 29, 0, 2], (c, x, z) => 12.5 + c.n(x, z) * 8 + c.hp(c, x, z), { hp: hillsAndPonds(9, 13), trees: 1.3 }),
  P('aspen', 'Aspen hills', 'Gentle', 'Golden leaves on rolling hills', [31, 31, 9, 0], (c, x, z) => 12.5 + c.n(x, z) * 9 + c.hp(c, x, z), { hp: hillsAndPonds(10, 11), trees: 1.3 }),
  P('riverbend', 'River bend', 'Water', 'A broad river looping through meadows', [0, 9, 29, 21], (c, x, z) => 7 + sstep(2, 8, Math.abs(z - meander(c, x, 0.3))) * 7 + c.n(x, z) * 3.5),
  P('bayou', 'Bayou', 'Water', 'Cypress and still black water', [28, 28, 6, 13], (c, x, z) => 9 + c.n(x, z) * 3.2 + c.nn(x, z, 6, 9) * 1.8, { sand: (c, x, z, h) => h < c.WL - 1, tufts: 2.5, trees: 1.3 }),
  P('floodplain', 'Floodplain', 'Water', 'A wide shallow river and wet fields', [0, 13, 19, 21], (c, x, z) => 8.5 + sstep(4, 14, Math.abs(z - meander(c, x, 0.12))) * 4.5 + c.n(x, z) * 2, { villages: 1.4 }),
  P('twinlakes', 'Twin lakes', 'Water', 'Two lakes joined by a stream', [0, 1, 9], (c, x, z) => {
    const a = gauss(x, z, W * 0.3, D * 0.45, 10 * c.S), b = gauss(x, z, W * 0.7, D * 0.55, 10 * c.S);
    const t = Math.max(0, Math.min(1, ((x - W * 0.3) * 0.4 + (z - D * 0.45) * 0.1) / (W * 0.16 + 0.01))), sz = D * 0.45 + t * D * 0.1, sx = W * 0.3 + t * W * 0.4;
    const stream = (1 - sstep(1, 2.6, Math.hypot(x - sx, z - sz))) * (x > W * 0.3 && x < W * 0.7 ? 1 : 0);
    return 13 + c.n(x, z) * 5 - (a + b) * 11 - stream * 3;
  }),
  P('frozensea', 'Frozen sea', 'Water', 'Ice floes between snowy islands', [23, 5, 26], (c, x, z) => Math.min(4.5 + c.n(x, z) * 3.5 + sum(c.isles, (p) => gauss(x, z, p[0], p[1], p[2]) * (8 + p[2] * 0.5)), 19 + c.n(x, z) * 3), { freeze: true, villages: 0.4 }),
  P('volcanicisle', 'Volcanic island', 'Rugged', 'A smoking peak in the middle of the sea', [18, 22, 13], (c, x, z) => {
    const r = Math.hypot(x - W / 2, z - D / 2) / c.S;
    return 4 + c.n(x, z) * 3 + Math.exp(-(r * r) / 420) * 10 + Math.max(0, 20 - r * 1.3) - Math.max(0, 4.5 - r) * 3.2;
  }, { cones: 'center', sand: (c, x, z, h) => h <= c.WL + 2, villages: 0.6 }),
  P('badcanyons', 'Badlands canyons', 'Rugged', 'Red rock cut by dry gullies', [12, 12, 27], (c, x, z) => {
    let h = 21 + c.n(x, z) * 4;
    for (let k = 0; k < 3; k++) { const z0 = D * (0.2 + 0.3 * k) + Math.sin(x / W * 6 + k * 2 + c.ph) * D * 0.08; h -= (1 - sstep(1.5, 7, Math.abs(z - z0))) * 12; }
    return h;
  }, { trees: 0.5 }),
  P('pillars', 'Stone pillars', 'Rugged', 'Tall rock spires over scrub', [27, 12, 19], (c, x, z) => 11 + c.n(x, z) * 3 + sum(c.pillars, (p) => (1 - sstep(p[2] * 0.6, p[2], Math.hypot(x - p[0], z - p[1]))) * p[3]), { stoneAbove: 15, trees: 0.5 }),
  P('snowmountains', 'Snowy mountains', 'Rugged', 'Deep snow from the treeline up', [0], (c, x, z) => { const rg = c.ridge(x, z, 12); return 13 + c.n(x, z) * 5 + rg * rg * 22; }, { byHeight: [[14, 26], [20, 10], [99, 5]], snowline: 22, villages: 0.5 }),
  P('moonglade', 'Moonglade', 'Wild', 'Blue willows and glowing pools', [34, 34, 16, 6], (c, x, z) => 12 + c.n(x, z) * 6 + c.hp(c, x, z), { hp: hillsAndPonds(5, 11), pondN: 2, pondR: [4, 8], villages: 0.5 }),
  P('emberwoods', 'Ember woods', 'Wild', 'Crimson conifers and lava seeps', [33, 33, 22], (c, x, z) => 12.5 + c.n(x, z) * 6, { pools: (c, x, z, h) => (c.nn(x, z, 8, 77) > 0.72 && h < 16 ? 1 : 0), villages: 0.3, wl: 9 }),
  P('baobab', 'Baobab plains', 'Wild', 'Great flat-topped trees on golden grass', [35, 35, 4, 19], (c, x, z) => 12.5 + c.n(x, z) * 3 + c.hp(c, x, z), { hp: hillsAndPonds(2, 7), pondN: 0.6, trees: 0.8 }),
  P('checker', 'Biome checkerboard', 'Special', 'Every biome in its own square', [0], (c, x, z) => 12.5 + c.n(x, z) * 5, { biomeAt: (c, x, z) => (((x >> 3) * 7 + (z >> 3) * 13) % BIO.length) }),
  P('spiral', 'Spiral island', 'Special', 'A ridge winding round a central lake', [0, 3, 9, 21], (c, x, z) => {
    const dx = x - W / 2, dz = z - D / 2, r = Math.hypot(dx, dz) / c.S, a = (Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2);
    const d = Math.abs((((r / 7 - a) % 1) + 1) % 1 - 0.5);
    return 6 + (1 - sstep(0.12, 0.3, d)) * 12 * sstep(3, 8, r) + c.n(x, z) * 2;
  }, { sand: atollSand }),
  // ---------------------------------------------------------------- special
  P('random', 'Surprise me', 'Special', 'Any of the above, with mixed-up biomes', [0], null),
  P('flat', 'Flat sandbox', 'Special', 'Level ground, nothing else', [0], () => 12, { wl: 0, trees: 0, tufts: 0.2, villages: 0 }),
  P('bare', 'Bare tray', 'Special', 'Nothing but a little sand', [0], null),
];
export const WORLD_TYPES = PRESETS.map((p) => [p.id, p.label, p.note, p.group]);

function tree(world, x, y, z, b) {
  const tk = BIO[b].trunk, h = tk[0] + ri(tk[1]);
  for (let k = 0; k < h; k++) world.set(x, y + k, z, WOOD);
  world.crown(x, y + h, z, 2.2 + rnd() * 0.8);
}

export function generate(world, presetId) {
  world.clear();
  let pre = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
  if (pre.id === 'bare') {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { world.set(x, 0, z, STONE); world.set(x, 1, z, STONE); world.set(x, 2, z, SAND); }
    world.updateBeds(); world.aggregate();
    return [];
  }
  let biomes = pre.biomes;
  if (pre.id === 'random') { // any landscape, any three or four biomes
    const pool = PRESETS.filter((p) => p.height && p.group !== 'Special');
    pre = pool[ri(pool.length)];
    biomes = Array.from({ length: 3 + ri(2) }, () => ri(BIO.length));
  }

  const noise = makeNoise(), ox = rnd() * 40, oz = rnd() * 40;
  const S = Math.min(W, D) / 64, area = (W * D) / 4096, WL = pre.wl ?? 11;
  const spots = (n, r0, r1) => Array.from({ length: Math.max(1, Math.round(n)) }, () => [W * (0.14 + rnd() * 0.72), D * (0.14 + rnd() * 0.72), r0 + rnd() * (r1 - r0)]);
  const c = {
    S, area, WL, ph: rnd() * 6.28, hp: pre.hp || (() => 0),
    n: (x, z) => noise(x / 14 + ox, z / 14 + oz),
    nn: (x, z, s, off) => noise(x / s + off + ox, z / s + off * 1.3 + oz),
    ridge: (x, z, s) => 1 - Math.abs(noise.raw(x / s + ox, z / s + oz) * 2 - 1),
    vx: W * 0.56, vz: D * 0.47, vs: Math.max(1, S),
    reach: [0.55 + rnd() * 0.3, 0.55 + rnd() * 0.3, 0.55 + rnd() * 0.3],
    oasis: [W * (0.35 + rnd() * 0.3), D * (0.35 + rnd() * 0.3), 8 * Math.max(1, S * 0.8)],
  };
  const nFeat = Math.max(1, Math.round(area));
  c.ponds = nFeat === 1 && !pre.pondN ? [[W * (0.3 + rnd() * 0.4), D * (0.3 + rnd() * 0.4), 9 + rnd() * 5]] : spots(nFeat * (pre.pondN || 1), ...(pre.pondR || [9, 14]));
  c.hills = spots(nFeat, 9, 14);
  c.isles = spots(7 * area * (pre.isleN || 1), 5, 10);
  c.cones = pre.cones === 2 ? [[W * 0.32, D * 0.36], [W * 0.68, D * 0.64]] : pre.cones === 'center' ? [[W / 2, D / 2]] : [[c.vx, c.vz]];
  c.pillars = Array.from({ length: Math.max(3, Math.round(12 * area)) }, () => [W * (0.1 + rnd() * 0.8), D * (0.1 + rnd() * 0.8), 1.3 + rnd() * 1.6, 8 + rnd() * 12]);

  // ---------------------------------------------------------------- heights
  const hm = new Int32Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let h = pre.height(c, x, z);
    const edge = Math.min(x, z, W - 1 - x, D - 1 - z), cap = RIM - 1 + edge * 0.6;   // the border stays at or under the rim
    if (h > cap) h = cap;
    hm[x + z * W] = Math.max(2, Math.min(H - 8, Math.round(h)));
  }

  // ---------------------------------------------------------------- biomes: by height, by rule, or a warped patchwork
  const seeds = Array.from({ length: Math.max(3, Math.round(5 * area * (pre.bcount || 1))) }, (_, k) => [rnd() * W, rnd() * D, biomes[k % biomes.length]]);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = hm[x + z * W];
    let b;
    if (pre.biomeAt) b = pre.biomeAt(c, x, z);
    else if (pre.byHeight) { const hh = h + (noise(x / 6 + 60, z / 6) - 0.5) * 3; b = pre.byHeight.find((q) => hh < q[0])[1]; }
    else {
      const wx = x + (noise(x / 9 + 50, z / 9) - 0.5) * 14, wz = z + (noise(x / 9, z / 9 + 80) - 0.5) * 14;
      let best = 1e9; b = 0;
      for (const s of seeds) { const d = (wx - s[0]) ** 2 + (wz - s[1]) ** 2; if (d < best) { best = d; b = s[2]; } }
    }
    world.biome[x + z * W] = b;
  }

  // ---------------------------------------------------------------- ground
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = hm[x + z * W], b = world.biome[x + z * W], n = noise(x / 6 + 20, z / 6 + 31);
    const sandy = pre.sand ? pre.sand(c, x, z, h, n) : h <= WL + 1 || BIO[b].sandy;
    const vr = Math.min(...c.cones.map((q) => Math.hypot(x - q[0], z - q[1]))) / c.vs;
    const snowcap = pre.snowline && h > pre.snowline + (n - 0.5) * 3;
    for (let y = 0; y < h; y++) {
      const depth = h - y;
      let m = pre.rock ? pre.rock(c, x, z, h, depth, n) : 0;
      if (!m) {
        if (pre.cones && vr < 14 + n * 4 && h > 14) m = depth < 2 && vr > 5 ? BASALT : (y < 3 || n > 0.35 ? BASALT : STONE);
        else if ((pre.stoneAbove && h > pre.stoneAbove + n * 3) || snowcap) m = STONE;
        else if (depth > 3 + n * 3) m = STONE;
        else m = sandy ? SAND : SOIL;
      }
      world.set(x, y, z, m);
    }
    if (snowcap) world.set(x, h, z, SNOW, 1 + ri(3));
    if (pre.cones && vr < 3.6) for (let y = h; y < h + 3; y++) world.set(x, y, z, LAVA, 8);
    if (pre.pools && pre.pools(c, x, z, h)) world.set(x, h - 1, z, LAVA, 8);
  }

  // ---------------------------------------------------------------- greenery
  const tuftP = 0.1 * (pre.tufts ?? 1);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = hm[x + z * W], bio = BIO[world.biome[x + z * W]];
    if (h <= WL) continue;
    if (world.get(x, h - 1, z) === SOIL && world.get(x, h, z) === AIR) {
      world.set(x, h - 1, z, TURF);
      if (bio.snowy && rnd() < 0.75) world.set(x, h, z, SNOW, 1 + ri(3));
      else if (rnd() < tuftP * bio.tufts) world.set(x, h, z, TUFT, ri(256));
    }
  }
  let trees = Math.round(9 * area * (pre.trees ?? 1)), tries = 3000 * area;
  while (trees > 0 && tries-- > 0) {
    const x = 4 + ri(W - 8), z = 4 + ri(D - 8), h = hm[x + z * W], b = world.biome[x + z * W], bio = BIO[b], top = world.get(x, h - 1, z);
    if (!(top === TURF || (bio.tree === 'palm' && top === SAND && h > WL + 1)) || h > H - 12 || rnd() * 3 > bio.trees) continue;
    let near = false;
    const gap = bio.tree === 'bamboo' ? 2 : bio.tree === 'bush' ? 2 : 4;
    for (let dz = -gap; dz <= gap && !near; dz++) for (let dx = -gap; dx <= gap; dx++) if (world.get(x + dx, h + 1, z + dz) === WOOD) { near = true; break; }
    if (near) continue;
    if (world.get(x, h, z) !== AIR && world.get(x, h, z) !== TUFT && world.get(x, h, z) !== SNOW) continue;
    world.set(x, h, z, AIR);
    tree(world, x, h, z, b);
    trees--;
  }

  // ---------------------------------------------------------------- water
  world.updateBeds();
  if (WL > 0 || pre.level) {
    for (let j = 0; j < WW * WH; j++) {
      const fx = (j % WW) / WR, fz = ((j / WW) | 0) / WR;
      const level = pre.level ? pre.level(c, fx, fz) : WL;
      world.wd[j] = Math.max(0, level - world.wb[j]);
    }
  }
  world.aggregate();
  for (let k = 0; k < (pre.springs || 0); k++) { // springs on the highest ground feed the falls
    let bx = 0, bz = 0, bh = -1;
    for (let t = 0; t < 400; t++) { const x = 3 + ri(W - 6), z = 3 + ri(D - 6), h = hm[x + z * W]; if (h > bh && world.get(x, h - 1, z) !== WOOD) { bh = h; bx = x; bz = z; } }
    if (bh > 0) world.set(bx, bh - 1, bz, SPRING);
  }
  if (pre.freeze) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) world.freeze(x, z);
  world.randomTicks(W * D * 160);          // let reeds, mushrooms and waterweed settle in before anyone looks

  // ---------------------------------------------------------------- villages: a few huts around a hearth on flat, dry ground
  const villages = [];
  let want = Math.round(Math.max(1, area) * (pre.villages ?? 1)), vt = 300 * Math.max(1, want);
  while (want > 0 && vt-- > 0) {
    const cx = 8 + ri(W - 16), cz = 8 + ri(D - 16), gy = hm[cx + cz * W];
    if (gy <= WL || gy > 26 || world.get(cx, gy - 1, cz) !== TURF) continue;
    if (villages.some((v) => Math.hypot(v.x - cx, v.z - cz) < 22)) continue;
    // find the sites first; build only if there is room for a real village, so no lone huts are left behind
    const sites = [], target = 3 + ri(3);
    for (let k = 0; k < 24 && sites.length < target; k++) {
      const a = rnd() * 6.283, r = 4 + rnd() * 5, hx = Math.round(cx + Math.cos(a) * r), hz = Math.round(cz + Math.sin(a) * r);
      if (hx < 3 || hz < 3 || hx > W - 4 || hz > D - 4 || sites.some((s) => Math.abs(s[0] - hx) < 4 && Math.abs(s[2] - hz) < 4)) continue;
      const hy = hm[hx + hz * W];
      let flat = hy > WL && world.clearFor(hx, hy, hz, 5);
      for (let dz = -1; dz <= 1 && flat; dz++) for (let dx = -1; dx <= 1; dx++) if (hm[hx + dx + (hz + dz) * W] !== hy) { flat = false; break; }
      if (flat) sites.push([hx, hy, hz]);
    }
    let huts = 0;
    if (sites.length >= 2) for (const s of sites) if (world.hut(s[0], s[1], s[2])) huts++;
    if (huts >= 2) {
      world.set(cx, gy - 1, cz, STONE); world.set(cx, gy, cz, HEARTH); // the village fire
      villages.push({ x: cx, y: gy, z: cz, huts }); want--;
    }
  }
  return villages;
}
