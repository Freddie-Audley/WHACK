// A few random facts to nudge each new world somewhere different.
export const CATEGORIES = [
  { id: "suns", label: "In the sky", values: ["no sun", "one sun", "two suns", "three suns", "a huge ringed planet", "several moons"] },
  { id: "gravity", label: "Things fall", values: ["down", "up", "sideways", "not at all"] },
  { id: "inhabitants", label: "Lives there", values: ["one giant", "a few big ones", "countless tiny ones", "nobody", "glowing plants"] },
  { id: "ground", label: "Underfoot", values: ["flat", "mountains", "water", "holes", "crystals", "dunes"] },
  { id: "weather", label: "From above", values: ["nothing", "wind", "rocks", "snow", "rain"] },
  { id: "palette", label: "Colours", values: ["violet and teal", "orange and black", "pale pink and grey", "deep green and gold", "icy blue and white", "red and cream"] },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function generateSeed() {
  return CATEGORIES.map((c) => `${c.label.toLowerCase()}: ${pick(c.values)}`).join("; ");
}
