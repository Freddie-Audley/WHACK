// Phone tilt -> a gentle turn of the background, as if the screen were a window onto the world.
// Turn the phone left and you see a bit more to the left; tip it back and you see more sky;
// roll it and the horizon stays (mostly) level. Plain maths, no three.js, so it's easy to test.
//
// Browsers only send tilt to secure pages (https:// or localhost), and iPhones (and soon
// Chrome) also need a tap to ask permission. Without tilt data the view simply stays still.

export const FOLLOW = 0.6;   // how much of the phone's turn the view follows (1 would be a true window)
export const MAX = 30;       // degrees: never turn further than this from straight ahead
export const SMOOTH = 0.12;  // per frame: how quickly the view catches up with the phone
export const SETTLE = 0.006; // per reading: how quickly "straight ahead" drifts to however the phone is held

const RAD = Math.PI / 180;

// Quaternions as [x, y, z, w].
const mul = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  ax * bw + aw * bx + ay * bz - az * by,
  ay * bw + aw * by + az * bx - ax * bz,
  az * bw + aw * bz + ax * by - ay * bx,
  aw * bw - ax * bx - ay * by - az * bz,
];
const conj = ([x, y, z, w]) => [-x, -y, -z, w];
const norm = (q) => { const n = Math.hypot(...q) || 1; return q.map((v) => v / n); };

// Turn `q` by fraction t of the way from no turn at all (the short way round).
export function scale(q, t) {
  let [x, y, z, w] = q[3] < 0 ? q.map((v) => -v) : q;
  const half = Math.acos(Math.min(1, w));
  if (half < 1e-6) return [0, 0, 0, 1];
  const s = Math.sin(half), h = half * t;
  return [(x / s) * Math.sin(h), (y / s) * Math.sin(h), (z / s) * Math.sin(h), Math.cos(h)];
}
// How far `q` turns, in degrees.
export const angle = (q) => (2 * Math.acos(Math.min(1, Math.abs(q[3])))) / RAD;
// Part of the way from a to b.
export const slerp = (a, b, t) => norm(mul(a, scale(mul(conj(a), b), t)));

// Which way the phone's back camera looks, in a world where y is up: the standard
// mapping from deviceorientation (alpha, beta, gamma) and the screen's rotation.
export function deviceQuaternion(alpha, beta, gamma, screenAngle = 0) {
  const x = beta * RAD, y = alpha * RAD, z = -gamma * RAD; // Euler angles, order YXZ
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  let q = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
  q = mul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]); // look out of the back of the phone, not the top
  const o = (-screenAngle * RAD) / 2;
  return mul(q, [0, 0, Math.sin(o), Math.cos(o)]); // landscape: turn with the screen
}

export class Tilt {
  constructor({ follow = FOLLOW, max = MAX, smooth = SMOOTH, settle = SETTLE } = {}) {
    Object.assign(this, { follow, max, smooth, settle });
    this.start = null;          // how the phone was held: "straight ahead"
    this.target = [0, 0, 0, 1]; // the turn the view is heading for
    this.current = [0, 0, 0, 1];
    this.active = false;        // true once tilt data has arrived
    addEventListener("deviceorientation", (e) => this.read(e.alpha, e.beta, e.gamma));
    // iPhones (and Chrome before long) only send tilt once the person allows it, asked from a tap.
    const D = globalThis.DeviceOrientationEvent;
    if (typeof D?.requestPermission === "function") {
      const ask = () => {
        removeEventListener("touchend", ask);
        removeEventListener("click", ask);
        D.requestPermission().catch(() => {});
      };
      addEventListener("touchend", ask);
      addEventListener("click", ask);
    }
  }

  read(alpha, beta, gamma) {
    if (alpha == null || beta == null || gamma == null) return; // laptops send nulls: no gyro
    const angleNow = screen.orientation?.angle ?? globalThis.orientation ?? 0;
    const now = deviceQuaternion(alpha, beta, gamma, angleNow);
    // "Straight ahead" slowly follows however the phone is held, so the view never gets stuck
    // turned (say, if it started flat on a table) while quick turns still show.
    this.start = this.start ? slerp(this.start, now, this.settle) : now;
    let turn = scale(mul(conj(this.start), now), this.follow);
    const a = angle(turn);
    if (a > this.max) turn = scale(turn, this.max / a);
    this.target = turn;
    this.active = true;
  }

  // Each frame: ease towards the target. Returns the turn [x, y, z, w] to apply on top of the
  // camera's own aim, in the camera's frame.
  offset() {
    this.current = slerp(this.current, this.target, this.smooth);
    return this.current;
  }
}
