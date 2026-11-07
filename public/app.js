import { CATEGORIES, generateWorld } from "./worlds.js";
import { renderBoard, renderEditorBoard, cleanGrid, emptyGrid, ink, W, H, SIZE } from "./board.js";
import { WebcamPeer } from "./peer.js";
import { Scene, WorldView } from "./scene.js";
import { draw, interpret, report, openers, loadKey } from "./api.js";

// One laptop describes its world (role "a"), the other only guesses (role "b").
// The guesser's webcam points at the describer's screen.
const q = new URLSearchParams(location.search);
const N = Math.min(CATEGORIES.length, +q.get("n") || CATEGORIES.length);
const TOTAL_MS = (+q.get("t") || 90) * 1000; // the whole encounter, from pressing the button
const REPORT_MS = TOTAL_MS - 18000;          // the guesser stops guessing after this and writes home
const INK_MS = 3500;                         // the drawing appears over this long, board already up
const HOLD_MS = 5000;                        // how long the finished board stays up
const PAUSE_MS = +q.get("pause") || 2000;    // guesser: pause between one line of commentary and the next look at the board
const IDLE = ["hello? anyone?", "they're thinking.", "take your time.", "is this thing on?"];
let role = "a";
const world = generateWorld();
world.order = world.order.slice(0, N);

const $ = (id) => document.getElementById(id);
const elapsed = () => t0 ? ((performance.now() - t0) / 1000).toFixed(1) : "0.0";
const log = (m) => {
  const line = `[${role} ${elapsed()}s] ${m.replace(/\n/g, " ")}`;
  console.log(line);
  window.__TAURI__?.core.invoke("log", { line });
  if (m.startsWith("error") && !$("start").classList.contains("hide")) { $("nokey").textContent = line; $("nokey").style.display = "block"; }
};
// The ambassador writes in lowercase, with no dashes, semicolons or colons: those become commas or full stops.
const plain = (m) => m.toLowerCase().replace(/\s*[—–]\s*|\s*--\s*/g, ", ").replace(/\s*[;:]\s*/g, ". ").trim();
const say = (m) => scene?.say(m == null ? m : plain(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const board = document.createElement("canvas");
board.width = W; board.height = H;
renderBoard(board, emptyGrid());
const editorCanvas = $("pixel-board");
const editorGrid = emptyGrid();
renderEditorBoard(editorCanvas, editorGrid);
let scene, imagined, peer, t0;
let editorPen = "#";
let editorTool = "pen";
let drawing = false;

function pixelAt(event) {
  const rect = editorCanvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(SIZE - 1, Math.floor((event.clientX - rect.left) / rect.width * SIZE)));
  const y = Math.max(0, Math.min(SIZE - 1, Math.floor((event.clientY - rect.top) / rect.height * SIZE)));
  return { x, y };
}

function paintPixel(event) {
  const { x, y } = pixelAt(event);
  if (editorGrid[y][x] === editorPen) return;
  const row = [...editorGrid[y]];
  row[x] = editorPen;
  editorGrid[y] = row.join("");
  renderEditorBoard(editorCanvas, editorGrid);
}

function fillArea(x, y) {
  const target = editorGrid[y][x];
  if (target === editorPen) return;

  const pixels = Array.from({ length: SIZE * SIZE }, () => false);
  const stack = [y * SIZE + x];
  pixels[stack[0]] = true;
  while (stack.length) {
    const index = stack.pop();
    const px = index % SIZE, py = Math.floor(index / SIZE);
    if (editorGrid[py][px] !== target) continue;

    const row = [...editorGrid[py]];
    row[px] = editorPen;
    editorGrid[py] = row.join("");
    for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
      const neighbor = ny * SIZE + nx;
      if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && !pixels[neighbor] && editorGrid[ny][nx] === target) {
        pixels[neighbor] = true;
        stack.push(neighbor);
      }
    }
  }
  renderEditorBoard(editorCanvas, editorGrid);
}

editorCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  if (editorTool === "fill") {
    const { x, y } = pixelAt(event);
    fillArea(x, y);
    return;
  }
  drawing = true;
  editorCanvas.setPointerCapture(event.pointerId);
  paintPixel(event);
});
editorCanvas.addEventListener("pointermove", (event) => {
  if (drawing) paintPixel(event);
});
editorCanvas.addEventListener("pointerup", () => { drawing = false; });
editorCanvas.addEventListener("pointercancel", () => { drawing = false; });

function selectPen(color) {
  editorPen = color;
  $("pen-black").setAttribute("aria-pressed", String(color === "#"));
  $("pen-white").setAttribute("aria-pressed", String(color === "."));
}

function selectEditorTool(tool) {
  editorTool = tool;
  $("brush-tool").setAttribute("aria-pressed", String(tool === "pen"));
  $("fill-tool").setAttribute("aria-pressed", String(tool === "fill"));
}

let sent = 0;            // describer: facts shown so far
const guesses = {};      // guesser: category id -> reading, committed once the board came down
let pending = null;      // guesser: reading of the board that is up right now; may still change
let firstWords = [];     // guesser: lines for the moment a board comes up, fetched at the start
const remaining = () => CATEGORIES.filter((c) => !(c.id in guesses));
const drawings = {};     // describer: category id -> promise of the picture, requested up front
const describer = () => role === "a";
let closing = false;

// Guesser: rebuild the imagined world from the facts understood so far, including the one
// still being read, which may change its mind; the rest stays white.
function showGuesses() {
  const known = {};
  for (const id in guesses) known[id] = guesses[id].value;
  if (pending) known[pending.category] = pending.value;
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

// Wait for `pred`, sampling every 200 ms; give up after `ms` or when the clock runs out.
async function waitFor(pred, ms) {
  for (let t = 0; t < ms && !closing; t += 200) { if (pred()) return true; await sleep(200); }
  return false;
}

// True once when the describer's board comes up: two consistent samples, after it was down.
let peerWas = false, lastSample = false, stable = 0;
function rose() {
  const r = peer.raised();
  stable = r === lastSample ? stable + 1 : 0;
  lastSample = r;
  if (stable < 1 || r === peerWas) return false;
  peerWas = r;
  return r;
}

// Describer: mutter, put the board up, then draw on it while they watch. It stays up until lower().
async function show() {
  const id = world.order[sent++];
  const category = CATEGORIES.find((c) => c.id === id);
  scene.pose = "drawing";
  renderBoard(board, emptyGrid()); scene.boardChanged();
  const out = await drawings[id];
  if (!out) { scene.pose = "idle"; return null; }
  const grid = cleanGrid(out.rows);
  log(`draw "${category.label}: ${world.values[id]}" — ${out.note} / "${out.thought}" / "${out.after}"`);
  say(out.thought);
  await sleep(1500);
  scene.pose = "raised";
  document.body.classList.add("raised");
  await sleep(300);
  const n = ink(grid), steps = Math.max(1, Math.ceil(n / 2));
  for (let i = 1; i <= steps; i++) { renderBoard(board, grid, Math.round(n * i / steps)); scene.boardChanged(); await sleep(INK_MS / steps); }
  return out;
}

function lower() {
  scene.pose = "idle";
  document.body.classList.remove("raised");
}

// Describer: one fact after another; the finished board stays up a while, then a word on the way down.
async function describe() {
  await sleep(1500);
  while (sent < N) {
    const out = await show();
    if (!out) continue;
    await sleep(HOLD_MS);
    lower();
    say(out.after);
    await sleep(2500);
  }
}

// True when the board has been out of view for two samples in a row.
async function lowered() {
  for (let i = 0; i < 2; i++) { if (peer.raised()) return false; await sleep(200); }
  return true;
}

// Guesser: their board is up. Keep reading it as the drawing grows, thinking aloud and changing
// the imagined world as the reading changes; commit whatever was last understood when it comes down.
async function readBoard() {
  say(firstWords.length ? firstWords.splice((Math.random() * firstWords.length) | 0, 1)[0] : "…");
  await sleep(500); // let their board settle in frame
  let reading = null;
  while (!closing && !(await lowered())) {
    try {
      const out = await interpret({ image: peer.capture(), remaining: remaining(), previous: reading });
      const c = CATEGORIES.find((c) => c.id === out.category);
      const changed = !reading || reading.category !== out.category || reading.value !== out.value;
      log(`see: ${out.seen} → ${c.label} = ${out.value}${changed ? "" : " (unchanged)"} (${out.reasoning}) / "${out.thought}"`);
      reading = pending = out;
      if (changed) showGuesses();
      say(out.thought);
    } catch (e) { log(`error: ${e.message}`); }
    await sleep(PAUSE_MS);
  }
  pending = null;
  if (reading) { guesses[reading.category] = reading; log(`lock: ${reading.category} = ${reading.value}`); }
  showGuesses();
}

// Guesser: every time their board comes up, read it until it goes down; stop when every fact is in or the clock runs out.
async function guess() {
  say(pick(IDLE));
  while (!closing && remaining().length) {
    if (await waitFor(rose, TOTAL_MS)) await readBoard();
  }
  await finish();
}

async function finish() {
  closing = true;
  await sleep(2000);
  say("…");
  const theirs = CATEGORIES.filter((c) => guesses[c.id]).map((c) => ({ label: c.label, value: guesses[c.id].value }));
  try { const out = await report({ theirs }); say(out.report); log(`report: ${out.report}`); }
  catch (e) { log(`error: ${e.message}`); }
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

async function openEditor() {
  await growWindow();
  $("start").classList.add("hide");
  document.body.classList.add("editor");
}

async function start(r) {
  role = r;
  t0 = performance.now();
  await growWindow();
  $("start").classList.add("hide");
  document.body.classList.add(describer() ? "describe" : "guess");
  document.body.style.setProperty("--bg1", `hsla(${world.hue * 360}, 80%, 80%, .25)`);
  document.body.style.setProperty("--bg2", `hsla(${(world.hue * 360 + 60) % 360}, 80%, 80%, .25)`);
  scene = new Scene($("stage"), describer() ? board : null, world.hue);
  scene.showWorld(world.values);
  if (describer()) { prefetch(); describe(); return; }
  imagined = new WorldView($("imagined"), { camera: [0, 3.5, 12], lookAt: [0, 2.2, -4], fov: 42 });
  peer = new WebcamPeer($("video"), $("preview"), $("overlay"), +q.get("th") || 0.01);
  openers({ n: N + 1 }).then((l) => { firstWords = l; }).catch((e) => log(`error: ${e.message}`));
  await peer.start();
  setTimeout(() => { closing = true; }, REPORT_MS);
  guess();
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
  $("startC").onclick = openEditor;
  $("pen-black").onclick = () => selectPen("#");
  $("pen-white").onclick = () => selectPen(".");
  $("brush-tool").onclick = () => selectEditorTool("pen");
  $("fill-tool").onclick = () => selectEditorTool("fill");
  $("clear-board").onclick = () => {
    editorGrid.splice(0, editorGrid.length, ...emptyGrid());
    renderEditorBoard(editorCanvas, editorGrid);
  };
})();
