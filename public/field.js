// A moonlit wheat field seen from above, and the saucers that cut messages into it.
// Field units: 160 wide, 100 tall, (0,0) at the top left. Cuts glow pale against the
// dark wheat so a webcam can read them from across a table.
export const FW = 160, FH = 100;
const CUT = 3.4;  // width of a cut path, in field units
const ALT = 14;   // how high the saucers hover above their beam spot
const K = 1.6;    // saucer size

// The rules: what one field may hold. Enough for an arrow, a smile, a face or a pair of
// cows, too little to draw a detailed picture or write a word.
export const RULES = { strokes: 3, circles: 2, cows: 2 };

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

// Whatever the model sent, cut down to the rules. Lines are kept before arcs if there
// are more than 3 strokes in total.
export function normaliseDesign(d) {
  const lines = list(d?.lines).slice(0, RULES.strokes).map((l) => ({
    x1: clamp(l?.x1, 0, FW), y1: clamp(l?.y1, 0, FH), x2: clamp(l?.x2, 0, FW), y2: clamp(l?.y2, 0, FH),
  }));
  const arcs = list(d?.arcs).slice(0, RULES.strokes - lines.length).map((a) => {
    const from = deg(a?.from);
    const sweep = Math.max(15, (deg(a?.to) - from + 360) % 360 || 360);
    return { x: clamp(a?.x, 0, FW), y: clamp(a?.y, 0, FH), r: clamp(a?.r, 6, 45), from, sweep };
  });
  return {
    lines,
    arcs,
    circles: list(d?.circles).slice(0, RULES.circles).map((c) => ({
      x: clamp(c?.x, 0, FW), y: clamp(c?.y, 0, FH), r: clamp(c?.r, 4, 45), filled: !!c?.filled,
    })),
    cows: list(d?.cows).slice(0, RULES.cows).map((c) => ({
      x: clamp(c?.x, 11, FW - 11), y: clamp(c?.y, 9, FH - 9), facing: c?.facing === "right" ? "right" : "left",
    })),
  };
}

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
  ctx.globalAlpha = scene.fade;
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

function drawCow(ctx, cow, X, Y, s, alpha = 1) {
  const lift = cow.h * ALT * 0.85;
  const k = COW_SCALE * s * (0.6 + 0.4 * (1 - cow.h));
  ctx.save();
  ctx.globalAlpha = alpha;
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

export function drawScene(ctx, W, H, scene, now = 0, dt = 0, bg = null) {
  const { s, X, Y } = layout(W, H);
  if (bg) ctx.drawImage(bg, 0, 0, W, H); else drawGround(ctx, W, H);
  drawMarks(ctx, scene, X, Y, s);
  for (const c of scene.cows) if (c.h === 0) drawCow(ctx, c, X, Y, s, scene.fade);
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
    Object.assign(this.scene, { marks: [], cows: [], ufos: [], fade: 1 });
  }

  // Fly in, cut the design, fly off. Up to three saucers work at once: one cuts the
  // strokes (lines and arcs), one the circles, and one lowers the cows on its beam.
  async perform(d) {
    const sc = this.scene;
    const ufo = (x, y) => { const u = { x, y, beam: false, beamR: 0, phase: Math.random() * 6 }; sc.ufos.push(u); return u; };
    const fly = async (u, x, y) => {
      const x0 = u.x, y0 = u.y, dist = Math.hypot(x - x0, y - y0);
      if (dist > 0.01) await tween(320 + dist * 11, (p) => { u.x = lerp(x0, x, p); u.y = lerp(y0, y, p); }, ease);
    };
    const exitY = (u) => (u.y < FH / 2 ? -14 : FH + 14);
    const nothing = !d.lines.length && !d.arcs.length && !d.circles.length && !d.cows.length;

    const strokeShip = async () => {
      if (!d.lines.length && !d.arcs.length && !nothing) return;
      const u = ufo(-28, 15 + Math.random() * 70);
      for (const l of d.lines) {
        await fly(u, l.x1, l.y1);
        const m = { type: "line", ...l, t: 0 };
        sc.marks.push(m);
        u.beam = true;
        await tween(400 + Math.hypot(l.x2 - l.x1, l.y2 - l.y1) * 13, (p) => { m.t = p; u.x = lerp(l.x1, l.x2, p); u.y = lerp(l.y1, l.y2, p); });
        u.beam = false;
      }
      for (const a of d.arcs) {
        const at = (deg) => [a.x + a.r * Math.cos(rad(deg)), a.y + a.r * Math.sin(rad(deg))];
        await fly(u, ...at(a.from));
        const m = { type: "arc", ...a, t: 0 };
        sc.marks.push(m);
        u.beam = true;
        await tween(450 + (a.r * a.sweep * Math.PI / 180) * 13, (p) => { m.t = p; [u.x, u.y] = at(a.from + a.sweep * p); });
        u.beam = false;
      }
      if (nothing) await fly(u, FW / 2, u.y); // an empty field: a slow fly-past
      await fly(u, -28, exitY(u));
    };

    const cowShip = async () => {
      if (!d.cows.length) return;
      const u = ufo(FW / 2 + (Math.random() - 0.5) * 60, -30);
      for (const c of d.cows) {
        await fly(u, c.x, c.y);
        u.beam = true; u.beamR = 6;
        const cow = { ...c, h: 1 };
        sc.cows.push(cow);
        await tween(1400, (p) => { cow.h = 1 - p; }, ease);
        cow.h = 0;
        u.beam = false; u.beamR = 0;
      }
      await fly(u, u.x, -30);
    };

    const circleShip = async () => {
      if (!d.circles.length) return;
      const u = ufo(FW + 28, 15 + Math.random() * 70);
      for (const c of d.circles) {
        const m = { type: "circle", ...c, t: 0 };
        if (c.filled) {
          await fly(u, c.x, c.y);
          sc.marks.push(m);
          u.beam = true;
          await tween(650 + c.r * 24, (p) => { m.t = p; u.beamR = c.r * p; }, ease);
        } else {
          await fly(u, c.x + c.r, c.y);
          sc.marks.push(m);
          u.beam = true;
          await tween(650 + c.r * 42, (p) => { m.t = p; u.x = c.x + c.r * Math.cos(p * Math.PI * 2); u.y = c.y + c.r * Math.sin(p * Math.PI * 2); });
        }
        u.beam = false; u.beamR = 0;
      }
      await fly(u, FW + 28, exitY(u));
    };

    await Promise.all([strokeShip(), circleShip(), cowShip()]);
    sc.ufos = [];
  }

  // The wheat springs back up, ready for the next word.
  async regrow() {
    await tween(1300, (p) => { this.scene.fade = 1 - p; });
    this.clear();
  }
}
