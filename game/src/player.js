// On-foot player: third-person movement, mouse look, pistol combat.
import * as THREE from 'three';
import { TUNING } from './config.js';
import { collideCircle } from './world.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2f5a8a });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.0, 10), jacket);
  body.position.y = 0.98; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.66; head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  cap.position.y = 1.86; g.add(cap);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.55, 8),
    new THREE.MeshLambertMaterial({ color: 0x2a3a4a }));
  legs.position.y = 0.28; g.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.32, 1.08, 0.3); g.add(gun);
  return g;
}

export class Player {
  constructor(scene) {
    this.group = makePlayerMesh();
    scene.add(this.group);
    this.pos = this.group.position;
    this.yaw = 0; this.pitch = 0.08;
    this.vy = 0; this.onGround = true;
    this.health = TUNING.playerHealth;
    this.ammo = TUNING.pistolAmmo; this.reloading = 0; this.fireT = 0;
    this.raycaster = new THREE.Raycaster();
    this._tmp = new THREE.Vector3();
  }
  reset(x, z, yaw = 0) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.pitch = 0.08;
    this.vy = 0; this.health = TUNING.playerHealth; this.ammo = TUNING.pistolAmmo; this.reloading = 0;
    this.group.rotation.y = yaw;
  }
  update(dt, input, ctx) {
    const { camera, colliders } = ctx;
    const m = input.consumeMouse();
    this.yaw -= m.dx * 0.0028;
    this.pitch = Math.max(-0.15, Math.min(0.5, this.pitch + m.dy * 0.0022));
    const ax = input.axis();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? TUNING.sprintSpeed : TUNING.walkSpeed;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // WASD relative to camera yaw: forward is away from the camera
    const fx = -sin, fz = -cos, rx = -cos, rz = sin;
    let mx = fx * ax.y + rx * ax.x, mz = fz * ax.y + rz * ax.x;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) { mx /= ml; mz /= ml; }
    const p = { x: this.pos.x + mx * speed * dt, z: this.pos.z + mz * speed * dt };
    // clamp to the city + harbor beach
    p.x = Math.max(-196, Math.min(232, p.x));
    p.z = Math.max(-196, Math.min(196, p.z));
    collideCircle(p, TUNING.playerRadius, colliders);
    this.pos.x = p.x; this.pos.z = p.z;
    // jump + gravity
    if (input.wasPressed('Space') && this.onGround) { this.vy = TUNING.jumpVel; this.onGround = false; }
    this.vy -= TUNING.gravity * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    this.group.rotation.y = this.yaw + Math.PI; // mesh faces away from camera
    // reload / fire timers
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = TUNING.pistolAmmo;
    }
    this.fireT -= dt;
    if (input.wasPressed('KeyR') && this.ammo < TUNING.pistolAmmo && this.reloading <= 0) {
      this.reloading = TUNING.reloadTime; if (ctx.onReload) ctx.onReload();
    }
    if (input.wasPressed('Mouse0') && this.reloading <= 0 && this.fireT <= 0) this.shoot(ctx);
    // third-person camera: look at an aim point ahead of the player, not at the
    // player's head — otherwise the crosshair ray always dives into the ground
    // a few meters out and distant targets can never be hit
    const dist = 6.2, height = 2.4 + this.pitch * 5;
    const cx = this.pos.x + Math.sin(this.yaw) * dist;
    const cz = this.pos.z + Math.cos(this.yaw) * dist;
    const cp = { x: cx, z: cz };
    collideCircle(cp, 0.5, colliders);
    camera.position.set(cp.x, Math.max(0.6, this.pos.y + height), cp.z);
    const ax2 = -Math.sin(this.yaw), az2 = -Math.cos(this.yaw);
    camera.lookAt(this.pos.x + ax2 * 12, this.pos.y + 1.4, this.pos.z + az2 * 12);
    return { moving: ml > 0.01, sprint };
  }
  shoot(ctx) {
    if (this.ammo <= 0) { this.reloading = TUNING.reloadTime; if (ctx.onReload) ctx.onReload(); return; }
    this.ammo--; this.fireT = TUNING.fireInterval;
    this.pitch = Math.min(0.5, this.pitch + 0.02); // recoil kick
    const { camera, shootables } = ctx;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    this.raycaster.far = TUNING.pistolRange;
    // the center ray starts behind the player's own head — exclude the player
    // mesh or every shot hits Dario instead of the target
    const hits = this.raycaster.intersectObjects(shootables.filter((o) => o !== this.group), true);
    let end = null, hitObj = null;
    if (hits.length) { end = hits[0].point; hitObj = hits[0].object; }
    else end = this.raycaster.ray.at(TUNING.pistolRange, new THREE.Vector3());
    const muzzle = this._tmp.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
    if (ctx.onShoot) ctx.onShoot(muzzle.clone(), end, hitObj);
  }
}
