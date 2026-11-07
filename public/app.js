import { generateSeed } from "./worlds.js";
import { cleanList, prepareSequence, collapseReadings, sanitiseSvg, svgUrl, svgToJpeg } from "./board.js";
import { WebcamPeer } from "./peer.js";
import { paintWorld, planEmojis, adjustEmojis, readFrames, paintGuess, loadKey } from "./api.js";

// Laptop 1 ("a") paints a secret world and shows it to laptop 2 one emoji per second
// on a white screen. Laptop 2 ("b") watches through its webcam and keeps repainting
// what it imagines. Laptop 1 watches that painting through its own webcam and steers
// its next emojis towards what's wrong. Space (or the end of the run) stops it, then
// laptop 1 shows 🏁 and reveals the real world.
const q = new URLSearchParams(location.search);
const COUNT = Math.max(1, +q.get("n") || 60); // emojis per run, one per second
const SECOND = +q.get("ms") || 1000;
const END = "🏁";                             // "that's all", read by laptop 2
const END_MS = 2500;
const FRAME_MS = 500;                         // laptop 2 samples twice per emoji
const BATCH = 8;                              // frames per read call

let role = "a";
const $ = (id) => document.getElementById(id);
const log = (m) => {
  const line = `[${role}] ${m.replace(/\n/g, " ")}`;
  console.log(line);
  window.__TAURI__?.core.invoke("log", { line });
  if (m.startsWith("error") && !$("start").classList.contains("hide")) { $("nokey").textContent = line; $("nokey").style.display = "block"; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What the laptop is doing (with a seconds counter while it waits on Claude), and what went wrong.
let ticker = null;
const status = (m) => { clearInterval(ticker); $("status").textContent = m; };
function working(label) {
  const t0 = Date.now();
  status("");
  const show = () => { $("status").textContent = `${label} ${Math.round((Date.now() - t0) / 1000)}s`; };
  show();
  ticker = setInterval(show, 1000);
}
const problem = (m = "") => { $("problem").textContent = m; };

// Space ends the run early. Sleeps wake up as soon as it's pressed.
let stopped = false, wake = () => {};
const nap = (ms) => new Promise((r) => { const t = setTimeout(r, ms); wake = () => { clearTimeout(t); r(); }; });
function stop() {
  if (stopped) return;
  stopped = true;
  log("stop pressed");
  wake();
}

function showPicture(svg) {
  const holder = $("picture");
  const old = [...holder.children];
  const img = new Image();
  img.onload = () => {
    holder.append(img);
    img.getBoundingClientRect();
    img.classList.add("show");
    setTimeout(() => old.forEach((o) => { URL.revokeObjectURL(o.src); o.remove(); }), 1400);
  };
  img.onerror = () => { log("error: picture failed to load"); problem("a picture failed to load"); };
  img.src = svgUrl(svg);
}

// ---- Laptop 1 -------------------------------------------------------------

async function retry(what, fn, tries = 3) {
  for (let i = 1; ; i++) {
    try { const out = await fn(); problem(); return out; }
    catch (e) {
      log(`error: ${what}: ${e.message}`);
      problem(`${what} failed: ${e.message}${i < tries ? " (trying again)" : ""}`);
      if (i >= tries) throw e;
      await sleep(1500);
    }
  }
}

// Laptop 1's own webcam points at laptop 2's painting. Every few emojis it takes a look,
// compares the painting with the real world, and puts corrections at the front of the
// queue. The original plan stays underneath, so a failed look or no webcam just means
// it carries on with the plan.
const FIRST_LOOK = 12; // emojis shown before the first look (laptop 2 needs time to read and paint)
const LOOK_EVERY = 8;  // at least this many emojis between looks
const AHEAD = 10;      // emojis asked for per look

async function describe() {
  working("imagining a world…");

  // Start the webcam now, so any permission prompt comes up while the world is painted.
  let cam = null, camError = "", over = false;
  const eye = new WebcamPeer($("video"));
  const camOff = () => eye.video.srcObject?.getTracks().forEach((t) => t.stop());
  eye.start()
    .then(() => { if (over) return camOff(); cam = eye; log("webcam on, watching their painting"); })
    .catch((e) => { camError = e.message || String(e); log(`error: webcam: ${camError}`); });

  const seed = generateSeed();
  let world;
  try {
    world = await retry("painting the world", async () => {
      const out = await paintWorld({ seed });
      return { title: out.title, svg: sanitiseSvg(out.svg) };
    });
  } catch { over = true; camOff(); status("couldn't paint a world. Restart the app to try again."); return; }
  log(`world: "${world.title}" from ${seed}`);

  let image = null, sequence = [];
  if (!stopped) {
    working("deciding what to say…");
    image = await svgToJpeg(world.svg);
    if (!image) log("no raster in this webview, describing from the SVG source");
    try {
      const plan = await retry("planning the emojis", () => planEmojis({ image, svg: image ? null : world.svg, count: COUNT }));
      sequence = prepareSequence(plan.emojis ?? [], COUNT, END);
      log(`plan: ${plan.plan} — ${sequence.join(" ")}`);
    } catch { over = true; camOff(); status("couldn't plan the emojis. Restart the app to try again."); return; }
    if (!sequence.length) { over = true; camOff(); status("Claude gave no usable emojis. Restart the app to try again."); return; }
  }
  status("");
  if (camError) problem(`no webcam, so not watching their painting (${camError})`);

  const shown = [];
  const base = sequence.slice(); // the original plan
  let fresh = [];                // corrections from the latest look
  const lastShown = () => shown[shown.length - 1];
  const next = () => {
    while (fresh.length || base.length) {
      const e = fresh.length ? fresh.shift() : base.shift();
      if (e !== lastShown()) return e;
    }
    return null;
  };

  let looking = false, lookedAt = -Infinity;
  async function look() {
    const view = cam.capture(1024);
    if (!view) return;
    looking = true;
    lookedAt = shown.length;
    try {
      const out = await adjustEmojis({
        image, svg: image ? null : world.svg, view,
        shown: shown.slice(), upcoming: [...fresh, ...base].slice(0, AHEAD), count: AHEAD,
      });
      fresh = cleanList(out.emojis, END, lastShown());
      log(`looked after ${lookedAt}: ${out.seen} / fix: ${out.fix} → ${fresh.join(" ")}`);
    } catch (e) {
      log(`error: look: ${e.message}`);
    }
    looking = false;
  }

  const t0 = performance.now();
  for (let i = 0; i < COUNT && !stopped; i++) {
    const e = next();
    if (!e) break;
    $("emoji").textContent = e;
    shown.push(e);
    if (cam && !looking && shown.length >= FIRST_LOOK && shown.length - lookedAt >= LOOK_EVERY) look();
    await nap(t0 + (i + 1) * SECOND - performance.now());
  }
  over = true;
  camOff();
  log(`shown: ${shown.join(" ")}`);

  $("emoji").textContent = END;
  await sleep(END_MS);
  $("emoji").textContent = "";
  document.body.classList.add("revealed");
  showPicture(world.svg);
  log("revealed");
}

// ---- Laptop 2 -------------------------------------------------------------

let peer, frameTimer;
const frames = [];   // webcam frames not yet read
const received = []; // emojis read so far, in order
let last = "", ended = false;
let drawing = false, drawn = 0, imagined = "";

function showTrail() {
  $("trail").innerHTML = "";
  const span = document.createElement("span");
  span.textContent = received.join("") + (ended ? END : "");
  $("trail").append(span);
}

async function readLoop() {
  while (!ended && !stopped) {
    if (frames.length < BATCH) await nap(BATCH * FRAME_MS);
    if (stopped) break;
    if (!frames.length) continue;
    const batch = frames.splice(0, BATCH * 2);
    try {
      const out = collapseReadings(await readFrames({ frames: batch }) ?? [], last, END);
      problem();
      last = out.last;
      if (out.added.length) {
        received.push(...out.added);
        log(`read ${out.added.join(" ")}`);
        showTrail();
        draw();
      }
      if (out.ended) { log("saw the end flag"); break; }
    } catch (e) {
      log(`error: read: ${e.message}`);
      problem(`reading the webcam failed: ${e.message}`);
    }
  }
  finish();
}

let pictures = 0;
async function draw() {
  if (drawing) return;
  drawing = true;
  while (received.length > drawn) {
    const emojis = received.slice();
    if (!pictures) working("imagining their world…");
    try {
      const out = await paintGuess({ emojis, previous: imagined });
      showPicture(sanitiseSvg(out.svg));
      if (!pictures++) status("");
      imagined = out.imagined;
      log(`imagined from ${emojis.length}: ${out.imagined}`);
    } catch (e) {
      log(`error: paint guess: ${e.message}`);
      problem(`painting failed: ${e.message}`);
      await sleep(2000);
    }
    drawn = emojis.length;
  }
  drawing = false;
}

function finish() {
  if (ended) return;
  ended = true;
  clearInterval(frameTimer);
  peer?.video.srcObject?.getTracks().forEach((t) => t.stop());
  showTrail();
  if (!received.length) status("no emojis seen");
  draw(); // one last painting with everything, if anything arrived since the last one
}

async function guess() {
  working("watching…");
  peer = new WebcamPeer($("video"));
  try { await peer.start(); }
  catch (e) { log(`error: webcam: ${e.message}`); status("no webcam"); problem(e.message); return; }
  frameTimer = setInterval(() => { const f = peer.capture(); if (f) frames.push(f); }, FRAME_MS);
  readLoop();
}

// ---- Start ----------------------------------------------------------------

// The app opens as a small start window; grow it once a role is picked.
async function growWindow() {
  const t = window.__TAURI__;
  if (!t) return;
  try {
    const win = t.window.getCurrentWindow();
    await win.setSize(new t.dpi.LogicalSize(1400, 900));
    await win.center();
  } catch (e) { log(`error: resize failed: ${e.message || e}`); }
}

async function start(r) {
  role = r;
  await growWindow();
  $("start").classList.add("hide");
  document.body.classList.add("running", role === "a" ? "describe" : "guess");
  addEventListener("keydown", (e) => { if (e.code === "Space" || e.code === "Escape") { e.preventDefault(); stop(); } });
  if (role === "a") describe();
  else guess();
}

const origErr = console.error.bind(console);
console.error = (...a) => { origErr(...a); log("console.error: " + a.map(String).join(" ")); };
addEventListener("error", (e) => log(`error: ${e.message} (${e.filename}:${e.lineno})`));
addEventListener("unhandledrejection", (e) => log(`error: ${e.reason?.message || e.reason} ${e.reason?.stack || ""}`));

(async () => {
  const key = await loadKey();
  log(`booted ${location.href} key:${key ? "yes" : "no"}`);
  if (!key) $("nokey").style.display = "block";
  $("startA").onclick = () => start("a");
  $("startB").onclick = () => start("b");
  if (q.get("role")) start(q.get("role"));
})();
