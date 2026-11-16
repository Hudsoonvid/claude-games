// Starting dioramas. Everything is placed relative to the world size so any size works.
import { W, D, RIM, AIR, STONE, SOIL, TURF, SAND, LAVA, WOOD, TUFT, BASALT, PLANK, rnd, ri } from './world.js';

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

function tree(world, x, y, z, h) {
  for (let k = 0; k < h; k++) world.set(x, y + k, z, WOOD);
  world.crown(x, y + h, z, 2.2 + rnd() * 0.8);
}

export const WORLD_TYPES = [
  ['valley', 'Valley', 'Ponds, hills and trees'],
  ['atoll', 'Atoll', 'A sand ring around a lagoon'],
  ['archipelago', 'Archipelago', 'Scattered islands in a shallow sea'],
  ['canyon', 'Canyon', 'A river winding through high ground'],
  ['highlands', 'Highlands', 'Stone peaks above a mountain lake'],
  ['marsh', 'Marsh', 'Low, wet and overgrown'],
  ['dunes', 'Dunes', 'Rolling sand around an oasis'],
  ['patchwork', 'Patchwork', 'Every biome side by side'],
  ['volcano', 'Volcano', 'A lava crater above a plain'],
  ['bare', 'Bare tray', 'Nothing but a little sand'],
];

export function generate(world, preset) {
  world.clear();
  const noise = makeNoise();
  const ox = rnd() * 40, oz = rnd() * 40, ph = rnd() * 6.28;
  const WL = 11; // water level (must stay below the rim)
  const hm = new Int32Array(W * D);
  const S = Math.min(W, D) / 64, area = (W * D) / 4096;

  if (preset === 'bare') {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      world.set(x, 0, z, STONE); world.set(x, 1, z, STONE); world.set(x, 2, z, SAND);
    }
    world.updateBeds(); world.aggregate();
    return [];
  }

  // scattered features so no two worlds match
  const spots = (n, r0, r1) => Array.from({ length: n }, () => [W * (0.14 + rnd() * 0.72), D * (0.14 + rnd() * 0.72), r0 + rnd() * (r1 - r0)]);
  const nFeat = Math.max(1, Math.round(area));
  const ponds = nFeat === 1 ? [[W * (0.3 + rnd() * 0.4), D * (0.3 + rnd() * 0.4), 9 + rnd() * 5]] : spots(nFeat, 9, 14);
  const hills = spots(nFeat, 9, 14);
  const isles = spots(Math.round(7 * area), 5, 10);
  const oasis = [W * (0.35 + rnd() * 0.3), D * (0.35 + rnd() * 0.3), 8];
  const vx = W * 0.56, vz = D * 0.47, vs = Math.max(1, S);

  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const n = noise(x / 14 + ox, z / 14 + oz);
    const edge = Math.min(x, z, W - 1 - x, D - 1 - z);
    let h;
    switch (preset) {
      case 'atoll': {
        const r = Math.hypot((x - W / 2) / (W / 64), (z - D / 2) / (D / 64)) + (n - 0.5) * 8;
        h = 5 + Math.exp(-((r - 17) ** 2) / 22) * 9.5 + n * 2 + gauss(x, z, W / 2, D / 2, 6 * S) * 1.5; break;
      }
      case 'archipelago':
        h = 4.5 + n * 3.5;
        for (const p of isles) h += gauss(x, z, p[0], p[1], p[2]) * (8 + p[2] * 0.5);
        h = Math.min(h, 19 + n * 3); break;
      case 'canyon': {
        const z0 = D / 2 + Math.sin(x / W * 6.28 * 1.25 + ph) * D * 0.22 + (n - 0.5) * 6;
        const dist = Math.abs(z - z0);
        h = 7.5 + sstep(2.5, 11, dist) * 12.5 + n * 3.5 + sstep(11, 24, dist) * 2; break;
      }
      case 'highlands': {
        const rg = 1 - Math.abs(noise.raw(x / 11 + ox, z / 11 + oz) * 2 - 1);
        h = 11.5 + n * 5 + rg * rg * rg * 20 - gauss(x, z, ponds[0][0], ponds[0][1], 11 * S) * 16; break;
      }
      case 'marsh':
        h = 8.6 + n * 3.4 + noise(x / 5 + 7, z / 5 + 3) * 1.6; break;
      case 'dunes': {
        const wave = Math.sin((x * 0.7 + z * 0.35) / 4.5 + noise(x / 20, z / 20) * 6);
        h = 13 + wave * 2.2 + n * 5 - gauss(x, z, oasis[0], oasis[1], oasis[2]) * 9; break;
      }
      case 'volcano': {
        const r = Math.hypot(x - vx, z - vz) / vs;
        h = 12.5 + n * 3 + Math.max(0, 22 - r * 1.25) - Math.max(0, 5 - r) * 3.2 - gauss(x, z, W * 0.19, D * 0.75, 9 * S) * 8; break;
      }
      default: // valley
        h = 12.5 + n * 8;
        for (const p of hills) h += gauss(x, z, p[0], p[1], p[2]) * 9;
        for (const p of ponds) h -= gauss(x, z, p[0], p[1], p[2]) * 14;
    }
    // keep the border at or under the rim so nothing starts out spilling
    const cap = RIM - 1 + edge * 0.6;
    if (h > cap) h = cap;
    hm[x + z * W] = Math.max(2, Math.round(h));
  }

  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = hm[x + z * W];
    const n = noise(x / 6 + 20, z / 6 + 31);
    const r = Math.hypot(x - vx, z - vz) / vs;
    const sandy = preset === 'atoll' || preset === 'archipelago'
      ? !(h > WL + 2 && n > 0.42)
      : preset === 'dunes' ? gauss(x, z, oasis[0], oasis[1], oasis[2] * 1.5) < 0.25 || h <= WL + 1
        : preset === 'marsh' ? h < WL - 1 : h <= WL + 1;
    for (let y = 0; y < h; y++) {
      let m;
      const depth = h - y;
      if (preset === 'volcano' && r < 14 + n * 4 && h > 14) m = depth < 2 && r > 5 ? BASALT : (y < 3 || n > 0.35 ? BASALT : STONE);
      else if (preset === 'highlands' && h > 21 + n * 3) m = STONE;
      else if (depth > 3 + n * 3) m = STONE;
      else m = sandy ? (depth <= 1 || preset !== 'atoll' ? SAND : SAND) : SOIL;
      world.set(x, y, z, m);
    }
    if (preset === 'volcano' && r < 3.6) for (let y = h; y < h + 3; y++) world.set(x, y, z, LAVA, 8);
  }

  // biomes: a warped patchwork of regions drawn from this world type's list
  const lists = { valley: [0, 0, 1, 3, 2], atoll: [0, 7], archipelago: [0, 7, 3, 4], canyon: [4, 0, 2, 8], highlands: [5, 1, 8, 5],
    marsh: [6, 6, 7, 0], dunes: [4], volcano: [0, 2, 4], patchwork: [0, 1, 2, 3, 4, 5, 6, 7, 8] };
  const blist = lists[preset] || [0];
  const seeds = Array.from({ length: Math.max(3, Math.round((preset === 'patchwork' ? 9 : 5) * area)) }, (_, k) => [rnd() * W, rnd() * D, blist[k % blist.length]]);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const wx = x + (noise(x / 9 + 50, z / 9) - 0.5) * 14, wz = z + (noise(x / 9, z / 9 + 80) - 0.5) * 14;
    let best = 1e9, b = 0;
    for (const s of seeds) { const d = (wx - s[0]) ** 2 + (wz - s[1]) ** 2; if (d < best) { best = d; b = s[2]; } }
    world.biome[x + z * W] = b;
  }
  const TREES = [1, 2.6, 1.6, 1.3, 0.35, 0.6, 1, 3, 0.4], TUFTS = [1, 0.7, 0.8, 2.2, 0.6, 0.3, 2.4, 1.6, 2.6];

  // greenery
  const tuftP = preset === 'marsh' ? 0.3 : 0.1;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = hm[x + z * W];
    if (h <= WL) continue;
    if (world.get(x, h - 1, z) === SOIL && world.get(x, h, z) === AIR) {
      world.set(x, h - 1, z, TURF);
      if (rnd() < tuftP * TUFTS[world.biome[x + z * W]]) world.set(x, h, z, TUFT, ri(256));
    }
  }
  const per = { atoll: 5, archipelago: 7, volcano: 6, dunes: 3, marsh: 5, highlands: 7, canyon: 10 }[preset] ?? 9;
  let trees = Math.round(per * area * (preset === 'patchwork' ? 1.5 : 1)), tries = 2500 * area;
  while (trees > 0 && tries-- > 0) {
    const x = 4 + ri(W - 8), z = 4 + ri(D - 8), h = hm[x + z * W];
    if (world.get(x, h - 1, z) !== TURF || h > 30 || rnd() * 3 > TREES[world.biome[x + z * W]]) continue;
    let near = false;
    for (let dz = -4; dz <= 4 && !near; dz++) for (let dx = -4; dx <= 4; dx++) if (world.get(x + dx, h + 1, z + dz) === WOOD) { near = true; break; }
    if (near) continue;
    world.set(x, h, z, AIR);
    tree(world, x, h, z, 3 + ri(4));
    trees--;
  }
  world.fillTo(WL);

  // villages: a few huts around a hearth on flat, dry ground. Returned so the caller can add the villagers.
  const villages = [];
  let want = preset === 'volcano' ? 1 : Math.max(1, Math.round(area)), vt = 300;
  while (want > 0 && vt-- > 0) {
    const cx = 8 + ri(W - 16), cz = 8 + ri(D - 16), gy = hm[cx + cz * W];
    if (gy <= WL || gy > 26 || world.get(cx, gy - 1, cz) !== TURF) continue;
    if (villages.some((v) => Math.hypot(v.x - cx, v.z - cz) < 22)) continue;
    let huts = 0;
    for (let k = 0; k < 14 && huts < 3 + ri(3); k++) {
      const a = rnd() * 6.283, r = 4 + rnd() * 5, hx = Math.round(cx + Math.cos(a) * r), hz = Math.round(cz + Math.sin(a) * r);
      if (hx < 3 || hz < 3 || hx > W - 4 || hz > D - 4) continue;
      const hy = hm[hx + hz * W];
      let flat = true;
      for (let dz = -1; dz <= 1 && flat; dz++) for (let dx = -1; dx <= 1; dx++) if (hm[hx + dx + (hz + dz) * W] !== hy) { flat = false; break; }
      if (flat && world.hut(hx, hy, hz)) huts++;
    }
    if (huts >= 2) {
      world.set(cx, gy - 1, cz, STONE); world.set(cx, gy, cz, PLANK); // the hearth post
      villages.push({ x: cx, y: gy, z: cz, huts }); want--;
    }
  }
  return villages;
}
