// A snake slithers along the bottom of the menu: the same green, yellow bands and googly eyes as the ones in the worlds.
const svg = document.getElementById("snake"), NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, parent = svg) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return parent.appendChild(e);
};
const N = 26, GAP = 5, R = 8, A = 6, C = (2 * Math.PI) / 80, SPEED = 45, MID = 20;
const segs = [];
for (let k = N - 1; k >= 0; k--) segs[k] = el("circle", { r: R * (1 - (k / N) * 0.7), fill: k % 4 === 3 ? "#e0c050" : "#5f9e45" }); // tail first, so the head is on top
const head = el("g", {});
const tongue = el("path", { d: "M8 0h8l4-3M16 0l4 3", stroke: "#d8434f", "stroke-width": 2, fill: "none", "stroke-linecap": "round" }, head);
el("ellipse", { rx: 11, ry: 8, fill: "#5f9e45" }, head);
const pupils = [-4, 4].map((y) => { el("circle", { cx: 2, cy: y, r: 4, fill: "#fff", stroke: "#222", "stroke-width": 0.8 }, head); return el("circle", { cy: y, r: 2, fill: "#111" }, head); });

const wave = (s) => MID + A * Math.sin(C * s);
function frame(now) {
  if (svg.getClientRects().length === 0) return; // the menu has gone: stop
  const t = now / 1000, s = t * SPEED, x = (s % (innerWidth + 200)) - 40; // head; off the right edge, back in on the left
  segs.forEach((seg, k) => { seg.setAttribute("cx", x - (k + 1) * GAP); seg.setAttribute("cy", wave(s - (k + 1) * GAP)); });
  const angle = Math.atan(A * C * Math.cos(C * s)) * 180 / Math.PI;
  head.setAttribute("transform", `translate(${x} ${wave(s)}) rotate(${angle})`);
  tongue.style.visibility = Math.sin(t * 1.3) > 0.5 && Math.sin(t * 25) > 0 ? "visible" : "hidden";
  pupils.forEach((p, i) => p.setAttribute("cx", 3 + 1.2 * Math.sin(t * 7 + i * 2))); // googly
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
