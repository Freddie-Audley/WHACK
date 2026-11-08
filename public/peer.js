// How this agent sees the other ambassador's board.
// Both sources answer: start(), raised() -> bool, capture() -> grid, publish(raised, dataURL).
import { SIZE } from "./board.js";

// Real link: a webcam pointed at the other laptop. "Raised" = lots of magenta border in view.
// The board is located by its magenta frame; that region (padded) is cropped and read cell by cell into 12 rows
// of "." and "#", which is what the model is given. The same region is highlighted on the preview so you can see
// what the agent will see.
export class WebcamPeer {
  constructor(video, previewCanvas, overlayCanvas, threshold = 0.02) {
    this.video = video;
    this.preview = previewCanvas;
    this.overlay = overlayCanvas;
    this.threshold = threshold;
    this.fraction = 0;
    this.box = null; // { x, y, w, h } as fractions of the frame, or null when no board is in view
    // Whether the board is up, judged on every frame so a quick dip is never missed: it changes once the
    // magenta has been in (or out of) view for a moment. `rises` and `falls` count the changes.
    this.up = false; this.seenUp = false; this.since = 0; this.rises = 0; this.falls = 0;
  }
  async start() {
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    await this.video.play();
    const loop = () => { this.sample(); this.track(); this.drawOverlay(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  // Magenta fraction of the frame, and the bounding box of the magenta pixels.
  sample() {
    const ctx = this.preview.getContext("2d", { willReadFrequently: true });
    const w = this.preview.width, h = this.preview.height;
    ctx.drawImage(this.video, 0, 0, w, h);
    const { n, box: b } = magenta(ctx.getImageData(0, 0, w, h).data, w, h);
    this.fraction = n / (w * h);
    this.box = b && n > w * h * 0.004
      ? { x: b.x0 / w, y: b.y0 / h, w: (b.x1 - b.x0) / w, h: (b.y1 - b.y0) / h }
      : null;
    return this.fraction;
  }
  raised() { return this.sample() > this.threshold; }
  track() {
    const now = performance.now(), up = this.fraction > this.threshold;
    if (up !== this.seenUp) { this.seenUp = up; this.since = now; }
    if (up !== this.up && now - this.since > 250) { this.up = up; if (up) this.rises++; else this.falls++; }
  }
  // The board as 12 rows of "." and "#", read off the frame cropped to it, or null when the magenta frame is not
  // in the crop.
  capture() {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const b = this.box || { x: 0, y: 0, w: 1, h: 1 };
    const pad = 0.05;
    const x0 = Math.max(0, (b.x - b.w * pad) * vw), y0 = Math.max(0, (b.y - b.h * pad) * vh);
    const x1 = Math.min(vw, (b.x + b.w * (1 + pad)) * vw), y1 = Math.min(vh, (b.y + b.h * (1 + pad)) * vh);
    const c = document.createElement("canvas");
    const scale = Math.min(1, 640 / (x1 - x0)); // a 12x12 board needs no more; smaller is quicker to read
    c.width = Math.round((x1 - x0) * scale);
    c.height = Math.round((y1 - y0) * scale);
    const ctx = c.getContext("2d");
    ctx.drawImage(this.video, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    // The frame again, at full resolution this time (the preview is only 160 pixels wide): a cell is a few pixels
    // of the preview, so the lattice has to come from the crop. A frame that is cut off is not square; skip it.
    const { box } = magenta(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    const ratio = box ? (box.x1 - box.x0) / (box.y1 - box.y0) : 0;
    const whole = box && box.x1 - box.x0 >= 2 * SIZE && ratio > 0.75 && ratio < 1.33;
    binarise(ctx, c.width, c.height);
    return whole ? readGrid(ctx, c.width, c.height, box) : null;
  }
  // Dim everything but the region that capture() would read.
  drawOverlay() {
    if (!this.overlay) return;
    const ctx = this.overlay.getContext("2d");
    const w = this.overlay.width, h = this.overlay.height;
    ctx.clearRect(0, 0, w, h);
    if (!this.box) return;
    const b = this.box, pad = 0.05;
    const x = (b.x - b.w * pad) * w, y = (b.y - b.h * pad) * h, bw = b.w * (1 + 2 * pad) * w, bh = b.h * (1 + 2 * pad) * h;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, w, h);
    ctx.clearRect(x, y, bw, bh);
    const colour = "rgba(255,255,255,.9)";
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bh);
    // The magenta fraction, just above the box. The overlay is mirrored, so flip the text back.
    ctx.save();
    ctx.translate(x + bw / 2, Math.max(14, y - 6));
    ctx.scale(-1, 1);
    ctx.fillStyle = colour;
    ctx.font = "600 16px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${(this.fraction * 100).toFixed(1)}%`, 0, 0);
    ctx.restore();
  }
  publish() {}
}

// Where the magenta is: how many pixels, and their bounding box in pixels (null when there is none).
// Rows/columns with at least a few magenta pixels bound the frame; stray pixels are ignored.
function magenta(d, w, h) {
  const rows = new Uint16Array(h), cols = new Uint16Array(w);
  let n = 0;
  // Red and blue well above green, whatever the brightness: a frame half in shadow must still be bounded exactly,
  // or the lattice is read off by a cell.
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
    if (d[i] > 100 && d[i + 2] > 100 && d[i + 1] < 0.55 * Math.min(d[i], d[i + 2])) { n++; rows[y]++; cols[x]++; }
  }
  const span = (counts, min) => {
    let a = -1, b = -1;
    for (let k = 0; k < counts.length; k++) if (counts[k] >= min) { if (a < 0) a = k; b = k; }
    return a < 0 ? null : [a, b + 1];
  };
  const ys = span(rows, 3), xs = span(cols, 3);
  return { n, box: ys && xs ? { x0: xs[0], y0: ys[0], x1: xs[1], y1: ys[1] } : null };
}

// Read the binarised board cell by cell: "#" when the middle half of the cell (clear of its neighbours even when the
// lattice is off by a little) is mostly black. The frame is 5% of the board's width on each side, plus a couple of
// pixels of padding, so the drawing fills the middle 89% of the magenta box.
const INNER = 0.893;
function readGrid(ctx, w, h, b) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const left = b.x0 + bw * (1 - INNER) / 2, top = b.y0 + bh * (1 - INNER) / 2, cw = bw * INNER / SIZE, ch = bh * INNER / SIZE;
  const rows = [];
  for (let gy = 0; gy < SIZE; gy++) {
    let row = "";
    for (let gx = 0; gx < SIZE; gx++) {
      const x0 = Math.round(left + (gx + 0.25) * cw), x1 = Math.round(left + (gx + 0.75) * cw);
      const y0 = Math.round(top + (gy + 0.25) * ch), y1 = Math.round(top + (gy + 0.75) * ch);
      let dark = 0, all = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { all++; if (d[(y * w + x) * 4] < 128) dark++; }
      row += all && dark * 2 > all ? "#" : ".";
    }
    rows.push(row);
  }
  return rows;
}

// Turn the crop into clean black and white. The threshold is local (each pixel against the mean of a window
// around it, via an integral image), so glare and uneven screen brightness do not swallow half the board.
function binarise(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const grey = new Float32Array(w * h), sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    grey[y * w + x] = g;
    sum[(y + 1) * (w + 1) + x + 1] = g + sum[y * (w + 1) + x + 1] + sum[(y + 1) * (w + 1) + x] - sum[y * (w + 1) + x];
  }
  // Global threshold (Otsu) keeps big black shapes solid; the local one rescues dark pixels washed out by glare.
  const hist = new Float64Array(256);
  for (const g of grey) hist[g | 0]++;
  let total = w * h, sumAll = 0, sumB = 0, wB = 0, best = 0, T = 128;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; T = i; }
  }
  const r = Math.max(8, (Math.min(w, h) / 10) | 0), bias = 25; // window ~ one board cell
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
    const mean = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    const g = grey[y * w + x];
    const v = g < T || g < mean - bias ? 0 : 255;
    const i = (y * w + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
