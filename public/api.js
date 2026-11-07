// Direct calls to the Claude API from the page (desktop app or browser). Haiku, trying its best.
import { RULES as LIMITS } from "./field.js";

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

const text = (t) => ({ type: "text", text: t });

const RULES = `The rules, which both of you know:
- One field per word, in order. A field is cut fresh for each word.
- A field is a wheat field seen from above at night, 160 wide and 100 tall, with (0,0) at the top left.
- Every cut is the same thick path, about 3 wide, so fine detail is impossible. Within that, the saucers can cut as many straight lines, arcs and circles, and set down as many cows, as a word needs: up to ${LIMITS.strokes} lines and arcs together, ${LIMITS.circles} circles and ${LIMITS.cows} cows per field. Nothing else: no letters, digits or writing of any kind.
- A line is a straight cut.
- An arc is part of a ring: a centre, a radius from 6 to 45, and the compass angles it runs between, clockwise, where 0 is the top, 90 the right, 180 the bottom and 270 the left. So 120 to 240 is a smile, and 270 to 90 is a rainbow.
- A circle is a filled disc or a ring, with a radius from 4 to 45.
- A cow is a black-and-white cow seen from the side, about 20 wide and 15 tall, standing somewhere in the field facing left or right.`;

const num = { type: "number" };

// Laptop 1, before the run: design one field per word.
export async function designFields({ sentence, words }) {
  return call(
    `You are an alien. The only way you can talk to a stranger from another world is by cutting crop circles into a field from your flying saucers. The stranger watches the field from above and must work out your message.`,
    `Your message: "${sentence}"

${RULES}

Your ${words.length} fields: ${words.map((w, i) => `${i + 1}. ${w}`).join("  ")}

Make every word as easy to guess as you can. Think about how the stranger will read each field together with the ones around it. Use simple pictures (a filled circle can be a sun, a head or a coin, a ring an eye or a wheel, an arc a smile, a moon or a wave, lines a house, a tree or a person), arrows (three lines), pointing, sizes, counting, positions, and cows as animals, people, a pair, a crowd or pointers. Use only as much as the word needs: fewer, bigger shapes read best. Leave a field empty only if nothing better fits. Use the same design whenever a word repeats.
Keep shapes inside the field and big enough to see from across a room.
For each field also give "idea": a few words on what you mean it to show.`,
    {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              word: { type: "string" },
              idea: { type: "string" },
              lines: {
                type: "array",
                items: { type: "object", properties: { x1: num, y1: num, x2: num, y2: num }, required: ["x1", "y1", "x2", "y2"], additionalProperties: false },
              },
              arcs: {
                type: "array",
                items: { type: "object", properties: { x: num, y: num, r: num, from: num, to: num }, required: ["x", "y", "r", "from", "to"], additionalProperties: false },
              },
              circles: {
                type: "array",
                items: { type: "object", properties: { x: num, y: num, r: num, filled: { type: "boolean" } }, required: ["x", "y", "r", "filled"], additionalProperties: false },
              },
              cows: {
                type: "array",
                items: { type: "object", properties: { x: num, y: num, facing: { type: "string", enum: ["left", "right"] } }, required: ["x", "y", "facing"], additionalProperties: false },
              },
            },
            required: ["word", "idea", "lines", "arcs", "circles", "cows"],
            additionalProperties: false,
          },
        },
      },
      required: ["fields"],
      additionalProperties: false,
    },
    { effort: "high", maxTokens: 12000 },
  );
}

// Laptop 2: sort a batch of webcam frames of laptop 1's screen, in order.
export async function readFrames({ frames }) {
  const content = [];
  frames.forEach((f, i) => content.push(text(`Frame ${i + 1}:`), imageBlock(f)));
  content.push(text(`These ${frames.length} webcam frames are in time order, about a second apart. For each frame, say what the other laptop's screen shows:
- "fresh": a dark wheat field with no glowing marks and no flying saucer
- "cutting": one or more flying saucers are over the field
- "done": glowing lines, curves or circles, or cows, on the field, and no flying saucer anywhere
- "end": a big black-and-white chequered finish flag standing in the field
- "other": anything else, or you can't tell
Ignore everything around the screen.`));
  const out = await call(
    `You read webcam photos of another laptop's screen, which shows a field seen from above where flying saucers cut crop circles.`,
    content,
    {
      type: "object",
      properties: {
        frames: { type: "array", items: { type: "string", enum: ["fresh", "cutting", "done", "end", "other"] } },
      },
      required: ["frames"],
      additionalProperties: false,
    },
    { effort: "low", maxTokens: 1000 },
  );
  return out.frames;
}

// Laptop 2: guess the message from the finished fields read so far (webcam photos).
export async function guessSentence({ fields }) {
  const content = [];
  fields.forEach((f, i) => content.push(text(`Field ${i + 1}:`), imageBlock(f)));
  content.push(text(`${RULES}

These ${fields.length} photos were taken with your webcam pointed at a screen, so they may be skewed or blurry. Look only at the field.
The message may not be finished yet.
Guess one word per field, in order, so that together they make the most sensible message. Give exactly ${fields.length} words.
Also give "thought": what you mutter to yourself, under 15 words, casual, first person.`));
  return call(
    `You are an alien. A stranger from another world is trying to tell you something, and the only way they can is by cutting crop circles into a field from their flying saucers.`,
    content,
    {
      type: "object",
      properties: {
        words: { type: "array", items: { type: "string" } },
        thought: { type: "string" },
      },
      required: ["words", "thought"],
      additionalProperties: false,
    },
    { effort: "medium", maxTokens: 4000 },
  );
}
