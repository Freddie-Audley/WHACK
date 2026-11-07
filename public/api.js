// Direct calls to the Claude API from the page (desktop app or browser). Haiku, trying its best.
const MODEL = "claude-haiku-5-5";

// The key comes from .env via the Tauri shell.
let apiKey = null;
export async function loadKey() {
  try { apiKey = await window.__TAURI__?.core.invoke("api_key"); } catch (e) { console.warn(e); }
  return apiKey;
}

// The character. Every call speaks in this voice.
const VOICE = `You are an alien ambassador on a first-contact mission, writing like a tired anthropologist's field notes. You take every picture completely literally and state the odd conclusions as plain, settled fact ("The natives keep three suns. Nobody seems bothered."). The humour is all understatement: never wink, never exaggerate, never call anything amazing or fascinating. Very short plain sentences. No exclamation marks, no greetings, no dashes, semicolons or colons.`;

const VOCAB = `The whiteboard is a 12x12 grid of black-and-white pixels. A drawing is 12 rows of 12 characters, top row first, left to right: "." = white, "#" = black.
No letters, digits, words or symbols can be drawn; only pixel pictures. That includes human signs such as arrows, crosses, ticks, hearts and question marks: the stranger has never seen them and will read them as shapes. Show the thing itself, not a sign for it.`;

const listCategories = (cats) => cats.map((c) => `- ${c.id}: "${c.label}" — one of: ${c.values.join(" / ")}`).join("\n");

async function call(system, content, schema, effort = "high", attempt = 0) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
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
    if (attempt < 2 && (r.status === 429 || r.status >= 500)) { await new Promise((res) => setTimeout(res, 3000)); return call(system, content, schema, effort, attempt + 1); }
    throw new Error(`${r.status} ${text.slice(0, 200)}`);
  }
  const msg = await r.json();
  if (msg.stop_reason === "refusal") throw new Error("refused");
  return JSON.parse(msg.content.find((b) => b.type === "text").text);
}

// Describer: one or more facts -> a single 12x12 pixel picture, plus what it mutters before and after.
export async function draw({ facts }) {
  return call(
    `${VOICE}
You are meeting a stranger from another world. You can only communicate by drawing pixel pictures on a whiteboard, and you want very badly to be understood. You only get a few boards, so one picture may have to carry more than one fact.
${VOCAB}

How to be understood:
- Think like a pixel artist working in one colour on a tiny canvas. Draw a little scene: sky at the top, ground at the bottom (a ground line helps), clear bold silhouettes with white space between things.
- Count carefully: if the fact is a number, draw exactly that many things, big and separate.
- Animals are side-on silhouettes: legs, wings, fins, a shell or tentacles. Fill the board; tiny scribbles in a corner will not be seen.
Every row must be exactly 12 characters.`,
    `${facts.length > 1 ? "Facts to communicate, all in this one picture" : "Fact to communicate"}:
${facts.map((f) => `- ${f.category.label}: ${f.value}`).join("\n")}

Return the 12 rows, a one-sentence note of what you intended, and two things you mutter to yourself (each under 8 words):
- "thought": while drawing it.
- "after": once you have put the board down, quietly sure it landed.`,
    {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "string" }, description: "12 strings of 12 characters, only . and #" },
        note: { type: "string" },
        thought: { type: "string" },
        after: { type: "string" },
      },
      required: ["rows", "note", "thought", "after"],
      additionalProperties: false,
    },
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
You are receiving a message from a stranger who is trying very hard to be understood. The photo shows a whiteboard they are holding up, seen through a webcam (possibly skewed or blurry), cropped to the board and reduced to pure black and white. The board is the large white square inside a dark frame; ignore anything outside it. They are still drawing: the picture may be unfinished.
${VOCAB}
They only get a few boards, so one picture may show several facts about their world at once. Sky is probably at the top and ground at the bottom. Small figures are probably animals, round things in the sky are probably suns, waves suggest water, scattered flakes suggest snow, streaks suggest rain or wind.`,
    [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      {
        type: "text",
        text: `Facts about their world (each category takes exactly one of its listed values):
${listCategories(categories)}
${known ? `\nWhat you concluded from earlier boards: ${known}. A new picture can overturn any of it.\n` : ""}${previous ? `\nA moment ago you read this board as ${list(previous.readings) || "nothing yet"} and muttered "${previous.thought}". More may have been drawn since. Keep it if it still fits; change your mind if it does not.\n` : ""}
First describe what you can see in the picture. Then give "readings": every fact this picture shows, as many as you can see (one or more), each a category with one of its listed values. Finally give "thought": your conclusion about the natives, under 10 words, taking the picture completely literally (e.g. "The natives' sun has legs."). Say what is actually drawn, even where the facts do not quite cover it. Do not repeat your last mutter.`,
      },
    ],
    {
      type: "object",
      properties: {
        seen: { type: "string", description: "What is visible on the board" },
        readings: {
          type: "array",
          items: {
            type: "object",
            properties: { category: { type: "string", enum: categories.map((c) => c.id) }, value: { type: "string" } },
            required: ["category", "value"],
            additionalProperties: false,
          },
        },
        reasoning: { type: "string", description: "One sentence" },
        thought: { type: "string" },
      },
      required: ["seen", "readings", "reasoning", "thought"],
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
    `${VOICE}
A stranger from another world is about to hold up a whiteboard with a pixel picture on it, several times. You cannot see it yet.`,
    `Give ${n} different things you mutter the moment a board comes up, before you have made out what is on it (each under 5 words, no two alike, none a question about what it is).`,
    { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"], additionalProperties: false },
    "low",
  );
  return out.lines;
}

// End of the game: the ambassador's report on the other world, from its guesses.
export async function report({ notes }) {
  const facts = notes.join(" ") || "Nothing. Time ran out before you understood a single picture.";
  return call(
    `${VOICE}
You are writing home after a first meeting with a stranger from another world. You communicated only with pixel pictures on a whiteboard, so you may well have misunderstood. You do not consider this possible.`,
    `Your notes from the meeting: ${facts}

Write two short sentences home. The first is the finding that matters most. The second is its practical consequence for the next visit (what to pack, whom to send, what never to mention). No greeting.`,
    {
      type: "object",
      properties: { report: { type: "string" } },
      required: ["report"],
      additionalProperties: false,
    },
    "low",
  );
}
