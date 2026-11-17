// The living things. Swimmers, walkers, hoppers, floaters, fliers — and villagers who fell trees and build huts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import animalsGlb from './animals.glb?inline';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { W, H, D, AIR, LAVA, STEAM, TUFT, WEED, FIRE, WOOD, LEAF, SEED, TURF, SOIL, THATCH, PLANK, CROP, OPAQUE, rnd, ri } from './world.js';

export const KINDS = {
  minnow: { name: 'minnow', cap: 70, hint: 'WASD swim · Space up · Shift down' },
  duck: { name: 'duck', cap: 30, hint: 'WASD paddle or waddle · Space hop' },
  frog: { name: 'frog', cap: 40, hint: 'WASD hop and swim · Space leap' },
  mossback: { name: 'mossback', cap: 45, hint: 'WASD walk · Space hop' },
  rabbit: { name: 'rabbit', cap: 45, hint: 'WASD hop · Space leap' },
  koi: { name: 'koi', cap: 16, hint: 'WASD swim · Space up · Shift down' },
  turtle: { name: 'turtle', cap: 20, hint: 'WASD paddle or plod · Space hop' },
  heron: { name: 'heron', cap: 10, hint: 'WASD wade · Space hop' },
  sheep: { name: 'sheep', cap: 30, hint: 'WASD walk · Space hop' },
  deer: { name: 'deer', cap: 25, hint: 'WASD walk · Space leap' },
  fox: { name: 'fox', cap: 12, hint: 'WASD run · Space leap' },
  crab: { name: 'crab', cap: 25, hint: 'WASD scuttle · Space hop' },
  villager: { name: 'villager', cap: 40, hint: 'WASD walk · Space jump' },
  bee: { name: 'bee', cap: 40, hint: 'WASD fly · Space up · Shift down' },
  butterfly: { name: 'butterfly', cap: 45, hint: 'WASD fly · Space up · Shift down' },
  songbird: { name: 'songbird', cap: 30, hint: 'WASD fly · Space up · Shift down' },
  owl: { name: 'owl', cap: 12, hint: 'WASD fly · Space up · Shift down' },
  glimmer: { name: 'glimmer', cap: 50, hint: 'WASD fly · Space up · Shift down' },
};
export const KIND_IDS = Object.keys(KINDS);

const std = (color, o = {}) => new THREE.MeshLambertMaterial({ color, vertexColors: true, ...o });
const G = {
  body: new THREE.SphereGeometry(0.5, 10, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 6),
  dome: new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  wing: new THREE.PlaneGeometry(1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
};
for (const g of Object.values(G)) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));   // stand-in parts are plain
const M = {
  fish: [std(0xc3ced2), std(0xa9b38a), std(0xd9b878), std(0xc99870)],
  fin: std(0xfff3dc), eye: std(0x1c1c22), white: std(0xfbf7ee), orange: std(0xf29a2e),
  shell: [std(0x7a9a4a), std(0x9a8250), std(0x6a8a6a)], skin: std(0xf2d9a8), bug: std(0x2b2a33),
  frog: [std(0x7a9a44), std(0x8a8a4a), std(0x5f8a52), std(0x9a7a4a)], belly: std(0xe9efc0),
  fur: [std(0xb9a284), std(0x9a9084), std(0xddd5c8), std(0x86705a)],
  duck: [std(0xf2eee4), std(0xa5865e), std(0xb4b2a8), std(0x8a7458)],
  bird: [std(0x8a6a4a), std(0x6a7f96), std(0x9a9a5a), std(0x5a5a62), std(0xb0563a)],
  tunic: [std(0xa8553e), std(0x4f7396), std(0x6a8a52), std(0xc49a4a), std(0x7a5a86), std(0xb9ae98)],
  face: [std(0xeec9a6), std(0xd6a67a), std(0xa8764e), std(0x7c563a)], hair: [std(0x3a2a22), std(0x7a5230), std(0xc9a85a), std(0x1c1c22), std(0x8a8884)],
  wing: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
  bfly: [0xf08a2a, 0x6aa8e8, 0xf2e06a, 0xf2f0e6, 0xd9603a].map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, vertexColors: true })),
  fox: std(0xe08a44), deer: [std(0xcaa274), std(0xb58a5e)], crab: [std(0xc9523a), std(0xd6814e), std(0x9a6a5a)], bee: std(0xf2c230), horn: std(0xe9dcc0),
  glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.8, 1.0) }),
};
export function setNightGlow(n) { for (const m of M.fish) m.emissive.copy(m.color).multiplyScalar(0.55 * n); }

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(240,255,170,1)'); gr.addColorStop(0.3, 'rgba(210,255,120,.45)'); gr.addColorStop(1, 'rgba(180,255,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let glowTex = null;
const pickOf = (a) => a[ri(a.length)];

function part(geo, mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; return m;
}
const eyes = (g, x, y, z, s = 0.08) => g.add(part(G.body, M.eye, s, s, s, x, y, z), part(G.body, M.eye, s, s, s, -x, y, z));

// ---- Blender-made models (tools/make_animals.py -> animals.glb, embedded in the bundle)
const MODELS = {};
export function loadModels() {
  return new Promise((done) => {
    try {
      const bin = atob(animalsGlb.split(',')[1]), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      new GLTFLoader().parse(buf.buffer, '', (g) => { for (const n of [...g.scene.children]) MODELS[n.name] = compact(n); done(true); }, () => done(false));
    } catch { done(false); }
  });
}
// Fold a model's static pieces together so a creature costs a few draw calls instead of a dozen:
// one mesh per tint slot, one vertex-coloured mesh for everything of fixed colour; hinged parts stay separate.
const MOVING = /^(tail|wing|ear|leg|arm)/;
const WHITE_C = new THREE.Color(1, 1, 1);
const fixedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const boatMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
function compact(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = {}, out = new THREE.Group();
  out.name = root.name;
  const bake = (mesh, rel) => {
    const g = mesh.geometry.clone().applyMatrix4(rel);
    // the painted coat from Blender (shading and markings) rides along as vertex colour:
    // fixed-colour parts bake the material colour into it, tinted parts keep it to multiply the individual's tint
    const mn = mesh.material.name, slot = /^(tint|glow|wing)/.test(mn) ? mn : 'fixed';
    const src = g.attributes.color, c = slot === 'fixed' ? mesh.material.color : WHITE_C, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r * (src ? src.getX(i) : 1); col[i * 3 + 1] = c.g * (src ? src.getY(i) : 1); col[i * 3 + 2] = c.b * (src ? src.getZ(i) : 1);
    }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return [slot, g];
  };
  for (const child of [...root.children]) {
    if (MOVING.test(child.name)) {
      // keep the hinge: a pivot group carrying the part's own merged geometry
      const pivot = new THREE.Group(); pivot.name = child.name; pivot.position.copy(child.position);
      child.updateMatrixWorld(true);
      const cinv = new THREE.Matrix4().copy(child.matrixWorld).invert(), parts = {};
      child.traverse((o) => { if (o.isMesh) { const [slot, g] = bake(o, new THREE.Matrix4().multiplyMatrices(cinv, o.matrixWorld)); (parts[slot] ||= []).push(g); } });
      for (const [slot, gs] of Object.entries(parts)) { const m = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], slot === 'fixed' ? fixedMat : new THREE.MeshBasicMaterial({ name: slot })); m.material.name = slot; pivot.add(m); }
      out.add(pivot);
    } else child.traverse((o) => { if (o.isMesh) { const [slot, g] = bake(o, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); (groups[slot] ||= []).push(g); } });
  }
  for (const [slot, gs] of Object.entries(groups)) { const m = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs) : gs[0], slot === 'fixed' ? fixedMat : new THREE.MeshBasicMaterial({ name: slot })); m.material.name = slot; m.name = 'static-' + slot; out.add(m); }
  return out;
}
let critterShadows = true;
export function setCritterShadows(v) { critterShadows = v; }

const TINTS = {
  minnow: [M.fish], duck: [M.duck], frog: [M.frog], mossback: [M.shell], rabbit: [M.fur], deer: [M.deer], fox: [[M.fox]], crab: [M.crab],
  villager: [M.tunic, M.face, M.hair], butterfly: [M.bfly], songbird: [M.bird],
  koi: [[std(0xf7f3ea), std(0xfbe8c8), std(0xf2ead8)]], turtle: [[std(0x7a8a4a), std(0x8a7a4e), std(0x5f7a5a)]], heron: [[std(0xdfe6ee), std(0xc2cedc)]], owl: [[std(0xa88a62), std(0xb9a27e), std(0xd6ccba)]],
};
const plain = {};   // one shared Lambert per exported material colour
function fromModel(kind) {
  const g = MODELS[kind].clone(true), u = g.userData, picks = (TINTS[kind] || []).map(pickOf);
  u.limbs = []; u.wings = []; u.ears = [];
  g.traverse((o) => {
    const n = o.name;
    if (n.startsWith('tail')) u.tail = o;
    else if (n.startsWith('wingL')) u.wings[0] = o; else if (n.startsWith('wingR')) u.wings[1] = o;
    else if (n.startsWith('ear')) u.ears.push(o);
    else if (n.startsWith('leg') || n.startsWith('arm')) u.limbs.push(o);
    if (!o.isMesh) return;
    const mn = o.material.name;
    o.castShadow = critterShadows && !FLY[kind];
    if (mn.startsWith('tint')) o.material = picks[mn === 'tint' ? 0 : mn === 'tint2' ? 1 : 2] || M.white;
    else if (mn === 'glow') { o.material = M.glow; o.castShadow = false; }
    else if (mn === 'wing') { o.material = M.wing; o.castShadow = false; }
    else o.material = fixedMat;
  });
  if (!u.limbs.length) delete u.limbs; if (!u.ears.length) delete u.ears; if (u.wings.length < 2) delete u.wings;
  if (kind === 'glimmer') {
    glowTex ||= glowTexture();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.setScalar(2.2); g.add(sp); u.halo = sp;
  }
  return g;
}

function build(kind) {
  if (MODELS[kind]) return fromModel(kind);
  const g = new THREE.Group(), u = g.userData; // fallback: primitive stand-ins, facing +Z
  if (kind === 'minnow') {
    g.add(part(G.body, pickOf(M.fish), 0.34, 0.42, 0.95));
    const tail = new THREE.Group(); tail.position.z = -0.42;
    const t = part(G.cone, M.fin, 0.08, 0.36, 0.5, 0, 0, -0.14); t.rotation.x = Math.PI / 2; tail.add(t);
    g.add(tail); u.tail = tail; eyes(g, 0.13, 0.06, 0.3);
    const fin = part(G.cone, M.fin, 0.05, 0.22, 0.3, 0, 0.22, -0.02); fin.rotation.x = -0.5; g.add(fin);
  } else if (kind === 'mossback') {
    g.add(part(G.dome, pickOf(M.shell), 0.8, 0.95, 0.95, 0, 0.05, -0.05), part(G.body, M.skin, 0.36, 0.3, 0.36, 0, 0.17, 0.42), part(G.body, M.skin, 0.62, 0.14, 0.8, 0, 0.07, 0));
    eyes(g, 0.1, 0.24, 0.57);
  } else if (kind === 'frog') {
    const m = pickOf(M.frog);
    g.add(part(G.body, m, 0.5, 0.34, 0.6, 0, 0.17, 0), part(G.body, M.belly, 0.42, 0.2, 0.5, 0, 0.1, 0.04));
    g.add(part(G.body, m, 0.16, 0.16, 0.16, 0.14, 0.34, 0.2), part(G.body, m, 0.16, 0.16, 0.16, -0.14, 0.34, 0.2));
    eyes(g, 0.16, 0.37, 0.25, 0.07);
    g.add(part(G.body, m, 0.2, 0.16, 0.34, 0.27, 0.08, -0.18), part(G.body, m, 0.2, 0.16, 0.34, -0.27, 0.08, -0.18));
  } else if (kind === 'rabbit') {
    const m = pickOf(M.fur);
    g.add(part(G.body, m, 0.46, 0.44, 0.66, 0, 0.26, -0.04), part(G.body, m, 0.34, 0.34, 0.36, 0, 0.5, 0.28));
    const e1 = part(G.body, m, 0.09, 0.4, 0.13, 0.09, 0.82, 0.22), e2 = part(G.body, m, 0.09, 0.4, 0.13, -0.09, 0.82, 0.22);
    e1.rotation.x = e2.rotation.x = -0.25; g.add(e1, e2); u.ears = [e1, e2];
    g.add(part(G.body, M.white, 0.17, 0.17, 0.17, 0, 0.3, -0.38)); eyes(g, 0.14, 0.55, 0.38, 0.06);
  } else if (kind === 'duck') {
    const m = pickOf(M.duck);
    g.add(part(G.body, m, 0.5, 0.4, 0.74, 0, 0.22, 0), part(G.body, m, 0.3, 0.3, 0.3, 0, 0.56, 0.3));
    const beak = part(G.cone, M.orange, 0.15, 0.2, 0.08, 0, 0.53, 0.5); beak.rotation.x = Math.PI / 2; g.add(beak);
    const tail = part(G.cone, m, 0.2, 0.26, 0.12, 0, 0.36, -0.4); tail.rotation.x = -1.0; g.add(tail);
    eyes(g, 0.12, 0.62, 0.4, 0.05);
  } else if (kind === 'fox') {
    g.add(part(G.body, M.fox, 0.36, 0.34, 0.8, 0, 0.36, 0), part(G.body, M.fox, 0.3, 0.28, 0.34, 0, 0.5, 0.42), part(G.cone, M.white, 0.13, 0.2, 0.13, 0, 0.44, 0.62));
    g.children[2].rotation.x = Math.PI / 2;
    const e1 = part(G.cone, M.fox, 0.1, 0.18, 0.1, 0.09, 0.7, 0.4), e2 = part(G.cone, M.fox, 0.1, 0.18, 0.1, -0.09, 0.7, 0.4); g.add(e1, e2);
    const tail = part(G.body, M.fox, 0.2, 0.2, 0.5, 0, 0.42, -0.56), tip = part(G.body, M.white, 0.16, 0.16, 0.2, 0, 0.44, -0.8); g.add(tail, tip);
    const L = [[0.12, 0.3], [-0.12, 0.3], [0.12, -0.26], [-0.12, -0.26]].map(([x, z]) => part(G.box, M.bug, 0.09, 0.3, 0.09, x, 0.14, z)); g.add(...L); u.limbs = L; eyes(g, 0.09, 0.56, 0.56, 0.045);
  } else if (kind === 'deer') {
    const m = pickOf(M.deer);
    g.add(part(G.body, m, 0.42, 0.44, 0.9, 0, 0.72, 0), part(G.box, m, 0.16, 0.5, 0.16, 0, 1.0, 0.36), part(G.body, m, 0.24, 0.24, 0.36, 0, 1.28, 0.46), part(G.body, M.white, 0.16, 0.16, 0.14, 0, 0.78, -0.46));
    g.add(part(G.cone, M.horn, 0.05, 0.3, 0.05, 0.1, 1.5, 0.4), part(G.cone, M.horn, 0.05, 0.3, 0.05, -0.1, 1.5, 0.4));
    const L = [[0.13, 0.3], [-0.13, 0.3], [0.13, -0.3], [-0.13, -0.3]].map(([x, z]) => part(G.box, m, 0.09, 0.56, 0.09, x, 0.28, z)); g.add(...L); u.limbs = L; eyes(g, 0.1, 1.32, 0.56, 0.045);
  } else if (kind === 'crab') {
    const m = pickOf(M.crab);
    g.add(part(G.body, m, 0.6, 0.26, 0.44, 0, 0.16, 0), part(G.body, m, 0.2, 0.16, 0.2, 0.36, 0.2, 0.22), part(G.body, m, 0.2, 0.16, 0.2, -0.36, 0.2, 0.22));
    for (const s of [1, -1]) for (const z of [-0.12, 0.04]) g.add(part(G.box, m, 0.22, 0.05, 0.05, s * 0.36, 0.08, z));
    g.add(part(G.box, m, 0.03, 0.14, 0.03, 0.1, 0.34, 0.14), part(G.box, m, 0.03, 0.14, 0.03, -0.1, 0.34, 0.14)); eyes(g, 0.1, 0.43, 0.14, 0.05);
  } else if (kind === 'bee') {
    g.add(part(G.body, M.bee, 0.2, 0.2, 0.3), part(G.body, M.bug, 0.21, 0.21, 0.1, 0, 0, -0.02), part(G.body, M.bug, 0.14, 0.14, 0.14, 0, 0, 0.17));
    const wl = new THREE.Group(), wr = new THREE.Group();
    const a = part(G.wing, M.wing, 0.26, 0.16, 1, 0.13, 0.1, 0), b = part(G.wing, M.wing, 0.26, 0.16, 1, -0.13, 0.1, 0);
    a.rotation.x = b.rotation.x = -Math.PI / 2; a.castShadow = b.castShadow = false; wl.add(a); wr.add(b); g.add(wl, wr); u.wings = [wl, wr];
  } else if (kind === 'villager') {
    const tunic = pickOf(M.tunic), face = pickOf(M.face);
    g.add(part(G.box, tunic, 0.42, 0.5, 0.28, 0, 0.6, 0), part(G.body, face, 0.36, 0.36, 0.36, 0, 1.03, 0), part(G.dome, pickOf(M.hair), 0.4, 0.34, 0.4, 0, 1.06, -0.02));
    const l1 = part(G.box, M.bug, 0.14, 0.36, 0.16, 0.11, 0.18, 0), l2 = part(G.box, M.bug, 0.14, 0.36, 0.16, -0.11, 0.18, 0);
    const a1 = part(G.box, face, 0.1, 0.36, 0.12, 0.27, 0.62, 0), a2 = part(G.box, face, 0.1, 0.36, 0.12, -0.27, 0.62, 0);
    g.add(l1, l2, a1, a2); u.limbs = [l1, l2, a1, a2]; eyes(g, 0.08, 1.05, 0.17, 0.045);
  } else if (kind === 'butterfly') {
    g.add(part(G.body, M.bug, 0.07, 0.07, 0.32));
    const m = pickOf(M.bfly), wl = new THREE.Group(), wr = new THREE.Group();
    const a = part(G.wing, m, 0.42, 0.5, 1, 0.21, 0, 0), b = part(G.wing, m, 0.42, 0.5, 1, -0.21, 0, 0);
    a.rotation.x = b.rotation.x = -Math.PI / 2; a.castShadow = b.castShadow = false; wl.add(a); wr.add(b); g.add(wl, wr); u.wings = [wl, wr];
  } else if (kind === 'songbird') {
    const m = pickOf(M.bird);
    g.add(part(G.body, m, 0.3, 0.3, 0.46, 0, 0.16, 0), part(G.body, m, 0.24, 0.24, 0.24, 0, 0.32, 0.18), part(G.body, M.belly, 0.24, 0.2, 0.34, 0, 0.1, 0.04));
    const beak = part(G.cone, M.orange, 0.07, 0.14, 0.07, 0, 0.31, 0.34); beak.rotation.x = Math.PI / 2; g.add(beak);
    const tail = part(G.box, m, 0.16, 0.03, 0.3, 0, 0.16, -0.34); g.add(tail); eyes(g, 0.09, 0.36, 0.26, 0.04);
    const wl = new THREE.Group(), wr = new THREE.Group(); wl.position.set(0.13, 0.22, 0); wr.position.set(-0.13, 0.22, 0);
    wl.add(part(G.box, m, 0.36, 0.03, 0.26, 0.18, 0, 0)); wr.add(part(G.box, m, 0.36, 0.03, 0.26, -0.18, 0, 0)); g.add(wl, wr); u.wings = [wl, wr];
  } else {
    g.add(part(G.body, M.bug, 0.16, 0.16, 0.26));
    const lamp = part(G.body, M.glow, 0.17, 0.17, 0.2, 0, 0, -0.17); lamp.castShadow = false; g.add(lamp);
    const wl = new THREE.Group(), wr = new THREE.Group();
    const a = part(G.wing, M.wing, 0.34, 0.2, 1, 0.17, 0.1, 0), b = part(G.wing, M.wing, 0.34, 0.2, 1, -0.17, 0.1, 0);
    a.rotation.x = b.rotation.x = -Math.PI / 2; a.castShadow = b.castShadow = false; wl.add(a); wr.add(b); g.add(wl, wr); u.wings = [wl, wr];
    glowTex ||= glowTexture();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.setScalar(2.2); g.add(sp); u.halo = sp;
  }
  return g;
}

const lerpAngle = (a, b, t) => { let d = (b - a) % 6.2832; if (d > 3.1416) d -= 6.2832; else if (d < -3.1416) d += 6.2832; return a + d * t; };
const FLY = { glimmer: 1, butterfly: 1, songbird: 1, bee: 1, owl: 1 };
const SWIM = { minnow: 1, koi: 1 };
const GRAZE = { mossback: 1, rabbit: 1, deer: 1, sheep: 1 };

const NAME_A = ['Al', 'Bri', 'Cor', 'Del', 'El', 'Fen', 'Gar', 'Hal', 'Is', 'Jor', 'Kes', 'Lin', 'Mar', 'Nel', 'Or', 'Per', 'Ros', 'Sil', 'Tam', 'Wil'];
const NAME_B = ['a', 'an', 'da', 'den', 'en', 'eth', 'ia', 'in', 'is', 'la', 'ley', 'lo', 'mund', 'na', 'ra', 'ric', 'sa', 'ton', 'wyn', 'y'];
const TOWN_A = ['Ash', 'Brook', 'Elm', 'Fern', 'Holly', 'Mill', 'Oak', 'Thorn', 'Willow', 'Stone', 'Clay', 'Marsh', 'Pine', 'Red', 'Wind', 'Hazel', 'Bram', 'Lark', 'Moss', 'Sedge'];
const TOWN_B = ['ford', 'ham', 'by', 'wick', 'stead', 'field', 'ton', 'dale', 'mere', 'well', 'bury', 'combe', 'hollow', 'gate', 'stow'];
const COLOURS = [0xc8553a, 0x3f7fb0, 0x5a9a4a, 0xd9a53a, 0x8a5aa8, 0x2a9a9a, 0xd06a90, 0x6a6a7a];
export const townName = () => TOWN_A[(Math.random() * TOWN_A.length) | 0] + TOWN_B[(Math.random() * TOWN_B.length) | 0];
const personName = () => NAME_A[(Math.random() * NAME_A.length) | 0] + NAME_B[(Math.random() * NAME_B.length) | 0];

// a few words on what a creature is up to, for the inspect card
export function describe(c, world, night) {
  const wet = world.surfAt(c.x, c.z) > c.y - 0.1 && world.depthAt(c.x, c.z) > 0.3, k = c.kind;
  if (c.flee > 0) return 'Running from a fox';
  if (c.rest > 0) return night > 0.6 || k === 'owl' ? 'Asleep on a perch' : 'Resting';
  if (k === 'minnow' || k === 'koi') return c.dry > 0.3 ? 'Stranded, gasping' : c.food < 4 ? 'Looking for waterweed' : 'Swimming with the school';
  if (k === 'villager') {
    if (wet) return 'Out in the boat' + ((c.meal || 0) < 2 ? ', fishing' : '');
    if (night > 0.7) return 'Home for the night';
    if (c.job) return 'Off to fell a tree';
    if (c.food >= 3) return 'Looking for a place to build';
    return (c.meal || 0) < 2 ? 'Tending the fields' : 'Out for a walk';
  }
  if (k === 'fox') return c.eatCd <= 0 ? 'Hunting' : 'Prowling, well fed';
  if (k === 'heron') return c.eatCd <= 0 ? 'Stalking fish' : 'Wading';
  if (k === 'bee') return 'Visiting flowers';
  if (k === 'butterfly' || k === 'glimmer' || k === 'songbird' || k === 'owl') return 'On the wing';
  if (wet) return k === 'duck' || k === 'turtle' ? (c.food < 4 ? 'Dabbling for weed' : 'Paddling') : 'Swimming';
  if (night > 0.7 && !c.walk) return 'Settled for the night';
  if (k === 'mossback' || k === 'rabbit' || k === 'deer' || k === 'sheep') return c.food < 5 ? 'Grazing' : 'Well fed, wandering';
  return c.walk ? 'Wandering' : 'Standing still';
}

export class Critters {
  constructor(world, scene, fx) {
    this.world = world; this.scene = scene; this.fx = fx;
    this.list = []; this.counts = {}; for (const k of KIND_IDS) this.counts[k] = 0;
    this.possessed = null; this.onEvent = () => {};
    this.villages = [];   // { name, x, z, colour }: villagers belong to one by index
  }

  found(x, z, name) {
    const used = new Set(this.villages.map((v) => v.name));
    let n = name || townName(); for (let k = 0; k < 8 && used.has(n); k++) n = townName();
    this.villages.push({ name: n, x: Math.round(x), z: Math.round(z), colour: COLOURS[this.villages.length % COLOURS.length] });
    this.onEvent('founded', this.villages[this.villages.length - 1]);
    return this.villages.length - 1;
  }
  // the village a new settler near (x, z) belongs to; settlers far from every village found their own
  villageAt(x, z) {
    let best = -1, bd = 22;
    this.villages.forEach((v, i) => { const d = Math.hypot(v.x - x, v.z - z); if (d < bd) { bd = d; best = i; } });
    return best >= 0 ? best : this.found(x, z);
  }
  population(i) { let n = 0; for (const c of this.list) if (c.kind === 'villager' && !c.dead && c.vid === i) n++; return n; }

  spawn(kind, x, y, z, quiet) {
    if (this.counts[kind] >= KINDS[kind].cap) return null;
    const c = {
      kind, x, y, z, vx: 0, vy: 0, vz: 0, yaw: rnd() * 6.28, food: 0, age: quiet ? rnd() * 40 : 0, dry: 0, t: rnd() * 10,
      tx: x, ty: y, tz: z, retarget: 0, ground: false, eatCd: 1 + rnd() * 3, hopCd: 0, walk: false, heading: rnd() * 6.28, rest: 0,
      hx: x, hz: z, mesh: build(kind), dead: false, size: quiet ? 1 : 0.2, name: kind === 'villager' ? personName() : '',
    };
    c.mesh.position.set(x, y, z);
    this.scene.add(c.mesh); this.list.push(c); this.counts[kind]++;
    return c;
  }

  remove(c, puff) {
    if (c.dead) return;
    c.dead = true; this.counts[c.kind]--;
    this.scene.remove(c.mesh);
    if (puff) this.fx.burst(c.x, c.y + 0.2, c.z, 10, puff, 2.5);
    if (this.possessed === c) { this.possessed = null; this.onEvent('lost', c); }
  }

  clear() { for (const c of this.list) this.scene.remove(c.mesh); this.list = []; this.villages = []; for (const k of KIND_IDS) this.counts[k] = 0; this.possessed = null; }

  serialize() { return this.list.filter((c) => !c.dead).map((c) => [c.kind, +c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1), c.food, +c.hx.toFixed(0), +c.hz.toFixed(0), c.meal || 0, c.name, c.vid ?? -1]); }
  deserialize(arr) {
    this.clear();
    const OLD = ['minnow', 'duck', 'frog', 'mossback', 'rabbit', 'villager', 'butterfly', 'songbird', 'glimmer'];
    for (const a of arr || []) {
      const k = typeof a[0] === 'number' ? OLD[a[0]] : a[0]; if (!KINDS[k]) continue;
      const c = this.spawn(k, a[1], a[2], a[3], true);
      if (c) { c.food = a[4] || 0; if (a.length > 5) { c.hx = a[5]; c.hz = a[6]; c.meal = a[7] || 0; if (a[8]) c.name = a[8]; if (a[9] >= 0) c.vid = a[9]; } }
    }
  }

  // nearest creature to a ray (grid space)
  pick(o, d) {
    let best = null, bt = 1e9;
    for (const c of this.list) {
      const px = c.x - o.x, py = c.y + 0.3 - o.y, pz = c.z - o.z;
      const t = px * d.x + py * d.y + pz * d.z; if (t < 0) continue;
      const dist = Math.hypot(px - d.x * t, py - d.y * t, pz - d.z * t);
      if (dist < 1.8 && t + dist * 6 < bt) { bt = t + dist * 6; best = c; }
    }
    return best;
  }

  // everything within r of a point dies (meteors, lightning)
  blast(x, y, z, r, color) { for (const c of this.list) if (!c.dead && Math.hypot(c.x - x, c.y - y, c.z - z) < r) this.remove(c, color); }

  update(dt, input, night) {
    const w = this.world; this.night = night;
    this.censusT = (this.censusT || 0) - dt;
    if (this.censusT <= 0) { this.censusT = 6; this.roofs = w.count(19); }   // lanterns = roofed buildings: villages only grow as fast as they build
    for (const c of this.list) {
      if (c.dead) continue;
      c.age += dt; c.t += dt; c.eatCd -= dt; c.hopCd -= dt;
      if (c.size < 1) c.size = Math.min(1, c.size + dt * 0.25);
      const ctl = this.possessed === c ? input : null;
      const cx = Math.floor(c.x), cy = Math.floor(c.y + 0.2), cz = Math.floor(c.z);
      const here = w.get(cx, cy, cz);
      if (here === LAVA || here === FIRE) { this.remove(c, 0xff9a3a); continue; }
      if (SWIM[c.kind]) this.minnow(c, dt, ctl, here, cx, cy, cz);
      else if (FLY[c.kind]) this.flier(c, dt, ctl, night);
      else this.lander(c, dt, ctl, here, cx, cy, cz, night);
      if (c.dead) continue;
      this.pose(c, night);
    }
    if (this.list.some((c) => c.dead)) this.list = this.list.filter((c) => !c.dead);
  }

  pose(c, night) {
    const m = c.mesh, u = m.userData, sp = Math.hypot(c.vx, c.vz);
    m.position.set(c.x, c.y, c.z);
    if (c.kind === 'villager') { // afloat: a boat appears under them
      const sf = this.world.surfAt(c.x, c.z), afloat = sf > 0 && c.y < sf + 0.15 && c.y > sf - 0.5 && this.world.depthAt(c.x, c.z) > 0.45;
      if (afloat && !u.boat && MODELS.boat) { u.boat = MODELS.boat.clone(true); u.boat.traverse((o) => { if (o.isMesh) { o.material = boatMat; o.castShadow = false; } }); u.boat.position.y = -0.1; u.boat.scale.setScalar(1.3); m.add(u.boat); }
      if (u.boat) u.boat.visible = afloat;
      if (afloat) m.position.y = c.y + 0.24 + Math.sin(c.t * 2) * 0.02;   // sit up in the boat, bobbing a little
    }
    m.scale.setScalar(c.size);
    if (SWIM[c.kind]) {
      if (c.leap > 0) { const f = 1 - c.leap / 0.75; m.position.y = c.y + Math.sin(f * Math.PI) * 0.9; m.rotation.set(-Math.cos(f * Math.PI) * 1.0, c.yaw, 0, 'YXZ'); u.tail.rotation.y = Math.sin(c.t * 22) * 0.4; return; }
      m.rotation.set(-Math.atan2(c.vy, Math.max(0.6, sp)) * 0.6, c.yaw, c.dry > 0.3 ? Math.PI / 2 : 0, 'YXZ');
      u.tail.rotation.y = Math.sin(c.t * (6 + sp * 4)) * 0.5;
    } else if (FLY[c.kind]) {
      m.rotation.set(0, c.yaw, 0);
      const resting = c.rest > 0;
      const f = c.kind === 'glimmer' || c.kind === 'bee' ? (resting ? 0.2 : Math.sin(c.t * 60) * 0.7) : c.kind === 'butterfly' ? (resting ? 1.1 + Math.sin(c.t * 2) * 0.15 : Math.sin(c.t * 16) * 1.1) : (resting ? -1.2 : Math.sin(c.t * 22) * 0.9);
      u.wings[0].rotation.z = f; u.wings[1].rotation.z = -f;
      if (u.halo) u.halo.material.opacity = (0.12 + night * 0.88) * (0.65 + 0.35 * Math.sin(c.t * 2.3));
    } else {
      const air = c.ground ? 0 : Math.max(-0.5, Math.min(0.5, c.vy * 0.06));
      m.rotation.set(c.kind === 'villager' ? 0 : -air, c.yaw + (c.kind === 'crab' ? 1.5708 : 0), Math.sin(c.t * 9) * 0.05 * Math.min(1, sp), 'YXZ');
      if (u.limbs) { const s = Math.sin(c.t * 10) * Math.min(1, sp) * 0.7; u.limbs[0].rotation.x = s; u.limbs[1].rotation.x = -s; if (u.limbs[3]) { u.limbs[2].rotation.x = -s; u.limbs[3].rotation.x = s; } }
      if (u.ears) { u.ears[0].rotation.x = u.ears[1].rotation.x = -0.12 - air + Math.sin(c.t * 1.3) * 0.05; }
    }
  }

  canSwim(fx, fy, fz) {
    const w = this.world; if (fx < 0.3 || fz < 0.3 || fx > W - 0.3 || fz > D - 0.3) return false;
    const s = w.surfAt(fx, fz);
    return s > 0 && w.depthAt(fx, fz) > 0.55 && fy > w.bedAt(fx, fz) + 0.12 && fy < s - 0.14;
  }

  minnow(c, dt, ctl, here, cx, cy, cz) {
    const w = this.world;
    if (here === STEAM) { this.remove(c, 0xffffff); return; }
    const surf = w.surfAt(c.x, c.z), bed = w.bedAt(c.x, c.z);
    if (surf > 0 && surf - bed > 0.45 && c.y < surf + 0.1 && !w.solid(cx, cy, cz)) {
      c.dry = 0;
      let dx = 0, dy = 0, dz = 0, sp = c.kind === 'koi' ? 1.7 : 2.6;
      if (ctl) { dx = ctl.x; dz = ctl.z; dy = ctl.up; sp = 4.5; }
      else {
        c.retarget -= dt;
        const tdx = c.tx - c.x, tdy = c.ty - c.y, tdz = c.tz - c.z, dist = Math.hypot(tdx, tdy, tdz);
        if (c.retarget <= 0 || dist < 0.5) {
          c.retarget = 1.5 + rnd() * 3;
          // schooling: more often than not, swim where a neighbour of the same kind is heading
          let mate = null;
          if (rnd() < 0.65) for (const o of this.list) if (o !== c && o.kind === c.kind && !o.dead && Math.hypot(o.x - c.x, o.z - c.z) < 5.5) { mate = o; if (rnd() < 0.4) break; }
          if (mate && this.canSwim(mate.tx + (rnd() - 0.5), mate.ty, mate.tz + (rnd() - 0.5))) { c.tx = mate.tx + (rnd() - 0.5) * 1.2; c.ty = mate.ty + (rnd() - 0.5) * 0.5; c.tz = mate.tz + (rnd() - 0.5) * 1.2; }
          else for (let k = 0; k < 10; k++) {
            const x = c.x + (rnd() - 0.5) * 13, z = c.z + (rnd() - 0.5) * 13, s = w.surfAt(x, z);
            if (s < 0 || w.depthAt(x, z) < 0.7) continue;
            const b = w.bedAt(x, z); c.tx = x; c.tz = z; c.ty = b + 0.3 + rnd() * Math.max(0, s - b - 0.6);
            if (c.food < 4 && k < 6) { if (w.get(Math.floor(x), Math.floor(b), Math.floor(z)) !== WEED) continue; c.ty = b + 0.4; }
            break;
          }
        } else { dx = tdx / dist; dy = tdy / dist; dz = tdz / dist; }
        sp *= 0.5 + 0.5 * Math.sin(c.t * 1.7) ** 2;
      }
      const k = Math.min(1, dt * 4);
      c.vx += (dx * sp - c.vx) * k; c.vy += (dy * sp - c.vy) * k; c.vz += (dz * sp - c.vz) * k;
      // the current carries fish along
      const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      if (this.canSwim(nx, c.y, c.z) && !w.solid(Math.floor(nx), cy, cz)) c.x = nx; else { c.vx *= -0.3; c.retarget = 0; }
      if (this.canSwim(c.x, c.y, nz) && !w.solid(Math.floor(c.x), cy, Math.floor(nz))) c.z = nz; else { c.vz *= -0.3; c.retarget = 0; }
      const s2 = w.surfAt(c.x, c.z), b2 = w.bedAt(c.x, c.z);
      c.y = Math.max(b2 + 0.15, Math.min(s2 > 0 ? s2 - 0.18 : c.y, c.y + c.vy * dt));
      // now and then a fish near the top jumps clear of the water
      if (c.leap > 0) {
        c.leap -= dt;
        if (c.leap <= 0) { this.fx.burst(c.x, s2, c.z, 7, 0xd8f0f8, 2); w.ripple(c.x, c.z, 0.3); this.onEvent('plop', c); }
      } else if (!ctl && s2 > 0 && c.y > s2 - 1.8 && rnd() < dt * (c.kind === 'koi' ? 0.015 : 0.03)) {
        c.leap = 0.75; this.fx.burst(c.x, s2, c.z, 6, 0xd8f0f8, 1.6); w.ripple(c.x, c.z, 0.2);
      }
      if (Math.hypot(c.vx, c.vz) > 0.2) c.yaw = lerpAngle(c.yaw, Math.atan2(c.vx, c.vz), Math.min(1, dt * 8));
      if (here === WEED && c.eatCd <= 0 && c.food < 6) { w.set(cx, cy, cz, AIR); c.food++; c.eatCd = 4; this.fx.burst(c.x, c.y, c.z, 4, 0x58c08a, 1); }
      if (c.food >= 5 && c.age > (c.kind === 'koi' ? 260 : 150) && c.eatCd <= 0) { c.food = 0; c.age = 0; this.spawn(c.kind, c.x, c.y, c.z); }
    } else {
      if (w.solid(cx, cy, cz)) { c.y += 3 * dt; return; }
      c.dry += dt; c.vy -= 22 * dt;
      const ny = c.y + c.vy * dt;
      if (w.solid(cx, Math.floor(ny), cz)) {
        c.y = Math.floor(ny) + 1.02; c.vy = rnd() < 0.5 ? 3 + rnd() * 2 : 0;
        if (c.vy) { c.vx = (rnd() - 0.5) * 3; c.vz = (rnd() - 0.5) * 3; }
      } else c.y = ny;
      const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      if (!w.solid(Math.floor(nx), Math.floor(c.y + 0.2), Math.floor(nz))) { c.x = nx; c.z = nz; }
      c.vx *= 0.96; c.vz *= 0.96;
      if (c.dry > 9) this.remove(c, 0xcfd8dc);
    }
  }

  // sample for something nearby; returns [x, y, z] of a matching cell or null
  find(c, mat, r, tries = 8) {
    const w = this.world, cx = Math.floor(c.x), cy = Math.floor(c.y + 0.2), cz = Math.floor(c.z);
    for (let k = 0; k < tries; k++) {
      const x = cx + ri(r * 2 + 1) - r, z = cz + ri(r * 2 + 1) - r, y = cy + ri(5) - 2;
      if (w.get(x, y, z) === mat) return [x, y, z];
    }
    return null;
  }

  lander(c, dt, ctl, here, cx, cy, cz, night) {
    const w = this.world, kind = c.kind;
    if (w.solid(cx, cy, cz)) { c.y += 4 * dt; c.vy = 0; return; } // dig out when buried
    const surf = w.surfAt(c.x, c.z);
    // afloat with a little hysteresis, so something riding at the surface does not flicker between swimming and falling
    if (surf > c.y + 0.3) c.swim = true; else if (surf < c.y - 0.25 || surf - w.bedAt(c.x, c.z) < 0.3) c.swim = false;
    const inWater = c.swim;
    const hops = kind === 'frog' || kind === 'rabbit';
    let dx = 0, dz = 0, sp = { mossback: 1.3, rabbit: 3.4, frog: 3.6, duck: 1.2, villager: 1.7, deer: 2.2, fox: 2.8, crab: 1.2, sheep: 1.2, turtle: 0.8, heron: 1.3 }[kind], jump = false;
    if (ctl) {
      dx = ctl.x; dz = ctl.z; sp *= kind === 'mossback' ? 2.4 : 1.6; jump = ctl.up > 0;
    } else {
      c.retarget -= dt;
      if (c.retarget <= 0) {
        c.retarget = 2 + rnd() * 4; c.walk = rnd() < (kind === 'frog' ? 0.45 : 0.8);
        let ang = c.heading + (rnd() - 0.5) * 2.4, t = null;
        const herd = kind === 'sheep' || kind === 'deer' || kind === 'duck', dayAnimal = herd || kind === 'rabbit' || kind === 'mossback' || kind === 'heron';
        if (dayAnimal && this.night > 0.7 && !c.flee) c.walk = rnd() < 0.12;        // settle down after dark
        let herdAng = null;
        if (herd && rnd() < 0.75) { // keep with the herd: drift toward the nearest of its own kind when it strays
          let near = null, nd = 32;
          for (const o of this.list) if (o !== c && o.kind === kind && !o.dead) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < nd) { nd = d; near = o; } }
          if (near && nd > 2.6) herdAng = Math.atan2(near.x - c.x, near.z - c.z) + (rnd() - 0.5) * 0.5;
        }
        if (GRAZE[kind]) { if (c.food < 5) t = this.find(c, TUFT, 6); if (kind === 'sheep' && !t && Math.hypot(c.hx - c.x, c.hz - c.z) > 15) { ang = Math.atan2(c.hx - c.x, c.hz - c.z); c.walk = true; } }
        if (kind === 'rabbit' || kind === 'deer' || kind === 'duck' || kind === 'sheep') { // bolt from a fox that gets close
          for (const o of this.list) if (o.kind === 'fox' && !o.dead && Math.hypot(o.x - c.x, o.z - c.z) < 5.5) { t = null; ang = Math.atan2(c.x - o.x, c.z - o.z) + (rnd() - 0.5) * 0.6; c.walk = true; c.flee = 2.5; c.retarget = 1; break; }
        }
        else if (kind === 'fox') {
          if (c.eatCd <= 0) { let bd = 11; for (const o of this.list) if (!o.dead && (o.kind === 'rabbit' || o.kind === 'duck' || o.kind === 'mossback' || o.kind === 'sheep')) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; t = [o.x - 0.5, 0, o.z - 0.5]; } } if (t) c.retarget = 0.6; }
        } else if (kind === 'crab') {
          for (let k = 0; k < 8 && !t; k++) { const x = c.x + (rnd() - 0.5) * 14, z = c.z + (rnd() - 0.5) * 14, d = w.depthAt(x, z); if (d > 0.05 && d < 1.6) t = [x, 0, z]; }
        }
        else if (kind === 'duck' || kind === 'frog' || kind === 'turtle' || kind === 'heron') {
          // drawn to water
          if (!inWater || rnd() < 0.5) for (let k = 0; k < 8 && !t; k++) {
            const x = c.x + (rnd() - 0.5) * 18, z = c.z + (rnd() - 0.5) * 18;
            const dd = w.depthAt(x, z);
            if (w.surfAt(x, z) > 0 && dd > (kind === 'duck' ? 0.6 : 0.2) && (kind !== 'heron' || dd < 1.1)) t = [x, 0, z];
          }
          if (kind === 'frog' && inWater && rnd() < 0.5) c.walk = false;
        } else if (kind === 'villager') ang = this.villagerPlan(c, ang);
        if (t) { ang = Math.atan2(t[0] + 0.5 - c.x, t[2] + 0.5 - c.z); c.walk = true; }
        if (herdAng !== null && !c.flee && (!t || rnd() < 0.5)) { ang = herdAng; c.walk = true; }
        c.heading = ang;
      }
      if (c.walk) { dx = Math.sin(c.heading); dz = Math.cos(c.heading); }
    }
    if (c.flee > 0) { c.flee -= dt; sp *= 1.6; }
    if (inWater && (dx || dz) && rnd() < dt * 6) w.ripple(c.x, c.z, kind === 'deer' || kind === 'villager' ? 0.09 : 0.05);
    if (kind === 'frog' && this.night > 0.6 && inWater && rnd() < dt * 0.04) this.onEvent('croak', c);
    // vertical
    if (inWater && (kind === 'crab' || kind === 'heron')) { c.vy -= 9 * dt; sp *= 0.8; if (jump && c.ground) c.vy = 4; } // crabs walk the bottom
    else if (inWater) {
      const sink = kind === 'duck' ? 0.16 : kind === 'frog' ? 0.22 : kind === 'deer' ? 0.7 : kind === 'villager' ? 0.05 : 0.3;
      if (kind === 'villager') sp *= 2.6;   // rowing is quicker than wading
      const want = Math.max(-3, Math.min(4, (surf - sink - c.y) * 9));
      c.vy += (want - c.vy) * Math.min(1, dt * 7);
      sp *= kind === 'duck' ? 1.5 : kind === 'frog' ? 0.7 : 0.55;
      if (jump && kind !== 'duck') c.vy = 5;
    } else {
      c.vy -= 24 * dt;
      if (c.ground) {
        if (jump) { c.vy = kind === 'frog' ? 9 : 7.5; c.ground = false; }
        else if (hops && (dx || dz) && c.hopCd <= 0) { c.vy = kind === 'frog' ? 6.5 : 5; c.ground = false; c.hopCd = kind === 'frog' ? 0.5 + rnd() * 1.2 : 0.12; }
      }
    }
    const moving = !hops || !c.ground || inWater;
    c.vx = moving ? dx * sp : 0; c.vz = moving ? dz * sp : 0;
    // horizontal with one-block step-up
    for (let axis = 0; axis < 2; axis++) {
      const v = axis ? c.vz : c.vx; if (!v) continue;
      const n = (axis ? c.z : c.x) + v * dt, pad = n + Math.sign(v) * 0.3;
      const px = Math.floor(axis ? c.x : pad), pz = Math.floor(axis ? pad : c.z), fy = Math.floor(c.y + 0.1);
      if (pad < 0.2 || pad > (axis ? D : W) - 0.2) { if (!ctl) c.heading += Math.PI; continue; }
      if (!w.solid(px, fy, pz)) { if (axis) c.z = n; else c.x = n; }
      else if ((c.ground || inWater) && !w.solid(px, fy + 1, pz) && !w.solid(Math.floor(c.x), fy + 1, Math.floor(c.z))) {
        c.y = fy + 1.02; if (axis) c.z = n; else c.x = n;
      } else if (!ctl) c.retarget = Math.min(c.retarget, 0.2);
    }
    const ny = c.y + c.vy * dt;
    c.ground = false;
    if (c.vy <= 0 && w.solid(Math.floor(c.x), Math.floor(ny), Math.floor(c.z))) { c.y = Math.floor(ny) + 1; c.vy = 0; c.ground = true; }
    else if (c.vy > 0 && w.solid(Math.floor(c.x), Math.floor(ny + 0.6), Math.floor(c.z))) c.vy = 0;
    else c.y = ny;
    if (c.y > H - 1) c.y = H - 1;
    if (dx || dz) c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 7));

    // appetites
    if (kind === 'fox') {
      if (c.eatCd <= 0) for (const o of this.list) if (!o.dead && (o.kind === 'rabbit' || o.kind === 'duck' || o.kind === 'mossback') && this.possessed !== o && Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z) < 1.3) { this.remove(o, 0xffffff); c.food++; c.eatCd = 70; break; }
      if (c.food >= 4 && c.age > 320 && this.counts.fox < 5) { c.food = 0; c.age = 0; this.spawn('fox', c.x, c.y + 0.2, c.z); }
    } else if (kind === 'crab') {
      if (c.age > 220 && inWater && rnd() < 0.01) { c.age = 0; this.spawn('crab', c.x, c.y + 0.2, c.z); }
    } else if (kind === 'heron') {
      if (c.eatCd <= 0 && surf > 0) for (const o of this.list) if (!o.dead && o.kind === 'minnow' && this.possessed !== o && Math.hypot(o.x - c.x, o.z - c.z) < 2.2) {
        this.fx.burst(o.x, surf, o.z, 8, 0xbfe6f7, 2.5); this.remove(o); c.food++; c.eatCd = 45; break;
      }
      if (c.food >= 4 && c.age > 300) { c.food = 0; c.age = 0; this.spawn('heron', c.x, c.y + 0.2, c.z); }
    } else if (GRAZE[kind]) {
      if (here === TUFT && c.eatCd <= 0 && c.food < 6) { w.set(cx, cy, cz, AIR); c.food++; c.eatCd = kind === 'rabbit' ? 2 : 3; this.fx.burst(c.x, c.y + 0.3, c.z, 4, 0x86cf58, 1); }
      if (c.food >= 5 && c.age > 140) { c.food = 0; c.age = 0; this.spawn(kind, c.x, c.y + 0.2, c.z); }
    } else if (kind === 'frog') {
      if (c.eatCd <= 0) {
        c.eatCd = 1.5;
        for (const o of this.list) if (!o.dead && (o.kind === 'glimmer' || o.kind === 'butterfly') && this.possessed !== o && Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z) < 1.6) {
          this.remove(o, 0xe9ff8a); c.food++; c.eatCd = 12; c.vy = 5; break;
        }
      }
      if (c.food >= 3 && c.age > 90 && inWater) { c.food = 0; c.age = 0; this.spawn('frog', c.x, c.y, c.z); }
    } else if (kind === 'duck' || kind === 'turtle') {
      if (inWater && c.eatCd <= 0) {
        c.eatCd = 3; const b = Math.floor(w.bedAt(c.x, c.z));
        for (let y = b + 2; y >= b; y--) if (w.get(cx, y, cz) === WEED) { w.set(cx, y, cz, AIR); c.food++; c.eatCd = 8; this.fx.burst(c.x, c.y, c.z, 5, 0x9fe0f0, 1.5); break; }
      }
      if (c.food >= 4 && c.age > (kind === 'turtle' ? 260 : 110)) { c.food = 0; c.age = 0; this.spawn(kind, c.x, c.y + 0.2, c.z); }
    } else if (kind === 'villager') {
      if (c.vid === undefined || c.vid < 0 || !this.villages[c.vid]) c.vid = this.villageAt(c.hx, c.hz);
      if (c.ground && (dx || dz) && rnd() < dt * 5) w.wear(Math.floor(c.x), Math.floor(c.y - 0.5), Math.floor(c.z));
      this.villagerWork(c, cx, cy, cz);
    }
  }

  // villagers: gather wood, build huts near home, replant, and raise families beside a roof
  villagerPlan(c, ang) {
    const w = this.world, home = Math.hypot(c.hx - c.x, c.hz - c.z);
    if (home > 16) return Math.atan2(c.hx - c.x, c.hz - c.z);
    if (this.night > 0.7) { // evenings are spent by the huts
      if (home > 3.5) { c.walk = true; return Math.atan2(c.hx - c.x, c.hz - c.z); }
      c.walk = rnd() < 0.15; return ang;
    }
    if ((c.meal || 0) < 2) { // hungry: look for a ripe field
      for (let k = 0; k < 10; k++) {
        const x = Math.floor(c.x) + ri(15) - 7, z = Math.floor(c.z) + ri(15) - 7, y = w.groundY(x, z) - 1;
        if (w.get(x, y, z) === CROP && w.getAux(x, y, z) >= 3) { c.walk = true; return Math.atan2(x + 0.5 - c.x, z + 0.5 - c.z); }
      }
    }
    if (c.food < 3) {
      for (let k = 0; k < 14; k++) {
        const x = Math.floor(c.x) + ri(21) - 10, z = Math.floor(c.z) + ri(21) - 10, y = Math.floor(c.y) + ri(4) - 1;
        if (w.get(x, y, z) === WOOD && w.get(x, y - 1, z) !== WOOD && w.get(x, y + 1, z) === WOOD) { c.job = [x, y, z]; c.walk = true; return Math.atan2(x + 0.5 - c.x, z + 0.5 - c.z); }
      }
    }
    c.job = null;
    return ang;
  }
  villagerWork(c, cx, cy, cz) {
    const w = this.world;
    const here = w.get(cx, cy, cz);
    if (here === CROP && w.getAux(cx, cy, cz) >= 3) { w.set(cx, cy, cz, CROP, 0); c.meal = (c.meal || 0) + 1; this.fx.burst(c.x, c.y + 0.4, c.z, 6, 0xe0b040, 1.5); }
    if (c.eatCd > 0) return;
    // fish from the bank
    if ((c.meal || 0) < 2 && c.ground && w.surfAt(c.x + Math.sin(c.yaw) * 1.5, c.z + Math.cos(c.yaw) * 1.5) > 0) {
      for (const o of this.list) if (!o.dead && o.kind === 'minnow' && this.possessed !== o && Math.hypot(o.x - c.x, o.z - c.z) < 4) {
        this.fx.burst(o.x, w.surfAt(o.x, o.z), o.z, 8, 0xbfe6f7, 2.5); this.remove(o); c.meal = (c.meal || 0) + 1; c.eatCd = 12; this.onEvent('fish', c); return;
      }
    }
    // sow a field in rows near home
    if (c.ground && rnd() < 0.02 && (here === AIR || here === TUFT) && ((cx + cz) & 1) === 0 && Math.hypot(c.hx - c.x, c.hz - c.z) < 9 && Math.hypot(c.hx - c.x, c.hz - c.z) > 2.5) {
      const below = w.get(cx, cy - 1, cz);
      if (below === TURF || below === SOIL) { w.set(cx, cy - 1, cz, SOIL); w.set(cx, cy, cz, CROP, 0); c.eatCd = 2; return; }
    }
    if (c.job && Math.hypot(c.job[0] + 0.5 - c.x, c.job[2] + 0.5 - c.z) < 1.7) {
      const [x, y, z] = c.job; c.job = null; c.eatCd = 4;
      for (let k = 0; k < 9 && w.get(x, y + k, z) === WOOD; k++) w.set(x, y + k, z, AIR);
      c.food += 3; this.fx.burst(x + 0.5, y + 0.6, z + 0.5, 10, 0x8a5a34, 2.5); this.onEvent('chop', c);
      if (w.get(x + 1, y, z) === AIR && rnd() < 0.8) w.set(x + 1, y, z, SEED);
      return;
    }
    if (c.food >= 3 && c.ground) {
      c.eatCd = 3;
      const a = rnd() * 6.283, r = 3 + rnd() * 4, hx = Math.round(c.x + Math.cos(a) * r), hz = Math.round(c.z + Math.sin(a) * r), hy = w.groundY(hx, hz);
      const top = w.get(hx, hy - 1, hz);
      const nHuts = this.find(c, THATCH, 9, 30) ? 1 : 0, roll = rnd();
      const made = (top === TURF || top === SOIL) && Math.abs(hy - c.y) < 2.5 && (nHuts && roll < 0.2 ? w.well(hx, hy, hz) : nHuts && roll < 0.38 ? w.tower(hx, hy, hz) : w.hut(hx, hy, hz));
      if (made) {
        c.food = 0; c.hx = hx; c.hz = hz; this.fx.burst(hx + 0.5, hy + 1.5, hz + 0.5, 16, 0xd9b65a, 3); this.onEvent('build', c);
      }
      return;
    }
    if (c.age > 120 && (c.meal || 0) >= 2 && this.counts.villager < 2 + 3 * (this.roofs || 0) && rnd() < 0.02 && this.find(c, THATCH, 4, 6)) { c.age = 0; c.meal = 0; const k = this.spawn('villager', c.x, c.y + 0.2, c.z); if (k) { k.hx = c.hx; k.hz = c.hz; k.vid = c.vid; this.onEvent('born', k); } }
  }

  flier(c, dt, ctl, night) {
    const w = this.world, kind = c.kind, bird = kind === 'songbird' || kind === 'owl';
    let dx = 0, dy = 0, dz = 0, sp = bird ? 5 : kind === 'butterfly' ? 1.7 : kind === 'bee' ? 2.8 : 2.2;
    const sleepy = ((kind === 'butterfly' || kind === 'bee') && night > 0.6) || (kind === 'songbird' && night > 0.75) || (kind === 'owl' && night < 0.4);
    if (ctl) { dx = ctl.x; dz = ctl.z; dy = ctl.up; sp = bird ? 8 : 6; c.rest = 0; }
    else if (c.rest > 0) {
      c.rest -= dt; c.vx = c.vy = c.vz = 0;
      if (sleepy) c.rest = Math.max(c.rest, 1);
      if (bird && rnd() < dt * (kind === 'owl' ? 0.08 : 0.25) && !sleepy) this.onEvent(kind === 'owl' ? 'hoot' : 'chirp', c);
      // the perch may have gone
      if (!w.solid(Math.floor(c.x), Math.floor(c.y - 0.3), Math.floor(c.z))) c.rest = 0;
      return;
    } else {
      c.retarget -= dt;
      const tx = c.tx - c.x, ty = c.ty - c.y, tz = c.tz - c.z, dist = Math.hypot(tx, ty, tz);
      if (dist < 0.6 && c.land) {
        c.rest = bird ? 3 + rnd() * 7 : kind === 'bee' ? 1 + rnd() : 2 + rnd() * 4; c.land = false; c.retarget = 0;
        if (kind === 'bee' && rnd() < 0.35) { // pollination: a new flower nearby
          const x = Math.floor(c.x) + ri(5) - 2, z = Math.floor(c.z) + ri(5) - 2, y = w.groundY(x, z);
          if (w.get(x, y - 1, z) === TURF && w.get(x, y, z) === AIR && !w.wet(x, y, z)) w.set(x, y, z, TUFT, ri(85) * 3);
        }
        return;
      }
      if (c.retarget <= 0 || dist < 0.6) {
        c.retarget = 2 + rnd() * 4; c.land = false;
        const range = bird ? 30 : 18;
        c.tx = Math.min(W - 2, Math.max(2, c.x + (rnd() - 0.5) * range));
        c.tz = Math.min(D - 2, Math.max(2, c.z + (rnd() - 0.5) * range));
        const gy = Math.max(w.groundY(c.tx, c.tz), w.surfAt(c.tx, c.tz));
        c.ty = Math.min(H - 2, gy + (kind === 'butterfly' ? 0.8 + rnd() * 1.6 : bird ? 3 + rnd() * 6 : 1.5 + rnd() * 3.5));
        if (kind !== 'glimmer' && (sleepy || rnd() < (bird ? 0.6 : kind === 'bee' ? 0.75 : 0.3))) {
          // pick somewhere to settle: birds like treetops, butterflies like flowers
          const t = this.find(c, bird ? LEAF : TUFT, 9, 12);
          if (t && w.get(t[0], t[1] + 1, t[2]) === AIR) { c.tx = t[0] + 0.5; c.ty = t[1] + (bird ? 1.02 : 0.9); c.tz = t[2] + 0.5; c.land = kind !== 'butterfly' || sleepy; c.retarget = 8; }
          else if (sleepy && w.surfAt(c.tx, c.tz) < 0) { c.ty = w.groundY(c.tx, c.tz) + 0.05; c.land = true; c.retarget = 8; }
        }
      } else { dx = tx / dist; dy = ty / dist; dz = tz / dist; }
      const wob = kind === 'butterfly' ? 1.3 : bird ? 0.15 : kind === 'bee' ? 0.3 : 0.5;
      dx += Math.sin(c.t * 2.1) * wob; dz += Math.cos(c.t * 1.7) * wob; dy += Math.sin(c.t * (kind === 'butterfly' ? 7 : 3.3)) * wob * 0.8;
    }
    const k = Math.min(1, dt * 3);
    c.vx += (dx * sp - c.vx) * k; c.vy += (dy * sp - c.vy) * k; c.vz += (dz * sp - c.vz) * k;
    const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, nz = c.z + c.vz * dt;
    const free = (x, y, z) => { if (x < 0.5 || z < 0.5 || x > W - 0.5 || z > D - 0.5 || y < 0.3 || y > H - 0.5) return false; return !OPAQUE[w.get(Math.floor(x), Math.floor(y), Math.floor(z))] && !(w.surfAt(x, z) > y); };
    if (free(nx, c.y, c.z)) c.x = nx; else { c.vx *= -0.5; c.retarget = 0; }
    if (free(c.x, ny, c.z)) c.y = ny; else { c.vy = Math.abs(c.vy) * 0.5 + 0.5; c.retarget = 0; if (!free(c.x, c.y, c.z)) c.y += 3 * dt; }
    if (free(c.x, c.y, nz)) c.z = nz; else { c.vz *= -0.5; c.retarget = 0; }
    if (Math.hypot(c.vx, c.vz) > 0.3) c.yaw = lerpAngle(c.yaw, Math.atan2(c.vx, c.vz), Math.min(1, dt * 6));
    if (bird && c.eatCd <= 0) { // birds carry seeds about
      c.eatCd = 20 + rnd() * 30;
      const gy = w.groundY(c.x, c.z);
      if (w.get(Math.floor(c.x), gy, Math.floor(c.z)) === AIR && w.get(Math.floor(c.x), gy - 1, Math.floor(c.z)) === TURF && rnd() < 0.3) w.set(Math.floor(c.x), gy, Math.floor(c.z), SEED);
    }
  }
}
