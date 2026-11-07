import { Field, normaliseDesign, designForModel, finishedScene, drawScene, setSpeed } from "./field.js";
import { splitWords, newTracker, trackFields } from "./message.js";
import { WebcamPeer } from "./peer.js";
import { designField, checkField, readFrames, guessSentence, loadKey } from "./api.js";

// Laptop 1 ("a") is given a sentence and has its saucers cut one crop-circle field per
// word, with at most 3 strokes (lines or arcs), 2 circles and 2 cows each (see RULES in
// field.js and api.js). Laptop 2 ("b") watches through
// its webcam, keeps a photo of each finished field, and guesses the words. Space (or the
// last word) ends the run: laptop 1 shows 🏁 and reveals the sentence and every field.
const q = new URLSearchParams(location.search);
const SPEED = +q.get("speed") || 1; // for testing: everything on laptop 1 runs this much faster
setSpeed(SPEED);
const FRESH_MS = 1000;  // empty field before the saucers arrive
const HOLD_MS = 4500;   // finished field held still for laptop 2 to read (about 4 webcam frames)
const END_MS = 3500;    // the finish flag
const FRAME_MS = 1000;  // laptop 2 takes a webcam frame every second
const BATCH = 6;        // frames per read call
const REVISED_MS = 4500; // how long a word changed by a later field stays highlighted
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
  working("the aliens are planning their first field…");

  // Design the words one at a time, in order, each seeing the fields before it (so a
  // repeated word gets the same picture). The saucers start on word 1 as soon as it's
  // ready, while the later words are designed in the background.
  const designs = [];
  const ready = words.map(() => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; });
  (async () => {
    for (let i = 0; i < words.length; i++) {
      let d = null;
      if (!stopped) {
        try { d = await designWord(sentence, words, i, designs.slice(0, i)); }
        catch { log(`error: gave up on designing "${words[i]}"`); }
      }
      designs[i] = d;
      ready[i].resolve(d);
      if (!d) { for (let j = i + 1; j < words.length; j++) ready[j].resolve(null); break; }
    }
  })();

  for (let i = 0; i < words.length && !stopped; i++) {
    // Usually ready long before it's needed. If not, a saucer cruises over the field meanwhile.
    if (await untilStop(field.cruiseUntil(ready[i].promise))) log(`waited for "${words[i]}" to be designed`);
    if (stopped) break;
    const d = await ready[i].promise;
    if (!d) {
      status(i ? "" : "couldn't design the fields. Restart the app to try again.");
      if (i) problem(`couldn't design "${words[i]}", so the message stops here`);
      if (!i) return;
      break;
    }
    if (!i) status("");
    await wait(FRESH_MS);
    if (stopped) break;
    log(`cutting "${d.word}"`);
    await untilStop(field.perform(d));
    if (stopped) break;
    await wait(HOLD_MS);
    if (stopped || i === words.length - 1) break;
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
  showReveal(sentence, words.map((word, i) => designs[i] ?? { word, idea: "", ...normaliseDesign({}) }));
  log("revealed");
}

const asDesign = (word, f) => ({ word, idea: f?.idea ?? "", ...normaliseDesign(f) });

// One word: design it, then let the alien look at how it came out and redraw it if it's
// messy. If the check fails, the first (already tidied) design is used as it is.
async function designWord(sentence, words, i, before) {
  const word = words[i];
  const earlier = before.map((d) => ({ word: d.word, idea: d.idea, ...designForModel(d) }));
  let d = asDesign(word, await retry(`designing "${word}"`, () => designField({ sentence, words, index: i, earlier })));
  log(`field ${i + 1} "${word}": ${d.idea} — ${describe(d)}`);
  try {
    const out = await retry(`checking "${word}"`, () => checkField({ sentence, words, index: i, earlier, design: designForModel(d), image: renderField(d) }), 2);
    const checked = asDesign(word, out);
    const changed = JSON.stringify(designForModel(checked)) !== JSON.stringify(designForModel(d));
    if (changed && !(isEmpty(checked) && !isEmpty(d))) { // never trade a picture for nothing
      d = checked;
      log(`redrew field ${i + 1} "${word}": ${d.idea} — ${describe(d)}`);
    }
  } catch { log(`carrying on with the first drawing of "${word}"`); }
  problem();
  return d;
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
    w.className = "word";
    w.textContent = f.word || "…";
    if (!f.word) w.classList.add("unknown");
    // A word just changed by a later field: highlight it, with the old guess crossed out above.
    const age = Date.now() - (f.revisedAt || 0);
    if (f.was && age < REVISED_MS) {
      w.classList.add("revised");
      w.style.animationDelay = `${-age}ms`;
      const was = document.createElement("span");
      was.className = "was";
      was.textContent = f.was;
      was.style.animationDelay = `${-age}ms`;
      w.append(was);
    }
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

let finalDone = false;

async function guess() {
  if (guessing) return;
  guessing = true;
  // Guess again whenever a new field arrives, and once more when the message is over.
  while (fields.length > guessedFor || (ended && !finalDone && fields.length)) {
    const n = fields.length;
    const final = ended;
    if (final) working("rereading the whole message…");
    else if (!guessedFor) working("reading their fields…");
    try {
      const previous = fields.slice(0, n).map((f) => (f.word ? { reading: f.reading, options: f.options, word: f.word } : null));
      const out = await guessSentence({ fields: fields.slice(0, n).map((f) => f.image), previous, final });
      const got = Array.isArray(out.fields) ? out.fields : [];
      for (let i = 0; i < n; i++) {
        const g = got[i] ?? {};
        const word = String(g.word ?? "").trim() || "?";
        const f = fields[i];
        if (f.word && f.word.toLowerCase() !== word.toLowerCase()) {
          f.was = f.word;
          f.revisedAt = Date.now();
          log(`revised field ${i + 1}: "${f.word}" → "${word}"`);
        }
        f.word = word;
        f.reading = String(g.reading ?? "");
        f.options = Array.isArray(g.options) ? g.options.map(String).slice(0, 3) : [];
      }
      thought = out.thought || "";
      status("");
      problem();
      log(`${final ? "final guess" : "guess"}: ${fields.slice(0, n).map((f) => f.word).join(" ")} / "${thought}"`);
    } catch (e) {
      log(`error: guess: ${e.message}`);
      problem(`guessing failed: ${e.message}`);
      status("");
      await sleep(2000);
    }
    guessedFor = n;
    if (final) finalDone = true;
    showGuess();
    setTimeout(showGuess, REVISED_MS + 100); // settle any highlighted changes
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
  guess(); // one last careful read of the whole message
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
