// A deck can change in two places at once: the worker writing it, and the
// person editing it in the browser (the page saves decks straight to Supabase).
// When the stored deck moved while the worker ran, the two versions are merged
// against the one the worker started from, slide by slide, so neither side's
// edits are lost. Where both changed the same slide or field, the worker's
// version wins: it is the work the person asked for.

type Doc = Record<string, unknown>;
type Slide = { id: string } & Record<string, unknown>;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function slidesOf(d: Doc): Slide[] {
  return (Array.isArray(d.slides) ? d.slides : []).filter((s): s is Slide => !!s && typeof s === "object" && typeof (s as Slide).id === "string");
}

export function mergeDoc(base: Doc, ours: Doc, theirs: Doc): Doc {
  const out: Doc = { ...theirs };
  for (const k of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
    if (k === "slides" || k === "updatedAt") continue;
    if (!same(ours[k], base[k])) {
      if (k in ours) out[k] = ours[k];
      else delete out[k];
    }
  }
  const b = slidesOf(base);
  const o = slidesOf(ours);
  const t = slidesOf(theirs);
  if (same(o, b)) out.slides = t;
  else if (same(t, b)) out.slides = o;
  else {
    const bm = new Map(b.map((s) => [s.id, s]));
    const om = new Map(o.map((s) => [s.id, s]));
    const tm = new Map(t.map((s) => [s.id, s]));
    const orderChanged = !same(o.map((s) => s.id), b.map((s) => s.id));
    // The worker's order when it reordered or added slides, else the person's; then anything new only on the other side.
    const order = orderChanged ? [...o.map((s) => s.id), ...t.map((s) => s.id).filter((id) => !om.has(id) && !bm.has(id))] : [...t.map((s) => s.id), ...o.map((s) => s.id).filter((id) => !tm.has(id) && !bm.has(id))];
    const slides: Slide[] = [];
    for (const id of order) {
      const bs = bm.get(id);
      const os = om.get(id);
      const ts = tm.get(id);
      const oursChanged = !same(os, bs);
      const theirsChanged = !same(ts, bs);
      if (oursChanged) {
        if (os) slides.push(os); // changed or added by the worker; a slide the worker deleted stays deleted
      } else if (theirsChanged) {
        if (ts) slides.push(ts);
      } else if (os) slides.push(os);
    }
    out.slides = slides;
  }
  return out;
}
