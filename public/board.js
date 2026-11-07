// A 16x16 black-and-white pixel whiteboard. A drawing is 16 strings of 16 characters: "." empty, "#" black.
export const SIZE = 16, W = 640, H = 640;
export const PALETTE = { ".": null, "#": "#111" };
const PX = W / SIZE;

export const emptyGrid = () => Array.from({ length: SIZE }, () => ".".repeat(SIZE));

// Coerce whatever the model returned into exactly 16x16 known characters.
export function cleanGrid(rows) {
  const out = [];
  for (let y = 0; y < SIZE; y++) {
    const r = (rows?.[y] ?? "").padEnd(SIZE, ".").slice(0, SIZE);
    out.push([...r].map((c) => (c in PALETTE ? c : ".")).join(""));
  }
  return out;
}

// Draw the first `upTo` pixels (raster order) onto a white board.
export function renderBoard(canvas, grid, upTo = SIZE * SIZE) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  let n = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (n++ >= upTo) return;
    const col = PALETTE[grid[y][x]];
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(x * PX + 1, y * PX + 1, PX - 2, PX - 2);
  }
}
