// A moonlit wheat field seen from above, and the saucers that cut messages into it.
// Field units: 160 wide, 100 tall, (0,0) at the top left. Cuts glow pale against the
// dark wheat so a webcam can read them from across a table.
export const FW = 160, FH = 100;
const CUT = 3.4;  // width of a cut path, in field units
const ALT = 14;   // how high the saucers hover above their beam spot
const K = 1.6;    // saucer size

// The rules: every cut is the same thick path (CUT wide), so fine detail is impossible
// however many pieces there are. The caps are only there to keep each field's animation
// short. api.js describes these same numbers to both aliens.
export const RULES = { strokes: 12, circles: 6, cows: 6 };

let SPEED = 1;
export const setSpeed = (s) => { SPEED = s > 0 ? s : 1; };

const lerp = (a, b, p) => a + (b - a) * p;
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : (lo + hi) / 2));

function tween(ms, fn, easing = (p) => p) {
  const dur = Math.max(1, ms / SPEED);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      fn(easing(p));
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

const list = (a) => (Array.isArray(a) ? a : []);
const deg = (v) => ((Number.isFinite(+v) ? +v : 0) % 360 + 360) % 360;

// A usable number, or NaN for anything missing or junk (null, "", "abc").
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? +v : NaN);
const ok = (...vs) => vs.every(Number.isFinite);
const MARGIN = 4;  // keep the picture this far inside the field edge
const SNAP = 3.5;  // ends closer than this are meant to touch

// Points along an arc, for working out how far it really reaches.
const arcPoints = (a) => Array.from({ length: 13 }, (_, i) => {
  const t = rad(a.from + (a.sweep * i) / 12);
  return [a.x + a.r * Math.cos(t), a.y + a.r * Math.sin(t)];
});

function extent(d) {
  const xs = [], ys = [];
  for (const l of d.lines) { xs.push(l.x1, l.x2); ys.push(l.y1, l.y2); }
  for (const c of d.circles) { xs.push(c.x - c.r, c.x + c.r); ys.push(c.y - c.r, c.y + c.r); }
  for (const a of d.arcs) for (const [x, y] of arcPoints(a)) { xs.push(x); ys.push(y); }
  for (const c of d.cows) { xs.push(c.x - 11, c.x + 11); ys.push(c.y - 9, c.y + 7); }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// A picture that spills off the field is shrunk (if it's too big) and slid back inside,
// all of it together, rather than having its edges squashed. Pictures that fit are left alone.
function fitInside(d) {
  const b = extent(d);
  if (!b) return;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const k = Math.min(1, (FW - 2 * MARGIN) / Math.max(w, 1e-6), (FH - 2 * MARGIN) / Math.max(h, 1e-6));
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const slide = (lo, size, max) => (lo < MARGIN ? MARGIN - lo : lo + size > max - MARGIN ? max - MARGIN - (lo + size) : 0);
  const dx = slide(cx - (w * k) / 2, w * k, FW), dy = slide(cy - (h * k) / 2, h * k, FH);
  if (k === 1 && !dx && !dy) return;
  const X = (x) => cx + (x - cx) * k + dx, Y = (y) => cy + (y - cy) * k + dy;
  for (const l of d.lines) Object.assign(l, { x1: X(l.x1), y1: Y(l.y1), x2: X(l.x2), y2: Y(l.y2) });
  for (const c of [...d.circles, ...d.arcs]) Object.assign(c, { x: X(c.x), y: Y(c.y), r: c.r * k });
  for (const c of d.cows) Object.assign(c, { x: X(c.x), y: Y(c.y) });
}

// Ends that nearly touch are meant to touch: line ends near a ring or arc go onto it,
// line ends near an arc's end go onto that end, and line ends near each other meet at
// their average, so corners close exactly.
function snapEnds(d) {
  const ends = d.lines.flatMap((l) => [[l, "x1", "y1"], [l, "x2", "y2"]]);
  const get = ([l, kx, ky]) => [l[kx], l[ky]];
  const set = ([l, kx, ky], [x, y]) => { l[kx] = x; l[ky] = y; };
  const rings = [...d.circles.filter((c) => !c.filled), ...d.arcs];
  for (const e of ends) {
    const [x, y] = get(e);
    for (const a of d.arcs) {
      for (const p of [arcPoints(a)[0], arcPoints(a)[12]]) if (Math.hypot(p[0] - x, p[1] - y) < SNAP) { set(e, p); break; }
    }
    const [x2, y2] = get(e);
    for (const c of rings) {
      const dist = Math.hypot(x2 - c.x, y2 - c.y);
      if (dist < 1e-6 || Math.abs(dist - c.r) >= SNAP) continue;
      if (c.sweep) { // only onto the part of the ring an arc actually covers
        const bearing = (Math.atan2(y2 - c.y, x2 - c.x) * 180) / Math.PI + 90;
        if ((deg(bearing) - c.from + 360) % 360 > c.sweep) continue;
      }
      set(e, [c.x + ((x2 - c.x) * c.r) / dist, c.y + ((y2 - c.y) * c.r) / dist]);
      break;
    }
  }
  const done = new Set();
  for (const e of ends) {
    if (done.has(e)) continue;
    const group = ends.filter((f) => !done.has(f) && Math.hypot(get(f)[0] - get(e)[0], get(f)[1] - get(e)[1]) < SNAP);
    const mx = group.reduce((t, f) => t + get(f)[0], 0) / group.length;
    const my = group.reduce((t, f) => t + get(f)[1], 0) / group.length;
    for (const f of group) { set(f, [mx, my]); done.add(f); }
  }
  // Drop lines that have shrunk to a dot.
  d.lines = d.lines.filter((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1) > 1);
}

// Whatever the model sent, cut down to the rules and tidied up: fitted inside the field,
// with ends that nearly meet joined. Lines are kept before arcs if there are too many strokes.
export function normaliseDesign(raw) {
  // Shapes with a missing or junk position are dropped rather than guessed at.
  const lines = list(raw?.lines)
    .map((l) => ({ x1: num(l?.x1), y1: num(l?.y1), x2: num(l?.x2), y2: num(l?.y2) }))
    .filter((l) => ok(l.x1, l.y1, l.x2, l.y2))
    .slice(0, RULES.strokes);
  const arcs = list(raw?.arcs)
    .filter((a) => ok(num(a?.x), num(a?.y), num(a?.r), num(a?.from), num(a?.to)))
    .slice(0, RULES.strokes - lines.length)
    .map((a) => {
      const from = deg(a.from);
      const sweep = Math.max(15, (deg(a.to) - from + 360) % 360 || 360);
      return { x: num(a.x), y: num(a.y), r: clamp(a.r, 6, 45), from, sweep };
    });
  const d = {
    lines,
    arcs,
    circles: list(raw?.circles)
      .filter((c) => ok(num(c?.x), num(c?.y), num(c?.r)))
      .slice(0, RULES.circles)
      .map((c) => ({ x: num(c.x), y: num(c.y), r: clamp(c.r, 4, 45), filled: !!c.filled })),
    cows: list(raw?.cows)
      .filter((c) => ok(num(c?.x), num(c?.y)))
      .slice(0, RULES.cows)
      .map((c) => ({ x: num(c.x), y: num(c.y), facing: c.facing === "right" ? "right" : "left" })),
  };
  fitInside(d);
  snapEnds(d);
  // Last safety net, in case anything is still out of bounds.
  for (const l of d.lines) Object.assign(l, { x1: clamp(l.x1, 0, FW), y1: clamp(l.y1, 0, FH), x2: clamp(l.x2, 0, FW), y2: clamp(l.y2, 0, FH) });
  for (const c of [...d.circles, ...d.arcs]) Object.assign(c, { x: clamp(c.x, 0, FW), y: clamp(c.y, 0, FH), r: Math.max(c.sweep ? 6 : 4, c.r) });
  for (const c of d.cows) Object.assign(c, { x: clamp(c.x, 11, FW - 11), y: clamp(c.y, 9, FH - 9) });
  return d;
}

// A design in the shape the model writes it (arcs as from/to), for showing it back.
export const designForModel = (d) => {
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    lines: d.lines.map((l) => ({ x1: r1(l.x1), y1: r1(l.y1), x2: r1(l.x2), y2: r1(l.y2) })),
    arcs: d.arcs.map((a) => ({ x: r1(a.x), y: r1(a.y), r: r1(a.r), from: r1(a.from), to: r1((a.from + a.sweep) % 360) })),
    circles: d.circles.map((c) => ({ x: r1(c.x), y: r1(c.y), r: r1(c.r), filled: c.filled })),
    cows: d.cows.map((c) => ({ x: r1(c.x), y: r1(c.y), facing: c.facing })),
  };
};

// The finished field, for thumbnails.
export const finishedScene = (d) => ({
  marks: [
    ...d.lines.map((l) => ({ type: "line", ...l, t: 1 })),
    ...d.arcs.map((a) => ({ type: "arc", ...a, t: 1 })),
    ...d.circles.map((c) => ({ type: "circle", ...c, t: 1 })),
  ],
  cows: d.cows.map((c) => ({ ...c, h: 0 })),
  ufos: [], sparks: [], fade: 1,
});

// Compass degrees (0 at the top, clockwise) to canvas radians.
const rad = (d) => ((d - 90) * Math.PI) / 180;

// ---- Drawing ----------------------------------------------------------------

function layout(W, H) {
  const s = Math.min(W / FW, H / FH) * 0.9;
  const ox = (W - FW * s) / 2, oy = (H - FH * s) / 2;
  return { s, X: (x) => ox + x * s, Y: (y) => oy + y * s, ox, oy };
}

function drawGround(ctx, W, H) {
  const { s, ox, oy } = layout(W, H);
  ctx.fillStyle = "#0c1d14";
  ctx.fillRect(0, 0, W, H);
  // Moonlight falls from the top left.
  const g = ctx.createRadialGradient(ox + FW * s * 0.25, oy + FH * s * 0.2, 0, ox + FW * s * 0.4, oy + FH * s * 0.4, FW * s * 0.9);
  g.addColorStop(0, "#3d5a3b");
  g.addColorStop(1, "#1a3022");
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ox, oy, FW * s, FH * s, 2 * s);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // Rows of wheat.
  ctx.strokeStyle = "rgba(220,235,180,0.07)";
  ctx.lineWidth = Math.max(1, 0.35 * s);
  ctx.beginPath();
  for (let i = -20; i < FW + 20; i += 1.8) {
    ctx.moveTo(ox + i * s, oy);
    ctx.lineTo(ox + (i + 14) * s, oy + FH * s);
  }
  ctx.stroke();
  ctx.restore();
  // Hedgerow.
  ctx.strokeStyle = "#08130c";
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.roundRect(ox, oy, FW * s, FH * s, 2 * s);
  ctx.stroke();
}

function markPath(ctx, m, X, Y, s) {
  ctx.beginPath();
  if (m.type === "line") {
    ctx.moveTo(X(m.x1), Y(m.y1));
    ctx.lineTo(X(lerp(m.x1, m.x2, m.t)), Y(lerp(m.y1, m.y2, m.t)));
  } else if (m.type === "arc") {
    ctx.arc(X(m.x), Y(m.y), m.r * s, rad(m.from), rad(m.from + m.sweep * Math.max(0.001, m.t)));
  } else if (m.filled) {
    ctx.arc(X(m.x), Y(m.y), Math.max(0.01, m.r * m.t * s), 0, Math.PI * 2);
  } else {
    ctx.arc(X(m.x), Y(m.y), m.r * s, 0, Math.PI * 2 * Math.max(0.001, m.t));
  }
}

function drawMarks(ctx, scene, X, Y, s) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255,236,170,0.75)";
  ctx.shadowBlur = 1.4 * s;
  ctx.fillStyle = ctx.strokeStyle = "#f6ebc4";
  ctx.lineWidth = CUT * s;
  for (const m of scene.marks) {
    markPath(ctx, m, X, Y, s);
    if (m.type === "circle" && m.filled) ctx.fill(); else ctx.stroke();
  }
  // Swirl of flattened stalks inside discs.
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(170,145,85,0.45)";
  ctx.lineWidth = Math.max(1, 0.3 * s);
  for (const m of scene.marks) {
    if (m.type !== "circle" || !m.filled) continue;
    const r = m.r * m.t;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(X(m.x), Y(m.y), r * k / 4 * s, k, k + Math.PI * 1.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// A solid black-and-white cow seen from the side, facing left, about 18 × 12 in its own
// units with (0,0) at the middle of its body. Drawn with shapes, not an emoji, so it
// looks the same on every computer.
const INK = "#141414", HIDE = "#fbfaf4", PINK = "#f2a3b5", HORN = "#efe2bf";
function cowShape(ctx) {
  ctx.lineWidth = 0.5;
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  const blob = (x, y, rx, ry, fill, rot = 0) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  // Tail.
  ctx.beginPath();
  ctx.moveTo(5.6, -2.2);
  ctx.quadraticCurveTo(7.6, -1, 7.1, 2.2);
  ctx.stroke();
  blob(7.1, 2.6, 0.55, 0.8, INK);
  // Legs, far ones a touch darker.
  for (const [x, far] of [[-3.4, true], [3.4, true], [-4.6, false], [2.2, false]]) {
    ctx.fillStyle = far ? "#dcdcd4" : HIDE;
    ctx.beginPath();
    ctx.roundRect(x - 0.7, 1.2, 1.4, 4.4, 0.4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(x - 0.7, 4.8, 1.4, 0.8);
  }
  // Udder.
  blob(1.1, 3.1, 1.2, 0.8, PINK);
  // Body with patches.
  ctx.beginPath();
  ctx.roundRect(-6, -3.2, 12, 6, 2.6);
  ctx.fillStyle = HIDE;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = INK;
  for (const [x, y, rx, ry, r] of [[1.6, -1.6, 2.4, 1.7, 0.3], [-2.8, 1.4, 1.8, 1.3, -0.2], [5.3, 0.4, 1.4, 1.9, 0]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.stroke();
  // Horns, ear, head, muzzle, eye.
  blob(-6.4, -5.6, 0.45, 1.1, HORN, 0.5);
  blob(-8.3, -5.5, 0.45, 1.1, HORN, -0.4);
  blob(-5.1, -3.9, 1.4, 0.65, HIDE, -0.35);
  blob(-7.5, -2.6, 2.5, 2.5, HIDE);
  blob(-7, -3.6, 1.1, 0.9, INK, 0.3);
  blob(-8.9, -1.2, 1.7, 1.3, PINK);
  ctx.fillStyle = INK;
  for (const x of [-9.6, -8.3]) { ctx.beginPath(); ctx.arc(x, -1.3, 0.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(-6.9, -3.75, 0.28, 0, Math.PI * 2); ctx.fill();
}

const COW_SCALE = 1.1; // cow units to field units: about 20 wide

function drawCow(ctx, cow, X, Y, s) {
  const lift = cow.h * ALT * 0.85;
  const k = COW_SCALE * s * (0.6 + 0.4 * (1 - cow.h));
  ctx.save();
  // Shadow on the wheat, under its hooves.
  ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - cow.h * 0.7)})`;
  ctx.beginPath();
  ctx.ellipse(X(cow.x), Y(cow.y) + 5.4 * COW_SCALE * s, 9.4 * COW_SCALE * s, 2 * COW_SCALE * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(X(cow.x), Y(cow.y - lift));
  if (cow.h > 0) ctx.rotate(Math.sin(performance.now() / 260) * 0.12 * cow.h);
  ctx.scale(cow.facing === "right" ? -k : k, k);
  cowShape(ctx);
  ctx.restore();
}

function drawBeam(ctx, u, X, Y, s) {
  const gx = X(u.x), gy = Y(u.y), top = gy - ALT * s;
  const spot = Math.max(3.2, u.beamR || 0) * s;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(0, top, 0, gy);
  g.addColorStop(0, "rgba(160,255,210,0.55)");
  g.addColorStop(1, "rgba(160,255,210,0.14)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(gx - 2.6 * K * s, top);
  ctx.lineTo(gx + 2.6 * K * s, top);
  ctx.lineTo(gx + spot, gy);
  ctx.lineTo(gx - spot, gy);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, spot * 1.6);
  glow.addColorStop(0, "rgba(210,255,225,0.8)");
  glow.addColorStop(1, "rgba(210,255,225,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(gx, gy, spot * 1.6, spot * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSaucer(ctx, u, X, Y, sField, now) {
  const x = X(u.x), y = Y(u.y) - ALT * sField + Math.sin(now / 320 + u.phase) * 0.8 * sField;
  ctx.save();
  const s = sField * K;
  // Underside glow.
  ctx.globalCompositeOperation = "lighter";
  const ug = ctx.createRadialGradient(x, y + 1 * s, 0, x, y + 1 * s, 8 * s);
  ug.addColorStop(0, u.beam ? "rgba(160,255,210,0.45)" : "rgba(160,200,255,0.18)");
  ug.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ug;
  ctx.beginPath();
  ctx.ellipse(x, y + 1 * s, 8 * s, 3.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  // Dome.
  const dg = ctx.createLinearGradient(x, y - 4.2 * s, x, y);
  dg.addColorStop(0, "rgba(200,240,255,0.95)");
  dg.addColorStop(1, "rgba(90,170,220,0.9)");
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.ellipse(x, y - 1.2 * s, 3.2 * s, 2.8 * s, 0, Math.PI, 0);
  ctx.fill();
  // Hull.
  const hg = ctx.createLinearGradient(x, y - 2 * s, x, y + 2.2 * s);
  hg.addColorStop(0, "#f4f7fa");
  hg.addColorStop(0.5, "#b7c2cc");
  hg.addColorStop(1, "#6d7a86");
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(x, y, 7.5 * s, 2.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(40,50,60,0.6)";
  ctx.lineWidth = Math.max(1, 0.25 * s);
  ctx.stroke();
  // Rim lights chase round the hull.
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.12 + 0.76 * (i / 6));
    const lx = x - Math.cos(a) * 6 * s, ly = y + Math.sin(a) * 1.1 * s;
    const on = (Math.floor(now / 140) + i) % 7 < 3;
    ctx.fillStyle = on ? `hsl(${(i * 50 + now / 8) % 360} 95% 65%)` : "rgba(60,70,80,0.8)";
    if (on) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 1.2 * s; }
    ctx.beginPath();
    ctx.arc(lx, ly, 0.55 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawSparks(ctx, scene, X, Y, s, dt) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  scene.sparks = scene.sparks.filter((p) => (p.life -= dt) > 0);
  for (const p of scene.sparks) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.fillStyle = `rgba(255,240,180,${Math.min(1, p.life * 1.5)})`;
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), 0.35 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// The "message over" signal for laptop 2: a big waving chequered flag planted in the
// field, drawn with shapes so it stays sharp at any size. (x, y) is the foot of the pole.
const FLAG = { pole: 50, w: 46, h: 29, cols: 8, rows: 5 };
function drawFlag(ctx, f, X, Y, s, now) {
  const lift = f.h * ALT * 0.85;
  const k = 0.6 + 0.4 * (1 - f.h);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - f.h * 0.7)})`;
  ctx.beginPath();
  ctx.ellipse(X(f.x), Y(f.y), 5 * s, 1.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(X(f.x), Y(f.y - lift));
  ctx.scale(k * s, k * s);
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5;
  // Cloth: columns ripple more the further they are from the pole.
  const top = -FLAG.pole, cw = FLAG.w / FLAG.cols, ch = FLAG.h / FLAG.rows;
  const dy = (i) => Math.sin(now / 260 - i * 0.8) * (0.3 + i * 0.32);
  const pt = (i, j) => [1 + i * cw, top + j * ch + dy(i)];
  for (let i = 0; i < FLAG.cols; i++) {
    for (let j = 0; j < FLAG.rows; j++) {
      ctx.beginPath();
      ctx.moveTo(...pt(i, j));
      ctx.lineTo(...pt(i + 1, j));
      ctx.lineTo(...pt(i + 1, j + 1));
      ctx.lineTo(...pt(i, j + 1));
      ctx.closePath();
      ctx.fillStyle = (i + j) % 2 ? INK : HIDE;
      ctx.fill();
    }
  }
  ctx.beginPath();
  for (let i = 0; i <= FLAG.cols; i++) ctx.lineTo(...pt(i, 0));
  for (let i = FLAG.cols; i >= 0; i--) ctx.lineTo(...pt(i, FLAG.rows));
  ctx.closePath();
  ctx.stroke();
  // Pole with a ball on top.
  ctx.fillStyle = "#d6dbe0";
  ctx.beginPath();
  ctx.roundRect(-1, top - 1, 2, FLAG.pole + 1, 1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f2d16b";
  ctx.beginPath();
  ctx.arc(0, top - 2, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// While the wheat grows back, the cuts and cows fade out together as one picture. Fading
// each shape on its own would let a cow's legs show through its body.
let layer = null;
function drawFaded(ctx, alpha, draw) {
  const c = ctx.canvas;
  if (!layer || layer.width !== c.width || layer.height !== c.height) {
    layer = document.createElement("canvas");
    layer.width = c.width; layer.height = c.height;
  }
  const l = layer.getContext("2d");
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, layer.width, layer.height);
  l.setTransform(ctx.getTransform());
  draw(l);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

export function drawScene(ctx, W, H, scene, now = 0, dt = 0, bg = null) {
  const { s, X, Y } = layout(W, H);
  if (bg) ctx.drawImage(bg, 0, 0, W, H); else drawGround(ctx, W, H);
  const picture = (c) => {
    drawMarks(c, scene, X, Y, s);
    // Cows nearer the bottom of the field stand in front.
    for (const cow of [...scene.cows].sort((a, b) => a.y - b.y)) if (cow.h === 0) drawCow(c, cow, X, Y, s);
  };
  if (scene.fade < 1) drawFaded(ctx, Math.max(0, scene.fade), picture); else picture(ctx);
  if (scene.flag && scene.flag.h === 0) drawFlag(ctx, scene.flag, X, Y, s, now);
  // Saucer shadows on the wheat, washed out wherever a beam is shining.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  for (const u of scene.ufos) {
    if (u.beam) continue;
    ctx.beginPath();
    ctx.ellipse(X(u.x), Y(u.y), 7 * K * s, 2.2 * K * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const u of scene.ufos) if (u.beam) drawBeam(ctx, u, X, Y, s);
  for (const c of scene.cows) if (c.h > 0) drawCow(ctx, c, X, Y, s);
  if (scene.flag && scene.flag.h > 0) drawFlag(ctx, scene.flag, X, Y, s, now);
  drawSparks(ctx, scene, X, Y, s, dt);
  for (const u of scene.ufos) drawSaucer(ctx, u, X, Y, s, now);
}

// ---- The live field ---------------------------------------------------------

export class Field {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scene = { marks: [], cows: [], ufos: [], sparks: [], fade: 1 };
    this.last = performance.now();
    this.resize();
    addEventListener("resize", () => this.resize());
    const loop = (now) => { if (this.halted) return; this.draw(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // Stop drawing once the field is off screen for good.
  halt() { this.halted = true; }

  resize() {
    const dpr = devicePixelRatio || 1;
    this.W = innerWidth; this.H = innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg = document.createElement("canvas");
    this.bg.width = this.canvas.width; this.bg.height = this.canvas.height;
    const b = this.bg.getContext("2d");
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGround(b, this.W, this.H);
  }

  draw(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000) * SPEED;
    this.last = now;
    // Kick up sparks wherever a beam is cutting.
    for (const u of this.scene.ufos) {
      if (!u.beam || this.scene.sparks.length > 400) continue;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 14;
        this.scene.sparks.push({ x: u.x, y: u.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.5 });
      }
    }
    drawScene(this.ctx, this.W, this.H, this.scene, now, dt, this.bg);
  }

  clear() {
    Object.assign(this.scene, { marks: [], cows: [], ufos: [], flag: null, fade: 1 });
  }

  // Send the saucers away mid-job (Space pressed). Whatever they had cut stays, ready
  // to fade with regrow(). Any perform() still running stops at its next step.
  abort() {
    this.gen = (this.gen || 0) + 1;
    this.scene.ufos = [];
  }

  // Fly in, cut the design, fly off. A fleet works at once: saucers from the left cut
  // the strokes (lines and arcs), saucers from the right the circles, and saucers from
  // the top lower the cows on their beams. Busier fields get more saucers, each taking
  // one strip of the field, so a field never takes much longer to cut.
  async perform(d) {
    const sc = this.scene;
    const gen = this.gen;
    const STOP = Symbol("stop");
    const wait = async (p) => { await p; if (this.gen !== gen) throw STOP; };
    const ufo = (x, y) => { const u = { x, y, beam: false, beamR: 0, phase: Math.random() * 6 }; sc.ufos.push(u); return u; };
    const fly = (u, x, y) => wait(flyTo(u, x, y));
    const tween_ = (ms, fn, easing) => wait(tween(ms, fn, easing));
    const exitY = (u) => (u.y < FH / 2 ? -14 : FH + 14);
    // Split work into `ships` groups of neighbours (left to right), one group per saucer.
    const share = (items, per, most, key) => {
      if (!items.length) return [];
      const sorted = [...items].sort((a, b) => key(a) - key(b));
      const n = Math.min(most, Math.ceil(sorted.length / per));
      return Array.from({ length: n }, (_, i) => sorted.slice(Math.floor((i * sorted.length) / n), Math.floor(((i + 1) * sorted.length) / n)));
    };
    const lane = (i, n) => (FH * (i + 1)) / (n + 1) + (Math.random() - 0.5) * 10;
    const strokes = [...d.lines.map((l) => ({ type: "line", ...l })), ...d.arcs.map((a) => ({ type: "arc", ...a }))];
    const nothing = !strokes.length && !d.circles.length && !d.cows.length;

    const strokeShip = async (items, y) => {
      const u = ufo(-28, y);
      for (const k of items) {
        if (k.type === "line") {
          await fly(u, k.x1, k.y1);
          const m = { ...k, t: 0 };
          sc.marks.push(m);
          u.beam = true;
          await tween_(300 + Math.hypot(k.x2 - k.x1, k.y2 - k.y1) * 8.5, (p) => { m.t = p; u.x = lerp(k.x1, k.x2, p); u.y = lerp(k.y1, k.y2, p); });
        } else {
          const at = (deg) => [k.x + k.r * Math.cos(rad(deg)), k.y + k.r * Math.sin(rad(deg))];
          await fly(u, ...at(k.from));
          const m = { ...k, t: 0 };
          sc.marks.push(m);
          u.beam = true;
          await tween_(320 + (k.r * k.sweep * Math.PI / 180) * 8.5, (p) => { m.t = p; [u.x, u.y] = at(k.from + k.sweep * p); });
        }
        u.beam = false;
      }
      if (nothing) await fly(u, FW / 2, u.y); // an empty field: a slow fly-past
      await fly(u, -28, exitY(u));
    };

    const cowShip = async (cows, x) => {
      const u = ufo(x, -30);
      for (const c of cows) {
        await fly(u, c.x, c.y);
        u.beam = true; u.beamR = 6;
        const cow = { ...c, h: 1 };
        sc.cows.push(cow);
        await tween_(950, (p) => { cow.h = 1 - p; }, ease);
        cow.h = 0;
        u.beam = false; u.beamR = 0;
      }
      await fly(u, u.x, -30);
    };

    const circleShip = async (circles, y) => {
      const u = ufo(FW + 28, y);
      for (const c of circles) {
        const m = { type: "circle", ...c, t: 0 };
        if (c.filled) {
          await fly(u, c.x, c.y);
          sc.marks.push(m);
          u.beam = true;
          await tween_(450 + c.r * 16, (p) => { m.t = p; u.beamR = c.r * p; }, ease);
        } else {
          await fly(u, c.x + c.r, c.y);
          sc.marks.push(m);
          u.beam = true;
          await tween_(450 + c.r * 28, (p) => { m.t = p; u.x = c.x + c.r * Math.cos(p * Math.PI * 2); u.y = c.y + c.r * Math.sin(p * Math.PI * 2); });
        }
        u.beam = false; u.beamR = 0;
      }
      await fly(u, FW + 28, exitY(u));
    };

    const strokeGroups = nothing ? [[]] : share(strokes, 4, 3, (k) => (k.type === "line" ? Math.min(k.x1, k.x2) : k.x));
    const circleGroups = share(d.circles, 3, 2, (c) => c.x);
    const cowGroups = share(d.cows, 3, 2, (c) => c.x);
    const results = await Promise.allSettled([
      ...strokeGroups.map((g, i) => strokeShip(g, lane(i, strokeGroups.length))),
      ...circleGroups.map((g, i) => circleShip(g, lane(i, circleGroups.length))),
      ...cowGroups.map((g, i) => cowShip(g, (FW * (i + 1)) / (cowGroups.length + 1))),
    ]);
    for (const r of results) if (r.status === "rejected" && r.reason !== STOP) console.error(r.reason);
    if (this.gen === gen) sc.ufos = [];
  }

  // The wheat springs back up, ready for the next word.
  async regrow() {
    await tween(900, (p) => { this.scene.fade = 1 - p; });
    this.clear();
  }

  // While laptop 1 is still designing the next word, a saucer cruises slowly over the
  // empty field so the screen never looks frozen. Returns as soon as `promise` settles
  // (straight away if it already has), and the saucer flies off on its own.
  async cruiseUntil(promise) {
    let done = false;
    promise.then(() => { done = true; }, () => { done = true; });
    await null; await null; // let an already-settled promise mark itself done
    if (done) return false;
    const sc = this.scene, gen = this.gen;
    const u = { x: -28, y: 25 + Math.random() * 50, beam: false, beamR: 0, phase: 0 };
    sc.ufos.push(u);
    const stops = [[45, 30], [115, 35], [115, 70], [45, 68]];
    for (let k = 0; !done && this.gen === gen; k++) {
      const [x, y] = stops[k % stops.length], x0 = u.x, y0 = u.y;
      await tween(1700, (p) => { u.x = lerp(x0, x, p); u.y = lerp(y0, y, p); }, ease);
    }
    flyTo(u, FW + 28, u.y).then(() => { sc.ufos = sc.ufos.filter((v) => v !== u); });
    return true;
  }

  // Message over: a saucer lowers a big chequered flag into the empty field.
  async plantFlag() {
    const sc = this.scene;
    const x = FW / 2 - FLAG.w / 2, y = FH * 0.8;
    const u = { x: x + 30, y: -30, beam: false, beamR: 0, phase: 0 };
    sc.ufos.push(u);
    await flyTo(u, x, y);
    u.beam = true; u.beamR = 6;
    sc.flag = { x, y, h: 1 };
    await tween(1100, (p) => { sc.flag.h = 1 - p; }, ease);
    sc.flag.h = 0;
    u.beam = false; u.beamR = 0;
    await flyTo(u, x - 20, -30);
    sc.ufos = sc.ufos.filter((v) => v !== u);
  }
}

function flyTo(u, x, y) {
  const x0 = u.x, y0 = u.y, dist = Math.hypot(x - x0, y - y0);
  if (dist <= 0.01) return Promise.resolve();
  return tween(250 + dist * 7.5, (p) => { u.x = lerp(x0, x, p); u.y = lerp(y0, y, p); }, ease);
}
