// A small pooled particle system (splashes, steam, embers, crumbs).
import * as THREE from 'three';

const MAX = 700;

export class Fx {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3).fill(-999);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(32, 20, 32), 200);
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, 7); g.fill();
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, alphaTest: 0.4, toneMapped: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, color, life, grav = 1) {
    const i = this.next; this.next = (i + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.tmp.set(color);
    this.col[i * 3] = this.tmp.r; this.col[i * 3 + 1] = this.tmp.g; this.col[i * 3 + 2] = this.tmp.b;
    this.life[i] = life; this.grav[i] = grav;
  }

  burst(x, y, z, n, color, speed = 2, grav = 1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, u = Math.random();
      this.emit(x, y, z, Math.cos(a) * speed * u, speed * (0.4 + Math.random()), Math.sin(a) * speed * u, color, 0.4 + Math.random() * 0.5, grav);
    }
  }

  update(dt) {
    const { pos, vel, life, grav } = this;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
      vel[i * 3 + 1] -= 14 * grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
