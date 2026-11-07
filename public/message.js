// Small pure helpers, kept apart from the DOM so they're easy to test.

// "We come in peace!" -> ["We", "come", "in", "peace"]. Keeps inner apostrophes and hyphens.
export const splitWords = (s) =>
  (s ?? "").trim().split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

// Laptop 2: turn per-frame readings into finished fields.
// A field counts as new when "done" frames start after we've seen the field fresh, or
// a saucer for at least two frames, since the last field. A single misread frame in
// the middle of a finished field doesn't split it in two. Later "done" frames of the
// same field replace its photo, since they're the most settled.
export function newTracker() {
  return { inDone: false, fresh: 0, cutting: 0, current: null, any: false };
}

export function trackFields(st, kinds, frames) {
  const found = [];
  let ended = false;
  for (let i = 0; i < kinds.length && i < frames.length; i++) {
    const k = kinds[i];
    if (k === "end") { ended = true; break; }
    if (k === "fresh") { st.fresh++; st.inDone = false; }
    else if (k === "cutting") { st.cutting++; st.inDone = false; }
    else if (k === "done") {
      if (st.inDone && st.current) {
        st.current.image = frames[i];
      } else if (!st.any || st.fresh > 0 || st.cutting >= 2) {
        st.current = { image: frames[i] };
        found.push(st.current);
        st.any = true;
      } else if (st.current) {
        st.current.image = frames[i]; // a blip in the middle of a finished field
      }
      st.inDone = true;
      st.fresh = st.cutting = 0;
    }
  }
  return { found, ended };
}
