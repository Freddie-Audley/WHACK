import * as THREE from "three";

// Shared bits for building worlds, animals and the ambassador.
export const flat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
export const DARK = flat(0x3a3560), WHITE = flat(0xffffff);
export const TRUNK = 0x7a5a3e;
export const DT = 0.016;

// Random numbers come from `rng`. While a world is being built it is seeded, so a world rebuilt
// with one more fact keeps its palette and layout: things get added, nothing shuffles.
let rng = Math.random;
export const rand = (a, b) => a + rng() * (b - a);
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const seeded = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// Seed the stream, or go back to properly random with no argument.
export const reseed = (seed) => { rng = seed == null ? Math.random : seeded(seed); };
export const col = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);

export const gust = (t) => 0.5 + 0.5 * Math.sin(t * 0.8) * Math.sin(t * 0.31 + 1);

export const shade = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };

// A white eye with a pupil, looking along +z.
export const googly = (r, x, y, z) => {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), WHITE);
  eye.position.set(x, y, z);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 5, 4), DARK);
  pupil.position.z = r * 0.7;
  eye.add(pupil);
  return eye;
};

// Everything that stands on the ground claims a circle of it, so nothing spawns inside anything else. A taken
// spot is nudged outwards to the nearest free one rather than redrawn, so a layout barely changes when a new
// fact adds things to it. `ok` says where a thing may stand at all. Returns the spot, or null if none is free nearby.
export const claim = (view, x, z, r, ok = () => true) => {
  const free = (x, z) => ok(x, z) && !view.taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < r + tr);
  for (let d = 0; d <= 4; d += 0.5) for (let k = 0, n = d ? 8 : 1; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + d, nx = x + Math.cos(a) * d, nz = z + Math.sin(a) * d;
    if (free(nx, nz)) { view.taken.push([nx, nz, r]); return [nx, nz]; }
  }
  return null;
};
