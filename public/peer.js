// How this agent sees the other ambassador's board.
// Both sources answer: start(), raised() -> bool, capture() -> dataURL, publish(raised, dataURL).

// Real link: a webcam pointed at the other laptop. "Raised" = lots of magenta border in view.
// The board is located by its magenta frame; only that region (padded) is sent to the model,
// and the same region is highlighted on the preview so you can see what the agent will see.
export class WebcamPeer {
  constructor(video, previewCanvas, overlayCanvas, threshold = 0.02) {
    this.video = video;
    this.preview = previewCanvas;
    this.overlay = overlayCanvas;
    this.threshold = threshold;
    this.fraction = 0;
    this.box = null; // { x, y, w, h } as fractions of the frame, or null when no board is in view
  }
  async start() {
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    await this.video.play();
    const loop = () => { this.sample(); this.drawOverlay(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  // Magenta fraction of the frame, and the bounding box of the magenta pixels.
  sample() {
    const ctx = this.preview.getContext("2d", { willReadFrequently: true });
    const w = this.preview.width, h = this.preview.height;
    ctx.drawImage(this.video, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const rows = new Uint16Array(h), cols = new Uint16Array(w);
    let n = 0;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
      if (d[i] > 140 && d[i + 2] > 140 && d[i + 1] < 110) { n++; rows[y]++; cols[x]++; }
    }
    this.fraction = n / (w * h);
    // Rows/columns with at least a few magenta pixels bound the frame; stray pixels are ignored.
    const span = (counts, min) => {
      let a = -1, b = -1;
      for (let k = 0; k < counts.length; k++) if (counts[k] >= min) { if (a < 0) a = k; b = k; }
      return a < 0 ? null : [a, b + 1];
    };
    const ys = span(rows, 3), xs = span(cols, 3);
    this.box = ys && xs && n > w * h * 0.004
      ? { x: xs[0] / w, y: ys[0] / h, w: (xs[1] - xs[0]) / w, h: (ys[1] - ys[0]) / h }
      : null;
    return this.fraction;
  }
  raised() { return this.sample() > this.threshold; }
  // The frame cropped to the board (with a margin), or the whole frame if no board is in view.
  capture() {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    const b = this.box || { x: 0, y: 0, w: 1, h: 1 };
    const pad = 0.15;
    const x0 = Math.max(0, (b.x - b.w * pad) * vw), y0 = Math.max(0, (b.y - b.h * pad) * vh);
    const x1 = Math.min(vw, (b.x + b.w * (1 + pad)) * vw), y1 = Math.min(vh, (b.y + b.h * (1 + pad)) * vh);
    const c = document.createElement("canvas");
    const scale = Math.min(1, 1024 / (x1 - x0));
    c.width = Math.round((x1 - x0) * scale);
    c.height = Math.round((y1 - y0) * scale);
    c.getContext("2d").drawImage(this.video, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }
  // Dim everything but the region that capture() would send.
  drawOverlay() {
    if (!this.overlay) return;
    const ctx = this.overlay.getContext("2d");
    const w = this.overlay.width, h = this.overlay.height;
    ctx.clearRect(0, 0, w, h);
    const up = this.fraction > this.threshold;
    if (!this.box) return;
    const b = this.box, pad = 0.15;
    const x = (b.x - b.w * pad) * w, y = (b.y - b.h * pad) * h, bw = b.w * (1 + 2 * pad) * w, bh = b.h * (1 + 2 * pad) * h;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(0, 0, w, h);
    ctx.clearRect(x, y, bw, bh);
    const colour = up ? "#ff00ff" : "rgba(255,255,255,.9)";
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
