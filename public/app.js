import { CATEGORIES, generateWorld } from "./worlds.js";
import { renderBoard, cleanEmoji, W, H } from "./board.js";
import { WebcamPeer } from "./peer.js";
import { Scene, WorldView } from "./scene.js";
import { draw, interpret, report, loadKey } from "./api.js";

// One laptop describes its world (role "a"), the other only guesses (role "b").
// Each laptop's webcam points at the other's screen.
const q = new URLSearchParams(location.search);
const N = Math.min(CATEGORIES.length, +q.get("n") || CATEGORIES.length);
const HOLD_MS = 12000; // how long the describer holds each board up
let role = "a";
const world = generateWorld();
world.order = world.order.slice(0, N);

const $ = (id) => document.getElementById(id);
const log = (m) => {
  const line = `[${role}] ${m.replace(/\n/g, " ")}`;
  console.log(line);
  window.__TAURI__?.core.invoke("log", { line });
  if (m.startsWith("error") && !$("start").classList.contains("hide")) { $("nokey").textContent = line; $("nokey").style.display = "block"; }
};
const say = (m) => scene?.say(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const board = document.createElement("canvas");
board.width = W; board.height = H;
renderBoard(board);
let scene, imagined, peer;

let sent = 0;            // describer: facts shown so far
const guesses = {};      // guesser: category id -> { value, seen, reasoning }
const remaining = () => CATEGORIES.filter((c) => !(c.id in guesses));
const describer = () => role === "a";

// Guesser: rebuild the imagined world from the facts guessed so far.
function showGuesses() {
  const known = {};
  for (const id in guesses) known[id] = guesses[id].value;
  imagined.showWorld(known);
}

// Describer: pick an emoji for each fact, hold it up for a while, lower it, next.
async function describe() {
  await sleep(1500);
  for (sent = 0; sent < N; ) {
    const id = world.order[sent];
    const category = CATEGORIES.find((c) => c.id === id);
    const value = world.values[id];
    say("");
    scene.pose = "drawing";
    renderBoard(board); scene.boardChanged();
    let out;
    try { out = await draw({ category, value, categories: CATEGORIES }); }
    catch (e) { log(`error: ${e.message}`); say("…"); await sleep(4000); continue; }
    const emoji = cleanEmoji(out.emoji);
    log(`show ${emoji} for "${category.label}: ${value}" — ${out.note} / "${out.thought}"`);
    say(out.thought);
    await sleep(1500);
    renderBoard(board, emoji); scene.boardChanged();
    await sleep(800);
    sent++;
    scene.pose = "raised";
    document.body.classList.add("raised");
    await sleep(1200);
    peer.publish(true, board.toDataURL("image/png"));
    for (let t = 0; t < HOLD_MS; t += 3000) { await sleep(3000); peer.publish(true, board.toDataURL("image/png")); }
    peer.publish(false, null);
    scene.pose = "idle";
    document.body.classList.remove("raised");
    await sleep(2000);
  }
  say("");
}

// Guesser: every time their board goes up, read it and lock in a fact.
async function readPeer() {
  const image = peer.capture();
  if (!image) return;
  say("…");
  const out = await interpret({ image, remaining: remaining() });
  guesses[out.category] = out;
  const c = CATEGORIES.find((c) => c.id === out.category);
  log(`see: ${out.seen} → ${c.label} = ${out.value} (${out.reasoning}) / "${out.thought}"`);
  showGuesses();
  say(out.thought);
  if (Object.keys(guesses).length >= N) await finish();
}

async function finish() {
  finished = true;
  await sleep(3000);
  const theirs = CATEGORIES.filter((c) => guesses[c.id]).map((c) => ({ label: c.label, value: guesses[c.id].value }));
  const out = await report({ theirs });
  say(out.report);
  log(`report: ${out.report}`);
}

let busy = false, finished = false, peerWas = false, lastSample = false, stable = 0;
async function tick() {
  const r = peer.raised();
  stable = r === lastSample ? stable + 1 : 0;
  lastSample = r;
  if (r === peerWas || stable < 1 || busy || finished) return; // need two consistent samples
  peerWas = r;
  if (!r) return;
  busy = true;
  try { await readPeer(); } catch (e) { log("error: " + e.message); say("…"); }
  busy = false;
}

// The app opens as a small start window; grow it to game size once a role is picked.
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
  document.body.classList.add(describer() ? "describe" : "guess");
  document.body.style.setProperty("--bg1", `hsla(${world.hue * 360}, 80%, 80%, .25)`);
  document.body.style.setProperty("--bg2", `hsla(${(world.hue * 360 + 60) % 360}, 80%, 80%, .25)`);
  scene = new Scene($("stage"), describer() ? board : null, world.hue);
  scene.showWorld(world.values);
  if (!describer()) imagined = new WorldView($("imagined"), { camera: [0, 3.5, 12], lookAt: [0, 2.2, -4], fov: 42 });
  peer = new WebcamPeer($("video"), $("preview"));
  if (describer()) describe();
  else { await peer.start(); setInterval(tick, 1000); }
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
})();
