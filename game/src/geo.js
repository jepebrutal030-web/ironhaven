// Merged vertex-colored geometry helpers: many small parts, one draw call.
import * as THREE from 'three';

function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function box(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, color);
}
export function cyl(rt, rb, h, seg, x, y, z, color) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return paint(g, color);
}
export function cylX(r, h, seg, x, y, z, color) {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color);
}
export function sph(r, ws, hs, x, y, z, color) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.translate(x, y, z);
  return paint(g, color);
}
export function merge(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
export function vcMesh(geos, opts = {}) {
  const m = new THREE.Mesh(merge(geos), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}
