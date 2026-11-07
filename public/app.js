import { generateSeed } from "./worlds.js";
import { prepareSequence, collapseReadings, sanitiseSvg, svgUrl, svgToJpeg } from "./board.js";
import { WebcamPeer } from "./peer.js";
import { paintWorld, planEmojis, readFrames, paintGuess, loadKey } from "./api.js";

// Laptop 1 ("a") paints a secret world and shows it to laptop 2 one emoji per second
// on a white screen. Laptop 2 ("b") watches through its webcam and keeps repainting
// what it imagines. Space (or the end of the sequence) stops the run, then laptop 1
// shows 🏁 and reveals the real world.
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
const status = (m) => { $("status").textContent = m; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  img.onerror = () => log("error: picture failed to load");
  img.src = svgUrl(svg);
}

// ---- Laptop 1 -------------------------------------------------------------

async function retry(what, fn, tries = 3) {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) { log(`error: ${what}: ${e.message}`); if (i >= tries) throw e; await sleep(1500); }
  }
}

async function describe() {
  status("imagining a world…");
  const seed = generateSeed();
  let world;
  try {
    world = await retry("paint", async () => {
      const out = await paintWorld({ seed });
      return { title: out.title, svg: sanitiseSvg(out.svg) };
    });
  } catch { status("couldn't paint a world, restart to try again"); return; }
  log(`world: "${world.title}" from ${seed}`);

  let sequence = [];
  if (!stopped) {
    status("deciding what to say…");
    const image = await svgToJpeg(world.svg);
    if (!image) log("no raster in this webview, describing from the SVG source");
    try {
      const plan = await retry("plan", () => planEmojis({ image, svg: image ? null : world.svg, count: COUNT }));
      sequence = prepareSequence(plan.emojis, COUNT, END);
      log(`plan: ${plan.plan} — ${sequence.join(" ")}`);
    } catch { status("couldn't plan the emojis"); }
  }
  status("");

  const t0 = performance.now();
  for (let i = 0; i < sequence.length && !stopped; i++) {
    $("emoji").textContent = sequence[i];
    await nap(t0 + (i + 1) * SECOND - performance.now());
  }

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
    let readings;
    try { readings = await readFrames({ frames: batch }); }
    catch (e) { log(`error: read: ${e.message}`); continue; }
    const out = collapseReadings(readings, last, END);
    last = out.last;
    if (out.added.length) {
      received.push(...out.added);
      log(`read ${out.added.join(" ")}`);
      status("");
      showTrail();
      draw();
    }
    if (out.ended) { log("saw the end flag"); break; }
  }
  finish();
}

async function draw() {
  if (drawing) return;
  drawing = true;
  while (received.length > drawn) {
    const emojis = received.slice();
    try {
      const out = await paintGuess({ emojis, previous: imagined });
      showPicture(sanitiseSvg(out.svg));
      imagined = out.imagined;
      log(`imagined from ${emojis.length}: ${out.imagined}`);
    } catch (e) {
      log(`error: paint guess: ${e.message}`);
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
  if (!received.length) status("nothing seen");
  draw(); // one last painting with everything, if anything arrived since the last one
}

async function guess() {
  status("watching…");
  peer = new WebcamPeer($("video"));
  try { await peer.start(); }
  catch (e) { log(`error: webcam: ${e.message}`); status("no webcam"); return; }
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
