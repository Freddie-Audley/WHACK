// The white screen: one emoji at a time, and SVG pictures.

// Coerce whatever the model returned into a single emoji (first grapheme).
export function cleanEmoji(s) {
  return [...new Intl.Segmenter().segment((s ?? "").trim())][0]?.segment || "";
}

// Turn a model's emoji list into what will actually be shown: one emoji each,
// no blanks, no 🏁 (that means "the end"), never the same one twice in a row
// (laptop 2 can only see a change). Pads to `count` by recapping from the start.
export function prepareSequence(list, count, END) {
  const clean = list.map(cleanEmoji).filter((e) => e && e !== END && !/^[\p{L}\p{N}]$/u.test(e));
  if (!clean.length) return [];
  const out = [];
  for (let i = 0; out.length < count && i < count * 4; i++) {
    const e = clean[i % clean.length];
    if (e !== out[out.length - 1]) out.push(e);
  }
  return out;
}

// Laptop 2: collapse per-frame readings into newly seen emojis.
// `last` is the most recent emoji already accepted. Returns { added, last, ended }.
export function collapseReadings(readings, last, END) {
  const added = [];
  let ended = false;
  for (const r of readings) {
    if (r?.kind !== "emoji") continue;
    const e = cleanEmoji(r.emoji);
    if (!e) continue;
    if (e === END) { ended = true; break; }
    if (e !== last) { added.push(e); last = e; }
  }
  return { added, last, ended };
}

// Keep model-written SVG to plain shapes, and give it a size so it rasterises everywhere.
export function sanitiseSvg(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (doc.querySelector("parsererror") || svg.nodeName.toLowerCase() !== "svg") throw new Error("bad svg");
  doc.querySelectorAll("script, foreignObject, image, iframe, a").forEach((n) => n.remove());
  for (const el of doc.querySelectorAll("*")) {
    for (const a of [...el.attributes]) {
      const href = /(^|:)href$/i.test(a.name) && !a.value.trim().startsWith("#");
      if (a.name.toLowerCase().startsWith("on") || href) el.removeAttribute(a.name);
    }
  }
  if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", "0 0 1600 1000");
  const [, , w, h] = svg.getAttribute("viewBox").split(/[\s,]+/).map(Number);
  svg.setAttribute("width", w || 1600);
  svg.setAttribute("height", h || 1000);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return new XMLSerializer().serializeToString(svg);
}

export const svgUrl = (svg) => URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

// Rasterise for the vision model. Returns null if the webview won't allow it.
export async function svgToJpeg(svg, width = 1200) {
  const url = svgUrl(svg);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = width;
    c.height = Math.round(width * (img.naturalHeight / img.naturalWidth || 0.625));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  } catch (e) {
    console.warn("svg raster failed", e);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
