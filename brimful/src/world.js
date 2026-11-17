// Voxel world + simulation for Brimful.
// Solids, lava, steam, fire and plants live in a voxel grid (cellular rules).
// Water is NOT voxels: it is a shallow-water (virtual pipes) simulation on a grid twice as
// fine as the voxels, flowing over the terrain's height field with momentum and waves.
export let W = 64, H = 40, D = 64, WD = W * D, N = WD * H, CX = 4, CZ = 4;
export const RIM = 13;            // height of the planter wall; above it things spill out
export const CH = 16;
export const WR = 2;              // water cells per voxel edge
export let WW = W * WR, WH = D * WR;
let DI = [1, -1, W, -W];
const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];

export function setSize(w, d, h = 40) {
  W = w; D = d; H = h; WD = W * D; N = WD * H; CX = W / CH; CZ = D / CH; WW = W * WR; WH = D * WR;
  DI = [1, -1, W, -W];
}

export const AIR = 0, STONE = 1, SOIL = 2, TURF = 3, SAND = 4, ICE = 5, LAVA = 6, STEAM = 7,
  WOOD = 8, LEAF = 9, TUFT = 10, WEED = 11, SEED = 12, FIRE = 13, BASALT = 14, PLANK = 15, THATCH = 16, SPRING = 17, DRAIN = 18, LAMP = 19, CROP = 20, SNOW = 21;

export const OPAQUE = new Uint8Array(32);
for (const m of [STONE, SOIL, TURF, SAND, WOOD, LEAF, BASALT, ICE, PLANK, THATCH, SPRING, DRAIN]) OPAQUE[m] = 1;
// what the water treats as ground
const BED = new Uint8Array(32);
for (const m of [STONE, SOIL, TURF, SAND, WOOD, BASALT, LAVA, ICE, PLANK, THATCH, SPRING, DRAIN]) BED[m] = 1;

const ACTIVE = new Uint8Array(32);
for (const m of [SOIL, TURF, SAND, LAVA, STEAM, SEED, FIRE, SPRING, DRAIN]) ACTIVE[m] = 1;

// What a falling powder may move into: 1 = replace, 2 = swap places
const PP = new Uint8Array(32);
PP[AIR] = 1; PP[FIRE] = 1; PP[TUFT] = 1; PP[SEED] = 1; PP[WEED] = 1; PP[CROP] = 1; PP[LAMP] = 1; PP[SNOW] = 1;
PP[LAVA] = 2; PP[STEAM] = 2;

const FLAM = new Float32Array(32);
FLAM[WOOD] = 0.07; FLAM[LEAF] = 0.3; FLAM[TUFT] = 0.45; FLAM[SEED] = 0.3; FLAM[PLANK] = 0.1; FLAM[THATCH] = 0.35; FLAM[CROP] = 0.4;
const BURN = new Uint8Array(32);
BURN[WOOD] = 26; BURN[LEAF] = 7; BURN[TUFT] = 4; BURN[SEED] = 5; BURN[PLANK] = 20; BURN[THATCH] = 8; BURN[CROP] = 4;

let seed = 0x9e3779b9 | 0;
export function rnd() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
export const ri = (n) => (rnd() * n) | 0;

const GRAV = 38, WDT = 1 / 60;

export class World {
  constructor() {
    this.tick = 0; this.events = []; this.raining = false;
    this.alloc();
  }

  alloc() {
    this.mat = new Uint8Array(N); this.aux = new Uint8Array(N); this.stamp = new Uint8Array(N);
    this.dirty = new Uint8Array(CX * CZ).fill(1);
    this.colDirty = new Uint8Array(WD).fill(1);
    this.biome = new Uint8Array(WD);      // biome id per column (tints turf, grass and leaves)
    this.bed = new Float32Array(WD);      // ground height per voxel column
    this.cd = new Float32Array(WD);       // mean water depth per voxel column
    this.cs = new Float32Array(WD);       // water surface height per voxel column
    const n = WW * WH;
    this.wd = new Float32Array(n);        // water depth per water cell
    this.wb = new Float32Array(n);        // ground height per water cell
    this.fl = new Float32Array(n); this.fr = new Float32Array(n); this.ft = new Float32Array(n); this.fb = new Float32Array(n);
  }

  resize(w, d) { setSize(w, d); this.alloc(); }

  clear() {
    this.mat.fill(0); this.aux.fill(0); this.dirty.fill(1); this.colDirty.fill(1);
    this.biome.fill(0); this.wd.fill(0); this.fl.fill(0); this.fr.fill(0); this.ft.fill(0); this.fb.fill(0); this.cd.fill(0);
  }

  inb(x, y, z) { return x >= 0 && x < W && z >= 0 && z < D && y >= 0 && y < H; }

  // Out-of-bounds reads: the planter (below the rim) is solid, everything else is open air.
  get(x, y, z) {
    if (y < 0) return STONE;
    if (y >= H) return AIR;
    if (x < 0 || x >= W || z < 0 || z >= D) return y < RIM ? STONE : AIR;
    return this.mat[x + W * (z + D * y)];
  }
  getAux(x, y, z) { return this.inb(x, y, z) ? this.aux[x + W * (z + D * y)] : 0; }

  set(x, y, z, m, a = 0) {
    if (!this.inb(x, y, z)) return;
    const i = x + W * (z + D * y);
    this.mat[i] = m; this.aux[i] = a;
    this.markDirty(x, z);
  }

  solid(x, y, z) {
    if (y < 0) return true;
    if (y >= H) return false;
    if (x < 0 || x >= W || z < 0 || z >= D) return true; // invisible fence for creatures
    return OPAQUE[this.mat[x + W * (z + D * y)]] === 1;
  }

  markDirty(x, z) {
    const cx = x >> 4, cz = z >> 4, d = this.dirty;
    d[cx + cz * CX] = 1;
    this.colDirty[x + z * W] = 1;
    const lx = x & 15, lz = z & 15;
    if (lx === 0 && cx > 0) d[cx - 1 + cz * CX] = 1;
    else if (lx === 15 && cx < CX - 1) d[cx + 1 + cz * CX] = 1;
    if (lz === 0 && cz > 0) d[cx + (cz - 1) * CX] = 1;
    else if (lz === 15 && cz < CZ - 1) d[cx + (cz + 1) * CX] = 1;
  }

  ignite(x, y, z) {
    if (!this.inb(x, y, z)) return false;
    const i = x + W * (z + D * y), m = this.mat[i];
    if (FLAM[m] > 0) { this.mat[i] = FIRE; this.aux[i] = BURN[m]; this.markDirty(x, z); return true; }
    return false;
  }

  ev(t, x, y, z) { if (this.events.length < 48) this.events.push({ t, x, y, z }); }

  groundY(x, z) {
    x |= 0; z |= 0;
    if (x < 0 || x >= W || z < 0 || z >= D) return 0;
    for (let y = H - 1; y >= 0; y--) {
      const m = this.mat[x + W * (z + D * y)];
      if (m !== AIR && m !== STEAM && m !== TUFT && m !== FIRE) return y + 1;
    }
    return 0;
  }

  // ---- water queries -------------------------------------------------------
  wcell(fx, fz) {
    let x = (fx * WR) | 0, z = (fz * WR) | 0;
    if (x < 0) x = 0; else if (x >= WW) x = WW - 1;
    if (z < 0) z = 0; else if (z >= WH) z = WH - 1;
    return x + z * WW;
  }
  depthAt(fx, fz) { return this.wd[this.wcell(fx, fz)]; }
  bedAt(fx, fz) { return this.wb[this.wcell(fx, fz)]; }
  // surface height at a point, or -1 where it is dry
  surfAt(fx, fz) { const i = this.wcell(fx, fz), d = this.wd[i]; return d > 0.02 ? this.wb[i] + d : -1; }
  // is the voxel cell (x,y,z) under water?
  wet(x, y, z) {
    if (x < 0 || x >= W || z < 0 || z >= D) return false;
    const c = x + z * W;
    return this.cd[c] > 0.05 && y < this.cs[c] && y + 0.5 >= this.bed[c];
  }
  addWater(x, z, vol) {
    if (x < 0 || x >= W || z < 0 || z >= D) return;
    const i = x * WR + z * WR * WW, wd = this.wd;
    wd[i] += vol; wd[i + 1] += vol; wd[i + WW] += vol; wd[i + WW + 1] += vol;
  }
  addWaterF(fx, fz, vol) {
    if (fx < 0 || fx >= W || fz < 0 || fz >= D) return;
    this.wd[this.wcell(fx, fz)] += vol * WR * WR;
  }
  takeWater(x, z, vol) {
    if (x < 0 || x >= W || z < 0 || z >= D) return 0;
    const i = x * WR + z * WR * WW, wd = this.wd; let got = 0;
    for (const j of [i, i + 1, i + WW, i + WW + 1]) { const t = Math.min(wd[j], vol); wd[j] -= t; got += t; }
    return got / 4;
  }
  fillTo(level) {
    this.updateBeds();
    for (let i = 0; i < this.wd.length; i++) this.wd[i] = Math.max(0, level - this.wb[i]);
    this.aggregate();
  }
  totalWater() { let s = 0; for (let i = 0; i < this.wd.length; i++) s += this.wd[i]; return s / (WR * WR); }

  moist(x, y, z) {
    for (let k = 0; k < 4; k++) {
      const mx = x + ri(9) - 4, mz = z + ri(9) - 4;
      if (mx < 0 || mx >= W || mz < 0 || mz >= D) continue;
      const c = mx + mz * W;
      if (this.cd[c] > 0.04 && Math.abs(this.cs[c] - y) < 4.5) return true;
    }
    return false;
  }

  // tree tops take their shape from the biome they grow in
  crown(x, y, z, r = 2.4) {
    const b = this.inb(x, 0, z) ? this.biome[x + z * W] : 0;
    const put = (px, py, pz) => { if (this.inb(px, py, pz) && this.get(px, py, pz) === AIR) this.set(px, py, pz, LEAF); };
    if (b === 1 || b === 5) { // conifer: stacked rings narrowing to a point
      for (let k = 0; k < 6; k++) {
        const rr = k === 5 ? 0 : 2.6 - k * 0.5 + (k & 1 ? 0.5 : 0), q = Math.ceil(rr), py = y - 3 + k;
        for (let dz = -q; dz <= q; dz++) for (let dx = -q; dx <= q; dx++) if (dx * dx + dz * dz <= rr * rr + 0.3) put(x + dx, py, z + dz);
      }
      return;
    }
    if (b === 4) { // flat-topped, wide
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const d = dx * dx + dz * dz;
        if (d <= 9.5 + rnd() * 2) put(x + dx, y, z + dz);
        if (d <= 3) put(x + dx, y + 1, z + dz);
      }
      return;
    }
    if (b === 7) r += 0.9;
    const R = Math.ceil(r);
    for (let dy = -1; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy * 1.4 + dz * dz > r * r + rnd() * 1.5) continue;
      if (this.inb(x + dx, y + dy, z + dz) && this.get(x + dx, y + dy, z + dz) === AIR) this.set(x + dx, y + dy, z + dz, LEAF);
    }
  }

  // ---- water simulation ----------------------------------------------------
  updateBeds() {
    const { colDirty, mat, bed, wb } = this;
    for (let c = 0; c < WD; c++) {
      if (!colDirty[c]) continue;
      colDirty[c] = 0;
      let y = 0, i = c;
      while (y < H && BED[mat[i]]) { y++; i += WD; }
      if (bed[c] === y) continue;
      bed[c] = y;
      const x = c % W, z = (c / W) | 0, j = x * WR + z * WR * WW;
      wb[j] = wb[j + 1] = wb[j + WW] = wb[j + WW + 1] = y;
    }
  }

  aggregate() {
    const { wd, cd, cs, bed } = this;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const j = x * WR + z * WR * WW, c = x + z * W;
      const d = (wd[j] + wd[j + 1] + wd[j + WW] + wd[j + WW + 1]) * 0.25;
      cd[c] = d; cs[c] = bed[c] + d;
    }
  }

  stepWater() {
    this.updateBeds();
    const { wd, wb, fl, fr, ft, fb } = this, k = WDT * GRAV;
    for (let sub = 0; sub < 2; sub++) {
      // accelerate the flow between neighbouring columns by their surface difference
      for (let z = 0, i = 0; z < WH; z++) for (let x = 0; x < WW; x++, i++) {
        const d = wd[i];
        if (d <= 0) { fl[i] = fr[i] = ft[i] = fb[i] = 0; continue; }
        const h = wb[i] + d, damp = d > 0.4 ? 0.9975 : 0.955;
        let a = fr[i] * damp + k * (x < WW - 1 ? h - wb[i + 1] - wd[i + 1] : Math.min(h - RIM, d));
        let b = fl[i] * damp + k * (x > 0 ? h - wb[i - 1] - wd[i - 1] : Math.min(h - RIM, d));
        let c = fb[i] * damp + k * (z < WH - 1 ? h - wb[i + WW] - wd[i + WW] : Math.min(h - RIM, d));
        let e = ft[i] * damp + k * (z > 0 ? h - wb[i - WW] - wd[i - WW] : Math.min(h - RIM, d));
        if (a < 0) a = 0; if (b < 0) b = 0; if (c < 0) c = 0; if (e < 0) e = 0;
        const out = (a + b + c + e) * WDT;
        if (out > d) { const s = d / out; a *= s; b *= s; c *= s; e *= s; }
        fr[i] = a; fl[i] = b; fb[i] = c; ft[i] = e;
      }
      // move the water
      for (let z = 0, i = 0; z < WH; z++) for (let x = 0; x < WW; x++, i++) {
        let v = -(fr[i] + fl[i] + fb[i] + ft[i]);
        if (x > 0) v += fr[i - 1]; else if (fl[i] > 0.4 && rnd() < 0.02) this.ev('spill', -1, RIM, z / WR | 0);
        if (x < WW - 1) v += fl[i + 1]; else if (fr[i] > 0.4 && rnd() < 0.02) this.ev('spill', W, RIM, z / WR | 0);
        if (z > 0) v += fb[i - WW]; else if (ft[i] > 0.4 && rnd() < 0.02) this.ev('spill', x / WR | 0, RIM, -1);
        if (z < WH - 1) v += ft[i + WW]; else if (fb[i] > 0.4 && rnd() < 0.02) this.ev('spill', x / WR | 0, RIM, D);
        let d = wd[i] + v * WDT;
        if (d < 0.015) d -= 0.0002;       // thin films soak into the ground
        wd[i] = d > 1e-5 ? d : 0;
      }
    }
    let fsum = 0; for (let i = 0; i < fr.length; i += 3) fsum += fr[i] + fb[i];
    this.flow = fsum * 3 / fr.length;       // how much water is on the move (for sound)
    this.aggregate();
  }

  // ---- voxel simulation ------------------------------------------------------
  step() {
    const mat = this.mat, aux = this.aux, stamp = this.stamp, cd = this.cd, cs = this.cs, bed = this.bed;
    const t = ++this.tick, cur = t & 255;

    if (this.raining) {
      const n = Math.max(2, (WD / 700) | 0);
      for (let k = 0; k < n; k++) this.addWaterF(rnd() * W, rnd() * D, 0.22);
    }
    if (this.snowing) { // flakes settle on open ground and still water skins over with ice
      const n = Math.max(3, (WD / 300) | 0), mat = this.mat;
      for (let k = 0; k < n; k++) {
        const x = ri(W), z = ri(D), c = x + z * W, y = this.groundY(x, z);
        if (y >= H - 1 || y < 1) continue;
        const i = x + W * (z + D * y), below = mat[i - WD];
        if (this.cd[c] > 0.3 && this.cs[c] > y) {
          const sy = Math.floor(this.cs[c] - 0.15);
          if (rnd() < 0.08 && sy >= y && sy < H && mat[x + W * (z + D * sy)] === AIR && this.takeWater(x, z, 0.5) > 0) this.set(x, sy, z, ICE);
        } else if (below === SNOW) { if (this.aux[i - WD] < 4) { this.aux[i - WD]++; this.markDirty(x, z); } }
        else if (OPAQUE[below] && below !== ICE && mat[i] === AIR) this.set(x, y, z, SNOW, 1);
        else if (mat[i] === TUFT && rnd() < 0.3) this.set(x, y, z, SNOW, 1);
      }
    }
    this.stepWater();

    for (let y = 0; y < H; y++) {
      const zf = (t + y) & 1, xf = ((t >> 1) + y) & 1;
      for (let zz = 0; zz < D; zz++) {
        const z = zf ? D - 1 - zz : zz;
        let i = (xf ? W - 1 : 0) + W * (z + D * y);
        const di = xf ? -1 : 1;
        for (let xx = 0; xx < W; xx++, i += di) {
          const m = mat[i];
          if (ACTIVE[m] === 0 || stamp[i] === cur) continue;
          const x = xf ? W - 1 - xx : xx;

          if (m === SAND || m === SOIL || m === TURF || m === SEED) {
            if (y === 0) continue;
            const b = i - WD, bm = mat[b], p = PP[bm];
            if (p === 1) {
              mat[b] = m; aux[b] = aux[i]; mat[i] = AIR; aux[i] = 0; stamp[b] = cur;
              this.markDirty(x, z); continue;
            }
            if (p === 2) {
              if (rnd() < 0.5) {
                const ba = aux[b];
                mat[b] = m; aux[b] = aux[i]; mat[i] = bm; aux[i] = ba; stamp[b] = cur; stamp[i] = cur;
                this.markDirty(x, z);
              }
              continue;
            }
            if (m === TURF) continue;
            if (m === SOIL && ((t + i) & 3)) continue;
            const d = ri(4), nx = x + DX[d], nz = z + DZ[d];
            if (nx < 0 || nx >= W || nz < 0 || nz >= D) {
              if (y >= RIM) { mat[i] = AIR; aux[i] = 0; this.markDirty(x, z); if (rnd() < 0.3) this.ev('crumb', nx, y, nz); }
              continue;
            }
            const s = i + DI[d];
            if (PP[mat[s]] === 0 || PP[mat[s - WD]] === 0) continue;
            if (m === SOIL && (y < 2 || PP[mat[s - 2 * WD]] === 0)) continue;
            const sm = mat[s], sa = aux[s];
            mat[s] = m; aux[s] = aux[i];
            if (PP[sm] === 2) { mat[i] = sm; aux[i] = sa; } else { mat[i] = AIR; aux[i] = 0; }
            stamp[s] = cur;
            this.markDirty(x, z); this.markDirty(nx, nz);
            continue;
          }

          if (m === SPRING) { // wells up from the top of the block
            if (y + 1 >= bed[x + z * W]) this.addWater(x, z, 0.14);
            continue;
          }
          if (m === DRAIN) {
            if (y + 1 >= bed[x + z * W] && cd[x + z * W] > 0) this.takeWater(x, z, 0.5);
            continue;
          }
          if (m === LAVA) {
            if ((t + i) & 3) continue;
            let a = aux[i]; const a0 = a, c = x + z * W;
            // water quenches lava into basalt and flashes to steam
            let q = -1;
            if (cd[c] > 0.03 && cs[c] > y && y + 1 >= bed[c]) q = c;
            else for (let k = 0; k < 4; k++) {
              const nx = x + DX[k], nz = z + DZ[k]; if (nx < 0 || nx >= W || nz < 0 || nz >= D) continue;
              const n = nx + nz * W;
              if (cd[n] > 0.03 && cs[n] > y + 0.1 && bed[n] <= y + 0.5) { q = n; break; }
            }
            if (q >= 0) {
              const got = this.takeWater(q % W, (q / W) | 0, 0.6);
              mat[i] = BASALT; aux[i] = 0; this.markDirty(x, z); this.ev('sizzle', x, y, z);
              for (let up = y + 1; up < Math.min(H, y + 6); up++) {
                const u = x + W * (z + D * up);
                if (mat[u] === AIR && up + 1 > cs[c]) { mat[u] = STEAM; aux[u] = Math.max(1, Math.round(got * 8)); stamp[u] = cur; break; }
              }
              continue;
            }
            // heat: ignite plants
            for (let k = 0; k < 5; k++) {
              let n, nx = x, nz = z;
              if (k < 4) { nx += DX[k]; nz += DZ[k]; if (nx < 0 || nx >= W || nz < 0 || nz >= D) continue; n = i + DI[k]; }
              else { if (y >= H - 1) continue; n = i + WD; }
              const nm = mat[n];
              if (FLAM[nm] > 0 && rnd() < 0.5) { mat[n] = FIRE; aux[n] = BURN[nm]; stamp[n] = cur; }
              else if (nm === TURF && rnd() < 0.2) mat[n] = SOIL;
              else if (nm === WEED) mat[n] = AIR;
              else continue;
              this.markDirty(nx, nz);
            }
            if (y > 0) {
              const b = i - WD, bm = mat[b];
              if (bm === AIR || bm === FIRE || bm === TUFT || bm === LEAF || bm === SEED || bm === STEAM || bm === WEED) {
                mat[b] = LAVA; aux[b] = a; mat[i] = AIR; aux[i] = 0; stamp[b] = cur; this.markDirty(x, z); continue;
              }
              if (bm === LAVA && aux[b] < 8) { const tr = Math.min(a, 8 - aux[b]); aux[b] += tr; a -= tr; }
              else if (bm === WOOD && rnd() < 0.3) { mat[b] = FIRE; aux[b] = BURN[WOOD]; this.markDirty(x, z); }
            }
            if (a > 0) {
              const d0 = ri(4);
              for (let k = 0; k < 4 && a > 0; k++) {
                const d = (d0 + k) & 3, nx = x + DX[d], nz = z + DZ[d];
                if (nx < 0 || nx >= W || nz < 0 || nz >= D) {
                  if (y >= RIM) { a--; if (rnd() < 0.25) this.ev('drip', nx, y, nz); }
                  continue;
                }
                const n = i + DI[d], nm = mat[n];
                if (nm === AIR) {
                  let tr = a >= 3 ? a >> 1 : 0;
                  if (tr === 0 && y > 0) {
                    const nb = mat[n - WD];
                    if (nb === AIR || (nb === LAVA && aux[n - WD] < 8)) tr = a;
                  }
                  if (tr > 0) { mat[n] = LAVA; aux[n] = tr; stamp[n] = cur; a -= tr; this.markDirty(nx, nz); }
                } else if (nm === LAVA) {
                  const an = aux[n], df = a - an;
                  if (df >= 3) { const tr = df >> 1; aux[n] = an + tr; a -= tr; this.markDirty(nx, nz); }
                }
              }
            }
            if (a !== a0) { if (a === 0) mat[i] = AIR; aux[i] = a; this.markDirty(x, z); }
            if (rnd() < 0.004) this.ev('ember', x, y, z);
            continue;
          }

          if (m === STEAM) {
            if ((t + i) & 1) continue;
            if (y < H - 1 && mat[i + WD] === AIR) {
              mat[i + WD] = STEAM; aux[i + WD] = aux[i]; mat[i] = AIR; aux[i] = 0; stamp[i + WD] = cur;
              this.markDirty(x, z); continue;
            }
            if (rnd() < (y >= H - 3 ? 0.03 : 0.006)) {
              // condense: falls back as rain
              this.addWater(x, z, Math.max(1, aux[i]) / 8);
              mat[i] = AIR; aux[i] = 0; this.markDirty(x, z); this.ev('drop', x, y, z); continue;
            }
            const d = ri(4), nx = x + DX[d], nz = z + DZ[d];
            if (nx < 0 || nx >= W || nz < 0 || nz >= D) continue;
            const n = i + DI[d];
            if (mat[n] === AIR) {
              mat[n] = STEAM; aux[n] = aux[i]; mat[i] = AIR; aux[i] = 0; stamp[n] = cur;
              this.markDirty(x, z); this.markDirty(nx, nz);
            }
            continue;
          }

          if (m === FIRE) {
            if ((t + i) & 1) continue;
            let a = aux[i] - 1;
            const c = x + z * W;
            if ((cd[c] > 0.05 && cs[c] > y + 0.2) || (this.raining && rnd() < 0.06)) a = 0;
            for (let k = 0; k < 6; k++) {
              let n, nx = x, nz = z;
              if (k < 4) { nx += DX[k]; nz += DZ[k]; if (nx < 0 || nx >= W || nz < 0 || nz >= D) continue; n = i + DI[k]; }
              else if (k === 4) { if (y >= H - 1) continue; n = i + WD; }
              else { if (y === 0) continue; n = i - WD; }
              const nm = mat[n], f = FLAM[nm];
              if (f > 0) { if (rnd() < f) { mat[n] = FIRE; aux[n] = BURN[nm]; stamp[n] = cur; this.markDirty(nx, nz); } }
              else if (nm === TURF) { if (rnd() < 0.12) { mat[n] = SOIL; this.markDirty(nx, nz); } }
            }
            if (a <= 0) { mat[i] = AIR; aux[i] = 0; this.markDirty(x, z); }
            else aux[i] = a;
            if (rnd() < 0.08) this.ev('ember', x, y, z);
          }
        }
      }
    }
    this.randomTicks((N * 0.0135) | 0);
  }

  // Slow processes: growth, decay, cooling.
  randomTicks(n) {
    const mat = this.mat, aux = this.aux, cd = this.cd, cs = this.cs, bed = this.bed;
    for (let k = 0; k < n; k++) {
      const i = ri(N), m = mat[i];
      if (m === AIR || m === STONE) continue;
      const x = i % W, z = ((i / W) | 0) % D, y = (i / WD) | 0, c = x + z * W;
      const up = y < H - 1 ? mat[i + WD] : AIR;
      const under = cd[c] > 0.25 && cs[c] > y + 1.2;       // this cell's top is under water
      switch (m) {
        case SOIL:
          if (under) this.growWeed(i, x, y, z, 1);
          else if ((up === AIR || up === TUFT) && rnd() < 0.2 && this.moist(x, y, z)) { mat[i] = TURF; this.markDirty(x, z); }
          break;
        case SAND:
          if (under && rnd() < 0.5) this.growWeed(i, x, y, z, 1);
          break;
        case TURF:
          if (OPAQUE[up] || up === LAVA || under) { if (rnd() < 0.4) { mat[i] = SOIL; this.markDirty(x, z); } }
          else if (up === AIR && rnd() < 0.05 && this.moist(x, y, z)) { mat[i + WD] = TUFT; aux[i + WD] = ri(256); this.markDirty(x, z); }
          break;
        case TUFT:
          if (y === 0 || mat[i - WD] !== TURF || (cd[c] > 0.3 && cs[c] > y + 0.3)) { mat[i] = AIR; this.markDirty(x, z); }
          break;
        case WEED: {
          const below = y > 0 ? mat[i - WD] : STONE;
          if (cs[c] < y + 0.7 || cd[c] < 0.3 || !(OPAQUE[below] || below === WEED)) { if (rnd() < 0.5) { mat[i] = AIR; this.markDirty(x, z); } }
          else if (aux[i] < 3 && rnd() < 0.25) this.growWeed(i, x, y, z, aux[i] + 1);
          break;
        }
        case WOOD:
          if (aux[i] > 0) {
            const g = aux[i]; aux[i] = 0;
            if (y < H - 2 && (up === AIR || up === LEAF || up === TUFT)) {
              mat[i + WD] = WOOD; aux[i + WD] = g - 1; this.markDirty(x, z);
              if (g - 1 === 0) this.crown(x, y + 2, z, 2 + rnd() * 0.8);
            } else this.crown(x, y + 1, z, 2);
          }
          break;
        case LEAF: {
          let ok = false;
          for (let dy = -3; dy <= 2 && !ok; dy++) for (let dz = -2; dz <= 2 && !ok; dz++) for (let dx = -2; dx <= 2; dx++) {
            if (this.get(x + dx, y + dy, z + dz) === WOOD) { ok = true; break; }
          }
          if (!ok) { if (rnd() < 0.5) { mat[i] = AIR; this.markDirty(x, z); } }
          else if (y > 0 && mat[i - WD] === AIR && rnd() < 0.004) { mat[i - WD] = SEED; this.markDirty(x, z); }
          break;
        }
        case SEED: {
          const below = y > 0 ? mat[i - WD] : STONE;
          if ((below === SOIL || below === TURF) && !(cd[c] > 0.2 && cs[c] > y + 0.3) && this.moist(x, y, z)) {
            let crowded = false;
            for (let dz = -3; dz <= 3 && !crowded; dz++) for (let dx = -3; dx <= 3; dx++) {
              if (this.get(x + dx, y, z + dz) === WOOD || this.get(x + dx, y + 1, z + dz) === WOOD) { crowded = true; break; }
            }
            if (!crowded) { mat[i] = WOOD; aux[i] = 3 + ri(4); this.markDirty(x, z); }
            else if (rnd() < 0.15) { mat[i] = AIR; this.markDirty(x, z); }
          } else if (below !== AIR && rnd() < 0.03) { mat[i] = AIR; this.markDirty(x, z); }
          break;
        }
        case SNOW: {
          const below = y > 0 ? mat[i - WD] : STONE, cold = this.snowing || this.biome[c] === 5;
          if (!OPAQUE[below]) { mat[i] = AIR; this.markDirty(x, z); }
          else if (!cold && rnd() < 0.5) { // melt, a layer at a time, into a little water
            this.addWater(x, z, 0.012);
            if (aux[i] > 1) aux[i]--; else mat[i] = AIR;
            this.markDirty(x, z);
          }
          break;
        }
        case CROP: {
          const below = y > 0 ? mat[i - WD] : STONE;
          if ((below !== SOIL && below !== TURF) || (cd[c] > 0.2 && cs[c] > y + 0.3)) { mat[i] = AIR; this.markDirty(x, z); }
          else if (aux[i] < 3 && rnd() < (this.moist(x, y, z) || this.raining ? 0.4 : 0.08)) { aux[i]++; this.markDirty(x, z); }
          break;
        }
        case ICE: {
          let hot = false;
          for (let d = 0; d < 4 && !hot; d++) { const nm = this.get(x + DX[d], y, z + DZ[d]); hot = nm === LAVA || nm === FIRE; }
          if (hot || up === LAVA || up === FIRE || (y > 0 && mat[i - WD] === LAVA)) this.melt(x, y, z);
          else if (!this.snowing && this.biome[c] !== 5 && rnd() < (y > 0 && mat[i - WD] === AIR ? 0.2 : 0.02)) this.melt(x, y, z);   // lake ice breaks up when the cold passes
          break;
        }
        case LAVA:
          if (up !== LAVA && rnd() < (aux[i] <= 2 ? 0.25 : 0.012)) { mat[i] = BASALT; aux[i] = 0; this.markDirty(x, z); }
          break;
      }
    }
  }

  // a small plank-and-thatch hut on a 3x3 footprint; returns false if it does not fit
  hut(x, y, z) {
    if (x < 2 || z < 2 || x > W - 3 || z > D - 3 || y < 1 || y > H - 5) return false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!OPAQUE[this.get(x + dx, y - 1, z + dz)] || this.wet(x + dx, y, z + dz)) return false;
      for (let dy = 0; dy < 4; dy++) { const m = this.get(x + dx, y + dy, z + dz); if (m !== AIR && m !== TUFT && m !== SEED) return false; }
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const wall = dx !== 0 || dz !== 0, door = dx === 0 && dz === 1;
      this.set(x + dx, y, z + dz, wall && !door ? PLANK : AIR);
      this.set(x + dx, y + 1, z + dz, wall ? PLANK : AIR);
      this.set(x + dx, y + 2, z + dz, THATCH);
      if (this.get(x + dx, y - 1, z + dz) === TURF) this.set(x + dx, y - 1, z + dz, SOIL);
    }
    this.set(x, y + 3, z, THATCH);
    if (this.get(x, y + 4, z) === AIR) this.set(x, y + 4, z, LAMP);
    return true;
  }
  clearFor(x, y, z, h) { // a 3x3 patch of solid dry ground with h cells of room above
    if (x < 2 || z < 2 || x > W - 3 || z > D - 3 || y < 1 || y > H - h - 2) return false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!OPAQUE[this.get(x + dx, y - 1, z + dz)] || this.wet(x + dx, y, z + dz)) return false;
      for (let dy = 0; dy < h; dy++) { const m = this.get(x + dx, y + dy, z + dz); if (m !== AIR && m !== TUFT && m !== SEED && m !== SNOW && m !== CROP) return false; }
    }
    return true;
  }
  // a stone-ringed well that keeps the ground around it damp
  well(x, y, z) {
    if (!this.clearFor(x, y, z, 2)) return false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dz) this.set(x + dx, y, z + dz, STONE); else { this.set(x, y, z, AIR); this.set(x, y - 1, z, STONE); }
    }
    this.updateBeds(); this.addWater(x, z, 0.85);
    return true;
  }
  // a tall plank lookout with a lantern on top
  tower(x, y, z) {
    if (!this.clearFor(x, y, z, 8)) return false;
    for (let k = 0; k < 6; k++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const corner = dx && dz, edge = dx || dz;
      if (k < 4) this.set(x + dx, y + k, z + dz, corner ? PLANK : edge && !(k < 2 && dz === 1 && !dx) && k !== 2 ? PLANK : AIR);
      else if (k === 4) this.set(x + dx, y + k, z + dz, PLANK);
      else this.set(x + dx, y + k, z + dz, corner ? PLANK : AIR);
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.set(x + dx, y + 6, z + dz, THATCH);
    this.set(x, y + 7, z, LAMP);
    return true;
  }
  setBiome(x, z, b) { if (x >= 0 && x < W && z >= 0 && z < D && this.biome[x + z * W] !== b) { this.biome[x + z * W] = b; this.markDirty(x, z); } }

  melt(x, y, z) {
    if (this.get(x, y, z) !== ICE) return;
    this.set(x, y, z, AIR); this.updateBeds(); this.addWater(x, z, 0.5);
  }
  // turn the water standing in a column into ice blocks
  freeze(x, z) {
    if (x < 0 || x >= W || z < 0 || z >= D) return;
    const c = x + z * W, n = Math.min(6, Math.round(this.cd[c]));
    if (n < 1) return;
    const b = this.bed[c] | 0;
    this.takeWater(x, z, n * 0.5);
    for (let k = 0; k < n; k++) if (this.get(x, b + k, z) === AIR || this.get(x, b + k, z) === WEED) this.set(x, b + k, z, ICE);
  }

  growWeed(i, x, y, z, level) {
    if (y >= H - 2 || rnd() > 0.06) return;
    const u = i + WD, c = x + z * W;
    if (this.mat[u] === AIR && this.cs[c] > y + 2.3) { this.mat[u] = WEED; this.aux[u] = level; this.markDirty(x, z); }
  }

  count(m) { let c = 0; const mat = this.mat; for (let i = 0; i < N; i++) if (mat[i] === m) c++; return c; }

  // ---- persistence -------------------------------------------------------
  serialize() {
    const q = new Uint16Array(this.wd.length);
    for (let i = 0; i < q.length; i++) q[i] = Math.min(65535, Math.round(this.wd[i] * 512));
    return { w: W, d: D, b: b64(rle(this.biome)), m: b64(rle(this.mat)), a: b64(rle(this.aux)), q: b64(rle(new Uint8Array(q.buffer))) };
  }
  deserialize(o) {
    this.resize(o.w, o.d);
    unrle(unb64(o.m), this.mat); unrle(unb64(o.a), this.aux); if (o.b) unrle(unb64(o.b), this.biome);
    const q = new Uint16Array(this.wd.length); unrle(unb64(o.q), new Uint8Array(q.buffer));
    for (let i = 0; i < q.length; i++) this.wd[i] = q[i] / 512;
    this.updateBeds(); this.aggregate();
  }
}

function rle(src) {
  const out = [];
  for (let i = 0; i < src.length;) {
    const v = src[i]; let n = 1;
    while (n < 255 && i + n < src.length && src[i + n] === v) n++;
    out.push(n, v); i += n;
  }
  return Uint8Array.from(out);
}
function unrle(src, dst) {
  let p = 0;
  for (let i = 0; i < src.length && p < dst.length; i += 2) { dst.fill(src[i + 1], p, p + src[i]); p += src[i]; }
}
function b64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
