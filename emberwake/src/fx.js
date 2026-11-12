// Particles, transient effect sprites, screen shake and hit-stop.
import * as THREE from 'three';
import { quad } from './art.js';
import { ORDER } from './world.js';

class Particles {
  constructor(max, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ life: 0 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 500 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix*vec4(position,1.0);
          gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a;
          gl_FragColor = vec4(vC.rgb, vC.a * a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = ORDER.fx + (additive ? 1 : 0);
    this.cursor = 0;
  }
  spawn(o) {
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.x = o.x;
    p.y = o.y;
    p.z = o.z ?? 0.8;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.life = p.max = o.life || 1;
    p.s0 = o.size ?? 0.2;
    p.s1 = o.size1 ?? 0;
    p.r = o.color[0];
    p.g = o.color[1];
    p.b = o.color[2];
    p.a = o.alpha ?? 1;
    p.grav = o.grav || 0;
    p.drag = o.drag || 0;
    p.wob = o.wobble || 0;
    p.ph = Math.random() * 7;
    p.fadeIn = o.fadeIn || 0;
  }
  update(dt, time) {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += (p.vx + (p.wob ? Math.sin(time * 1.7 + p.ph) * p.wob : 0)) * dt;
      p.y += p.vy * dt;
      const t = 1 - p.life / p.max;
      let a = p.a * (1 - t * t);
      if (p.fadeIn) a *= Math.min(1, (p.max - p.life) / p.fadeIn);
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 4] = p.r;
      this.col[n * 4 + 1] = p.g;
      this.col[n * 4 + 2] = p.b;
      this.col[n * 4 + 3] = a;
      this.size[n] = p.s0 + (p.s1 - p.s0) * t;
      n++;
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
  clear() {
    for (const p of this.p) p.life = 0;
  }
}

const hex = (c) => {
  const k = new THREE.Color(c);
  return [k.r, k.g, k.b];
};
const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new Particles(1400, true);
    this.norm = new Particles(700, false);
    scene.add(this.add.mesh, this.norm.mesh);
    this.sprites = [];
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.freezeT = 0;
    this.offset = new THREE.Vector2();
    this.ambT = 0;
  }
  setScale(pxHeight, fovDeg) {
    const s = pxHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.add.uniforms.uScale.value = s;
    this.norm.uniforms.uScale.value = s;
  }
  shake(amt, t = 0.25) {
    if (amt >= this.shakeAmt || this.shakeT <= 0) {
      this.shakeAmt = amt;
      this.shakeT = t;
      this.shakeDur = t;
    }
  }
  freeze(t) {
    this.freezeT = Math.max(this.freezeT, t);
  }
  clear() {
    this.add.clear();
    this.norm.clear();
    for (const s of this.sprites) {
      (s.parent || this.scene).remove(s.mesh);
      s.mesh.material.dispose();
    }
    this.sprites.length = 0;
  }

  // A textured quad that animates and removes itself.
  sprite(tex, o) {
    const m = quad(tex, o.w, o.h, { add: o.add !== false, tint: o.tint ?? 0xffffff, alpha: o.alpha ?? 1, order: ORDER.fx + 2 });
    m.position.set(o.x, o.y, o.z ?? 0.9);
    m.rotation.z = o.rot || 0;
    if (o.flipX) m.scale.x *= -1;
    if (o.flipY) m.scale.y *= -1;
    const parent = o.parent || this.scene;
    parent.add(m);
    this.sprites.push({ mesh: m, parent: o.parent, life: o.life, max: o.life, sx: m.scale.x, sy: m.scale.y, grow: o.grow ?? 0.2, a: o.alpha ?? 1, vx: o.vx || 0, vy: o.vy || 0, spin: o.spin || 0 });
    return m;
  }

  burst(x, y, n, o = {}) {
    const col = hex(o.color || '#ffd08a');
    const sys = o.normal ? this.norm : this.add;
    for (let i = 0; i < n; i++) {
      const a = o.angle !== undefined ? o.angle + rnd(-1, 1) * (o.spread ?? 0.6) : rnd(0, Math.PI * 2);
      const sp = rnd(o.speed0 ?? 2, o.speed ?? 8);
      sys.spawn({
        x: x + rnd(-1, 1) * (o.r || 0.1), y: y + rnd(-1, 1) * (o.r || 0.1),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rnd(0.25, 1) * (o.life || 0.6), size: rnd(0.5, 1) * (o.size || 0.22), size1: o.size1 ?? 0,
        color: col, alpha: o.alpha ?? 1, grav: o.grav ?? 10, drag: o.drag ?? 2,
      });
    }
  }
  dust(x, y, n = 5, dir = 0) {
    for (let i = 0; i < n; i++) {
      this.norm.spawn({
        x: x + rnd(-0.2, 0.2), y: y + rnd(0, 0.15), vx: rnd(-1.5, 1.5) + dir * 2, vy: rnd(0.2, 1.6),
        life: rnd(0.3, 0.7), size: rnd(0.25, 0.4), size1: 0.9, color: [0.55, 0.6, 0.72], alpha: 0.22, drag: 3,
      });
    }
  }
  ring(x, y, color = '#ffffff', n = 26, speed = 9) {
    const col = hex(color);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.add.spawn({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.5, size: 0.3, size1: 0.05, color: col, drag: 3.5 });
    }
  }
  trail(x, y, color, size = 0.5, life = 0.35, alpha = 0.6) {
    this.add.spawn({ x: x + rnd(-0.1, 0.1), y: y + rnd(-0.1, 0.1), vx: rnd(-0.4, 0.4), vy: rnd(-0.2, 0.6), life, size, size1: 0, color: hex(color), alpha });
  }
  // converge particles onto a point (used for focusing / pickups)
  gather(x, y, color, n = 2, radius = 2.2) {
    const col = hex(color);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 7);
      const r = rnd(radius * 0.6, radius);
      const life = rnd(0.3, 0.5);
      this.add.spawn({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: (-Math.cos(a) * r) / life, vy: (-Math.sin(a) * r) / life, life, size: 0.1, size1: 0.3, color: col, alpha: 0.9 });
    }
  }

  ambient(dt, kind, cx, cy, hw, hh) {
    this.ambT += dt;
    const rate = kind === 'ash' || kind === 'snow' ? 0.035 : 0.05;
    while (this.ambT > rate) {
      this.ambT -= rate;
      const x = cx + rnd(-hw, hw) * 1.2;
      const y = cy + rnd(-hh, hh) * 1.2;
      const z = rnd(-6, 3);
      if (kind === 'ash') {
        this.norm.spawn({ x, y: cy + hh * 1.2, z, vx: rnd(-0.6, 0.1), vy: rnd(-1.6, -0.6), life: rnd(6, 11), size: rnd(0.06, 0.16), size1: 0.08, color: [0.75, 0.8, 0.92], alpha: rnd(0.25, 0.6), wobble: 0.6, fadeIn: 1 });
        if (Math.random() < 0.12) this.add.spawn({ x, y, z, vx: rnd(-0.2, 0.2), vy: rnd(0.2, 0.7), life: rnd(2, 4), size: rnd(0.05, 0.1), color: [1, 0.55, 0.2], alpha: 0.9, wobble: 0.5, fadeIn: 0.6 });
      } else if (kind === 'ember') {
        this.add.spawn({ x, y: cy - hh * 1.1 + Math.random() * hh, z, vx: rnd(-0.4, 0.4), vy: rnd(0.8, 2.6), life: rnd(2.5, 5), size: rnd(0.05, 0.14), size1: 0.02, color: Math.random() < 0.3 ? [1, 0.85, 0.4] : [1, 0.45, 0.15], alpha: rnd(0.5, 1), wobble: 0.9, fadeIn: 0.5 });
      } else if (kind === 'snow') {
        this.norm.spawn({ x, y: cy + hh * 1.2, z, vx: rnd(-1.4, -0.3), vy: rnd(-2.2, -0.9), life: rnd(6, 10), size: rnd(0.07, 0.17), size1: 0.1, color: [0.93, 0.97, 1], alpha: rnd(0.45, 0.9), wobble: 0.8, fadeIn: 0.8 });
        if (Math.random() < 0.5) this.norm.spawn({ x: cx + rnd(-hw, hw) * 1.2, y: cy + hh * 1.2, z: rnd(-6, 3), vx: rnd(-1.4, -0.3), vy: rnd(-2.2, -0.9), life: rnd(6, 10), size: rnd(0.05, 0.12), size1: 0.08, color: [0.93, 0.97, 1], alpha: rnd(0.4, 0.8), wobble: 0.8, fadeIn: 0.8 });
      } else if (kind === 'spore') {
        this.add.spawn({ x, y, z, vx: rnd(-0.15, 0.15), vy: rnd(0.1, 0.5), life: rnd(4, 8), size: rnd(0.08, 0.22), size1: 0.05, color: [0.35, 1, 0.75], alpha: rnd(0.3, 0.8), wobble: 0.5, fadeIn: 1.2 });
      } else {
        this.add.spawn({ x, y, z, vx: rnd(-0.1, 0.1), vy: rnd(-0.3, 0.1), life: rnd(3, 7), size: rnd(0.05, 0.18), size1: 0.02, color: Math.random() < 0.5 ? [0.8, 0.7, 1] : [0.6, 0.95, 1], alpha: rnd(0.3, 0.9), wobble: 0.25, fadeIn: 1 });
      }
    }
  }

  update(dt, time) {
    this.add.update(dt, time);
    this.norm.update(dt, time);
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.life -= dt;
      const t = 1 - Math.max(0, s.life) / s.max;
      s.mesh.material.uniforms.uAlpha.value = s.a * (1 - t * t);
      const k = 1 + s.grow * t;
      s.mesh.scale.set(s.sx * k, s.sy * k, 1);
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.rotation.z += s.spin * dt;
      if (s.life <= 0) {
        (s.parent || this.scene).remove(s.mesh);
        s.mesh.material.dispose();
        this.sprites.splice(i, 1);
      }
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmt * Math.max(0, this.shakeT / this.shakeDur);
      this.offset.set(rnd(-1, 1) * k, rnd(-1, 1) * k);
    } else {
      this.offset.set(0, 0);
      this.shakeAmt = 0;
    }
  }
}
