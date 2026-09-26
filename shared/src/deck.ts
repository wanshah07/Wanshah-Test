// The deck specification. One shape for the editor, the LLM output, the HTML
// renderer and the PPTX exporter, so nothing has to be translated twice.

export type Lang = "en" | "ms";

export type ChartKind = "bar" | "column" | "line" | "area" | "pie" | "doughnut";

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartSpec {
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  unit?: string;
  source?: string;
}

export interface TableSpec {
  header: string[];
  rows: string[][];
  source?: string;
}

export interface FlowDiagram {
  kind: "flow";
  steps: { label: string; detail?: string }[];
}

export interface TimelineDiagram {
  kind: "timeline";
  events: { when: string; label: string }[];
}

export interface MatrixDiagram {
  kind: "matrix";
  rows: string[];
  cols: string[];
  cells: string[][];
}

export type DiagramSpec = FlowDiagram | TimelineDiagram | MatrixDiagram;

export interface KpiItem {
  label: string;
  value: string;
  note?: string;
}

export interface ImageRef {
  /** A media document stored by the server (uploaded or generated). */
  mediaId?: string;
  /** A direct address, used when the picture is not in the store. */
  url?: string;
  caption?: string;
  alt?: string;
  /** What the writer wanted here, kept so a picture can be generated or chosen later. */
  prompt?: string;
}

export type Layout =
  | "title"
  | "section"
  | "bullets"
  | "two-column"
  | "chart"
  | "table"
  | "diagram"
  | "image"
  | "quote"
  | "kpi"
  | "cards"
  | "closing";

export const LAYOUTS: Layout[] = [
  "title",
  "section",
  "bullets",
  "two-column",
  "chart",
  "table",
  "diagram",
  "image",
  "quote",
  "kpi",
  "cards",
  "closing",
];

/** One numbered card: a point, an answer, a decision or a step. */
export interface CardItem {
  heading: string;
  detail?: string;
  /** A short verdict or label: YES, PARTLY, HIGH, 2 MONTHS. */
  tag?: string;
}

export interface Slide {
  id: string;
  layout: Layout;
  /** 1 to 4 words in capitals above the title naming the slide's job, e.g. AT A GLANCE. */
  kicker?: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  leftHeading?: string;
  rightHeading?: string;
  bulletsRight?: string[];
  body?: string;
  chart?: ChartSpec;
  table?: TableSpec;
  diagram?: DiagramSpec;
  kpi?: KpiItem[];
  cards?: CardItem[];
  image?: ImageRef;
  quote?: { text: string; by?: string };
  notes?: string;
  citations?: string[];
  /** The user's sign-off and feedback on this slide. Never sent to the writer as slide content. */
  review?: SlideReview;
}

export interface SlideFeedback {
  text: string;
  at: string;
  /** When the writer applied it. Absent while it waits. */
  appliedAt?: string;
}

export interface SlideReview {
  ok: boolean;
  okAt?: string;
  feedback: SlideFeedback[];
}

/** Feedback saved on a slide and not yet applied. */
export function pendingFeedback(s: Slide): SlideFeedback[] {
  return (s.review?.feedback ?? []).filter((f) => !f.appliedAt);
}

export interface ThemeColors {
  bg: string;
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  line: string;
  brand: string;
  brandDeep: string;
  accent: string;
  gold: string;
}

export type SlideStyle = "clean" | "panel" | "gradient";

export interface Theme {
  id: string;
  name: string;
  fontDisplay: string;
  fontBody: string;
  colors: ThemeColors;
  /** Corner radius in slide pixels (1920-wide canvas). */
  radius: number;
  slideStyle: SlideStyle;
  footer?: string;
  logoMediaId?: string;
  logoUrl?: string;
  /** Draw the slide number bottom right. */
  slideNumbers: boolean;
}

export interface SourceRef {
  id: string;
  name: string;
  kind: string;
  chars: number;
}

export interface Deck {
  id: string;
  title: string;
  subtitle?: string;
  lang: Lang;
  angle: string;
  audience?: string;
  theme: Theme;
  slides: Slide[];
  sources: SourceRef[];
  /** OneDrive folder whose pictures are pulled in before each generation. Written by the server only. */
  onedrive?: OneDriveLink;
  /** The choices behind the last generation, so Regenerate starts from them. Written by the server only. */
  brief?: DeckBrief;
  /** The saved design the theme came from. Its notes guide the writer while it is set. */
  designId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeckBrief {
  /** Free text typed by the user, without the ticked lines. */
  text: string;
  purposes: string[];
  include: string[];
  audiences: string[];
  /** Ids of the user's saved prompts ticked for this deck. */
  prompts?: string[];
  slides?: number;
  imageMode?: "none" | "uploaded" | "generate";
  features?: Record<string, boolean>;
  /** The AI chose the angle, audience, length and layouts. */
  auto?: boolean;
}

export interface OneDriveLink {
  /** A path in the signed-in user's OneDrive, or a share link. */
  folder: string;
  subfolders: boolean;
  lastSync?: string;
}

let counter = 0;
export function newId(prefix = "s"): string {
  counter = (counter + 1) % 46656;
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 46656).toString(36).padStart(3, "0");
  return `${prefix}_${t}${r}${counter.toString(36).padStart(3, "0")}`;
}

/** Strip nulls the LLM's strict schema produces and fill the id. */
export function normaliseSlide(raw: Record<string, unknown>): Slide {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0 && k !== "rows") continue;
    out[k] = v;
  }
  if (typeof out.id !== "string" || !out.id) out.id = newId();
  if (typeof out.layout !== "string" || !LAYOUTS.includes(out.layout as Layout)) out.layout = "bullets";
  if (typeof out.title !== "string") out.title = "";
  if (out.chart && typeof out.chart === "object") {
    const c = out.chart as Record<string, unknown>;
    for (const k of Object.keys(c)) if (c[k] === null) delete c[k];
  }
  if (out.table && typeof out.table === "object") {
    const t = out.table as Record<string, unknown>;
    for (const k of Object.keys(t)) if (t[k] === null) delete t[k];
  }
  if (out.image && typeof out.image === "object") {
    const i = out.image as Record<string, unknown>;
    for (const k of Object.keys(i)) if (i[k] === null) delete i[k];
    if (Object.keys(i).length === 0) delete out.image;
  }
  if (out.quote && typeof out.quote === "object") {
    const q = out.quote as Record<string, unknown>;
    for (const k of Object.keys(q)) if (q[k] === null) delete q[k];
  }
  if (out.diagram && typeof out.diagram === "object") {
    const d = out.diagram as Record<string, unknown>;
    for (const k of Object.keys(d)) if (d[k] === null) delete d[k];
    if (Array.isArray(d.steps)) {
      d.steps = (d.steps as Record<string, unknown>[]).map((s) => {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) if (v !== null) o[k] = v;
        return o;
      });
    }
  }
  for (const key of ["kpi", "cards"]) {
    if (!Array.isArray(out[key])) continue;
    out[key] = (out[key] as unknown[])
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) if (v !== null && v !== "") o[k] = v;
        return o;
      })
      // A card with no heading is an empty box on the slide.
      .filter((o) => key !== "cards" || (typeof o.heading === "string" && o.heading.trim()));
  }
  if (typeof out.kicker === "string") out.kicker = out.kicker.trim().slice(0, 60) || undefined;
  if (!out.kicker) delete out.kicker;
  return sanitizeSlide(out);
}

const CHART_KINDS = ["bar", "column", "line", "area", "pie", "doughnut"];

/** Text from whatever a model put there: a string, a number, or a small record of strings. */
// Characters XML 1.0 forbids: a PPTX carrying one will not open in PowerPoint.
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function txt(v: unknown): string | undefined {
  if (typeof v === "string") return v.replace(XML_BAD, "").trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const parts = Object.values(v as object).filter((x) => typeof x === "string" || typeof x === "number").map(String);
    return parts.join(", ").trim() || undefined;
  }
  return undefined;
}
function txtList(v: unknown): string[] | undefined {
  const list = Array.isArray(v) ? v.map(txt).filter((x): x is string => !!x) : typeof v === "string" && v.trim() ? [v.trim()] : [];
  return list.length ? list : undefined;
}
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/**
 * Every field in the type the renderer expects, and nothing else. A slide is drawn by code that
 * maps arrays and prints strings, so an object where a string belongs (a model's own shape, an
 * old deck) would take the whole page down; here it is turned into text or dropped.
 */
export function sanitizeSlide(raw: unknown): Slide {
  const r = obj(raw) ?? {};
  const s: Slide = {
    id: typeof r.id === "string" && r.id ? r.id : newId(),
    layout: LAYOUTS.includes(r.layout as Layout) ? (r.layout as Layout) : "bullets",
    title: txt(r.title) ?? "",
  };
  for (const k of ["kicker", "subtitle", "leftHeading", "rightHeading", "body", "notes"] as const) {
    const v = txt(r[k]);
    if (v) s[k] = v;
  }
  for (const k of ["bullets", "bulletsRight", "citations"] as const) {
    const v = txtList(r[k]);
    if (v) s[k] = v;
  }
  const c = obj(r.chart);
  if (c) {
    const series = (Array.isArray(c.series) ? c.series : [])
      .map((x) => obj(x))
      .filter((x): x is Record<string, unknown> => !!x)
      .map((x) => ({ name: txt(x.name) ?? "", values: (Array.isArray(x.values) ? x.values : []).map((n) => Number(n)).filter((n) => Number.isFinite(n)) }))
      .filter((x) => x.values.length);
    if (series.length) {
      // One category per value: a chart with fewer names than numbers draws off its canvas, and with none PowerPoint will not open the file.
      const n = Math.max(...series.map((x) => x.values.length));
      const categories = (txtList(c.categories) ?? []).slice(0, n);
      while (categories.length < n) categories.push(String(categories.length + 1));
      for (const x of series) while (x.values.length < n) x.values.push(0);
      let kind = (CHART_KINDS.includes(String(c.kind)) ? c.kind : "bar") as ChartKind;
      // A share cannot be negative: a pie of signed values is a column chart.
      if ((kind === "pie" || kind === "doughnut") && series.some((x) => x.values.some((v) => v < 0))) kind = "column";
      s.chart = { kind, categories, series, ...(txt(c.unit) ? { unit: txt(c.unit) } : {}), ...(txt(c.source) ? { source: txt(c.source) } : {}) };
    }
  }
  const t = obj(r.table);
  if (t) {
    const rows = (Array.isArray(t.rows) ? t.rows : []).map((row) => (Array.isArray(row) ? row.map((x) => txt(x) ?? "") : txt(row) ? [txt(row)!] : [])).filter((row) => row.length);
    const header = Array.isArray(t.header) ? t.header.map((x) => txt(x) ?? "") : txtList(t.header) ?? [];
    // Every row as wide as the widest: a ragged table is a file PowerPoint has to repair.
    const cols = Math.max(header.length, ...rows.map((r) => r.length), 0);
    const pad = (r: string[]) => [...r, ...Array(Math.max(0, cols - r.length)).fill("")];
    if (cols && (header.some(Boolean) || rows.length)) s.table = { header: pad(header), rows: rows.map(pad), ...(txt(t.source) ? { source: txt(t.source) } : {}) };
  }
  const d = obj(r.diagram);
  if (d) {
    if (d.kind === "timeline") {
      const events = (Array.isArray(d.events) ? d.events : []).map((e) => obj(e)).filter((e): e is Record<string, unknown> => !!e).map((e) => ({ when: txt(e.when) ?? "", label: txt(e.label) ?? "" })).filter((e) => e.when || e.label);
      if (events.length) s.diagram = { kind: "timeline", events };
    } else if (d.kind === "matrix") {
      const rows = txtList(d.rows) ?? [];
      const cols = txtList(d.cols) ?? [];
      if (rows.length && cols.length) {
        const cells = rows.map((_, i) => {
          const row = Array.isArray(d.cells) && Array.isArray(d.cells[i]) ? (d.cells[i] as unknown[]).map((x) => txt(x) ?? "") : [];
          return cols.map((__, j) => row[j] ?? "");
        });
        s.diagram = { kind: "matrix", rows, cols, cells };
      }
    } else {
      const steps = (Array.isArray(d.steps) ? d.steps : [])
        .map((x) => (typeof x === "string" ? { label: x } : obj(x) ? { label: txt(obj(x)!.label) ?? "", ...(txt(obj(x)!.detail) ? { detail: txt(obj(x)!.detail) } : {}) } : null))
        .filter((x): x is { label: string; detail?: string } => !!x && !!x.label);
      if (steps.length) s.diagram = { kind: "flow", steps };
    }
  }
  if (Array.isArray(r.kpi)) {
    const kpi = r.kpi.map((x) => obj(x)).filter((x): x is Record<string, unknown> => !!x).map((x) => ({ label: txt(x.label) ?? "", value: txt(x.value) ?? "", ...(txt(x.note) ? { note: txt(x.note) } : {}) })).filter((x) => x.label || x.value);
    if (kpi.length) s.kpi = kpi;
  }
  if (Array.isArray(r.cards)) {
    const cards = r.cards
      .map((x) => (typeof x === "string" ? { heading: x } : obj(x) ? { heading: txt(obj(x)!.heading) ?? "", ...(txt(obj(x)!.detail) ? { detail: txt(obj(x)!.detail) } : {}), ...(txt(obj(x)!.tag) ? { tag: txt(obj(x)!.tag) } : {}) } : null))
      .filter((x): x is CardItem => !!x && !!x.heading.trim());
    if (cards.length) s.cards = cards;
  }
  const im = obj(r.image);
  if (im) {
    const image: ImageRef = {};
    for (const k of ["mediaId", "url", "caption", "alt", "prompt"] as const) if (typeof im[k] === "string" && (im[k] as string).trim()) image[k] = im[k] as string;
    if (Object.keys(image).length) s.image = image;
  }
  const q = typeof r.quote === "string" ? { text: r.quote } : obj(r.quote);
  if (q && txt(q.text)) s.quote = { text: txt(q.text)!, ...(txt(q.by) ? { by: txt(q.by) } : {}) };
  if (obj(r.review)) s.review = r.review as unknown as SlideReview;
  return s;
}

/** Default empty slide for a layout, used by the editor's "Add slide". */
export function blankSlide(layout: Layout, lang: Lang = "en"): Slide {
  const ms = lang === "ms";
  const s: Slide = { id: newId(), layout, title: ms ? "Tajuk slaid" : "Slide title" };
  switch (layout) {
    case "title":
      s.subtitle = ms ? "Subtajuk" : "Subtitle";
      break;
    case "bullets":
      s.bullets = [ms ? "Isi pertama" : "First point", ms ? "Isi kedua" : "Second point"];
      break;
    case "two-column":
      s.leftHeading = ms ? "Kiri" : "Left";
      s.rightHeading = ms ? "Kanan" : "Right";
      s.bullets = [ms ? "Isi" : "Point"];
      s.bulletsRight = [ms ? "Isi" : "Point"];
      break;
    case "chart":
      s.chart = { kind: "column", categories: ["A", "B", "C"], series: [{ name: ms ? "Siri" : "Series", values: [3, 5, 2] }] };
      break;
    case "table":
      s.table = { header: [ms ? "Perkara" : "Item", ms ? "Nilai" : "Value"], rows: [["", ""]] };
      break;
    case "diagram":
      s.diagram = { kind: "flow", steps: [{ label: ms ? "Langkah 1" : "Step 1" }, { label: ms ? "Langkah 2" : "Step 2" }, { label: ms ? "Langkah 3" : "Step 3" }] };
      break;
    case "kpi":
      s.kpi = [{ label: ms ? "Petunjuk" : "Metric", value: "0" }, { label: ms ? "Petunjuk" : "Metric", value: "0" }, { label: ms ? "Petunjuk" : "Metric", value: "0" }];
      break;
    case "quote":
      s.quote = { text: ms ? "Petikan" : "Quotation", by: "" };
      break;
    case "cards":
      s.cards = [
        { heading: ms ? "Perkara pertama" : "First point", detail: ms ? "Butiran" : "Detail" },
        { heading: ms ? "Perkara kedua" : "Second point", detail: ms ? "Butiran" : "Detail" },
        { heading: ms ? "Perkara ketiga" : "Third point", detail: ms ? "Butiran" : "Detail" },
      ];
      break;
    case "image":
      s.image = { caption: "" };
      break;
    case "closing":
      s.subtitle = ms ? "Terima kasih" : "Thank you";
      break;
    default:
      break;
  }
  return s;
}
