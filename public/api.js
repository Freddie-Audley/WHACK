// Direct calls to the Claude API from the page (desktop app or browser). Sonnet: funnier than Haiku, still quick at low effort.
const MODEL = "claude-sonnet-5-5";

// The key comes from .env via the Tauri shell.
let apiKey = null;
export async function loadKey() {
  try { apiKey = await window.__TAURI__?.core.invoke("api_key"); } catch (e) { console.warn(e); }
  return apiKey;
}

// The character. Every call speaks in this voice.
const VOICE = `You are an alien ambassador making first contact. Dry and deadpan: you take every picture literally and state absurd conclusions as plain fact. Every line is one short sentence, under 10 words. No exclamation marks, dashes, semicolons or colons.`;

const BOARD = `The whiteboard is 12x12 black-and-white pixels.`;

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

// Describer: one or more facts -> a single 12x12 pixel picture, plus what it mutters before and after.
// Drawings are requested at the start of the game, so these can take their time.
export async function draw({ facts }) {
  return call(
    `${VOICE}
You can only talk to the stranger by drawing on a whiteboard. ${BOARD} A drawing is 12 rows of 12 characters, "." white and "#" black. No letters, digits, arrows or symbols: draw the thing itself, big and bold, filling the board.`,
    `Draw ${facts.length > 1 ? "all of this in one picture" : "this"}:
${facts.map((f) => `- ${f.category.label}: ${f.value}`).join("\n")}
Also give "thought" (said while drawing) and "after" (said once the board is down), each under 8 words.`,
    {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "string" }, description: "12 strings of 12 characters, only . and #" },
        note: { type: "string", description: "What the picture shows, a few words" },
        thought: { type: "string" },
        after: { type: "string" },
      },
      required: ["rows", "note", "thought", "after"],
      additionalProperties: false,
    },
    "medium",
    60000,
  );
}

// Guesser: photo of the describer's board -> what it says about their world, as one or more readings.
// Called repeatedly while the board is up, as the drawing grows; `previous` is the last reading of this same board.
// `believed` holds what earlier boards were taken to mean; a new board may revise any of it.
export async function interpret({ image, categories, believed, previous }) {
  const [, mediaType, data] = image.match(/^data:(image\/\w+);base64,(.+)$/);
  const label = (id) => categories.find((c) => c.id === id).label;
  const list = (readings) => readings.map((r) => `${label(r.category)}: ${r.value}`).join(", ");
  const known = list(Object.values(believed));
  const out = await call(
    `${VOICE}
The photo shows a stranger's whiteboard through a webcam, in black and white. ${BOARD} It may be unfinished, and one picture can show several facts about their world.`,
    [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      {
        type: "text",
        text: `Possible facts (category: values):
${listCategories(categories)}
${known ? `You already think: ${known}. Overwrite any of it if this picture says otherwise.\n` : ""}${previous ? `A moment ago you read this board as ${list(previous.readings) || "nothing"} and said "${previous.thought}". Update it if more has been drawn.\n` : ""}
Give "readings": every fact this picture shows, each a category with one of its values. Give "thought": what you conclude, taken literally, under 10 words (e.g. "Their sun has legs.").`,
      },
    ],
    {
      type: "object",
      properties: {
        seen: { type: "string", description: "What is on the board, a few words" },
        readings: {
          type: "array",
          items: {
            type: "object",
            properties: { category: { type: "string", enum: categories.map((c) => c.id) }, value: { type: "string" } },
            required: ["category", "value"],
            additionalProperties: false,
          },
        },
        thought: { type: "string" },
      },
      required: ["seen", "readings", "thought"],
      additionalProperties: false,
    },
    "low", // this runs every couple of seconds while the board is up; speed beats care
  );
  // One reading per category, each value snapped to one the category actually has.
  const byCategory = {};
  for (const r of out.readings) {
    const cat = categories.find((c) => c.id === r.category);
    if (!cat) continue;
    const v = r.value.toLowerCase();
    byCategory[cat.id] = { category: cat.id, value: cat.values.includes(r.value) ? r.value : cat.values.find((x) => v.includes(x) || x.includes(v)) || cat.values[0] };
  }
  out.readings = Object.values(byCategory);
  return out;
}

// Guesser, at the start: a handful of things to mutter the instant a board comes up, before the first reading lands.
export async function openers({ n }) {
  const out = await call(
    VOICE,
    `Give ${n} different things you mutter as a stranger raises a whiteboard, before you can make it out. Each under 5 words.`,
    { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"], additionalProperties: false },
    "low",
  );
  return out.lines;
}

// End of the game: the ambassador's report home, from what it concluded about each board.
export async function report({ notes }) {
  return call(
    `${VOICE}
You are reporting home after meeting a stranger who could only talk in pixel pictures.`,
    `Your notes: ${notes.join(" ") || "None. You understood nothing."}
One sentence home, under 16 words: the key finding and what to do about it next visit.`,
    { type: "object", properties: { report: { type: "string" } }, required: ["report"], additionalProperties: false },
    "low",
  );
}
