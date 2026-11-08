// The menu's scene: a UFO holding up the title on a sign.
import * as THREE from "three";

const start = document.getElementById("start");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.domElement.id = "snakes";
start.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOV = 35, camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
camera.position.set(0, 3, 10);
camera.lookAt(0, 3, 0); // looking level
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8a8, 1.2));
const sun = new THREE.DirectionalLight(0xfff4d6, 2.0);
sun.position.set(6, 10, 8);
scene.add(sun);

const flat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
const skin = flat(0x5f9e45), white = flat(0xffffff), dark = flat(0x111111);
const UFO_Z = -2;
const googly = (r, x, y, z) => { // a white eye with a pupil, looking along +z
  const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), white);
  eye.position.set(x, y, z);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 5, 4), dark);
  pupil.position.z = r * 0.7;
  eye.add(pupil);
  return eye;
};

// Words painted on a canvas, for the sign; `aspect` is its width over its height.
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

// The title, on a screen held up by the UFO's tractor beam, which bobs about. It is placed over the page's own
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

function frame(now) {
  if (start.classList.contains("hide")) return; // the game has begun: stop
  const t = now / 1000;
  ufo.position.set(home.x, home.y - 0.02 + 0.06 * Math.sin(t * 1.4), home.z); // hovering
  ufo.rotation.set(0, -0.12, 0.025 * Math.sin(t * 0.9));
  saucer.rotation.y = dome.rotation.y = t * 0.5;
  beam.material.opacity = 0.18 + 0.06 * Math.sin(t * 5); // humming
  lights.forEach((l, i) => l.material.color.set((i + Math.floor(t * 4)) % 2 ? 0xffe066 : 0xff7eb6));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
