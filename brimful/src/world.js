// Voxel world + cellular simulation for Brimful.
export const W = 64, H = 40, D = 64, WD = W * D, N = WD * H;
export const RIM = 13;            // height of the planter wall; above it things spill out
export const CH = 16, CX = W / CH, CZ = D / CH;

export const AIR = 0, STONE = 1, SOIL = 2, TURF = 3, SAND = 4, WATER = 5, LAVA = 6, STEAM = 7,
  WOOD = 8, LEAF = 9, TUFT = 10, WEED = 11, SEED = 12, FIRE = 13, BASALT = 14;

export const OPAQUE = new Uint8Array(16);
for (const m of [STONE, SOIL, TURF, SAND, WOOD, LEAF, BASALT]) OPAQUE[m] = 1;

const ACTIVE = new Uint8Array(16);
for (const m of [SOIL, TURF, SAND, WATER, LAVA, STEAM, SEED, FIRE]) ACTIVE[m] = 1;

// What a falling powder may move into: 1 = replace, 2 = swap places (liquids, steam)
const PP = new Uint8Array(16);
PP[AIR] = 1; PP[FIRE] = 1; PP[TUFT] = 1; PP[SEED] = 1;
PP[WATER] = 2; PP[LAVA] = 2; PP[STEAM] = 2;

const FLAM = new Float32Array(16);
FLAM[WOOD] = 0.07; FLAM[LEAF] = 0.3; FLAM[TUFT] = 0.45; FLAM[SEED] = 0.3;
const BURN = new Uint8Array(16);
BURN[WOOD] = 26; BURN[LEAF] = 7; BURN[TUFT] = 4; BURN[SEED] = 5;

const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1], DI = [1, -1, W, -W];

let seed = 0x9e3779b9 | 0;
export function rnd() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
export const ri = (n) => (rnd() * n) | 0;
export const isWaterish = (m) => m === WATER || m === WEED;

export class World {
  constructor() {
    this.mat = new Uint8Array(N);
    this.aux = new Uint8Array(N);
    this.stamp = new Uint8Array(N);
    this.dirty = new Uint8Array(CX * CZ).fill(1);
    this.tick = 0;
    this.events = [];
    this.raining = false;
  }

  clear() { this.mat.fill(0); this.aux.fill(0); this.dirty.fill(1); }

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

  moist(x, y, z) {
    for (let k = 0; k < 4; k++) {
      const m = this.get(x + ri(9) - 4, y + ri(5) - 3, z + ri(9) - 4);
      if (m === WATER || m === WEED) return true;
    }
    return false;
  }

  crown(x, y, z, r = 2.4) {
    const R = Math.ceil(r);
    for (let dy = -1; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy * 1.4 + dz * dz > r * r + rnd() * 1.5) continue;
      if (this.inb(x + dx, y + dy, z + dz) && this.get(x + dx, y + dy, z + dz) === AIR) this.set(x + dx, y + dy, z + dz, LEAF);
    }
  }

  step() {
    const mat = this.mat, aux = this.aux, stamp = this.stamp;
    const t = ++this.tick, cur = t & 255;

    if (this.raining) {
      for (let k = 0; k < 5; k++) {
        const x = ri(W), z = ri(D), i = x + W * (z + D * (H - 1));
        if (mat[i] === AIR) { mat[i] = WATER; aux[i] = 2; this.markDirty(x, z); }
      }
    }

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
              if (y >= RIM) { mat[i] = AIR; aux[i] = 0; this.markDirty(x, z); if (rnd() < 0.3) this.ev('crumb', x + DX[d], y, z + DZ[d]); }
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

          if (m === WATER) {
            let a = aux[i]; const a0 = a;
            if (y > 0) {
              const b = i - WD, bm = mat[b];
              if (bm === AIR || bm === FIRE || bm === TUFT) {
                mat[b] = WATER; aux[b] = a; mat[i] = AIR; aux[i] = 0; this.markDirty(x, z); continue;
              }
              if (bm === STEAM) {
                mat[b] = WATER; mat[i] = STEAM; const ba = aux[b]; aux[b] = a; aux[i] = ba; stamp[i] = cur;
                this.markDirty(x, z); continue;
              }
              if (bm === WATER && aux[b] < 8) {
                const tr = Math.min(a, 8 - aux[b]); aux[b] += tr; a -= tr;
              } else if (bm === LAVA) {
                mat[b] = BASALT; aux[b] = 0; mat[i] = STEAM; stamp[i] = cur;
                this.markDirty(x, z); this.ev('sizzle', x, y, z); continue;
              }
            }
            if (a > 0) {
              const d0 = ri(4);
              for (let k = 0; k < 4 && a > 0; k++) {
                const d = (d0 + k) & 3, nx = x + DX[d], nz = z + DZ[d];
                if (nx < 0 || nx >= W || nz < 0 || nz >= D) {
                  if (y >= RIM) { a--; if (rnd() < 0.25) this.ev('spill', nx, y, nz); }
                  continue;
                }
                const n = i + DI[d], nm = mat[n];
                if (nm === AIR || nm === TUFT) {
                  let tr = a >> 1;
                  if (tr === 0 && y > 0) {
                    const nb = mat[n - WD];
                    if (nb === AIR || (nb === WATER && aux[n - WD] < 8)) tr = 1;
                  }
                  if (tr > 0) { mat[n] = WATER; aux[n] = tr; stamp[n] = cur; a -= tr; this.markDirty(nx, nz); }
                } else if (nm === WATER) {
                  const an = aux[n], tr = (a - an) >> 1;
                  if (tr > 0) { aux[n] = an + tr; a -= tr; this.markDirty(nx, nz); }
                } else if (nm === LAVA) {
                  mat[n] = BASALT; aux[n] = 0; mat[i] = STEAM; aux[i] = a; stamp[i] = cur;
                  this.markDirty(nx, nz); this.markDirty(x, z); this.ev('sizzle', x, y, z);
                  a = -1; break;
                }
              }
            }
            if (a < 0) continue;
            if (a !== a0) {
              if (a === 0) mat[i] = AIR;
              aux[i] = a; this.markDirty(x, z);
            }
            continue;
          }

          if (m === LAVA) {
            if ((t + i) & 3) continue;
            let a = aux[i]; const a0 = a;
            // heat: boil neighbouring water, ignite plants
            let frozen = false;
            for (let k = 0; k < 5; k++) {
              let n;
              if (k < 4) { const nx = x + DX[k], nz = z + DZ[k]; if (nx < 0 || nx >= W || nz < 0 || nz >= D) continue; n = i + DI[k]; }
              else { if (y >= H - 1) continue; n = i + WD; }
              const nm = mat[n];
              if (nm === WATER) { mat[n] = STEAM; stamp[n] = cur; frozen = true; }
              else if (FLAM[nm] > 0 && rnd() < 0.5) { mat[n] = FIRE; aux[n] = BURN[nm]; stamp[n] = cur; }
              else if (nm === TURF && rnd() < 0.2) mat[n] = SOIL;
              else if (nm === WEED) { mat[n] = STEAM; aux[n] = 8; stamp[n] = cur; frozen = true; }
              else continue;
              this.markDirty(x + (k < 4 ? DX[k] : 0), z + (k < 4 ? DZ[k] : 0));
            }
            if (frozen) { mat[i] = BASALT; aux[i] = 0; this.markDirty(x, z); this.ev('sizzle', x, y, z); continue; }
            if (y > 0) {
              const b = i - WD, bm = mat[b];
              if (bm === AIR || bm === FIRE || bm === TUFT || bm === LEAF || bm === SEED || bm === STEAM) {
                mat[b] = LAVA; aux[b] = a; mat[i] = AIR; aux[i] = 0; stamp[b] = cur; this.markDirty(x, z); continue;
              }
              if (bm === LAVA && aux[b] < 8) { const tr = Math.min(a, 8 - aux[b]); aux[b] += tr; a -= tr; }
              else if (bm === WATER || bm === WEED) {
                mat[b] = STEAM; if (bm === WEED) aux[b] = 8; mat[i] = BASALT; aux[i] = 0;
                this.markDirty(x, z); this.ev('sizzle', x, y, z); continue;
              } else if (bm === WOOD && rnd() < 0.3) { mat[b] = FIRE; aux[b] = BURN[WOOD]; this.markDirty(x, z); }
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
              mat[i] = WATER; if (aux[i] === 0) aux[i] = 1; stamp[i] = cur; this.markDirty(x, z); continue;
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
            for (let k = 0; k < 6; k++) {
              let n, nx = x, nz = z;
              if (k < 4) { nx += DX[k]; nz += DZ[k]; if (nx < 0 || nx >= W || nz < 0 || nz >= D) continue; n = i + DI[k]; }
              else if (k === 4) { if (y >= H - 1) continue; n = i + WD; }
              else { if (y === 0) continue; n = i - WD; }
              const nm = mat[n], f = FLAM[nm];
              if (f > 0) { if (rnd() < f) { mat[n] = FIRE; aux[n] = BURN[nm]; stamp[n] = cur; this.markDirty(nx, nz); } }
              else if (nm === TURF) { if (rnd() < 0.12) { mat[n] = SOIL; this.markDirty(nx, nz); } }
              else if (nm === WATER) a = 0;
            }
            if (a <= 0) { mat[i] = AIR; aux[i] = 0; this.markDirty(x, z); }
            else aux[i] = a;
            if (rnd() < 0.08) this.ev('ember', x, y, z);
          }
        }
      }
    }
    this.randomTicks(2200);
  }

  // Slow processes: growth, decay, cooling.
  randomTicks(n) {
    const mat = this.mat, aux = this.aux;
    for (let k = 0; k < n; k++) {
      const i = ri(N), m = mat[i];
      if (m === AIR || m === STONE || m === SAND && rnd() < 0.5) continue;
      const x = i % W, z = ((i / W) | 0) % D, y = (i / WD) | 0;
      const up = y < H - 1 ? mat[i + WD] : AIR;
      switch (m) {
        case SOIL:
          if ((up === AIR || up === TUFT) && rnd() < 0.2 && this.moist(x, y, z)) { mat[i] = TURF; this.markDirty(x, z); }
          else if (up === WATER) this.growWeed(i, x, y, z, 1);
          break;
        case SAND:
          if (up === WATER) this.growWeed(i, x, y, z, 1);
          break;
        case TURF:
          if (OPAQUE[up] || up === WATER || up === LAVA) { if (rnd() < 0.4) { mat[i] = SOIL; this.markDirty(x, z); } }
          else if (up === AIR && rnd() < 0.05 && this.moist(x, y, z)) { mat[i + WD] = TUFT; aux[i + WD] = ri(256); this.markDirty(x, z); }
          break;
        case TUFT:
          if (y === 0 || mat[i - WD] !== TURF) { mat[i] = AIR; this.markDirty(x, z); }
          break;
        case WEED: {
          const below = y > 0 ? mat[i - WD] : STONE;
          if (!isWaterish(up) || !(OPAQUE[below] || below === WEED)) { mat[i] = WATER; aux[i] = 8; this.markDirty(x, z); }
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
          if ((below === SOIL || below === TURF) && this.moist(x, y, z)) {
            let crowded = false;
            for (let dz = -3; dz <= 3 && !crowded; dz++) for (let dx = -3; dx <= 3; dx++) {
              if (this.get(x + dx, y, z + dz) === WOOD || this.get(x + dx, y + 1, z + dz) === WOOD) { crowded = true; break; }
            }
            if (!crowded) { mat[i] = WOOD; aux[i] = 3 + ri(4); this.markDirty(x, z); }
            else if (rnd() < 0.15) { mat[i] = AIR; this.markDirty(x, z); }
          } else if (below !== AIR && rnd() < 0.03) { mat[i] = AIR; this.markDirty(x, z); }
          break;
        }
        case WATER:
          // thin films soak away
          if (aux[i] === 1 && y > 0 && mat[i - WD] !== WATER && rnd() < 0.3) {
            let lone = true;
            for (let d = 0; d < 4; d++) { if (this.get(x + DX[d], y, z + DZ[d]) === WATER) { lone = false; break; } }
            if (lone) { mat[i] = AIR; aux[i] = 0; this.markDirty(x, z); }
          }
          break;
        case LAVA:
          if (up !== LAVA && rnd() < (aux[i] <= 2 ? 0.25 : 0.012)) { mat[i] = BASALT; aux[i] = 0; this.markDirty(x, z); }
          break;
      }
    }
  }

  growWeed(i, x, y, z, level) {
    const mat = this.mat, aux = this.aux;
    if (y >= H - 2) return;
    const u = i + WD;
    if (mat[u] === WATER && aux[u] === 8 && isWaterish(mat[u + WD]) && rnd() < 0.06) {
      mat[u] = WEED; aux[u] = level; this.markDirty(x, z);
    }
  }

  count(m) { let c = 0; const mat = this.mat; for (let i = 0; i < N; i++) if (mat[i] === m) c++; return c; }

  // ---- persistence -------------------------------------------------------
  serialize() { return { m: b64(rle(this.mat)), a: b64(rle(this.aux)) }; }
  deserialize(o) {
    unrle(unb64(o.m), this.mat); unrle(unb64(o.a), this.aux);
    this.stamp.fill(0); this.dirty.fill(1);
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
