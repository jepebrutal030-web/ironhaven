// Wanted level + IHPD response: patrol cars that chase and ram, foot cops that arrest.
import * as THREE from 'three';
import { ROADS, CAR_MODELS, TUNING } from './config.js';
import { createCar, stepCar, nearestCar } from './vehicles.js';
import { makePedMesh } from './peds.js';
import { collideCircle } from './world.js';

const POLICE_MODEL = { name: 'IHPD Interceptor', kind: 'sedan', top: 44, accel: 20, grip: 2.9, colors: [0x1a1a1a] };

export class WantedSystem {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng;
    this.wanted = 0;
    this.lastSeenT = 0;
    this.policeCars = [];
    this.footCops = [];
    this.arrestT = 0; this.boxedT = 0;
    this.onWantedChange = null;
    this.onBusted = null;
    this.onCopKilled = null;
  }
  setWanted(n, silent = false) {
    const prev = this.wanted;
    this.wanted = Math.max(0, Math.min(5, Math.round(n)));
    if (this.wanted !== prev) {
      if (!silent && this.onWantedChange) this.onWantedChange(this.wanted, prev);
      this.syncPolice();
    }
  }
  addHeat(n) { this.setWanted(this.wanted + n); }
  targetPoliceCars() { return Math.min(4, this.wanted === 0 ? 0 : 1 + Math.floor((this.wanted - 1) / 2) + (this.wanted >= 4 ? 1 : 0)); }
  targetFootCops() { return this.wanted >= 3 ? Math.min(3, this.wanted - 2) : 0; }
  syncPolice() {
    // add/remove police cars to match the wanted level
    while (this.policeCars.length < this.targetPoliceCars()) this.spawnPoliceCar();
    while (this.policeCars.length > this.targetPoliceCars()) {
      const c = this.policeCars.pop(); this.scene.remove(c.group);
    }
    while (this.footCops.length < this.targetFootCops()) this.spawnFootCop();
    while (this.footCops.length > this.targetFootCops()) {
      const c = this.footCops.pop(); this.scene.remove(c.group);
    }
  }
  spawnPoliceCar(near = null) {
    const car = createCar(POLICE_MODEL, 0x1a1a1a, 0, 0, 0, true);
    car.isPolice = true; car.isTraffic = true;
    const axis = this.rng.chance(0.5) ? 'x' : 'z';
    const line = this.rng.pick(ROADS);
    const along = this.rng.range(-180, 180);
    car.axis = axis; car.line = line; car.dir = this.rng.chance(0.5) ? 1 : -1;
    car.targetSpeed = 20 + this.wanted * 2;
    car.stopT = 0; car.stuckT = 0;
    // place on the road near the player if we know where they are
    if (near) {
      const r = this.rng.pick(ROADS);
      const a = this.rng.chance(0.5) ? 'x' : 'z';
      car.axis = a; car.line = r;
      car.dir = this.rng.chance(0.5) ? 1 : -1;
      const off = this.rng.range(55, 90) * (this.rng.chance(0.5) ? 1 : -1);
      const alongPos = a === 'x' ? Math.max(-185, Math.min(185, near.x + off)) : Math.max(-185, Math.min(185, near.z + off));
      this.placeOnRoad(car, alongPos);
    } else this.placeOnRoad(car, along);
    this.scene.add(car.group);
    this.policeCars.push(car);
    return car;
  }
  placeOnRoad(car, along) {
    const a = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.angle = a;
    const rx = Math.cos(a), rz = -Math.sin(a);
    if (car.axis === 'x') car.group.position.set(along, 0, car.line + rz * 3.5);
    else car.group.position.set(car.line + rx * 3.5, 0, along);
    car.group.rotation.y = a;
  }
  spawnFootCop(near = null) {
    const mesh = makePedMesh(0x1a2a4a, 0xe8b88a);
    const x = near ? near.x + this.rng.range(-25, 25) : this.rng.range(-150, 150);
    const z = near ? near.z + this.rng.range(-25, 25) : this.rng.range(-150, 150);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const cop = { group: mesh, speed: 5.2, arrestT: 0 };
    this.footCops.push(cop);
    return cop;
  }
  update(dt, ctx) {
    const { playerPos, playerInCar, playerCar, colliders, cars, time } = ctx;
    if (this.wanted > 0) {
      // line of sight is just distance here (city is open); hide to lose heat
      let seen = false;
      for (const c of this.policeCars) {
        const dx = c.group.position.x - playerPos.x, dz = c.group.position.z - playerPos.z;
        if (dx * dx + dz * dz < 60 * 60) { seen = true; break; }
      }
      if (!seen) for (const c of this.footCops) {
        const dx = c.group.position.x - playerPos.x, dz = c.group.position.z - playerPos.z;
        if (dx * dx + dz * dz < 40 * 40) { seen = true; break; }
      }
      if (seen) this.lastSeenT = 0;
      else {
        this.lastSeenT += dt;
        if (this.lastSeenT > TUNING.wantedDecayStep) { this.lastSeenT = 0; this.setWanted(this.wanted - 1); }
      }
    }
    // police cars: road-chase the player, ram when close
    for (const car of this.policeCars) {
      if (car.dead) continue;
      const pos = car.group.position;
      const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const ram = dist < 14;
      let throttle = 0.9, steer = 0;
      if (ram) {
        const want = Math.atan2(dx, dz);
        let d = want - car.angle;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        steer = Math.max(-1, Math.min(1, d * 1.6));
        throttle = 1;
      } else {
        // road chase: at intersections, pick the turn that closes distance
        const cross = car.axis === 'x'
          ? ROADS.find((r) => Math.abs(pos.x - r) < 2.4)
          : ROADS.find((r) => Math.abs(pos.z - r) < 2.4);
        if (cross !== undefined && !car._turnedAt?.includes(cross)) {
          car._turnedAt = car._turnedAt || []; car._turnedAt.push(cross);
          if (car._turnedAt.length > 3) car._turnedAt.shift();
          const options = [];
          const cur = { axis: car.axis, line: car.line, dir: car.dir };
          options.push(cur);
          const turnAxis = car.axis === 'x' ? 'z' : 'x';
          options.push({ axis: turnAxis, line: cross, dir: 1 });
          options.push({ axis: turnAxis, line: cross, dir: -1 });
          let best = cur, bd = 1e9;
          for (const o of options) {
            const px = o.axis === 'x' ? pos.x + o.dir * 30 : o.line;
            const pz = o.axis === 'z' ? pos.z + o.dir * 30 : o.line;
            const dd = Math.hypot(playerPos.x - px, playerPos.z - pz);
            if (dd < bd) { bd = dd; best = o; }
          }
          car.axis = best.axis; car.line = best.line; car.dir = best.dir;
          this.placeOnRoad(car, car.axis === 'x' ? pos.z : pos.x);
        }
        const edge = car.axis === 'x' ? pos.x : pos.z;
        if (Math.abs(edge) > 190) { car.dir *= -1; this.placeOnRoad(car, car.axis === 'x' ? pos.z : pos.x); }
      }
      stepCar(car, dt, { throttle, steer, handbrake: false }, ctx);
      // unstuck: if barely moving for a while, re-place near the player
      if (Math.abs(car.speed) < 1 && throttle > 0) car.stuckT += dt; else car.stuckT = 0;
      if (car.stuckT > 3) { car.stuckT = 0; this.spawnPoliceCar(playerPos); const old = car; this.policeCars.splice(this.policeCars.indexOf(car), 1); this.scene.remove(old.group); }
      // flashing light bar
      if (car.lightBar) {
        const phase = Math.floor(time * 4) % 2 === 0;
        car.lightBar.red.material.emissiveIntensity = phase ? 2.2 : 0.25;
        car.lightBar.blue.material.emissiveIntensity = phase ? 0.25 : 2.2;
      }
      if (car.dead && this.onCopKilled) { this.onCopKilled(car); }
    }
    // foot cops run at the player and try to arrest
    let anyClose = false;
    for (const cop of this.footCops) {
      const pos = cop.group.position;
      const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2) {
        const pp = { x: pos.x + (dx / d) * cop.speed * dt, z: pos.z + (dz / d) * cop.speed * dt };
        collideCircle(pp, 0.5, colliders);
        pos.x = pp.x; pos.z = pp.z;
      }
      cop.group.rotation.y = Math.atan2(dx, dz);
      if (d < TUNING.copArrestRange && !playerInCar) {
        anyClose = true; cop.arrestT += dt;
        if (cop.arrestT > TUNING.copArrestTime && this.onBusted) this.onBusted('arrested');
      } else cop.arrestT = 0;
    }
    this.arrestT = anyClose ? this.arrestT + dt : 0;
    // boxed in while driving: a police car glued to you for 4s
    if (playerInCar && playerCar) {
      let close = false;
      for (const c of this.policeCars) {
        const dx = c.group.position.x - playerCar.group.position.x, dz = c.group.position.z - playerCar.group.position.z;
        if (dx * dx + dz * dz < 4.5 * 4.5) { close = true; break; }
      }
      if (close && Math.abs(playerCar.speed) < 3) {
        this.boxedT += dt;
        if (this.boxedT > 4 && this.onBusted) this.onBusted('boxed');
      } else this.boxedT = 0;
    } else this.boxedT = 0;
    // nearest police distance for the siren
    let nd = null;
    for (const c of this.policeCars) {
      const dx = c.group.position.x - playerPos.x, dz = c.group.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (nd === null || d < nd) nd = d;
    }
    if (ctx.onSiren) ctx.onSiren(nd);
  }
}
