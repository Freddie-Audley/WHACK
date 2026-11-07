import { CATEGORIES, generateWorld } from "./worlds.js";
import { renderBoard, cleanGrid, emptyGrid, ink, W, H } from "./board.js";
import { WebcamPeer } from "./peer.js";
import { Scene, WorldView } from "./scene.js";
import { draw, interpret, report, loadKey } from "./api.js";

// Two laptops, each an ambassador with its own world, each webcam pointed at the other's screen.
// They take turns: hold up a picture of one fact, then watch for the other's reply. One side goes first.
const q = new URLSearchParams(location.search);
const N = Math.min(CATEGORIES.length, +q.get("n") || CATEGORIES.length);
const TOTAL_MS = (+q.get("t") || 90) * 1000; // the whole encounter, from pressing the button
const REPORT_MS = TOTAL_MS - 18000;          // no new turns after this; write home instead
const LISTEN_MS = 14000;                     // how long to hold a board up waiting for a reply
const IDLE = ["hello? anyone?", "they're thinking.", "take your time.", "is this thing on?"];
let first = true;
const world = generateWorld();
world.order = world.order.slice(0, N);

const $ = (id) => document.getElementById(id);
const elapsed = () => t0 ? ((performance.now() - t0) / 1000).toFixed(1) : "0.0";
const log = (m) => {
  const line = `[${first ? "1st" : "2nd"} ${elapsed()}s] ${m.replace(/\n/g, " ")}`;
  console.log(line);
  window.__TAURI__?.core.invoke("log", { line });
  if (m.startsWith("error") && !$("start").classList.contains("hide")) { $("nokey").textContent = line; $("nokey").style.display = "block"; }
};
const say = (m) => scene?.say(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const board = document.createElement("canvas");
board.width = W; board.height = H;
renderBoard(board, emptyGrid());
let scene, imagined, peer, t0;

let sent = 0;            // my facts shown so far
const guesses = {};      // their facts: category id -> { value, seen, reasoning }
const remaining = () => CATEGORIES.filter((c) => !(c.id in guesses));
const drawings = {};     // my pictures: category id -> promise, requested up front
let closing = false;

// Rebuild the imagined world from the facts understood so far; the rest stays white.
function showGuesses() {
  const known = {};
  for (const id in guesses) known[id] = guesses[id].value;
  imagined.showWorld(known);
}

// Every picture is requested at the start, so drawing never waits on the model.
function prefetch() {
  for (const id of world.order) {
    const category = CATEGORIES.find((c) => c.id === id);
    drawings[id] = draw({ category, value: world.values[id], categories: CATEGORIES })
      .catch((e) => { log(`error: ${e.message}`); return null; });
  }
}

// Wait for `pred`, sampling every 400 ms; give up after `ms` or when the clock runs out.
async function waitFor(pred, ms) {
  for (let t = 0; t < ms && !closing; t += 400) { if (pred()) return true; await sleep(400); }
  return false;
}

// True once when the other board comes up: two consistent samples, after it was down.
let peerWas = false, lastSample = false, stable = 0;
function rose() {
  const r = peer.raised();
  stable = r === lastSample ? stable + 1 : 0;
  lastSample = r;
  if (stable < 1 || r === peerWas) return false;
  peerWas = r;
  return r;
}

// My turn: draw the next fact and hold it up. It stays up until lower().
async function show() {
  const id = world.order[sent++];
  const category = CATEGORIES.find((c) => c.id === id);
  scene.pose = "drawing";
  renderBoard(board, emptyGrid()); scene.boardChanged();
  const out = await drawings[id];
  if (!out) { scene.pose = "idle"; return false; }
  const grid = cleanGrid(out.rows);
  log(`draw "${category.label}: ${world.values[id]}" — ${out.note} / "${out.thought}"`);
  say(out.thought);
  for (let i = 3, n = ink(grid); i < n + 3; i += 3) { renderBoard(board, grid, i); scene.boardChanged(); await sleep(70); }
  await sleep(300);
  scene.pose = "raised";
  document.body.classList.add("raised");
  return true;
}

function lower() {
  scene.pose = "idle";
  document.body.classList.remove("raised");
}

// Their turn: their board is up. Read it, lock in a fact, add it to the imagined world.
async function readPeer() {
  say("…");
  await sleep(800); // let their board settle in frame
  const out = await interpret({ image: peer.capture(), remaining: remaining() });
  guesses[out.category] = out;
  const c = CATEGORIES.find((c) => c.id === out.category);
  log(`see: ${out.seen} → ${c.label} = ${out.value} (${out.reasoning}) / "${out.thought}"`);
  showGuesses();
  say(out.thought);
  await sleep(1500);
}

// Show, listen, show, listen... until both worlds are told or the clock runs out.
async function play() {
  await sleep(first ? 1500 : 500);
  let myTurn = first;
  while (!closing && (sent < N || remaining().length)) {
    if (myTurn && sent < N) { if (!(await show())) continue; }
    else say(pick(IDLE));
    // Hold (or just wait) until their board comes up. If they have nothing left to tell me, hold briefly and move on.
    const theirs = await waitFor(rose, remaining().length ? LISTEN_MS : 6000);
    lower();
    if (theirs) { try { await readPeer(); } catch (e) { log(`error: ${e.message}`); say("…"); } }
    myTurn = true;
  }
  await finish();
}

async function finish() {
  closing = true;
  lower();
  say("…");
  const theirs = CATEGORIES.filter((c) => guesses[c.id]).map((c) => ({ label: c.label, value: guesses[c.id].value }));
  try { const out = await report({ theirs }); say(out.report); log(`report: ${out.report}`); }
  catch (e) { log(`error: ${e.message}`); }
}

// The app opens as a small start window; grow it to game size once a side is picked.
async function growWindow() {
  const t = window.__TAURI__;
  if (!t) return;
  try {
    const win = t.window.getCurrentWindow();
    await win.setSize(new t.dpi.LogicalSize(1400, 900));
    await win.center();
  } catch (e) { log(`error: resize failed: ${e.message || e}`); }
}

async function start(f) {
  first = f;
  t0 = performance.now();
  await growWindow();
  $("start").classList.add("hide");
  document.body.classList.add("play");
  document.body.style.setProperty("--bg1", `hsla(${world.hue * 360}, 80%, 80%, .25)`);
  document.body.style.setProperty("--bg2", `hsla(${(world.hue * 360 + 60) % 360}, 80%, 80%, .25)`);
  scene = new Scene($("stage"), board, world.hue);
  scene.showWorld(world.values);
  imagined = new WorldView($("imagined"), { camera: [0, 3.5, 12], lookAt: [0, 2.2, -4], fov: 42 });
  peer = new WebcamPeer($("video"), $("preview"), $("overlay"), +q.get("th") || 0.02);
  prefetch();
  await peer.start();
  setTimeout(() => { closing = true; }, REPORT_MS);
  play();
}

const origErr = console.error.bind(console);
console.error = (...a) => { origErr(...a); log("console.error: " + a.map(String).join(" ")); };
addEventListener("error", (e) => log(`error: ${e.message} (${e.filename}:${e.lineno})`));
addEventListener("unhandledrejection", (e) => log(`error: ${e.reason?.message || e.reason} ${e.reason?.stack || ""}`));

(async () => {
  const key = await loadKey();
  log(`booted ${location.href} key:${key ? "yes" : "no"}`);
  if (!key) $("nokey").style.display = "block";
  $("startA").onclick = () => start(true);
  $("startB").onclick = () => start(false);
})();
