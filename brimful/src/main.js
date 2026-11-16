// Brimful — renderer, camera, tools, UI and the main loop.
import * as THREE from 'three';
import { World, W, H, D, RIM, CH, CX, CZ, AIR, STONE, SOIL, TURF, SAND, WATER, LAVA, STEAM, TUFT, WEED, SEED, FIRE, OPAQUE, rnd, ri } from './world.js';
import { generate } from './gen.js';
import { buildChunk, MATERIAL_COLORS } from './mesher.js';
import { Critters, KINDS } from './critters.js';
import { Fx } from './fx.js';
import { Sound } from './audio.js';
import { U, patchSolid, patchFluid, patchGlow, patchFlora, makeSky, makeMotes, makePost } from './gfx.js';
import { setNightGlow } from './critters.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'brimful-save-v1';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } },
  set(v) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 1, 900);
const cam = { yaw: 0.7, pitch: 0.52, dist: 128, tx: 0, ty: 10, tz: 0 };
const camGoal = { ...cam };

const hemi = new THREE.HemisphereLight(0xdcefff, 0x8a7a66, 1);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -58, right: 58, top: 58, bottom: -58, near: 10, far: 260 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
scene.add(hemi, sun, sun.target);

// everything voxel-ish lives in grid space, shifted so the planter is centred
const grid = new THREE.Group();
grid.position.set(-W / 2, 0, -D / 2);
scene.add(grid);

// the planter
{
  const clay = new THREE.MeshLambertMaterial({ color: 0xc9704a });
  const clayDark = new THREE.MeshLambertMaterial({ color: 0xa9583a });
  const T = 1.8, y0 = -1.4, h = RIM - y0;
  const wall = (sx, sz, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), clay); m.position.set(x, y0 + h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m); };
  wall(W + T * 2, T, 0, -D / 2 - T / 2); wall(W + T * 2, T, 0, D / 2 + T / 2);
  wall(T, D, -W / 2 - T / 2, 0); wall(T, D, W / 2 + T / 2, 0);
  const lip = (sx, sz, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.1, sz), clayDark); m.position.set(x, RIM - 0.55, z); m.castShadow = true; scene.add(m); };
  const L = 0.7;
  lip(W + T * 2 + L * 2, L, 0, -D / 2 - T - L / 2); lip(W + T * 2 + L * 2, L, 0, D / 2 + T + L / 2);
  lip(L, D + T * 2, -W / 2 - T - L / 2, 0); lip(L, D + T * 2, W / 2 + T + L / 2, 0);
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + T * 2, 1.4, D + T * 2), clayDark); base.position.y = y0 - 0.7; scene.add(base);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 2.4, 64), new THREE.MeshLambertMaterial({ color: 0xead9bd })); table.position.y = y0 - 2.6; table.receiveShadow = true; scene.add(table);
}

const solidMat = patchSolid(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const fluidMat = patchFluid(new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, shininess: 200, specular: 0xaaaaaa }));
const glowMat = patchGlow(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
const floraMat = patchFlora(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
scene.fog = new THREE.FogExp2(0xcfe6f0, 0.0008);
const sky = makeSky(); scene.add(sky);
const motes = makeMotes(); scene.add(motes);
const post = makePost(renderer, scene, camera);
let fxOn = true;
const ember = new THREE.PointLight(0xff7a2a, 0, 46, 1.1);
scene.add(ember);

const world = new World();
const fx = new Fx(grid);
const critters = new Critters(world, grid, fx);
const sound = new Sound();

const chunks = [];
for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) {
  const mk = (mat, order) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.renderOrder = order; m.visible = false; grid.add(m); return m; };
  const c = { cx, cz, solid: mk(solidMat, 0), flora: mk(floraMat, 0), glow: mk(glowMat, 1), fluid: mk(fluidMat, 2) };
  c.solid.castShadow = c.solid.receiveShadow = true;
  chunks.push(c);
}
function setGeo(mesh, d, cx, cz) {
  mesh.geometry.dispose();
  if (!d.count) { mesh.visible = false; mesh.geometry = new THREE.BufferGeometry(); return; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.col, 4));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx * CH + 8, H / 2, cz * CH + 8), 32);
  mesh.geometry = g; mesh.visible = true;
}
let meshCursor = 0;
function remesh(budget) {
  for (let n = 0; n < chunks.length && budget > 0; n++) {
    const k = (meshCursor + n) % chunks.length;
    if (!world.dirty[k]) continue;
    world.dirty[k] = 0;
    const c = chunks[k], d = buildChunk(world, c.cx, c.cz);
    setGeo(c.solid, d.solid, c.cx, c.cz); setGeo(c.fluid, d.fluid, c.cx, c.cz); setGeo(c.glow, d.glow, c.cx, c.cz); setGeo(c.flora, d.flora, c.cx, c.cz);
    budget--; meshCursor = k + 1;
  }
}

// brush cursor
const cursor = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55, depthTest: false }));
cursor.renderOrder = 5; cursor.visible = false; grid.add(cursor);

// ---------------------------------------------------------------- state
const state = {
  tool: 'sand', size: 2, paused: false, speed: 1, tod: 0.36, timeMode: 'auto', preset: 'valley',
  painting: false, pointerIn: false, mx: 0, my: 0,
};
const input = { x: 0, z: 0, up: 0 };
const keys = new Set();
const stick = { x: 0, y: 0 }; let touchUp = 0;

const TOOLS = [
  { id: 'look', label: 'Look', type: 'look', color: '#fff', icon: '<circle cx="9" cy="9" r="3.2" fill="none" stroke="#3a2a22" stroke-width="1.8"/><path d="M1.5 9C3.5 5 6 3.4 9 3.4S14.5 5 16.5 9c-2 4-4.5 5.6-7.500 5.600S3.500 13 1.500 9Z" fill="none" stroke="#3a2a22" stroke-width="1.6"/>' },
  { sep: 1 },
  { id: 'sand', label: 'Sand', type: 'pour', mat: SAND, p: 0.4, hz: 1500 },
  { id: 'soil', label: 'Soil', type: 'pour', mat: SOIL, p: 0.4, hz: 700 },
  { id: 'stone', label: 'Stone', type: 'build', mat: STONE },
  { id: 'water', label: 'Water', type: 'pour', mat: WATER, a: 8, p: 0.55, hz: 2400 },
  { id: 'lava', label: 'Lava', type: 'pour', mat: LAVA, a: 8, p: 0.3, hz: 420 },
  { id: 'seed', label: 'Seeds', type: 'pour', mat: SEED, p: 0.03, hz: 3000 },
  { id: 'fire', label: 'Spark', type: 'fire', color: '#ffb028', icon: '<path d="M9 1.500c.6 3 4 4.600 4 8.500a4 4 0 0 1-8 0c0-1.500.7-2.500 1.500-3.300.3 1.200.9 1.700 1.500 1.800C7.400 6 7.800 3.500 9 1.500Z" fill="#7a2a08"/>' },
  { id: 'dig', label: 'Scoop', type: 'dig', color: '#efe7d8', icon: '<path d="M11.500 2.500l4 4-2.200 2.200-4-4zM9 5.800l3.200 3.200-5 5.200c-1.200 1.200-3 1.300-4 .3s-.9-2.800.3-4z" fill="#3a2a22"/>' },
  { sep: 1 },
  { id: 'minnow', label: 'Minnow', type: 'critter', color: '#bfe9f2', icon: '<path d="M2 9c2.500-3.500 7-4 10 0-3 4-7.500 3.500-10 0Zm10 0 4-3v6z" fill="#e8742c"/>' },
  { id: 'mossback', label: 'Mossback', type: 'critter', color: '#e3efc6', icon: '<path d="M3 12a6 6 0 0 1 12 0z" fill="#5d8a36"/><circle cx="15" cy="11" r="2" fill="#d9b784"/>' },
  { id: 'glimmer', label: 'Glimmer', type: 'critter', color: '#2b3158', icon: '<circle cx="9" cy="9" r="6" fill="#e9ff8a" opacity=".35"/><circle cx="9" cy="9" r="2.600" fill="#f4ffb0"/>' },
  { id: 'possess', label: 'Ride along', type: 'possess', color: '#f6d9c9', icon: '<path d="M9 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm-5.500 14c0-3.600 2.500-6 5.500-6s5.500 2.400 5.500 6z" fill="#a94f2c"/>' },
];
const toolById = Object.fromEntries(TOOLS.filter(t => t.id).map(t => [t.id, t]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ---------------------------------------------------------------- UI
const toolsEl = $('tools');
for (const t of TOOLS) {
  if (t.sep) { const s = document.createElement('div'); s.className = 'sep'; toolsEl.append(s); continue; }
  const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = t.id;
  const col = t.color || hex(MATERIAL_COLORS[t.mat]);
  b.innerHTML = `<span class="sw" style="background:${col}">${t.icon ? `<svg viewBox="0 0 18 18">${t.icon}</svg>` : ''}</span>${t.label}`;
  b.onclick = () => setTool(t.id);
  toolsEl.append(b);
}
function setTool(id) {
  state.tool = id;
  for (const b of toolsEl.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === id);
  canvas.style.cursor = id === 'look' ? 'grab' : id === 'possess' ? 'pointer' : 'crosshair';
}
function setSize(s) { state.size = Math.max(1, Math.min(6, s)); $('dot').style.setProperty('--s', 4 + state.size * 2.6 + 'px'); }
$('szUp').onclick = () => setSize(state.size + 1);
$('szDn').onclick = () => setSize(state.size - 1);

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

function setPaused(p) { state.paused = p; $('bPause').textContent = p ? 'Play' : 'Pause'; $('bPause').classList.toggle('on', p); }
$('bPause').onclick = () => setPaused(!state.paused);
$('bSpeed').onclick = () => { state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1; $('bSpeed').textContent = state.speed + '×'; $('bSpeed').classList.toggle('on', state.speed > 1); };
function setRain(r) { world.raining = r; $('bRain').classList.toggle('on', r); }
$('bRain').onclick = () => setRain(!world.raining);
const TIME_MODES = { auto: 'Day cycle', noon: 'Noon', dusk: 'Dusk', night: 'Night' };
function setTimeMode(m) { state.timeMode = m; $('bTime').textContent = TIME_MODES[m]; }
$('bTime').onclick = () => { const k = Object.keys(TIME_MODES); setTimeMode(k[(k.indexOf(state.timeMode) + 1) % k.length]); };
$('bFx').onclick = () => { fxOn = !fxOn; $('bFx').textContent = fxOn ? 'Effects on' : 'Effects off'; };
$('bSound').onclick = () => { sound.init(); sound.setMuted(!sound.muted); $('bSound').textContent = sound.muted ? 'Sound off' : 'Sound on'; };
$('bWorld').onclick = (e) => { e.stopPropagation(); $('menu').classList.toggle('open'); };
for (const b of $('menu').querySelectorAll('button')) b.onclick = () => { $('menu').classList.remove('open'); newWorld(b.dataset.preset); toast('Fresh ' + b.firstChild.textContent.toLowerCase()); };
document.addEventListener('pointerdown', (e) => { if (!$('menu').contains(e.target)) $('menu').classList.remove('open'); });
const showHelp = (v) => $('help').classList.toggle('open', v);
$('bHelp').onclick = () => showHelp(true);
$('bStart').onclick = () => { showHelp(false); sound.init(); };
$('help').onclick = (e) => { if (e.target === $('help')) showHelp(false); };
$('bRelease').onclick = () => release();

// ---------------------------------------------------------------- world setup
function populate() {
  const want = state.preset === 'bare' ? {} : { minnow: 7, mossback: 5, glimmer: 6 };
  let tries = 4000;
  const left = { ...want };
  while (tries-- > 0 && (left.minnow > 0 || left.mossback > 0 || left.glimmer > 0)) {
    const x = 3 + ri(W - 6), z = 3 + ri(D - 6), gy = world.groundY(x, z), top = world.get(x, gy - 1, z);
    if (left.minnow > 0 && top === WATER && world.get(x, gy - 3, z) === WATER) { critters.spawn('minnow', x + 0.5, gy - 2, z + 0.5, true); left.minnow--; }
    else if (left.mossback > 0 && top === TURF) { critters.spawn('mossback', x + 0.5, gy + 0.1, z + 0.5, true); left.mossback--; }
    else if (left.glimmer > 0 && top === TURF) { critters.spawn('glimmer', x + 0.5, gy + 2 + rnd() * 3, z + 0.5, true); left.glimmer--; }
  }
}
function newWorld(preset) {
  release();
  state.preset = preset;
  critters.clear();
  generate(world, preset);
  populate();
  setRain(false);
  save();
}
function save() {
  store.set({ v: 1, w: world.serialize(), c: critters.serialize(), tod: state.tod, tm: state.timeMode, preset: state.preset, rain: world.raining });
}
function load() {
  const s = store.get();
  if (!s || s.v !== 1 || !s.w) return false;
  try {
    world.deserialize(s.w); critters.deserialize(s.c);
    state.tod = s.tod ?? 0.36; setTimeMode(s.tm in TIME_MODES ? s.tm : 'auto'); state.preset = s.preset || 'valley'; setRain(!!s.rain);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function gridRay() {
  ndc.set((state.mx / innerWidth) * 2 - 1, -(state.my / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  return { o: { x: o.x + W / 2, y: o.y, z: o.z + D / 2 }, d: { x: d.x, y: d.y, z: d.z } };
}
// Walk the ray through the grid. Returns the first filled cell (c) and the empty cell before it (p).
function pick() {
  const { o, d } = gridRay();
  const lo = [0, 0, 0], hi = [W, H, D], O = [o.x, o.y, o.z], Dr = [d.x, d.y, d.z];
  let t0 = 0, t1 = 1e9;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(Dr[a]) < 1e-9) { if (O[a] < lo[a] || O[a] > hi[a]) return null; continue; }
    let ta = (lo[a] - O[a]) / Dr[a], tb = (hi[a] - O[a]) / Dr[a]; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
  }
  if (t0 > t1) return null;
  t0 += 1e-3;
  const c = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDel = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const p = O[a] + Dr[a] * t0;
    c[a] = Math.min(hi[a] - 1, Math.max(0, Math.floor(p)));
    step[a] = Dr[a] > 0 ? 1 : -1;
    tDel[a] = Math.abs(1 / (Dr[a] || 1e-9));
    tMax[a] = t0 + ((Dr[a] > 0 ? c[a] + 1 - p : p - c[a]) * tDel[a]);
  }
  let prev = null;
  for (let n = 0; n < 400; n++) {
    const m = world.mat[c[0] + W * (c[2] + D * c[1])];
    if (m !== AIR && m !== STEAM && m !== FIRE) return { c: { x: c[0], y: c[1], z: c[2] }, p: prev || { x: c[0], y: Math.min(H - 1, c[1] + 1), z: c[2] }, m };
    prev = { x: c[0], y: c[1], z: c[2] };
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    c[a] += step[a]; tMax[a] += tDel[a];
    if (c[a] < 0 || c[a] >= hi[a]) {
      // left the grid: the floor and the inside of the planter walls still count as a surface
      if (a === 1 ? step[1] < 0 : prev.y < RIM) return { c: null, p: prev, m: 0 };
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------- tools
let pourLevel = 0, critterCd = 0;
function useTool(first) {
  const tool = toolById[state.tool];
  if (tool.type === 'look') return;
  if (tool.type === 'possess') {
    if (!first) return;
    const r = gridRay(), c = critters.pick(r.o, r.d);
    if (c) possess(c); else toast('Click a creature to ride along');
    return;
  }
  const hit = pick(); if (!hit) return;
  const R = state.size * 0.75, Ri = Math.ceil(R), p = hit.p;
  const each = (cx, cy, cz, fn) => {
    for (let dy = -Ri; dy <= Ri; dy++) for (let dz = -Ri; dz <= Ri; dz++) for (let dx = -Ri; dx <= Ri; dx++) {
      if (dx * dx + dy * dy + dz * dz > R * R) continue;
      const x = cx + dx, y = cy + dy, z = cz + dz;
      if (world.inb(x, y, z)) fn(x, y, z, world.get(x, y, z));
    }
  };
  if (tool.type === 'pour') {
    let y = p.y; for (let k = 0; k < 6 && y < H - 1 && world.get(p.x, y + 1, p.z) === AIR; k++) y++;
    let any = first && tool.mat === SEED;
    each(p.x, y, p.z, (x, yy, z, m) => {
      if (m !== AIR) return;
      if (rnd() < tool.p || (any && x === p.x && z === p.z && yy === y)) world.set(x, yy, z, tool.mat, tool.a || 0);
    });
    pourLevel = 1; sound.pour(1, tool.hz);
  } else if (tool.type === 'build') {
    each(p.x, p.y, p.z, (x, y, z, m) => { if (!OPAQUE[m]) world.set(x, y, z, tool.mat); });
    if (first) sound.blip(180, 0.08, 'triangle', 0.1);
  } else if (tool.type === 'dig') {
    if (!hit.c) return;
    let n = 0;
    each(hit.c.x, hit.c.y, hit.c.z, (x, y, z, m) => {
      if (m === AIR) return;
      world.set(x, y, z, AIR);
      if (n++ % 5 === 0 && MATERIAL_COLORS[m]) fx.burst(x + 0.5, y + 0.5, z + 0.5, 1, MATERIAL_COLORS[m], 2.2);
    });
    if (n) { pourLevel = 0.6; sound.pour(0.6, 900); }
  } else if (tool.type === 'fire') {
    const c = hit.c || p; let lit = 0;
    each(c.x, c.y, c.z, (x, y, z) => { if (world.ignite(x, y, z)) lit++; });
    each(p.x, p.y, p.z, (x, y, z, m) => { if (m === AIR && rnd() < 0.25) world.set(x, y, z, FIRE, 3); });
    if (first || lit) sound.sizzle();
  } else if (tool.type === 'critter') {
    if (!first && critterCd > 0) return;
    critterCd = 0.22;
    const k = tool.id;
    let y = p.y + 0.1;
    if (k === 'minnow' && hit.m === WATER && hit.c) { y = hit.c.y - 0.5; }
    if (k === 'glimmer') y += 2;
    const c = critters.spawn(k, p.x + 0.5, y, p.z + 0.5);
    if (c) { sound.blip(k === 'minnow' ? 880 : k === 'mossback' ? 520 : 1320, 0.14); fx.burst(c.x, c.y, c.z, 6, 0xffffff, 1.5); }
    else if (first) toast(`The world is full of ${KINDS[k].name}s`);
  }
}

function possess(c) {
  critters.possessed = c;
  camSaved = { dist: camGoal.dist, tx: camGoal.tx, ty: camGoal.ty, tz: camGoal.tz, pitch: camGoal.pitch };
  camGoal.dist = c.kind === 'minnow' ? 7 : 14; camGoal.pitch = c.kind === 'minnow' ? 0.12 : 0.4;
  document.body.classList.add('riding'); $('ride').classList.add('on');
  $('rideName').textContent = `You are a ${KINDS[c.kind].name}`;
  $('rideHint').textContent = document.body.classList.contains('touch') ? 'Stick to move · drag to look' : KINDS[c.kind].hint + ' · Esc to let go';
  sound.blip(700, 0.25);
  cursor.visible = false;
}
let camSaved = null;
function release() {
  if (!document.body.classList.contains('riding')) return;
  critters.possessed = null;
  document.body.classList.remove('riding'); $('ride').classList.remove('on');
  if (camSaved) Object.assign(camGoal, camSaved);
}
critters.onEvent = (t) => { if (t === 'lost') { release(); toast('Your creature is gone'); } };

// ---------------------------------------------------------------- input
const pointers = new Map();
let drag = null, pinch = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sound.init();
  canvas.setPointerCapture(e.pointerId);
  state.mx = e.clientX; state.my = e.clientY;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const riding = !!critters.possessed, looking = state.tool === 'look' || riding;
  if (e.pointerType === 'touch') {
    document.body.classList.add('touch');
    if (pointers.size >= 2) {
      state.painting = false; drag = 'gesture';
      const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    if (looking) drag = 'orbit'; else { state.painting = true; useTool(true); }
    return;
  }
  if (e.button === 2) drag = 'orbit';
  else if (e.button === 1 || (e.button === 0 && e.shiftKey)) drag = 'pan';
  else if (e.button === 0) { if (looking) drag = 'orbit'; else { state.painting = true; useTool(true); } }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  const dx = prev ? e.clientX - prev.x : 0, dy = prev ? e.clientY - prev.y : 0;
  if (prev) { prev.x = e.clientX; prev.y = e.clientY; }
  state.pointerIn = e.pointerType !== 'touch' || state.painting;
  if (drag === 'gesture' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch > 0) camGoal.dist = clampDist(camGoal.dist * pinch / Math.max(20, dist));
    pinch = dist;
    orbit(dx * 0.5, dy * 0.5);
    return;
  }
  state.mx = e.clientX; state.my = e.clientY;
  if (drag === 'orbit') orbit(dx, dy);
  else if (drag === 'pan') pan(dx, dy);
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) { drag = null; state.painting = false; }
  else if (drag === 'gesture' && pointers.size < 2) drag = null;
  if (e.pointerType === 'touch') state.pointerIn = false;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pointers.size) state.pointerIn = false; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); camGoal.dist = clampDist(camGoal.dist * Math.exp(e.deltaY * 0.0012)); }, { passive: false });

const clampDist = (d) => Math.max(critters.possessed ? 3 : 28, Math.min(230, d));
function orbit(dx, dy) { camGoal.yaw -= dx * 0.006; camGoal.pitch = Math.max(critters.possessed ? -0.5 : 0.06, Math.min(1.5, camGoal.pitch + dy * 0.006)); }
function pan(dx, dy) {
  if (critters.possessed) return;
  const k = camGoal.dist * 0.0013, cy = Math.cos(camGoal.yaw), sy = Math.sin(camGoal.yaw);
  camGoal.tx = Math.max(-40, Math.min(40, camGoal.tx - dx * k * cy - dy * k * sy * 0.8));
  camGoal.tz = Math.max(-40, Math.min(40, camGoal.tz + dx * k * sy - dy * k * cy * 0.8));
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.add(k);
  if (e.repeat) return;
  if (k === 'Escape') { if ($('help').classList.contains('open')) showHelp(false); else release(); return; }
  if (critters.possessed) { if (k === ' ' || k.startsWith('Arrow')) e.preventDefault(); if (k === 'e') release(); return; }
  if (k >= '1' && k <= '9') { const ids = TOOLS.filter(t => t.id).map(t => t.id); setTool(ids[+k] || ids[0]); }
  else if (k === '0') setTool('look');
  else if (k === '[') setSize(state.size - 1);
  else if (k === ']') setSize(state.size + 1);
  else if (k === 'p' || k === ' ') { e.preventDefault(); setPaused(!state.paused); }
  else if (k === 'r') setRain(!world.raining);
  else if (k === 'h' || k === '?') showHelp(!$('help').classList.contains('open'));
});
addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
addEventListener('blur', () => keys.clear());

// touch stick for riding
{
  const el = $('stick'), nub = el.firstElementChild; let id = null;
  const move = (e) => {
    const r = el.getBoundingClientRect();
    let x = (e.clientX - r.left - 60) / 45, y = (e.clientY - r.top - 60) / 45;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    stick.x = x; stick.y = y; nub.style.transform = `translate(${x * 35}px,${y * 35}px)`;
  };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = () => { id = null; stick.x = stick.y = 0; nub.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  for (const [b, v] of [[$('bUp'), 1], [$('bDown'), -1]]) {
    b.addEventListener('pointerdown', () => { touchUp = v; });
    b.addEventListener('pointerup', () => { touchUp = 0; }); b.addEventListener('pointercancel', () => { touchUp = 0; });
  }
}

function readInput() {
  let f = 0, s = 0;
  if (keys.has('w') || keys.has('ArrowUp')) f += 1;
  if (keys.has('s') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('d') || keys.has('ArrowRight')) s += 1;
  if (keys.has('a') || keys.has('ArrowLeft')) s -= 1;
  f -= stick.y; s += stick.x;
  const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  input.x = -sy * f + cy * s; input.z = -cy * f - sy * s;
  input.up = (keys.has(' ') ? 1 : 0) - (keys.has('Shift') ? 1 : 0) + touchUp;
}

// ---------------------------------------------------------------- sky & light
const SKY = {
  day: [new THREE.Color(0x86c3ee), new THREE.Color(0xe6f3ee)],
  dusk: [new THREE.Color(0x565a9c), new THREE.Color(0xf7b78c)],
  night: [new THREE.Color(0x0c1130), new THREE.Color(0x27315c)],
};
const cTop = new THREE.Color(), cBot = new THREE.Color(), cTmp = new THREE.Color(), cWhite = new THREE.Color(0xffffff);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let night = 0, skyKey = '';
function updateSky() {
  const ang = (state.tod - 0.25) * Math.PI * 2, sy = Math.sin(ang), cx = Math.cos(ang);
  const day = smooth(-0.12, 0.3, sy), dusk = Math.max(0, 1 - Math.abs(sy) / 0.32) * 0.85;
  night = 1 - day;
  cTop.copy(SKY.night[0]).lerp(SKY.day[0], day).lerp(SKY.dusk[0], dusk);
  cBot.copy(SKY.night[1]).lerp(SKY.day[1], day).lerp(SKY.dusk[1], dusk);
  const key = cTop.getHexString() + cBot.getHexString();
  sky.material.uniforms.uTop.value.copy(cTop); sky.material.uniforms.uBot.value.copy(cBot);
  sky.material.uniforms.uSunDir.value.set(cx * 70, 25 + sy * 95, 45).normalize();
  sky.material.uniforms.uSunCol.value.set(0xffb070).lerp(cTmp.set(0xfff4e0), smooth(0.05, 0.5, sy));
  U.uNight.value = night; U.uCaustic.value = 0.25 + 0.75 * day; U.uSky.value.copy(cTop).lerp(cBot, 0.5).multiplyScalar(0.25 + 0.75 * day);
  setNightGlow(night);
  if (key !== skyKey) { skyKey = key; document.body.style.background = `linear-gradient(#${cTop.getHexString()}, #${cBot.getHexString()})`; }
  if (sy > -0.02) {
    sun.position.set(cx * 70, 25 + sy * 95, 45);
    sun.intensity = 2.9 * smooth(-0.02, 0.28, sy);
    sun.color.set(0xffc38a).lerp(cTmp.set(0xfff6e6), smooth(0.05, 0.5, sy));
  } else {
    sun.position.set(-40, 100, -30);
    sun.intensity = 1.1 * smooth(-0.02, -0.25, sy);
    sun.color.set(0xa9bdff);
  }
  hemi.intensity = 0.75 + 0.35 * day + dusk * 0.15;
  hemi.color.set(0x7f93d8).lerp(cTmp.copy(cTop).lerp(cWhite, 0.45), day);
  hemi.groundColor.set(0x4a5078).lerp(cTmp.set(0x9a8468), day);
  floraMat.color.set(0x35455a).lerp(cTmp.set(0xf2f2e6), Math.min(1, day + dusk * 0.2));
}

// ---------------------------------------------------------------- loop
function handleEvents() {
  for (const e of world.events) {
    const x = e.x + 0.5, y = e.y + 0.5, z = e.z + 0.5;
    if (e.t === 'sizzle') { sound.sizzle(); for (let k = 0; k < 3; k++) fx.emit(x, y + 0.5, z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5, 0xffffff, 0.7, -0.05); }
    else if (e.t === 'ember') fx.emit(x, y + 0.4, z, (Math.random() - 0.5), 2 + Math.random() * 2.5, (Math.random() - 0.5), Math.random() < 0.5 ? 0xffd24a : 0xff7a1a, 0.6 + Math.random() * 0.5, -0.02);
    else {
      const col = e.t === 'spill' ? 0x7fd0ea : e.t === 'drip' ? 0xff8a2a : 0xe2cf9a;
      fx.emit(x, y, z, (Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6, col, 1.3, 1);
    }
  }
  world.events.length = 0;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  post.composer.setPixelRatio(renderer.getPixelRatio()); post.composer.setSize(innerWidth, innerHeight);
  post.grade.uniforms.uAspect.value = innerWidth / innerHeight;
  motes.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * 0.9;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.9 ? 48 : 34;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const sunDir = new THREE.Vector3(), fwd = new THREE.Vector3(), sunNdc = new THREE.Vector3();
let glowT = 0, glowGoal = 0;
const glowPos = new THREE.Vector3(0, 12, 0);
function trackGlow() {
  const mat = world.mat; let n = 0, sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < mat.length; i += 3) { // sparse sample is plenty
    const m = mat[i]; if (m !== LAVA && m !== FIRE) continue;
    n++; sx += i % W; sz += ((i / W) | 0) % D; sy += (i / (W * D)) | 0;
  }
  glowGoal = Math.min(1, n / 40);
  if (n) glowPos.set(sx / n - W / 2, sy / n + 5, sz / n - D / 2);
}

let last = performance.now(), acc = 0, toolAcc = 0, saveT = 0, statT = 0, frames = 0;
const TICK = 1 / 30;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; frames++;

  if (!state.paused) {
    acc += dt * state.speed;
    let n = 0;
    while (acc >= TICK && n++ < 4) { world.step(); acc -= TICK; handleEvents(); }
    if (acc > TICK) acc = 0;
    if (state.timeMode === 'auto') state.tod = (state.tod + dt * state.speed / 300) % 1;
  }
  if (state.timeMode !== 'auto') {
    const goal = { noon: 0.5, dusk: 0.765, night: 0.02 }[state.timeMode];
    let d = goal - state.tod; d -= Math.round(d);
    state.tod = (state.tod + d * Math.min(1, dt * 2.5) + 1) % 1;
  }

  // tools run at a steady rate, even while paused
  toolAcc += dt; critterCd -= dt;
  if (toolAcc >= TICK) { toolAcc %= TICK; if (state.painting && !critters.possessed) useTool(false); }
  pourLevel = Math.max(0, pourLevel - dt * 6);
  if (pourLevel <= 0) sound.pour(0);

  readInput();
  if (!state.paused) critters.update(dt * Math.min(2, state.speed), input, night);
  fx.update(dt);
  remesh(6);
  updateSky();
  sound.ambient(night);
  glowT -= dt; if (glowT <= 0) { glowT = 0.4; trackGlow(); }
  ember.position.lerp(glowPos, Math.min(1, dt * 3));
  ember.intensity += (glowGoal * (50 + night * 90) * (0.9 + 0.1 * Math.sin(now * 0.011)) - ember.intensity) * Math.min(1, dt * 4);

  // camera
  const ride = critters.possessed;
  if (ride) { camGoal.tx = ride.x - W / 2; camGoal.ty = ride.y + 0.6; camGoal.tz = ride.z - D / 2; }
  else if (!camSaved || !document.body.classList.contains('riding')) camGoal.ty = 10;
  const k = Math.min(1, dt * 9);
  for (const p of ['yaw', 'pitch', 'dist', 'tx', 'ty', 'tz']) cam[p] += (camGoal[p] - cam[p]) * k;
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.tx + cam.dist * cp * Math.sin(cam.yaw), cam.ty + cam.dist * Math.sin(cam.pitch), cam.tz + cam.dist * cp * Math.cos(cam.yaw));
  camera.lookAt(cam.tx, cam.ty, cam.tz);

  // brush preview
  const tool = toolById[state.tool];
  let show = false;
  if (state.pointerIn && !ride && !drag && tool.type !== 'look' && tool.type !== 'possess') {
    const hit = pick();
    if (hit) {
      const at = tool.type === 'dig' && hit.c ? hit.c : hit.p;
      const r = tool.type === 'critter' ? 0.6 : Math.max(0.6, state.size * 0.75);
      cursor.position.set(at.x + 0.5, at.y + 0.5, at.z + 0.5); cursor.scale.setScalar(r);
      cursor.material.color.set(tool.type === 'dig' ? 0xff6a5a : 0xffffff);
      show = true;
    }
  }
  cursor.visible = show;

  // atmosphere + post
  U.uTime.value = now / 1000;
  sky.position.copy(camera.position);
  const gm = world.get(Math.floor(camera.position.x + W / 2), Math.floor(camera.position.y), Math.floor(camera.position.z + D / 2));
  let inWater = (gm === WATER || gm === WEED) && camera.position.x > -W / 2 && camera.position.x < W / 2 && camera.position.z > -D / 2 && camera.position.z < D / 2;
  if (ride && ride.kind === 'minnow' && !inWater) { // riding a fish: the lens stays wet while it is below that fish's surface
    const fx0 = Math.floor(ride.x), fz0 = Math.floor(ride.z); let sy = Math.floor(ride.y + 0.2);
    if (world.get(fx0, sy, fz0) === WATER || world.get(fx0, sy, fz0) === WEED) {
      while (sy < H && (world.get(fx0, sy, fz0) === WATER || world.get(fx0, sy, fz0) === WEED)) sy++;
      inWater = camera.position.y < sy;
    }
  }
  U.uUnder.value += ((inWater ? 1 : 0) - U.uUnder.value) * Math.min(1, dt * 6);
  const un = U.uUnder.value;
  scene.fog.color.copy(cBot).lerp(cTmp.set(0x06313f).multiplyScalar(0.35 + 0.65 * (1 - night)), un);
  scene.fog.density = 0.0008 + un * 0.05;
  if (fxOn) {
    sunDir.copy(sun.position).normalize();
    camera.getWorldDirection(fwd);
    const facing = Math.max(0, fwd.dot(sunDir));
    sunNdc.copy(camera.position).addScaledVector(sunDir, 300).project(camera);
    const g = post.grade.uniforms;
    g.uSunPos.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
    g.uRays.value = (0.3 + facing * 0.9) * (1 - night * 0.7) * (fwd.dot(sunDir) > -0.2 ? 1 : 0) * (1 - un * 0.5);
    g.uRayCol.value.copy(sun.color);
    post.bloom.strength = 0.4 + night * 0.35 + un * 0.2;
    post.composer.render();
  } else renderer.render(scene, camera);

  statT += dt;
  if (statT > 0.5) {
    statT = 0;
    const c = critters.counts, pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    $('stats').textContent = `${pl(c.minnow, 'minnow')} · ${pl(c.mossback, 'mossback')} · ${pl(c.glimmer, 'glimmer')}`;
  }
  saveT += dt;
  if (saveT > 20) { saveT = 0; save(); }
}
addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

// ---------------------------------------------------------------- boot
setTool('sand'); setSize(2); setTimeMode('auto');
if (!load()) { generate(world, 'valley'); populate(); showHelp(true); }
resize();
remesh(99);
updateSky();
requestAnimationFrame(frame);

window.__brimful = { world, critters, state, cam: camGoal, setTool, newWorld, pick, possess, release, get frames() { return frames; } };
