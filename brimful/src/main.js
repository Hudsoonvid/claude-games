// Brimful — renderer, camera, tools and powers, graphics settings, saved worlds, UI and the main loop.
import * as THREE from 'three';
import * as WM from './world.js';
import { World, RIM, CH, AIR, STONE, SOIL, TURF, SAND, ICE, LAVA, STEAM, TUFT, WEED, SEED, FIRE, WOOD, BASALT, SPRING, DRAIN, OPAQUE, rnd, ri } from './world.js';
import { generate, WORLD_TYPES } from './gen.js';
import { BIO } from './biomes.js';
import { buildChunk, MATERIAL_COLORS, WATER_COLOR, BIOMES, setGrassDensity, setEdgeSolid } from './mesher.js';
import { Critters, KINDS, KIND_IDS, setNightGlow, loadModels, setCritterShadows, describe, townName } from './critters.js';
import { Fx } from './fx.js';
import { Sound } from './audio.js';
import { U, patchSolid, patchGlow, patchFlora, makeWater, makeSky, makeMotes, makePost } from './gfx.js';

const $ = (id) => document.getElementById(id);
const AUTO_KEY = 'brimful-save-v2', INDEX_KEY = 'brimful-worlds-v2', GFX_KEY = 'brimful-gfx-v1';
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* unavailable */ } },
};

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 1, 5000);
const cam = { yaw: 0.7, pitch: 0.52, dist: 128, tx: 0, ty: 10, tz: 0 };
const camGoal = { ...cam };

const hemi = new THREE.HemisphereLight(0xdcefff, 0x8a7a66, 1);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
const ember = new THREE.PointLight(0xff7a2a, 0, 46, 1.1);
scene.add(hemi, sun, sun.target, ember);
scene.fog = new THREE.FogExp2(0xcfe6f0, 0.0008);

const grid = new THREE.Group();            // grid space, shifted so the planter is centred
const stage = new THREE.Group();           // the planter and table
scene.add(grid, stage);

const solidMat = patchSolid(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const floraMat = patchFlora(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const glowMat = patchGlow(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
const mistMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9 });
const sky = makeSky(); scene.add(sky);
const motes = makeMotes(); scene.add(motes);
const water = makeWater(renderer); grid.add(water.mesh, water.skirt);
let post = null;

const world = new World();
const fx = new Fx(grid);
const critters = new Critters(world, grid, fx);
const sound = new Sound();
let W = WM.W, D = WM.D, H = WM.H, SF = 1;

// ---------------------------------------------------------------- stage + chunks (rebuilt per world size)
let chunks = [];
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
    setGeo(c.solid, d.solid, c.cx, c.cz); setGeo(c.mist, d.mist, c.cx, c.cz); setGeo(c.glow, d.glow, c.cx, c.cz); setGeo(c.flora, d.flora, c.cx, c.cz);
    budget--; meshCursor = k + 1;
  }
}

// a pennant on a pole beside each village's hearth, in that village's colour
const banners = {
  group: new THREE.Group(), count: -1,
  sync(force) {
    if (!force && this.count === critters.villages.length) return;
    this.count = critters.villages.length;
    for (const m of [...this.group.children]) { this.group.remove(m); m.traverse((o) => o.geometry && o.geometry.dispose()); }
    const pole = new THREE.MeshLambertMaterial({ color: 0x6a4a2e });
    for (const v of critters.villages) {
      const g = new THREE.Group(), x = v.x + 1.5, z = v.z + 0.5, y = world.groundY(x, z);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.2, 0.1), pole); p.position.y = 1.6; p.castShadow = true; g.add(p);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 6, 1), new THREE.MeshLambertMaterial({ color: v.colour, side: THREE.DoubleSide }));
      flag.geometry.translate(0.45, 0, 0); flag.position.y = 2.85; flag.castShadow = true; g.add(flag); g.userData.flag = flag;
      g.position.set(x, y, z); this.group.add(g);
    }
  },
  wave(t) {
    for (const g of this.group.children) {
      const pa = g.userData.flag.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i); pa.setZ(i, Math.sin(t * 4 + x * 5 + g.position.x) * 0.08 * x); }
      pa.needsUpdate = true;
    }
  },
};
grid.add(banners.group);
let booted = false;

// the container the world sits in: clay planter, glass tank, wooden crate, or nothing at all
function buildContainer() {
  for (const m of [...stage.children]) { stage.remove(m); m.geometry.dispose(); }
  const kind = gfx.container || 'planter', glassy = kind === 'glass' || kind === 'none';
  setEdgeSolid(!glassy); water.skirt.visible = glassy; world.dirty.fill(1);
  const T = 1.8, y0 = -1.4, h = RIM - y0, L = 0.7;
  const add = (sx, sy, sz, x, y, z, mat, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; stage.add(m); return m; };
  const lamb = (c) => new THREE.MeshLambertMaterial({ color: c });
  if (kind === 'planter') {
    const clay = lamb(0xc9704a), clayDark = lamb(0xa9583a);
    add(W + T * 2, h, T, 0, y0 + h / 2, -D / 2 - T / 2, clay); add(W + T * 2, h, T, 0, y0 + h / 2, D / 2 + T / 2, clay);
    add(T, h, D, -W / 2 - T / 2, y0 + h / 2, 0, clay); add(T, h, D, W / 2 + T / 2, y0 + h / 2, 0, clay);
    add(W + T * 2 + L * 2, 1.1, L, 0, RIM - 0.55, -D / 2 - T - L / 2, clayDark); add(W + T * 2 + L * 2, 1.1, L, 0, RIM - 0.55, D / 2 + T + L / 2, clayDark);
    add(L, 1.1, D + T * 2, -W / 2 - T - L / 2, RIM - 0.55, 0, clayDark); add(L, 1.1, D + T * 2, W / 2 + T + L / 2, RIM - 0.55, 0, clayDark);
    add(W + T * 2, 1.4, D + T * 2, 0, y0 - 0.7, 0, clayDark, false);
  } else if (kind === 'crate') {
    const wood = lamb(0xa77a4a), dark = lamb(0x7a5432), t = 1.0;
    for (let k = 0; k < 4; k++) { // boards with a gap line between each
      const y = y0 + (h / 4) * (k + 0.5), hh = h / 4 - 0.12;
      add(W + t * 2, hh, t, 0, y, -D / 2 - t / 2, wood); add(W + t * 2, hh, t, 0, y, D / 2 + t / 2, wood);
      add(t, hh, D, -W / 2 - t / 2, y, 0, wood); add(t, hh, D, W / 2 + t / 2, y, 0, wood);
    }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(1.4, h + 0.4, 1.4, x * (W / 2 + 0.5), y0 + h / 2, z * (D / 2 + 0.5), dark);
    add(W + t * 2, 1.2, D + t * 2, 0, y0 - 0.6, 0, dark, false);
  } else if (kind === 'glass') {
    const glass = new THREE.MeshPhongMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.13, shininess: 220, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
    const frame = lamb(0x3a3430), t = 0.12, g = h + 0.4;
    for (const m of [add(W, g, t, 0, y0 + g / 2, -D / 2 - t / 2, glass, false), add(W, g, t, 0, y0 + g / 2, D / 2 + t / 2, glass, false),
      add(t, g, D, -W / 2 - t / 2, y0 + g / 2, 0, glass, false), add(t, g, D, W / 2 + t / 2, y0 + g / 2, 0, glass, false)]) { m.renderOrder = 6; m.receiveShadow = false; }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(0.5, g, 0.5, x * (W / 2 + 0.1), y0 + g / 2, z * (D / 2 + 0.1), frame);
    for (const s of [-1, 1]) { add(W + 1, 0.4, 0.5, 0, y0 + g, s * (D / 2 + 0.1), frame); add(0.5, 0.4, D + 1, s * (W / 2 + 0.1), y0 + g, 0, frame); }
    add(W + 2, 1.6, D + 2, 0, y0 - 0.8, 0, frame, false);
  } else add(W, 1.2, D, 0, -0.6, 0, lamb(0x4a3a2c), false);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(Math.hypot(W, D) / 2 + 16, Math.hypot(W, D) / 2 + 16, 2.4, 64), lamb(0xead9bd));
  table.position.y = y0 - 2.6; table.receiveShadow = true; stage.add(table);
}

function buildStage() {
  W = WM.W; D = WM.D; H = WM.H; SF = Math.max(W, D) / 64;
  for (const c of chunks) for (const m of [c.solid, c.flora, c.glow, c.mist]) { grid.remove(m); m.geometry.dispose(); }
  chunks = [];
  for (let cz = 0; cz < WM.CZ; cz++) for (let cx = 0; cx < WM.CX; cx++) {
    const mk = (mat, order) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat); m.renderOrder = order; m.visible = false; grid.add(m); return m; };
    const c = { cx, cz, solid: mk(solidMat, 0), flora: mk(floraMat, 0), glow: mk(glowMat, 1), mist: mk(mistMat, 4) };
    c.solid.castShadow = c.solid.receiveShadow = true; c.flora.receiveShadow = true;
    chunks.push(c);
  }
  grid.position.set(-W / 2, 0, -D / 2);
  water.rebuild();
  buildContainer();
  // light + camera framing
  const half = Math.hypot(W, D) / 2 + 8;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: 320 * SF });
  sun.shadow.camera.updateProjectionMatrix();
  scene.fog.density = 0.0008 / SF;
  motes.material.uniforms.uSpan.value.set(W * 1.5, D * 1.5);
  camGoal.dist = 128 * SF * (innerWidth / innerHeight < 0.9 ? 1.25 : 1); camGoal.tx = camGoal.tz = 0;
  world.dirty.fill(1);
}

// brush cursor
const cursor = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55, depthTest: false }));
cursor.renderOrder = 6; cursor.visible = false; grid.add(cursor);

// ---------------------------------------------------------------- state
const state = {
  tool: 'sand', tab: 'earth', size: 2, paused: false, speed: 1, tod: 0.36, timeMode: 'auto', preset: 'valley', name: '',
  painting: false, pointerIn: false, mx: 0, my: 0, biome: 0, fp: false, shake: 0, flash: 0, seasons: true, year: 0.1, weatherT: 90, day: 1, yearN: 1, chron: [],
};
const input = { x: 0, z: 0, up: 0 };
const keys = new Set();
const stick = { x: 0, y: 0 }; let touchUp = 0;

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const TOOLS = [
  { id: 'look', tab: '*', label: 'Look', type: 'look', color: '#fff', glyph: '◉' },
  // earth
  { id: 'sand', tab: 'earth', label: 'Sand', type: 'pour', mat: SAND, p: 0.4, hz: 1500 },
  { id: 'soil', tab: 'earth', label: 'Soil', type: 'pour', mat: SOIL, p: 0.4, hz: 700 },
  { id: 'stone', tab: 'earth', label: 'Stone', type: 'build', mat: STONE },
  { id: 'water', tab: 'earth', label: 'Water', type: 'water', color: hex(WATER_COLOR) },
  { id: 'lava', tab: 'earth', label: 'Lava', type: 'pour', mat: LAVA, a: 8, p: 0.3, hz: 420 },
  { id: 'ice', tab: 'earth', label: 'Ice', type: 'build', mat: ICE },
  { id: 'spring', tab: 'earth', label: 'Spring', type: 'build', mat: SPRING, glyph: '≀', gc: '#fff' },
  { id: 'drain', tab: 'earth', label: 'Drain', type: 'build', mat: DRAIN, glyph: '▦', gc: '#ddd' },
  { id: 'seed', tab: 'earth', label: 'Seeds', type: 'pour', mat: SEED, p: 0.03, hz: 3000 },
  { id: 'raise', tab: 'earth', label: 'Raise', type: 'raise', color: '#d8c9a6', glyph: '▲' },
  { id: 'lower', tab: 'earth', label: 'Lower', type: 'lower', color: '#d8c9a6', glyph: '▼' },
  { id: 'smooth', tab: 'earth', label: 'Smooth', type: 'smooth', color: '#d8c9a6', glyph: '≈' },
  { id: 'biome', tab: 'earth', label: 'Biome', type: 'biome', color: '#6aa846', glyph: '❀' },
  { id: 'dig', tab: 'earth', label: 'Scoop', type: 'dig', color: '#efe7d8', glyph: '⌣' },
  // life
  ...KIND_IDS.map((k) => ({ id: k, tab: 'life', label: k[0].toUpperCase() + k.slice(1), type: 'critter',
    color: { minnow: '#bfe9f2', duck: '#fff3b8', frog: '#bfe6a8', mossback: '#e3efc6', rabbit: '#e8dccb', deer: '#e2c9a6', fox: '#f6c39a', crab: '#f7b5a4', villager: '#f3c9b0', bee: '#ffe98a', butterfly: '#ffd9ec', songbird: '#ffc9bd', glimmer: '#2b3158', koi: '#ffd2bd', turtle: '#cfe6b8', heron: '#dfe8f2', sheep: '#f4f0e6', owl: '#d9c4a6', wolf: '#c9c6c0', bear: '#b89a80', beaver: '#c8a684' }[k] || '#eee',
    glyph: { minnow: '➤', duck: '◖', frog: '⩌', mossback: '◓', rabbit: '⌃', deer: 'ᛉ', fox: '◣', crab: '⌓', villager: '☺', bee: '⁂', butterfly: '⋈', songbird: '♪', glimmer: '✦', koi: '➤', turtle: '◒', heron: '⌇', sheep: '☁', owl: '◉', wolf: '◭', bear: '●', beaver: '⌒' }[k] || k[0].toUpperCase(), gc: k === 'glimmer' ? '#f4ffb0' : '#3a2a22' })),
  { id: 'possess', tab: 'life', label: 'Ride along', type: 'possess', color: '#f6d9c9', glyph: '⌖' },
  // powers
  { id: 'fire', tab: 'powers', label: 'Spark', type: 'fire', color: '#ffb028', glyph: '♨' },
  { id: 'bolt', tab: 'powers', label: 'Lightning', type: 'bolt', color: '#ffe98a', glyph: 'ϟ' },
  { id: 'meteor', tab: 'powers', label: 'Meteor', type: 'meteor', color: '#5a4a5a', glyph: '☄', gc: '#ffb060' },
  { id: 'quake', tab: 'powers', label: 'Quake', type: 'quake', color: '#b9a68a', glyph: '≋' },
  { id: 'tornado', tab: 'powers', label: 'Tornado', type: 'tornado', color: '#b8b8c2', glyph: '֍' },
  { id: 'surge', tab: 'powers', label: 'Surge', type: 'surge', color: '#7fc6e6', glyph: '∿', gc: '#fff' },
  { id: 'cloud', tab: 'powers', label: 'Downpour', type: 'cloud', color: '#c9d6e6', glyph: '☂' },
  { id: 'dry', tab: 'powers', label: 'Dry up', type: 'dry', color: '#ffd978', glyph: '☀' },
  { id: 'freeze', tab: 'powers', label: 'Freeze', type: 'freeze', color: '#cfeefa', glyph: '❄' },
  { id: 'thaw', tab: 'powers', label: 'Thaw', type: 'thaw', color: '#ffc9a8', glyph: '♒' },
  { id: 'bloom', tab: 'powers', label: 'Bloom', type: 'bloom', color: '#ffd0e6', glyph: '✿' },
  { id: 'hut', tab: 'powers', label: 'Hut', type: 'hut', color: '#d9b65a', glyph: '⌂' },
  { id: 'settlers', tab: 'powers', label: 'Settlers', type: 'settlers', color: '#f3c9b0', glyph: '⚑' },
  { id: 'gift', tab: 'powers', label: 'Harvest gift', type: 'gift', color: '#f2d27a', glyph: '❦' },
  { id: 'shower', tab: 'powers', label: 'Meteor shower', type: 'shower', color: '#3a2e46', glyph: '✶', gc: '#ffb060' },
];
const toolById = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
const TABS = [['earth', 'Earth'], ['life', 'Life'], ['powers', 'Powers']];

const TIPS = {
  look: 'Drag to look around', sand: 'Pour sand: it slides into dunes', soil: 'Pour soil: holds steeper slopes and grows turf near water',
  stone: 'Build solid stone', water: 'Pour water: it flows, pools and spills', lava: 'Pour lava: sets things alight and turns to basalt in water',
  ice: 'Build ice: melts next to heat', spring: 'A block that wells up water forever', drain: 'A block that swallows water',
  seed: 'Scatter seeds: they sprout on damp soil', raise: 'Raise the land', lower: 'Lower the land', smooth: 'Even out the land',
  biome: 'Paint a biome: changes grass, leaves and tree shapes', dig: 'Scoop away anything, water included',
  possess: 'Click a creature to steer it yourself', fire: 'Set things alight', bolt: 'Call down lightning', meteor: 'Drop a meteor',
  quake: 'Shake and crack the ground', tornado: 'A twister that tears up the ground and flings things about', surge: 'Raise a wall of water that crashes outward', cloud: 'A local downpour', dry: 'Boil water off into steam', freeze: 'Turn standing water to ice',
  thaw: 'Melt ice back to water', bloom: 'Make everything nearby grow', hut: 'Raise a hut and a villager to live in it', settlers: 'Send a band of settlers to found a new village here', gift: 'Feed the villagers nearby and ripen their crops', shower: 'A scatter of small meteors over a wide area',
};

// ---------------------------------------------------------------- toolbar UI
const toolsEl = $('tools');
for (const t of TOOLS) {
  const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = t.id; b.dataset.tab = t.tab;
  const col = t.color || hex(MATERIAL_COLORS[t.mat]);
  b.innerHTML = `<span class="sw" style="background:${col};color:${t.gc || '#3a2a22'}">${t.glyph || ''}</span>${t.label}`;
  b.title = TIPS[t.id] || (t.type === 'critter' ? `Place a ${t.id}` : t.label);
  b.onclick = () => setTool(t.id);
  toolsEl.append(b);
}
for (const [id, label] of TABS) { const b = document.createElement('button'); b.textContent = label; b.dataset.tab = id; b.onclick = () => setTab(id); $('tabs').append(b); }
BIOMES.forEach((bm, i) => { const b = document.createElement('button'); b.innerHTML = `<i style="background:${hex(bm.hex)}"></i>${bm.name}`; b.onclick = () => { state.biome = i; syncSub(); }; $('sub').append(b); });
function syncSub() { $('sub').classList.toggle('open', state.tool === 'biome'); [...$('sub').children].forEach((b, i) => b.classList.toggle('on', i === state.biome)); }
function setTab(id) {
  state.tab = id;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === id);
  for (const b of toolsEl.children) b.classList.toggle('show', b.dataset.tab === id || b.dataset.tab === '*');
  if (toolById[state.tool].tab !== id && state.tool !== 'look') setTool(TOOLS.find((t) => t.tab === id).id);
}
function setTool(id) {
  state.tool = id;
  for (const b of toolsEl.children) b.classList.toggle('on', b.dataset.tool === id);
  canvas.style.cursor = id === 'look' ? 'grab' : id === 'possess' ? 'pointer' : 'crosshair';
  syncSub();
}
function setSize(s) { state.size = Math.max(1, Math.min(8, s)); $('dot').style.setProperty('--s', 4 + state.size * 2 + 'px'); }
$('szUp').onclick = () => setSize(state.size + 1);
$('szDn').onclick = () => setSize(state.size - 1);

let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }

function setPaused(p) { state.paused = p; $('bPause').textContent = p ? 'Play' : 'Pause'; $('bPause').classList.toggle('on', p); }
$('bPause').onclick = () => setPaused(!state.paused);
$('bSpeed').onclick = () => { state.speed = state.speed >= 8 ? 1 : state.speed * 2; $('bSpeed').textContent = state.speed + '×'; $('bSpeed').classList.toggle('on', state.speed > 1); };
// weather steps through: clear, rain, storm, snow
function setRain(r, storm = false, snow = false) {
  const was = world.snowing ? 'snow' : state.storm ? 'storm' : world.raining ? 'rain' : '', now = snow ? 'snow' : r && storm ? 'storm' : r ? 'rain' : '';
  if (typeof booted !== 'undefined' && booted && was !== now && now) chronicle({ rain: 'Rain set in', storm: 'A storm broke', snow: 'Snow began to fall' }[now]);
  world.raining = !!r && !snow; world.snowing = !!snow; state.storm = !!r && storm && !snow;
  $('bRain').classList.toggle('on', !!r || !!snow); $('bRain').textContent = snow ? 'Snow' : state.storm ? 'Storm' : 'Rain';
}
$('bRain').onclick = () => { state.weatherT = 240;   // a hand-picked sky holds for a while before the seasons take over again
  if (world.snowing) setRain(false); else if (!world.raining) setRain(true); else if (!state.storm) setRain(true, true); else setRain(false, false, true); };
const TIME_MODES = { auto: 'Day cycle', noon: 'Noon', dusk: 'Dusk', night: 'Night' };
function setTimeMode(m) { state.timeMode = m; $('bTime').textContent = TIME_MODES[m]; }
$('bTime').onclick = () => { const k = Object.keys(TIME_MODES); setTimeMode(k[(k.indexOf(state.timeMode) + 1) % k.length]); };
const sheets = ['worlds', 'settings', 'census'];
function openSheet(id) { for (const s of sheets) $(s).classList.toggle('open', s === id && !$(s).classList.contains('open')); if (id === 'worlds') renderSlots(); $('brand').classList.toggle('on', $('census').classList.contains('open')); if (id === 'census') renderCensus(); }
$('brand').onclick = (e) => { e.stopPropagation(); openSheet('census'); };
function renderCensus() {
  if (!$('census').classList.contains('open')) return;
  const c = critters.counts, row = (k, v, z) => `<div class="row${z ? ' zero' : ''}"><label>${k}</label><span>${v}</span></div>`;
  $('censusList').innerHTML = KIND_IDS.map((k) => row({ butterfly: 'Butterflies', deer: 'Deer', fox: 'Foxes', koi: 'Koi', sheep: 'Sheep', wolf: 'Wolves' }[k] || k[0].toUpperCase() + k.slice(1) + 's', c[k], !c[k])).join('');
  $('censusVillages').innerHTML = critters.villages.length ? critters.villages.map((v, i) => `<div class="row"><label><i class="swatch" style="background:${hex(v.colour)}"></i>${v.name}</label><span>${critters.population(i)}</span></div>`).join('') : '<div class="row zero"><label>No villages yet</label></div>';
  $('censusDate').textContent = dateLabel();
  $('censusChron').innerHTML = state.chron.length ? state.chron.slice(-8).reverse().map((e) => `<li><small>${e.d}</small>${e.t}${e.n > 1 ? ` <b>×${e.n}</b>` : ''}</li>`).join('') : '<li class="zero">Nothing has happened yet.</li>';
  $('censusWorld').innerHTML = (state.seasons ? row('Season', SEASONS[Math.floor(state.year * 4)]) : '') + row('Type', (WORLD_TYPES.find((t) => t[0] === state.preset) || [0, state.preset])[1]) + row('Seed', state.seed || '—') + row('Size', `${W} × ${D}`) + row('Water', Math.round(world.totalWater())) + row('Trees', Math.round(world.count(WOOD) / 5)) + row('Huts', Math.round(world.count(19)));
}
$('bWorld').onclick = (e) => { e.stopPropagation(); openSheet('worlds'); };
$('bSet').onclick = (e) => { e.stopPropagation(); openSheet('settings'); };
document.addEventListener('pointerdown', (e) => { if (!sheets.some((s) => $(s).contains(e.target)) && !$('ctl').contains(e.target) && !$('brand').contains(e.target)) { for (const s of sheets) $(s).classList.remove('open'); $('brand').classList.remove('on'); } });
const showHelp = (v) => $('help').classList.toggle('open', v);
$('bHelp').onclick = () => showHelp(true);
$('bStart').onclick = () => { showHelp(false); sound.init(); };
$('help').onclick = (e) => { if (e.target === $('help')) showHelp(false); };
$('bRelease').onclick = () => release();
$('bView').onclick = () => setFP(!state.fp);

// ---------------------------------------------------------------- graphics settings
const DPR = window.devicePixelRatio || 1;
const LEVELS = [
  { res: 1 / DPR, shadows: 0, grass: 4, bloom: false, rays: false, tilt: false, detail: false, aa: false, motes: false },
  { res: Math.min(DPR, 1.25) / DPR, shadows: 1024, grass: 8, bloom: true, rays: false, tilt: false, detail: true, aa: false, motes: true },
  { res: Math.min(DPR, 1.5) / DPR, shadows: 2048, grass: 12, bloom: true, rays: true, tilt: true, detail: true, aa: false, motes: true },
  { res: Math.min(DPR, 2) / DPR, shadows: 4096, grass: 18, bloom: true, rays: true, tilt: true, detail: true, aa: true, motes: true },
];
const LEVEL_NAMES = ['Low', 'Medium', 'High', 'Ultra'];
const touchy = matchMedia('(pointer: coarse)').matches;
const gfx = { mode: 'auto', level: touchy ? 1 : 2, ceil: 4, container: 'planter', ...LEVELS[touchy ? 1 : 2] };
{ const s = ls.get(GFX_KEY); if (s && typeof s === 'object') Object.assign(gfx, s); if (gfx.mode === 'auto') { gfx.ceil = 4; Object.assign(gfx, LEVELS[gfx.level]); } }
let appliedShadow = -1, appliedAA = null, appliedGrass = -1, usePost = true;
function applyGfx(save = true) {
  renderer.setPixelRatio(Math.max(0.4, DPR * gfx.res));
  if (gfx.shadows !== appliedShadow) {
    appliedShadow = gfx.shadows; sun.castShadow = gfx.shadows > 0;
    if (gfx.shadows) { sun.shadow.mapSize.set(gfx.shadows, gfx.shadows); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    solidMat.needsUpdate = floraMat.needsUpdate = true;
  }
  if (gfx.grass !== appliedGrass) { appliedGrass = gfx.grass; setGrassDensity(gfx.grass); world.dirty.fill(1); }
  usePost = gfx.bloom || gfx.rays || gfx.tilt;
  if (appliedAA !== gfx.aa || !post) { appliedAA = gfx.aa; if (post) post.dispose(); post = makePost(renderer, scene, camera, gfx.aa ? 4 : 0); }
  post.bloom.enabled = gfx.bloom;
  U.uDetail.value = gfx.detail ? 1 : 0;
  setCritterShadows(gfx.shadows >= 2048);
  for (const c of critters.list) c.mesh.traverse((o) => { if (o.isMesh && o.material.name !== 'wing' && o.material.name !== 'glow') o.castShadow = gfx.shadows >= 2048 && !['glimmer', 'butterfly', 'songbird', 'bee', 'owl'].includes(c.kind); });
  motes.visible = gfx.motes;
  resize();
  // reflect in the panel
  $('gContainer').value = gfx.container || 'planter';
  $('gQ').value = gfx.mode === 'auto' ? 'auto' : gfx.mode === 'custom' ? 'custom' : String(gfx.level);
  $('gRes').value = Math.round(gfx.res * 100 * DPR / Math.max(1, Math.min(DPR, 2)) ); $('gRes').value = Math.round(gfx.res * 100);
  $('gResO').textContent = Math.round(gfx.res * 100) + '%'; $('gShadow').value = String(gfx.shadows);
  $('gGrass').value = gfx.grass; $('gGrassO').textContent = gfx.grass ? gfx.grass : 'off';
  for (const [id, k] of [['gBloom', 'bloom'], ['gRays', 'rays'], ['gTilt', 'tilt'], ['gDetail', 'detail'], ['gAA', 'aa'], ['gMotes', 'motes']]) $(id).checked = gfx[k];
  if (save) ls.set(GFX_KEY, gfx);
}
function setLevel(l, mode) { gfx.level = Math.max(0, Math.min(3, l)); gfx.mode = mode; Object.assign(gfx, LEVELS[gfx.level]); applyGfx(); }
$('gRes').min = 30; $('gRes').max = 100;
$('gQ').onchange = (e) => { const v = e.target.value; if (v === 'auto') { gfx.ceil = 4; setLevel(gfx.level, 'auto'); perf.reset(); } else if (v === 'custom') { gfx.mode = 'custom'; applyGfx(); } else setLevel(+v, 'fixed'); };
const custom = (fn) => (e) => { fn(e.target); gfx.mode = 'custom'; applyGfx(); };
$('gRes').oninput = custom((t) => { gfx.res = t.value / 100; });
$('gShadow').onchange = custom((t) => { gfx.shadows = +t.value; });
$('gGrass').oninput = custom((t) => { gfx.grass = +t.value; });
for (const [id, k] of [['gBloom', 'bloom'], ['gRays', 'rays'], ['gTilt', 'tilt'], ['gDetail', 'detail'], ['gAA', 'aa'], ['gMotes', 'motes']]) $(id).onchange = custom((t) => { gfx[k] = t.checked; });
$('gSound').onchange = (e) => { sound.init(); sound.setMuted(!e.target.checked); };
function setSeasons(v) { state.seasons = !!v; $('gSeasons').checked = state.seasons; }
$('gSeasons').onchange = (e) => setSeasons(e.target.checked);
$('gContainer').onchange = (e) => { gfx.container = e.target.value; ls.set(GFX_KEY, gfx); buildContainer(); };

// Auto quality: watch real frame times, step down when it struggles, creep back up when there is clear headroom.
const perf = {
  n: 0, sum: 0, skip: 90, good: 0, fps: 60, best: 1000,
  reset() { this.n = 0; this.sum = 0; this.skip = 90; this.good = 0; },
  frame(ms) {
    if (ms > 2000) return;                      // tab was hidden
    if (this.skip > 0) { this.skip -= ms > 50 ? 6 : 1; return; }
    this.n++; this.sum += ms;
    if (this.n < 75 && this.sum < 2500) return;
    const avg = this.sum / this.n; this.n = 0; this.sum = 0; this.fps = 1000 / avg; this.best = Math.min(this.best, avg);
    if (gfx.mode !== 'auto') return;
    if (avg > 23 && gfx.level > 0) { gfx.ceil = gfx.level; setLevel(gfx.level - 1, 'auto'); this.reset(); toast(`Graphics set to ${LEVEL_NAMES[gfx.level]} to keep things smooth`); }
    else if (avg < this.best * 1.12 && avg < 18) { if (++this.good >= 6 && gfx.level + 1 < gfx.ceil && gfx.level < 3) { setLevel(gfx.level + 1, 'auto'); this.reset(); } }
    else this.good = 0;
  },
};

// ---------------------------------------------------------------- world setup, saving
function populate(villages) {
  if (state.preset === 'bare') return;
  const area = (W * D) / 4096, n = (k) => Math.max(1, Math.round(k * area));
  const left = { minnow: n(8), koi: n(2), duck: n(2), turtle: n(1), heron: n(1), frog: n(3), crab: n(3), mossback: n(4), rabbit: n(4), deer: n(2), fox: n(1), beaver: n(1), bear: area >= 1.5 ? n(0.5) : 0, wolf: area >= 1.5 ? n(1.5) : 0, bee: n(4), butterfly: n(5), songbird: n(3), owl: n(1), glimmer: n(6) };
  let tries = 6000 * area;
  while (tries-- > 0 && Object.values(left).some((v) => v > 0)) {
    const x = 3 + rnd() * (W - 6), z = 3 + rnd() * (D - 6), gy = world.groundY(x, z), top = world.get(x | 0, gy - 1, z | 0);
    const s = world.surfAt(x, z), dep = world.depthAt(x, z);
    if (s > 0 && dep > 1.5 && left.minnow > 0) { critters.spawn('minnow', x, s - dep * 0.5, z, true); left.minnow--; }
    else if (s > 0 && dep > 1.8 && left.koi > 0) { critters.spawn('koi', x, s - dep * 0.5, z, true); left.koi--; }
    else if (s > 0 && dep > 0.3 && left.turtle > 0) { critters.spawn('turtle', x, s, z, true); left.turtle--; }
    else if (s > 0 && dep < 1 && left.heron > 0) { critters.spawn('heron', x, s, z, true); left.heron--; }
    else if (s > 0 && dep > 0.7 && left.duck > 0) { critters.spawn('duck', x, s, z, true); left.duck--; }
    else if (s > 0 && dep > 0.2 && dep < 1.5 && left.frog > 0) { critters.spawn('frog', x, s, z, true); left.frog--; }
    else if (s > 0 && dep < 1.2 && left.crab > 0) { critters.spawn('crab', x, s, z, true); left.crab--; }
    else if (s > 0 && dep > 0.4 && dep < 1.5 && left.beaver > 0) { critters.spawn('beaver', x, s, z, true); left.beaver--; }
    else if (top === TURF && s < 0) {
      const k = ['mossback', 'rabbit', 'deer', 'fox', 'bear', 'wolf', 'bee', 'butterfly', 'glimmer', 'songbird', 'owl'].find((q) => left[q] > 0 && rnd() < 0.3);
      if (k === 'wolf') { for (let j = 0; j < 3 && left.wolf > 0; j++) { critters.spawn('wolf', x + rnd() * 2, gy + 0.1, z + rnd() * 2, true); left.wolf--; } }   // wolves come in packs
      else if (k) { critters.spawn(k, x, gy + (['mossback', 'rabbit', 'deer', 'fox', 'bear'].includes(k) ? 0.1 : 2 + rnd() * 3), z, true); left[k]--; }
    }
  }
  for (const v of villages || []) for (let k = 0, vid = critters.found(v.x, v.z); k < 2 + v.huts; k++) {
    const x = v.x + 0.5 + (rnd() - 0.5) * 5, z = v.z + 0.5 + (rnd() - 0.5) * 5;
    const c = critters.spawn('villager', x, world.groundY(x, z) + 0.1, z, true); if (c) { c.hx = v.x; c.hz = v.z; c.vid = vid; }
    if (k < 2) { const sx = v.x + (rnd() - 0.5) * 9, sz = v.z + (rnd() - 0.5) * 9, sh = critters.spawn('sheep', sx, world.groundY(sx, sz) + 0.1, sz, true); if (sh) { sh.hx = v.x; sh.hz = v.z; } }   // each village keeps a few sheep
  }
}
const SEED_A = ['amber', 'birch', 'clover', 'dusk', 'ember', 'fern', 'glade', 'heron', 'iris', 'juniper', 'kestrel', 'lichen', 'moss', 'nettle', 'otter', 'pebble', 'quill', 'reed', 'sorrel', 'thistle', 'umber', 'violet', 'willow', 'yarrow'];
const SEED_B = ['brook', 'cove', 'dell', 'fen', 'glen', 'hill', 'isle', 'knoll', 'lake', 'marsh', 'moor', 'pond', 'ridge', 'shore', 'vale', 'wood'];
const randomSeed = () => `${SEED_A[(Math.random() * SEED_A.length) | 0]}-${SEED_B[(Math.random() * SEED_B.length) | 0]}-${10 + ((Math.random() * 90) | 0)}`;
function newWorld(preset, w = W, d = D, seedText = randomSeed()) {
  state.seed = seedText;
  release(); resetScene();
  state.preset = preset; state.name = ''; state.day = 1; state.yearN = 1; state.chron = [];
  critters.clear();
  if (w !== WM.W || d !== WM.D) world.resize(w, d);
  const villages = generate(world, preset, seedText);
  buildStage();
  const was = booted; booted = false; populate(villages); booted = was;
  WM.setSeed(Math.random() * 1e9);   // from here on the world lives its own life   // no announcements for the villages a world starts with
  banners.sync(true);
  setRain(false); syncName();
  remesh(9999); water.update(world);   // fully drawn before the first frame
  autosave();
}
const snapshot = () => ({ v: 2, w: world.serialize(), c: critters.serialize(), tod: state.tod, tm: state.timeMode, preset: state.preset, rain: world.raining, storm: state.storm, snow: world.snowing, name: state.name, year: state.year, seasons: state.seasons, seed: state.seed, villages: critters.villages, day: state.day, yearN: state.yearN, chron: state.chron });
function restore(s) {
  if (!s || s.v !== 2 || !s.w) return false;
  try {
    release(); resetScene(); critters.clear();
    world.deserialize(s.w); buildStage(); critters.deserialize(s.c); critters.villages = Array.isArray(s.villages) ? s.villages : []; const was = booted; booted = false; critters.update(0, input, 0); booted = was; remesh(9999); water.update(world); banners.sync(true);
    state.tod = s.tod ?? 0.36; setTimeMode(s.tm in TIME_MODES ? s.tm : 'auto'); state.preset = s.preset || 'valley'; state.name = s.name || ''; state.year = s.year ?? 0.1; state.seed = s.seed || ''; state.day = s.day || 1; state.yearN = s.yearN || 1; state.chron = Array.isArray(s.chron) ? s.chron : []; setSeasons(s.seasons ?? true); setRain(!!s.rain || !!s.snow, !!s.storm, !!s.snow);
    syncName();
    return true;
  } catch (e) { console.warn('could not load world', e); return false; }
}
function autosave() { ls.set(AUTO_KEY, snapshot()); }
function syncName() { $('wname').textContent = state.name || 'Brimful'; $('saveName').value = state.name; }

function renderSlots() {
  const idx = ls.get(INDEX_KEY) || [], el = $('slots');
  el.innerHTML = idx.length ? '' : '<small style="opacity:.6;padding:2px">No saved worlds yet. Worlds are kept in this browser.</small>';
  for (const s of idx) {
    const row = document.createElement('div'); row.className = 'slot';
    const info = document.createElement('div'); const b = document.createElement('b'); b.textContent = s.name;
    const sm = document.createElement('small'); sm.textContent = `${s.type} · ${s.w}×${s.d} · ${new Date(s.ts).toLocaleDateString()}`;
    info.append(b, sm);
    const load = document.createElement('button'); load.className = 'ghost'; load.textContent = 'Load';
    load.onclick = () => { if (restore(ls.get('brimful-w-' + s.id))) { toast('Loaded ' + s.name); autosave(); } else toast('That save could not be read'); };
    const del = document.createElement('button'); del.className = 'ghost'; del.textContent = 'Delete';
    del.onclick = () => { if (del.dataset.sure) { ls.del('brimful-w-' + s.id); ls.set(INDEX_KEY, (ls.get(INDEX_KEY) || []).filter((q) => q.id !== s.id)); renderSlots(); } else { del.dataset.sure = 1; del.textContent = 'Sure?'; } };
    row.append(info, load, del); el.append(row);
  }
}
$('bSave').onclick = () => {
  const name = $('saveName').value.trim() || `${WORLD_TYPES.find((t) => t[0] === state.preset)?.[1] || 'World'} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  state.name = name;
  let idx = ls.get(INDEX_KEY) || [];
  let slot = idx.find((s) => s.name === name);
  if (!slot) { slot = { id: Date.now().toString(36) + ri(1e4).toString(36), name }; idx.unshift(slot); }
  Object.assign(slot, { type: WORLD_TYPES.find((t) => t[0] === state.preset)?.[1] || state.preset, w: W, d: D, ts: Date.now() });
  if (ls.set('brimful-w-' + slot.id, snapshot()) && ls.set(INDEX_KEY, idx)) { toast('Saved ' + name); syncName(); autosave(); }
  else toast('Out of browser storage. Delete an old world first.');
  renderSlots();
};
// new-world form
let pickType = 'valley';
{ // the world-type picker: grouped, searchable
  const groups = {};
  for (const [id, label, note, group] of WORLD_TYPES) (groups[group] ||= []).push([id, label, note]);
  for (const [group, list] of Object.entries(groups)) {
    const h = document.createElement('h5'); h.textContent = group; $('types').append(h);
    const g = document.createElement('div'); g.className = 'grid'; $('types').append(g);
    for (const [id, label, note] of list) {
      const b = document.createElement('button'); b.className = 'pick'; b.dataset.t = id; b.dataset.q = (label + ' ' + note + ' ' + group).toLowerCase();
      b.innerHTML = `${label}<small>${note}</small>`;
      b.onclick = () => { pickType = id; for (const q of $('types').querySelectorAll('.pick')) q.classList.toggle('on', q.dataset.t === id); };
      b.ondblclick = () => $('bCreate').click();
      g.append(b);
    }
  }
  $('types').querySelector('.pick').classList.add('on');
  $('typeFilter').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const b of $('types').querySelectorAll('.pick')) b.hidden = !!q && !b.dataset.q.includes(q);
    for (const g of $('types').querySelectorAll('.grid')) { const any = [...g.children].some((b) => !b.hidden); g.hidden = !any; g.previousElementSibling.hidden = !any; }
  };
}
// world size: type any width and depth; sizes snap to whole 16-block chunks
const SIZE_MIN = 16, SIZE_MAX = 256;
const snapSize = (v) => Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round((+v || 64) / 16) * 16));
for (const [label, w, d] of [['Tiny', 32, 32], ['Small', 48, 48], ['Medium', 64, 64], ['Large', 96, 96], ['Huge', 160, 160], ['Giant', 256, 256], ['Long', 160, 48], ['Tall', 48, 160]]) {
  const b = document.createElement('button'); b.textContent = `${label} ${w}×${d}`; b.dataset.w = w; b.dataset.d = d;
  b.onclick = () => { $('wW').value = w; $('wD').value = d; sizeNote(); };
  $('sizeChips').append(b);
}
for (const el of [$('wW'), $('wD')]) {
  el.oninput = sizeNote;
  el.onchange = () => { el.value = snapSize(el.value); sizeNote(); };
  el.onkeydown = (e) => { if (e.key === 'Enter') $('bCreate').click(); };
}
$('wSeed').onkeydown = (e) => { if (e.key === 'Enter') $('bCreate').click(); };
function sizeNote() {
  const w = snapSize($('wW').value), d = snapSize($('wD').value), a = w * d;
  for (const b of $('sizeChips').children) b.classList.toggle('on', +b.dataset.w === w && +b.dataset.d === d);
  const snapped = w !== +$('wW').value || d !== +$('wD').value ? ` Will be ${w} × ${d}: sizes go in steps of 16, from 16 to 256.` : '';
  $('sizeNote').textContent = (a <= 4096 ? 'Runs well everywhere.' : a <= 9216 ? 'Roomy.' : a <= 25600 ? 'Large: wants a decent computer.' : a <= 40000 ? 'Huge: may run slowly.' : 'Giant: expect it to be slow, and saving may not fit.') + snapped;
}
sizeNote();
$('bCreate').onclick = () => {
  const w = snapSize($('wW').value), d = snapSize($('wD').value);
  $('wW').value = w; $('wD').value = d; sizeNote();
  $('worlds').classList.remove('open');
  const label = WORLD_TYPES.find((t) => t[0] === pickType)[1];
  toast(`Making a ${w} × ${d} ${label.toLowerCase()}…`);
  const sd = $('wSeed').value.trim() || randomSeed();
  setTimeout(() => { newWorld(pickType, w, d, sd); $('wSeed').value = ''; toast(`A fresh ${label.toLowerCase()}, ${w} × ${d}, seed ${sd}`); }, 30);   // let the toast paint before the work
};

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function gridRay() {
  ndc.set((state.mx / innerWidth) * 2 - 1, -(state.my / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  return { o: { x: o.x + W / 2, y: o.y, z: o.z + D / 2 }, d: { x: d.x, y: d.y, z: d.z } };
}
// Walk the ray through the grid. Returns the first filled cell (c), the empty cell before it (p), and what was hit (m; -1 = water).
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
  for (let n = 0; n < 700; n++) {
    const m = world.mat[c[0] + W * (c[2] + D * c[1])];
    const hit = m !== AIR && m !== STEAM && m !== FIRE ? m : world.wet(c[0], c[1], c[2]) ? -1 : 0;
    if (hit) return { c: { x: c[0], y: c[1], z: c[2] }, p: prev || { x: c[0], y: Math.min(H - 1, c[1] + 1), z: c[2] }, m: hit };
    prev = { x: c[0], y: c[1], z: c[2] };
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    c[a] += step[a]; tMax[a] += tDel[a];
    if (c[a] < 0 || c[a] >= hi[a]) {
      if (a === 1 ? step[1] < 0 : prev.y < RIM) return { c: null, p: prev, m: 0 };
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------- tools and powers
let pourLevel = 0, critterCd = 0, toolTick = 0;
const transients = [];   // short-lived things: meteors, lightning bolts, tornadoes
const live = new Set();  // their scene objects, so a world change can sweep them away

// Nothing from the old world may follow into a new or loaded one.
// ---------------------------------------------------------------- undo: whole-world snapshots taken before each stroke
const history = {
  past: [], future: [],
  snap() {
    return { mat: world.mat.slice(), aux: world.aux.slice(), biome: world.biome.slice(), wd: world.wd.slice(), c: critters.serialize(), v: JSON.parse(JSON.stringify(critters.villages)), w: W, d: D };
  },
  limit() { return Math.max(4, Math.min(30, Math.floor(60e6 / (world.mat.length * 2 + world.wd.length * 4 + 1)))); },   // about 60 MB of history at most
  push() {
    this.past.push(this.snap()); this.future.length = 0;
    while (this.past.length > this.limit()) this.past.shift();
    syncUndo();
  },
  apply(s) {
    if (s.w !== W || s.d !== D) return false;
    release(); inspect(null);
    for (const o of live) { grid.remove(o); o.geometry.dispose(); }
    live.clear(); transients.length = 0;
    world.mat.set(s.mat); world.aux.set(s.aux); world.biome.set(s.biome); world.wd.set(s.wd);
    for (const f of [world.fl, world.fr, world.ft, world.fb]) f.fill(0);
    world.colDirty.fill(1); world.dirty.fill(1); world.awake.fill(40); world.updateBeds(); world.wakeAllWater(); world.aggregate();
    critters.deserialize(s.c); critters.villages = s.v; banners.sync(true);
    return true;
  },
  undo() { const s = this.past.pop(); if (!s) { toast('Nothing to undo'); return; } this.future.push(this.snap()); if (this.apply(s)) toast('Undone'); syncUndo(); },
  redo() { const s = this.future.pop(); if (!s) { toast('Nothing to redo'); return; } this.past.push(this.snap()); if (this.apply(s)) toast('Redone'); syncUndo(); },
  clear() { this.past.length = 0; this.future.length = 0; syncUndo(); },
};
function syncUndo() { $('bUndo').disabled = !history.past.length; $('bRedo').disabled = !history.future.length; }
$('bUndo').onclick = () => history.undo();
$('bRedo').onclick = () => history.redo();

function resetScene() {
  history.clear();
  for (const o of live) { grid.remove(o); o.geometry.dispose(); }
  live.clear(); transients.length = 0;
  fx.clear(); world.events.length = 0;
  state.shake = 0; state.flash = 0; state.painting = false; state.weatherT = 90; state.year = 0.1;
  pourLevel = 0; sound.pour(0); sound.babble(0);
  acc = 0; ember.intensity = 0; glowGoal = 0; overcast = 0; U.uRain.value = 0; U.uUnder.value = 0;
  pointers.clear(); drag = null; cursor.visible = false; inspect(null);
}

function topOf(x, z) { const b = world.bed[x + z * W] | 0; return { y: b - 1, m: b > 0 ? world.get(x, b - 1, z) : STONE }; }
function raiseCol(x, z) {
  const { y, m } = topOf(x, z); if (y >= H - 6) return;
  if (m === TURF) { world.set(x, y, z, SOIL); world.set(x, y + 1, z, TURF); }
  else world.set(x, y + 1, z, m === LAVA || m === WOOD ? STONE : m);
}
function lowerCol(x, z) {
  const { y } = topOf(x, z); if (y < 1) return;
  const m = world.get(x, y, z);
  world.set(x, y, z, AIR);
  for (let k = 1; k < 3; k++) { const u = world.get(x, y + k, z); if (u === TUFT || u === WEED || u === SEED) world.set(x, y + k, z, AIR); }
  if (m === TURF && world.get(x, y - 1, z) === SOIL) world.set(x, y - 1, z, TURF);
}

// ---------------------------------------------------------------- the chronicle: what happened, and when
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const vname = (c) => (critters.villages[c.vid] || {}).name || 'the wilds';
function dateLabel() { return `Day ${state.day}` + (state.seasons ? `, ${SEASONS[Math.floor(state.year * 4)].toLowerCase()} of year ${state.yearN}` : ''); }
function chronicle(text) {
  const last = state.chron[state.chron.length - 1];
  if (last && last.t === text && last.d === dateLabel()) { last.n = (last.n || 1) + 1; }
  else state.chron.push({ d: dateLabel(), t: text });
  if (state.chron.length > 80) state.chron.splice(0, state.chron.length - 80);
}

function strike(p) {
  // a jagged bolt from the sky
  const pts = []; let x = p.x + 0.5, z = p.z + 0.5;
  for (let y = p.y; y <= H + 14; y += 2.5) { pts.push(new THREE.Vector3(x, y, z)); x += (Math.random() - 0.5) * 2.4; z += (Math.random() - 0.5) * 2.4; }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(6, 6.5, 8) }));
  grid.add(line); live.add(line); let life = 0.2;
  transients.push((dt) => { life -= dt; line.visible = Math.random() < 0.8; if (life <= 0) { grid.remove(line); live.delete(line); line.geometry.dispose(); return true; } });
  state.flash = 0.5; state.shake = Math.max(state.shake, 0.35);
  if (!state.storm || Math.random() < 0.15) chronicle('Lightning struck');
  for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    if (dx * dx + dy * dy + dz * dz > 5) continue;
    const X = p.x + dx, Y = p.y + dy, Z = p.z + dz;
    if (!world.ignite(X, Y, Z) && world.get(X, Y, Z) === AIR && Math.random() < 0.25 && !world.wet(X, Y, Z)) world.set(X, Y, Z, FIRE, 4);
    if (world.get(X, Y, Z) === SAND && Math.random() < 0.3) world.set(X, Y, Z, BASALT);
  }
  critters.blast(p.x + 0.5, p.y, p.z + 0.5, 2.2, 0xffffff);
  fx.burst(p.x + 0.5, p.y + 0.5, p.z + 0.5, 24, 0xfff2a8, 6);
  sound.boom(0.6, 1.6, 160); sound.sizzle();
}

function meteor(p, size, quiet) {
  if (!quiet) chronicle('A meteor struck');
  const R = 2 + size * 0.8;
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + size * 0.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.8) }));
  const from = new THREE.Vector3(p.x + 0.5 + 26, p.y + 60, p.z + 0.5 - 14), to = new THREE.Vector3(p.x + 0.5, p.y + 0.5, p.z + 0.5);
  grid.add(rock); live.add(rock); let t = 0;
  transients.push((dt) => {
    t += dt / 1.1; rock.position.lerpVectors(from, to, Math.min(1, t * t)); rock.rotation.x += dt * 9;
    for (let k = 0; k < 3; k++) fx.emit(rock.position.x, rock.position.y, rock.position.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, Math.random() < 0.5 ? 0xffd24a : 0xff6a1a, 0.7, 0.1);
    if (t < 1) return false;
    grid.remove(rock); live.delete(rock); rock.geometry.dispose();
    const Ri = Math.ceil(R + 1);
    for (let dy = -Ri; dy <= Ri; dy++) for (let dz = -Ri; dz <= Ri; dz++) for (let dx = -Ri; dx <= Ri; dx++) {
      const d2 = dx * dx + dy * dy * 1.6 + dz * dz, X = p.x + dx, Y = p.y + dy, Z = p.z + dz;
      if (!world.inb(X, Y, Z) || Y < 1) continue;
      const m = world.get(X, Y, Z);
      if (d2 <= R * R) world.set(X, Y, Z, dy < -R * 0.45 && d2 > R * R * 0.4 && Math.random() < 0.5 ? LAVA : AIR, 8);
      else if (d2 <= (R + 1.2) ** 2) { if (OPAQUE[m] && m !== WOOD) world.set(X, Y, Z, Math.random() < 0.6 ? BASALT : m); else if (!world.ignite(X, Y, Z) && m === AIR && Math.random() < 0.15) world.set(X, Y, Z, FIRE, 5); }
    }
    // shove the water outward: a ring wave
    for (let dz = -Ri - 3; dz <= Ri + 3; dz++) for (let dx = -Ri - 3; dx <= Ri + 3; dx++) {
      const r = Math.hypot(dx, dz), X = p.x + dx, Z = p.z + dz;
      if (r <= R) { const got = world.takeWater(X, Z, 99); if (got > 0) { const a = Math.atan2(dz, dx); world.addWater(Math.round(p.x + Math.cos(a) * (R + 2)), Math.round(p.z + Math.sin(a) * (R + 2)), got); } }
    }
    critters.blast(to.x, to.y, to.z, R + 2.5, 0xffb060);
    fx.burst(to.x, to.y, to.z, 60, 0xffa040, 9); fx.burst(to.x, to.y, to.z, 40, 0x6a5a4a, 6);
    state.shake = 1; state.flash = 0.35; sound.boom(0.9, 2.2, 110);
    return true;
  });
}

function quake(p, size) {
  chronicle('The ground shook');
  const R = 4 + size * 1.5, ph = Math.random() * 6.28, ang = Math.random() * 3.14;
  for (let dz = -Math.ceil(R); dz <= R; dz++) for (let dx = -Math.ceil(R); dx <= R; dx++) {
    const r = Math.hypot(dx, dz); if (r > R) continue;
    const x = p.x + dx, z = p.z + dz; if (x < 0 || z < 0 || x >= W || z >= D) continue;
    const s = Math.sin((dx * Math.cos(ang) + dz * Math.sin(ang)) * 0.7 + ph) * (1 - r / R) + (Math.random() - 0.5) * 0.5;
    if (Math.abs(s) < 0.42) continue;
    const mat = world.mat, aux = world.aux, WDn = W * D, c = x + z * W;
    if (s > 0) { for (let y = H - 1; y > 0; y--) { mat[c + y * WDn] = mat[c + (y - 1) * WDn]; aux[c + y * WDn] = aux[c + (y - 1) * WDn]; } mat[c] = STONE; }
    else { for (let y = 1; y < H - 1; y++) { mat[c + y * WDn] = mat[c + (y + 1) * WDn]; aux[c + y * WDn] = aux[c + (y + 1) * WDn]; } }
    world.markDirty(x, z);
  }
  state.shake = Math.max(state.shake, 0.8); sound.boom(0.7, 1.8, 70);
}

function tornado(p) {
  chronicle('A tornado touched down');
  let x = p.x + 0.5, z = p.z + 0.5, life = 11, ang = Math.random() * 6.28, t = 0;
  sound.boom(0.35, 3, 240);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(5, 0.6, 18, 20, 6, true), new THREE.MeshBasicMaterial({ color: 0xb9bcc6, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  { const pa = funnel.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const yy = pa.getY(i); pa.setX(i, pa.getX(i) + Math.sin(yy * 0.5) * 0.9); pa.setZ(i, pa.getZ(i) + Math.cos(yy * 0.4) * 0.9); } }
  funnel.renderOrder = 5; grid.add(funnel); live.add(funnel);
  transients.push((dt) => {
    life -= dt; t += dt; ang += (Math.random() - 0.5) * dt * 3;
    x = Math.max(4, Math.min(W - 4, x + Math.cos(ang) * 5 * dt)); z = Math.max(4, Math.min(D - 4, z + Math.sin(ang) * 5 * dt));
    const gy = world.groundY(x, z);
    funnel.position.set(x, gy + 9, z); funnel.rotation.y = t * 7; funnel.material.opacity = 0.32 * Math.min(1, life, t * 2);
    if (life <= 0) { grid.remove(funnel); live.delete(funnel); funnel.geometry.dispose(); }
    for (let k = 0; k < 14; k++) { // the funnel
      const h = Math.random() * 16, r = 0.8 + h * 0.28, a = t * 9 + h * 0.9 + k;
      fx.emit(x + Math.cos(a) * r, gy + h, z + Math.sin(a) * r, -Math.sin(a) * 7, 1.5, Math.cos(a) * 7, k % 3 ? 0xc9c9d2 : 0x8f8f9a, 0.35, 0);
    }
    if (!state.paused) for (let k = 0; k < 3; k++) { // rip up the ground and throw it
      const cx = Math.floor(x + (Math.random() - 0.5) * 5), cz = Math.floor(z + (Math.random() - 0.5) * 5);
      if (cx < 1 || cz < 1 || cx >= W - 1 || cz >= D - 1) continue;
      const top = world.groundY(cx, cz) - 1, m = world.get(cx, top, cz);
      if (top > 1 && m !== AIR && m !== STONE && m !== BASALT && m !== LAVA) {
        world.set(cx, top, cz, AIR);
        const tx = cx + ri(13) - 6, tz = cz + ri(13) - 6, ty = Math.min(H - 2, top + 5 + ri(6));
        if (OPAQUE[m] && world.inb(tx, ty, tz) && world.get(tx, ty, tz) === AIR) world.set(tx, ty, tz, m === TURF ? SOIL : m === WOOD ? SAND : m);
      }
      const got = world.takeWater(cx, cz, 0.4); if (got > 0) world.addWater(Math.max(0, Math.min(W - 1, cx + ri(11) - 5)), Math.max(0, Math.min(D - 1, cz + ri(11) - 5)), got);
    }
    for (const c of critters.list) if (!c.dead && Math.hypot(c.x - x, c.z - z) < 3.2 && c !== critters.possessed) { c.vy = 9; c.y += 0.3; c.x = Math.max(1, Math.min(W - 1, c.x + (Math.random() - 0.5) * 3)); c.z = Math.max(1, Math.min(D - 1, c.z + (Math.random() - 0.5) * 3)); c.ground = false; }
    state.shake = Math.max(state.shake, 0.12); pourLevel = 1; sound.pour(1, 300);
    return life <= 0;
  });
}
function surge(p) {
  // a ridge of water across the world through the point, along whichever axis the camera faces
  const alongX = Math.abs(Math.sin(cam.yaw)) > Math.abs(Math.cos(cam.yaw));
  const n = alongX ? D : W;
  for (let k = 0; k < n; k++) for (let o = -1; o <= 1; o++) { const x = alongX ? p.x + o : k, z = alongX ? k : p.z + o; world.addWater(x, z, 2.2 - Math.abs(o) * 0.6); }
  state.shake = Math.max(state.shake, 0.4); sound.boom(0.5, 2.4, 300);
}

function useTool(first) {
  const tool = toolById[state.tool], type = tool.type;
  if (type === 'look') return;
  if (type === 'possess') {
    if (!first) return;
    const r = gridRay(), c = critters.pick(r.o, r.d);
    if (c) possess(c); else toast('Click a creature to ride along');
    return;
  }
  const hit = pick(); if (!hit) return;
  toolTick++;
  const R = state.size * 0.75, Ri = Math.ceil(R), p = hit.p, at = hit.c || p;
  const each = (cx, cy, cz, fn) => {
    for (let dy = -Ri; dy <= Ri; dy++) for (let dz = -Ri; dz <= Ri; dz++) for (let dx = -Ri; dx <= Ri; dx++) {
      if (dx * dx + dy * dy + dz * dz > R * R) continue;
      const x = cx + dx, y = cy + dy, z = cz + dz;
      if (world.inb(x, y, z)) fn(x, y, z, world.get(x, y, z));
    }
  };
  const cols = (cx, cz, fn, rr = R) => {
    const q = Math.ceil(rr);
    for (let dz = -q; dz <= q; dz++) for (let dx = -q; dx <= q; dx++) {
      const r = Math.hypot(dx, dz); if (r > rr) continue;
      const x = cx + dx, z = cz + dz; if (x >= 0 && z >= 0 && x < W && z < D) fn(x, z, r / Math.max(rr, 0.01));
    }
  };
  const liftY = () => { let y = p.y; for (let k = 0; k < 6 && y < H - 1 && world.get(p.x, y + 1, p.z) === AIR; k++) y++; return y; };

  switch (type) {
    case 'pour': {
      const y = liftY(); const any = first && tool.mat === SEED;
      each(p.x, y, p.z, (x, yy, z, m) => {
        if (m !== AIR) return;
        if (rnd() < tool.p || (any && x === p.x && z === p.z && yy === y)) world.set(x, yy, z, tool.mat, tool.a || 0);
      });
      pourLevel = 1; sound.pour(1, tool.hz); break;
    }
    case 'water': {
      const y = liftY();
      cols(p.x, p.z, (x, z) => {
        world.addWaterF(x + rnd(), z + rnd(), 0.07);
        if (rnd() < 0.5) fx.emit(x + rnd(), y + 0.5, z + rnd(), 0, -4, 0, 0x9fdcf2, 0.5, 1.2);
      });
      pourLevel = 1; sound.pour(1, 2400); break;
    }
    case 'cloud': {
      cols(p.x, p.z, (x, z) => {
        if (rnd() < 0.5) world.addWaterF(x + rnd(), z + rnd(), 0.06);
        if (rnd() < 0.25) fx.emit(x + rnd(), Math.min(H + 4, p.y + 16), z + rnd(), 0, -16, 0, 0xbfe6f7, 0.9, 0.6);
      }, R + 3);
      pourLevel = 1; sound.pour(1, 3200); break;
    }
    case 'build':
      each(p.x, p.y, p.z, (x, y, z, m) => { if (!OPAQUE[m]) world.set(x, y, z, tool.mat); });
      if (first) sound.blip(180, 0.08, 'triangle', 0.1); break;
    case 'dig': {
      let n = 0;
      if (hit.c && hit.m > 0) each(hit.c.x, hit.c.y, hit.c.z, (x, y, z, m) => {
        if (m === AIR) return;
        world.set(x, y, z, AIR);
        if (n++ % 5 === 0 && MATERIAL_COLORS[m]) fx.burst(x + 0.5, y + 0.5, z + 0.5, 1, MATERIAL_COLORS[m], 2.2);
      });
      cols(at.x, at.z, (x, z) => { const c = x + z * W; if (world.cd[c] > 0.02 && Math.abs(world.cs[c] - at.y) < R + 1.5) { n += world.takeWater(x, z, 0.5) > 0 ? 1 : 0; } });
      if (n) { pourLevel = 0.6; sound.pour(0.6, 900); } break;
    }
    case 'raise': if (toolTick % 4 === 0) cols(at.x, at.z, (x, z, f) => { if (rnd() > f * 0.8) raiseCol(x, z); }); break;
    case 'lower': if (toolTick % 4 === 0) cols(at.x, at.z, (x, z, f) => { if (rnd() > f * 0.8) lowerCol(x, z); }); break;
    case 'smooth': if (toolTick % 3 === 0) {
      let sum = 0, cnt = 0; cols(at.x, at.z, (x, z) => { sum += world.bed[x + z * W]; cnt++; });
      const avg = sum / Math.max(1, cnt);
      cols(at.x, at.z, (x, z) => { const b = world.bed[x + z * W]; if (b > avg + 0.6) lowerCol(x, z); else if (b < avg - 0.6) raiseCol(x, z); });
    } break;
    case 'biome': cols(at.x, at.z, (x, z) => world.setBiome(x, z, state.biome), R + 1); break;
    case 'fire': {
      let lit = 0;
      each(at.x, at.y, at.z, (x, y, z) => { if (world.ignite(x, y, z)) lit++; });
      each(p.x, p.y, p.z, (x, y, z, m) => { if (m === AIR && rnd() < 0.25 && !world.wet(x, y, z)) world.set(x, y, z, FIRE, 3); });
      if (first || lit) sound.sizzle(); break;
    }
    case 'bolt': if (first || toolTick % 8 === 0) strike(at); break;
    case 'meteor': if (first) meteor(at, state.size); break;
    case 'quake': if (first || toolTick % 12 === 0) quake(at, state.size); break;
    case 'tornado': if (first) tornado(at); break;
    case 'surge': if (first) surge(at); break;
    case 'dry':
      cols(at.x, at.z, (x, z) => {
        const got = world.takeWater(x, z, 0.12); if (got <= 0) return;
        if (rnd() < got * 6) { const y = Math.min(H - 1, Math.ceil(world.cs[x + z * W]) + 1); if (world.get(x, y, z) === AIR) world.set(x, y, z, STEAM, 8); }
      }, R + 1);
      pourLevel = 0.5; sound.pour(0.5, 5000); break;
    case 'freeze': cols(at.x, at.z, (x, z) => world.freeze(x, z), R + 1); if (first) sound.blip(1500, 0.3, 'sine', 0.08); break;
    case 'thaw': each(at.x, at.y, at.z, (x, y, z, m) => { if (m === ICE) world.melt(x, y, z); }); break;
    case 'bloom':
      cols(at.x, at.z, (x, z) => {
        const { y, m } = topOf(x, z), up = world.get(x, y + 1, z); if (world.wet(x, y + 1, z)) return;
        if (m === SOIL && up === AIR) world.set(x, y, z, TURF);
        else if (m === TURF && up === AIR && rnd() < 0.06) world.set(x, y + 1, z, rnd() < 0.04 ? SEED : TUFT, ri(256));
        else if (up === SEED && (m === TURF || m === SOIL)) world.set(x, y + 1, z, WOOD, 3 + ri(4));
        if (rnd() < 0.02) fx.emit(x + 0.5, y + 1.5, z + 0.5, 0, 1.5, 0, 0xffb0d8, 0.8, -0.05);
      }, R + 1);
      world.randomTicks(1200);
      if (first) sound.blip(990, 0.3, 'triangle', 0.08); break;
    case 'settlers': {
      if (!first) break;
      const gy = world.groundY(at.x, at.z), top = world.get(at.x, gy - 1, at.z);
      if (world.wet(at.x, gy, at.z) || !(top === 3 || top === 2 || top === 4 || top === 26)) { toast('Settlers need dry ground to stand on'); break; }
      const vid = critters.found(at.x, at.z);
      for (let k = 0; k < 4; k++) { const x = at.x + 0.5 + (rnd() - 0.5) * 3, z = at.z + 0.5 + (rnd() - 0.5) * 3, c = critters.spawn('villager', x, world.groundY(x, z) + 0.2, z); if (c) { c.hx = at.x; c.hz = at.z; c.vid = vid; c.meal = 2; } }
      for (let k = 0; k < 2; k++) { const x = at.x + 0.5 + (rnd() - 0.5) * 6, z = at.z + 0.5 + (rnd() - 0.5) * 6, s = critters.spawn('sheep', x, world.groundY(x, z) + 0.2, z); if (s) { s.hx = at.x; s.hz = at.z; } }
      for (let k = 0; k < 12; k++) { const a = rnd() * 6.283, r = 3 + rnd() * 3, hx = Math.round(at.x + Math.cos(a) * r), hz = Math.round(at.z + Math.sin(a) * r); if (world.hut(hx, world.groundY(hx, hz), hz)) break; }
      fx.burst(at.x + 0.5, gy + 1, at.z + 0.5, 20, 0xfff2c8, 3); sound.blip(440, 0.3, 'triangle', 0.08);
      break;
    }
    case 'gift': {
      if (!first && toolTick % 10) break;
      let fed = 0;
      for (const c of critters.list) if (c.kind === 'villager' && !c.dead && Math.hypot(c.x - at.x, c.z - at.z) < R + 5) { c.meal = (c.meal || 0) + 3; c.food = (c.food || 0) + 3; fed++; fx.burst(c.x, c.y + 1.2, c.z, 5, 0xf2d27a, 1.5); }
      cols(at.x, at.z, (x, z) => { const y = world.groundY(x, z); if (world.get(x, y - 1, z) === 20) world.set(x, y - 1, z, 20, 3); else if (world.get(x, y, z) === 20) world.set(x, y, z, 20, 3); }, R + 4);
      if (first) { sound.blip(660, 0.35, 'triangle', 0.07); if (fed) chronicle(`${fed} villager${fed > 1 ? 's were' : ' was'} given a harvest gift`); }
      break;
    }
    case 'shower': {
      if (!first) break;
      chronicle('A meteor shower fell');
      for (let k = 0; k < 7; k++) {
        let wait = 0.25 + k * 0.35 + rnd() * 0.3;
        const x = Math.max(2, Math.min(W - 3, Math.round(at.x + (rnd() - 0.5) * 22))), z = Math.max(2, Math.min(D - 3, Math.round(at.z + (rnd() - 0.5) * 22)));
        transients.push((dt) => { wait -= dt; if (wait > 0) return false; meteor({ x, y: world.groundY(x, z), z }, 1, true); return true; });
      }
      break;
    }
    case 'hut':
      if (!first) break;
      if (world.hut(at.x, world.groundY(at.x, at.z), at.z)) {
        const c = critters.spawn('villager', at.x + 0.5, world.groundY(at.x, at.z + 2) + 0.2, at.z + 2.5); if (c) { c.hx = at.x; c.hz = at.z; c.vid = critters.villageAt(at.x, at.z); }
        sound.blip(330, 0.2, 'triangle');
      } else toast('A hut needs a flat, dry 3×3 patch');
      break;
    case 'critter': {
      if (!first && critterCd > 0) return;
      critterCd = 0.22;
      const k = tool.id; let y = p.y + 0.1;
      if ((k === 'minnow' || k === 'koi') && hit.m === -1) y = Math.max(world.bed[at.x + at.z * W] + 0.3, world.cs[at.x + at.z * W] - 1);
      if (k === 'glimmer' || k === 'butterfly' || k === 'songbird' || k === 'bee' || k === 'owl') y += 2;
      const c = critters.spawn(k, p.x + 0.5, y, p.z + 0.5);
      if (c) { sound.blip(500 + KIND_IDS.indexOf(k) * 110, 0.14); fx.burst(c.x, c.y, c.z, 6, 0xffffff, 1.5); }
      else if (first) toast(`The world is full of ${KINDS[k].name === 'butterfly' ? 'butterflies' : KINDS[k].name + 's'}`);
    }
  }
}

let camSaved = null;
function possess(c) {
  critters.possessed = c;
  camSaved = { dist: camGoal.dist, tx: camGoal.tx, ty: camGoal.ty, tz: camGoal.tz, pitch: camGoal.pitch };
  camGoal.dist = c.kind === 'minnow' || c.kind === 'koi' ? 7 : 12; camGoal.pitch = c.kind === 'minnow' || c.kind === 'koi' ? 0.12 : 0.35;
  document.body.classList.add('riding'); $('ride').classList.add('on');
  $('rideName').textContent = `You are a ${KINDS[c.kind].name}`;
  $('rideHint').textContent = document.body.classList.contains('touch') ? 'Stick to move · drag to look' : KINDS[c.kind].hint + ' · V view · Esc to let go';
  sound.blip(700, 0.25); cursor.visible = false; setFP(false);
}
function setFP(v) {
  state.fp = v && !!critters.possessed; $('bView').textContent = state.fp ? 'Third person' : 'First person';
  for (const c of critters.list) c.mesh.visible = true;
  if (state.fp) { critters.possessed.mesh.visible = false; camGoal.pitch = 0.05; }
  camera.near = critters.possessed ? 0.12 : 1; camera.updateProjectionMatrix();
}
function release() {
  if (!document.body.classList.contains('riding')) return;
  setFP(false); critters.possessed = null; camera.near = 1; camera.updateProjectionMatrix();
  document.body.classList.remove('riding'); $('ride').classList.remove('on');
  if (camSaved) Object.assign(camGoal, camSaved);
}
critters.onEvent = (t, c) => {
  if (t === 'lost') { release(); toast('Your creature is gone'); }
  else if (t === 'chirp') { sound.blip(1700 + Math.random() * 700, 0.09, 'sine', 0.04); setTimeout(() => sound.blip(2100 + Math.random() * 500, 0.07, 'sine', 0.035), 110); }
  else if (t === 'chop') sound.blip(140, 0.07, 'square', 0.05);
  else if (t === 'build') { sound.blip(392, 0.25, 'triangle', 0.07); if (booted) chronicle(`${c.name || 'A villager'} built a hut in ${vname(c)}`); }
  else if (t === 'fish') sound.blip(820, 0.1, 'sine', 0.05);
  else if (t === 'founded' && booted) { toast(`A new village: ${c.name}`); chronicle(`${c.name} was founded`); }
  else if (t === 'born' && booted) chronicle(`${c.name} was born in ${vname(c)}`);
  else if (t === 'died' && booted) chronicle(`${c.name || 'A villager'} of ${vname(c)} was lost`);
  else if (t === 'hunt' && booted && Math.random() < 0.35) chronicle(`A fox caught a${/^[aeiou]/.test(c.kind) ? 'n' : ''} ${c.kind}`);
  else if (t === 'howl') { sound.blip(300, 1.2, 'sine', 0.035); setTimeout(() => sound.blip(390, 1.0, 'sine', 0.03), 500); if (booted && Math.random() < 0.15) chronicle('Wolves howled in the night'); }
  else if (t === 'dam') { sound.blip(180, 0.06, 'square', 0.04); if (booted && Math.random() < 0.08) chronicle('Beavers worked on their dam'); }
  else if (t === 'plop') sound.blip(520 + Math.random() * 200, 0.08, 'sine', 0.035);
  else if (t === 'hoot') { sound.blip(330, 0.3, 'sine', 0.05); setTimeout(() => sound.blip(290, 0.45, 'sine', 0.05), 380); }
  else if (t === 'croak') { sound.blip(150 + Math.random() * 50, 0.12, 'square', 0.03); setTimeout(() => sound.blip(170, 0.1, 'square', 0.025), 160); }
};

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
    if (looking) drag = 'orbit'; else { history.push(); state.painting = true; useTool(true); }
    return;
  }
  if (e.button === 2 || (e.button === 0 && (e.altKey || e.ctrlKey || e.metaKey))) drag = 'orbit';   // Option/Ctrl/Cmd-drag works on a trackpad
  else if (e.button === 1 || (e.button === 0 && e.shiftKey)) drag = 'pan';
  else if (e.button === 0) { if (looking) drag = 'orbit'; else { history.push(); state.painting = true; useTool(true); } }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  const dx = prev ? e.clientX - prev.x : 0, dy = prev ? e.clientY - prev.y : 0;
  if (prev) { prev.x = e.clientX; prev.y = e.clientY; }
  state.pointerIn = e.pointerType !== 'touch' || state.painting;
  if (drag === 'gesture' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch > 0) camGoal.dist = clampDist(camGoal.dist * pinch / Math.max(20, dist));
    pinch = dist; orbit(dx * 0.5, dy * 0.5);
    return;
  }
  state.mx = e.clientX; state.my = e.clientY;
  if (drag === 'orbit') orbit(dx, dy);
  else if (drag === 'pan') pan(dx, dy);
});
// a click that did not turn into a drag, made with the Look tool, picks a creature to inspect
let downAt = null, selected = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
function inspect(c) {
  selected = c && !c.dead ? c : null;
  $('card').classList.toggle('on', !!selected);
  if (selected) syncCard();
}
function syncCard() {
  if (!selected || selected.dead) { inspect(null); return; }
  const k = selected.kind, an = /^[aeiou]/.test(k) ? 'An ' : 'A ';
  const vil = selected.kind === 'villager' && critters.villages[selected.vid];
  $('cardName').textContent = selected.name ? `${selected.name} of ${vil ? vil.name : 'nowhere yet'}` : an + k;
  $('cardWhat').textContent = describe(selected, world, night);
}
$('cardRide').onclick = () => { if (selected && !selected.dead) { const c = selected; inspect(null); possess(c); } };
$('cardClose').onclick = () => inspect(null);

const endPointer = (e) => {
  if (downAt && state.tool === 'look' && !critters.possessed && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && performance.now() - downAt.t < 500) {
    state.mx = e.clientX; state.my = e.clientY;
    const r = gridRay(); inspect(critters.pick(r.o, r.d));
  }
  downAt = null;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) { drag = null; state.painting = false; }
  else if (drag === 'gesture' && pointers.size < 2) drag = null;
  if (e.pointerType === 'touch') state.pointerIn = false;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pointers.size) state.pointerIn = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  // trackpads: pinch (reported with ctrlKey) or a vertical swipe zooms, a sideways swipe turns the view
  if (e.ctrlKey) camGoal.dist = clampDist(camGoal.dist * Math.exp(e.deltaY * 0.01));
  else {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) camGoal.yaw -= e.deltaX * 0.004;
    else camGoal.dist = clampDist(camGoal.dist * Math.exp(e.deltaY * 0.0012));
  }
}, { passive: false });

const clampDist = (d) => Math.max(critters.possessed ? 3 : 24, Math.min(300 * SF, d));
function orbit(dx, dy) {
  const s = state.fp ? -1 : 1;
  camGoal.yaw -= dx * 0.006; camGoal.pitch = Math.max(critters.possessed ? -1.2 : 0.06, Math.min(1.5, camGoal.pitch + dy * 0.006 * s));
}
function pan(dx, dy) {
  if (critters.possessed) return;
  const k = camGoal.dist * 0.0013, cy = Math.cos(camGoal.yaw), sy = Math.sin(camGoal.yaw);
  camGoal.tx = Math.max(-W * 0.6, Math.min(W * 0.6, camGoal.tx - dx * k * cy - dy * k * sy * 0.8));
  camGoal.tz = Math.max(-D * 0.6, Math.min(D * 0.6, camGoal.tz + dx * k * sy - dy * k * cy * 0.8));
}

addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'z' && e.target.tagName !== 'INPUT') { e.preventDefault(); if (e.shiftKey) history.redo(); else history.undo(); return; }
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'y' && e.target.tagName !== 'INPUT') { e.preventDefault(); history.redo(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.add(k);
  if (e.repeat) return;
  if (k === 'Escape') { if ($('help').classList.contains('open')) showHelp(false); else release(); return; }
  if (critters.possessed) { if (k === ' ' || k.startsWith('Arrow')) e.preventDefault(); if (k === 'e') release(); if (k === 'v') setFP(!state.fp); return; }
  if (k >= '1' && k <= '9') { const ids = TOOLS.filter((t) => t.tab === state.tab).map((t) => t.id); if (ids[+k - 1]) setTool(ids[+k - 1]); }
  else if (k === '0') setTool('look');
  else if (k === '[') setSize(state.size - 1);
  else if (k === ']') setSize(state.size + 1);
  else if (k === 'p' || k === ' ') { e.preventDefault(); setPaused(!state.paused); }
  else if (k === 'r') setRain(!world.raining);
  else if (k === 'u') { document.body.classList.toggle('hideui'); if (document.body.classList.contains('hideui')) toast('Photo mode: press U to bring the controls back'); }
  else if (k === 'h' || k === '?') showHelp(!$('help').classList.contains('open'));
});
addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
addEventListener('blur', () => keys.clear());

{ // touch stick for riding
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

// keyboard camera when not riding: WASD / arrows pan, Q E turn, Z X zoom, T G tilt
function keyCamera(dt) {
  if (critters.possessed || !keys.size) return;
  const has = (...k) => k.some((q) => keys.has(q));
  const f = (has('w', 'ArrowUp') ? 1 : 0) - (has('s', 'ArrowDown') ? 1 : 0), s = (has('d', 'ArrowRight') ? 1 : 0) - (has('a', 'ArrowLeft') ? 1 : 0);
  if (f || s) {
    const k = camGoal.dist * 0.6 * dt, sy = Math.sin(camGoal.yaw), cy = Math.cos(camGoal.yaw);
    camGoal.tx = Math.max(-W * 0.6, Math.min(W * 0.6, camGoal.tx + (-sy * f + cy * s) * k));
    camGoal.tz = Math.max(-D * 0.6, Math.min(D * 0.6, camGoal.tz + (-cy * f - sy * s) * k));
  }
  if (has('q')) camGoal.yaw += dt * 1.6; if (has('e')) camGoal.yaw -= dt * 1.6;
  if (has('z')) camGoal.dist = clampDist(camGoal.dist * (1 - dt * 1.4)); if (has('x')) camGoal.dist = clampDist(camGoal.dist * (1 + dt * 1.4));
  if (has('t')) camGoal.pitch = Math.min(1.5, camGoal.pitch + dt); if (has('g')) camGoal.pitch = Math.max(0.06, camGoal.pitch - dt);
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
  day: [new THREE.Color(0x7fbdec), new THREE.Color(0xcfe6f4)],
  dusk: [new THREE.Color(0x565a9c), new THREE.Color(0xf7b78c)],
  night: [new THREE.Color(0x0c1130), new THREE.Color(0x27315c)],
};
const cTop = U.uSkyTop.value, cBot = U.uSkyBot.value, cTmp = new THREE.Color(), cWhite = new THREE.Color(0xffffff);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let night = 0, overcast = 0;
function updateSky() {
  const ang = (state.tod - 0.25) * Math.PI * 2, sy = Math.sin(ang), cx = Math.cos(ang);
  const day = smooth(-0.12, 0.3, sy), dusk = Math.max(0, 1 - Math.abs(sy) / 0.32) * 0.85;
  night = 1 - day;
  overcast += ((world.raining ? (state.storm ? 1 : 0.6) : world.snowing ? 0.7 : 0) - overcast) * 0.02;
  cTop.copy(SKY.night[0]).lerp(SKY.day[0], day).lerp(SKY.dusk[0], dusk).lerp(cTmp.set(0x55606e).multiplyScalar(0.25 + 0.75 * day), overcast * 0.85);
  cBot.copy(SKY.night[1]).lerp(SKY.day[1], day).lerp(SKY.dusk[1], dusk).lerp(cTmp.set(0x9aa4ae).multiplyScalar(0.25 + 0.75 * day), overcast * 0.85);
  const su = sky.material.uniforms;
  su.uSunDir.value.set(cx * 70, 25 + sy * 95, 45).normalize();
  su.uSunCol.value.set(0xffb070).lerp(cTmp.set(0xfff4e0), smooth(0.05, 0.5, sy));
  if (sy > -0.02) {
    sun.position.set(cx * 70, 25 + sy * 95, 45).multiplyScalar(SF);
    sun.intensity = 2.9 * smooth(-0.02, 0.28, sy) * (1 - overcast * 0.6);
    sun.color.set(0xffc38a).lerp(cTmp.set(0xfff6e6), smooth(0.05, 0.5, sy));
  } else {
    sun.position.set(-40, 100, -30).multiplyScalar(SF);
    sun.intensity = 1.1 * smooth(-0.02, -0.25, sy);
    sun.color.set(0xa9bdff);
  }
  hemi.intensity = 0.95 + 0.15 * day + dusk * 0.15;
  hemi.color.set(0x7f93d8).lerp(cTmp.copy(cTop).lerp(cWhite, 0.45), day);
  hemi.groundColor.set(0x4a5078).lerp(cTmp.set(0x9a8468), day);
  { const y = state.seasons ? state.year : 0.3, bump = (a, b) => smooth(a, a + 0.07, y) * (1 - smooth(b - 0.07, b, y));
    U.uAutumn.value = bump(0.5, 0.8); U.uWinter.value = Math.max(bump(0.74, 1.0), y < 0.04 ? 1 - y / 0.04 : 0); }
  U.uNight.value = night; U.uCaustic.value = (0.25 + 0.75 * day) * (1 - overcast * 0.7);
  U.uCloud.value = day * (0.55 + overcast * 0.45); U.uRain.value += ((world.raining ? 1 : 0) - U.uRain.value) * 0.03;
  U.uSky.value.copy(cTop).lerp(cBot, 0.5).multiplyScalar(0.25 + 0.75 * day);
  U.uSunDir.value.copy(sun.position).normalize();
  U.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(1.2, sun.intensity / 2.4));
  U.uAmb.value = 0.3 + 0.7 * day;
  setNightGlow(night);
}

// ---------------------------------------------------------------- loop
function handleEvents() {
  for (const e of world.events) {
    const x = e.x + 0.5, y = e.y + 0.5, z = e.z + 0.5;
    if (e.t === 'sizzle') { sound.sizzle(); for (let k = 0; k < 3; k++) fx.emit(x, y + 0.5, z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5, 0xffffff, 0.7, -0.05); }
    else if (e.t === 'ember') fx.emit(x, y + 0.4, z, (Math.random() - 0.5), 2 + Math.random() * 2.5, (Math.random() - 0.5), Math.random() < 0.5 ? 0xffd24a : 0xff7a1a, 0.6 + Math.random() * 0.5, -0.02);
    else if (e.t === 'drop') fx.emit(x, y, z, 0, -6, 0, 0xbfe6f7, 1.2, 1);
    else {
      const col = e.t === 'spill' ? 0x7fd0ea : e.t === 'drip' ? 0xff8a2a : 0xe2cf9a;
      fx.emit(x, y, z, (Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6, col, 1.3, 1);
    }
  }
  world.events.length = 0;
}

let glowT = 0, glowGoal = 0;
const glowPos = new THREE.Vector3(0, 12, 0);
function trackGlow() {
  const mat = world.mat; let n = 0, sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < mat.length; i += 3) {
    const m = mat[i]; if (m !== LAVA && m !== FIRE && m !== 24) continue;
    n++; sx += i % W; sz += ((i / W) | 0) % D; sy += (i / (W * D)) | 0;
  }
  glowGoal = Math.min(1, n / 40);
  if (n) glowPos.set(sx / n - W / 2, sy / n + 5, sz / n - D / 2);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (post) { post.composer.setPixelRatio(renderer.getPixelRatio()); post.composer.setSize(innerWidth, innerHeight); post.grade.uniforms.uAspect.value = innerWidth / innerHeight; }
  motes.material.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * 0.9;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.9 ? 48 : 34;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const sunDir = new THREE.Vector3(), fwd = new THREE.Vector3(), sunNdc = new THREE.Vector3();
let last = performance.now(), acc = 0, toolAcc = 0, saveT = 0, statT = 0, frames = 0;
const TICK = 1 / 30;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last, dt = Math.min(0.05, raw / 1000); last = now; frames++;
  perf.frame(raw);

  if (!state.paused) {
    acc += dt * state.speed;
    let n = 0;
    while (acc >= TICK && n++ < (state.speed > 4 ? 8 : 4)) { world.step(); acc -= TICK; handleEvents(); }
    if (acc > TICK) acc = 0;
    if (state.timeMode === 'auto') { const before = state.tod; state.tod = (state.tod + dt * state.speed / 300) % 1; if (state.tod < before) state.day++; }
    if (state.seasons) { // a year is six day-lengths: spring, summer, autumn, winter
      const season0 = Math.floor(state.year * 4);
      state.year = (state.year + dt * state.speed / 1800) % 1;
      if (Math.floor(state.year * 4) !== season0) { if (season0 === 3) state.yearN++; chronicle(`${SEASONS[Math.floor(state.year * 4)]} came`); }
      state.weatherT -= dt * state.speed;
      if (state.weatherT <= 0) {
        const season = Math.floor(state.year * 4), r = Math.random(), on = world.raining || world.snowing;
        if (on) { setRain(false); state.weatherT = 70 + Math.random() * 110; }
        else {
          if (season === 3) { if (r < 0.65) setRain(false, false, true); }
          else if (season === 1) { if (r < 0.15) setRain(true, true); else if (r < 0.3) setRain(true); }
          else if (r < 0.4) setRain(true);
          state.weatherT = (world.raining || world.snowing) ? 35 + Math.random() * 45 : 60 + Math.random() * 60;
        }
      }
    }
    if (state.storm && Math.random() < dt * 0.22) { const x = 2 + ri(W - 4), z = 2 + ri(D - 4); strike({ x, y: Math.max(world.groundY(x, z), Math.ceil(world.cs[x + z * W])), z }); }
    if (world.snowing) for (let k = 0; k < Math.ceil(2 * SF * SF); k++) fx.emit(Math.random() * W, H + 2, Math.random() * D, (Math.random() - 0.5) * 1.5, -3.5, (Math.random() - 0.5) * 1.5, 0xffffff, 9, 0.004);
    if (world.raining) for (let k = 0; k < Math.ceil(3 * SF * SF); k++) fx.emit(Math.random() * W, H + 2, Math.random() * D, 0, -22, 0, 0xbfe6f7, 1.3, 0.5);
  }
  if (state.timeMode !== 'auto') {
    const goal = { noon: 0.5, dusk: 0.765, night: 0.02 }[state.timeMode];
    let d = goal - state.tod; d -= Math.round(d);
    state.tod = (state.tod + d * Math.min(1, dt * 2.5) + 1) % 1;
  }

  if (gfx.level > 0) banners.wave(now / 1000);
  // smoke curls from a few roofs
  if (!state.paused && gfx.motes && Math.random() < 0.35) {
    const x = ri(W), z = ri(D), y = world.groundY(x, z) - 1;
    if (world.get(x, y, z) === 19 && world.get(x, y - 1, z) === 16) fx.emit(x + 0.5, y + 0.6, z + 0.5, 0.25 + Math.random() * 0.3, 0.9, (Math.random() - 0.5) * 0.3, 0xd9d6d0, 4, -0.012);
  }
  // petals and leaves drift down in the blossom and autumn biomes
  if (!state.paused && gfx.motes) for (let k = 0; k < 2; k++) {
    const x = ri(W), z = ri(D), pc = BIO[world.biome[x + z * W]].petals;
    if (!pc) continue;
    const y = world.groundY(x, z) - 1;
    if (world.get(x, y, z) !== 9) continue;
    fx.emit(x + Math.random(), y - 0.2, z + Math.random(), 0.5 + Math.random() * 0.6, -0.3, (Math.random() - 0.5) * 0.8, Math.random() < 0.5 ? pc : BIO[world.biome[x + z * W]].leaf[0], 4.5, 0.045);
  }

  toolAcc += dt; critterCd -= dt;
  if (toolAcc >= TICK) { toolAcc %= TICK; if (state.painting && !critters.possessed) useTool(false); }
  pourLevel = Math.max(0, pourLevel - dt * 6);
  if (pourLevel <= 0) sound.pour(0);
  for (let i = transients.length - 1; i >= 0; i--) if (transients[i](dt)) transients.splice(i, 1);

  readInput(); keyCamera(dt);
  if (!state.paused) critters.update(dt * Math.min(3, state.speed), input, night);
  fx.update(dt);
  remesh(gfx.level === 0 ? 3 : 6);
  water.update(world);
  updateSky();
  sound.ambient(night);
  sound.babble(state.paused ? 0 : (world.flow || 0) * 0.5 + (world.raining ? 0.035 : 0));
  glowT -= dt; if (glowT <= 0) { glowT = 0.4; trackGlow(); }
  ember.position.lerp(glowPos, Math.min(1, dt * 3));
  ember.intensity += (glowGoal * (50 + night * 90) * (0.9 + 0.1 * Math.sin(now * 0.011)) - ember.intensity) * Math.min(1, dt * 4);

  // camera
  const ride = critters.possessed;
  if (ride) { camGoal.tx = ride.x - W / 2; camGoal.ty = ride.y + (ride.kind === 'villager' ? 1.0 : 0.5); camGoal.tz = ride.z - D / 2; }
  else camGoal.ty = 10;
  const k = Math.min(1, dt * 9);
  for (const p of ['yaw', 'pitch', 'dist', 'tx', 'ty', 'tz']) cam[p] += (camGoal[p] - cam[p]) * k;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  state.shake = Math.max(0, state.shake - dt * 1.6);
  const shx = (Math.random() - 0.5) * state.shake * 2.5, shy = (Math.random() - 0.5) * state.shake * 2.5;
  if (state.fp && ride) {
    camera.position.set(cam.tx, cam.ty + 0.1, cam.tz);
    camera.lookAt(cam.tx - cp * sy, cam.ty + 0.1 - sp, cam.tz - cp * cy);
    ride.yaw = Math.atan2(-sy, -cy);
  } else {
    camera.position.set(cam.tx + cam.dist * cp * sy + shx, cam.ty + cam.dist * sp + shy, cam.tz + cam.dist * cp * cy);
    camera.lookAt(cam.tx + shx, cam.ty + shy, cam.tz);
  }

  // brush preview
  const tool = toolById[state.tool];
  let show = false;
  if (state.pointerIn && !ride && !drag && tool.type !== 'look' && tool.type !== 'possess') {
    const hit = pick();
    if (hit) {
      const at = (tool.type === 'pour' || tool.type === 'build' || tool.type === 'water' || tool.type === 'critter') ? hit.p : (hit.c || hit.p);
      const r = tool.type === 'critter' || tool.type === 'hut' || tool.type === 'bolt' ? 0.8 : Math.max(0.6, state.size * 0.75);
      cursor.position.set(at.x + 0.5, at.y + 0.5, at.z + 0.5); cursor.scale.setScalar(r);
      cursor.material.color.set(tool.type === 'dig' || tool.type === 'lower' ? 0xff6a5a : tool.tab === 'powers' ? 0xffe98a : 0xffffff);
      show = true;
    }
  }
  if (selected && !ride) { // a ring of light on whoever is being inspected
    if (selected.dead) inspect(null);
    else { cursor.position.set(selected.x, selected.y + 0.4, selected.z); cursor.scale.setScalar(0.75); cursor.material.color.set(0xfff0b0); show = true; }
  }
  cursor.visible = show;

  // atmosphere + post
  U.uTime.value = now / 1000;
  sky.position.copy(camera.position);
  const gx = camera.position.x + W / 2, gz = camera.position.z + D / 2;
  const inWater = gx > 0 && gz > 0 && gx < W && gz < D && world.surfAt(gx, gz) > camera.position.y && world.bedAt(gx, gz) < camera.position.y + 0.3;
  U.uUnder.value += ((inWater ? 1 : 0) - U.uUnder.value) * Math.min(1, dt * 6);
  const un = U.uUnder.value;
  scene.fog.color.copy(cBot).lerp(cTmp.set(0x06313f).multiplyScalar(0.35 + 0.65 * (1 - night)), un);
  scene.fog.density = 0.0008 / SF + un * 0.05;
  state.flash = Math.max(0, state.flash - dt * 2.2);
  if (usePost) {
    sunDir.copy(sun.position).normalize();
    camera.getWorldDirection(fwd);
    const facing = Math.max(0, fwd.dot(sunDir));
    sunNdc.copy(camera.position).addScaledVector(sunDir, 300).project(camera);
    const g = post.grade.uniforms;
    g.uTime.value = U.uTime.value; g.uNight.value = night; g.uUnder.value = un; g.uFlash.value = state.flash;
    g.uSunPos.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
    g.uRays.value = gfx.rays ? (0.3 + facing * 0.9) * (1 - night * 0.7) * (fwd.dot(sunDir) > -0.2 ? 1 : 0) * (1 - un * 0.5) : 0;
    g.uRayCol.value.copy(sun.color);
    g.uTilt.value = gfx.tilt && !ride ? 1 : 0;
    post.bloom.strength = 0.4 + night * 0.35 + un * 0.2;
    post.composer.render();
  } else renderer.render(scene, camera);

  statT += dt;
  if (statT > 0.5) {
    statT = 0; if (selected) syncCard(); banners.sync();
    renderCensus();
    $('fps').textContent = `${Math.round(perf.fps)} frames per second · ${gfx.mode === 'auto' ? 'Auto: ' + LEVEL_NAMES[gfx.level] : gfx.mode === 'custom' ? 'Custom' : LEVEL_NAMES[gfx.level]} · ${Math.round(innerWidth * renderer.getPixelRatio())}×${Math.round(innerHeight * renderer.getPixelRatio())}`;
  }
  saveT += dt;
  if (saveT > 20) { saveT = 0; autosave(); }
}
addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
addEventListener('pagehide', autosave);

// ---------------------------------------------------------------- boot
setTab('earth'); setTool('sand'); setSize(2); setTimeMode('auto');
applyGfx(false);
loadModels().then(() => {   // the Blender-made creature models unpack first, then the world starts
  if (!restore(ls.get(AUTO_KEY))) { newWorld('valley', W, D); showHelp(true); }
  resize();
  remesh(999);
  updateSky();
  banners.sync(true); booted = true;
  requestAnimationFrame(frame);
});

window.__brimful = { THREE, camera, scene, world, critters, state, cam: camGoal, gfx, perf, WM, setTool, setTab, newWorld, pick, possess, release, setLevel, strike, meteor, quake, get frames() { return frames; } };
