// IRONHAVEN city: procedural ground texture, instanced buildings, merged props, sky.
// One job: build the static world and hand back colliders + spawn data.
// Draw calls are kept low on purpose: buildings are 3 InstancedMeshes, props are merged.
import * as THREE from 'three';
import { ROADS, BLOCK_CENTERS, PALETTE } from './config.js';
import { box, cyl, sph, merge, vcMesh } from './geo.js';

const WORLD = 480; // ground plane size (x -200..280, z -240..240)
const OX = -200, OZ = -240;
const S = 2048 / WORLD;

function groundTexture(rng) {
  const c = document.createElement('canvas'); c.width = c.height = 2048;
  const g = c.getContext('2d');
  const X = (x) => (x - OX) * S, Z = (z) => (z - OZ) * S;
  g.fillStyle = '#b8b0a2'; g.fillRect(0, 0, 2048, 2048);
  g.fillStyle = '#d9c49a'; g.fillRect(X(196), 0, X(224) - X(196), 2048);
  g.fillStyle = '#2a6f8a'; g.fillRect(X(224), 0, 2048 - X(224), 2048);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    const y = rng.range(0, 2048); g.beginPath(); g.moveTo(X(224) + rng.range(0, 60), y);
    g.lineTo(X(224) + rng.range(80, 200), y + rng.range(-8, 8)); g.stroke();
  }
  g.fillStyle = '#3a3a40';
  for (const r of ROADS) {
    g.fillRect(X(r - 7), Z(-196), 14 * S, 392 * S);
    g.fillRect(X(-196), Z(r - 7), 392 * S, 14 * S);
  }
  g.strokeStyle = '#d8b13c'; g.lineWidth = 2.5; g.setLineDash([26, 30]);
  for (const r of ROADS) {
    g.beginPath(); g.moveTo(X(r), Z(-196)); g.lineTo(X(r), Z(196)); g.stroke();
    g.beginPath(); g.moveTo(X(-196), Z(r)); g.lineTo(X(196), Z(r)); g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = 'rgba(216,216,208,0.6)'; g.lineWidth = 2;
  for (const r of ROADS) {
    g.strokeRect(X(r - 7) + 2, Z(-196), 14 * S - 4, 392 * S);
    g.strokeRect(X(-196), Z(r - 7) + 2, 392 * S, 14 * S - 4);
  }
  g.fillStyle = '#cfc8b8';
  for (const rx of ROADS) for (const rz of ROADS) {
    for (let i = -3; i <= 3; i++) {
      g.fillRect(X(rx + i * 1.8) - 3, Z(rz - 6.4), 6, 12);
      g.fillRect(X(rx + i * 1.8) - 3, Z(rz + 5.2), 6, 12);
    }
  }
  g.fillStyle = '#6a9a5a'; g.fillRect(X(-20), Z(-20), 40 * S, 40 * S);
  g.fillStyle = '#c9a86a'; g.fillRect(X(88), Z(-128), 40 * S, 40 * S);
  g.fillStyle = '#b0a890'; g.fillRect(X(-182), Z(-182), 40 * S, 40 * S);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#dddddd'; g.fillRect(0, 0, 128, 256);
  for (let y = 14; y < 244; y += 42) for (let x = 10; x < 118; x += 26) {
    g.fillStyle = Math.random() < 0.45 ? '#ffd27a' : '#2a3542';
    g.fillRect(x, y, 16, 24);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function collideCircle(p, r, colliders) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1));
    const cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
      } else {
        const pl = p.x - b.x0, pr = b.x1 - p.x, pt = p.z - b.z0, pb = b.z1 - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = b.x0 - r; else if (m === pr) p.x = b.x1 + r;
        else if (m === pt) p.z = b.z0 - r; else p.z = b.z1 + r;
      }
    }
  }
  return hit;
}

export function isOnRoad(x, z) {
  for (const r of ROADS) if (Math.abs(x - r) < 7 || Math.abs(z - r) < 7) return true;
  return false;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const addCollider = (x0, z0, x1, z1) => colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });

  // ---- lights & sky ----
  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
  sun.shadow.camera.far = 600; sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 620);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(PALETTE.skyTop) }, bot: { value: new THREE.Color(PALETTE.skyHorizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h = normalize(vP).y*0.5+0.5; gl_FragColor = vec4(mix(bot, top, smoothstep(0.0, 0.55, h)), 1.0); }',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), skyMat));
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }));
  sunDisc.position.set(420, 300, 240); sunDisc.lookAt(0, 0, 0); scene.add(sunDisc);
  // clouds: one merged mesh
  const cloudGeos = [];
  for (let i = 0; i < 10; i++) {
    const cx = rng.range(-320, 320), cy = rng.range(150, 220), cz = rng.range(-320, 320);
    for (let j = 0; j < 4; j++) cloudGeos.push(sph(rng.range(8, 16), 10, 8, cx + rng.range(-14, 14), cy + rng.range(-2, 2), cz + rng.range(-5, 5), 0xffffff));
  }
  const clouds = new THREE.Mesh(merge(cloudGeos), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
  clouds.scale.y = 0.45; clouds.frustumCulled = false; scene.add(clouds);

  // ---- ground + water ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(40, 0, 0);
  ground.receiveShadow = true; scene.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 480),
    new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 }));
  water.rotation.x = -Math.PI / 2; water.position.set(252, 0.15, 0);
  scene.add(water);

  // ---- buildings: collect specs, then 3 InstancedMeshes by height bucket ----
  const specs = [];
  const spec = (x, z, w, h, d, color, collide = true) => {
    specs.push({ x, z, w, h, d, color });
    if (collide) addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  };
  const special = new Set(['3,3', '0,0', '6,0', '5,1', '1,5']);
  for (let bi = 0; bi < 7; bi++) for (let bj = 0; bj < 7; bj++) {
    if (special.has(`${bi},${bj}`)) continue;
    const cx = BLOCK_CENTERS[bi], cz = BLOCK_CENTERS[bj];
    const distC = Math.abs(cx) + Math.abs(cz);
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const w = rng.range(12, 20), d = rng.range(12, 20);
      const x = cx + rng.range(-10, 10), z = cz + rng.range(-10, 10);
      const h = Math.max(7, rng.range(8, 34) - distC * 0.045 + rng.range(0, 8));
      spec(x, z, w, h, d, rng.pick(PALETTE.building));
      if (rng.chance(0.5)) spec(x + rng.range(-3, 3), z + rng.range(-3, 3), rng.range(3, 6), 2.5, rng.range(3, 6), 0x8a8578, false);
    }
  }
  // special places (plain boxes, same instancing)
  spec(-162, -168, 14, 6, 10, 0xd9a06a); spec(-150, -168, 8, 4.5, 8, 0x7a6a55); // hideout + garage
  spec(162, -162, 22, 16, 18, 0xe8e8e4); // hospital
  spec(108, -108, 26, 7, 18, 0xc9a86a); // market hall
  spec(-108, 108, 12, 6, 10, 0x8a9ab0); // safehouse
  const buckets = { short: [], mid: [], tall: [] };
  for (const s of specs) (s.h < 14 ? buckets.short : s.h < 24 ? buckets.mid : buckets.tall).push(s);
  const winTex = windowTexture();
  const dummy = new THREE.Object3D();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [name, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const avgH = list.reduce((a, s) => a + s.h, 0) / list.length;
    const tex = winTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, Math.max(1, avgH / 10));
    const mat = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff });
    const inst = new THREE.InstancedMesh(boxGeo, mat, list.length);
    inst.castShadow = true; inst.receiveShadow = true;
    list.forEach((s, i) => {
      dummy.position.set(s.x, s.h / 2, s.z);
      dummy.scale.set(s.w, s.h, s.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, new THREE.Color(s.color));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst);
  }

  // ---- plaza fountain ----
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.2, 20), new THREE.MeshLambertMaterial({ color: 0x9a938a }));
  fountain.position.set(0, 0.6, 0); fountain.castShadow = true; scene.add(fountain);
  const fWater = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.4, 20), new THREE.MeshLambertMaterial({ color: 0x4a9ab0 }));
  fWater.position.set(0, 1.3, 0); scene.add(fWater);
  addCollider(-8, -8, 8, 8);

  // ---- merged props: harbor, containers, crane, market stalls, hospital cross ----
  const props = [];
  const wood = 0x8a6a4a;
  for (const pz of [-70, 60]) {
    props.push(box(34, 1, 10, 214, 0.5, pz, wood));
    addCollider(197, pz - 5, 231, pz + 5);
  }
  const contColors = [0xd42a1e, 0x2f7a4a, 0x2f5a8a, 0xd4a01e, 0x8a4a6a];
  for (let i = 0; i < 10; i++) {
    const x = 204 + (i % 5) * 7, z = -40 - Math.floor(i / 5) * 8;
    props.push(box(6, 2.6, 2.6, x, 1.3, z, contColors[i % contColors.length]));
    addCollider(x - 3, z - 1.3, x + 3, z + 1.3);
    if (i % 3 === 0) props.push(box(6, 2.6, 2.6, x, 3.9, z, contColors[(i + 2) % contColors.length]));
  }
  props.push(box(4, 30, 4, 206, 15, 30, 0xd4a01e));
  props.push(box(26, 2, 2, 216, 29, 30, 0xd4a01e));
  addCollider(204, 28, 208, 32);
  for (let i = 0; i < 4; i++) {
    props.push(box(5, 2.2, 4, 96 + i * 8, 1.1, -96, [0xd42a1e, 0x2f7a4a, 0x2f5a8a, 0xd4a01e][i]));
    addCollider(96 + i * 8 - 2.5, -98, 96 + i * 8 + 2.5, -94);
  }
  props.push(box(8, 1.2, 2, 162, 17.2, -162, 0xd42a1e));
  props.push(box(2, 1.2, 8, 162, 17.2, -162, 0xd42a1e));
  scene.add(vcMesh(props));

  // ---- palms + plaza trees (merged) ----
  const trunks = [], leaves = [];
  const palmSpots = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    if (special.has(`${i},${j}`)) continue;
    palmSpots.push([BLOCK_CENTERS[i] - 18, BLOCK_CENTERS[j] - 18]);
  }
  for (const [x, z] of palmSpots) {
    if (!rng.chance(0.6)) continue;
    trunks.push(cyl(0.35, 0.5, 7, 8, x, 3.5, z, PALETTE.treeTrunk));
    leaves.push(sph(2.6, 8, 6, x, 8, z, PALETTE.treeTop));
    addCollider(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
  }
  for (const [x, z] of [[-14, 14], [14, -14], [14, 14], [-14, -14]]) {
    trunks.push(cyl(0.35, 0.5, 6, 8, x, 3, z, PALETTE.treeTrunk));
    leaves.push(sph(2.8, 8, 6, x, 7, z, PALETTE.treeTop));
  }
  scene.add(vcMesh(trunks));
  scene.add(vcMesh(leaves));

  // ---- streetlights (merged poles + merged lamps) ----
  const poles = [], lamps = [];
  for (const r of ROADS) {
    for (const t of [-162, -54, 54, 162]) {
      poles.push(cyl(0.18, 0.22, 7, 8, r + 8.2, 3.5, t, 0x3a3a3a));
      lamps.push(sph(0.55, 10, 8, r + 8.2, 7.2, t, 0xffe9b0));
    }
  }
  scene.add(vcMesh(poles, { castShadow: false }));
  const lampMesh = vcMesh(lamps, { castShadow: false });
  lampMesh.material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffc860, emissiveIntensity: 0.55 });
  scene.add(lampMesh);

  return { colliders, water, sun };
}
