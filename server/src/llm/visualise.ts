import type { Features, Slide } from "@slidecraft/shared";

// Some writers answer every slide with bullets whatever the instructions say.
// The balance rule (at least half the content slides visual, never more than
// two text slides in a row) is then enforced here, from the words already on
// the slides: nothing is invented, only redrawn.

const STRUCTURAL = new Set(["title", "section", "closing"]);
export const VISUAL = new Set(["chart", "diagram", "kpi", "image", "table"]);

// A figure a bullet leads with or carries: 92%, 5 %, 1.5x, 4 weeks, 120 subjects, RM 2,000.
const FIGURE = /(?:RM\s?)?\d[\d,]*(?:\.\d+)?\s?(?:%|x\b|×|-fold|mg\b|g\b|ml\b|mL\b|µg|weeks?\b|days?\b|months?\b|years?\b|hours?\b|h\b|subjects?\b|participants?\b|patients?\b|volunteers?\b|minggu\b|hari\b|bulan\b|tahun\b|jam\b|orang\b|peserta\b|subjek\b)?/i;
const STEPS_TITLE = /\b(how|steps?|process|procedure|routine|method|methods|workflow|pathway|journey|protocol|timeline|cara|langkah|proses|prosedur|kaedah|rutin|aliran)\b/i;
const NUMBERED = /^\s*(?:\(?\d+[.)]|step\s*\d+|langkah\s*\d+|[a-e][.)])\s*/i;
const SPLIT = /\s*(?::|\s[—–-]\s)\s*/;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function asKpi(s: Slide): Slide["kpi"] | null {
  const b = s.bullets ?? [];
  if (b.length < 2 || b.length > 6) return null;
  const items = b.map((t) => {
    const m = FIGURE.exec(t);
    if (!m || !/\d/.test(m[0])) return null;
    const value = m[0].trim();
    const label = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).replace(/^[\s:,–—-]+|[\s:,–—-]+$/g, "").replace(/\s{2,}/g, " ");
    return label ? { label, value } : null;
  });
  const good = items.filter((x): x is { label: string; value: string } => !!x);
  // Every point must carry its own figure, or the tiles would drop the ones that do not.
  return good.length === b.length && good.length >= 2 ? good : null;
}

function asFlow(s: Slide): Slide["diagram"] | null {
  const b = s.bullets ?? [];
  if (b.length < 3 || b.length > 7) return null;
  const numbered = b.filter((t) => NUMBERED.test(t)).length >= b.length - 1;
  if (!numbered && !STEPS_TITLE.test(s.title)) return null;
  return {
    kind: "flow",
    steps: b.map((t) => {
      const clean = t.replace(NUMBERED, "").trim();
      const [head, ...rest] = clean.split(SPLIT);
      if (rest.length && words(head) <= 6) return { label: head, detail: rest.join(": ") };
      return words(clean) <= 6 ? { label: clean } : { label: clean.split(/\s+/).slice(0, 5).join(" "), detail: clean };
    }),
  };
}

function asTimeline(s: Slide): Slide["diagram"] | null {
  const b = s.bullets ?? [];
  if (b.length < 3 || b.length > 7) return null;
  const events = b.map((t) => {
    const m = /^\s*((?:19|20)\d{2}(?:[-/]\d{1,2})?|(?:Q[1-4]\s)?(?:19|20)\d{2}|(?:week|minggu|day|hari|month|bulan)\s*\d+)\s*[:,–—-]?\s*(.+)$/i.exec(t);
    return m ? { when: m[1], label: m[2] } : null;
  });
  return events.every(Boolean) ? { kind: "timeline", events: events as { when: string; label: string }[] } : null;
}

function asCards(s: Slide): Slide["cards"] | null {
  const b = s.bullets ?? [];
  if (b.length < 2 || b.length > 6) return null;
  const pairs = b.map((t) => {
    const [head, ...rest] = t.split(SPLIT);
    return rest.length && words(head) <= 6 ? { heading: head.trim(), detail: rest.join(": ").trim() } : null;
  });
  if (pairs.every(Boolean)) return pairs as { heading: string; detail: string }[];
  // Short points read as tiles on their own.
  if (b.length >= 3 && b.every((t) => words(t) <= 12)) return b.map((t) => ({ heading: t.trim() }));
  return null;
}

/** What a bullet slide can be redrawn as, strongest first; null when nothing fits honestly. */
function redraw(s: Slide, f: Features): Partial<Slide> | null {
  if (f.diagrams) {
    const t = asTimeline(s);
    if (t) return { layout: "diagram", diagram: t, bullets: undefined };
  }
  // Numbered points are a sequence, whatever figures they carry: the list number is not a figure.
  if (f.diagrams) {
    const d = asFlow(s);
    if (d) return { layout: "diagram", diagram: d, bullets: undefined };
  }
  if (f.kpis && !(s.bullets ?? []).some((t) => NUMBERED.test(t))) {
    const k = asKpi(s);
    if (k) return { layout: "kpi", kpi: k, bullets: undefined };
  }
  const c = asCards(s);
  if (c) return { layout: "cards", cards: c, bullets: undefined };
  return null;
}

/**
 * Redraw bullet slides as visuals until at least half the content slides are
 * visual and no more than two text slides run together. Returns how many changed.
 */
export function visualise(slides: Slide[], f: Features): number {
  const content = slides.filter((s) => !STRUCTURAL.has(s.layout));
  let visual = content.filter((s) => VISUAL.has(s.layout)).length;
  let changed = 0;
  const textRun = (i: number) => {
    let n = 0;
    for (let j = i; j >= 0 && !STRUCTURAL.has(slides[j].layout) && !VISUAL.has(slides[j].layout); j--) n++;
    return n;
  };
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (s.layout !== "bullets" || !s.bullets?.length) continue;
    const needMore = visual * 2 < content.length;
    const runTooLong = textRun(i) > 2;
    if (!needMore && !runTooLong) continue;
    const next = redraw(s, f);
    if (!next) continue;
    Object.assign(s, next);
    if (next.bullets === undefined) delete s.bullets;
    if (VISUAL.has(s.layout)) visual++;
    changed++;
  }
  return changed;
}
