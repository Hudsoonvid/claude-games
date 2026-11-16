// Starting dioramas.
import { W, H, D, RIM, AIR, STONE, SOIL, TURF, SAND, WATER, LAVA, WOOD, TUFT, BASALT, rnd, ri } from './world.js';

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
  return (x, z) => n2(x, z) * 0.55 + n2(x * 2.1 + 9, z * 2.1 + 4) * 0.3 + n2(x * 4.3 + 3, z * 4.3 + 7) * 0.15;
}

const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));

function tree(world, x, y, z, h) {
  for (let k = 0; k < h; k++) world.set(x, y + k, z, WOOD);
  world.crown(x, y + h, z, 2.2 + rnd() * 0.8);
}

export const PRESETS = ['valley', 'atoll', 'volcano', 'bare'];

export function generate(world, preset) {
  world.clear();
  const noise = makeNoise();
  const ox = rnd() * 40, oz = rnd() * 40;
  const WL = 11; // water level (must stay below the rim)
  const hm = new Int32Array(W * D);

  if (preset === 'bare') {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      world.set(x, 0, z, STONE); world.set(x, 1, z, STONE); world.set(x, 2, z, SAND);
    }
    return;
  }

  // a couple of random features so no two worlds match
  const pcx = 20 + rnd() * 24, pcz = 20 + rnd() * 24;
  const hcx = pcx + (rnd() < 0.5 ? -1 : 1) * (14 + rnd() * 6), hcz = pcz + (rnd() - 0.5) * 24;

  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const n = noise(x / 14 + ox, z / 14 + oz);
    const edge = Math.min(x, z, W - 1 - x, D - 1 - z);
    let h;
    if (preset === 'valley') {
      h = 12 + n * 9 + gauss(x, z, hcx, hcz, 11) * 10 - gauss(x, z, pcx, pcz, 11) * 11;
    } else if (preset === 'atoll') {
      const r = Math.hypot(x - 32, z - 32) + (n - 0.5) * 8;
      h = 5 + Math.exp(-((r - 17) ** 2) / 22) * 9.5 + n * 2 + gauss(x, z, 32, 32, 6) * 1.5;
    } else { // volcano
      const r = Math.hypot(x - 36, z - 30);
      const cone = Math.max(0, 22 - r * 1.25);
      h = 12.5 + n * 3 + cone - Math.max(0, 5 - r) * 3.2 - gauss(x, z, 12, 48, 9) * 7;
    }
    // keep the border at or under the rim so nothing starts out spilling
    const cap = RIM - 1 + edge * 0.6;
    if (h > cap) h = cap;
    hm[x + z * W] = Math.max(2, Math.round(h));
  }

  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = hm[x + z * W];
    const n = noise(x / 6 + 20, z / 6 + 31);
    const r = Math.hypot(x - 36, z - 30);
    for (let y = 0; y < h; y++) {
      let m;
      const depth = h - y;
      if (preset === 'volcano' && r < 14 + n * 4 && h > 13) m = depth < 2 && r > 5 ? BASALT : (y < 3 || n > 0.35 ? BASALT : STONE);
      else if (depth > 3 + n * 3) m = STONE;
      else if (h <= WL + 1 || (preset === 'atoll')) m = (preset === 'atoll' && h > WL + 2 && depth <= 1 && n > 0.45) ? SOIL : SAND;
      else m = SOIL;
      world.set(x, y, z, m);
    }
    for (let y = h; y < WL; y++) world.set(x, y, z, WATER, 8);
    if (preset === 'volcano' && r < 3.6) {
      for (let y = h; y < h + 3; y++) world.set(x, y, z, LAVA, 8);
    }
  }

  // greenery
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const h = hm[x + z * W];
    if (h <= WL) continue;
    if (world.get(x, h - 1, z) === SOIL && world.get(x, h, z) === AIR) {
      world.set(x, h - 1, z, TURF);
      if (rnd() < 0.16) world.set(x, h, z, TUFT, ri(256));
    }
  }
  let trees = preset === 'atoll' ? 5 : preset === 'volcano' ? 6 : 9, tries = 400;
  while (trees > 0 && tries-- > 0) {
    const x = 4 + ri(W - 8), z = 4 + ri(D - 8), h = hm[x + z * W];
    if (world.get(x, h - 1, z) !== TURF) continue;
    let near = false;
    for (let dz = -4; dz <= 4 && !near; dz++) for (let dx = -4; dx <= 4; dx++) if (world.get(x + dx, h + 1, z + dz) === WOOD) { near = true; break; }
    if (near) continue;
    world.set(x, h, z, AIR);
    tree(world, x, h, z, 3 + ri(4));
    trees--;
  }
}
