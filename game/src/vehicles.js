// Vehicles: car meshes, arcade driving physics, traffic AI, parked (stealable) cars.
// One merged mesh per car — 1 draw call instead of 10.
import * as THREE from 'three';
import { ROADS, CITY, CAR_MODELS } from './config.js';
import { collideCircle } from './world.js';
import { box, cylX, vcMesh } from './geo.js';

export function makeCarMesh(model, color, isPolice = false) {
  const len = model.kind === 'van' || model.kind === 'truck' ? 5.2 : 4.4;
  const wid = model.kind === 'truck' ? 2.1 : 1.9;
  const cabinH = model.kind === 'van' ? 0.9 : 0.62;
  const parts = [];
  parts.push(box(wid, 0.72, len, 0, 0.62, 0, isPolice ? 0x1a1a1a : color));
  parts.push(box(wid * 0.82, cabinH, len * (model.kind === 'sport' ? 0.42 : 0.52), 0, 1.05 + cabinH / 2 - 0.3, model.kind === 'truck' ? 0.9 : -0.25, 0x1c2733));
  if (isPolice) {
    parts.push(box(wid * 1.01, 0.4, len * 0.45, 0, 0.72, -0.5, 0xe8e8e8));
    parts.push(box(wid * 1.01, 0.5, 1.2, 0, 0.68, 0.3, 0xe8e8e8));
  }
  if (model.kind === 'taxi') parts.push(box(0.9, 0.22, 0.5, 0, 1.55, -0.2, 0xf2c21e));
  for (const [wx, wz] of [[-wid / 2, len / 2 - 0.8], [wid / 2, len / 2 - 0.8], [-wid / 2, -len / 2 + 0.8], [wid / 2, -len / 2 + 0.8]]) {
    parts.push(cylX(0.38, 0.32, 12, wx, 0.38, wz, 0x111111));
  }
  for (const sx of [-0.6, 0.6]) {
    parts.push(box(0.34, 0.16, 0.08, sx, 0.62, len / 2 + 0.02, 0xfff2c0));
    parts.push(box(0.34, 0.16, 0.08, sx, 0.62, -len / 2 - 0.02, 0xd42a1e));
  }
  const mesh = vcMesh(parts);
  let lightBar = null;
  if (isPolice) {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshLambertMaterial({ color: 0xff2a1e, emissive: 0xff2a1e, emissiveIntensity: 1 }));
    r.position.x = -0.3; bar.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshLambertMaterial({ color: 0x2a6aff, emissive: 0x2a6aff, emissiveIntensity: 1 }));
    b.position.x = 0.3; bar.add(b);
    bar.position.set(0, 1.5, -0.2); mesh.add(bar);
    lightBar = { red: r, blue: b };
  }
  return { group: mesh, lightBar, len, wid };
}

export function createCar(model, color, x, z, angle, isPolice = false) {
  const mesh = makeCarMesh(model, color, isPolice);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = angle;
  const car = {
    ...mesh, model, color, angle, speed: 0, steer: 0, health: 100,
    kind: model.kind, isPolice, isTraffic: false, isParked: false,
    isPlayer: false, dead: false, skid: false, name: model.name,
  };
  mesh.group.userData = { kind: 'car', ref: car };
  return car;
}

// Arcade car physics + collisions. ctl: {throttle -1..1, steer -1..1, handbrake bool}
export function stepCar(car, dt, ctl, ctx) {
  if (car.dead) return;
  const m = car.model;
  const fwd = Math.sin(car.angle), fwdZ = Math.cos(car.angle);
  if (ctl.throttle > 0) car.speed += ctl.throttle * m.accel * dt;
  else if (ctl.throttle < 0) {
    if (car.speed > 0.5) car.speed += ctl.throttle * m.accel * 1.6 * dt; // brake
    else car.speed += ctl.throttle * m.accel * 0.55 * dt; // reverse
  }
  const maxF = m.top, maxR = -13;
  car.speed = Math.max(maxR, Math.min(maxF, car.speed));
  // drag + rolling resistance
  car.speed -= car.speed * (ctl.handbrake ? 1.4 : 0.35) * dt;
  if (Math.abs(car.speed) < 0.05 && ctl.throttle === 0) car.speed = 0;
  // steering (stronger at speed, weaker at standstill; handbrake loosens the rear)
  const steerTarget = ctl.steer * (ctl.handbrake ? 1.35 : 1);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const spdF = Math.min(1, Math.abs(car.speed) / 9);
  car.angle += car.steer * m.grip * 0.42 * spdF * Math.sign(car.speed || 1) * dt * (ctl.handbrake ? 1.5 : 1);
  car.skid = ctl.handbrake && Math.abs(car.speed) > 8;
  const p = { x: car.group.position.x + fwd * car.speed * dt, z: car.group.position.z + fwdZ * car.speed * dt };
  const hitWall = collideCircle(p, 1.7, ctx.colliders);
  if (hitWall) {
    if (Math.abs(car.speed) > 6) { car.health -= Math.abs(car.speed) * 0.7; if (ctx.onCrash) ctx.onCrash(car, Math.abs(car.speed)); }
    car.speed *= 0.45;
  }
  // car-car collisions (circle, radius 2.1)
  for (const o of ctx.cars) {
    if (o === car || o.dead) continue;
    const dx = p.x - o.group.position.x, dz = p.z - o.group.position.z;
    const d2 = dx * dx + dz * dz, rr = 4.2;
    if (d2 < rr * rr && d2 > 0.0001) {
      const d = Math.sqrt(d2), push = (rr - d) / 2;
      p.x += (dx / d) * push; p.z += (dz / d) * push;
      const rel = Math.abs(car.speed - o.speed);
      if (rel > 5) { car.health -= rel * 0.5; o.health -= rel * 0.5; if (ctx.onCrash) ctx.onCrash(car, rel); }
      if (o.isTraffic || o.isParked) o.speed = car.speed * 0.4;
      car.speed *= 0.82;
    }
  }
  car.group.position.x = p.x; car.group.position.z = p.z;
  car.group.rotation.y = car.angle;
  if (car.health <= 0 && !car.dead) { car.dead = true; if (ctx.onWreck) ctx.onWreck(car); }
}

export function nearestCar(pos, maxDist, cars, pred = null) {
  let best = null, bd = maxDist;
  for (const c of cars) {
    if (c.dead || c.isPlayer) continue;
    if (pred && !pred(c)) continue;
    const dx = c.group.position.x - pos.x, dz = c.group.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export class Traffic {
  constructor(scene, rng, colliders) {
    this.cars = []; this.rng = rng;
    this.spawn(scene, colliders);
  }
  spawn(scene, colliders) {
    for (let i = 0; i < 22; i++) {
      const model = this.rng.pick(CAR_MODELS.filter((m) => m.kind !== 'taxi' || this.rng.chance(0.3)));
      const color = this.rng.pick(model.colors);
      const car = createCar(model, color, 0, 0, 0);
      car.isTraffic = true;
      const axis = this.rng.chance(0.5) ? 'x' : 'z';
      const line = this.rng.pick(ROADS);
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const along = this.rng.range(-180, 180);
      car.axis = axis; car.line = line; car.dir = dir;
      car.targetSpeed = this.rng.range(9, 14);
      car.stopT = 0;
      this.placeOnRoad(car, along);
      scene.add(car.group);
      this.cars.push(car);
    }
  }
  placeOnRoad(car, along) {
    // right-hand traffic: offset +3.5 to the right of the direction of travel
    const a = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.angle = a;
    const rx = Math.cos(a), rz = -Math.sin(a); // local +X (right)
    if (car.axis === 'x') car.group.position.set(along, 0, car.line + rz * 3.5);
    else car.group.position.set(car.line + rx * 3.5, 0, along);
    car.group.rotation.y = a;
  }
  update(dt, ctx) {
    for (const car of this.cars) {
      if (car.dead) continue;
      // slow/stop if a car is ahead
      let ahead = null;
      for (const o of ctx.cars) {
        if (o === car || o.dead) continue;
        const dx = o.group.position.x - car.group.position.x, dz = o.group.position.z - car.group.position.z;
        const fwd = Math.sin(car.angle), fwdZ = Math.cos(car.angle);
        const along = dx * fwd + dz * fwdZ, side = Math.abs(dx * fwdZ - dz * fwd);
        if (along > 0 && along < 11 && side < 2.4) { ahead = o; break; }
      }
      let throttle = 0.6;
      if (ahead) throttle = -0.6;
      if (car.stopT > 0) { car.stopT -= dt; throttle = -0.8; }
      // at an intersection, sometimes turn, sometimes pause
      const pos = car.group.position;
      const cross = car.axis === 'x'
        ? ROADS.find((r) => Math.abs(pos.x - r) < 2.2)
        : ROADS.find((r) => Math.abs(pos.z - r) < 2.2);
      if (cross !== undefined && !car._turnedAt?.includes(cross)) {
        car._turnedAt = car._turnedAt || [];
        car._turnedAt.push(cross);
        if (car._turnedAt.length > 3) car._turnedAt.shift();
        const roll = this.rng.next();
        if (roll < 0.35) {
          // turn onto the crossing road
          car.axis = car.axis === 'x' ? 'z' : 'x';
          car.line = cross;
          car.dir = this.rng.chance(0.5) ? 1 : -1;
          this.placeOnRoad(car, car.axis === 'x' ? pos.z : pos.x);
        } else if (roll < 0.5) car.stopT = this.rng.range(0.8, 2);
      }
      // city edge: turn around
      const edge = car.axis === 'x' ? pos.x : pos.z;
      if (Math.abs(edge) > 190) { car.dir *= -1; this.placeOnRoad(car, car.axis === 'x' ? pos.z : pos.x); }
      stepCar(car, dt, { throttle, steer: 0, handbrake: false }, ctx);
      // keep it glued to its road line (arcade: no drifting off the road)
      const a = car.angle;
      if (car.axis === 'x') car.group.position.z = car.line + (-Math.sin(a)) * 3.5;
      else car.group.position.x = car.line + Math.cos(a) * 3.5;
    }
  }
}

export function spawnParked(scene, rng) {
  const cars = [];
  for (let i = 0; i < 14; i++) {
    const model = rng.pick(CAR_MODELS);
    const color = rng.pick(model.colors);
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = rng.pick(ROADS);
    const along = rng.range(-175, 175);
    const side = rng.chance(0.5) ? 5.6 : -5.6;
    const angle = axis === 'x' ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
    const x = axis === 'x' ? along : line + side;
    const z = axis === 'x' ? line + side : along;
    const car = createCar(model, color, x, z, angle);
    car.isParked = true;
    scene.add(car.group);
    cars.push(car);
  }
  return cars;
}
