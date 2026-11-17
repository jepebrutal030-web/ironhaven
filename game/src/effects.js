// Visual effects: tracers, particle bursts, explosions, smoke. No assets.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
    this.flash = new THREE.PointLight(0xffc860, 0, 30);
    this.scene.add(this.flash);
    this.flashT = 0;
    this.shake = 0;
    // shared particle geometry: one Points cloud, 600 slots
    const N = 600;
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0.95, sizeAttenuation: true });
    this.points = new THREE.Points(this.pGeo, this.pMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.parts = []; // {i, vx, vy, vz, life, maxLife, grav}
    this.free = [...Array(N).keys()];
  }
  tracer(from, to, color = 0xffe9a0) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, t: 0.09 });
  }
  burst(pos, color, count, speed, life, grav = 6, up = 4) {
    for (let i = 0; i < count; i++) {
      const idx = this.free.pop();
      if (idx === undefined) return;
      this.pPos[idx * 3] = pos.x; this.pPos[idx * 3 + 1] = pos.y; this.pPos[idx * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ i: idx, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + up, vz: Math.sin(a) * Math.cos(e) * s, life, maxLife: life, grav, color });
    }
    this.pMat.color.set(color);
  }
  explosion(pos) {
    this.burst(pos, 0xff7a2a, 60, 14, 0.9, 8, 6);
    this.burst(pos, 0x3a3a3a, 30, 6, 1.6, -2, 5);
    this.flash.position.copy(pos); this.flash.position.y += 2;
    this.flash.intensity = 60; this.flashT = 0.25;
    this.shake = Math.max(this.shake, 0.6);
  }
  smokePuff(pos) {
    this.burst(pos, 0x555555, 3, 1.5, 1.4, -1.5, 2.5);
  }
  muzzle(pos) {
    this.burst(pos, 0xffe9a0, 4, 4, 0.12, 0, 0);
  }
  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      t.line.material.opacity = Math.max(0, t.t / 0.09);
      if (t.t <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pPos[p.i * 3 + 1] = -100;
        this.free.push(p.i); this.parts.splice(i, 1); continue;
      }
      p.vy -= p.grav * dt;
      this.pPos[p.i * 3] += p.vx * dt;
      this.pPos[p.i * 3 + 1] += p.vy * dt;
      this.pPos[p.i * 3 + 2] += p.vz * dt;
      if (this.pPos[p.i * 3 + 1] < 0.05) { this.pPos[p.i * 3 + 1] = 0.05; p.vy *= -0.3; }
    }
    this.pGeo.attributes.position.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; this.flash.intensity = Math.max(0, this.flashT / 0.25) * 60; }
    else this.flash.intensity = 0;
    this.shake = Math.max(0, this.shake - dt * 1.4);
  }
  shakeOffset() {
    if (this.shake <= 0) return { x: 0, y: 0 };
    const s = this.shake * 0.35;
    return { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
  }
}
