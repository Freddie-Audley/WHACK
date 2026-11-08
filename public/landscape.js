import * as THREE from "three";
import { flat, rand, pick, gust, claim, DT, TRUNK, DARK, WHITE } from "./props.js";

// The land, sky, plants and weather of a world, built from facts into `view.world` through `add`.
// `v` are the facts, `P` the palette, `W` the wind (null when still or unknown), `sky` the sky colour.
// Unknown facts leave their part of the world white. Each section draws from its own seeded random
// stream (view.reseed), so a world rebuilt with one more fact keeps its layout.
export function buildLandscape(view, v, P, W, sky, add) {
  const known = (k) => v[k] != null;
  const water = v.terrain === "water";
  view.taken = []; // the ground claimed so far, see claim() in props
  // Nothing may crowd the ambassador: a circle round the origin and the patch in front of it stay clear.
  const clear = (x, z) => Math.hypot(x, z) > 3 && !(z > -1 && Math.abs(x) < 3);
  // Snow whitens, three suns scorch and no sun darkens everything that grows on or lies about the ground.
  const tint = (c) => {
    c = new THREE.Color(c);
    if (v.weather === "snow") c.lerp(new THREE.Color(0xffffff), 0.75);
    if (v.suns === "three suns") c.lerp(new THREE.Color(0xd98a4a), 0.5); // scorched
    if (v.suns === "no sun") c.multiplyScalar(0.6);
    return c;
  };
  // A soft round dot for sprites and points, from a radial gradient through `stops`.
  const dot = (stops) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [k, s] of stops) grad.addColorStop(k, s);
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  };
  const BLOB = new THREE.IcosahedronGeometry(1, 0), SNOWY = flat(0xf4f4f8);
  // A thin rod from a to b (sticks, poles, oars, washing lines); span() re-stretches one between moving ends.
  const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), ROD = new THREE.CylinderGeometry(1, 1, 1, 4);
  const span = (m, a, b) => { const d = b.clone().sub(a); m.scale.y = d.length(); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); return m; };
  const bar = (a, b, r, mat) => { const m = new THREE.Mesh(ROD, mat); m.scale.set(r, 1, r); return span(m, a, b); };
  // What the set dressing at the end needs to know about: the trees, the big near rocks and the near peaks.
  const trees = [], nearRocks = [], peaks = [];
  const swayInWind = (g, strength = 1) => {
    g.rotation.z = rand(-0.06, 0.06);
    if (W) {
      const p = rand(0, 6);
      view.movers.push((t) => { g.rotation.z = -strength * (W.bend + gust(t) * W.sway) + Math.sin(t * 2.2 + p) * 0.03 * strength; });
    }
  };

  // Ground: gently uneven unless flat or water (or not yet known); always level near the camera.
  view.reseed(1);
  const amp = v.terrain === "mountains" ? 0.35 : 0;
  view.groundY = (x, z) => {
    if (!amp) return 0;
    const k = Math.min(1, Math.max(0, (Math.hypot(x, z) - 2) / 4));
    return amp * k * (Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.38) + 0.6 * Math.sin(x * 0.9 - z * 0.7));
  };
  // Which way is up on the ground there, from its slope, so anything with a footprint can sit flush on a hillside.
  const slopeUp = (x, z, d = 0.3) => V(view.groundY(x - d, z) - view.groundY(x + d, z), 2 * d, view.groundY(x, z - d) - view.groundY(x, z + d)).normalize();
  const groundColour = tint(!known("terrain") ? 0xffffff : water ? 0x6fb7d9 : P.ground);
  const geo = new THREE.PlaneGeometry(80, 80, 64, 64);
  const gp = geo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setZ(i, view.groundY(gp.getX(i), -gp.getY(i)));
  geo.computeVertexNormals();
  const ground = add(new THREE.Mesh(geo, flat(groundColour)), false);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  // Water heaves with a few slow sines, but lies flat under the ambassador so nobody is paddling.
  const wave = (x, z, t) => Math.min(1, Math.max(0, (Math.hypot(x, z) - 2) / 4)) *
    (0.06 * Math.sin(x * 0.7 + t * 1.1) + 0.05 * Math.sin(z * 0.9 - t * 0.8) + 0.03 * Math.sin((x + z) * 0.5 + t * 1.7));
  if (water) view.movers.push((t) => {
    for (let i = 0; i < gp.count; i++) gp.setZ(i, wave(gp.getX(i), -gp.getY(i), t));
    gp.needsUpdate = true;
    geo.computeVertexNormals();
  });

  // Mountains in two rows: big peaks far back, foothills in front, each faded towards the sky with distance
  // so the range reads as depth rather than a wall, and low enough to leave sky above. The far peaks always keep
  // a thin line of snow, and a proper cap when it snows.
  if (v.terrain === "mountains") {
    for (let i = 0; i < 24; i++) {
      const far = i < 11;
      const hgt = far ? rand(7, 14) : rand(2.5, 6), r = far ? rand(4, 7) : rand(2.5, 5), sides = 4 + (rand(0, 4) | 0);
      const x = far ? -32 + i * 6.4 + rand(-2, 2) : -30 + (i - 11) * 4.8 + rand(-1.5, 1.5), z = far ? rand(-32, -26) : rand(-22, -15);
      const m = add(new THREE.Mesh(new THREE.ConeGeometry(r, hgt, sides), flat(new THREE.Color(i % 2 ? P.rock : P.leaf).lerp(sky, far ? 0.45 : 0.3))));
      m.position.set(x, hgt / 2 - 0.5, z);
      m.rotation.y = rand(0, 6);
      m.scale.set(rand(0.8, 1.25), 1, rand(0.8, 1.25));
      if (far) {
        const f = v.weather === "snow" ? 0.36 : 0.2;
        const c = new THREE.Mesh(new THREE.ConeGeometry(r * f, hgt * f, sides), SNOWY);
        c.position.y = hgt * (0.5 - f / 2); c.scale.setScalar(1.03); // a touch proud of the slope, or the two faces flicker
        m.add(c);
      } else peaks.push([m, hgt]);
    }
  }
  if (water) for (let i = 0; i < 20; i++) {
    const r = add(new THREE.Mesh(new THREE.TorusGeometry(rand(0.4, 1.2), 0.03, 4, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })), false);
    r.rotation.x = -Math.PI / 2;
    const x = rand(-14, 14), z = rand(-14, -1), p = rand(0, 6);
    view.movers.push((t) => { const k = (t * 0.35 + p) % 3; r.scale.setScalar(0.3 + k); r.position.set(x, wave(x, z, t) + 0.03, z); r.material.opacity = 0.7 * (1 - k / 3); });
  }

  // Suns, moon, stars: flat discs far away, untouched by fog. The sky stays empty until the suns are known.
  view.reseed(2);
  const disc = (r, colour, opacity = 1) => new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: colour, fog: false, transparent: opacity < 1, opacity }));
  const n = { "no sun": 0, "one sun": 1, "two suns": 2, "three suns": 3 }[v.suns] ?? 0;
  const tints = [0xfff1a8, 0xffb38a, 0xc8f0ff];
  const suns = [];
  for (let i = 0; i < n; i++) {
    const r = rand(1.4, 2.4), x = -9 + i * 8 + rand(-1, 1), y = rand(8, 12);
    add(disc(r, tints[i]), false).position.set(x, y, -30);
    add(disc(r * 1.7, tints[i], 0.25), false).position.set(x, y, -30.1);
    suns.push([x, y, r * 1.7]);
  }
  if (known("suns") && rand(0, 1) < 0.5) {
    // The moon tries a few spots until it finds one clear of the suns and their haloes.
    const r = rand(0.5, 1.1);
    let x, y;
    for (let i = 0; i < 12; i++) { x = rand(-14, 14); y = rand(9, 13); if (suns.every(([sx, sy, sr]) => Math.hypot(x - sx, y - sy) > sr + r + 0.5)) break; }
    add(disc(r, 0xf4f1e8, 0.9), false).position.set(x, y, -29);
  }
  // Stars sit behind the far peaks and hills (a star in front of a mountain is a glint on its face), a little bigger for the distance.
  if (v.suns === "no sun") add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
    new THREE.Float32BufferAttribute(Array.from({ length: 500 }, () => [rand(-40, 40), rand(4, 30), rand(-45, -38)]).flat(), 3)),
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, fog: false })), false);

  // Trees in clumps, all of one family (conifers, round-headed or flat-topped), once the terrain is known.
  // Within the family every tree differs in height, canopy and shade of leaf. They bend in the wind.
  view.reseed(3);
  if (known("terrain") && !water) {
    // Leaves keep their colour in snow and under three suns, but the night dims them like everything else.
    const dim = (c) => v.suns === "no sun" ? c.multiplyScalar(0.6) : c;
    const trunk = flat(dim(new THREE.Color(TRUNK))), leaves = [-0.09, 0, 0.09].map((d) => flat(dim(new THREE.Color(P.leaf).offsetHSL(0, 0, d))));
    const CONE = new THREE.ConeGeometry(1, 1, 6), DISC = new THREE.CylinderGeometry(1, 0.8, 0.35, 7), STEM = new THREE.CylinderGeometry(0.5, 1, 1, 5);
    const kind = (rand(0, 1) * 3) | 0;
    const tree = (x, z) => {
      const g = new THREE.Group(), h = rand(1.4, 3.6), s = rand(0.8, 1.3);
      const at = claim(view, x, z, 0.6 * s, clear); // room for its trunk and some canopy of its own
      if (!at) return;
      [x, z] = at;
      const stem = new THREE.Mesh(STEM, trunk);
      stem.scale.set(0.16, h, 0.16); stem.position.y = h / 2;
      g.add(stem);
      // Every canopy piece starts low enough to overlap the trunk, so nothing floats.
      const blob = (geo, sx, sy, sz, bx, by, bz) => { const m = new THREE.Mesh(geo, pick(leaves)); m.scale.set(sx, sy, sz); m.position.set(bx, by, bz); m.rotation.y = rand(0, 6); g.add(m); };
      if (kind === 0) for (let i = 0, k = 2 + (rand(0, 2) | 0); i < k; i++) blob(CONE, s * (0.9 - i * 0.2), s * 1.4, s * (0.9 - i * 0.2), 0, h + s * (0.3 + i * 0.6), 0);
      else if (kind === 1) {
        blob(BLOB, s * 0.8, s * 0.8, s * 0.8, 0, h + s * 0.5, 0);
        for (let i = 1 + (rand(0, 3) | 0); i--;) { const b = s * rand(0.45, 0.65); blob(BLOB, b, b, b, rand(-0.5, 0.5) * s, h + s * rand(0.4, 0.9), rand(-0.5, 0.5) * s); }
      } else {
        blob(DISC, s * 1.1, 1, s * 1.1, 0, h + 0.1, 0);
        if (rand(0, 1) < 0.6) blob(DISC, s * 0.65, 1, s * 0.65, rand(-0.3, 0.3) * s, h + 0.45, rand(-0.3, 0.3) * s);
      }
      g.position.set(x, view.groundY(x, z) - 0.05, z);
      swayInWind(g);
      add(g);
      trees.push({ g, x, z, h, s, kind });
    };
    for (let k = 0; k < 6; k++) {
      const cx = rand(-16, 16), cz = rand(-19, -5);
      for (let i = rand(2, 6) | 0; i--;) tree(cx + rand(-3, 3), cz + rand(-2.5, 2.5));
    }
    // A few at the sides of the frame, so the shot has a foreground.
    for (let i = 0; i < 4; i++) tree(rand(5, 8) * (i % 2 ? 1 : -1), rand(-4, 1));
  }

  // Wind: streaks blowing past.
  view.reseed(6);
  if (W) for (let i = 0; i < W.streaks; i++) {
    const s = add(new THREE.Mesh(new THREE.BoxGeometry(rand(2, 4), 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })), false);
    const y = rand(0.8, 7), z = rand(-12, 1); // clear of the hills, which rise to 0.56
    let x = rand(-20, 20);
    view.movers.push((t) => { x += W.speed * (1 + gust(t)) * DT; if (x > 20) x = -20; s.position.set(x, y + Math.sin(t * 3 + i) * 0.1, z); });
  }

  // Weather
  view.reseed(7);
  if (v.weather === "rain") {
    const count = 500, pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) { const x = rand(-18, 18), y = rand(0, 14), z = rand(-18, 4); pos.set([x, y, z, x, y + 0.4, z], i * 6); }
    const rain = add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
      new THREE.LineBasicMaterial({ color: 0x5f7390, transparent: true, opacity: 0.6 })), false);
    view.movers.push(() => {
      const a = rain.geometry.attributes.position.array;
      for (let i = 0; i < count; i++) { const y = (a[i * 6 + 1] - 0.22 + 14) % 14; a[i * 6 + 1] = y; a[i * 6 + 4] = y + 0.4; }
      rain.geometry.attributes.position.needsUpdate = true;
    });
  }
  if (v.weather === "snow") {
    const count = 600, pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) pos.set([rand(-18, 18), rand(0, 14), rand(-18, 4)], i * 3);
    const flake = dot([[0, "rgba(255,255,255,1)"], [0.45, "rgba(255,255,255,.8)"], [1, "rgba(255,255,255,0)"]]);
    const snow = add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, map: flake, transparent: true, depthWrite: false })), false);
    view.movers.push((t) => {
      const a = snow.geometry.attributes.position;
      for (let i = 0; i < count; i++) { a.array[i * 3 + 1] = (a.array[i * 3 + 1] - 0.018 + 14) % 14; a.array[i * 3] += Math.sin(t * 0.8 + i) * 0.006; }
      a.needsUpdate = true;
    });
  }
  // At night, little lights drift about low over the ground, each glowing and fading in its own time.
  view.reseed(8);
  if (v.suns === "no sun") {
    const glow = dot([[0, "rgba(255,255,220,1)"], [0.2, "rgba(255,240,150,.8)"], [1, "rgba(255,220,100,0)"]]);
    for (let i = 0; i < 40; i++) {
      const light = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), false);
      light.scale.setScalar(rand(0.25, 0.45));
      const x = rand(-12, 12), z = rand(-14, 2), y = view.groundY(x, z) + rand(1, 3.5), p = rand(0, 20), f = rand(0.3, 0.7); // bobbing half a unit, so never into the ground
      view.movers.push((t) => {
        light.position.set(x + 1.5 * Math.sin(t * f * 0.5 + p), y + 0.5 * Math.sin(t * f + p * 2), z + 1.2 * Math.cos(t * f * 0.4 + p));
        light.material.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * f * 2 + p));
      });
    }
  }

  // Ground cover once the terrain is known: grass, flowers, bushes and rocks, each one instanced mesh so
  // hundreds of them cost a draw call. Thickest in the mid-ground, with a few big ones at the near edges to frame the shot.
  view.reseed(9);
  if (known("terrain") && !water) {
    // Grass and flowers (r = 0) go anywhere clear; bushes and rocks claim their ground so they don't grow through a tree or each other.
    const spot = (near = false, r = 0) => {
      for (let tries = 0; ; tries++) {
        const x = near ? rand(4, 9) * pick([-1, 1]) : rand(-18, 18), z = near ? rand(-3, 3) : -9 + rand(-6, 6) + rand(-6, 6);
        if (!clear(x, z)) continue;
        if (!r) return [x, z];
        const at = claim(view, x, z, r, clear);
        if (at || tries > 30) return at || [x, z];
      }
    };
    const scatter = (geo, count, fill) => {
      const im = add(new THREE.InstancedMesh(geo, flat(0xffffff), count)), o = new THREE.Object3D(), c = new THREE.Color();
      for (let i = 0; i < count; i++) {
        fill(o, c, i);
        o.position.y += view.groundY(o.position.x, o.position.z);
        o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, c);
      }
    };
    const grass = tint(P.ground), leaf = tint(P.leaf), rock = tint(P.rock), petal = tint(pick([0xfff3b0, 0xf2a0b8, 0xffffff, 0xb9c8ff, 0xf7b267]));
    scatter(new THREE.ConeGeometry(0.07, 0.34, 4), 500, (o, c) => {
      const [x, z] = spot(), s = rand(0.6, 1.6);
      o.position.set(x, 0.14 * s, z); o.scale.setScalar(s); o.rotation.set(rand(-0.3, 0.3), rand(0, 6), rand(-0.3, 0.3));
      c.copy(grass).lerp(leaf, rand(0.2, 0.8));
    });
    const flowers = Array.from({ length: 140 }, () => [...spot(), rand(0.7, 1.3)]);
    scatter(new THREE.CylinderGeometry(0.015, 0.02, 0.26, 3), flowers.length, (o, c, i) => {
      const [x, z, s] = flowers[i];
      o.position.set(x, 0.12 * s, z); o.scale.setScalar(s); o.rotation.set(0, 0, 0);
      c.copy(leaf);
    });
    scatter(new THREE.IcosahedronGeometry(0.07, 0), flowers.length, (o, c, i) => {
      const [x, z, s] = flowers[i];
      o.position.set(x, 0.27 * s, z); o.scale.setScalar(s); o.rotation.set(0, rand(0, 6), 0);
      c.copy(petal);
    });
    const bushes = [];
    for (let k = 0; k < 14; k++) { const [x, z] = spot(k < 3, 0.9); for (let i = 2 + (rand(0, 3) | 0); i--;) bushes.push([x + rand(-0.6, 0.6), z + rand(-0.5, 0.5), rand(0.25, 0.55)]); }
    scatter(BLOB, bushes.length, (o, c, i) => {
      const [x, z, r] = bushes[i];
      o.position.set(x, r * 0.75, z); o.scale.set(r * 1.2, r, r * 1.2); o.rotation.set(0, rand(0, 6), 0);
      c.copy(leaf).offsetHSL(0, 0, rand(-0.08, 0.08));
    });
    scatter(new THREE.DodecahedronGeometry(1, 0), 36, (o, c, i) => {
      const near = i < 3, r = near ? rand(0.45, 0.85) : rand(0.15, 0.5), [x, z] = spot(near, r * 1.3);
      o.position.set(x, r * 0.5, z); o.scale.set(r * rand(0.9, 1.4), r * 0.8, r * rand(0.9, 1.4)); o.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      // Tumbled every which way, so how tall a rock stands is anyone's guess: the snow caps need to know, near enough (the squashed sphere round it).
      if (near) nearRocks.push([x, z, r, r * 0.5 + 0.9 * UP.clone().applyQuaternion(o.quaternion.clone().invert()).multiply(o.scale).length()]);
      c.copy(rock).offsetHSL(0, 0, rand(-0.06, 0.06));
    });
  }

  // Food grows where the listener can see it, with a different silhouette for each kind.
  view.reseed(12);
  if (known("food")) {
    const soil = flat(tint(0x76513a)), stem = flat(tint(0x4f813f));
    const fruitMaterial = (color) => new THREE.MeshStandardMaterial({
      color, emissive: color,
      emissiveIntensity: v.weather === "rain" || v.weather === "snow" ? 0.55 : 0.25,
      roughness: 0.45, flatShading: true,
    });
    const place = (r, patch = 0) => {
      const side = patch % 2 ? 1 : -1;
      const foodClear = (x, z) => clear(x, z) && x * side >= 2.1 && x * side <= 3.8 && z >= -8.5 && z <= -2.5;
      for (let i = 0; i < 40; i++) {
        const at = claim(view, side * rand(2.6, 3.2), rand(-7, -3), r, foodClear);
        if (at) return at;
      }
      return null;
    };
    if (v.food === "mushrooms on the ground") {
      const cap = flat(tint(0xe56f58)), paleCap = flat(tint(0xf0c66c)), stalk = flat(tint(0xf3e7c7));
      for (let patch = 0; patch < 3; patch++) {
        const at = place(0.9, patch);
        if (!at) continue;
        const [x, z] = at, group = new THREE.Group();
        for (let i = 0, n = Math.round((4 + (rand(0, 3) | 0)) * 1.5); i < n; i++) {
          const a = rand(0, Math.PI * 2), d = rand(0, 0.65), size = rand(0.65, 1.15);
          const mushroom = new THREE.Group();
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.26 * size, 5), stalk);
          foot.position.y = 0.13 * size;
          const top = new THREE.Mesh(new THREE.SphereGeometry(0.2 * size, 7, 5), rand(0, 1) < 0.25 ? paleCap : cap);
          top.scale.y = 0.48; top.position.y = 0.3 * size;
          mushroom.add(foot, top);
          mushroom.position.set(Math.cos(a) * d, view.groundY(x + Math.cos(a) * d, z + Math.sin(a) * d), Math.sin(a) * d); // each on its own bit of hillside
          group.add(mushroom);
        }
        group.position.set(x, 0, z);
        add(group);
      }
    } else if (v.food === "crops in fields") {
      const count = 2 + (rand(0, 2) | 0);
      for (let field = 0; field < count; field++) {
        const at = place(1.7, field);
        if (!at) continue;
        const [x, z] = at, group = new THREE.Group(), grain = flat(tint(0xe6bd61));
        for (let row = -2; row <= 2; row++) for (let i = 0; i < 7; i++) {
          const px = row * 0.36, pz = (i - 3) * 0.38, h = rand(0.55, 0.95), gy = view.groundY(x + px, z + pz) - view.groundY(x, z); // the field follows the hillside
          const stalkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, h, 4), stem);
          stalkMesh.position.set(px, gy + h / 2, pz);
          const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 5), grain);
          head.position.set(px, gy + h + 0.08, pz);
          group.add(stalkMesh, head);
        }
        group.position.set(x, view.groundY(x, z), z);
        swayInWind(group, 0.25);
        add(group);
      }
    } else if (v.food === "berries in bushes") {
      const leaf = flat(tint(P.leaf));
      const berry = fruitMaterial(0xc51f45);
      const fruit = new THREE.SphereGeometry(0.075, 7, 5);
      for (let patch = 0; patch < 3; patch++) {
        const at = place(0.85, patch);
        if (!at) continue;
        const [x, z] = at, group = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const b = new THREE.Mesh(BLOB, leaf);
          b.scale.set(0.42, 0.38, 0.4); b.position.set((i % 2 - 0.5) * 0.45, 0.32 + (i > 1 ? 0.12 : 0), (i < 2 ? -1 : 1) * 0.18);
          group.add(b);
        }
        const berryCount = 2 + (rand(0, 2) | 0);
        for (let i = 0; i < berryCount; i++) {
          const bx = rand(-0.4, 0.4), by = rand(0.25, 0.55), bz = rand(0.3, 0.45); // on the front blobs' faces, not rolled off at the foot
          const b = new THREE.Mesh(fruit, berry);
          b.position.set(bx, by, bz);
          group.add(b);
        }
        group.position.set(x, view.groundY(x, z), z);
        swayInWind(group);
        add(group);
      }
    } else if (v.food === "fruit in trees") {
      const leaf = flat(tint(P.leaf));
      const fruit = fruitMaterial(0xe94b24);
      const sphere = new THREE.SphereGeometry(1, 8, 6);
      for (let patch = 0; patch < 3; patch++) {
        const at = place(1.1, patch);
        if (!at) continue;
        const [x, z] = at, group = new THREE.Group();
        const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.5, 6), soil);
        trunkMesh.position.y = 0.75;
        group.add(trunkMesh);
        const canopy = new THREE.Mesh(BLOB, leaf);
        canopy.scale.set(0.9, 0.75, 0.8); canopy.position.y = 1.8;
        group.add(canopy);
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5, apple = new THREE.Mesh(sphere, fruit);
          apple.scale.setScalar(0.14);
          apple.position.set(Math.cos(a) * 0.74, 1.65 + (i % 2) * 0.35, Math.sin(a) * 0.66); // half out of the canopy's faces, so they read as fruit, not blotches
          group.add(apple);
        }
        group.position.set(x, view.groundY(x, z), z);
        swayInWind(group);
        add(group);
      }
    }
  }

  // Soft far hills behind everything, most of the way to the sky colour, so the horizon is a wavy line rather than a ruler's edge.
  view.reseed(10);
  if (known("terrain") && !water) {
    const DOME = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const hill = flat(tint(v.terrain === "mountains" ? P.rock : P.leaf).lerp(sky, 0.4));
    for (let i = 0; i < 9; i++) {
      const m = add(new THREE.Mesh(DOME, hill), false);
      m.position.set(-36 + i * 9 + rand(-3, 3), -0.3, rand(-37, -30));
      m.scale.set(rand(7, 13), rand(1.5, 3.5), rand(4, 7));
    }
  }

  // Clouds once the suns are known: flattened blobs drifting with the wind, fewer and greyer in rain, none at night.
  view.reseed(11);
  if (known("suns") && v.suns !== "no sun") {
    const rain = v.weather === "rain";
    const puff = flat(new THREE.Color(rain ? 0x9aa3b0 : 0xffffff).lerp(sky, rain ? 0.4 : 0.15));
    puff.emissive.copy(puff.color).multiplyScalar(0.45); // lit from within a little, or the shaded faces read as boulders
    for (let i = 0, k = rain ? 4 : 7; i < k; i++) {
      const cloud = add(new THREE.Group(), false);
      for (let j = 2 + (rand(0, 3) | 0); j--;) {
        const b = new THREE.Mesh(BLOB, puff);
        b.scale.set(rand(1.3, 2.4), rand(0.6, 0.9), rand(1, 1.6)); b.position.set(j * rand(0.9, 1.6) - 1.2, rand(-0.2, 0.3), rand(-0.4, 0.4)); b.rotation.y = rand(0, 6);
        cloud.add(b);
      }
      const y = rand(7.5, 13), z = rand(-34, -24), speed = (W ? W.speed * 0.12 : 0.25) * rand(0.7, 1.3);
      let x = rand(-34, 34);
      view.movers.push(() => { x += speed * DT; if (x > 38) x = -38; cloud.position.set(x, y, z); });
    }
  }

  // Set dressing: small things that follow from the facts, each in its own stream, each claiming its ground.
  // The land has to be known first; nothing stands on a white void.
  const land = known("terrain") && !water;

  // Snow lies on things: a snowman in the mid-ground, caps on the big near rocks and on the broad tree canopies.
  view.reseed(13);
  if (v.weather === "snow" && land) {
    const at = claim(view, rand(-6, 6), rand(-11, -5), 0.8, clear);
    if (at) {
      const [x, z] = at, man = new THREE.Group(), BALL = new THREE.SphereGeometry(1, 8, 6);
      for (const [r, y] of [[0.5, 0.4], [0.36, 1.15], [0.26, 1.66]]) { const b = new THREE.Mesh(BALL, WHITE); b.scale.setScalar(r); b.position.y = y; man.add(b); } // the base dug in a little, for hillsides
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), flat(0xf07c2a));
      nose.position.set(0, 1.64, 0.36); nose.rotation.x = Math.PI / 2; man.add(nose);
      for (const sx of [-0.09, 0.09]) { const e = new THREE.Mesh(BALL, DARK); e.scale.setScalar(0.035); e.position.set(sx, 1.74, 0.22); man.add(e); }
      for (const s of [-1, 1]) man.add(bar(V(s * 0.3, 1.15, 0), V(s * 0.85, 1.55, 0.1), 0.025, DARK));
      if (rand(0, 1) < 0.5) { // a bowler
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.22, 8), DARK); hat.position.y = 1.98;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 8), DARK); brim.position.y = 1.88;
        man.add(hat, brim);
      } else { // a bobble hat
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.38, 7), flat(0xd94a4a)); hat.position.y = 2.0;
        const bob = new THREE.Mesh(BALL, WHITE); bob.scale.setScalar(0.07); bob.position.y = 2.2;
        man.add(hat, bob);
      }
      man.position.set(x, view.groundY(x, z), z); man.rotation.y = rand(-0.5, 0.5);
      add(man);
    }
    for (const [x, z, r, top] of nearRocks) { const c = new THREE.Mesh(BLOB, SNOWY); c.scale.set(r * 0.9, r * 0.2, r * 0.9); c.position.set(x, view.groundY(x, z) + top - r * 0.04, z); add(c); } // a flat drift over the top, not a second boulder
    // Only the nearer canopies, where it shows; conifers shed theirs.
    for (const { g, h, s, kind, z } of trees) if (kind && z > -10) {
      const c = new THREE.Mesh(BLOB, SNOWY);
      if (kind === 1) { c.scale.set(s * 0.7, s * 0.25, s * 0.7); c.position.y = h + s * 1.1; } else { c.scale.set(s, 0.12, s); c.position.y = h + 0.3; }
      g.add(c);
    }
  }

  // Rain leaves puddles, each with a slow ring now and then, and somebody's washing out between two trees
  // (not in a gale: it has long since blown away).
  view.reseed(14);
  if (v.weather === "rain" && land) {
    const pool = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x9fc4dc).lerp(sky, 0.4), roughness: 0.2, metalness: 0.4, flatShading: true });
    const PUDDLE = new THREE.CircleGeometry(1, 9), RING = new THREE.TorusGeometry(1, 0.02, 4, 16), hilly = v.terrain === "mountains" ? 0.6 : 1;
    for (let i = 0; i < 8; i++) {
      const at = claim(view, rand(-10, 10), -8 + rand(-5, 5), 0.9, clear);
      if (!at) continue;
      const [x, z] = at, y = view.groundY(x, z) + 0.03, up = slopeUp(x, z); // lying along the slope, or one side sinks in and the other floats
      const p = add(new THREE.Mesh(PUDDLE, pool), false);
      p.position.set(x, y, z); p.quaternion.setFromUnitVectors(V(0, 0, 1), up); p.rotateZ(rand(0, 6)); p.scale.set(rand(0.5, 1.1) * hilly, rand(0.35, 0.7) * hilly, 1);
      const r = add(new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })), false);
      r.quaternion.setFromUnitVectors(V(0, 0, 1), up); r.position.set(x, y + 0.01, z);
      const ph = rand(0, 4);
      view.movers.push((t) => { const k = (t * 0.5 + ph) % 2; r.scale.setScalar(0.05 + k * 0.2 * hilly); r.material.opacity = 0.6 * (1 - k / 2); });
    }
    if (v.wind !== "a gale") {
      // Two trees a few paces apart, preferably side on to us. The line is re-stretched every frame, since the trees sway.
      const near = trees.filter((t) => t.z > -14 && t.z < -3 && Math.abs(t.x) < 9); // where both cameras can see it
      let pair = null;
      const score = ([a, b]) => a.z + b.z + Math.abs(a.x - b.x); // the nearest pair, side on if possible
      for (const a of near) for (const b of near) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d > 1.8 && d < 6 && (!pair || score([a, b]) > score(pair))) pair = [a, b]; }
      if (pair) {
        const [a, b] = pair, y0 = Math.min(a.h, b.h) * 0.7;
        const end = (tr) => V(tr.x - Math.sin(tr.g.rotation.z) * y0, tr.g.position.y + Math.cos(tr.g.rotation.z) * y0, tr.z);
        const line = add(bar(end(a), end(b), 0.02, DARK), false), along = Math.atan2(a.z - b.z, b.x - a.x); // the shirts hang in the line's plane, swinging about it
        const shirts = [0.35, 0.65].map((f, i) => {
          const pv = add(new THREE.Group()), sh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.03), i ? WHITE : flat(0x7fb3d5));
          sh.position.y = -0.22; pv.add(sh); pv.rotation.set(0, along, 0, "YXZ");
          return [pv, f];
        });
        view.movers.push((t) => {
          const ea = end(a), eb = end(b);
          span(line, ea, eb);
          for (const [pv, f] of shirts) { pv.position.copy(ea).lerp(eb, f); pv.rotation.x = Math.sin(t * 2.5 + f * 9) * (W ? 0.5 : 0.15); }
        });
      }
    }
  }

  // Three suns call for a parasol and a deckchair, and cacti among the bushes.
  view.reseed(15);
  if (v.suns === "three suns" && land) {
    const at = claim(view, rand(-6, 6), rand(-10, -4), 1.3, clear);
    if (at) {
      const [x, z] = at, g = new THREE.Group(), canvas = flat(pick([0xe85d4a, 0xf2c14e, 0x4ea8de])), frame = flat(0xe8dcc8);
      g.add(bar(V(0.8, 0, 0), V(0.8, 1.9, 0), 0.025, frame));
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.4, 8), canvas); top.position.set(0.8, 1.85, 0); g.add(top);
      // The deckchair: seat and back of stretched canvas on two crossed pairs of legs, leaning back as a deckchair should.
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.7), canvas); seat.position.set(-0.3, 0.38, 0.1); seat.rotation.x = -0.3;
      // The back rises from the seat's rear edge (at y 0.28, z -0.23) and leans away from the sitter.
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.7), canvas); back.position.set(-0.3, 0.6, -0.4); back.rotation.x = 1.15;
      g.add(seat, back);
      // Each X: the front leg runs up under the seat to the foot of the back, the rear one up to under the seat's front edge.
      for (const sx of [-0.6, 0]) g.add(bar(V(sx, 0, 0.5), V(sx, 0.4, -0.3), 0.02, frame), bar(V(sx, 0, -0.5), V(sx, 0.47, 0.42), 0.02, frame));
      g.position.set(x, view.groundY(x, z), z); g.quaternion.setFromUnitVectors(UP, slopeUp(x, z)); g.rotateY(rand(-0.4, 0.4)); // sat on the slope, parasol and all
      add(g);
    }
    // Cacti: a column with an arm or two, all one instanced mesh. Half scorched like the bushes, half still defiantly green.
    const parts = [], CACTUS = new THREE.CylinderGeometry(1, 1, 1, 6);
    for (let i = 0; i < 7; i++) {
      const at = claim(view, rand(-14, 14), -9 + rand(-6, 6), 0.5, clear);
      if (!at) continue;
      const [x, z] = at, h = rand(0.8, 1.6), a = rand(0, 6), y = view.groundY(x, z);
      parts.push([x, y + h / 2, z, 0.14, h, null]);
      for (let k = rand(1, 3) | 0, s = pick([-1, 1]); k--; s = -s) {
        const ay = y + h * rand(0.35, 0.6), dir = V(Math.cos(a) * s, 0, -Math.sin(a) * s);
        parts.push([x + dir.x * 0.2, ay, z + dir.z * 0.2, 0.09, 0.4, dir], [x + dir.x * 0.38, ay + 0.22, z + dir.z * 0.38, 0.09, 0.5, null]);
      }
    }
    const im = add(new THREE.InstancedMesh(CACTUS, flat(new THREE.Color(P.leaf).lerp(tint(P.leaf), 0.5)), parts.length)), o = new THREE.Object3D();
    for (const [i, [x, y, z, r, len, dir]] of parts.entries()) {
      o.position.set(x, y, z); o.scale.set(r, len, r); o.quaternion.identity();
      if (dir) o.quaternion.setFromUnitVectors(UP, dir);
      o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    }
  }

  // A gale tumbles leaves past among the streaks, and has left a kite stuck in a tree.
  view.reseed(16);
  if (v.wind === "a gale" && land) {
    const n = 40, leaves = add(new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.leaf).multiplyScalar(v.suns === "no sun" ? 0.5 : 0.85), side: THREE.DoubleSide }), n), false);
    const o = new THREE.Object3D(), L = Array.from({ length: n }, () => ({ x: rand(-20, 20), y: rand(0.3, 5), z: rand(-12, 2), p: rand(0, 6), f: rand(2, 5) }));
    view.movers.push((t) => {
      for (const [i, l] of L.entries()) {
        l.x += W.speed * (0.7 + gust(t)) * DT;
        if (l.x > 20) { l.x = -20; l.y = rand(0.3, 5); }
        o.position.set(l.x, l.y + Math.sin(t * l.f * 0.5 + l.p) * 0.4, l.z); o.rotation.set(t * l.f + l.p, t * l.f * 0.7, 0);
        o.updateMatrix(); leaves.setMatrixAt(i, o.matrix);
      }
      leaves.instanceMatrix.needsUpdate = true;
    });
    // The kite went up in the gale and came down in the tallest tree in reach. It rides the tree's bending.
    const tree = trees.filter((t) => t.z > -12 && Math.abs(t.x) < 9).sort((a, b) => b.h - a.h)[0];
    if (tree) {
      const { g, h, s, kind } = tree, kite = new THREE.Group();
      const sail = new THREE.Mesh(new THREE.CircleGeometry(0.4, 4), new THREE.MeshStandardMaterial({ color: pick([0xff5c5c, 0xffc14d, 0x5cc8ff]), side: THREE.DoubleSide, flatShading: true }));
      sail.scale.set(0.8, 1.2, 1); kite.add(sail);
      const tail = [];
      for (let i = 1; i <= 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), WHITE); b.position.set(0.2 * i, -0.4 - 0.25 * i, 0); kite.add(b); tail.push(b); }
      kite.add(bar(V(0, -0.38, 0), V(0.75, -1.34, 0), 0.006, DARK)); // through the bows
      // Wedged into the camera side of the canopy: the upper cone, the big blob, or lying on the flat top.
      const [kx, ky, kz] = kind === 0 ? [0.15, h + s * 0.9, 0.7] : kind === 1 ? [0.2, h + s * 0.9, 0.8] : [0.2, h + 0.35, 0.75];
      kite.position.set(s * kx, ky, s * kz); kite.rotation.set(0.5, 0.3, -0.5);
      g.add(kite);
      view.movers.push((t) => { kite.rotation.z = -0.5 + Math.sin(t * 6) * 0.08; for (const [i, b] of tail.entries()) b.position.y = -0.4 - 0.25 * (i + 1) + Math.sin(t * 8 + i) * 0.05; });
    }
  }

  // At night somebody has made camp in the mid-ground: a fire whose light flickers over everything near it, and a tent.
  view.reseed(17);
  let fire = null;
  if (v.suns === "no sun" && land) {
    const at = claim(view, rand(-4, 4), rand(-8, -4.5), 1.0, clear);
    if (at) {
      const [x, z] = at, y = view.groundY(x, z), g = new THREE.Group(), log = flat(0x4a3526);
      const dy = (dx, dz) => view.groundY(x + dx, z + dz) - y; // logs and stones lie on the slope; the flames stay upright
      for (let i = 0; i < 3; i++) { const a = i * 1.05, c = Math.cos(a) * 0.35, s = Math.sin(a) * 0.35; g.add(bar(V(c, 0.06 + dy(c, s), s), V(-c, 0.06 + dy(-c, -s), -s), 0.06, log)); }
      const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.1, 0), flat(0x55505a), 8), o = new THREE.Object3D();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c = Math.cos(a) * 0.55, s = Math.sin(a) * 0.55; o.position.set(c, 0.06 + dy(c, s), s); o.rotation.set(rand(0, 6), rand(0, 6), 0); o.scale.setScalar(rand(0.7, 1.2)); o.updateMatrix(); stones.setMatrixAt(i, o.matrix); }
      g.add(stones);
      const flames = [0xff7a2a, 0xffd166].map((c, i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.2 - i * 0.08, 0.55 - i * 0.15, 5).translate(0, (0.55 - i * 0.15) / 2, 0), new THREE.MeshBasicMaterial({ color: c })); f.position.y = 0.12; g.add(f); return f; });
      const light = new THREE.PointLight(0xff9a4a, 8, 10, 2); light.position.y = 0.7; g.add(light);
      g.position.set(x, y, z); add(g);
      fire = V(x, y, z);
      view.movers.push((t) => {
        const k = 0.75 + 0.25 * Math.sin(t * 11) * Math.sin(t * 7.3 + 1) + 0.1 * Math.sin(t * 23);
        light.intensity = 8 * k;
        for (const [i, f] of flames.entries()) { f.scale.y = 0.6 + 0.5 * k + i * 0.1; f.rotation.y = t * (2 + i); }
      });
      // The tent a little way off, door towards us.
      const ts = claim(view, x + rand(-2.5, 2.5), z - rand(1.3, 2.2), 1.1, clear);
      if (ts) {
        const [tx, tz] = ts, tent = new THREE.Group(), cloth = flat(new THREE.Color(pick([0xe07a5f, 0x5b8c5a, 0xf2cc8f])).multiplyScalar(0.7));
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.6, 3), cloth); body.rotation.x = -Math.PI / 2; body.position.y = 0.42;
        const door = new THREE.Mesh(new THREE.CircleGeometry(0.3, 3), DARK); door.rotation.z = Math.PI / 2; door.position.set(0, 0.15, 0.81); // its sill on the ground
        tent.add(body, door);
        tent.position.set(tx, view.groundY(tx, tz), tz); tent.quaternion.setFromUnitVectors(UP, slopeUp(tx, tz)); tent.rotateY(rand(-0.3, 0.3)); // pitched on the slope
        add(tent);
      }
    }
  }

  // With no wind the smoke goes straight up.
  view.reseed(18);
  if (fire && v.wind === "still") {
    const puff = dot([[0, "rgba(200,200,210,.55)"], [1, "rgba(200,200,210,0)"]]);
    for (let i = 0; i < 6; i++) {
      const s = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false })), false), p = i / 6;
      view.movers.push((t) => { const k = (t * 0.25 + p) % 1; s.position.set(fire.x + Math.sin(k * 7 + i) * 0.1, fire.y + 0.6 + k * 3, fire.z); s.scale.setScalar(0.3 + k * 0.9); s.material.opacity = 0.5 * (1 - k); });
    }
  }

  // On water: a rowing boat bobbing about, a buoy or two, and a lighthouse away on the horizon.
  view.reseed(19);
  if (water) {
    const at = claim(view, rand(-8, 8), rand(-11, -5), 1.3, clear);
    if (at) {
      const [x, z] = at, boat = new THREE.Group(), wood = flat(0x8a5a3a);
      // Half a cylinder, open side up, is a hull; double-sided so we can see into it. It rides with its floor just clear
      // of the water, since the water is drawn right through anything below it, and nobody wants a flooded boat.
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 1.7, 5, 1, false, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0xc8553d, flatShading: true, side: THREE.DoubleSide }));
      hull.rotation.x = Math.PI / 2; hull.position.y = 0.47;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.22), wood); seat.position.y = 0.39; // flush with the sides
      boat.add(hull, seat);
      const oars = [-1, 1].map((s) => {
        const pv = new THREE.Group(); pv.position.set(s * 0.4, 0.47, 0); // the rowlock, on the gunwale
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.3), wood); blade.position.set(s * 1.0, -0.4, 0.3);
        pv.add(bar(V(-s * 0.35, 0.15, 0), V(s * 1.0, -0.4, 0.3), 0.02, wood), blade); boat.add(pv); // handle inboard over the seat, blade in the water
        return pv;
      });
      boat.position.set(x, 0, z); boat.rotation.y = rand(-0.6, 0.6);
      add(boat);
      view.movers.push((t) => {
        boat.position.y = wave(x, z, t);
        boat.rotation.z = (wave(x + 0.6, z, t) - wave(x - 0.6, z, t)) * 1.2; boat.rotation.x = (wave(x, z - 0.6, t) - wave(x, z + 0.6, t)) * 1.2;
        for (const [i, pv] of oars.entries()) pv.rotation.y = Math.sin(t * 1.4) * 0.35 * (i ? -1 : 1);
      });
    }
    for (let i = 0; i < 2; i++) {
      const b = claim(view, rand(-12, 12), rand(-13, -4), 0.5, clear);
      if (!b) continue;
      const [bx, bz] = b, buoy = new THREE.Group();
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.35, 6), flat(0xe0442e)); can.position.y = 0.12;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 5), DARK); lamp.position.y = 0.36;
      buoy.add(can, lamp); buoy.position.set(bx, 0, bz); add(buoy);
      view.movers.push((t) => { buoy.position.y = wave(bx, bz, t); buoy.rotation.z = Math.sin(t * 1.3 + i) * 0.12; });
    }
    // The lighthouse on its rock, flashing away at nobody.
    const lx = pick([-1, 1]) * rand(10, 18), lz = -30, house = new THREE.Group();
    const rock = new THREE.Mesh(BLOB, flat(new THREE.Color(P.rock).lerp(sky, 0.4))); rock.scale.set(2.2, 0.9, 2.2);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 8), flat(0xf4f1e8)); tower.position.y = 2.3;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.6, 8), flat(0xe0442e)); band.position.y = 3.3;
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 8), DARK); lantern.position.y = 4.5;
    const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot([[0, "rgba(255,250,200,1)"], [1, "rgba(255,250,200,0)"]]), transparent: true, depthWrite: false, fog: false })); beam.position.y = 4.5; beam.scale.setScalar(2.5);
    house.add(rock, tower, band, lantern, beam); house.position.set(lx, 0, lz);
    add(house, false);
    view.movers.push((t) => { beam.material.opacity = Math.pow(Math.max(0, Math.sin(t * 1.5)), 12); });
  }

  // Mountains: a flag on the tallest of the near peaks, for whoever got up there first.
  view.reseed(20);
  if (peaks.length) {
    const [m, hgt] = peaks.reduce((a, b) => (b[1] > a[1] ? b : a)), top = V(m.position.x, m.position.y + hgt / 2, m.position.z);
    add(bar(top, top.clone().add(V(0, 0.9, 0)), 0.03, DARK), false);
    const pv = add(new THREE.Group(), false), flag = new THREE.Mesh(new THREE.CircleGeometry(0.35, 3), new THREE.MeshBasicMaterial({ color: 0xe0442e, side: THREE.DoubleSide }));
    flag.position.x = 0.2; pv.add(flag); pv.position.copy(top).add(V(0, 0.6, 0)); // its top corner at the pole's top, not above it
    view.movers.push((t) => { pv.rotation.y = Math.sin(t * (W ? 6 : 2)) * 0.4; });
  }
}
