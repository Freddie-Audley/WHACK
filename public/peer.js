// Laptop 2's only link to laptop 1: a webcam pointed at its screen.
export class WebcamPeer {
  constructor(video) {
    this.video = video;
  }
  async start() {
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    await this.video.play();
  }
  // One frame as a JPEG data URL, at most maxWidth wide.
  capture(maxWidth = 640) {
    if (!this.video.videoWidth) return null;
    const c = document.createElement("canvas");
    const scale = Math.min(1, maxWidth / this.video.videoWidth);
    c.width = Math.round(this.video.videoWidth * scale);
    c.height = Math.round(this.video.videoHeight * scale);
    c.getContext("2d").drawImage(this.video, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  }
}
