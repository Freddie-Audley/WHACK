// Direct calls to the Claude API from the page (desktop app or browser). Haiku, trying its best.
const MODEL = "claude-haiku-5-5";

// The key comes from .env via the Tauri shell.
let apiKey = null;
export async function loadKey() {
  try { apiKey = await window.__TAURI__?.core.invoke("api_key"); } catch (e) { console.warn(e); }
  return apiKey;
}

// The character. Every call speaks in this voice.
const VOICE = `You are an alien ambassador: earnest, a little pompous, and incapable of doubt. You take every picture completely literally and leap from it to grand conclusions about an entire civilisation. You speak in short plain sentences, first person, no exclamation marks, no greetings, no dashes, semicolons or colons.`;

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

// Describer: one fact -> a 12x12 pixel picture, plus what it mutters before and after.
export async function draw({ category, value, categories }) {
  return call(
    `${VOICE}
You are meeting a stranger from another world. You can only communicate by drawing pixel pictures on a whiteboard, and you want very badly to be understood.
${VOCAB}

How to be understood:
- Think like a pixel artist working in one colour on a tiny canvas. Draw a little scene: sky at the top, ground at the bottom (a ground line helps), clear bold silhouettes with white space between things.
- Count carefully: if the fact is a number, draw exactly that many things, big and separate.
- Think about what the stranger would expect to see for EVERY possible fact, and make your picture impossible to confuse with the others. Add the detail that separates them: count, position above or below the ground, texture (waves for water, dots for a crowd, flakes for snow).
- Beings are small figures: a head on a body. Fill the board; tiny scribbles in a corner will not be seen.
Every row must be exactly 12 characters.`,
    `Fact to communicate — ${category.label}: ${value}.

The stranger knows this list of possible facts but not which one you mean:
${listCategories(categories)}

Return the 12 rows, a one-sentence note of what you intended, and two things you mutter to yourself (each under 12 words):
- "thought": while drawing it, about how you will make it unmistakable.
- "after": once you have put the board down, certain it landed, already thinking about what this tells them about you.`,
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

// Guesser: photo of the describer's board + the facts still open -> one reading.
// Called repeatedly while the board is up, as the drawing grows; `previous` is the last reading of this same board.
export async function interpret({ image, remaining, previous }) {
  const [, mediaType, data] = image.match(/^data:(image\/\w+);base64,(.+)$/);
  const out = await call(
    `${VOICE}
You are receiving a message from a stranger who is trying very hard to be understood. The photo shows a whiteboard they are holding up, seen through a webcam (possibly skewed or blurry), cropped to the board and reduced to pure black and white. The board is the large white square inside a dark frame; ignore anything outside it. They are still drawing: the picture may be unfinished.
${VOCAB}
The picture communicates exactly one fact about their world. Sky is probably at the top and ground at the bottom. Small figures are probably beings, round things in the sky are probably suns, waves suggest water, scattered flakes suggest snow.`,
    [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      {
        type: "text",
        text: `Open facts (pick exactly one category, and exactly one of its listed values):
${listCategories(remaining)}
${previous ? `\nA moment ago you read this board as ${previous.category} = ${previous.value} and muttered "${previous.thought}". More may have been drawn since. Keep it if it still fits; change your mind if it does not.\n` : ""}
First describe what you can see in the picture. Then, for each open fact, consider what a picture of it would look like, and choose the single best match with its value. Finally give "thought": the next line of your running commentary, under 15 words, naming what you see and what it must mean (continue naturally from your last mutter if there was one; do not repeat it).`,
      },
    ],
    {
      type: "object",
      properties: {
        seen: { type: "string", description: "What is visible on the board" },
        category: { type: "string", enum: remaining.map((c) => c.id) },
        value: { type: "string" },
        reasoning: { type: "string", description: "One sentence" },
        thought: { type: "string" },
      },
      required: ["seen", "category", "value", "reasoning", "thought"],
      additionalProperties: false,
    },
    "low", // this runs every couple of seconds while the board is up; speed beats care
  );
  const cat = remaining.find((c) => c.id === out.category) || remaining[0];
  out.category = cat.id;
  if (!cat.values.includes(out.value)) {
    const v = out.value.toLowerCase();
    out.value = cat.values.find((x) => v.includes(x) || x.includes(v)) || cat.values[0];
  }
  return out;
}

// Guesser, at the start: a handful of things to mutter the instant a board comes up, before the first reading lands.
export async function openers({ n }) {
  const out = await call(
    `${VOICE}
A stranger from another world is about to hold up a whiteboard with a pixel picture on it, several times. You cannot see it yet.`,
    `Give ${n} different things you mutter the moment a board comes up, before you have made out what is on it (each under 8 words, no two alike, none a question about what it is).`,
    { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"], additionalProperties: false },
    "low",
  );
  return out.lines;
}

// End of the game: the ambassador's report on the other world, from its guesses.
export async function report({ theirs }) {
  const facts = theirs.map((g) => `${g.label}: ${g.value}`).join("; ") || "nothing at all; time ran out before you understood a single picture";
  return call(
    `${VOICE}
You are writing home after a first meeting with a stranger from another world. You communicated only with pixel pictures on a whiteboard, so you may well have misunderstood. You do not consider this possible.`,
    `What you understood about their world: ${facts}.

Write three short sentences for the folks back home. Treat the facts as profound discoveries about their civilisation and draw one sweeping conclusion about what these people must be like. End with one practical recommendation that follows from it: what to pack, whom to send, or what never to mention. No greeting.`,
    {
      type: "object",
      properties: { report: { type: "string" } },
      required: ["report"],
      additionalProperties: false,
    },
    "low",
  );
}
