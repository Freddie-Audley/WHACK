import * as THREE from "three";

const flat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
// Random numbers come from `rng`. While a world is being built it is seeded, so a world rebuilt
// with one more fact keeps its palette and layout: things get added, nothing shuffles.
let rng = Math.random;
const rand = (a, b) => a + rng() * (b - a);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const seeded = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const col = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);
const DT = 0.016;

// Calm palettes: sky, ground, foliage, stone. A world picks one at random.
const PALETTES = [
  { sky: 0xcfe3f2, ground: 0x94b86b, leaf: 0x4d8a4a, rock: 0x8f8577 },
  { sky: 0xe9ddc9, ground: 0xc9a35e, leaf: 0xd0683a, rock: 0x7f6f66 },
  { sky: 0xd8c3d9, ground: 0x7d8f7a, leaf: 0x3f6b63, rock: 0x6b5f73 },
  { sky: 0xf1e4cf, ground: 0xe0b983, leaf: 0x7f9c5a, rock: 0xa86f4f },
  { sky: 0xdde8ee, ground: 0xb9c6b4, leaf: 0x5c7f8e, rock: 0x7c8891 },
  { sky: 0xd2ecef, ground: 0xa6cf8f, leaf: 0xe0a04f, rock: 0x6c7f8f },
];
// Earth's own colours: blue sky, green grass and trees, grey stone.
export const EARTH_COLOURS = { sky: 0x9fd0f2, ground: 0x6fae4f, leaf: 0x2f7d3a, rock: 0x8a8f96 };
const TRUNK = 0x7a5a3e;

const DOWN = [0, -9, 0]; // gravity, for falling rocks
const gust = (t) => 0.5 + 0.5 * Math.sin(t * 0.8) * Math.sin(t * 0.31 + 1);

const shade = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };

// A world built from facts, viewed from a fixed camera.
export class WorldView {
  constructor(container, { camera = [0, 2.4, 7.6], lookAt = [0, 2.0, 0], fov = 38, palette = null } = {}) {
    this.palette = palette; // null: a random calm palette
    this.t = 0;
    this.movers = [];
    this.container = container;
    const w = container.clientWidth || 300, h = container.clientHeight || 225;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcfe9ff);
    this.scene.fog = new THREE.Fog(0xcfe9ff, 22, 55);
    this.camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 100);
    this.camHome = new THREE.Vector3(...camera);
    this.lookHome = new THREE.Vector3(...lookAt);
    this.look = this.lookHome.clone();
    this.camera.position.copy(this.camHome);
    this.camera.lookAt(this.look);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8c8a8, 1.0);
    this.sun = new THREE.DirectionalLight(0xfff4d6, 2.0);
    this.sun.position.set(10, 16, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
    this.sun.shadow.bias = -0.001;
    this.scene.add(this.hemi, this.sun);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.seed = (Math.random() * 1e9) | 0;
    this.showWorld({});

    new ResizeObserver(() => this.resize()).observe(container);
    this.animate();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // A rock that obeys the world's gravity: rests, falls and bounces, lifts off, rolls sideways, or tumbles freely.
  // `home` places it afresh; the first few seconds are simulated up front so rocks start out of step.
  rock(mesh, r, g, home, { respawnWhenResting = false } = {}) {
    const p = mesh.position, vel = new THREE.Vector3();
    const free = !g[0] && !g[1], grounded = !free && g[1] <= 0;
    let rest = 0;
    const reset = () => { home(p, vel); rest = 0; if (free) vel.set(rand(-0.4, 0.4), rand(-0.25, 0.25), rand(-0.25, 0.25)); };
    const step = () => {
      vel.x += g[0] * DT; vel.y += g[1] * DT; vel.z += g[2] * DT;
      p.addScaledVector(vel, DT);
      let onFloor = false;
      if (grounded) {
        const floor = this.groundY(p.x, p.z) + r * 0.8;
        if (p.y <= floor + 0.001) {
          onFloor = true;
          p.y = floor;
          vel.y = vel.y < -1.5 ? -vel.y * 0.35 : 0;
          vel.x *= 0.97; vel.z *= 0.97;
        }
      }
      mesh.rotation.z -= vel.x * DT / r;
      mesh.rotation.x += vel.z * DT / r + (onFloor ? 0 : DT * 0.8);
      if (respawnWhenResting && onFloor && vel.length() < 0.05 && (rest += DT) > 2.5) reset();
      if (p.y > 16 || p.y < -1 || Math.abs(p.x) > 17 || p.z > 3 || p.z < -22) reset();
    };
    reset();
    for (let i = rand(0, 500) | 0; i--;) step();
    return step;
  }

  // Rebuild the backdrop from facts {suns, wind, animals, terrain, weather}. An unknown fact leaves its
  // part of the world white: no facts at all is a blank white void, and each fact paints its own piece in.
  // Palette, tree shapes, moons and rings are random (per view), so no two worlds look the same.
  showWorld(v) {
    this.world.clear();
    this.movers = [];
    const add = (m, shadows = true) => { this.world.add(shadows ? shade(m) : m); return m; };
    const known = (k) => v[k] != null;
    const reseed = (k) => { rng = seeded(this.seed + k); }; // each section draws from its own stream
    reseed(0);
    const P = this.palette ?? pick(PALETTES);
    // How hard the wind blows: trees bend by `bend` plus a gusting `sway`; streaks fly past at `speed`.
    const W = { "a breeze": { bend: 0.04, sway: 0.08, streaks: 6, speed: 4 }, "a gale": { bend: 0.22, sway: 0.3, streaks: 40, speed: 16 } }[v.wind];

    let sky = new THREE.Color(known("suns") ? P.sky : 0xffffff);
    if (v.suns === "no sun") sky = new THREE.Color(0x2f2b55);
    if (v.suns === "two suns") sky.lerp(new THREE.Color(0xf3d2a0), 0.4);
    if (v.suns === "three suns") sky.lerp(new THREE.Color(0xff9a5c), 0.65);
    if (v.weather === "snow") sky.lerp(new THREE.Color(0xdfe4ea), 0.6);
    if (v.weather === "rain") sky.lerp(new THREE.Color(0x8e98a6), 0.3);
    this.scene.background = sky;
    this.scene.fog.color = sky;
    this.hemi.color = sky.clone().lerp(new THREE.Color(0xffffff), 0.5);
    this.hemi.intensity = v.suns === "no sun" ? 0.5 : 1.0;
    this.sun.intensity = v.suns === "no sun" ? 0.7 : 2.0;
    this.sun.color.set(v.suns === "no sun" ? 0xb8c4ff : 0xfff4d6);

    // Ground: gently uneven unless flat, water or pitted (or not yet known); always level near the camera.
    reseed(1);
    const amp = v.terrain === "mountains" ? 0.35 : 0;
    this.groundY = (x, z) => {
      if (!amp) return 0;
      const k = Math.min(1, Math.max(0, (Math.hypot(x, z) - 2) / 4));
      return amp * k * (Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.38) + 0.6 * Math.sin(x * 0.9 - z * 0.7));
    };
    const groundColour = new THREE.Color(!known("terrain") ? 0xffffff : v.terrain === "water" ? 0x6fb7d9 : P.ground);
    if (v.weather === "snow") groundColour.lerp(new THREE.Color(0xffffff), 0.75);
    if (v.suns === "three suns") groundColour.lerp(new THREE.Color(0xd98a4a), 0.5); // scorched
    if (v.suns === "no sun") groundColour.multiplyScalar(0.6);
    const geo = new THREE.PlaneGeometry(70, 70, 56, 56);
    const gp = geo.attributes.position;
    for (let i = 0; i < gp.count; i++) gp.setZ(i, this.groundY(gp.getX(i), -gp.getY(i)));
    geo.computeVertexNormals();
    const ground = add(new THREE.Mesh(geo, flat(groundColour)), false);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;

    if (v.terrain === "mountains") for (let i = 0; i < 16; i++) {
      const hgt = rand(7, 17), x = -26 + i * 3.5 + rand(-1, 1), z = rand(-26, -16);
      const m = add(new THREE.Mesh(new THREE.ConeGeometry(rand(3, 6), hgt, (rand(5, 8) | 0)), flat(new THREE.Color(i % 2 ? P.rock : P.leaf).lerp(sky, 0.35))));
      m.position.set(x, hgt / 2 - 0.5, z);
      m.rotation.y = rand(0, 6);
    }
    const holes = []; // where the holes are, so snakes can live in them
    if (v.terrain === "holes") {
      const rim = flat(new THREE.Color(P.ground).multiplyScalar(0.8)), pit = flat(0x2a2540);
      for (let i = 0; i < 30; i++) {
        const r = rand(0.5, 1.4), x = rand(-13, 13), z = rand(-13, -1);
        holes.push({ x, z });
        const h = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.5, 9), pit));
        h.position.set(x, -0.24, z);
        const ring = add(new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.1, 5, 12), rim));
        ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, z);
      }
    }
    if (v.terrain === "water") for (let i = 0; i < 20; i++) {
      const r = add(new THREE.Mesh(new THREE.TorusGeometry(rand(0.4, 1.2), 0.03, 4, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })), false);
      r.rotation.x = -Math.PI / 2;
      const x = rand(-14, 14), z = rand(-14, -1), p = rand(0, 6);
      this.movers.push((t) => { const k = (t * 0.35 + p) % 3; r.scale.setScalar(0.3 + k); r.position.set(x, 0.03, z); r.material.opacity = 0.7 * (1 - k / 3); });
    }

    // Suns, moon, ring, stars: flat discs far away, untouched by fog. The sky stays empty until the suns are known.
    reseed(2);
    const disc = (r, colour, opacity = 1) => new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: colour, fog: false, transparent: opacity < 1, opacity }));
    const n = { "no sun": 0, "one sun": 1, "two suns": 2, "three suns": 3 }[v.suns] ?? 0;
    const tints = [0xfff1a8, 0xffb38a, 0xc8f0ff];
    for (let i = 0; i < n; i++) {
      const r = rand(1.4, 2.4), x = -9 + i * 8 + rand(-1, 1), y = rand(8, 12);
      add(disc(r, tints[i]), false).position.set(x, y, -30);
      add(disc(r * 1.7, tints[i], 0.25), false).position.set(x, y, -30.1);
    }
    if (known("suns") && rng() < 0.5) add(disc(rand(0.5, 1.1), 0xf4f1e8, 0.9), false).position.set(rand(-14, 14), rand(9, 13), -29);
    if (known("suns") && rng() < 0.35) {
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(rand(4, 7), 0.12, 4, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.leaf).lerp(sky, 0.5), fog: false })), false);
      ring.position.set(rand(-6, 6), 11, -31); ring.rotation.x = rand(1.1, 1.4);
    }
    if (v.suns === "no sun") add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
      new THREE.Float32BufferAttribute(Array.from({ length: 500 }, () => [rand(-40, 40), rand(4, 30), rand(-40, -10)]).flat(), 3)),
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, fog: false })), false);

    // Trees in clumps, of one random shape, once the terrain is known. They bend in the wind.
    reseed(3);
    if (known("terrain") && v.terrain !== "water") {
      const leaf = flat(P.leaf), trunk = flat(TRUNK);
      const kind = (rng() * 3) | 0;
      for (let k = 0; k < 5; k++) {
        const cx = rand(-15, 15), cz = rand(-15, -4);
        for (let i = rand(2, 5) | 0; i--;) {
          const tree = new THREE.Group();
          const h = rand(1.5, 3.5), s = rand(0.8, 1.2);
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, h, 5), trunk);
          stem.position.y = h / 2;
          const top = new THREE.Mesh(kind === 0 ? new THREE.ConeGeometry(0.8 * s, 1.8 * s, 6) : kind === 1 ? new THREE.IcosahedronGeometry(0.9 * s, 0) : new THREE.CylinderGeometry(1.1 * s, 0.9 * s, 0.4, 7), leaf);
          top.position.y = h + 0.4 * s;
          top.rotation.y = rand(0, 6);
          tree.add(stem, top);
          const x = cx + rand(-2.5, 2.5), z = cz + rand(-2, 2);
          tree.position.set(x, this.groundY(x, z) - 0.05, z);
          tree.rotation.z = rand(-0.06, 0.06);
          add(tree);
          const p = rand(0, 6);
          if (W) this.movers.push((t) => { tree.rotation.z = -(W.bend + gust(t) * W.sway) + Math.sin(t * 2.2 + p) * 0.03; });
        }
      }
    }

    // Animals, and how each copes with the terrain and the wind. On water: cows swim up to their bellies, snails
    // float shell-up, fish leap, octopuses peek out, snakes swim with their heads up. On land: fish flop about gasping,
    // and octopuses wear fishbowls. In holes, snakes pop up, sway, and duck back down.
    // In a gale the birds flap flat out and still get blown backwards.
    reseed(5);
    const dark = flat(0x3a3560), white = flat(0xffffff);
    const water = v.terrain === "water";
    const googly = (r, x, y, z) => { // a white eye with a pupil, looking along +z
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), white);
      eye.position.set(x, y, z);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 5, 4), dark);
      pupil.position.z = r * 0.7;
      eye.add(pupil);
      return eye;
    };
    if (v.animals === "cows") {
      const hide = flat(0xf4f1ea), nose = flat(0xe9a6a6);
      for (let i = 0; i < 6; i++) {
        const cow = new THREE.Group(), head = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75, 0.7), hide);
        body.position.y = 0.85;
        cow.add(body);
        for (const [sx, sz] of [[-0.5, -0.22], [0.5, -0.22], [-0.5, 0.22], [0.5, 0.22]]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), dark);
          leg.position.set(sx, 0.25, sz);
          cow.add(leg);
        }
        for (let k = 0; k < 3; k++) {
          const spot = new THREE.Mesh(new THREE.BoxGeometry(rand(0.25, 0.45), rand(0.2, 0.35), 0.72), dark);
          spot.position.set(rand(-0.45, 0.45), rand(0.75, 1.0), 0);
          cow.add(spot);
        }
        const skull = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 0.42), hide);
        skull.position.x = 0.25;
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.24, 0.36), nose);
        snout.position.set(0.52, -0.08, 0);
        head.add(skull, snout);
        for (const sz of [-0.15, 0.15]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), dark);
          horn.position.set(0.2, 0.28, sz);
          head.add(horn);
        }
        head.position.set(0.6, 1.1, 0);
        cow.add(head);
        const x0 = rand(-12, 12), z = rand(-13, -3), p = rand(0, 6);
        cow.position.set(x0, this.groundY(x0, z), z);
        cow.rotation.y = rand(0, 6);
        add(cow);
        if (water) this.movers.push((t) => { // swimming: in up to the belly, chin up, drifting
          cow.position.set(x0 + Math.sin(t * 0.2 + p) * 1.5, -0.6 + Math.sin(t * 1.5 + p) * 0.06, z);
          head.rotation.z = 0.25;
        });
        else this.movers.push((t) => { head.rotation.z = -0.7 * Math.max(0, Math.sin(t * 0.5 + p)); }); // head down to graze, now and then
      }
    }
    if (v.animals === "birds") {
      const bodyGeo = new THREE.ConeGeometry(0.12, 0.6, 5), wingGeo = new THREE.BoxGeometry(0.5, 0.03, 0.25);
      const gale = v.wind === "a gale";
      for (let k = 0; k < 2; k++) {
        const cx = rand(-5, 5), cy = rand(4.5, 6.5), cz = rand(-14, -8);
        for (let i = 0; i < 7; i++) {
          const bird = new THREE.Group(), body = new THREE.Mesh(bodyGeo, dark);
          body.rotation.x = Math.PI / 2; // beak forward, along +z
          bird.add(body);
          const wings = [-1, 1].map((sx) => {
            const pivot = new THREE.Group(), wing = new THREE.Mesh(wingGeo, dark);
            wing.position.x = sx * 0.25;
            pivot.add(wing);
            bird.add(pivot);
            return pivot;
          });
          bird.scale.setScalar(1.5);
          add(bird);
          const R = rand(2, 4), w = rand(0.4, 0.7) * (k ? -1 : 1), p = rand(0, 6), dy = rand(-1, 1);
          this.movers.push((t) => {
            const a = t * w + p, f = Math.sin(t * (gale ? 22 : 12) + p) * 0.6;
            if (gale) { // facing into the wind, going backwards
              const x = ((cx + R * Math.cos(a) * 0.4 + t * 2.5 + 20) % 40 + 40) % 40 - 20;
              bird.position.set(x, cy + dy + Math.sin(t * 3 + p) * 0.4, cz + R * Math.sin(a) * 0.3);
              bird.rotation.set(Math.sin(t * 4 + p) * 0.2, -Math.PI / 2, Math.sin(t * 5 + p) * 0.3);
            } else {
              bird.position.set(cx + R * Math.cos(a), cy + dy + Math.sin(t * 1.3 + p) * 0.3, cz + R * Math.sin(a) * 0.6);
              bird.rotation.y = -a + (w < 0 ? Math.PI : 0);
            }
            wings[0].rotation.z = -f; wings[1].rotation.z = f;
          });
        }
      }
    }
    if (v.animals === "fish") {
      const scales = flat(0xf08a3c), bodyGeo = new THREE.SphereGeometry(0.3, 7, 5), tailGeo = new THREE.ConeGeometry(0.2, 0.3, 4), mouthGeo = new THREE.SphereGeometry(0.08, 5, 4);
      for (let i = 0; i < 10; i++) {
        const fish = new THREE.Group(), body = new THREE.Mesh(bodyGeo, scales), tail = new THREE.Mesh(tailGeo, scales), mouth = new THREE.Mesh(mouthGeo, dark);
        body.scale.set(1.6, 1, 0.6);
        tail.rotation.z = -Math.PI / 2;
        tail.position.x = -0.6;
        mouth.position.x = 0.47;
        fish.add(body, tail, mouth);
        for (const sz of [-1, 1]) { const eye = googly(0.08, 0.25, 0.08, sz * 0.15); eye.rotation.y = sz > 0 ? 0 : Math.PI; fish.add(eye); }
        fish.scale.setScalar(1.3);
        fish.rotation.order = "YXZ"; // yaw, then roll about its own length, then pitch
        add(fish);
        const x0 = rand(-12, 12), z = rand(-12, -2), y0 = this.groundY(x0, z), T = rand(2.5, 4), p = rand(0, 10), h = rand(1.2, 2.5);
        if (water) this.movers.push((t) => {
          // Leap back and forth between two spots, waiting under water in between.
          const n = Math.floor((t + p) / T), u = (t + p) / T - n, d = n % 2 ? -1 : 1, a = Math.min(1, u / 0.45);
          fish.position.set(x0 + d * (2 * a - 1), u < 0.45 ? 4 * h * a * (1 - a) : -0.6, z);
          fish.rotation.set(0, d > 0 ? 0 : Math.PI, Math.atan(2 * h * (1 - 2 * a)));
        });
        else this.movers.push((t) => {
          // Out of water: lying on its side, gasping, and every so often a hopeless flip onto the other side.
          const F = 1.4, n = Math.floor((t + p) / F), u = (t + p) / F - n, flip = Math.min(1, u / 0.3);
          fish.position.set(x0, y0 + 0.25 + (u < 0.3 ? Math.sin(flip * Math.PI) * 0.6 : 0), z);
          fish.rotation.set(Math.PI / 2 + Math.PI * (n + flip), Math.sin(n * 12.9898 + p) * 1.2, 0);
          mouth.scale.y = 0.4 + Math.abs(Math.sin(t * 6 + p)) * 1.4;
        });
      }
    }
    if (v.animals === "snails") {
      const shellMat = flat(0xd9a05b), skin = flat(0xc9cf8a);
      for (let i = 0; i < 4; i++) {
        const snail = new THREE.Group(), stalks = [];
        const foot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.55), skin);
        foot.position.y = 0.15;
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.75, 9, 7), shellMat);
        shell.position.set(-0.2, 0.85, 0);
        shell.scale.z = 0.7;
        snail.add(foot, shell);
        for (const sz of [-1, 1]) { // a spiral on each side of the shell
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 4, 12), dark);
          ring.position.set(-0.2, 0.85, sz * 0.48);
          snail.add(ring);
        }
        for (const sz of [-0.12, 0.12]) {
          const stalk = new THREE.Group();
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 5), skin);
          rod.position.y = 0.3;
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), dark);
          eye.position.y = 0.62;
          stalk.add(rod, eye);
          stalk.position.set(0.8, 0.3, sz);
          stalk.rotation.x = sz * 2;
          snail.add(stalk);
          stalks.push(stalk);
        }
        snail.scale.setScalar(1.4);
        const x0 = rand(-11, 11), z = rand(-12, -3), p = rand(0, 6), d = rng() < 0.5 ? 1 : -1;
        snail.rotation.y = d > 0 ? 0 : Math.PI;
        add(snail);
        this.movers.push((t) => {
          const x = x0 + d * (((t * 0.15 + p) % 6) - 3); // a long, slow crawl, or a long, slow drift
          snail.position.set(x, water ? -0.35 + Math.sin(t * 1.4 + p) * 0.08 : this.groundY(x, z), z);
          snail.rotation.z = water ? Math.sin(t * 1.1 + p) * 0.12 : 0;
          stalks.forEach((s, k) => { s.rotation.z = -0.25 + Math.sin(t * 1.5 + p + k * 2) * 0.2; });
        });
      }
    }
    if (v.animals === "octopuses") {
      const skin = flat(0xb565a7), armGeo = new THREE.CylinderGeometry(0.07, 0.12, 0.9, 5);
      const glass = new THREE.MeshStandardMaterial({ color: 0xd8f2ff, transparent: true, opacity: 0.3, depthWrite: false });
      const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), bubbleGeo = new THREE.SphereGeometry(0.06, 5, 4);
      for (let i = 0; i < 5; i++) {
        const octo = new THREE.Group(), arms = [], bubbles = [];
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 9, 7), skin);
        head.scale.y = 1.25;
        head.position.y = 1.3;
        octo.add(head, googly(0.14, -0.2, 1.25, 0.48), googly(0.14, 0.2, 1.25, 0.48));
        for (let k = 0; k < 8; k++) { // arms splay outwards all round, each in its own plane
          const a = k / 8 * Math.PI * 2, pivot = new THREE.Group(), arm = new THREE.Mesh(armGeo, skin);
          arm.position.y = -0.45;
          pivot.add(arm);
          pivot.position.set(Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3);
          pivot.rotation.y = -a;
          octo.add(pivot);
          arms.push(pivot);
        }
        if (!water) { // on land it wears a fishbowl, with bubbles going up
          const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10), glass);
          bowl.position.y = 1.35;
          octo.add(bowl);
          for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(bubbleGeo, bubbleMat); octo.add(b); bubbles.push(b); }
        }
        octo.scale.setScalar(1.2);
        const x0 = rand(-11, 11), z = rand(-12, -3), p = rand(0, 6);
        octo.rotation.y = rand(-0.5, 0.5);
        add(octo);
        octo.traverse((o) => { if (o.material === glass || o.material === bubbleMat) o.castShadow = false; }); // glass casts no shadow
        if (water) this.movers.push((t) => { // just the top of its head and its eyes above the surface, now and then ducking under
          octo.position.set(x0 + Math.sin(t * 0.3 + p) * 2, -1.3 + Math.sin(t * 0.9 + p) * 0.3, z);
        });
        else this.movers.push((t) => { // a wobbly, unsteady walk, arms flailing
          const x = x0 + Math.sin(t * 0.3 + p) * 2;
          octo.position.set(x, this.groundY(x, z) + Math.abs(Math.sin(t * 2 + p)) * 0.15, z);
          octo.rotation.z = Math.sin(t * 2 + p) * 0.12;
          arms.forEach((arm, k) => { arm.rotation.z = 0.6 + Math.sin(t * 6 + k * 1.7 + p) * 0.4; });
          bubbles.forEach((b, k) => { const u = (t * 0.5 + k / 3 + p) % 1; b.position.set(Math.sin(u * 9 + k) * 0.2, 1.0 + u * 0.9, 0.7); });
        });
      }
    }
    if (v.animals === "snakes") {
      const skin = flat(0x5f9e45), band = flat(0xe0c050), red = flat(0xd8434f);
      const N = 16, R = 0.24, segGeo = new THREE.SphereGeometry(R, 7, 5);
      const size = (k) => 1 - (k / N) * 0.7, gap = [0.3]; // how far behind the head each segment is: touching all the way down
      for (let k = 1; k < N; k++) gap[k] = gap[k - 1] + R * (size(k - 1) + size(k)) * 0.85;
      for (let i = 0; i < 6; i++) {
        const snake = new THREE.Group(), segs = [];
        for (let k = 0; k < N; k++) { // tapering to the tail
          const seg = new THREE.Mesh(segGeo, k % 3 === 2 ? band : skin);
          seg.scale.setScalar(size(k));
          snake.add(seg);
          segs.push(seg);
        }
        const head = new THREE.Group(), skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skin);
        skull.scale.set(1.4, 0.75, 1);
        head.add(skull);
        for (const sz of [-1, 1]) { const eye = googly(0.09, 0.12, 0.15, sz * 0.2); eye.rotation.y = sz > 0 ? 0.8 : Math.PI - 0.8; head.add(eye); }
        const tongue = new THREE.Group(), stem = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.04), red);
        stem.position.x = 0.15;
        tongue.add(stem);
        for (const a of [-0.5, 0.5]) { // the fork
          const prong = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), red);
          prong.position.set(0.34, 0, a * 0.08);
          prong.rotation.y = -a;
          tongue.add(prong);
        }
        tongue.position.set(0.38, -0.05, 0);
        head.add(tongue);
        snake.add(head);
        add(snake);
        const p = rand(0, 20), flick = (t) => { tongue.scale.x = Math.sin(t * 1.3 + p) > 0.5 ? Math.abs(Math.sin(t * 25)) : 0.01; };
        const hole = holes.length ? holes.splice((rng() * holes.length) | 0, 1)[0] : null;
        if (hole) this.movers.push((t) => {
          // Pops up out of its hole, sways at whoever is watching, then ducks back down.
          const T = 4 + (p % 2), u = ((t + p) / T) % 1;
          const H = -0.4 + 2.1 * (u < 0.08 ? u / 0.08 : u < 0.7 ? 1 : u < 0.76 ? 1 - (u - 0.7) / 0.06 : 0); // head height; down below the rim
          const sway = (y) => Math.max(0, y) * 0.2 * Math.sin(t * 2.2 + p - y);
          segs.forEach((s, k) => { const y = H - gap[k]; s.position.set(hole.x + sway(y), y, hole.z); });
          head.position.set(hole.x + sway(H), H, hole.z);
          head.rotation.set(0, -Math.PI / 2, -sway(H) * 0.6); // facing the camera
          flick(t);
        });
        else {
          // Slithers along, its body following the same S-shaped path its head took; in water, head up, swimming.
          const z = rand(-12, -3), d = rng() < 0.5 ? 1 : -1, A = 0.35, c = 1.6;
          this.movers.push((t) => {
            const s = t * 0.9 + p, x = d * ((s % 32) - 16);
            const y = (k, wx) => water ? 0.02 + Math.max(0, 3 - k) * 0.12 : this.groundY(wx, z) + R * segs[k].scale.x;
            segs.forEach((seg, k) => { const wx = x - d * gap[k]; seg.position.set(wx, y(k, wx), z + d * A * Math.sin(c * (s - gap[k]))); });
            head.position.set(x, water ? 0.5 : this.groundY(x, z) + 0.25, z + d * A * Math.sin(c * s));
            head.rotation.set(0, (d > 0 ? 0 : Math.PI) - Math.atan(A * c * Math.cos(c * s)), 0);
            flick(t);
          });
        }
      }
    }

    // Wind: streaks blowing past.
    reseed(6);
    if (W) for (let i = 0; i < W.streaks; i++) {
      const s = add(new THREE.Mesh(new THREE.BoxGeometry(rand(2, 4), 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })), false);
      const y = rand(0.5, 7), z = rand(-12, 1);
      let x = rand(-20, 20);
      this.movers.push((t) => { x += W.speed * (1 + gust(t)) * DT; if (x > 20) x = -20; s.position.set(x, y + Math.sin(t * 3 + i) * 0.1, z); });
    }

    // Weather
    reseed(7);
    if (v.weather === "rain") {
      const count = 500, pos = new Float32Array(count * 6);
      for (let i = 0; i < count; i++) { const x = rand(-18, 18), y = rand(0, 14), z = rand(-18, 4); pos.set([x, y, z, x, y + 0.4, z], i * 6); }
      const rain = add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
        new THREE.LineBasicMaterial({ color: 0x5f7390, transparent: true, opacity: 0.6 })), false);
      this.movers.push(() => {
        const a = rain.geometry.attributes.position.array;
        for (let i = 0; i < count; i++) { const y = (a[i * 6 + 1] - 0.22 + 14) % 14; a[i * 6 + 1] = y; a[i * 6 + 4] = y + 0.4; }
        rain.geometry.attributes.position.needsUpdate = true;
      });
    }
    if (v.weather === "rocks") for (let i = 0; i < 24; i++) {
      const r = rand(0.4, 1.1);
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), flat(0x8c8498)));
      this.movers.push(this.rock(m, r, DOWN, (p, vel) => { p.set(rand(-12, 12), rand(12, 18), rand(-12, -2)); vel.set(rand(-0.5, 0.5), 0, 0); }, { respawnWhenResting: true }));
    }
    if (v.weather === "snow") {
      const count = 600, pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) pos.set([rand(-18, 18), rand(0, 14), rand(-18, 4)], i * 3);
      const snow = add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.16 })), false);
      this.movers.push((t) => {
        const a = snow.geometry.attributes.position;
        for (let i = 0; i < count; i++) { a.array[i * 3 + 1] = (a.array[i * 3 + 1] - 0.018 + 14) % 14; a.array[i * 3] += Math.sin(t * 0.8 + i) * 0.006; }
        a.needsUpdate = true;
      });
    }
    rng = Math.random; // movers that respawn at run time, and the ambassador, stay properly random
  }

  tick() {}

  animate() {
    requestAnimationFrame(() => this.animate());
    this.t += DT;
    for (const m of this.movers) m(this.t);
    this.tick(this.t);
    this.renderer.render(this.scene, this.camera);
  }
}

// The world view with a goofy, randomly assembled ambassador in it. pose: "idle" | "drawing" | "raised".
// Without a board canvas the ambassador just stands there (the guesser).
export class Scene extends WorldView {
  constructor(container, boardCanvas, hue) {
    super(container);
    this.pose = "idle";
    this.buildAmbassador(boardCanvas, hue);
  }

  buildAmbassador(boardCanvas, hue) {
    const skin = flat(col(hue, 0.55, 0.58)), belly = flat(col(hue + 0.08, 0.5, 0.78));
    const dark = flat(0x3a3560), white = flat(0xffffff);
    this.body = new THREE.Group();
    this.body.scale.setScalar(boardCanvas ? 1.25 : 1.1);
    this.scene.add(this.body);

    // Torso: tall and thin, short and wide, or round. Two legs with feet.
    const tw = rand(0.8, 1.5), th = rand(0.9, 1.6);
    const torso = new THREE.Mesh(pick([new THREE.BoxGeometry(tw, th, 0.7), new THREE.CylinderGeometry(tw / 2, tw / 2 + 0.15, th, 7), new THREE.SphereGeometry(Math.max(tw, th) / 2, 7, 5)]), skin);
    torso.position.y = 0.5 + th / 2;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(tw * 0.28, 6), belly);
    patch.position.set(0, 0.5 + th / 2, 0.36 + (tw > 1.2 ? 0.1 : 0));
    this.body.add(torso, patch);
    for (const sx of [-tw * 0.22, tw * 0.22]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.5, 5), dark);
      leg.position.set(sx, 0.3, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.42), dark);
      foot.position.set(sx, 0.07, 0.08);
      this.body.add(leg, foot);
    }
    const neck = 0.5 + th;

    // Head: a random shape with 1-3 googly eyes, a mouth, and 0-2 antennae.
    const hr = rand(0.45, 0.65);
    this.head = new THREE.Mesh(pick([new THREE.IcosahedronGeometry(hr, 0), new THREE.SphereGeometry(hr, 8, 6), new THREE.BoxGeometry(hr * 1.7, hr * 1.5, hr * 1.7), new THREE.CylinderGeometry(hr * 0.7, hr, hr * 1.8, 6)]), skin);
    this.head.position.y = neck + hr;
    this.body.add(this.head);
    this.eyes = [];
    const ne = pick([1, 2, 2, 2, 3]), es = rand(0.11, 0.2);
    for (let i = 0; i < ne; i++) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(es, 7, 5), white);
      eye.position.set(ne === 1 ? 0 : (i - (ne - 1) / 2) * es * 2.3, 0.05 + (ne === 3 && i === 1 ? es : 0), hr * 0.85);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(es * 0.45, 5, 4), dark);
      pupil.position.z = es * 0.75;
      eye.add(pupil);
      this.head.add(eye);
      this.eyes.push(eye);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(rand(0.15, 0.4), 0.06, 0.05), dark);
    mouth.position.set(0, -hr * 0.4, hr * 0.95);
    this.head.add(mouth);
    this.antennae = [];
    const na = pick([0, 1, 1, 2]);
    for (let i = 0; i < na; i++) {
      const a = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 4), dark);
      stalk.position.y = 0.35;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), belly);
      ball.position.y = 0.75;
      a.add(stalk, ball);
      a.position.set(na === 1 ? 0 : (i ? 0.25 : -0.25), hr * 0.9, 0);
      a.rotation.z = na === 1 ? 0 : (i ? -0.3 : 0.3);
      this.head.add(a);
      this.antennae.push(a);
    }
    this.headTop = hr * 1.05; // the speech bubble sits on the head itself; antennae poke up behind it

    // Arms pivot at the shoulders, end in a hand, and reach just behind the board's bottom corners.
    this.arms = [];
    for (const sx of [-(tw / 2 + 0.15), tw / 2 + 0.15]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx, neck - 0.1, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 5), skin);
      arm.position.y = -0.55;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), belly);
      hand.position.y = -1.1;
      pivot.add(arm, hand);
      this.body.add(pivot);
      this.arms.push(pivot);
    }
    shade(this.body);
    this.gaze = { y: 0, z: 0, next: 0 };
    this.blinkAt = rand(1, 4);
    this.boardY = neck - 0.6;
    this.buildBubble();
    if (!boardCanvas) return;
    this.boardTex = new THREE.CanvasTexture(boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.boardGroup = new THREE.Group();
    this.frameDark = dark; this.frameMagenta = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    this.frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.06), dark);
    const frame = this.frame;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.36), new THREE.MeshBasicMaterial({ map: this.boardTex }));
    face.position.z = 0.035;
    this.boardGroup.add(frame, face);
    this.body.add(this.boardGroup);
  }

  boardChanged() { if (this.boardTex) this.boardTex.needsUpdate = true; }

  // A speech bubble: an HTML element over the stage, pinned each frame to the head's screen position.
  buildBubble() {
    this.bubble = document.createElement("div");
    this.bubble.className = "bubble";
    this.bubble.hidden = true;
    this.container.appendChild(this.bubble);
  }

  say(text) {
    this.bubble.hidden = !text;
    this.bubble.textContent = text;
  }

  placeBubble() {
    if (this.bubble.hidden) return;
    const v = this.head.getWorldPosition(new THREE.Vector3());
    v.y += (this.headTop + 0.1) * this.body.scale.y;
    v.project(this.camera);
    const W = this.container.clientWidth, H = this.container.clientHeight;
    const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H; // top of the head on screen
    const bw = this.bubble.offsetWidth, bh = this.bubble.offsetHeight, GAP = 12, M = 8;
    // Centred above the head; slides sideways only as far as needed to stay on the stage.
    const left = Math.min(Math.max(x - bw / 2, M), W - bw - M);
    const top = Math.max(y - GAP - bh, M);
    this.bubble.style.left = `${Math.round(left)}px`;
    this.bubble.style.top = `${Math.round(top)}px`;
    // The tail keeps pointing at the head even when the bubble has slid sideways to stay on the stage.
    this.bubble.style.setProperty("--tail", `${Math.min(Math.max(x - left, 24), bw - 24)}px`);
  }

  tick(t) {
    if (!this.body) return; // the render loop starts before the ambassador is built
    const lerp = (a, b, k = 0.08) => a + (b - a) * k;
    const P = this.pose;
    // Breathing, a slow shift of weight, and a glance somewhere new every few seconds.
    const base = this.boardGroup ? 1.25 : 1.1;
    this.body.scale.y = base * (1 + Math.sin(t * 1.6) * 0.012);
    this.body.rotation.z = Math.sin(t * 0.4) * 0.015;
    if (t > this.gaze.next) this.gaze = { y: rand(-0.45, 0.45), z: rand(-0.08, 0.08), next: t + rand(1.5, 4) };
    const gy = P === "drawing" ? Math.sin(t * 3) * 0.12 : this.gaze.y;
    this.head.rotation.y = lerp(this.head.rotation.y, gy, 0.05);
    this.head.rotation.x = lerp(this.head.rotation.x, P === "drawing" ? 0.25 : 0, 0.05);
    this.head.rotation.z = lerp(this.head.rotation.z, P === "raised" ? 0.25 : this.gaze.z, 0.05);
    if (t > this.blinkAt + 0.12) this.blinkAt = t + rand(2, 6);
    const blink = t > this.blinkAt ? 0.1 : 1;
    for (const e of this.eyes) e.scale.y = blink;
    for (const [i, a] of this.antennae.entries()) a.rotation.x = Math.sin(t * 2.5 + i) * 0.1;
    this.placeBubble();

    if (!this.boardGroup) { // no board: arms hang and swing a little
      for (const [i, a] of this.arms.entries()) a.rotation.x = lerp(a.rotation.x, Math.sin(t * 1.5 + i * Math.PI) * 0.12);
      return;
    }
    const target = {
      idle:    { by: this.boardY, bz: 1.25, tilt: -0.3, armX: -1.1 },
      drawing: { by: this.boardY, bz: 1.25, tilt: -0.3, armX: -1.1 },
      raised:  { by: this.boardY + 2.6, bz: 0.55, tilt: 0.0, armX: -3.0 },
    }[P];
    const bg = this.boardGroup;
    bg.position.y = lerp(bg.position.y, target.by);
    bg.position.z = lerp(bg.position.z, target.bz);
    bg.rotation.x = lerp(bg.rotation.x, target.tilt);
    this.arms[0].rotation.x = lerp(this.arms[0].rotation.x, target.armX);
    // Raised: the frame turns magenta and the camera rises to look straight at the board.
    this.frame.material = P === "raised" ? this.frameMagenta : this.frameDark;
    const bp = bg.getWorldPosition(new THREE.Vector3());
    const camTo = P === "raised" ? new THREE.Vector3(bp.x, bp.y, bp.z + 3.4) : this.camHome;
    const lookTo = P === "raised" ? bp : this.lookHome;
    this.camera.position.lerp(camTo, 0.06);
    this.look.lerp(lookTo, 0.06);
    this.camera.lookAt(this.look);
    // The right arm scribbles while drawing.
    const scribble = P === "drawing" ? Math.sin(t * 22) * 0.18 : 0;
    this.arms[1].rotation.x = lerp(this.arms[1].rotation.x, target.armX + scribble, 0.35);
    this.arms[1].rotation.z = lerp(this.arms[1].rotation.z, P === "drawing" ? -0.25 + Math.cos(t * 16) * 0.15 : 0, 0.35);
  }
}
