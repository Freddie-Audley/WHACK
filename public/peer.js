// How this agent sees the other ambassador's board.
// Both sources answer: start(), raised() -> bool, capture() -> dataURL, publish(raised, dataURL).

// Real link: a webcam pointed at the other laptop. "Raised" = lots of magenta border in view.
export class WebcamPeer {
  constructor(video, previewCanvas) {
    this.video = video;
    this.preview = previewCanvas;
    this.threshold = 0.06;
    this.fraction = 0;
  }
  async start() {
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    await this.video.play();
  }
  sample() {
    const ctx = this.preview.getContext("2d", { willReadFrequently: true });
    const w = this.preview.width, h = this.preview.height;
    ctx.drawImage(this.video, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 140 && d[i + 2] > 140 && d[i + 1] < 110) n++;
    }
    this.fraction = n / (d.length / 4);
    return this.fraction;
  }
  raised() { return this.sample() > this.threshold; }
  capture() {
    const c = document.createElement("canvas");
    const scale = Math.min(1, 1024 / this.video.videoWidth);
    c.width = this.video.videoWidth * scale;
    c.height = this.video.videoHeight * scale;
    c.getContext("2d").drawImage(this.video, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }
  publish() {}
}
