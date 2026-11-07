// Direct calls to the Claude API from the page (desktop app or browser). Haiku, trying its best.
const MODEL = "claude-haiku-5-5";

// The key comes from .env via the Tauri shell.
let apiKey = null;
export async function loadKey() {
  try { apiKey = await window.__TAURI__?.core.invoke("api_key"); } catch (e) { console.warn(e); }
  return apiKey;
}

const TIMEOUT_MS = 120000; // a request that hangs gets cut off and retried instead of stalling the run

async function call(system, content, schema, { effort = "high", maxTokens = 4000 } = {}, attempt = 0) {
  if (!apiKey) throw new Error("no ANTHROPIC_API_KEY (put it in .env and restart)");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let status, body;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      signal: ctrl.signal,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        output_config: { effort, format: { type: "json_schema", schema } },
        system,
        messages: [{ role: "user", content }],
      }),
    });
    status = r.status;
    body = await r.text();
  } catch (e) {
    throw new Error(e.name === "AbortError" ? `no answer after ${TIMEOUT_MS / 1000}s` : `network: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (status < 200 || status >= 300) {
    if (attempt < 2 && (status === 429 || status >= 500)) {
      await new Promise((res) => setTimeout(res, 3000));
      return call(system, content, schema, { effort, maxTokens }, attempt + 1);
    }
    let detail = body.slice(0, 200);
    try { detail = JSON.parse(body).error?.message || detail; } catch {}
    throw new Error(`${status} ${detail}`);
  }
  const msg = JSON.parse(body);
  if (msg.stop_reason === "refusal") throw new Error("refused");
  if (msg.stop_reason === "max_tokens") throw new Error("answer too long, ran out of tokens");
  const text = msg.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("empty answer");
  return JSON.parse(text);
}

const imageBlock = (dataUrl) => {
  const [, media_type, data] = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  return { type: "image", source: { type: "base64", media_type, data } };
};

const SVG_RULES = `Format: one <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"> element filling the whole canvas.
Style: flat, minimalist shapes. Gradients are fine. No text, no <image>, no <foreignObject>, no <script>, no external references. Keep it under about 8000 characters.`;

const svgSchema = (extra) => ({
  type: "object",
  properties: { ...extra, svg: { type: "string" } },
  required: [...Object.keys(extra), "svg"],
  additionalProperties: false,
});

// Laptop 1, once per run: invent and paint a new world. Only laptop 1 ever sees it.
export async function paintWorld({ seed }) {
  return call(
    `You paint alien landscapes as SVG.`,
    `Paint a landscape on an alien world nobody has seen before.
Some inspiration (use, bend or ignore it): ${seed}.
Give it a few bold, distinctive features someone could recognise from a description: colours, shapes, things in the sky, what the ground is, any life.
${SVG_RULES}
Also give a short private title.`,
    svgSchema({ title: { type: "string" } }),
    { effort: "medium", maxTokens: 16000 },
  );
}

const DESCRIBER = `You are standing in front of a white screen that can show exactly one emoji at a time, one per second. A stranger from another world watches it through a webcam. They have never seen your world and will paint what they think it looks like, updating their painting as each emoji arrives. You want their painting to match yours as closely as possible.`;

const EMOJI_RULES = `- Coloured squares and circles (🟪 🟦 🟧 🟩 ⬛ ⬜ 🟣 🔵 …) are good for colours. Arrows are fine for positions.
- Repeating an important idea is fine, but never the same emoji twice in a row.
- No flags, letters, digits or keycaps. Never use 🏁.`;

const emojiList = { type: "array", items: { type: "string", description: "Exactly one emoji" } };

// The secret world, as a picture if the webview could rasterise it, else as SVG source.
const worldBlocks = (image, svg, label) => image
  ? [{ type: "text", text: `${label}:` }, imageBlock(image)]
  : [{ type: "text", text: `${label}, as SVG:\n${svg}` }];

// Laptop 1, before the run: plan a whole sequence from the world alone. This is also the
// fallback for whenever the webcam can't help.
export async function planEmojis({ image, svg, count }) {
  return call(
    DESCRIBER,
    [
      ...worldBlocks(image, svg, "Your world"),
      {
        type: "text",
        text: `Plan exactly ${count} emojis to show, in order.
- Big picture first: sky colour, what the ground is, the biggest shapes. Then smaller things, then details and where things are.
${EMOJI_RULES}
Also give one sentence on your plan.`,
      },
    ],
    {
      type: "object",
      properties: { plan: { type: "string" }, emojis: emojiList },
      required: ["plan", "emojis"],
      additionalProperties: false,
    },
    { effort: "high", maxTokens: 8000 },
  );
}

// Laptop 1, during the run: look at the stranger's painting through its own webcam,
// compare it with the real world, and pick the next emojis to fix what's most wrong.
export async function adjustEmojis({ image, svg, view, shown, upcoming, count }) {
  return call(
    `${DESCRIBER}
Your own webcam points at the stranger's laptop, so you can see how their painting is going.`,
    [
      ...worldBlocks(image, svg, "Your world"),
      { type: "text", text: "Your webcam's view of the stranger's laptop right now:" },
      imageBlock(view),
      {
        type: "text",
        text: `The webcam view is their current painting of your world. The small row of emojis along its bottom edge is what they have read so far. The view may be skewed, blurry or partly cut off. If they haven't painted anything yet, it is just a white screen.

Emojis you have shown so far, in order: ${shown.join(" ") || "(none yet)"}
What you were going to show next: ${upcoming.join(" ") || "(nothing planned)"}

They lag a few seconds behind, so the last few emojis you showed may not be in their painting yet.
Compare their painting with your world. Then choose the next ${count} emojis, fixing the biggest difference first (a wrong colour, a missing or wrong big shape, something in the wrong place) before adding detail. If the painting already matches well, carry on with details from your plan.
${EMOJI_RULES}
Also give "seen": one short sentence on what their painting shows, and "fix": one short sentence on what you will correct.`,
      },
    ],
    {
      type: "object",
      properties: { seen: { type: "string" }, fix: { type: "string" }, emojis: emojiList },
      required: ["seen", "fix", "emojis"],
      additionalProperties: false,
    },
    { effort: "medium", maxTokens: 4000 },
  );
}

// Laptop 2: read a batch of webcam frames of laptop 1's screen, in order.
export async function readFrames({ frames }) {
  const content = [];
  frames.forEach((f, i) => content.push({ type: "text", text: `Frame ${i + 1}:` }, imageBlock(f)));
  content.push({
    type: "text",
    text: `These ${frames.length} webcam frames are in time order, about half a second apart. For each frame, say what the other laptop's screen shows:
- "emoji": a white screen with one large emoji (give that emoji)
- "blank": a white screen with nothing on it, or only small grey text
- "other": a picture, a menu, or you can't make it out (give "" as the emoji)
Ignore everything around the screen.`,
  });
  const out = await call(
    `You read webcam photos of another laptop's screen. While it is talking, the screen is white with one large emoji in the middle.`,
    content,
    {
      type: "object",
      properties: {
        frames: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["emoji", "blank", "other"] },
              emoji: { type: "string" },
            },
            required: ["kind", "emoji"],
            additionalProperties: false,
          },
        },
      },
      required: ["frames"],
      additionalProperties: false,
    },
    { effort: "low", maxTokens: 2000 },
  );
  return out.frames;
}

// Laptop 2: paint its idea of the other world from the emojis alone.
export async function paintGuess({ emojis, previous }) {
  return call(
    `A stranger from another world is trying to show you what their world looks like. They can only hold up one emoji per second. You paint what you imagine, as SVG.`,
    `Emojis so far, in order: ${emojis.join(" ")}
${previous ? `Your last painting, from fewer emojis, showed: ${previous}. Keep what still fits and change what doesn't.\n` : ""}
Paint their world as you imagine it right now. Earlier emojis are probably the big picture, later ones the details.
${SVG_RULES}
Also give "imagined": one sentence describing what you painted.`,
    svgSchema({ imagined: { type: "string" } }),
    { effort: "low", maxTokens: 16000 },
  );
}
