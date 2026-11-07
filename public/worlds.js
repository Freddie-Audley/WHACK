// Facts about a world. Chosen so that honest drawings of different facts look alike
// (two circles: two suns, or two large beings? arrows: gravity, or wind?).
export const CATEGORIES = [
  { id: "suns", label: "In the sky", values: ["no sun", "one sun", "two suns", "three suns"],
    sentences: { "no sun": "There is no sun in the sky.", "one sun": "There is one sun in the sky.", "two suns": "There are two suns in the sky.", "three suns": "There are three suns in the sky." } },
  { id: "gravity", label: "Things fall", values: ["down", "up", "sideways", "not at all"],
    sentences: { down: "Things fall down.", up: "Things fall up.", sideways: "Things fall sideways.", "not at all": "Things don't fall at all." } },
  { id: "inhabitants", label: "Lives there", values: ["one giant", "a few big ones", "countless tiny ones", "nobody"],
    sentences: { "one giant": "One giant lives there.", "a few big ones": "A few big ones live there.", "countless tiny ones": "Countless tiny ones live there.", nobody: "Nobody lives there." } },
  { id: "ground", label: "Underfoot", values: ["flat", "mountains", "water", "holes", "crystals"],
    sentences: { flat: "The ground is flat.", mountains: "The ground is mountains.", water: "The ground is water.", holes: "The ground is full of holes.", crystals: "The ground is crystals." } },
  { id: "weather", label: "From above", values: ["nothing", "wind", "rocks", "snow"],
    sentences: { nothing: "Nothing comes from above.", wind: "Wind comes from above.", rocks: "Rocks fall from above.", snow: "Snow falls from above." } },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function generateWorld() {
  const values = {};
  for (const c of CATEGORIES) values[c.id] = pick(c.values);
  const order = CATEGORIES.map((c) => c.id).sort(() => Math.random() - 0.5);
  return { values, order, hue: Math.random() };
}
