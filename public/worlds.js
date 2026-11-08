// Facts about a world. Chosen so that honest drawings of different facts look alike
// (dots in the sky: birds or snow? wavy lines: water, a gale, or snakes? an empty board: no sun, no wind, no animals?),
// and so that Earth (one sun, a breeze, cows, crops, mountains, rain) is one of the worlds.
export const CATEGORIES = [
  { id: "suns", label: "Suns", values: ["no sun", "one sun", "two suns", "three suns"], choices: [["0", "no sun"], ["1", "one sun"], ["2", "two suns"], ["3", "three suns"]] },
  { id: "wind", label: "Wind", values: ["still", "a breeze", "a gale"], choices: [["Still", "still"], ["Breeze", "a breeze"], ["Gale", "a gale"]] },
  { id: "animals", label: "Animals", values: ["none", "cows", "birds", "fish", "snails", "octopuses", "snakes"], choices: [["None", "none"], ["Cows", "cows"], ["Birds", "birds"], ["Fish", "fish"], ["Snails", "snails"], ["Octopuses", "octopuses"], ["Snakes", "snakes"]] },
  { id: "food", label: "Food", values: ["mushrooms on the ground", "crops in fields", "berries in bushes", "fruit in trees"], choices: [["Fruit", "fruit in trees"], ["Berries", "berries in bushes"], ["Mushrooms", "mushrooms on the ground"], ["Crops", "crops in fields"]] },
  { id: "terrain", label: "Terrain", values: ["flat", "mountains", "water"], choices: [["Flat", "flat"], ["Mountains", "mountains"], ["Water", "water"]] },
  { id: "weather", label: "Precipitation", values: ["nothing", "rain", "snow"], choices: [["None", "nothing"], ["Rain", "rain"], ["Snow", "snow"]] },
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
