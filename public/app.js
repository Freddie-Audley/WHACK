import { CATEGORIES, EARTH, generateWorld } from "./worlds.js";
import { renderBoard, renderEditorBoard, cleanGrid, emptyGrid, ink, W, H, SIZE } from "./board.js";
import { WebcamPeer } from "./peer.js";
import { Scene, WorldView, EARTH_COLOURS } from "./scene.js";
import { draw, interpret, openers, loadKey } from "./api.js";

// One laptop describes its world (role "a"), the other only guesses (role "b").
// The guesser's webcam points at the describer's screen.
const q = new URLSearchParams(location.search);
const N = Math.min(CATEGORIES.length, +q.get("n") || CATEGORIES.length);
const INK_MS = 2000;                         // the drawing appears over this long, board already up
const HOLD_MS = 3000;                        // how long the finished board stays up
// Describer: time to read what it says it's about to draw, longer for longer lines.
const readMs = (text) => Math.min(5000, Math.max(1500, 800 + 55 * plain(text).length));
const PAUSE_MS = +q.get("pause") || 2000;    // guesser: pause between one line of commentary and the next look at the board
const PICTURES = 4;                          // the describer gets this many boards for the whole world; people can add more after
const IDLE = ["Hello?", "Take your time, natives.", "I can wait.", "Is this thing on?", "Still here.", "The natives are quiet."];
let role = "a";
const world = generateWorld();
world.order = world.order.slice(0, N);
// The facts shared out over the boards as evenly as possible: five facts on four boards means one board carries two.
const pictures = Array.from({ length: Math.min(PICTURES, N) }, () => []);
world.order.forEach((id, i) => pictures[i % pictures.length].push(id));
const describeFacts = (ids) => ids.map((id) => `${CATEGORIES.find((c) => c.id === id).label}: ${world.values[id]}`).join(", ");

const $ = (id) => document.getElementById(id);
const elapsed = () => t0 ? ((performance.now() - t0) / 1000).toFixed(1) : "0.0";
const log = (m) => {
  const line = `[${role} ${elapsed()}s] ${m.replace(/\n/g, " ")}`;
  console.log(line);
  window.__TAURI__?.core.invoke("log", { line });
  if (m.startsWith("error") && !$("start").classList.contains("hide")) { $("nokey").textContent = line; $("nokey").style.display = "block"; }
};
// The ambassador writes with no dashes, semicolons or colons: those become commas or full stops.
// And it says one sentence at a time, whatever the model sent, without the odd stray </br> or } it tacks on.
const plain = (m) => m.replace(/<[^>]*>|[{}]/g, "").replace(/\s*[—–]\s*|\s*--\s*/g, ", ").replace(/\s*[;:]\s*/g, ". ").trim().split(/(?<=[.?!…])\s+/)[0];
const say = (m) => scene?.say(m == null ? m : plain(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const board = document.createElement("canvas");
board.width = W; board.height = H;
renderBoard(board, emptyGrid());
const seenBoard = document.createElement("canvas"); // the guesser's reading of their board, shown beside the webcam
seenBoard.width = W; seenBoard.height = H;
const editorCanvas = $("pixel-board");
const editorGrid = emptyGrid();
renderEditorBoard(editorCanvas, editorGrid);
let scene, imagined, peer, t0;
let editorPen = "#";
let editorTool = "pen";
let drawing = false;
const touchOnly = matchMedia("(pointer: coarse)").matches; // phones: no tool buttons, just Clear

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
  if (touchOnly) { const { x, y } = pixelAt(event); editorPen = editorGrid[y][x] === "#" ? "." : "#"; }
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

let sent = 0;            // describer: boards shown so far
const guesses = {};      // guesser: category id -> reading, committed once the board came down
let pending = null;      // guesser: reading of the board that is up right now; may still change
let firstWords = [];     // guesser: lines for the moment a board comes up, fetched at the start
const drawings = [];     // describer: one promise per board, requested up front
const describer = () => role === "a";
let over = false;         // the encounter has ended: R goes back to the menu
// On a phone (in the browser or from the home screen) the app is only the board over Earth, so skip the menu.
const phoneApp = touchOnly || navigator.standalone || matchMedia("(display-mode: standalone)").matches;

// Guesser: rebuild the imagined world from the facts understood so far, including the one
// still being read, which may change its mind; the rest stays white.
function showGuesses() {
  const known = {};
  for (const id in guesses) known[id] = guesses[id].value;
  if (pending) for (const r of pending.readings) known[r.category] = r.value;
  imagined.showWorld(known);
}

// Every picture is requested at the start, so drawing never waits on the model.
// A board that came back (nearly) blank, as "no sun" or "nothing" sometimes does, is asked for once more.
function prefetch() {
  pictures.forEach((ids, k) => {
    const facts = ids.map((id) => ({ category: CATEGORIES.find((c) => c.id === id), value: world.values[id] }));
    drawings[k] = draw({ facts })
      .then((out) => ink(cleanGrid(out.rows)) >= 8 ? out : (log(`redraw: "${describeFacts(ids)}" came back blank`), draw({ facts })))
      .catch((e) => { log(`error: ${e.message}`); return null; });
  });
}

// Wait for `pred`, sampling every 200 ms; give up after `ms`.
async function waitFor(pred, ms) {
  for (let t = 0; t < ms; t += 200) { if (pred()) return true; await sleep(200); }
  return false;
}

// Describer: say what it's about to draw, give them time to read it, put the board up, then draw on it while they watch. It stays up until lower().
async function show() {
  const k = sent++;
  scene.pose = "drawing";
  renderBoard(board, emptyGrid()); scene.boardChanged();
  const out = await drawings[k];
  if (!out) { scene.pose = "idle"; return null; }
  const grid = cleanGrid(out.rows);
  log(`draw "${describeFacts(pictures[k])}" — ${out.note} / "${out.before}"`);
  say(out.before);
  await sleep(readMs(out.before));
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

// Describer: one fact after another; the finished board stays up a while, then comes down in silence.
async function describe() {
  await sleep(1500);
  while (sent < pictures.length) {
    const out = await show();
    if (!out) continue;
    await sleep(HOLD_MS);
    lower();
    say(null);
    await sleep(1500);
  }
  over = true;
}

// Guesser: their board is up. Keep reading it as the drawing grows, thinking aloud and changing
// the imagined world as the reading changes; commit whatever was last understood when it comes down.
async function readBoard() {
  $("processed").removeAttribute("src"); // nothing stale from the last board
  document.body.classList.add("spotted");
  scene.pose = "looking";
  const falls = peer.falls, down = () => peer.falls !== falls; // the board has gone down since it came up
  say(firstWords.length ? firstWords.splice((Math.random() * firstWords.length) | 0, 1)[0] : "…");
  await sleep(500); // let their board settle in frame
  let reading = null, read = null; // `read`: the board as last sent, so a board that has not changed is not sent again
  while (!down()) {
    try {
      const grid = peer.capture();
      if (!grid) log("see: no frame in the crop");
      else if (grid.join() !== read) {
        renderBoard(seenBoard, grid);
        $("processed").src = seenBoard.toDataURL(); // exactly what the model is given
        log(`board: ${grid.join("/")}`);
        const out = await interpret({ grid, categories: CATEGORIES, believed: guesses, previous: reading });
        read = grid.join();
        const key = (o) => o.readings.map((r) => `${r.category}=${r.value}`).sort().join();
        const changed = !reading || key(reading) !== key(out);
        log(`see: ${out.seen} → ${key(out) || "nothing"}${changed ? "" : " (unchanged)"} / "${out.remark}"`);
        reading = pending = out;
        if (changed) showGuesses();
        say(out.remark);
      }
    } catch (e) { log(`error: ${e.message}`); }
    await waitFor(down, PAUSE_MS);
  }
  document.body.classList.remove("spotted");
  scene.pose = "idle";
  pending = null;
  if (reading) {
    for (const r of reading.readings) guesses[r.category] = r;
    log(`lock: ${reading.readings.map((r) => `${r.category} = ${r.value}`).join(", ") || "nothing"}`);
  }
  showGuesses();
}

// Guesser: every time their board comes up, read it until it goes down, for as many boards as come up.
// There is no clock: the describer stops after its boards, and people at the controls can keep going.
async function guess() {
  say(pick(IDLE));
  let seen = 0;
  while (true) {
    await waitFor(() => peer.rises > seen, Infinity);
    seen = peer.rises;
    await readBoard();
  }
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

// The start window's size. Every load shrinks back to it, so a reload (Cmd+R) mid-game lands on the menu as R does.
async function shrinkWindow() {
  const t = window.__TAURI__;
  if (!t) return;
  try {
    const win = t.window.getCurrentWindow();
    await win.setSize(new t.dpi.LogicalSize(520, 460));
    await win.center();
  } catch (e) { log(`error: resize failed: ${e.message || e}`); }
}

// Back to the menu: begin afresh (the reload shrinks the window). Reset reloads straight back into the same role.
function menu() { q.delete("role"); location.href = location.pathname + (q.size ? `?${q}` : ""); }
function reset() { q.set("role", role); location.search = `?${q}`; }

// Wipe (or Enter): the board goes down (so the guesser settles on what it saw), is wiped, and comes back up clean.
let wiping = false;
async function wipe() {
  if (wiping) return;
  wiping = true;
  log(`wipe: ${editorGrid.join("/")}`);
  document.body.classList.add("down"); // runs the whole dip: down, a pause out of sight, back up
  await sleep(250);
  editorGrid.splice(0, editorGrid.length, ...emptyGrid());
  renderEditorBoard(editorCanvas, editorGrid);
  await sleep(250);
  document.body.classList.remove("down");
  wiping = false;
}

// Contact from Earth: Earth behind, the board held up in front, and people draw on it themselves.
async function earth() {
  role = "earth";
  t0 = performance.now();
  over = true; // nothing to finish: R goes back whenever
  await growWindow();
  $("start").classList.add("hide");
  document.activeElement?.blur(); // keys belong to the game now, not the menu button
  document.body.classList.add("earth");
  new WorldView($("stage"), { palette: EARTH_COLOURS }).showWorld(EARTH);
}

async function start(r) {
  role = r;
  t0 = performance.now();
  await growWindow();
  $("start").classList.add("hide");
  document.activeElement?.blur(); // keys belong to the game now, not the menu button
  document.body.classList.add(describer() ? "describe" : "guess");
  document.body.style.setProperty("--bg1", `hsla(${world.hue * 360}, 80%, 80%, .25)`);
  document.body.style.setProperty("--bg2", `hsla(${(world.hue * 360 + 60) % 360}, 80%, 80%, .25)`);
  scene = new Scene($("stage"), describer() ? board : null, world.hue);
  scene.showWorld(world.values);
  if (describer()) { prefetch(); describe(); return; }
  imagined = new WorldView($("imagined"), { camera: [0, 3.5, 12], lookAt: [0, 2.2, -4], fov: 42 });
  peer = new WebcamPeer($("video"), $("preview"), $("overlay"), +q.get("th") || 0.008);
  openers({ n: pictures.length + 1 }).then((l) => { firstWords = l; }).catch((e) => log(`error: ${e.message}`));
  await peer.start();
  over = true; // nothing ends on its own: R goes back whenever
  guess();
}

const origErr = console.error.bind(console);
console.error = (...a) => { origErr(...a); log("console.error: " + a.map(String).join(" ")); };
addEventListener("error", (e) => log(`error: ${e.message} (${e.filename}:${e.lineno})`));
addEventListener("unhandledrejection", (e) => log(`error: ${e.reason?.message || e.reason} ${e.reason?.stack || ""}`));

// Safari on iPhone ignores the viewport's user-scalable=no and zooms on a pinch anyway; it does honour this.
addEventListener("gesturestart", (e) => e.preventDefault());

addEventListener("keydown", (e) => {
  if (e.code === "KeyQ") { e.preventDefault(); window.__TAURI__?.core.invoke("quit"); return; }
  if (!t0) return; // still on the menu
  if (e.code === "KeyR" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (over) menu(); } // leave Cmd/Ctrl+R to reload
  if (e.key === "Enter" && role === "earth") { e.preventDefault(); wipe(); }
});

(async () => {
  const again = q.get("role"); // set by Reset
  if (phoneApp) earth(); else if (!again) shrinkWindow();
  // TEMP: report the phone's screen sizes to the `npm run phone` terminal, to chase the white bar.
  setTimeout(() => {
    const p = document.createElement("div");
    p.style.cssText = "position:fixed;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)";
    document.body.append(p);
    const cs = getComputedStyle(p), st = $("stage").getBoundingClientRect();
    fetch(`debug-v2?standalone=${phoneApp}&inner=${innerWidth}x${innerHeight}&screen=${screen.width}x${screen.height}&html=${document.documentElement.clientHeight}&stage=${st.top}..${st.bottom}&safe=${cs.paddingTop},${cs.paddingBottom}`);
    p.remove();
  }, 1500);
  const key = await loadKey();
  log(`booted ${location.href} key:${key ? "yes" : "no"}`);
  if (key) document.body.classList.add("key"); // without one only Contact from Earth works
  if (again === "earth") earth();
  else if (again === "a" || again === "b") { if (key) start(again); else shrinkWindow(); }
  $("startA").onclick = () => start("a");
  $("startB").onclick = () => start("b");
  $("startE").onclick = () => earth();
  $("menu").onclick = () => menu();
  $("reset").onclick = () => reset();
  $("pen-black").onclick = () => selectPen("#");
  $("pen-white").onclick = () => selectPen(".");
  $("brush-tool").onclick = () => selectEditorTool("pen");
  $("fill-tool").onclick = () => selectEditorTool("fill");
  $("wipe").onclick = () => wipe();
  if (touchOnly) $("wipe").textContent = "Clear";
  document.body.classList.add("ready");
})();
