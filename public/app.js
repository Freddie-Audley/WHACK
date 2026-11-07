import { Field, normaliseDesign, designForModel, finishedScene, drawScene, setSpeed } from "./field.js";
import { splitWords, newTracker, trackFields } from "./message.js";
import { WebcamPeer } from "./peer.js";
import { designFields, reviewFields, readFrames, guessSentence, loadKey } from "./api.js";

// Laptop 1 ("a") is given a sentence and has its saucers cut one crop-circle field per
// word, with at most 3 strokes (lines or arcs), 2 circles and 2 cows each (see RULES in
// field.js and api.js). Laptop 2 ("b") watches through
// its webcam, keeps a photo of each finished field, and guesses the words. Space (or the
// last word) ends the run: laptop 1 shows 🏁 and reveals the sentence and every field.
const q = new URLSearchParams(location.search);
const SPEED = +q.get("speed") || 1; // for testing: everything on laptop 1 runs this much faster
setSpeed(SPEED);
const FRESH_MS = 1800;  // empty field before the saucers arrive
const HOLD_MS = 6500;   // finished field held still for laptop 2 to read
const END_MS = 4000;    // the finish flag
const FRAME_MS = 1000;  // laptop 2 takes a webcam frame every second
const BATCH = 6;        // frames per read call
const END = "🏁";

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

// Space ends the run early.
let stopped = false, onStop;
const stopSignal = new Promise((r) => { onStop = r; });
const untilStop = (p) => Promise.race([p, stopSignal]);
const wait = (ms) => untilStop(sleep(ms / SPEED));
function stop() {
  if (stopped) return;
  stopped = true;
  log("stop pressed");
  onStop();
}

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

function tile(media, word, i, animate = true) {
  const t = document.createElement("div");
  t.className = "tile";
  t.style.setProperty("--i", i);
  if (!animate) t.style.animation = "none";
  const label = document.createElement("div");
  label.textContent = word;
  t.append(media, label);
  return t;
}

// Bigger tiles for shorter messages.
const tileWidth = (n) => `${n <= 4 ? 300 : n <= 8 ? 250 : n <= 15 ? 190 : 140}px`;

// ---- Laptop 1 -------------------------------------------------------------

async function send() {
  const sentence = $("sentence").value.trim() || $("sentence").placeholder;
  const words = splitWords(sentence);
  const field = new Field($("field"));
  working("the aliens are planning their message…");

  const toDesigns = (out, fallback = []) => words.map((word, i) => {
    const f = out?.fields?.[i];
    return f ? { word, idea: f.idea ?? "", ...normaliseDesign(f) } : fallback[i] ?? { word, idea: "", ...normaliseDesign({}) };
  });

  let designs;
  try {
    designs = toDesigns(await retry("designing the fields", () => designFields({ sentence, words })));
  } catch { status("couldn't design the fields. Restart the app to try again."); return; }
  designs.forEach((d, i) => log(`field ${i + 1} "${d.word}": ${d.idea} — ${describe(d)}`));

  // Let the alien see how its fields actually came out, and redraw any messy ones.
  // If this fails, the first designs (already tidied) are used as they are.
  if (!stopped) {
    working("the aliens are checking their drawings…");
    try {
      const images = designs.map(renderField);
      const out = await retry("checking the drawings", () => reviewFields({ sentence, words, designs: designs.map(designForModel), images }), 2);
      const checked = toDesigns(out, designs);
      checked.forEach((d, i) => {
        const changed = JSON.stringify(designForModel(d)) !== JSON.stringify(designForModel(designs[i]));
        if (changed && isEmpty(d) && !isEmpty(designs[i])) { checked[i] = designs[i]; return; } // never trade a picture for nothing
        if (changed) log(`redrew field ${i + 1} "${d.word}": ${d.idea} — ${describe(d)}`);
      });
      designs = checked;
    } catch { log("carrying on with the first drawings"); }
  }
  status("");

  for (let i = 0; i < designs.length && !stopped; i++) {
    await wait(FRESH_MS);
    if (stopped) break;
    log(`cutting "${designs[i].word}"`);
    await untilStop(field.perform(designs[i]));
    if (stopped) break;
    await wait(HOLD_MS);
    if (stopped || i === designs.length - 1) break;
    await untilStop(field.regrow());
  }

  // Message over: clear the field and plant the finish flag, which tells laptop 2 to stop
  // watching before the answer goes up on this screen.
  field.abort();
  await field.regrow();
  log("planting the flag");
  await field.plantFlag();
  await sleep(END_MS / SPEED);
  field.halt();
  document.body.classList.remove("send");
  showReveal(sentence, designs);
  log("revealed");
}

const describe = (d) => `${d.lines.length} lines, ${d.arcs.length} arcs, ${d.circles.length} circles, ${d.cows.length} cows`;
const isEmpty = (d) => !d.lines.length && !d.arcs.length && !d.circles.length && !d.cows.length;

// A finished field as a JPEG, for the alien to check its own drawing.
function renderField(d) {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 400;
  drawScene(c.getContext("2d"), 640, 400, finishedScene(d));
  return c.toDataURL("image/jpeg", 0.85);
}

function showReveal(sentence, designs) {
  $("revealSentence").textContent = sentence;
  $("revealTiles").style.setProperty("--tw", tileWidth(designs.length));
  $("revealTiles").replaceChildren(...designs.map((d, i) => {
    const c = document.createElement("canvas");
    c.width = 480; c.height = 300;
    drawScene(c.getContext("2d"), 480, 300, finishedScene(d));
    return tile(c, d.word, i);
  }));
  document.body.classList.add("revealed");
}

// ---- Laptop 2 -------------------------------------------------------------

let peer, frameTimer;
const frames = [];   // webcam frames not yet read
const fields = [];   // finished fields seen: { image, word }
const tracker = newTracker();
let ended = false, guessing = false, guessedFor = 0, thought = "";

function showGuess() {
  const sentence = $("guessSentence");
  sentence.replaceChildren();
  fields.forEach((f, i) => {
    if (i) sentence.append(" ");
    const w = document.createElement("span");
    w.textContent = f.word || "…";
    if (!f.word) w.className = "unknown";
    sentence.append(w);
  });
  if (ended) sentence.append(` ${END}`);
  $("guessThought").textContent = thought;
  $("guessTiles").style.setProperty("--tw", tileWidth(fields.length));
  // Only the newest field pops in; the rest are redrawn in place.
  const shown = $("guessTiles").children.length;
  $("guessTiles").replaceChildren(...fields.map((f, i) => {
    const img = new Image();
    img.src = f.image;
    return tile(img, f.word || "…", 0, i >= shown);
  }));
}

async function readLoop() {
  while (!ended && !stopped) {
    if (frames.length < BATCH) await untilStop(sleep(BATCH * FRAME_MS));
    if (stopped) break;
    if (!frames.length) continue;
    const batch = frames.splice(0, BATCH * 2);
    try {
      const kinds = (await readFrames({ frames: batch })) ?? [];
      problem();
      const out = trackFields(tracker, kinds, batch);
      log(`frames: ${kinds.join(" ")}`);
      if (out.found.length) {
        fields.push(...out.found);
        log(`field ${fields.length} finished`);
        showGuess();
        guess();
      }
      if (out.ended) { log("saw the finish flag"); break; }
    } catch (e) {
      log(`error: read: ${e.message}`);
      problem(`reading the webcam failed: ${e.message}`);
    }
  }
  finish();
}

async function guess() {
  if (guessing) return;
  guessing = true;
  while (fields.length > guessedFor) {
    const n = fields.length;
    if (!guessedFor) working("reading their fields…");
    try {
      const out = await guessSentence({ fields: fields.slice(0, n).map((f) => f.image) });
      const words = Array.isArray(out.words) ? out.words : [];
      for (let i = 0; i < n; i++) fields[i].word = String(words[i] ?? "").trim() || "?";
      thought = out.thought || "";
      status("");
      problem();
      log(`guess: ${fields.slice(0, n).map((f) => f.word).join(" ")} / "${thought}"`);
    } catch (e) {
      log(`error: guess: ${e.message}`);
      problem(`guessing failed: ${e.message}`);
      await sleep(2000);
    }
    guessedFor = n;
    showGuess();
  }
  guessing = false;
}

function finish() {
  if (ended) return;
  ended = true;
  clearInterval(frameTimer);
  peer?.video.srcObject?.getTracks().forEach((t) => t.stop());
  if (!fields.length) status("no fields seen");
  else if (!guessing) status("");
  showGuess();
  guess(); // one last guess with every field, if any arrived since the last one
}

async function read() {
  working("watching…");
  peer = new WebcamPeer($("video"));
  try { await peer.start(); }
  catch (e) { log(`error: webcam: ${e.message}`); status("no webcam"); problem(e.message); return; }
  frameTimer = setInterval(() => { const f = peer.capture(800); if (f) frames.push(f); }, FRAME_MS);
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

let started = false;
async function start(r) {
  if (started) return;
  started = true;
  role = r;
  await growWindow();
  $("start").classList.add("hide");
  $("sentence").blur();
  document.body.classList.add("running", role === "a" ? "send" : "read");
  addEventListener("keydown", (e) => { if (e.code === "Space" || e.code === "Escape") { e.preventDefault(); stop(); } });
  if (role === "a") send();
  else read();
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
  $("sentence").addEventListener("keydown", (e) => { if (e.key === "Enter") start("a"); });
  $("sentence").focus();
  if (q.get("role")) start(q.get("role"));
})();
