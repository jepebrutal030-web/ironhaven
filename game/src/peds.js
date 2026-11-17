// Pedestrians and hostile gang members. One job: people on the sidewalks.
// One merged mesh per person — 1 draw call instead of 3-5.
import { BLOCK_CENTERS, CITY, TUNING } from './config.js';
import { isOnRoad, collideCircle } from './world.js';
import { box, cyl, sph, vcMesh } from './geo.js';

const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];
const SHIRTS = [0xd42a1e, 0x2f7a4a, 0x2f5a8a, 0xd4a01e, 0x8a4a6a, 0xe8e0d0, 0x3a3a3a, 0x7a5a9a];
const PANTS = [0x2a3a4a, 0x3a3a3a, 0x5a4a3a, 0x6a7a8a];

export function makePedMesh(shirt, skin, hostile = false) {
  const parts = [];
  parts.push(cyl(0.32, 0.38, 0.95, 10, 0, 0.95, 0, hostile ? 0x3a1a1a : shirt));
  parts.push(sph(0.27, 12, 10, 0, 1.62, 0, skin));
  parts.push(cyl(0.3, 0.34, 0.55, 8, 0, 0.28, 0, PANTS[Math.floor(Math.random() * PANTS.length)]));
  if (hostile) {
    parts.push(cyl(0.29, 0.29, 0.12, 12, 0, 1.62, 0, 0xd42a1e));
    parts.push(box(0.08, 0.08, 0.5, 0.3, 1.05, 0.3, 0x111111));
  }
  return vcMesh(parts);
}

function sidewalkPoint(rng) {
  // a point on a block's sidewalk ring (perimeter, 2 units out from the block edge)
  const bi = rng.int(0, 6), bj = rng.int(0, 6);
  const cx = BLOCK_CENTERS[bi], cz = BLOCK_CENTERS[bj];
  const side = rng.int(0, 3);
  const t = rng.range(-19, 19);
  if (side === 0) return { x: cx + t, z: cz - 22 };
  if (side === 1) return { x: cx + t, z: cz + 22 };
  if (side === 2) return { x: cx - 22, z: cz + t };
  return { x: cx + 22, z: cz + t };
}

export class PedSystem {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.peds = []; this.hostiles = [];
    this.onPedDown = null; // (ped, byPlayerCar) => void
    this.onHostileShot = null; // (fromPos, hit) => void
    for (let i = 0; i < TUNING.pedCount; i++) this.spawnPed();
  }
  spawnPed() {
    const p = sidewalkPoint(this.rng);
    const mesh = makePedMesh(this.rng.pick(SHIRTS), this.rng.pick(SKINS));
    mesh.position.set(p.x, 0, p.z);
    this.scene.add(mesh);
    const ped = { group: mesh, state: 'walk', speed: this.rng.range(1.1, 2.1), target: sidewalkPoint(this.rng), fallT: 0, health: 100, isHostile: false };
    mesh.userData = { kind: 'ped', ref: ped };
    this.peds.push(ped);
    return ped;
  }
  spawnHostile(x, z, name) {
    const mesh = makePedMesh(0x3a1a1a, this.rng.pick(SKINS), true);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const h = { group: mesh, state: 'hostile', speed: 2.6, target: null, fallT: 0, health: 100, isHostile: true, shootT: this.rng.range(0.5, 1.5), name: name || 'Vulture' };
    mesh.userData = { kind: 'hostile', ref: h };
    this.hostiles.push(h);
    return h;
  }
  fleeFrom(x, z, radius = 40) {
    for (const p of this.peds) {
      if (p.state === 'fallen') continue;
      const dx = p.group.position.x - x, dz = p.group.position.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        p.state = 'flee';
        const d = Math.hypot(dx, dz) || 1;
        p.target = { x: p.group.position.x + (dx / d) * 30, z: p.group.position.z + (dz / d) * 30 };
      }
    }
  }
  damage(ped, dmg) {
    if (ped.state === 'fallen') return;
    ped.health -= dmg;
    if (ped.health <= 0) this.fall(ped);
  }
  fall(ped) {
    ped.state = 'fallen'; ped.fallT = 0;
    ped.group.rotation.x = Math.PI / 2; ped.group.position.y = 0.35;
  }
  update(dt, ctx) {
    const { playerPos, cars, colliders } = ctx;
    // walkers
    for (const p of this.peds) {
      if (p.state === 'fallen') {
        p.fallT += dt;
        if (p.fallT > 5) { // fade + respawn elsewhere
          this.scene.remove(p.group);
          const i = this.peds.indexOf(p); if (i >= 0) this.peds.splice(i, 1);
          this.spawnPed();
        }
        continue;
      }
      const pos = p.group.position;
      const dx = p.target.x - pos.x, dz = p.target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) {
        if (p.state === 'flee') { p.state = 'walk'; p.target = sidewalkPoint(this.rng); }
        else p.target = sidewalkPoint(this.rng);
        continue;
      }
      const sp = p.state === 'flee' ? 4.6 : p.speed;
      const nx = pos.x + (dx / d) * sp * dt, nz = pos.z + (dz / d) * sp * dt;
      const pp = { x: nx, z: nz };
      collideCircle(pp, 0.5, colliders);
      pos.x = pp.x; pos.z = pp.z;
      p.group.rotation.y = Math.atan2(dx, dz);
      // hit by a car?
      for (const c of cars) {
        if (c.dead || Math.abs(c.speed) < 4) continue;
        const cdx = pos.x - c.group.position.x, cdz = pos.z - c.group.position.z;
        if (cdx * cdx + cdz * cdz < 1.7 * 1.7) {
          this.fall(p);
          if (this.onPedDown) this.onPedDown(p, c.isPlayer);
          break;
        }
      }
    }
    // hostiles: advance on the player and shoot
    for (const h of this.hostiles) {
      if (h.state === 'fallen') { h.fallT += dt; continue; }
      const pos = h.group.position;
      const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 6) {
        const pp = { x: pos.x + (dx / d) * h.speed * dt, z: pos.z + (dz / d) * h.speed * dt };
        collideCircle(pp, 0.5, colliders);
        pos.x = pp.x; pos.z = pp.z;
      }
      h.group.rotation.y = Math.atan2(dx, dz);
      h.shootT -= dt;
      if (h.shootT <= 0 && d < 42) {
        h.shootT = this.rng.range(0.9, 1.5);
        const hitChance = Math.max(0.06, 0.22 - d * 0.003);
        const hit = this.rng.next() < hitChance;
        if (this.onHostileShot) this.onHostileShot(pos.clone(), hit);
      }
    }
  }
}
