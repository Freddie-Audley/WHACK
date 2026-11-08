// Direct calls to the Claude API from the page (desktop app or browser). Sonnet: funnier than Haiku, still quick at low effort.
const MODEL = "claude-sonnet-5-5";

// The key comes from .env via the Tauri shell.
let apiKey = null;
export async function loadKey() {
  try { apiKey = await window.__TAURI__?.core.invoke("api_key"); } catch (e) { console.warn(e); }
  return apiKey;
}

// The character. Every call speaks in this voice.
const VOICE = `You are a small alien ambassador meeting a stranger from another planet for the first time. Warm, polite and a little earnest, like a well-meaning guest, with a drop of dry, fond cheek: you call the stranger and their kind "the natives", the way a field guide would, and you are quietly sure your own planet does things more sensibly. You take everything literally, so your conclusions are sweetly wrong and said as plain fact. Everyday words, no big ones. Never mean, never pointing at the joke. Every line is one short sentence, under 12 words. No exclamation marks, dashes, semicolons or colons.`;

const BOARD = `The whiteboard is 12x12 black-and-white pixels, written as 12 rows of 12 characters, "." white and "#" black.`;

const listCategories = (cats) => cats.map((c) => `- ${c.id} (${c.label}): ${c.values.join(" / ")}`).join("\n");

// `timeout`: a request that hangs must not freeze the game.
async function call(system, content, schema, effort, timeout = 20000, attempt = 0) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort, format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    if (attempt < 2 && (r.status === 429 || r.status >= 500)) { await new Promise((res) => setTimeout(res, 3000)); return call(system, content, schema, effort, timeout, attempt + 1); }
    throw new Error(`${r.status} ${text.slice(0, 200)}`);
  }
  const msg = await r.json();
  if (msg.stop_reason === "refusal") throw new Error("refused");
  return JSON.parse(msg.content.find((b) => b.type === "text").text);
}

// Describer: one or more facts -> a single 12x12 pixel picture, plus what it says before drawing.
// The spoken lines are "before" and "remark", never "thought": a field called thought trips the API's
// reasoning-extraction refusal, which blocked most drawings.
// Drawings are requested at the start of the game, so these can take their time.
export async function draw({ facts }) {
  return call(
    `${VOICE}
You are showing the stranger what your own home planet is like, and you can only do it by drawing on a whiteboard. Speak of home as yours ("we", "our", "at home"), never as theirs. ${BOARD} No letters, digits, arrows or symbols: draw the thing itself, big and bold, filling the board. Draw every listed fact accurately, and do not add other world details. If an animal is listed, draw only that species, not other animals. For food, clearly show where it grows: mushrooms on the ground, berries on bushes, or fruit attached to tree branches. When a fact is an absence (no sun, still air, no animals, nothing falling) the board must still not be blank: draw the place where it would be, like bare ground under an empty sky, or the stranger will see nothing.`,
    `Draw this detail about home accurately and prominently:
${facts.map((f) => `- ${f.category.label}: ${f.value}`).join("\n")}
Also give "before", a line said out loud just before drawing: what you are about to draw and how, said plainly (e.g. "Two round suns, one bigger than the other." or "Wavy lines for our wind, which is hard to draw." or "An octopus now, this one takes a while."). Only now and then a doubt about how it will look, and never "I hope". Under 12 words.`,
    {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "string" }, description: "12 strings of 12 characters, only . and #" },
        note: { type: "string", description: "What the picture shows, a few words" },
        before: { type: "string" },
      },
      required: ["rows", "note", "before"],
      additionalProperties: false,
    },
    "medium",
    60000,
  );
}

// Guesser: the describer's board, read off the webcam as 12 rows of "." and "#" -> what it says about their world,
// as one or more readings.
// Called repeatedly while the board is up, as the drawing grows; `previous` is the last reading of this same board.
// `believed` holds what earlier boards were taken to mean. Those facts are settled: a new board can only fill in
// the categories still open, so a half-drawn (or blank) board never wipes out what earlier boards established.
export async function interpret({ grid, categories, believed, previous }) {
  const label = (id) => categories.find((c) => c.id === id).label;
  const list = (readings) => readings.map((r) => `${label(r.category)}: ${r.value}`).join(", ");
  const known = list(Object.values(believed));
  const open = categories.filter((c) => !(c.id in believed));
  const cats = open.length ? open : categories; // everything known already: people kept drawing, so anything goes
  const out = await call(
    `${VOICE}
You are looking at a stranger's whiteboard through a webcam. ${BOARD} It may be unfinished, and one picture can show several facts about their world.`,
    `Their board right now:
${grid.join("\n")}

Possible facts (category: values):
${listCategories(cats)}
For food, identify both what grows and where: ground mushrooms, bush berries, or fruit in tree branches.
${known ? `From earlier boards you already know: ${known}. That is settled. This board is about something else.\n` : ""}${previous?.readings.length ? `A moment ago you read this board as ${list(previous.readings)} and said "${previous.remark}". Update it if more has been drawn.\n` : ""}
Give "readings": every fact this picture shows, each a category with one of its values. Give "remark", a line said out loud about the natives' world, not about the board: take the drawing as one of the possible facts above and say what that means for life there, literally and fondly (e.g. "Pebbles fall from their sky, so the natives wear hats." or "Three suns, so the natives never get a lie in." or "No animals at all, the natives must do their own mooing."). Never name things that are not among the possible facts, no doors, houses or faces. If nothing readable is there yet, say so about the natives instead (e.g. "The natives are still scribbling." or "Blank so far, the natives are thinking."). Under 12 words.`,
    {
      type: "object",
      properties: {
        seen: { type: "string", description: "What is on the board, a few words" },
        readings: {
          type: "array",
          items: {
            type: "object",
            properties: { category: { type: "string", enum: cats.map((c) => c.id) }, value: { type: "string" } },
            required: ["category", "value"],
            additionalProperties: false,
          },
        },
        remark: { type: "string" },
      },
      required: ["seen", "readings", "remark"],
      additionalProperties: false,
    },
    "low", // this runs every couple of seconds while the board is up; speed beats care
  );
  // One reading per category, each value snapped to one the category actually has.
  const byCategory = {};
  for (const r of out.readings) {
    const cat = cats.find((c) => c.id === r.category);
    if (!cat) continue;
    const value = cat.values.find((x) => x.toLowerCase() === r.value.trim().toLowerCase());
    if (value) byCategory[cat.id] = { category: cat.id, value };
  }
  out.readings = Object.values(byCategory);
  return out;
}

// Guesser, at the start: a handful of things to mutter the instant a board comes up, before the first reading lands.
export async function openers({ n }) {
  const out = await call(
    VOICE,
    `Give ${n} different things you say as the natives raise a whiteboard, before you can make it out. You know it is a whiteboard with a drawing on it, so never guess what the board or the drawing is (no doors, flags, walls or windows). Just settling in to look. Each under 5 words, warm with a drop of cheek (e.g. "Oh, the natives have art." or "Let me look." or "Hold it still, natives." or "Right, what have we here.").`,
    { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"], additionalProperties: false },
    "low",
  );
  return out.lines;
}
