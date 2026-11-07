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
const TRUNK = 0x7a5a3e;

// Which way things are pulled, and how hard.
const GRAVITY = { down: [0, -9, 0], up: [0, 3, 0], sideways: [5, 0, 0], "not at all": [0, 0, 0] };
const gust = (t) => 0.5 + 0.5 * Math.sin(t * 0.8) * Math.sin(t * 0.31 + 1);

const shade = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };

// A world built from facts, viewed from a fixed camera.
export class WorldView {
  constructor(container, { camera = [0, 2.4, 7.6], lookAt = [0, 2.0, 0], fov = 38 } = {}) {
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

  // Rebuild the backdrop from facts {suns, gravity, inhabitants, ground, weather}. An unknown fact leaves its
  // part of the world white: no facts at all is a blank white void, and each fact paints its own piece in.
  // Palette, tree shapes, moons and rings are random (per view), so no two worlds look the same.
  showWorld(v) {
    this.world.clear();
    this.movers = [];
    const add = (m, shadows = true) => { this.world.add(shadows ? shade(m) : m); return m; };
    const known = (k) => v[k] != null;
    const reseed = (k) => { rng = seeded(this.seed + k); }; // each section draws from its own stream
    reseed(0);
    const P = pick(PALETTES);
    const g = GRAVITY[v.gravity] ?? GRAVITY.down;
    const free = v.gravity === "not at all";
    const lean = v.gravity === "sideways" ? -0.35 : v.weather === "wind" ? -0.12 : 0;

    let sky = new THREE.Color(known("suns") ? P.sky : 0xffffff);
    if (v.suns === "no sun") sky = new THREE.Color(0x2f2b55);
    if (v.suns === "two suns") sky.lerp(new THREE.Color(0xf3d2a0), 0.4);
    if (v.suns === "three suns") sky.lerp(new THREE.Color(0xff9a5c), 0.65);
    if (v.weather === "snow") sky.lerp(new THREE.Color(0xdfe4ea), 0.6);
    this.scene.background = sky;
    this.scene.fog.color = sky;
    this.hemi.color = sky.clone().lerp(new THREE.Color(0xffffff), 0.5);
    this.hemi.intensity = v.suns === "no sun" ? 0.5 : 1.0;
    this.sun.intensity = v.suns === "no sun" ? 0.7 : 2.0;
    this.sun.color.set(v.suns === "no sun" ? 0xb8c4ff : 0xfff4d6);

    // Ground: gently uneven unless flat, water or pitted (or not yet known); always level near the camera.
    reseed(1);
    const amp = !known("ground") || ["flat", "water", "holes"].includes(v.ground) ? 0 : 0.35;
    this.groundY = (x, z) => {
      if (!amp) return 0;
      const k = Math.min(1, Math.max(0, (Math.hypot(x, z) - 2) / 4));
      return amp * k * (Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.38) + 0.6 * Math.sin(x * 0.9 - z * 0.7));
    };
    const groundColour = new THREE.Color(!known("ground") ? 0xffffff : v.ground === "water" ? 0x6fb7d9 : P.ground);
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

    if (v.ground === "mountains") for (let i = 0; i < 16; i++) {
      const hgt = rand(7, 17), x = -26 + i * 3.5 + rand(-1, 1), z = rand(-26, -16);
      const m = add(new THREE.Mesh(new THREE.ConeGeometry(rand(3, 6), hgt, (rand(5, 8) | 0)), flat(new THREE.Color(i % 2 ? P.rock : P.leaf).lerp(sky, 0.35))));
      m.position.set(x, hgt / 2 - 0.5, z);
      m.rotation.y = rand(0, 6);
    }
    if (v.ground === "holes") {
      const rim = flat(new THREE.Color(P.ground).multiplyScalar(0.8)), pit = flat(0x2a2540);
      for (let i = 0; i < 30; i++) {
        const r = rand(0.5, 1.4), x = rand(-13, 13), z = rand(-13, -1);
        const h = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.5, 9), pit));
        h.position.set(x, -0.24, z);
        const ring = add(new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.1, 5, 12), rim));
        ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, z);
      }
    }
    if (v.ground === "crystals") {
      const crystal = new THREE.MeshStandardMaterial({ color: P.rock, flatShading: true, emissive: new THREE.Color(P.rock).multiplyScalar(0.3) });
      for (let k = 0; k < 7; k++) {
        const cx = rand(-13, 13), cz = rand(-13, -2);
        for (let i = rand(2, 5) | 0; i--;) {
          const hgt = rand(1, 4.5), x = cx + rand(-1.2, 1.2), z = cz + rand(-1.2, 1.2);
          const c = add(new THREE.Mesh(new THREE.ConeGeometry(rand(0.2, 0.6), hgt, 5), crystal));
          c.position.set(x, this.groundY(x, z) + hgt / 2 - 0.2, z);
          c.rotation.set(rand(-0.25, 0.25), rand(0, 6), rand(-0.3, 0.3));
        }
      }
    }
    if (v.ground === "water") for (let i = 0; i < 20; i++) {
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

    // Trees in clumps, of one random shape, once the ground is known. They bend in wind, lean with sideways gravity, and float with none.
    reseed(3);
    if (known("ground") && v.ground !== "water") {
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
          tree.rotation.z = lean + rand(-0.06, 0.06);
          add(tree);
          const p = rand(0, 6);
          if (v.weather === "wind") this.movers.push((t) => { tree.rotation.z = -(0.12 + gust(t) * 0.22) + Math.sin(t * 2.2 + p) * 0.03; });
          else if (free) { tree.position.y += rand(0.4, 1.6); tree.rotation.set(rand(-0.3, 0.3), 0, rand(-0.4, 0.4)); this.movers.push(() => { tree.rotation.y += DT * 0.15; }); }
        }
      }
    }

    // Boulders arrive with gravity, since they are what shows it: they rest, lift off, roll, or tumble.
    reseed(4);
    if (known("gravity") && v.ground !== "water") for (let i = 0; i < 8; i++) {
      const r = rand(0.25, 0.7);
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), flat(P.rock)));
      m.rotation.set(rand(0, 6), rand(0, 6), 0);
      this.movers.push(this.rock(m, r, g, (p, vel) => {
        if (v.gravity === "sideways") p.set(-16, 0, rand(-13, -2)); else p.set(rand(-13, 13), 0, rand(-14, -2));
        p.y = free ? rand(0.5, 8) : this.groundY(p.x, p.z) + r * 0.8;
        vel.set(0, 0, 0);
      }));
    }

    // Inhabitants: little creatures that hop (with a proper squash and stretch) or drift when weightless.
    // One set of geometries and materials for every being: a crowd of hundreds is then cheap to build and upload.
    const skinMat = flat(P.rock), darkMat = flat(0x3a3560);
    const torsoGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4), headGeo = new THREE.IcosahedronGeometry(0.3, 0), legGeo = new THREE.BoxGeometry(0.16, 0.25, 0.3);
    const being = (size, x, z) => {
      const body = new THREE.Group();
      const torso = new THREE.Mesh(torsoGeo, skinMat);
      torso.position.y = 0.6;
      const head = new THREE.Mesh(headGeo, skinMat);
      head.position.y = 1.25;
      body.add(torso, head);
      for (const sx of [-0.15, 0.15]) {
        const leg = new THREE.Mesh(legGeo, darkMat);
        leg.position.set(sx, 0.12, 0.03);
        body.add(leg);
      }
      body.scale.setScalar(size);
      body.rotation.y = rand(-0.7, 0.7);
      body.rotation.z = lean;
      const T = 1.4 + size * 0.4, hop = 0.35 * size, p = rand(0, 6);
      if (free) {
        this.movers.push(this.rock(body, size, g, (pos, vel) => { pos.set(x, rand(0.5, 7), z); vel.set(0, 0, 0); }));
      } else this.movers.push((t) => {
        const u = ((t + p) % T) / T;
        let y = 0, sy = 1;
        if (u < 0.35) { const a = u / 0.35; y = 4 * hop * a * (1 - a); sy = 1 + 0.1 * Math.sin(a * Math.PI); }
        else { const b = (u - 0.35) / 0.65; sy = 1 - 0.1 * Math.sin(b * Math.PI) ** 4; }
        body.position.y = this.groundY(body.position.x, body.position.z) + y;
        body.scale.set(size / Math.sqrt(sy), size * sy, size / Math.sqrt(sy));
      });
      return body;
    };
    const place = (size, x, z) => { const b = being(size, x, z); b.position.set(x, 0, z); add(b); };
    reseed(5);
    if (v.inhabitants === "one giant") place(7, 3, -12); // towers over the trees, head nearly out of frame
    if (v.inhabitants === "a few big ones") for (let i = 0; i < 3; i++) place(2.2, -8 + i * 7, -9 - i);
    if (v.inhabitants === "countless tiny ones") for (let k = 0; k < 10; k++) {
      const cx = rand(-13, 13), cz = rand(-14, -2);
      for (let i = 0; i < 25; i++) place(0.35, cx + rand(-2.5, 2.5), cz + rand(-2, 2));
    }

    // Weather
    reseed(6);
    if (v.weather === "wind") for (let i = 0; i < 14; i++) {
      const s = add(new THREE.Mesh(new THREE.BoxGeometry(rand(2, 4), 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })), false);
      const y = rand(0.5, 7), z = rand(-12, 1);
      let x = rand(-20, 20);
      this.movers.push((t) => { x += (7 + gust(t) * 7) * DT; if (x > 20) x = -20; s.position.set(x, y + Math.sin(t * 3 + i) * 0.1, z); });
    }
    if (v.weather === "rocks") for (let i = 0; i < 24; i++) {
      const r = rand(0.4, 1.1);
      const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), flat(0x8c8498)));
      this.movers.push(this.rock(m, r, GRAVITY.down, (p, vel) => { p.set(rand(-12, 12), rand(12, 18), rand(-12, -2)); vel.set(rand(-0.5, 0.5), 0, 0); }, { respawnWhenResting: true }));
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
