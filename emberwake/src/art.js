// Procedural art: every texture in the game is painted at boot with Canvas2D,
// then lit and composited by small custom shaders.
import * as THREE from 'three';
import { rng } from './util.js';

export const BIOMES = {
  kiln: {
    skyTop: '#0a1124', skyBot: '#3a5180', fog: '#5673a6',
    terrDeep: '#04050b', terrMid: '#141b2e', rim: '#9db4d8', moss: '#66789a',
    accent: '#ffa24a', glow: '#a9c9ff', dark: 0.6, tint: [0.88, 0.97, 1.14], particles: 'ash',
  },
  root: {
    skyTop: '#041820', skyBot: '#125650', fog: '#2a8474',
    terrDeep: '#020909', terrMid: '#0b211e', rim: '#86e6b6', moss: '#2f9d6c',
    accent: '#7dffd0', glow: '#7dffd0', dark: 0.58, tint: [0.86, 1.1, 1.0], particles: 'spore',
  },
  vault: {
    skyTop: '#0d0a2a', skyBot: '#3b2c82', fog: '#6a56c0',
    terrDeep: '#05040f', terrMid: '#171236', rim: '#c9b4ff', moss: '#6f5cc8',
    accent: '#b9f3ff', glow: '#d9bcff', dark: 0.6, tint: [1.0, 0.93, 1.2], particles: 'mote',
  },
};

export const globalUniforms = { uTime: { value: 0 } };

export function mix(c1, c2, t) {
  const a = new THREE.Color(c1);
  const b = new THREE.Color(c2);
  return '#' + a.lerp(b, t).getHexString();
}
export function rgba(c, a) {
  const k = new THREE.Color(c);
  return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a})`;
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SPRITE_VS = /* glsl */ `
  uniform float uTime; uniform float uSway; uniform float uBase;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float k = mix(uv.y, 1.0 - uv.y, uBase);
    wp.x += sin(uTime * 1.3 + wp.x * 0.9 + wp.y * 0.6) * uSway * k * k;
    wp.x += sin(uTime * 2.9 + wp.x * 2.3) * uSway * 0.3 * k * k;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const SPRITE_FS = /* glsl */ `
  uniform sampler2D map; uniform float uFlash; uniform float uAlpha; uniform vec3 uTint;
  varying vec2 vUv;
  void main(){
    vec4 c = texture2D(map, vUv);
    c.rgb = mix(c.rgb * uTint, vec3(1.6), uFlash);
    c.a *= uAlpha;
    if (c.a < 0.004) discard;
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`;

// Textured quad material with hit-flash, tint, alpha and optional wind sway.
export function spriteMat(map, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uTime: globalUniforms.uTime,
      uFlash: o.flash || { value: 0 },
      uAlpha: { value: o.alpha ?? 1 },
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
      uSway: { value: o.sway ?? 0 },
      uBase: { value: o.hang ? 1 : 0 },
    },
    vertexShader: SPRITE_VS,
    fragmentShader: SPRITE_FS,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

const unitPlane = new THREE.PlaneGeometry(1, 1);
const bottomPlane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const topPlane = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);

// anchor: 'c' centre, 'b' bottom, 't' top
export function quad(map, w, h, o = {}) {
  const geo = o.anchor === 'b' ? bottomPlane : o.anchor === 't' ? topPlane : unitPlane;
  const m = new THREE.Mesh(geo, o.material || spriteMat(map, o));
  m.scale.set(w, h, 1);
  m.frustumCulled = !o.sway;
  if (o.order !== undefined) m.renderOrder = o.order;
  return m;
}

// ───────────────────────── soft glow / light sprites ─────────────────────────
let _glowTex;
export function glowTex() {
  if (_glowTex) return _glowTex;
  _glowTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.16)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  return _glowTex;
}
export function glow(color, size, alpha = 1) {
  return quad(glowTex(), size, size, { add: true, tint: color, alpha });
}

// ───────────────────────── terrain ─────────────────────────
const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
`;

// Terrain is one quad per room. A blurred tile mask is thresholded with noise, which
// turns the blocky collision grid into soft, hand-cut looking silhouettes with a lit rim.
export function terrainMaterial(mask, texel, biome) {
  const b = BIOMES[biome];
  return new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: mask },
      uTexel: { value: texel },
      uDeep: { value: new THREE.Color(b.terrDeep) },
      uMid: { value: new THREE.Color(b.terrMid) },
      uRim: { value: new THREE.Color(b.rim) },
      uMoss: { value: new THREE.Color(b.moss) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec2 vW;
      void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xy; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMask; uniform vec2 uTexel; uniform vec3 uDeep, uMid, uRim, uMoss;
      varying vec2 vUv; varying vec2 vW;
      ${NOISE_GLSL}
      void main(){
        float m = texture2D(uMask, vUv).r;
        float n = fbm(vW * 1.7);
        float e = m + (n - 0.5) * 0.13;
        float a = smoothstep(0.47, 0.5, e);
        if (a < 0.01) discard;
        vec2 d = uTexel * 2.5;
        float gx = texture2D(uMask, vUv + vec2(d.x, 0.0)).r - texture2D(uMask, vUv - vec2(d.x, 0.0)).r;
        float gy = texture2D(uMask, vUv + vec2(0.0, d.y)).r - texture2D(uMask, vUv - vec2(0.0, d.y)).r;
        vec2 nrm = -normalize(vec2(gx, gy) + vec2(1e-5));
        float depth = smoothstep(0.5, 0.97, e);
        float strata = fbm(vW * vec2(1.3, 4.5) + 9.0);
        vec3 col = mix(uMid, uDeep, smoothstep(0.0, 0.75, depth));
        col *= 0.75 + 0.6 * strata;
        float up = clamp(nrm.y, 0.0, 1.0);
        float side = abs(nrm.x);
        float rim = 1.0 - smoothstep(0.0, 0.42, depth);
        float thin = 1.0 - smoothstep(0.0, 0.12, depth);
        col = mix(col, uMoss * (0.45 + 0.5 * n), rim * up * 0.9);
        col += uRim * thin * (0.12 + 0.75 * up + 0.12 * side);
        col += uRim * rim * 0.05;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
}

// ───────────────────────── sky / fog backdrop ─────────────────────────
export function skyMaterial(biome) {
  const b = BIOMES[biome];
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalUniforms.uTime,
      uTop: { value: new THREE.Color(b.skyTop) },
      uBot: { value: new THREE.Color(b.skyBot) },
      uFog: { value: new THREE.Color(b.fog) },
      uOff: { value: new THREE.Vector2() },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uTop, uBot, uFog; uniform vec2 uOff; varying vec2 vUv;
      ${NOISE_GLSL}
      void main(){
        vec2 p = vUv * vec2(6.0, 3.4) + uOff;
        float f = fbm(p + vec2(uTime * 0.02, 0.0));
        float f2 = fbm(p * 2.2 - vec2(uTime * 0.035, uTime * 0.01) + 4.0);
        vec3 col = mix(uBot, uTop, smoothstep(0.0, 1.0, vUv.y + (f - 0.5) * 0.35));
        col = mix(col, uFog, smoothstep(0.35, 0.9, f * 0.7 + f2 * 0.5) * 0.55);
        // slanted shafts of light
        float s = vUv.x * 5.0 + vUv.y * 2.2 + uOff.x * 0.6;
        float shaft = smoothstep(0.55, 1.0, vnoise(vec2(s, 1.0)) ) * smoothstep(0.0, 0.9, vUv.y);
        col += uFog * shaft * 0.35 * (0.7 + 0.3 * sin(uTime * 0.4 + s));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
    depthTest: false,
  });
}

// drifting additive mist, drawn between the layers
export function mistMaterial(biome, alpha) {
  const b = BIOMES[biome];
  return new THREE.ShaderMaterial({
    uniforms: { uTime: globalUniforms.uTime, uCol: { value: new THREE.Color(b.fog) }, uAlpha: { value: alpha } },
    vertexShader: `varying vec2 vW; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xy; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha; uniform vec3 uCol; varying vec2 vW;
      ${NOISE_GLSL}
      void main(){
        float f = fbm(vW * vec2(0.09, 0.2) + vec2(uTime * 0.035, 0.0));
        float f2 = fbm(vW * vec2(0.24, 0.42) - vec2(uTime * 0.05, uTime * 0.012) + 7.0);
        float a = smoothstep(0.38, 0.85, f * 0.65 + f2 * 0.5) * uAlpha;
        gl_FragColor = vec4(uCol, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

// ───────────────────────── parallax layer painters ─────────────────────────
function taperPath(g, pts, w0, w1) {
  // pts: polyline; draws a ribbon of varying width
  const L = [];
  const R = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const t = i / (pts.length - 1);
    const w = (w0 + (w1 - w0) * t) * 0.5;
    L.push([p[0] + nx * w, p[1] + ny * w]);
    R.push([p[0] - nx * w, p[1] - ny * w]);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (const p of L) g.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
}

function curve(x0, y0, x1, y1, bend, r, n = 24) {
  const cx = (x0 + x1) / 2 + bend;
  const cy = (y0 + y1) / 2 + r.range(-0.15, 0.15) * (y1 - y0);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * x0 + 2 * u * t * cx + t * t * x1 + Math.sin(t * 9 + bend) * 0.25,
      u * u * y0 + 2 * u * t * cy + t * t * y1,
    ]);
  }
  return pts;
}

function edgeMass(g, W, H, r, top, amp, col) {
  g.fillStyle = col;
  g.beginPath();
  const y0 = top ? 0 : H;
  g.moveTo(0, y0);
  let x = 0;
  while (x <= W) {
    const d = amp * (0.35 + r() * r() * 1.4);
    g.lineTo(x, top ? d : H - d);
    x += r.range(0.6, 2.4);
    if (r() < 0.25) {
      const sp = d + amp * r.range(0.6, 2.2);
      g.lineTo(x, top ? sp : H - sp * 0.7);
      x += r.range(0.3, 0.9);
    }
  }
  g.lineTo(W, y0);
  g.closePath();
  g.fill();
}

function paintKiln(g, W, H, r, col, hi, k, b) {
  edgeMass(g, W, H, r, true, 3 + k * 2, col);
  edgeMass(g, W, H, r, false, 2.5, col);
  let x = r.range(0, 5);
  while (x < W) {
    const w = r.range(2.2, 5.5) * (1.3 - k * 0.4);
    const h = H * r.range(0.3, 0.85);
    const top = H - h;
    g.fillStyle = col;
    if (r() < 0.6) {
      // tapered chimney stack with a flared lip and bands
      g.beginPath();
      g.moveTo(x - w * 0.5, H);
      g.lineTo(x - w * 0.34, top + w * 0.3);
      g.lineTo(x - w * 0.46, top + w * 0.15);
      g.lineTo(x - w * 0.46, top);
      if (r() < 0.5) {
        g.lineTo(x - w * 0.2, top - r() * 0.6);
        g.lineTo(x + w * 0.05, top + r() * 0.8);
        g.lineTo(x + w * 0.25, top - r() * 0.5);
      }
      g.lineTo(x + w * 0.46, top);
      g.lineTo(x + w * 0.46, top + w * 0.15);
      g.lineTo(x + w * 0.34, top + w * 0.3);
      g.lineTo(x + w * 0.5, H);
      g.closePath();
      g.fill();
      g.strokeStyle = hi;
      g.lineWidth = 0.08;
      g.globalAlpha = 0.5;
      for (let y = top + w * 0.6; y < H; y += r.range(1.5, 4)) {
        g.beginPath();
        g.moveTo(x - w * 0.42, y);
        g.lineTo(x + w * 0.42, y);
        g.stroke();
      }
      g.globalAlpha = 1;
    } else {
      // beehive kiln dome with an arched mouth
      const rr = w * 1.2;
      const by = H - r.range(0, H * 0.35);
      g.beginPath();
      g.moveTo(x - rr, H);
      g.lineTo(x - rr, by);
      g.bezierCurveTo(x - rr, by - rr * 1.5, x + rr, by - rr * 1.5, x + rr, by);
      g.lineTo(x + rr, H);
      g.closePath();
      g.fill();
      g.fillRect(x - rr * 0.18, by - rr * 1.5, rr * 0.36, rr * 0.5);
      g.fillStyle = hi;
      g.globalAlpha = 0.55;
      g.beginPath();
      g.moveTo(x - rr * 0.32, by);
      g.lineTo(x - rr * 0.32, by - rr * 0.45);
      g.arc(x, by - rr * 0.45, rr * 0.32, Math.PI, 0);
      g.lineTo(x + rr * 0.32, by);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      if (k > 0.4 && r() < 0.35) {
        g.fillStyle = rgba(b.accent, 0.35);
        g.shadowColor = b.accent;
        g.shadowBlur = 30;
        g.beginPath();
        g.arc(x, by - rr * 0.3, rr * 0.12, 0, 7);
        g.fill();
        g.shadowBlur = 0;
      }
    }
    // arch bridging to the next stack
    if (r() < 0.45) {
      const span = r.range(4, 9);
      const ay = H - h * r.range(0.35, 0.7);
      g.fillStyle = col;
      g.fillRect(x, ay, span, 0.7);
      g.beginPath();
      g.moveTo(x, ay + 0.6);
      g.lineTo(x, ay + 2.4);
      g.quadraticCurveTo(x + span * 0.5, ay - 0.6, x + span, ay + 2.4);
      g.lineTo(x + span, ay + 0.6);
      g.closePath();
      g.fill();
    }
    x += w + r.range(2, 9);
  }
  // hanging chains
  g.strokeStyle = col;
  g.lineWidth = 0.14;
  g.setLineDash([0.3, 0.16]);
  for (let i = 0; i < W / 7; i++) {
    const cx = r() * W;
    const len = r.range(4, H * 0.55);
    g.beginPath();
    g.moveTo(cx, 0);
    g.lineTo(cx + r.range(-0.4, 0.4), len);
    g.stroke();
    g.fillStyle = col;
    g.fillRect(cx - 0.35, len, 0.7, 0.9);
  }
  g.setLineDash([]);
}

function paintRoot(g, W, H, r, col, hi, k, b) {
  edgeMass(g, W, H, r, true, 4, col);
  edgeMass(g, W, H, r, false, 3, col);
  const n = Math.round(W / (7 - k * 2));
  for (let i = 0; i < n; i++) {
    const x0 = r() * W;
    const x1 = x0 + r.range(-12, 12);
    const pts = curve(x0, -1, x1, H + 1, r.range(-9, 9), r, 30);
    g.fillStyle = col;
    taperPath(g, pts, r.range(1.4, 4.2) * (1.4 - k * 0.5), r.range(0.5, 2));
    g.fill();
    // highlight edge
    g.strokeStyle = hi;
    g.globalAlpha = 0.35;
    g.lineWidth = 0.12;
    g.beginPath();
    pts.forEach((p, j) => (j ? g.lineTo(p[0] - 0.4, p[1]) : g.moveTo(p[0] - 0.4, p[1])));
    g.stroke();
    g.globalAlpha = 1;
    // rootlets
    for (let j = 0; j < 5; j++) {
      const p = pts[r.int(3, pts.length - 4)];
      const rl = curve(p[0], p[1], p[0] + r.range(-5, 5), p[1] + r.range(2, 9), r.range(-2, 2), r, 10);
      g.fillStyle = col;
      taperPath(g, rl, r.range(0.25, 0.6), 0.04);
      g.fill();
      if (r() < 0.5) {
        const e = rl[rl.length - 1];
        g.fillStyle = rgba(b.accent, 0.55 + k * 0.4);
        g.shadowColor = b.accent;
        g.shadowBlur = 18 + k * 20;
        g.beginPath();
        g.ellipse(e[0], e[1] + 0.3, 0.22 + k * 0.1, 0.36 + k * 0.14, 0, 0, 7);
        g.fill();
        g.shadowBlur = 0;
      }
    }
  }
}

function shard(g, x, y, ang, len, w, col, hi) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-w / 2, 0);
  g.lineTo(-w / 2, -len * 0.78);
  g.lineTo(0, -len);
  g.lineTo(w / 2, -len * 0.78);
  g.lineTo(w / 2, 0);
  g.closePath();
  g.fill();
  g.fillStyle = hi;
  g.beginPath();
  g.moveTo(-w / 2, 0);
  g.lineTo(-w / 2, -len * 0.78);
  g.lineTo(0, -len);
  g.lineTo(-w * 0.08, 0);
  g.closePath();
  g.fill();
  g.restore();
}

function paintVault(g, W, H, r, col, hi, k, b) {
  edgeMass(g, W, H, r, true, 3.5, col);
  edgeMass(g, W, H, r, false, 3, col);
  // tall glass arches
  for (let x = r.range(0, 8); x < W; x += r.range(9, 18)) {
    const w = r.range(4, 7);
    const h = H * r.range(0.45, 0.9);
    g.strokeStyle = col;
    g.lineWidth = 0.7 + (1 - k) * 0.5;
    g.beginPath();
    g.moveTo(x - w / 2, H);
    g.lineTo(x - w / 2, H - h + w * 0.8);
    g.quadraticCurveTo(x - w / 2, H - h, x, H - h - w * 0.4);
    g.quadraticCurveTo(x + w / 2, H - h, x + w / 2, H - h + w * 0.8);
    g.lineTo(x + w / 2, H);
    g.stroke();
    g.lineWidth = 0.2;
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x, H - h - w * 0.4);
    for (let y = H - h + w; y < H; y += 3) {
      g.moveTo(x - w / 2, y);
      g.lineTo(x + w / 2, y);
    }
    g.stroke();
  }
  const n = Math.round(W / 4);
  for (let i = 0; i < n; i++) {
    const top = r() < 0.4;
    const cx = r() * W;
    const cy = top ? r.range(0, 4) : H - r.range(0, 5);
    const m = r.int(3, 7);
    const s = r.range(0.7, 1.9) * (1.5 - k * 0.5);
    if (k > 0.3) {
      g.shadowColor = b.glow;
      g.shadowBlur = 24 * k;
    }
    for (let j = 0; j < m; j++) {
      const a = (top ? Math.PI : 0) + r.range(-0.75, 0.75);
      shard(g, cx + r.range(-1, 1), cy, a, r.range(2, 7) * s, r.range(0.5, 1.2) * s, col, hi);
    }
    g.shadowBlur = 0;
  }
}

const PAINTERS = { kiln: paintKiln, root: paintRoot, vault: paintVault };

// Paints one parallax layer sized to a room. k: 0 (far) → 1 (near).
export function paintLayer(biome, Wu, Hu, k, seed) {
  const b = BIOMES[biome];
  const ppu = Math.min([11, 15, 20][Math.round(k * 2)], 4096 / Wu, 4096 / Hu);
  const r = rng(seed);
  return canvasTex(Math.ceil(Wu * ppu), Math.ceil(Hu * ppu), (g) => {
    g.scale(ppu, ppu);
    const col = mix(b.fog, b.terrMid, 0.22 + k * 0.62);
    const hi = mix(b.fog, b.rim, 0.3 + k * 0.25);
    PAINTERS[biome](g, Wu, Hu, r, col, hi, k, b);
    // atmospheric perspective: silhouettes dissolve into mist toward the bottom
    g.globalCompositeOperation = 'source-atop';
    const hz = g.createLinearGradient(0, 0, 0, Hu);
    hz.addColorStop(0, rgba(b.skyTop, 0.35));
    hz.addColorStop(0.45, rgba(b.fog, 0));
    hz.addColorStop(1, rgba(b.fog, 0.6 - k * 0.25));
    g.fillStyle = hz;
    g.fillRect(0, 0, Wu, Hu);
    g.globalCompositeOperation = 'source-over';
  });
}

// ───────────────────────── decor sprites ─────────────────────────
const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function blade(g, x, y, len, lean, w, col) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x - w, y);
  g.quadraticCurveTo(x - w * 0.5 + lean * 0.3, y - len * 0.6, x + lean, y - len);
  g.quadraticCurveTo(x + w * 0.6 + lean * 0.3, y - len * 0.5, x + w, y);
  g.closePath();
  g.fill();
}

export function decorTex(kind, biome, v = 0) {
  const b = BIOMES[biome];
  return cached(`${kind}:${biome}:${v}`, () => {
    const r = rng(v * 977 + kind.length * 131 + biome.length * 7);
    const dark = b.terrDeep;
    const mid = mix(b.terrMid, b.moss, 0.45);
    const lit = mix(b.moss, b.rim, 0.5);
    switch (kind) {
      case 'grass':
        return canvasTex(128, 96, (g) => {
          for (let i = 0; i < 16; i++) {
            const x = r.range(12, 116);
            blade(g, x, 96, r.range(22, 86), r.range(-26, 26), r.range(2.5, 5), i % 3 === 0 ? lit : i % 3 === 1 ? mid : dark);
          }
        });
      case 'fern':
        return canvasTex(160, 160, (g) => {
          for (let i = 0; i < 6; i++) {
            const a = r.range(-1.1, 1.1);
            const len = r.range(70, 140);
            g.save();
            g.translate(80, 160);
            g.rotate(a);
            g.strokeStyle = i % 2 ? mid : dark;
            g.fillStyle = i % 2 ? lit : mid;
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(0, 0);
            g.quadraticCurveTo(a * 20, -len * 0.6, a * 34, -len);
            g.stroke();
            for (let t = 0.15; t < 1; t += 0.11) {
              const px = a * 20 * 2 * t * (1 - t) + a * 34 * t * t;
              const py = -len * 0.6 * 2 * t * (1 - t) - len * t * t;
              const s = 16 * (1 - t) + 4;
              g.beginPath();
              g.ellipse(px - s * 0.6, py, s, s * 0.28, -0.5, 0, 7);
              g.ellipse(px + s * 0.6, py, s, s * 0.28, 0.5, 0, 7);
              g.fill();
            }
            g.restore();
          }
        });
      case 'vine':
        return canvasTex(64, 320, (g) => {
          const len = r.range(170, 310);
          g.strokeStyle = dark;
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(32, 0);
          for (let y = 0; y < len; y += 8) g.lineTo(32 + Math.sin(y * 0.045 + v) * 10, y);
          g.stroke();
          for (let y = 18; y < len; y += r.range(14, 30)) {
            const x = 32 + Math.sin(y * 0.045 + v) * 10;
            g.fillStyle = r() < 0.5 ? mid : lit;
            g.beginPath();
            const s = r() < 0.5 ? -1 : 1;
            g.ellipse(x + s * 9, y + 4, 10, 4.5, s * 0.6, 0, 7);
            g.fill();
          }
          if (biome !== 'kiln') {
            const x = 32 + Math.sin(len * 0.045 + v) * 10;
            g.fillStyle = b.accent;
            g.shadowColor = b.accent;
            g.shadowBlur = 16;
            g.beginPath();
            g.ellipse(x, len, 5, 8, 0, 0, 7);
            g.fill();
          }
        });
      case 'chain':
        return canvasTex(48, 320, (g) => {
          const len = r.range(150, 300);
          g.strokeStyle = mix(dark, b.rim, 0.18);
          g.lineWidth = 3;
          for (let y = 0; y < len; y += 13) {
            g.beginPath();
            g.ellipse(24, y + 7, 4, 7.5, 0, 0, 7);
            g.stroke();
          }
          g.fillStyle = dark;
          g.beginPath();
          g.moveTo(12, len);
          g.lineTo(36, len);
          g.lineTo(30, len + 18);
          g.lineTo(18, len + 18);
          g.closePath();
          g.fill();
        });
      case 'stalactite':
        return canvasTex(96, 192, (g) => {
          g.fillStyle = dark;
          for (let i = 0; i < 4; i++) {
            const x = r.range(14, 82);
            const w = r.range(10, 22);
            const len = r.range(60, 185);
            g.beginPath();
            g.moveTo(x - w, 0);
            g.quadraticCurveTo(x - w * 0.2, len * 0.5, x + r.range(-4, 4), len);
            g.quadraticCurveTo(x + w * 0.2, len * 0.5, x + w, 0);
            g.fill();
          }
          g.fillStyle = rgba(b.rim, 0.25);
          g.fillRect(0, 0, 96, 3);
        });
      case 'rock':
        return canvasTex(128, 80, (g) => {
          for (let i = 0; i < 3; i++) {
            const x = r.range(26, 100);
            const w = r.range(18, 38);
            const h = r.range(18, 56);
            g.fillStyle = i === 2 ? mid : dark;
            g.beginPath();
            g.moveTo(x - w, 80);
            g.lineTo(x - w * 0.8, 80 - h * 0.6);
            g.lineTo(x - w * 0.2, 80 - h);
            g.lineTo(x + w * 0.5, 80 - h * 0.85);
            g.lineTo(x + w, 80 - h * 0.3);
            g.lineTo(x + w, 80);
            g.fill();
            g.strokeStyle = rgba(b.rim, 0.45);
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(x - w * 0.8, 80 - h * 0.6);
            g.lineTo(x - w * 0.2, 80 - h);
            g.lineTo(x + w * 0.5, 80 - h * 0.85);
            g.stroke();
          }
        });
      case 'shards':
        return canvasTex(128, 64, (g) => {
          for (let i = 0; i < 6; i++) {
            const x = r.range(14, 114);
            const s = r.range(8, 22);
            g.fillStyle = i % 2 ? '#3b2a26' : '#241a1b';
            g.beginPath();
            g.moveTo(x - s, 64);
            g.quadraticCurveTo(x - s * 0.8, 64 - s * 1.3, x + r.range(-3, 3), 64 - s * r.range(0.8, 1.5));
            g.lineTo(x + s * 0.4, 64 - s * 0.5);
            g.lineTo(x + s, 64);
            g.fill();
          }
        });
      case 'crystal':
        return canvasTex(160, 160, (g) => {
          g.shadowColor = b.glow;
          g.shadowBlur = 22;
          const m = r.int(3, 6);
          for (let j = 0; j < m; j++) {
            shard(g, 80 + r.range(-22, 22), 158, r.range(-0.6, 0.6), r.range(50, 132), r.range(12, 26), mix(b.moss, b.glow, 0.25), mix(b.glow, '#ffffff', 0.35));
          }
        });
      case 'pod':
        return canvasTex(96, 160, (g) => {
          g.strokeStyle = dark;
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(48, 160);
          g.quadraticCurveTo(30 + v * 12, 100, 48, 56);
          g.stroke();
          g.shadowColor = b.accent;
          g.shadowBlur = 26;
          const gr = g.createRadialGradient(48, 44, 2, 48, 44, 26);
          gr.addColorStop(0, '#ffffff');
          gr.addColorStop(0.4, b.accent);
          gr.addColorStop(1, rgba(b.moss, 0.9));
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(48, 12);
          g.bezierCurveTo(76, 30, 70, 68, 48, 72);
          g.bezierCurveTo(26, 68, 20, 30, 48, 12);
          g.fill();
        });
      case 'bricks':
        return canvasTex(160, 80, (g) => {
          for (let row = 0; row < 3; row++) {
            for (let i = 0; i < 5 - row; i++) {
              if (r() < 0.25) continue;
              g.fillStyle = r() < 0.5 ? '#1c2233' : '#141a28';
              const x = 16 + row * 14 + i * 28 + r.range(-3, 3);
              g.fillRect(x, 80 - (row + 1) * 16, 25, 14);
              g.fillStyle = rgba(b.rim, 0.3);
              g.fillRect(x, 80 - (row + 1) * 16, 25, 2);
            }
          }
        });
      case 'thorn':
        return canvasTex(128, 128, (g) => {
          // hazards share one loud look in every biome: black briars with bone-white, blood-lit tips
          g.fillStyle = '#05050a';
          g.fillRect(0, 108, 128, 20);
          const rg = g.createLinearGradient(0, 128, 0, 60);
          rg.addColorStop(0, 'rgba(255,60,90,0.5)');
          rg.addColorStop(1, 'rgba(255,60,90,0)');
          g.fillStyle = rg;
          g.fillRect(0, 60, 128, 68);
          for (let i = 0; i < 7; i++) {
            const x = 9 + i * 18.5 + r.range(-5, 5);
            const len = r.range(70, 118);
            const lean = r.range(-18, 18);
            const gr = g.createLinearGradient(0, 128, 0, 128 - len);
            gr.addColorStop(0, '#05050a');
            gr.addColorStop(0.55, '#2a1420');
            gr.addColorStop(0.85, '#ff8fa3');
            gr.addColorStop(1, '#ffffff');
            g.fillStyle = gr;
            g.shadowColor = '#ff5577';
            g.shadowBlur = 6;
            g.beginPath();
            g.moveTo(x - 10, 128);
            g.quadraticCurveTo(x - 2 + lean * 0.4, 128 - len * 0.5, x + lean, 128 - len);
            g.quadraticCurveTo(x + 4 + lean * 0.4, 128 - len * 0.5, x + 10, 128);
            g.fill();
          }
        });
      case 'plank':
        return canvasTex(128, 40, (g) => {
          const gr = g.createLinearGradient(0, 0, 0, 40);
          gr.addColorStop(0, mix(b.terrMid, b.rim, 0.5));
          gr.addColorStop(0.2, mix(b.terrMid, b.moss, 0.3));
          gr.addColorStop(1, b.terrDeep);
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(0, 4);
          g.lineTo(128, 2);
          g.lineTo(124, 22);
          g.lineTo(100, 26 + r() * 8);
          g.lineTo(64, 22);
          g.lineTo(30, 30 + r() * 8);
          g.lineTo(4, 20);
          g.closePath();
          g.fill();
          g.fillStyle = rgba(b.rim, 0.75);
          g.fillRect(0, 2, 128, 2.5);
        });
      case 'fgRock':
        return canvasTex(256, 256, (g) => {
          g.filter = 'blur(5px)';
          g.fillStyle = '#010205';
          g.beginPath();
          g.moveTo(-10, 266);
          let x = -10;
          while (x < 266) {
            g.lineTo(x, 256 - r.range(60, 210) * Math.sin(Math.max(0, Math.min(1, x / 256)) * Math.PI));
            x += r.range(14, 46);
          }
          g.lineTo(266, 266);
          g.fill();
          for (let i = 0; i < 14; i++) blade(g, r.range(30, 226), 200, r.range(60, 190), r.range(-40, 40), 5, '#010205');
        });
      case 'fgHang':
        return canvasTex(256, 384, (g) => {
          g.filter = 'blur(5px)';
          g.fillStyle = '#010205';
          for (let i = 0; i < 7; i++) {
            const x = r.range(30, 226);
            const w = r.range(10, 34);
            const len = r.range(120, 370);
            g.beginPath();
            g.moveTo(x - w, -5);
            g.quadraticCurveTo(x - w * 0.1 + r.range(-20, 20), len * 0.6, x + r.range(-30, 30), len);
            g.quadraticCurveTo(x + w * 0.3, len * 0.5, x + w, -5);
            g.fill();
          }
        });
      default:
        return glowTex();
    }
  });
}

export function rayTex() {
  return cached('ray', () =>
    canvasTex(64, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 256);
      const gx = g.createLinearGradient(0, 0, 64, 0);
      gx.addColorStop(0, 'rgba(0,0,0,1)');
      gx.addColorStop(0.5, 'rgba(0,0,0,0)');
      gx.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = gx;
      g.fillRect(0, 0, 64, 256);
    }),
  );
}
