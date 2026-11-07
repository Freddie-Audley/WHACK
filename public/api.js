// Direct calls to the Claude API from the page (desktop app or browser). Haiku, trying its best.
const MODEL = "claude-haiku-5-5";

// The key comes from .env via the Tauri shell.
let apiKey = null;
export async function loadKey() {
  try { apiKey = await window.__TAURI__?.core.invoke("api_key"); } catch (e) { console.warn(e); }
  return apiKey;
}

const VOCAB = `The whiteboard is a 12x12 grid of black-and-white pixels. A drawing is 12 rows of 12 characters, top row first, left to right: "." = white, "#" = black.
No letters, digits, words or symbols can be drawn; only pixel pictures.`;

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

// Describer: one fact -> a 12x12 pixel picture.
export async function draw({ category, value, categories }) {
  return call(
    `You are an alien ambassador meeting a stranger from another world. You can only communicate by drawing pixel pictures on a whiteboard, and you want very badly to be understood.
${VOCAB}

How to be understood:
- Think like a pixel artist working in one colour on a tiny canvas. Draw a little scene: sky at the top, ground at the bottom (a ground line helps), clear bold silhouettes with white space between things.
- Count carefully: if the fact is a number, draw exactly that many things, big and separate.
- Think about what the stranger would expect to see for EVERY possible fact, and make your picture impossible to confuse with the others. Add the detail that separates them: count, direction (an arrow is a line with a head), position above or below the ground, texture (waves for water, dots for a crowd, flakes for snow).
- Beings are small figures: a head on a body. Fill the board; tiny scribbles in a corner will not be seen.
Every row must be exactly 12 characters.`,
    `Fact to communicate — ${category.label}: ${value}.

The stranger knows this list of possible facts but not which one you mean:
${listCategories(categories)}

Return the 12 rows, a one-sentence note of what you intended, and "thought": the one short, casual thing you mutter to yourself while drawing it (under 12 words, first person, no greeting, no exclamation marks).`,
    {
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "string" }, description: "12 strings of 12 characters, only . and #" },
        note: { type: "string" },
        thought: { type: "string" },
      },
      required: ["rows", "note", "thought"],
      additionalProperties: false,
    },
  );
}

// Guesser: photo of the describer's board + the facts still unassigned -> one assignment.
export async function interpret({ image, remaining }) {
  const [, mediaType, data] = image.match(/^data:(image\/\w+);base64,(.+)$/);
  const out = await call(
    `You are an alien ambassador receiving a message from a stranger who is trying very hard to be understood. The photo shows a whiteboard they are holding up (possibly through a webcam: skewed, blurry, glare; ignore everything outside the white board with the magenta border).
${VOCAB}
The picture communicates exactly one fact about their world. Sky is probably at the top and ground at the bottom. Small figures are probably beings, round things in the sky are probably suns, arrows show direction, waves suggest water, scattered flakes suggest snow.`,
    [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      {
        type: "text",
        text: `Remaining facts (pick exactly one category, and exactly one of its listed values):
${listCategories(remaining)}

First describe what you can see in the picture. Then, for each remaining fact, consider what a picture of it would look like, and choose the single best match with its value. Finally give "thought": what you mutter to yourself as the penny drops, under 15 words, first person, casual, naming the conclusion (no greeting, no exclamation marks).`,
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
    "medium", // the whole encounter is 90 seconds; this call is on the clock, drawings are not
  );
  const cat = remaining.find((c) => c.id === out.category) || remaining[0];
  out.category = cat.id;
  if (!cat.values.includes(out.value)) {
    const v = out.value.toLowerCase();
    out.value = cat.values.find((x) => v.includes(x) || x.includes(v)) || cat.values[0];
  }
  return out;
}

// End of the game: the ambassador's report on the other world, from its guesses.
export async function report({ theirs }) {
  const facts = theirs.map((g) => `${g.label}: ${g.value}`).join("; ") || "nothing at all; time ran out before you understood a single picture";
  return call(
    `You are an alien ambassador writing home after a first meeting with a stranger from another world. You communicated only with pixel pictures on a whiteboard, so you may well have misunderstood. Be charming and completely confident.`,
    `What you understood about their world: ${facts}.

Write two short, plain sentences describing their world for the folks back home. No greeting, no flourish.`,
    {
      type: "object",
      properties: { report: { type: "string" } },
      required: ["report"],
      additionalProperties: false,
    },
    "low",
  );
}
