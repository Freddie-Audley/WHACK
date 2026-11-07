// A 12x12 black-and-white pixel whiteboard. A drawing is 12 strings of 12 characters: "." empty, "#" black.
export const SIZE = 12, W = 640, H = 640;
export const PALETTE = { ".": null, "#": "#111" };
const PX = W / SIZE;

export const emptyGrid = () => Array.from({ length: SIZE }, () => ".".repeat(SIZE));

// Coerce whatever the model returned into exactly 12x12 known characters.
export function cleanGrid(rows) {
  const out = [];
  for (let y = 0; y < SIZE; y++) {
    const r = (rows?.[y] ?? "").padEnd(SIZE, ".").slice(0, SIZE);
    out.push([...r].map((c) => (c in PALETTE ? c : ".")).join(""));
  }
  return out;
}

// How many pixels a drawing has; the reveal is paced by this.
export const ink = (grid) => grid.join("").replace(/[^#]/g, "").length;

// Draw the first `upTo` inked pixels (raster order) onto a white board.
export function renderBoard(canvas, grid, upTo = SIZE * SIZE) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  let n = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const col = PALETTE[grid[y][x]];
    if (!col) continue;
    if (n++ >= upTo) return;
    ctx.fillStyle = col;
    ctx.fillRect(x * PX + 1, y * PX + 1, PX - 2, PX - 2);
  }
}
