// Direct calls to the Claude API from the page (desktop app or browser). Haiku, trying its best.
const MODEL = "claude-haiku-5-5";

// The key comes from .env via the Tauri shell.
let apiKey = null;
export async function loadKey() {
  try { apiKey = await window.__TAURI__?.core.invoke("api_key"); } catch (e) { console.warn(e); }
  return apiKey;
}

const VOCAB = `The whiteboard can show exactly one emoji, very large. No words, letters or digits.`;

const listCategories = (cats) => cats.map((c) => `- ${c.id}: "${c.label}" — one of: ${c.values.join(" / ")}`).join("\n");

async function call(system, content, schema, attempt = 0) {
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
      output_config: { effort: "high", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    if (attempt < 2 && (r.status === 429 || r.status >= 500)) { await new Promise((res) => setTimeout(res, 3000)); return call(system, content, schema, attempt + 1); }
    throw new Error(`${r.status} ${text.slice(0, 200)}`);
  }
  const msg = await r.json();
  if (msg.stop_reason === "refusal") throw new Error("refused");
  return JSON.parse(msg.content.find((b) => b.type === "text").text);
}

// Describer: one fact -> one emoji.
export async function draw({ category, value, categories }) {
  return call(
    `You are an alien ambassador meeting a stranger from another world. You can only communicate by holding up a whiteboard with a single emoji on it, and you want very badly to be understood.
${VOCAB}

How to be understood:
- Think about what the stranger would expect to see for EVERY possible fact, and pick the emoji that is hardest to confuse with the others.
- Prefer a common, unambiguous emoji. Flag, letter and symbol emoji are poor choices.`,
    `Fact to communicate — ${category.label}: ${value}.

The stranger knows this list of possible facts but not which one you mean:
${listCategories(categories)}

Return the emoji, a one-sentence note of what you intended, and "thought": the one short, casual thing you mutter to yourself while choosing it (under 12 words, first person, no greeting, no exclamation marks).`,
    {
      type: "object",
      properties: {
        emoji: { type: "string", description: "Exactly one emoji character" },
        note: { type: "string" },
        thought: { type: "string" },
      },
      required: ["emoji", "note", "thought"],
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
The emoji communicates exactly one fact about their world.`,
    [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      {
        type: "text",
        text: `Remaining facts (pick exactly one category, and exactly one of its listed values):
${listCategories(remaining)}

First say which emoji you can see. Then, for each remaining fact, consider which emoji would stand for it, and choose the single best match with its value. Finally give "thought": what you mutter to yourself as the penny drops, under 15 words, first person, casual, naming the conclusion (no greeting, no exclamation marks).`,
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
  const facts = theirs.map((g) => `${g.label}: ${g.value}`).join("; ");
  return call(
    `You are an alien ambassador writing home after a first meeting with a stranger from another world. You communicated only with single emoji held up on a whiteboard, so you may well have misunderstood. Be charming and completely confident.`,
    `What you understood about their world: ${facts}.

Write two short, plain sentences describing their world for the folks back home. No greeting, no flourish.`,
    {
      type: "object",
      properties: { report: { type: "string" } },
      required: ["report"],
      additionalProperties: false,
    },
  );
}
