// The menu's scene: a UFO holding up the title on a sign, and a snake like the ones in the worlds going round
// underneath it flying the credit on a flag.
import * as THREE from "three";

const start = document.getElementById("start");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.domElement.id = "snakes";
start.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOV = 35, camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
camera.position.set(0, 3, 10);
camera.lookAt(0, 3, 0); // looking level, so the ground (and the snake) is along the bottom
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8a8, 1.2));
const sun = new THREE.DirectionalLight(0xfff4d6, 2.0);
sun.position.set(6, 10, 8);
scene.add(sun);

const flat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
const skin = flat(0x5f9e45), band = flat(0xe0c050), red = flat(0xd8434f), white = flat(0xffffff), dark = flat(0x111111);
const N = 16, R = 0.24, A = 0.35, C = 1.6, SPEED = 1, MIDDLE = -2, UFO_Z = MIDDLE; // the UFO hovers over the middle of the snake's circuit
const googly = (r, x, y, z) => { // a white eye with a pupil, looking along +z
  const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), white);
  eye.position.set(x, y, z);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 5, 4), dark);
  pupil.position.z = r * 0.7;
  eye.add(pupil);
  return eye;
};

const segs = [], segGeo = new THREE.SphereGeometry(R, 7, 5);
const size = (k) => 1 - (k / N) * 0.7, gap = [0.3]; // how far behind the head each segment is: touching all the way down
for (let k = 1; k < N; k++) gap[k] = gap[k - 1] + R * (size(k - 1) + size(k)) * 0.85;
for (let k = 0; k < N; k++) { // tapering to the tail
  const seg = new THREE.Mesh(segGeo, k % 3 === 2 ? band : skin);
  seg.scale.setScalar(size(k));
  scene.add(seg);
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
scene.add(head);

// Words painted on a canvas, for the sign and the flag; `aspect` is its width over its height.
function words(text, px, bg, ink) {
  const c = document.createElement("canvas"), g = c.getContext("2d"), font = `500 ${px}px -apple-system, system-ui, sans-serif`;
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width + px * 1.2); c.height = Math.ceil(px * 1.7);
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + px * 0.04);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return { map, aspect: c.width / c.height };
}

// The credit, on a flag flying from a pole on its back, rippling as it goes.
const POLE_AT = 1, FW = 2.4, POLE = 0.55; // short enough to pass under the buttons
const cloth = words("by whack_a_snake", 64, "#fff", "#1d1d3a"), FH = FW / cloth.aspect;
const flag = new THREE.Group(), clothGeo = new THREE.PlaneGeometry(FW, FH, 24, 1).translate(-FW / 2, POLE - FH / 2, 0);
const pole = new THREE.Mesh(new THREE.BoxGeometry(0.04, POLE + 0.05, 0.04).translate(0, (POLE + 0.05) / 2, 0), flat(0x8a6a48));
flag.add(pole, new THREE.Mesh(clothGeo, new THREE.MeshBasicMaterial({ map: cloth.map, side: THREE.DoubleSide })));
scene.add(flag);
const flatX = Float32Array.from({ length: clothGeo.attributes.position.count }, (_, i) => clothGeo.attributes.position.getX(i));

// The title, on a screen held up by the UFO's tractor beam, which bobs about above the snake. It is placed over the page's own
// (invisible) heading so the buttons sit under it.
const ufo = new THREE.Group();
const hull = new THREE.MeshStandardMaterial({ color: 0xd5dbe3, roughness: 0.3 }), beamColour = 0x7fe9ff;
const screen = words("First Contact", 160, "#141a30", "#bff6ff"), TH = 1 / screen.aspect;
const board = new THREE.Mesh(new THREE.BoxGeometry(1, TH, 0.04), [hull, hull, hull, hull, new THREE.MeshBasicMaterial({ map: screen.map }), hull]);
const border = new THREE.Mesh(new THREE.BoxGeometry(1.025, TH + 0.025, 0.03), new THREE.MeshBasicMaterial({ color: beamColour })); // a lit edge
border.position.z = -0.01;
const SAUCER_Y = TH / 2 + 0.2;
const saucer = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 12), hull);
saucer.scale.y = 0.25;
saucer.position.y = SAUCER_Y;
const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.55, roughness: 0.1 }));
dome.position.y = SAUCER_Y + 0.03;
const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin); // someone at the controls, looking out
pilot.position.y = SAUCER_Y + 0.05;
pilot.add(googly(0.022, 0, 0.012, 0.035));
const lights = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshBasicMaterial());
  l.position.set(0.2 * Math.cos(a), SAUCER_Y - 0.01, 0.2 * Math.sin(a));
  return l;
});
// The beam, widening from the underside of the saucer to the top of the screen.
const BEAM = SAUCER_Y - 0.04 - TH / 2;
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.32, BEAM, 32, 1, true), new THREE.MeshBasicMaterial({ color: beamColour, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
beam.position.y = TH / 2 + BEAM / 2;
ufo.add(board, border, saucer, dome, pilot, ...lights, beam);
scene.add(ufo);
const h1 = document.querySelector("#card h1"), home = new THREE.Vector3();
function placeTitle() {
  const r = h1.getBoundingClientRect();
  home.set(((r.left + r.width / 2) / innerWidth) * 2 - 1, 1 - ((r.top + r.height / 2) / innerHeight) * 2, 0.5).unproject(camera).sub(camera.position);
  home.multiplyScalar((UFO_Z - camera.position.z) / home.z).add(camera.position);
  const perPx = 2 * Math.tan(camera.fov * Math.PI / 360) * (camera.position.z - UFO_Z) / innerHeight;
  ufo.scale.setScalar((r.width + 30) * perPx);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  placeTitle();
}
addEventListener("resize", resize);
resize();

// The snake goes round and round under the UFO: rightwards across the front, in front of the buttons, turning
// round off the edges of the window, and back behind them. It wiggles from side to side as it goes.
const RX = 7, RZ = 1, START = RX * (Math.PI + 0.87); // starting with its head just off the left of the front, all of it out of sight
function onPath(s, k) {
  const q = s - (k < 0 ? 0 : gap[k]), a = -(q + START) / RX, wiggle = A * Math.sin(C * q);
  const nx = Math.cos(a) / RX, nz = Math.sin(a) / RZ, n = Math.hypot(nx, nz); // outwards, across the path
  return [RX * Math.cos(a) + (wiggle * nx) / n, MIDDLE + RZ * Math.sin(a) + (wiggle * nz) / n];
}

function frame(now) {
  if (start.classList.contains("hide")) return; // the game has begun: stop
  const t = now / 1000, s = t * SPEED;
  segs.forEach((seg, k) => { const [x, z] = onPath(s, k); seg.position.set(x, R * seg.scale.x, z); });
  const [hx, hz] = onPath(s, -1), [nx, nz] = onPath(s + 0.05, -1);
  head.position.set(hx, 0.25, hz);
  head.rotation.set(0, -Math.atan2(nz - hz, nx - hx), 0);
  tongue.scale.x = Math.sin(t * 1.3) > 0.5 ? Math.abs(Math.sin(t * 25)) : 0.01;
  const base = segs[POLE_AT].position, f = segs[POLE_AT - 1].position, b = segs[POLE_AT + 3].position;
  flag.position.set(base.x, 2 * R * segs[POLE_AT].scale.x - 0.04, base.z);
  flag.rotation.y = -Math.atan2(f.z - b.z, f.x - b.x); // the cloth streams out behind
  flag.visible = f.x > b.x; // furled on the way back, behind the buttons (it turns round out of sight)
  const pos = clothGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const u = -flatX[i] / FW; pos.setZ(i, 0.09 * u * Math.sin(5 * u - t * 6)); }
  pos.needsUpdate = true;
  ufo.position.set(home.x, home.y + 0.06 * Math.sin(t * 1.4), home.z); // hovering
  ufo.rotation.set(0, -0.12, 0.025 * Math.sin(t * 0.9));
  saucer.rotation.y = dome.rotation.y = t * 0.5;
  beam.material.opacity = 0.18 + 0.06 * Math.sin(t * 5); // humming
  lights.forEach((l, i) => l.material.color.set((i + Math.floor(t * 4)) % 2 ? 0xffe066 : 0xff7eb6));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
