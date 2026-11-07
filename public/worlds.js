// Facts about a world. Chosen so that honest drawings of different facts look alike
// (two circles: two suns, or two large beings? arrows: gravity, or wind?).
export const CATEGORIES = [
  { id: "suns", label: "In the sky", values: ["no sun", "one sun", "two suns", "three suns"] },
  { id: "gravity", label: "Things fall", values: ["down", "up", "sideways", "not at all"] },
  { id: "inhabitants", label: "Lives there", values: ["one giant", "a few big ones", "countless tiny ones", "nobody"] },
  { id: "ground", label: "Underfoot", values: ["flat", "mountains", "water", "holes", "crystals"] },
  { id: "weather", label: "From above", values: ["nothing", "wind", "rocks", "snow"] },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function generateWorld() {
  const values = {};
  for (const c of CATEGORIES) values[c.id] = pick(c.values);
  const order = CATEGORIES.map((c) => c.id).sort(() => Math.random() - 0.5);
  return { values, order, hue: Math.random() };
}
