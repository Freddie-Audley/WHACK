import * as THREE from "three";
import { flat, rand, claim, DARK, WHITE, googly, gust, DT } from "./props.js";

// The animals of a world, and how each copes with its terrain and wind, built into `view.world` through `add`.
export function buildAnimals(view, v, add) {
  // Animals, and how each copes with the terrain, the wind and the weather. On water: cows swim up to their bellies
  // in rubber rings, snails float shell-up, fish leap, octopuses peek out through snorkels, snakes swim with their
  // heads up in rubber rings. On land: fish flop about gasping, and octopuses wear fishbowls. In a gale the birds
  // flap flat out and still get blown backwards, the cows brace nose-first into it with their ears pinned back and
  // the snails slowly lose ground; somebody's hat blows past. Under three suns everyone wears sunglasses and wilts,
  // the cows and snails under parasols, the beached fish in a knotted hanky. In snow everyone gets a bobble hat and the
  // cows a scarf; in rain everyone puts a leaf up. With no sun their eyes glow, the cows and snails wear nightcaps,
  // and one of each herd is on lantern duty.
  view.reseed(5);
  const dark = DARK;
  const water = v.terrain === "water", gale = v.wind === "a gale", hot = v.suns === "three suns", night = v.suns === "no sun", snow = v.weather === "snow", rain = v.weather === "rain";
  const part = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // The extras never draw random numbers (wool colours go round by herd number), so learning the weather after the
  // animals leaves the herd where it was.
  const wool = [flat(0xe0575c), flat(0xf0c75e), flat(0x5aa9d6)], snowMat = flat(0xffffff), leaf = flat(0x5e9a4a), pale = flat(0xf6e7cf);
  const skiGeo = new THREE.BoxGeometry(1, 0.06, 0.12), boardGeo = new THREE.BoxGeometry(0.9, 0.07, 0.38), bindingGeo = new THREE.BoxGeometry(0.2, 0.06, 0.1);
  const snowboard = (parent, y = 0) => {
    if (!snow) return;
    const gear = new THREE.Group();
    gear.position.y = y;
    part(gear, boardGeo, wool[0], 0, 0.04, 0);
    for (const x of [-0.2, 0.2]) part(gear, bindingGeo, dark, x, 0.1, 0);
    parent.add(gear);
  };
  const cowSkis = (cow) => {
    if (!snow) return;
    for (const [i, z] of [-0.22, 0.22].entries()) {
      const ski = part(cow, skiGeo, wool[i ? 2 : 0], 0, 0.04, z);
      ski.scale.x = 1.7;
      part(cow, bindingGeo, dark, 0.5, 0.1, z);
    }
  };
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xfff0a0, emissiveIntensity: 0.9, flatShading: true });
  const capGeo = new THREE.SphereGeometry(1, 7, 5), stickGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 4), leafGeo = new THREE.ConeGeometry(0.5, 0.2, 6);
  const bandGeo = new THREE.CylinderGeometry(1, 1, 0.3, 7), coneGeo = new THREE.ConeGeometry(0.95, 1.4, 6), bobbleGeo = new THREE.SphereGeometry(0.3, 5, 4), stripeGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.2, 7);
  const lampGeo = new THREE.BoxGeometry(0.16, 0.2, 0.16), lidGeo = new THREE.BoxGeometry(0.2, 0.05, 0.2);
  const shades = (parent, x, y, z, w, h, d) => { if (hot) part(parent, new THREE.BoxGeometry(w, h, d), dark, x, y, z); };
  const cap = (parent, x, y, z, r) => { if (snow) part(parent, capGeo, snowMat, x, y, z).scale.set(r, r * 0.4, r); };
  // A knitted hat, `r` across: white band, cone and bobble; the nightcap is taller, stripier and flops over.
  const hat = (parent, x, y, z, r, k, floppy) => {
    const h = new THREE.Group(), top = new THREE.Group();
    part(h, bandGeo, snowMat, 0, 0.15, 0);
    part(top, coneGeo, wool[k % 3], 0, floppy ? 1.1 : 0.65, 0).scale.y = floppy ? 1.6 : 1;
    if (floppy) part(top, stripeGeo, snowMat, 0, 1.0, 0);
    part(top, bobbleGeo, snowMat, 0, floppy ? 2.2 : 1.35, 0);
    top.position.y = 0.3; top.rotation.z = floppy ? 0.5 : 0;
    h.add(top); h.position.set(x, y, z); h.scale.setScalar(r);
    parent.add(h);
    return h;
  };
  const hatOn = (parent, x, y, z, r, k) => { if (night) hat(parent, x, y, z, r, k, true); else if (snow) hat(parent, x, y, z, r, k, false); }; // nightcap for bed, bobble hat for snow
  const canopy = (parent, x, y, z, h, k, mat) => { // a leaf (or a pale parasol) on a stick, held up against whatever is coming down
    part(parent, stickGeo, dark, x, y + h / 2, z).scale.y = h;
    part(parent, leafGeo, mat, x, y + h + 0.05 * k, z).scale.setScalar(k);
    if (mat === pale) part(parent, bobbleGeo, wool[0], x, y + h + 0.15 * k, z).scale.setScalar(k * 0.3);
  };
  const brolly = (parent, x, y, z, h, k = 1) => { if (rain) canopy(parent, x, y, z, h, k, leaf); };
  const parasol = (parent, x, y, z, h, k = 1) => { if (hot) canopy(parent, x, y, z, h, k, pale); };
  const lantern = (parent, x, y, z, h) => { // a lamp on a short pole, for whoever is on lantern duty
    if (!night) return;
    part(parent, stickGeo, dark, x, y + h / 2, z).scale.y = h;
    part(parent, lampGeo, glow, x, y + h + 0.1, z);
    part(parent, lidGeo, dark, x, y + h + 0.22, z);
  };
  const place = (m) => { if (night) m.traverse((o) => { if (o.material === WHITE) o.material = glow; }); add(m); }; // eyes glow in the dark
  // Somewhere in front of the trees, but never on the ambassador's toes, and never inside a tree, a rock or each
  // other: each animal claims a circle wide enough for wherever it wanders (see claim() in props).
  const away = (x, z) => Math.hypot(x, z) >= 6;
  const spot = (r) => {
    for (let tries = 0; ; tries++) {
      const x = rand(-12, 12), z = rand(-12, -2);
      if (!away(x, z)) continue;
      const at = claim(view, x, z, r, away);
      if (at || tries > 30) return at || [x, z];
    }
  };
  if (v.animals === "cows") {
    const hide = flat(0xf4f1ea), nose = flat(0xe9a6a6);
    const bodyGeo = new THREE.BoxGeometry(1.4, 0.75, 0.7), legGeo = new THREE.BoxGeometry(0.16, 0.52, 0.16).translate(0, -0.24, 0); // legs swing from the hip
    const skullGeo = new THREE.BoxGeometry(0.45, 0.42, 0.42), snoutGeo = new THREE.BoxGeometry(0.15, 0.24, 0.36), hornGeo = new THREE.ConeGeometry(0.05, 0.22, 4), earGeo = new THREE.BoxGeometry(0.1, 0.08, 0.2);
    const tailGeo = new THREE.BoxGeometry(0.06, 0.5, 0.06).translate(0, -0.25, 0), tuftGeo = new THREE.SphereGeometry(0.08, 5, 4);
    const scarfGeo = new THREE.BoxGeometry(0.24, 0.4, 0.8), scarfEndGeo = new THREE.BoxGeometry(0.14, 0.45, 0.06).translate(0, -0.22, 0), ringGeo = new THREE.TorusGeometry(0.5, 0.11, 6, 12);
    for (let i = 0; i < 6; i++) {
      const cow = new THREE.Group(), head = new THREE.Group(), legs = [];
      part(cow, bodyGeo, hide, 0, 0.85, 0);
      cowSkis(cow);
      for (const [sx, sz] of [[-0.5, -0.22], [0.5, -0.22], [-0.5, 0.22], [0.5, 0.22]]) {
        const leg = part(cow, legGeo, dark, sx, 0.5, sz);
        legs.push(leg);
      }
      for (let k = 0; k < 3; k++) part(cow, new THREE.BoxGeometry(rand(0.25, 0.45), rand(0.2, 0.35), 0.72), dark, rand(-0.45, 0.45), rand(0.75, 1.0), 0);
      part(head, skullGeo, hide, 0.25, 0, 0);
      part(head, snoutGeo, nose, 0.52, -0.08, 0);
      for (const sz of [-1, 1]) {
        part(head, hornGeo, dark, 0.2, 0.28, sz * 0.15);
        const ear = part(head, earGeo, hide, 0.15, 0.12, sz * (gale ? 0.24 : 0.27));
        ear.rotation.set(gale ? 0 : sz * 0.5, gale ? -sz * 1.1 : 0, 0); // pinned back in a gale
        const eye = googly(0.07, 0.46, 0.08, sz * 0.12); eye.rotation.y = Math.PI / 2; head.add(eye);
      }
      shades(head, 0.5, 0.08, 0, 0.08, 0.14, 0.46);
      hatOn(head, 0.15, 0.2, 0, 0.22, i);
      head.position.set(0.5, 1.1, 0); // the skull sits into the shoulders
      cow.add(head);
      const tail = part(cow, tailGeo, dark, -0.7, 1.15, 0);
      part(tail, tuftGeo, dark, 0, -0.5, 0);
      cap(cow, -0.15, 1.22, 0, 0.5);
      if (snow) part(cow, scarfGeo, wool[(i + 1) % 3], 0.45, 1.0, 0);
      const scarfEnd = snow ? part(cow, scarfEndGeo, wool[(i + 1) % 3], 0.45, 0.95, 0.41) : null; // hangs down one side, or streams downwind
      if (water) part(cow, ringGeo, wool[i % 3], 0.4, 1.0, 0).rotation.x = Math.PI / 2; // a rubber ring round the neck, to be on the safe side
      brolly(cow, 0.1, 1.2, 0.2, 1.1);
      parasol(cow, 0.1, 1.2, 0.2, 1.1);
      if (i === 0) lantern(cow, -0.3, 1.2, 0, 0.8);
      const [x0, z0] = spot(water ? 2.3 : 1.3), yaw = rand(0, 6), p = rand(0, 6), s = rand(0.85, 1.15), fy = gale ? Math.PI : yaw; // in a gale, all nose into the wind
      cow.scale.setScalar(s);
      cow.position.set(x0, view.groundY(x0, z0), z0);
      cow.rotation.y = fy;
      place(cow);
      const step = (t, k) => legs.forEach((l, j) => { l.rotation.z = snow ? 0 : Math.sin(t * 3 + p + (j % 3 ? 0 : Math.PI)) * k; }); // diagonal pairs together, like a proper walk
      if (water) view.movers.push((t) => { // swimming: in up to the belly, chin up, drifting, legs paddling away under the surface
        cow.position.set(x0 + Math.sin(t * 0.2 + p) * 1.5, -0.6 + Math.sin(t * 1.5 + p) * 0.06, z0);
        head.rotation.z = 0.25;
        step(t, 0.5);
      });
      else view.movers.push((t) => {
        // Shuffles half a step forwards and back, puts its head down to graze now and then, swishes its tail at nothing.
        const u = gale ? 0 : Math.sin(t * 0.35 + p), x = x0 + Math.cos(fy) * u * 0.6, z = z0 - Math.sin(fy) * u * 0.6;
        cow.position.set(x, view.groundY(x, z), z);
        step(t, gale ? 0 : Math.abs(Math.cos(t * 0.35 + p)) * 0.2);
        head.rotation.z = hot ? -0.3 + Math.sin(t * 7) * 0.03 : -0.7 * Math.max(0, Math.sin(t * 0.5 + p)); // or, in the heat, head hanging, panting
        tail.rotation.x = Math.sin(t * 2 + p) * 0.35;
        if (gale) { // braced, tail and scarf streaming downwind
          cow.rotation.z = -0.1 - gust(t) * 0.1; tail.rotation.z = -1.2 - gust(t) * 0.3 + Math.sin(t * 9) * 0.1;
          if (scarfEnd) scarfEnd.rotation.z = -1.3 - gust(t) * 0.2 + Math.sin(t * 11 + p) * 0.12;
        }
      });
    }
  }
  if (v.animals === "birds") {
    const bodyGeo = new THREE.ConeGeometry(0.12, 0.6, 5), wingGeo = new THREE.BoxGeometry(0.5, 0.03, 0.25), beakGeo = new THREE.ConeGeometry(0.045, 0.16, 4), beak = flat(0xf0a030);
    for (let k = 0; k < 2; k++) {
      const cx = rand(-5, 5), cy = rand(4, 5.5), cz = rand(-13, -7);
      for (let i = 0; i < 7; i++) {
        const bird = new THREE.Group();
        part(bird, bodyGeo, dark, 0, 0, 0).rotation.x = Math.PI / 2; // beak forward, along +z
        part(bird, beakGeo, beak, 0, 0, 0.35).rotation.x = Math.PI / 2;
        const wings = [-1, 1].map((sx) => { const pivot = new THREE.Group(); part(pivot, wingGeo, dark, sx * 0.25, 0, 0); bird.add(pivot); return pivot; });
        bird.scale.setScalar(1.5 * rand(0.85, 1.15));
        bird.rotation.order = "YXZ"; // heading, then a nod, then the bank
        place(bird);
        const R = rand(2, 4), w = rand(0.4, 0.7) * (k ? -1 : 1), p = rand(0, 6), dy = rand(-1, 1);
        view.movers.push((t) => {
          const a = t * w + p, f = Math.sin(t * (gale ? 22 : 12) + p) * 0.6;
          if (gale) { // facing into the wind, going backwards
            const x = ((cx + R * Math.cos(a) * 0.4 + t * 2.5 + 20) % 40 + 40) % 40 - 20;
            bird.position.set(x, cy + dy + Math.sin(t * 3 + p) * 0.4, cz + R * Math.sin(a) * 0.3);
            bird.rotation.set(Math.sin(t * 4 + p) * 0.2, -Math.PI / 2, Math.sin(t * 5 + p) * 0.3);
          } else { // round and round, banked into the turn, lifting a touch with each beat
            bird.position.set(cx + R * Math.cos(a), cy + dy + Math.sin(t * 1.3 + p) * 0.3 - f * 0.08, cz + R * Math.sin(a) * 0.6);
            bird.rotation.set(Math.sin(t * 1.3 + p) * 0.12, -a + (w < 0 ? Math.PI : 0), w > 0 ? 0.35 : -0.35);
          }
          wings[0].rotation.z = -f; wings[1].rotation.z = f;
        });
      }
    }
  }
  if (v.animals === "fish") {
    const scales = flat(0xf08a3c), bodyGeo = new THREE.SphereGeometry(0.3, 7, 5), tailGeo = new THREE.ConeGeometry(0.22, 0.34, 4), finGeo = new THREE.ConeGeometry(0.1, 0.22, 4), mouthGeo = new THREE.SphereGeometry(0.08, 5, 4);
    const hankyGeo = new THREE.BoxGeometry(0.32, 0.06, 0.38), knotGeo = new THREE.SphereGeometry(0.045, 4, 3);
    for (let i = 0; i < 10; i++) {
      const fish = new THREE.Group();
      snowboard(fish, -0.35);
      part(fish, bodyGeo, scales, 0, 0, 0).scale.set(1.6, 1, 0.6);
      const tail = part(fish, tailGeo, scales, -0.55, 0, 0); // fans out behind, its point buried in the body
      tail.rotation.z = -Math.PI / 2; tail.scale.z = 0.35;
      part(fish, finGeo, scales, -0.05, 0.3, 0).scale.z = 0.4;
      const mouth = part(fish, mouthGeo, dark, 0.47, 0, 0);
      for (const sz of [-1, 1]) { const eye = googly(0.08, 0.25, 0.08, sz * 0.15); eye.rotation.y = sz > 0 ? 0 : Math.PI; fish.add(eye); }
      shades(fish, 0.26, 0.08, 0, 0.2, 0.1, 0.5);
      if (snow) hat(fish, 0.15, 0.27, 0, 0.15, i, false);
      if (hot && !water) { // beached: a knotted hanky on its head, like a proper day at the seaside
        part(fish, hankyGeo, snowMat, 0.15, 0.3, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(fish, knotGeo, snowMat, 0.15 + sx * 0.15, 0.3, sz * 0.18);
      }
      fish.scale.setScalar(1.3 * rand(0.85, 1.15));
      fish.rotation.order = "YXZ"; // yaw, then roll about its own length, then pitch
      place(fish);
      const [x0, z] = spot(water ? 1.4 : 0.8), y0 = view.groundY(x0, z), T = rand(2.5, 4), p = rand(0, 10), h = rand(1.2, 2.5);
      if (!water) { // things planted in the ground beside it, since it can hold nothing itself
        const plot = new THREE.Group();
        plot.position.set(x0, y0, z);
        brolly(plot, 0.7, 0, 0.3, 1.2);
        if (i === 0) lantern(plot, -0.7, 0, 0.3, 0.8);
        place(plot);
      }
      if (water) view.movers.push((t) => {
        // Leap back and forth between two spots, waiting under water in between.
        const n = Math.floor((t + p) / T), u = (t + p) / T - n, d = n % 2 ? -1 : 1, a = Math.min(1, u / 0.45);
        fish.position.set(x0 + d * (2 * a - 1), u < 0.45 ? 4 * h * a * (1 - a) : -0.6, z);
        fish.rotation.set(0, d > 0 ? 0 : Math.PI, Math.atan(2 * h * (1 - 2 * a)));
        tail.rotation.y = Math.sin(t * 10 + p) * 0.5;
      });
      else view.movers.push((t) => {
        // Out of water: lying on its side, gasping, and every so often a hopeless flip onto the other side.
        const F = 1.4, n = Math.floor((t + p) / F), u = (t + p) / F - n, flip = Math.min(1, u / 0.3);
        fish.position.set(x0, y0 + 0.25 + (u < 0.3 ? Math.sin(flip * Math.PI) * 0.6 : 0), z);
        fish.rotation.set(Math.PI / 2 + Math.PI * (n + flip), Math.sin(n * 12.9898 + p) * 1.2, 0);
        mouth.scale.y = 0.4 + Math.abs(Math.sin(t * 6 + p)) * 1.4;
        tail.rotation.y = Math.sin(t * 14 + p) * 0.3;
      });
    }
  }
  if (v.animals === "snails") {
    const shellMat = flat(0xd9a05b), skin = flat(0xc9cf8a), coil = flat(0xa86a35);
    const footGeo = new THREE.BoxGeometry(1.8, 0.3, 0.55), shellGeo = new THREE.SphereGeometry(0.75, 9, 7), rodGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 5);
    const ringGeos = [0.42, 0.28, 0.14].map((r) => new THREE.TorusGeometry(r, 0.05, 4, 12));
    for (let i = 0; i < 4; i++) {
      const snail = new THREE.Group(), shell = new THREE.Group(), stalks = [];
      snowboard(snail);
      const foot = part(snail, footGeo, skin, 0, 0.15, 0);
      part(shell, shellGeo, shellMat, 0, 0, 0).scale.z = 0.7;
      for (const sz of [-1, 1]) ringGeos.forEach((g, k) => part(shell, g, coil, 0.07 * k, -0.07 * k, sz * (0.44 + k * 0.04))); // the spiral: rings coiling in and down
      hatOn(shell, 0, 0.7, 0, 0.3, i);
      brolly(shell, 0.1, 0.6, 0, 0.9);
      parasol(shell, 0.1, 0.6, 0, 0.9);
      if (i === 0) lantern(shell, -0.3, 0.55, 0, 0.7);
      shell.position.set(-0.2, 0.85, 0);
      snail.add(shell);
      for (const sz of [-1, 1]) {
        const stalk = new THREE.Group();
        part(stalk, rodGeo, skin, 0, 0.3, 0);
        const eye = googly(0.1, 0, 0.62, 0); eye.rotation.y = Math.PI / 2; stalk.add(eye); // looking ahead
        shades(stalk, 0.07, 0.62, 0, 0.06, 0.1, 0.26);
        stalk.position.set(0.75, 0.2, sz * 0.12); // rooted in the front of the foot
        stalk.rotation.x = sz * 0.25;
        snail.add(stalk);
        stalks.push(stalk);
      }
      snail.scale.setScalar(1.4 * rand(0.85, 1.15));
      const [x0, z] = spot(2.2), p = rand(0, 6), dd = rand(0, 1) < 0.5 ? 1 : -1, d = gale ? -1 : dd; // in a gale, facing into it
      snail.rotation.y = d > 0 ? 0 : Math.PI;
      place(snail);
      view.movers.push((t) => {
        const x = x0 + d * (gale ? 1.5 - ((t * 0.06 + p) % 3) : ((t * 0.1 + p) % 3) - 1.5); // a long, slow crawl, or a long, slow drift; in a gale, slowly losing ground
        snail.position.set(x, water ? -0.35 + Math.sin(t * 1.4 + p) * 0.08 : view.groundY(x, z), z);
        snail.rotation.z = water ? Math.sin(t * 1.1 + p) * 0.12 : 0;
        foot.scale.set(1 + Math.sin(t * 3 + p) * 0.04, 1 + Math.sin(t * 3 + p + 1) * 0.12, 1); // the foot ripples along
        foot.position.y = 0.15 * foot.scale.y;
        shell.position.y = 0.85 + Math.sin(t * 3 + p + 1) * 0.02;
        stalks.forEach((s, k) => { s.rotation.z = (gale ? 0.9 : hot ? -1 : -0.25) + Math.sin(t * 1.5 + p + k * 2) * 0.2; }); // blown back in a gale, wilting in the heat
      });
    }
  }
  if (v.animals === "octopuses") {
    const skin = flat(0xb565a7), headGeo = new THREE.SphereGeometry(0.55, 9, 7), jointGeo = new THREE.SphereGeometry(0.08, 5, 4), tubeGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 5);
    const upperGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.5, 5).translate(0, -0.25, 0), lowerGeo = new THREE.CylinderGeometry(0.04, 0.08, 0.5, 5).translate(0, -0.25, 0);
    const glass = new THREE.MeshStandardMaterial({ color: 0xd8f2ff, transparent: true, opacity: 0.3, depthWrite: false });
    const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), bubbleGeo = new THREE.SphereGeometry(0.06, 5, 4);
    for (let i = 0; i < 5; i++) {
      const octo = new THREE.Group(), arms = [], bubbles = [];
      part(octo, headGeo, skin, 0, 1.3, 0).scale.y = 1.25;
      octo.add(googly(0.14, -0.2, 1.25, 0.48), googly(0.14, 0.2, 1.25, 0.48));
      shades(octo, 0, 1.25, 0.56, 0.72, 0.16, 0.1);
      for (let k = 0; k < 8; k++) { // arms splay outwards all round, each in its own plane, jointed halfway so it can curl
        const a = k / 8 * Math.PI * 2, arm = new THREE.Group(), elbow = new THREE.Group();
        part(arm, upperGeo, skin, 0, 0, 0);
        part(elbow, jointGeo, skin, 0, 0, 0);
        part(elbow, lowerGeo, skin, 0, 0, 0);
        elbow.position.y = -0.5;
        elbow.rotation.z = 0.5;
        arm.add(elbow);
        arm.position.set(Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3);
        arm.rotation.set(0, -a, 0.3);
        octo.add(arm);
        arms.push([arm, elbow]);
      }
      if (!water) { // on land it wears a fishbowl, with bubbles going up
        part(octo, new THREE.SphereGeometry(0.95, 14, 10), glass, 0, 1.35, 0);
        for (let k = 0; k < 3; k++) bubbles.push(part(octo, bubbleGeo, bubbleMat, 0, 0, 0));
      } else { // peeking: a snorkel, so it can stay up for as long as it likes
        part(octo, tubeGeo, wool[2], 0.5, 1.95, 0.3);
        const bend = part(octo, tubeGeo, wool[2], 0.4, 1.45, 0.3); bend.rotation.z = Math.PI / 2; bend.scale.y = 0.3;
      }
      if (snow) hat(octo, 0, water ? 1.97 : 2.28, 0, 0.35, i, false); // on the bowl, if there is one
      brolly(octo, 0.45, 1.5, 0.1, 1.2); // held up in a spare arm
      if (rain) part(octo, jointGeo, skin, 0.45, 1.65, 0.1);
      if (i === 0) lantern(octo, -0.45, 1.5, -0.1, 0.9);
      octo.scale.setScalar(1.2 * rand(0.85, 1.15));
      const [x0, z] = spot(1.9), p = rand(0, 6);
      octo.rotation.y = rand(-0.5, 0.5);
      place(octo);
      octo.traverse((o) => { if (o.material === glass || o.material === bubbleMat) o.castShadow = false; }); // glass casts no shadow
      if (water) view.movers.push((t) => { // just the top of its head and its eyes above the surface, now and then ducking under
        octo.position.set(x0 + Math.sin(t * 0.3 + p) * 1.2, -1.3 + Math.sin(t * 0.9 + p) * 0.3, z);
      });
      else view.movers.push((t) => { // a wobbly, unsteady walk, arms flailing and curling a beat behind
        const x = x0 + Math.sin(t * 0.3 + p) * 1.2;
        octo.position.set(x, view.groundY(x, z) + Math.abs(Math.sin(t * 2 + p)) * 0.15, z);
        octo.rotation.z = Math.sin(t * 2 + p) * 0.12;
        arms.forEach(([arm, elbow], k) => { arm.rotation.z = 0.6 + Math.sin(t * 6 + k * 1.7 + p) * 0.4; elbow.rotation.z = 0.5 + Math.sin(t * 6 + k * 1.7 + p - 1.2) * 0.7; });
        bubbles.forEach((b, k) => { const u = (t * 0.5 + k / 3 + p) % 1; b.position.set(Math.sin(u * 9 + k) * 0.2, 1.0 + u * 0.9, 0.7); });
      });
    }
  }
  if (v.animals === "snakes") {
    const skin = flat(0x5f9e45), band = flat(0xe0c050), ringGeo = new THREE.TorusGeometry(0.3, 0.07, 6, 12);
    const red = night ? new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xff3030, emissiveIntensity: 1, flatShading: true }) : flat(0xd8434f); // tongues glow in the dark too
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
      snowboard(head, -0.2);
      skull.scale.set(1.4, 0.75, 1);
      head.add(skull);
      for (const sz of [-1, 1]) { const eye = googly(0.09, 0.12, 0.15, sz * 0.2); eye.rotation.y = sz > 0 ? 0.8 : Math.PI - 0.8; head.add(eye); }
      shades(head, 0.16, 0.15, 0, 0.16, 0.1, 0.58);
      if (snow) hat(head, -0.05, 0.19, 0, 0.2, i, false);
      brolly(head, -0.05, 0.15, 0, 0.5, 0.6); // a tiny one, balanced on the head
      if (i === 0) lantern(head, -0.05, 0.15, 0, 0.5);
      if (water) part(head, ringGeo, wool[i % 3], -0.3, -0.05, 0).rotation.x = Math.PI / 2; // a rubber ring round the neck, to be on the safe side
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
      place(snake);
      const p = rand(0, 20), flick = (t) => { tongue.scale.x = Math.sin(t * 1.3 + p) > 0.5 ? Math.abs(Math.sin(t * 25)) : 0.01; };
      // Slithers along, its body following the same S-shaped path its head took; in water, head up, swimming.
      const z = rand(-12, -3.5), d = rand(0, 1) < 0.5 ? 1 : -1, A = 0.35, c = 1.6;
      view.movers.push((t) => {
        const s = t * 0.9 + p, x = d * ((s % 32) - 16);
        const y = (k, wx) => water ? 0.02 + Math.max(0, 3 - k) * 0.12 : view.groundY(wx, z) + R * segs[k].scale.x;
        segs.forEach((seg, k) => { const wx = x - d * gap[k]; seg.position.set(wx, y(k, wx), z + d * A * Math.sin(c * (s - gap[k]))); });
        head.position.set(x, water ? 0.5 : view.groundY(x, z) + 0.25, z + d * A * Math.sin(c * s));
        head.rotation.set(0, (d > 0 ? 0 : Math.PI) - Math.atan(A * c * Math.cos(c * s)), 0);
        flick(t);
      });
    }
  }
  // In a gale somebody's hats blow past among the streaks, tumbling. Their own stream, so they never move the animals.
  view.reseed(13);
  if (gale && v.terrain != null) for (let k = 0; k < 2; k++) { // only once there is somewhere for a hat to have blown from
    const h = new THREE.Group();
    hat(h, 0, -0.2, 0, 0.3, k, false);
    add(h);
    const y = rand(2.5, 6), z = rand(-10, 0);
    let x = rand(-20, 20);
    view.movers.push((t) => { x += 11 * (1 + gust(t)) * DT; if (x > 20) x = -20; h.position.set(x, y + Math.sin(t * 2 + k) * 0.3, z); h.rotation.set(t * 3 + k, 0, t * 5); });
  }
}
