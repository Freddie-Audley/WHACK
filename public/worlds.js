// Facts about a world. Chosen so that honest drawings of different facts look alike
// (dots in the sky: birds, rocks, or snow? wavy lines: water, or a gale? an empty board: no sun, no wind, no animals?),
// and so that Earth (one sun, a breeze, cows, mountains, rain) is one of the worlds.
export const CATEGORIES = [
  { id: "suns", label: "In the sky", values: ["no sun", "one sun", "two suns", "three suns"] },
  { id: "wind", label: "Wind", values: ["still", "a breeze", "a gale"] },
  { id: "animals", label: "Animals", values: ["none", "cows", "birds", "fish", "snails", "octopuses"] },
  { id: "terrain", label: "Terrain", values: ["flat", "mountains", "water", "holes"] },
  { id: "weather", label: "From above", values: ["nothing", "rain", "snow", "rocks"] },
];

// Earth, for the people at the controls.
export const EARTH = { suns: "one sun", wind: "a breeze", animals: "cows", terrain: "mountains", weather: "rain" };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function generateWorld() {
  const values = {};
  for (const c of CATEGORIES) values[c.id] = pick(c.values);
  const order = CATEGORIES.map((c) => c.id).sort(() => Math.random() - 0.5);
  return { values, order, hue: Math.random() };
}
