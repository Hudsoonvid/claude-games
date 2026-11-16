// Shader work: sky dome, simulated-water surface, material patches (underwater light, grass,
// lava), drifting motes and the post-processing chain.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { W, D, WW, WH, WR } from './world.js';

// uniforms shared by every patched material
export const U = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uCaustic: { value: 1 },
  uSky: { value: new THREE.Color(0x9fd0f0) },
  uSkyTop: { value: new THREE.Color() }, uSkyBot: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
  uAmb: { value: 1 },
  uUnder: { value: 0 },
  uWater: { value: null },                    // rgba float: surface height, depth, flow x, flow z
  uWorld: { value: new THREE.Vector2(64, 64) },
  uTexel: { value: new THREE.Vector2(1 / 128, 1 / 128) },
  uDetail: { value: 1 },
};

const NOISE = /* glsl */ `
  float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float h31(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+17.1; a*=.5; } return s; }
  float fbm2(vec2 p){ return .65*vn(p) + .35*vn(p*2.07+9.3); }
  float caustic(vec2 uv, float t){
    vec2 p = mod(uv*6.28318, 6.28318) - 250.0, i = p; float c = 1.0;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / .005), p.y / (cos(i.y + tt) / .005)));
    }
    c = 1.17 - pow(c / 4.0, 1.4);
    return pow(abs(c), 8.0);
  }
`;
const DECL = /* glsl */ `
  uniform float uTime, uNight, uCaustic, uUnder, uDetail; uniform vec3 uSky; uniform sampler2D uWater; uniform vec2 uWorld;
  varying vec3 vWPos; varying vec3 vWNrm;
`;
const VERT_OUT = /* glsl */ `
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normal;
`;

function patch(mat, { vertex = '', frag = {} }) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + DECL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertex + VERT_OUT);
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + DECL + NOISE);
    for (const [chunk, code] of Object.entries(frag)) {
      const before = chunk[0] === '^'; const name = `#include <${before ? chunk.slice(1) : chunk}>`;
      if (!f.includes(name)) console.warn('shader chunk missing', name);
      f = f.replace(name, before ? code + '\n' + name : name + '\n' + code);
    }
    sh.fragmentShader = f;
  };
  return mat;
}

// what the water does to anything beneath it: colour absorption with depth, caustics, a wet band at the shoreline
const SUBMERGE = /* glsl */ `
  vec4 wt = texture2D(uWater, (vWPos.xz + uWorld * 0.5) / uWorld);
  float below = wt.r - vWPos.y;
  float hasWater = smoothstep(0.0, 0.06, wt.g);
  float uw = smoothstep(0.0, 0.1, below) * hasWater;
`;

// Terrain: texel grain, underwater light, ice sheen.
export function patchSolid(mat) {
  return patch(mat, {
    frag: {
      color_fragment: /* glsl */ `
        float iceHint = step(vColor.a, 0.75);
        vec3 texel = floor((vWPos - vWNrm * 0.02) * 4.0);
        diffuseColor.rgb *= 0.93 + 0.14 * h31(texel);
        ${SUBMERGE}
        vec3 absorb = exp(-max(below, 0.0) * vec3(0.40, 0.12, 0.07));
        diffuseColor.rgb *= mix(vec3(1.0), absorb * vec3(0.8, 0.95, 1.0), uw);
        diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.45, 0.0, -below) * hasWater * (1.0 - uw); // damp shoreline
      `,
      emissivemap_fragment: /* glsl */ `
        if (uw > 0.01 && uDetail > 0.5) {
          vec2 cuv = vWPos.xz * 0.085 + vWPos.y * 0.04;
          float ca = caustic(cuv, uTime * 0.55) + 0.5 * caustic(cuv * 1.7 + 3.1, uTime * 0.4);
          totalEmissiveRadiance += diffuseColor.rgb * ca * uw * (0.9 * uCaustic + 0.08) * vec3(0.8, 1.0, 0.95)
            * (0.35 + 0.65 * clamp(vWNrm.y + 0.6, 0.0, 1.0)) * exp(-max(below, 0.0) * 0.12);
        }
        float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
        totalEmissiveRadiance += uSky * iceHint * (0.12 + 0.6 * rim);
      `,
    },
  });
}

// Lava and fire: churning, pulsing, HDR so it blooms.
export function patchGlow(mat) {
  return patch(mat, {
    frag: {
      color_fragment: /* glsl */ `
        vec2 lp = vWPos.xz * 0.55 + vWPos.y * 0.35;
        float flow = fbm(lp + vec2(uTime * 0.12, -uTime * 0.09) + fbm(lp * 1.7 - uTime * 0.1) * 1.4);
        float veins = smoothstep(0.42, 0.72, flow);
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.55, 0.2, 0.15), diffuseColor.rgb * vec3(1.5, 1.35, 1.0) + vec3(0.25, 0.1, 0.0), veins);
        diffuseColor.rgb *= 1.05 + 0.2 * sin(uTime * 2.3 + flow * 9.0);
      `,
    },
  });
}

// Grass, flowers, waterweed: lit like the ground they stand on, bending in travelling gusts,
// blossoms and weed tips glowing softly at night.
export function patchFlora(mat) {
  return patch(mat, {
    vertex: /* glsl */ `
      float swayAmt = step(0.25, color.a);
      float gust = sin(uTime * 0.9 + position.x * 0.21 + position.z * 0.13) * 0.5 + 0.5;
      float ph = position.x * 1.7 + position.z * 2.3;
      transformed.x += swayAmt * ((0.05 + 0.13 * gust) * sin(uTime * 2.1 + ph) + 0.1 * gust);
      transformed.z += swayAmt * ((0.04 + 0.09 * gust) * cos(uTime * 1.7 + ph * 1.3) + 0.05 * gust);
    `,
    frag: {
      normal_fragment_maps: /* glsl */ `
        normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      `,
      color_fragment: /* glsl */ `
        ${SUBMERGE}
        diffuseColor.rgb *= mix(vec3(1.0), exp(-max(below, 0.0) * vec3(0.3, 0.09, 0.05)), uw);
      `,
      emissivemap_fragment: /* glsl */ `
        float lum = step(0.75, vColor.a);
        float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vWPos.x * 0.8 + vWPos.z * 0.6);
        totalEmissiveRadiance += vColor.rgb * lum * uNight * 1.9 * pulse;
        totalEmissiveRadiance += vColor.rgb * smoothstep(0.2, 0.6, vColor.a) * (0.06 * (1.0 - uNight) + 0.03); // light through the blades
      `,
    },
  });
}

// ---------------------------------------------------------------- water surface
export function makeWater(renderer) {
  const linear = renderer.extensions.has('OES_texture_float_linear');
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: U,
    vertexShader: /* glsl */ `
      uniform sampler2D uWater; uniform vec2 uWorld;
      varying vec2 vUv; varying vec3 vWPos;
      void main(){
        vUv = position.xz / uWorld;
        vec3 p = vec3(position.x, texture2D(uWater, vUv).r, position.z);
        vWPos = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWPos, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uWater; uniform vec2 uWorld, uTexel; uniform float uTime, uNight, uAmb, uDetail, uUnder;
      uniform vec3 uSkyTop, uSkyBot, uSunDir, uSunCol;
      varying vec2 vUv; varying vec3 vWPos;
      ${NOISE}
      void main(){
        vec4 w = texture2D(uWater, vUv);
        float depth = w.g;
        if (depth < 0.01) discard;
        // the simulated surface's own slope
        float hx = texture2D(uWater, vUv + vec2(uTexel.x, 0.)).r - texture2D(uWater, vUv - vec2(uTexel.x, 0.)).r;
        float hz = texture2D(uWater, vUv + vec2(0., uTexel.y)).r - texture2D(uWater, vUv - vec2(0., uTexel.y)).r;
        vec3 n = vec3(-hx, 1.0, -hz);
        float speed = length(w.ba);
        // wind ripples on top, stronger where the water is moving, calmer in the shallows
        vec2 wp = vWPos.xz;
        float calm = smoothstep(0.02, 0.5, depth);
        if (uDetail > 0.5) {
          vec2 a = wp * 0.75 + vec2(uTime * 0.33, uTime * 0.21) - w.ba * 0.12;
          vec2 b = wp * 1.9 - vec2(uTime * 0.27, -uTime * 0.36);
          float e = 0.12;
          float n0 = fbm2(a) + 0.5 * fbm2(b);
          float nx = fbm2(a + vec2(e, 0.)) + 0.5 * fbm2(b + vec2(e, 0.));
          float nz = fbm2(a + vec2(0., e)) + 0.5 * fbm2(b + vec2(0., e));
          n.xz += vec2(n0 - nx, n0 - nz) * (0.9 + min(speed, 3.0) * 0.5) * (0.35 + 0.65 * calm);
        }
        n = normalize(n);
        vec3 V = normalize(cameraPosition - vWPos);
        if (V.y < 0.0) n = -n;                       // seen from below
        float ndv = max(dot(n, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, n);
        vec3 refl = mix(uSkyBot, uSkyTop, smoothstep(-0.15, 0.7, R.y));
        refl += uSunCol * (pow(max(dot(R, uSunDir), 0.0), 500.0) * 9.0 + pow(max(dot(R, uSunDir), 0.0), 40.0) * 0.25) * (1.0 - uNight * 0.6);
        // the water's own body colour, deeper = bluer
        float thick = 1.0 - exp(-depth * 0.5);
        vec3 body = mix(vec3(0.16, 0.62, 0.66), vec3(0.03, 0.2, 0.42), thick);
        body *= uAmb * 0.55 + uSunCol * max(dot(n, uSunDir), 0.0) * 0.45;
        body += vec3(0.03, 0.35, 0.42) * uNight * smoothstep(0.62, 0.9, fbm2(wp * 0.6 + uTime * 0.05)) * 0.35;
        vec3 col = mix(body, refl, fres);
        float alpha = mix(1.0 - exp(-depth * 0.75), 1.0, fres);
        alpha = clamp(alpha, 0.0, 0.94) * smoothstep(0.01, 0.1, depth);
        // foam: at the shoreline, in fast water, and where it tumbles over an edge
        float fn = fbm2(wp * 2.6 + vec2(uTime * 0.15, -uTime * 0.1) - w.ba * 0.3);
        float shore = smoothstep(0.3, 0.06, depth) * smoothstep(0.55, 0.72, fn + 0.1 * sin(uTime * 1.3 + wp.x + wp.y)) * (1.0 - smoothstep(0.5, 2.0, speed));
        float rapid = smoothstep(3.0, 8.0, speed) * smoothstep(0.45, 0.7, fn);
        float fall = smoothstep(0.7, 0.35, n.y) * smoothstep(0.4, 0.65, fn + 0.15);
        float foam = clamp(shore * 0.6 + rapid * 0.8 + fall * 0.7, 0.0, 1.0) * smoothstep(0.03, 0.16, depth);
        col = mix(col, vec3(0.95, 0.98, 1.0) * (uAmb * 0.6 + uSunCol * 0.5), foam);
        alpha = max(alpha, foam * 0.9);
        if (V.y < 0.0) { col = mix(col, vec3(0.35, 0.75, 0.85) * uAmb, 0.5); alpha = 0.75; }
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3;
  let data = null, tex = null;

  // (re)build the grid and texture for the current world size
  function rebuild() {
    const nx = WW + 1, nz = WH + 1, pos = new Float32Array(nx * nz * 3), idx = new Uint32Array(WW * WH * 6);
    for (let z = 0, p = 0; z < nz; z++) for (let x = 0; x < nx; x++) { pos[p++] = x / WR; pos[p++] = 0; pos[p++] = z / WR; }
    for (let z = 0, q = 0; z < WH; z++) for (let x = 0; x < WW; x++) {
      const a = x + z * nx, b = a + 1, c = a + nx, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    mesh.geometry = g;
    if (tex) tex.dispose();
    data = new Float32Array(WW * WH * 4);
    tex = new THREE.DataTexture(data, WW, WH, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    U.uWater.value = tex; U.uWorld.value.set(W, D); U.uTexel.value.set(1 / WW, 1 / WH);
  }

  // copy the simulation state into the texture
  function update(world) {
    const { wd, wb, fl, fr, ft, fb } = world;
    for (let z = 0, i = 0, o = 0; z < WH; z++) for (let x = 0; x < WW; x++, i++, o += 4) {
      const d = wd[i];
      if (d > 0.01) {
        data[o] = wb[i] + d; data[o + 1] = d;
        const inv = 1 / Math.max(d, 0.25);
        data[o + 2] = (fr[i] - fl[i]) * inv; data[o + 3] = (fb[i] - ft[i]) * inv;
      } else {
        // dry: sit level with wet neighbours when the bank is higher (so the sheet meets the shore flat),
        // or on the ground when it is lower (so water spilling over an edge slopes down to it)
        let s = -1e9;
        if (x > 0 && wd[i - 1] > 0.01) s = Math.max(s, wb[i - 1] + wd[i - 1]);
        if (x < WW - 1 && wd[i + 1] > 0.01) s = Math.max(s, wb[i + 1] + wd[i + 1]);
        if (z > 0 && wd[i - WW] > 0.01) s = Math.max(s, wb[i - WW] + wd[i - WW]);
        if (z < WH - 1 && wd[i + WW] > 0.01) s = Math.max(s, wb[i + WW] + wd[i + WW]);
        data[o] = s > -1e8 ? Math.min(s, wb[i]) : wb[i] - 0.3;
        data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 0;
      }
    }
    tex.needsUpdate = true;
  }
  return { mesh, rebuild, update };
}

// ---------------------------------------------------------------- sky
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: U.uSkyTop, uBot: U.uSkyBot, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uMoonDir: { value: new THREE.Vector3(-0.35, 0.87, -0.26).normalize() },
      uTime: U.uTime, uNight: U.uNight,
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uBot, uSunDir, uSunCol, uMoonDir; uniform float uTime, uNight; varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(uBot, uTop, smoothstep(-0.75, 0.6, d.y));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunCol * (pow(sd, 900.0) * 14.0 + pow(sd, 40.0) * 0.35 + pow(sd, 5.0) * 0.12) * (1.0 - uNight);
        float md = max(dot(d, uMoonDir), 0.0);
        col += vec3(0.75, 0.85, 1.0) * (smoothstep(0.9992, 0.9996, md) * 2.2 + pow(md, 60.0) * 0.18) * uNight;
        vec3 sp = d * 140.0; vec3 cell = floor(sp);
        float st = h31(cell); float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0);
        col += vec3(0.9, 0.95, 1.0) * step(0.9988, st) * smoothstep(0.32, 0.05, length(fract(sp) - 0.5)) * uNight * tw * 2.2 * smoothstep(0.0, 0.25, d.y);
        vec2 cp = d.xz / (d.y + 0.35) * 1.6 + vec2(uTime * 0.008, uTime * 0.004);
        float cl = smoothstep(0.52, 0.85, fbm(cp + fbm(cp * 2.0) * 0.6)) * smoothstep(0.02, 0.3, d.y);
        vec3 cc = mix(vec3(1.0, 0.98, 0.95) + uSunCol * 0.15, vec3(0.12, 0.15, 0.3), uNight);
        col = mix(col, cc, cl * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 20), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- motes
export function makeMotes(count = 420) {
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: U.uTime, uNight: U.uNight, uScale: { value: 600 }, uSpan: { value: new THREE.Vector2(96, 96) } },
    vertexShader: /* glsl */ `
      attribute vec4 seed; uniform float uTime, uNight, uScale; uniform vec2 uSpan; varying float vA; varying float vS;
      void main(){
        float t = uTime * (0.015 + seed.w * 0.02);
        vec3 p = vec3((fract(seed.x + sin(t * 3.0 + seed.y * 6.28) * 0.03 + t * 0.3) - 0.5) * uSpan.x,
                      fract(seed.y + t) * 46.0 + 1.0,
                      (fract(seed.z + cos(t * 2.6 + seed.x * 6.28) * 0.03) - 0.5) * uSpan.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.5 + 0.5 * sin(uTime * (1.0 + seed.w * 2.0) + seed.x * 40.0);
        vS = seed.w; vA = tw * smoothstep(1.0, 6.0, p.y) * smoothstep(47.0, 38.0, p.y);
        gl_PointSize = (0.25 + seed.w * 0.45 + uNight * 0.25) * uScale / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight; varying float vA; varying float vS;
      void main(){
        float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
        vec3 day = vec3(1.0, 0.96, 0.85) * 0.22;
        vec3 night = mix(vec3(0.25, 1.0, 0.8), vec3(0.45, 0.6, 1.0), vS) * 1.5;
        gl_FragColor = vec4(mix(day, night, uNight) * a * a * vA, 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 4;
  return pts;
}

// ---------------------------------------------------------------- post
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: U.uTime, uNight: U.uNight, uUnder: U.uUnder,
    uSunPos: { value: new THREE.Vector2(0.5, 1.2) }, uRays: { value: 0 }, uRayCol: { value: new THREE.Color(1, 0.9, 0.7) },
    uTilt: { value: 0 }, uFlash: { value: 0 }, uAspect: { value: 1.6 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uNight, uUnder, uRays, uTilt, uFlash, uAspect; uniform vec2 uSunPos; uniform vec3 uRayCol;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 uv = vUv;
      uv += uUnder * 0.0045 * vec2(sin(uv.y * 38.0 + uTime * 2.1), cos(uv.x * 31.0 + uTime * 1.7));
      vec2 d = uv - 0.5; float r2 = dot(d, d);
      vec2 ca = d * r2 * (0.006 + uUnder * 0.012);
      vec3 col = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      // miniature look: soften the top and bottom of the frame
      float blur = uTilt * smoothstep(0.2, 0.5, abs(d.y)) * 0.0065;
      if (blur > 0.0002) {
        vec3 acc = col; float rot = hash(uv * 517.0) * 6.283;
        for (int i = 0; i < 8; i++) {
          float a = rot + float(i) * 2.399, rr = sqrt((float(i) + 0.5) / 8.0);
          acc += texture2D(tDiffuse, uv + vec2(cos(a) / uAspect, sin(a)) * rr * blur).rgb;
        }
        col = acc / 9.0;
      }
      // light shafts: march toward the sun, gathering whatever is bright
      if (uRays > 0.001) {
        const int N = 16;
        vec2 stp = (uSunPos - uv) / float(N) * 0.85;
        vec2 p = uv + stp * hash(uv * 311.0 + uTime);
        float acc = 0.0, w = 1.0;
        for (int i = 0; i < N; i++) {
          p += stp;
          vec3 s = texture2D(tDiffuse, clamp(p, 0.0, 1.0)).rgb;
          acc += min(3.0, max(0.0, dot(s, vec3(0.3, 0.6, 0.1)) - 1.0)) * w; w *= 0.94;
        }
        col += uRayCol * acc / float(N) * uRays;
      }
      vec3 sea = col * vec3(0.32, 0.78, 0.95) + vec3(0.0, 0.035, 0.06);
      col = mix(col, mix(sea, vec3(0.02, 0.16, 0.24), r2 * 1.3), uUnder);
      // cozy grade: warm highlights, gentle teal in the night shadows
      float l = dot(col, vec3(0.3, 0.6, 0.1));
      col *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), (1.0 - uNight) * smoothstep(0.2, 0.9, l));
      col = mix(col, col * vec3(0.86, 0.98, 1.14) + vec3(0.0, 0.006, 0.014), uNight * 0.6);
      col = mix(vec3(l), col, 1.12);
      col *= 1.0 - r2 * (0.5 + uNight * 0.35);
      col += uFlash * vec3(0.9, 0.95, 1.0);
      col += (hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.0) - 0.5) * 0.012;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function makePost(renderer, scene, camera, samples = 0) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.7, 1.0);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return { composer, bloom, grade, dispose() { target.dispose(); composer.dispose?.(); bloom.dispose?.(); } };
}
