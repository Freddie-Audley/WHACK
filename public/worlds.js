// Facts about a world. Chosen so that honest drawings of different facts look alike
// (dots in the sky: birds or snow? wavy lines: water, a gale, or snakes? an empty board: no sun, no wind, no animals?),
// and so that Earth (one sun, a breeze, cows, crops, mountains, rain) is one of the worlds.
export const CATEGORIES = [
  { id: "suns", label: "In the sky", values: ["no sun", "one sun", "two suns", "three suns"] },
  { id: "wind", label: "Wind", values: ["still", "a breeze", "a gale"] },
  { id: "animals", label: "Animals", values: ["none", "cows", "birds", "fish", "snails", "octopuses", "snakes"] },
  { id: "food", label: "Food that grows", values: ["mushrooms on the ground", "crops in fields", "berries in bushes", "fruit in trees"] },
  { id: "terrain", label: "Terrain", values: ["flat", "mountains", "water"] },
  { id: "weather", label: "From above", values: ["nothing", "rain", "snow"] },
];

// Earth, for the people at the controls.
export const EARTH = { suns: "one sun", wind: "a breeze", animals: "cows", food: "crops in fields", terrain: "mountains", weather: "rain" };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function generateWorld() {
  const values = {};
  for (const c of CATEGORIES) values[c.id] = pick(c.values);
  const order = CATEGORIES.map((c) => c.id).sort(() => Math.random() - 0.5);
  return { values, order, hue: Math.random() };
}
