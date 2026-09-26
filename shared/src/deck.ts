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
  "closing",
];

export interface Slide {
  id: string;
  layout: Layout;
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
  if (Array.isArray(out.kpi)) {
    out.kpi = (out.kpi as Record<string, unknown>[]).map((s) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s)) if (v !== null) o[k] = v;
      return o;
    });
  }
  return out as unknown as Slide;
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
