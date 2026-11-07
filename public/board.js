// A whiteboard showing one big emoji.
export const W = 640, H = 640;

// Coerce whatever the model returned into a single emoji (first grapheme).
export function cleanEmoji(s) {
  const first = [...new Intl.Segmenter().segment((s ?? "").trim())][0]?.segment;
  return first || "❓";
}

export function renderBoard(canvas, emoji = "") {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  if (!emoji) return;
  ctx.font = "420px 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, W / 2, H / 2 + 20);
}
