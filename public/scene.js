import * as THREE from "three";
import { flat, rand, pick, reseed, col, DT, shade, DARK, WHITE } from "./props.js";
import { buildLandscape } from "./landscape.js";
import { buildAnimals } from "./animals.js";


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

  // Rebuild the backdrop from facts {suns, wind, animals, terrain, weather}. An unknown fact leaves its
  // part of the world white: no facts at all is a blank white void, and each fact paints its own piece in.
  // Palette, tree shapes and moons are random (per view), so no two worlds look the same.
  showWorld(v) {
    this.world.clear();
    this.movers = [];
    const add = (m, shadows = true) => { this.world.add(shadows ? shade(m) : m); return m; };
    const known = (k) => v[k] != null;
    this.reseed(0);
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

    buildLandscape(this, v, P, W, sky, add);
    buildAnimals(this, v, add);
    reseed(); // movers that respawn at run time, and the ambassador, stay properly random
  }

  // Each section of the world draws from its own random stream, so adding one fact never reshuffles another's part.
  reseed(k) { reseed(this.seed + k); }

  tick() {}

  animate() {
    requestAnimationFrame(() => this.animate());
    this.t += DT;
    for (const m of this.movers) m(this.t);
    this.tick(this.t);
    if (this.tilt) { // phones: the view turns a little with the phone, like a window (tilt.js)
      const [x, y, z, w] = this.tilt.offset();
      this.camera.lookAt(this.look);
      this.camera.quaternion.multiply((this.tiltTurn ??= new THREE.Quaternion()).set(x, y, z, w));
    }
    this.renderer.render(this.scene, this.camera);
  }
}

// The world view with a goofy, randomly assembled ambassador in it. pose: "idle" | "drawing" | "raised" | "looking".
// The head's nod, turn and tilt when peering through the telescope.
const PEER = new THREE.Euler(0.12, 0.15, -0.2);

// Without a board canvas the ambassador holds a telescope instead (the guesser).
export class Scene extends WorldView {
  constructor(container, boardCanvas, hue) {
    super(container);
    this.pose = "idle";
    this.buildAmbassador(boardCanvas, hue);
  }

  // Over water the ambassador gets a rock to stand on (it is an envoy, not a messiah), and it dresses for the rest
  // of the facts. The gear was all built hidden, so this only shows the right bits, however often it is called.
  showWorld(v) {
    super.showWorld(v);
    if (!this.gear) return; // the first call comes from the WorldView constructor, before the ambassador exists
    const G = this.gear, snow = v.weather === "snow", rain = v.weather === "rain", dark = v.suns === "no sun", wet = v.terrain === "water";
    this.hot = v.suns === "three suns";
    this.gale = v.wind === "a gale";
    this.pad.visible = wet;
    this.body.position.y = wet ? 0.1 : 0;
    G.bobble.visible = G.scarf.visible = snow;
    G.souwester.visible = rain;
    G.sunhat.visible = this.hot && !snow && !rain; // one hat at a time: the woolly or the sou'wester wins
    if (this.topper) this.topper.visible = !(snow || rain || this.hot); // and the bowler or flower comes off for any of them
    this.headTop = snow ? this.crown + 0.45 : rain || this.hot ? this.crown + 0.3 : this.headTop0;
    if (G.fan) G.fan.visible = this.hot;
    G.torch.visible = dark;
    for (const e of this.eyes) e.material = dark ? this.glow : WHITE;
    G.wellies.visible = G.ring.visible = wet;
    for (const f of this.feet) f.material = wet ? this.wool : DARK;
  }

  buildAmbassador(boardCanvas, hue) {
    const skin = flat(col(hue, 0.55, 0.58)), belly = flat(col(hue + 0.08, 0.5, 0.78));
    const dark = DARK, white = WHITE;
    this.body = new THREE.Group();
    this.body.scale.setScalar(boardCanvas ? 1.25 : 1.1);
    this.scene.add(this.body);
    this.pad = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.2, 7), flat(0x8a8277)));
    this.pad.visible = false;
    this.scene.add(this.pad);

    // Torso: tall and thin, short and wide, or round. Each shape says where its top, shoulders and front are and
    // how wide its middle is, so the neck, arms, belly and rubber ring land on it whatever it is. Two legs with
    // feet, the feet hinged at the heel.
    const tw = rand(0.8, 1.5), th = rand(0.9, 1.6), mid = 0.5 + th / 2, R = Math.max(tw, th) / 2;
    const T = pick([
      { geo: new THREE.BoxGeometry(tw, th, 0.7), top: 0.5 + th, shx: tw / 2, shy: 0.42 + th, front: 0.35, girth: tw / 2 },
      { geo: new THREE.CylinderGeometry(tw / 2, tw / 2 + 0.15, th, 7), top: 0.5 + th, shx: tw * 0.45 + 0.02, shy: 0.42 + th, front: (tw / 2 + 0.075) * 0.85, girth: tw / 2 + 0.075 },
      { geo: new THREE.SphereGeometry(R, 7, 5), top: mid + R, shx: R * 0.75, shy: mid + R * 0.55, front: R * 0.8, girth: R },
    ]);
    const torso = new THREE.Mesh(T.geo, skin);
    torso.position.y = mid;
    const patch = new THREE.Mesh(new THREE.SphereGeometry(tw * 0.28, 7, 5), belly); // a belly bump, so it shows on any shape
    patch.scale.z = 0.4;
    patch.position.set(0, mid, T.front);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.42, 6), skin);
    neck.position.y = T.top + 0.09; // runs from inside the torso to inside the head
    this.body.add(torso, patch, neck);
    this.feet = [];
    for (const sx of [-tw * 0.22, tw * 0.22]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.6, 5), dark);
      leg.position.set(sx, 0.35, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.42).translate(0, 0, 0.21), dark);
      foot.position.set(sx, 0.07, -0.13);
      this.body.add(leg, foot);
      this.feet.push(foot);
    }

    // Head: a random shape with 1-3 googly eyes, a mouth, and 0-2 antennae. Each shape says how far the chin and
    // top are from its centre, where its front is at mouth height, and how far back the faces either side of the
    // front slope (`bend`), so it sits in the neck with the mouth on it. `band` is how wide a headband round the
    // brow must be, and `sink` how far below the top a wide hat brim settles (a lot on a round head).
    const hr = rand(0.45, 0.65);
    const H = pick([
      { geo: new THREE.IcosahedronGeometry(hr, 0), chin: hr * 0.85, top: hr * 0.85, lip: hr * 0.85, bend: 0.36, band: 0.8, sink: 0.08 },
      { geo: new THREE.SphereGeometry(hr, 8, 6), chin: hr, top: hr, lip: hr * 0.89, bend: 0.4, band: 0.85, sink: 0.1 },
      { geo: new THREE.BoxGeometry(hr * 1.7, hr * 1.5, hr * 1.7), chin: hr * 0.75, top: hr * 0.75, lip: hr * 0.85, bend: 0, band: 0.95, sink: 0.01 },
      { geo: new THREE.CylinderGeometry(hr * 0.7, hr, hr * 1.8, 6), chin: hr * 0.9, top: hr * 0.9, lip: hr * 0.92, bend: 0.52, band: 0.7, sink: 0.01 },
    ]);
    this.head = new THREE.Mesh(H.geo, skin);
    this.head.position.y = T.top + 0.15 + H.chin; // the chin a little way up the neck
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
    // The mouth is level, in two halves hinged on the ridge down the front and bent back to hug the face on
    // each side (flat on the box), deep enough to stay inside the head out to its ends.
    const mw = rand(0.15, 0.4);
    for (const s of [-1, 1]) {
      const half = new THREE.Group();
      half.position.set(0, -hr * 0.4, H.lip + 0.02);
      half.rotation.y = s * H.bend;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(mw / 2, 0.06, 0.3), dark);
      bar.position.set(s * mw / 4, 0, -0.15);
      half.add(bar);
      this.head.add(half);
    }
    this.antennae = [];
    const na = pick([0, 1, 1, 2]);
    for (let i = 0; i < na; i++) {
      const a = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 4), dark);
      stalk.position.y = 0.45;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), belly);
      ball.position.y = 0.95;
      a.add(stalk, ball);
      a.position.set(na === 1 ? 0 : (i ? 0.25 : -0.25), hr * 0.4, 0); // rooted well inside the head
      a.rotation.z = a.userData.spread = na === 1 ? 0 : (i ? -0.3 : 0.3);
      this.head.add(a);
      this.antennae.push(a);
    }
    this.headTop = hr * 1.05; // the speech bubble sits on the head itself; antennae poke up behind it

    // One accessory each, for charm: a bow tie, a bowler, a monocle or a flower.
    const trinket = pick(["bowtie", "hat", "monocle", "flower"]);
    if (trinket === "bowtie") { // at the front of the neck, just under the chin
      const bow = new THREE.Group();
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), belly);
        wing.position.x = s * 0.1;
        wing.rotation.z = s * 0.15;
        bow.add(wing);
      }
      bow.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), dark));
      bow.position.set(0, T.top + 0.07, 0.13);
      this.body.add(bow);
    }
    if (trinket === "hat") { // a bowler, its brim sunk a touch into the crown of the head so it sits on every shape
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 10), dark);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 10), dark);
      brim.position.y = H.top - 0.01;
      crown.position.y = H.top + 0.1;
      this.topper = new THREE.Group();
      this.topper.add(brim, crown);
      this.head.add(this.topper);
      this.headTop = H.top + 0.24;
    }
    if (trinket === "monocle") { // around the left eye, on a string
      const e = this.eyes[0].position;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(es * 1.15, 0.02, 5, 12), dark);
      ring.position.set(e.x, e.y, e.z + es * 0.45);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), dark);
      string.position.set(e.x - es * 1.1, e.y - es * 1.15 - 0.13, ring.position.z);
      string.rotation.z = 0.25;
      this.monocle = new THREE.Group();
      this.monocle.add(ring, string);
      this.head.add(this.monocle);
    }
    if (trinket === "flower") { // grows out of the top of the head and leans over the brow, away from the antennae
      const f = new THREE.Group(), bloom = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), dark);
      stalk.position.y = 0.2;
      for (let i = 0; i < 5; i++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), belly);
        petal.position.set(Math.cos(i * 1.257) * 0.08, Math.sin(i * 1.257) * 0.08, 0);
        bloom.add(petal);
      }
      bloom.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), white));
      bloom.position.y = 0.4;
      bloom.rotation.x = -0.3;
      f.add(stalk, bloom);
      f.position.set(0, H.top - 0.15, 0.05);
      f.rotation.x = -0.7;
      this.topper = f;
      this.head.add(f);
    }

    // Arms pivot at the shoulders under a blob that covers the joint, end in a hand, and reach just behind the
    // board's bottom corners. The guesser's are as long as it takes to hold a telescope to its outer right eye.
    this.teleEye = this.eyes.at(-1);
    this.es = es;
    this.al = 1.1;
    if (!boardCanvas) {
      const eye = this.teleEye.position.clone().applyEuler(PEER).add(this.head.position);
      this.al = Math.max(1.1, eye.distanceTo(new THREE.Vector3(T.shx + 0.06, T.shy, 0)) + 0.25);
    }
    this.arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (T.shx + 0.06), T.shy, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, this.al, 5), skin);
      arm.position.y = -this.al / 2;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), belly);
      hand.position.y = -this.al;
      pivot.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), skin), arm, hand);
      this.body.add(pivot);
      this.arms.push(pivot);
    }

    // Dressing for the weather, all built now and hidden; showWorld shows what the facts call for. The woollens
    // and rubber are one knitted red. The weather hats hang off one pivot so a gale can lift the brim.
    const wool = this.wool = flat(0xc8503a), G = this.gear = {};
    const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
    this.hats = new THREE.Group();
    this.head.add(this.hats);
    const hat = (...parts) => { const g = new THREE.Group(); g.add(...parts); g.visible = false; this.hats.add(g); return g; };
    const ht = H.top - H.sink; // where a brim sits
    // Snow: a bobble hat, and a scarf whose tail is laid back down the torso from the nape.
    G.bobble = hat(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 0.32, 8), wool), 0, ht + 0.15, 0),
      at(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 8), white), 0, ht, 0), at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), white), 0, ht + 0.35, 0));
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.09, 6, 10), wool);
    scarf.rotation.x = Math.PI / 2;
    this.scarfTail = new THREE.Group();
    this.scarfTail.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.05).translate(0, -0.25, 0), wool));
    this.scarfTail.position.z = -0.2;
    this.scarfTail.rotation.x = Math.asin(Math.min(0.85, (T.front - 0.12) / 0.5));
    G.scarf = new THREE.Group();
    G.scarf.add(scarf, this.scarfTail);
    G.scarf.position.y = T.top + 0.1;
    // Rain: a sou'wester, the brim longer at the back.
    const brim = at(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 10), belly), 0, ht, -0.1);
    brim.scale.z = 1.25;
    G.souwester = hat(brim, at(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), belly), 0, ht - 0.01, 0));
    // Three suns: a wide sun hat and a fan for the hand that is free.
    G.sunhat = hat(at(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 10), white), 0, ht, 0), at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 10), belly), 0, ht + 0.08, 0));
    if (!boardCanvas) {
      G.fan = at(new THREE.Mesh(new THREE.CircleGeometry(0.25, 7, 0, Math.PI), new THREE.MeshStandardMaterial({ color: belly.color, flatShading: true, side: THREE.DoubleSide })), 0, -this.al + 0.08, 0.06);
      G.fan.rotation.x = 2.0; // faces the camera once the arm is up
      this.arms[0].add(G.fan);
    }
    // No sun: a head torch on a band, with a little light on the face; the eyes glow too (showWorld swaps them).
    this.glow = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xfff0a0, emissiveIntensity: 0.9, flatShading: true });
    const band = new THREE.Mesh(new THREE.TorusGeometry(hr * H.band, 0.03, 5, 12), dark);
    band.rotation.x = Math.PI / 2;
    G.torch = new THREE.Group();
    G.torch.add(band, at(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), this.glow), 0, 0, hr * H.band + 0.03), at(new THREE.PointLight(0xfff0b0, 2, 4), 0, 0, hr * 1.3));
    G.torch.position.y = hr * 0.55; // across the brow, above the eyes
    this.head.add(G.torch);
    // Water: wellies (the feet turn red in showWorld) and a rubber ring. It stands on a rock, but one can't be too careful.
    G.wellies = new THREE.Group();
    for (const f of this.feet) G.wellies.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.36, 6), wool), f.position.x, 0.26, 0));
    G.ring = new THREE.Mesh(new THREE.TorusGeometry(T.girth + 0.08, 0.12, 7, 14), wool);
    G.ring.rotation.x = Math.PI / 2;
    G.ring.position.y = mid;
    this.body.add(G.scarf, G.wellies, G.ring);
    for (const g of [G.scarf, G.torch, G.wellies, G.ring, G.fan]) if (g) g.visible = false;
    this.crown = H.top; this.headTop0 = this.headTop; // where the bubble goes with and without a weather hat
    shade(this.body);
    this.gaze = { y: 0, z: 0, next: 0 };
    this.blinkAt = rand(1, 4);
    this.boardY = T.top - 0.6;
    this.buildBubble();
    if (!boardCanvas) {
      // A brass spyglass, eyepiece at its origin and the lens 0.65 along +z; tick keeps it in the right hand.
      const brass = flat(0xb08d57);
      const tube = (r, z0, z1, mat = brass) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, z1 - z0, 8), mat); m.rotation.x = Math.PI / 2; m.position.z = (z0 + z1) / 2; return m; };
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8), flat(0xdcedf4));
      lens.position.z = 0.651;
      this.tele = new THREE.Group();
      this.tele.add(tube(0.07, -0.02, 0.06, dark), tube(0.06, 0.06, 0.36), tube(0.085, 0.36, 0.65), lens);
      this.body.add(shade(this.tele));
      this.teleU = new THREE.Vector3(0, -1, 0); // which way the tube points, and how far down it the hand is
      this.grip = 0.3;
      // At rest the arms hang a little forward, more if they are so long they would otherwise drag.
      this.restX = -Math.max(0.2, Math.acos(Math.min(1, (T.shy - 0.2) / this.al)));
      for (const a of this.arms) a.rotation.x = this.restX;
      return;
    }
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
    // Start in the idle pose, rather than have the board and arms swing out from inside the torso.
    this.boardGroup.position.set(0, this.boardY, 1.25);
    this.boardGroup.rotation.x = -0.3;
    for (const a of this.arms) a.rotation.x = -1.1;
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
    const b = this.bubble;
    b.hidden = !text;
    if (b.textContent !== (text ?? "")) {
      b.textContent = text ?? "";
      this.bubbleFit = null; // new words: work out the font size again
      b.classList.remove("pop");
      void b.offsetWidth; // restart the pop-in animation
      if (text) b.classList.add("pop");
    }
  }

  // Largest font size (26px down to 14px) at which the bubble is no taller than `room`; the smallest if none is.
  // If even 14px is too tall at the usual width, the bubble is allowed to go nearly the full stage width.
  fitBubble(room) {
    const b = this.bubble, BIG = 26, SMALL = 14;
    b.style.left = "0px"; // measure with the whole stage width available
    const fits = (fs) => { b.style.setProperty("--fs", `${fs}px`); return b.offsetHeight <= room; };
    b.style.maxWidth = ""; // the stylesheet's width first
    if (fits(BIG)) return BIG;
    if (!fits(SMALL)) b.style.maxWidth = "calc(100% - 20px)"; // a lot to say: let it spread across the stage
    let lo = SMALL, hi = BIG - 1; // binary search for the largest size that fits
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fits(mid)) lo = mid; else hi = mid - 1; }
    fits(lo);
    return lo;
  }

  placeBubble() {
    if (this.bubble.hidden) return;
    const v = this.head.getWorldPosition(new THREE.Vector3());
    v.y += (this.headTop + 0.1) * this.body.scale.y;
    v.project(this.camera);
    const W = this.container.clientWidth, H = this.container.clientHeight;
    const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H; // top of the head on screen
    const GAP = 14, M = 10;
    const room = Math.min(y, H) - GAP - M; // space between the stage's top edge and the head
    // Refit only when the words, the stage width or the room above the head have changed noticeably.
    // (room is rounded down to a step of 6px so the fit stays valid while the head bobs a little.)
    const step = Math.floor(room / 6) * 6, key = `${W}|${step}`;
    if (this.bubbleFit !== key) { this.fitBubble(step); this.bubbleFit = key; }
    const bw = this.bubble.offsetWidth, bh = this.bubble.offsetHeight;
    // Centred above the head; slides sideways only as far as needed to stay on the stage. If even the smallest
    // text is too tall for the room above the head, it sits at the top of the stage over the head, without a tail.
    const left = Math.min(Math.max(x - bw / 2, M), W - bw - M);
    const top = Math.max(Math.min(y - GAP - bh, H - bh - M), M);
    this.bubble.classList.toggle("over", top + bh + GAP > y + 1);
    this.bubble.style.left = `${Math.round(left)}px`;
    this.bubble.style.top = `${Math.round(top)}px`;
    // The tail keeps pointing at the head even when the bubble has slid sideways to stay on the stage.
    this.bubble.style.setProperty("--tail", `${Math.min(Math.max(x - left, 26), bw - 26)}px`);
  }

  tick(t) {
    if (!this.body) return; // the render loop starts before the ambassador is built
    const lerp = (a, b, k = 0.08) => a + (b - a) * k;
    const P = this.pose, look = P === "looking";
    // Breathing, a slow shift of weight, and a glance somewhere new every few seconds.
    const base = this.boardGroup ? 1.25 : 1.1;
    this.body.scale.y = base * (1 + Math.sin(t * 1.6) * 0.012);
    this.lean = lerp(this.lean ?? 0, this.gale && P !== "raised" ? 0.08 : 0, 0.05); // into the wind (it blows towards +x), but stands straight for the camera
    this.body.rotation.z = Math.sin(t * 0.4) * 0.015 + this.lean;
    if (t > this.gaze.next) this.gaze = { y: rand(-0.45, 0.45), z: rand(-0.08, 0.08), next: t + rand(1.5, 4) };
    const gy = P === "drawing" ? Math.sin(t * 3) * 0.12 : look ? PEER.y : this.gaze.y;
    this.head.rotation.y = lerp(this.head.rotation.y, gy, 0.05);
    this.head.rotation.x = lerp(this.head.rotation.x, P === "drawing" ? 0.25 : look ? PEER.x : 0, 0.05);
    this.head.rotation.z = lerp(this.head.rotation.z, P === "raised" ? 0.25 : look ? PEER.z : this.gaze.z, 0.05);
    if (t > this.blinkAt + 0.12) this.blinkAt = t + rand(2, 6);
    const blink = t > this.blinkAt ? 0.1 : 1;
    // Peering through the telescope, every eye but the one at it squints.
    this.squint = lerp(this.squint ?? 1, look ? 0.3 : 1, 0.1);
    for (const e of this.eyes) e.scale.y = Math.min(blink, e === this.teleEye ? 1 : this.squint);
    // In a gale the antennae bend downwind, the hat brim lifts and the scarf streams; otherwise antennae just wobble.
    const gale = this.gale ? 1 : 0;
    for (const [i, a] of this.antennae.entries()) {
      a.rotation.x = Math.sin(t * 2.5 + i) * 0.1;
      a.rotation.z = lerp(a.rotation.z, a.userData.spread - gale * (0.9 + Math.sin(t * 7 + i) * 0.12), 0.05);
    }
    this.hats.rotation.x = lerp(this.hats.rotation.x, gale * (-0.2 + Math.sin(t * 6) * 0.08), 0.05);
    this.scarfTail.rotation.z = lerp(this.scarfTail.rotation.z, gale * (1.3 + Math.sin(t * 9) * 0.15), 0.05);
    // Now and then a foot taps: the toe lifts off the heel a few times, then rests.
    const tap = Math.sin(t * 0.25) > 0.95 ? Math.max(0, Math.sin(t * 9)) * 0.4 : 0;
    this.feet[1].rotation.x = lerp(this.feet[1].rotation.x, -tap, 0.4);
    this.placeBubble();

    if (!this.boardGroup) { // no board: the left arm hangs and swings, the right holds the telescope
      const swing = (i) => Math.sin(t * 1.5 + i * Math.PI) * 0.12;
      const rest = (i) => new THREE.Quaternion().setFromEuler(new THREE.Euler(this.restX + swing(i), 0, 0));
      // In the heat the free hand fans the face now and then; the fan is on the hand, shown by showWorld.
      const fanning = this.hot && Math.sin(t * 0.3) > 0.2;
      this.arms[0].quaternion.slerp(fanning ? new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.1 + Math.sin(t * 9) * 0.15, 0, 0.45)) : rest(0), 0.08);
      const S = this.arms[1].position, al = this.al;
      let u = new THREE.Vector3(0.25, -0.45, 1).normalize(), grip = 0.3, q = rest(1); // lowered: the tube hangs forward from the hand
      if (look) {
        // The eyepiece goes to the eye and the tube points at the other screen, so the hand must be where the
        // tube crosses the sphere the arm can reach: solve for how far down the tube that is, then aim the arm there.
        const E = this.body.worldToLocal(this.teleEye.getWorldPosition(new THREE.Vector3()));
        u = new THREE.Vector3(0.4, 0.1, 1).normalize(); // at the other screen, a touch off to the side so the tube shows its length
        const d = E.clone().sub(S), p = u.dot(d);
        const dh = -p + Math.sqrt(Math.max(0, p * p + al * al - d.lengthSq()));
        q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.addScaledVector(u, dh).normalize());
        grip = dh - this.es * 0.5; // the eyepiece rests on the front of the eyeball, not at its centre
      }
      this.arms[1].quaternion.slerp(q, 0.08);
      this.teleU.lerp(u, 0.08).normalize();
      this.grip = lerp(this.grip, grip);
      const hand = new THREE.Vector3(0, -al, 0).applyQuaternion(this.arms[1].quaternion).add(S);
      this.tele.position.copy(hand).addScaledVector(this.teleU, -this.grip);
      this.tele.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.teleU);
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
