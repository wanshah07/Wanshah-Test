// The Studio: what else a notebook's sources can become besides a slide deck.
// One shape per output kind, shared by the writer (server), the store (server
// and Supabase) and the viewers (web), so nothing is translated twice.

export type OutputKind = "report" | "flashcards" | "quiz" | "mindmap" | "table" | "infographic" | "note";

export const OUTPUT_KINDS: OutputKind[] = ["report", "flashcards", "quiz", "mindmap", "table", "infographic", "note"];

/** The kinds the writer makes from sources. A note is saved by the person (a chat answer, their own text). */
export const STUDIO_KINDS: Exclude<OutputKind, "note">[] = ["report", "flashcards", "quiz", "mindmap", "table", "infographic"];

export type ReportFormat = "briefing" | "study" | "faq" | "timeline" | "blog" | "custom";
export const REPORT_FORMATS: { id: ReportFormat; name: string; hint: string }[] = [
  { id: "briefing", name: "Briefing doc", hint: "The key findings and what they mean, for a decision-maker." },
  { id: "study", name: "Study guide", hint: "Key concepts, terms defined, and questions to check understanding." },
  { id: "faq", name: "FAQ", hint: "The questions people actually ask, answered from the sources." },
  { id: "timeline", name: "Timeline", hint: "What happened when, in order, with the people and instruments involved." },
  { id: "blog", name: "Blog post", hint: "A readable article for a general audience." },
  { id: "custom", name: "Custom", hint: "Describe the report you want." },
];

export interface ReportSection {
  heading: string;
  /** Paragraphs of plain text; **bold** is allowed. */
  paragraphs: string[];
  points?: string[];
}
export interface ReportData {
  format: ReportFormat;
  summary: string;
  sections: ReportSection[];
  citations: string[];
}

export interface Flashcard {
  front: string;
  back: string;
  source?: string;
}
export interface FlashcardsData {
  cards: Flashcard[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index of the right option. */
  answer: number;
  explanation: string;
  source?: string;
}
export interface QuizData {
  questions: QuizQuestion[];
}

export interface MindNode {
  label: string;
  note?: string;
  children?: MindNode[];
}
export interface MindMapData {
  root: MindNode;
}

export interface TableData {
  columns: string[];
  rows: string[][];
  note?: string;
  source?: string;
}

export interface InfographicData {
  headline: string;
  subtitle?: string;
  stats: { value: string; label: string }[];
  sections: { heading: string; points: string[] }[];
  takeaway: string;
  source: string;
}

export interface NoteData {
  text: string;
  /** Where the note came from: the question it answered, when it was a chat answer. */
  question?: string;
  citations?: Citation[];
}

export type OutputData = ReportData | FlashcardsData | QuizData | MindMapData | TableData | InfographicData | NoteData;

export interface Output {
  id: string;
  deckId: string;
  kind: OutputKind;
  title: string;
  data: OutputData;
  /** The model that wrote it, for the person comparing models. */
  model?: string;
  /** Sources it was written from. */
  sourceCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** A sentence from a source that supports an answer. */
export interface Citation {
  source: string;
  quote: string;
}

export interface ChatAnswer {
  answer: string;
  citations: Citation[];
  /** Questions worth asking next. */
  followUps: string[];
  model?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** What the person chose in the Studio dialog. */
export interface StudioOptions {
  kind: Exclude<OutputKind, "note">;
  /** Free text: the topic, the focus, the audience. */
  prompt?: string;
  lang?: "en" | "ms";
  /** Fewer, standard or more cards, questions, rows or sections. */
  amount?: "fewer" | "standard" | "more";
  difficulty?: "easy" | "medium" | "hard";
  format?: ReportFormat;
  /** Short or default length (reports and infographics). */
  length?: "short" | "default";
  /** Only these sources; all of them when unset. */
  sourceIds?: string[];
  model?: string;
}

export interface KindInfo {
  kind: Exclude<OutputKind, "note">;
  name: string;
  blurb: string;
  /** Which choices the dialog offers. */
  amount?: boolean;
  difficulty?: boolean;
  format?: boolean;
  length?: boolean;
  placeholder: string;
}

export const KIND_INFO: KindInfo[] = [
  { kind: "report", name: "Report", blurb: "A briefing doc, study guide, FAQ, timeline or article, written from the sources.", format: true, length: true, placeholder: "Who it is for and what to focus on, e.g. \"A briefing for the brand team on what the sources say about benzene in sunscreen\"" },
  { kind: "flashcards", name: "Flashcards", blurb: "Cards to memorise the key facts, terms and limits.", amount: true, difficulty: true, placeholder: "e.g. \"Only the sunscreen sources\" or \"Card fronts of 1 to 5 words\"" },
  { kind: "quiz", name: "Quiz", blurb: "Multiple-choice questions with the answer explained from the sources.", amount: true, difficulty: true, placeholder: "e.g. \"Focus on concentration limits and label warnings\"" },
  { kind: "mindmap", name: "Mind map", blurb: "The topics in the sources and how they connect.", placeholder: "e.g. \"Restrict to the article about retinoids\"" },
  { kind: "table", name: "Data table", blurb: "The figures and facts in the sources, laid out as rows and columns.", amount: true, placeholder: "e.g. \"Ingredient, claim, evidence, verdict\" or \"Every product named with its issue\"" },
  { kind: "infographic", name: "Infographic", blurb: "One page of headline figures and the points that matter.", length: true, placeholder: "e.g. \"For consumers, plain language\"" },
];

// ---------------------------------------------------------------- sanitising

// Characters XML 1.0 forbids, and markup a viewer would print as text anyway.
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
function txt(v: unknown, max = 4000): string {
  if (typeof v === "string") return v.replace(BAD, "").trim().slice(0, max);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}
function list(v: unknown, max = 40, each = 1200): string[] {
  const a = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [];
  return a.map((x) => txt(x, each)).filter(Boolean).slice(0, max);
}
const opt = (s: string) => (s ? s : undefined);

function node(v: unknown, depth: number): MindNode | null {
  const o = obj(v);
  const label = txt(o?.label ?? o?.title ?? o?.name ?? (typeof v === "string" ? v : ""), 160);
  if (!label) return null;
  const n: MindNode = { label };
  const note = txt(o?.note ?? o?.detail, 400);
  if (note) n.note = note;
  if (depth < 5 && Array.isArray(o?.children)) {
    const kids = (o!.children as unknown[]).map((c) => node(c, depth + 1)).filter((c): c is MindNode => !!c).slice(0, 12);
    if (kids.length) n.children = kids;
  }
  return n;
}

/** Every field the viewers draw, and nothing else; a model's own shape is read where it can be and dropped where not. */
export function sanitizeOutputData(kind: OutputKind, raw: unknown): OutputData {
  const r = obj(raw) ?? {};
  switch (kind) {
    case "report": {
      const fmt = REPORT_FORMATS.some((f) => f.id === r.format) ? (r.format as ReportFormat) : "briefing";
      const sections = (Array.isArray(r.sections) ? r.sections : [])
        .map((s) => obj(s))
        .filter((s): s is Record<string, unknown> => !!s)
        .map((s) => {
          const sec: ReportSection = { heading: txt(s.heading ?? s.title, 200), paragraphs: list(s.paragraphs ?? s.body ?? s.text, 12, 3000) };
          const points = list(s.points ?? s.bullets, 15, 600);
          if (points.length) sec.points = points;
          return sec;
        })
        .filter((s) => s.heading || s.paragraphs.length || s.points?.length)
        .slice(0, 20);
      return { format: fmt, summary: txt(r.summary, 3000), sections, citations: list(r.citations ?? r.sources, 30, 400) };
    }
    case "flashcards": {
      const cards = (Array.isArray(r.cards) ? r.cards : [])
        .map((c) => obj(c))
        .filter((c): c is Record<string, unknown> => !!c)
        .map((c) => ({ front: txt(c.front ?? c.question ?? c.term, 400), back: txt(c.back ?? c.answer ?? c.definition, 1200), ...(txt(c.source, 300) ? { source: txt(c.source, 300) } : {}) }))
        .filter((c) => c.front && c.back)
        .slice(0, 60);
      return { cards };
    }
    case "quiz": {
      const questions = (Array.isArray(r.questions) ? r.questions : [])
        .map((q) => obj(q))
        .filter((q): q is Record<string, unknown> => !!q)
        .map((q) => {
          // The answer is an index into the options as the model wrote them, so it is found there first and
          // only then moved to where it lands once blank options are dropped.
          const rawOpts = (Array.isArray(q.options ?? q.choices) ? (q.options ?? q.choices) as unknown[] : []).slice(0, 6).map((o) => txt(o, 400));
          const options = rawOpts.filter(Boolean);
          const given = q.answer ?? q.correct;
          let raw = typeof given === "string" && !/^\d+$/.test(given.trim()) ? rawOpts.findIndex((o) => o && o === txt(given, 400)) : Number(given);
          if (!Number.isInteger(raw) || raw < 0 || raw >= rawOpts.length || !rawOpts[raw]) raw = -1;
          const answer = raw < 0 ? -1 : rawOpts.slice(0, raw).filter(Boolean).length;
          return { question: txt(q.question, 600), options, answer, explanation: txt(q.explanation, 1200), ...(txt(q.source, 300) ? { source: txt(q.source, 300) } : {}) };
        })
        .filter((q) => q.question && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)
        .slice(0, 40);
      return { questions };
    }
    case "mindmap": {
      const root = node(r.root ?? r, 0) ?? { label: "Sources" };
      return { root };
    }
    case "table": {
      const columns = list(r.columns ?? r.header, 12, 120);
      const rows = (Array.isArray(r.rows) ? r.rows : [])
        .map((row) => (Array.isArray(row) ? row.map((x) => txt(x, 600)) : []))
        .filter((row) => row.some(Boolean))
        .slice(0, 200)
        .map((row) => columns.map((_, i) => row[i] ?? ""));
      return { columns, rows, ...(opt(txt(r.note, 600)) ? { note: txt(r.note, 600) } : {}), ...(opt(txt(r.source, 400)) ? { source: txt(r.source, 400) } : {}) };
    }
    case "infographic": {
      const stats = (Array.isArray(r.stats) ? r.stats : [])
        .map((s) => obj(s))
        .filter((s): s is Record<string, unknown> => !!s)
        .map((s) => ({ value: txt(s.value, 40), label: txt(s.label, 160) }))
        .filter((s) => s.value && s.label)
        .slice(0, 6);
      const sections = (Array.isArray(r.sections) ? r.sections : [])
        .map((s) => obj(s))
        .filter((s): s is Record<string, unknown> => !!s)
        .map((s) => ({ heading: txt(s.heading, 120), points: list(s.points, 6, 300) }))
        .filter((s) => s.heading && s.points.length)
        .slice(0, 6);
      return { headline: txt(r.headline ?? r.title, 160), ...(opt(txt(r.subtitle, 300)) ? { subtitle: txt(r.subtitle, 300) } : {}), stats, sections, takeaway: txt(r.takeaway, 400), source: txt(r.source, 400) };
    }
    case "note":
    default: {
      const citations = (Array.isArray(r.citations) ? r.citations : [])
        .map((c) => obj(c))
        .filter((c): c is Record<string, unknown> => !!c)
        .map((c) => ({ source: txt(c.source, 300), quote: txt(c.quote, 600) }))
        .filter((c) => c.source || c.quote)
        .slice(0, 12);
      return { text: txt(r.text, 20000), ...(opt(txt(r.question, 1000)) ? { question: txt(r.question, 1000) } : {}), ...(citations.length ? { citations } : {}) };
    }
  }
}

/** True when an output has nothing a viewer could show. */
export function isEmptyOutput(kind: OutputKind, d: OutputData): boolean {
  switch (kind) {
    case "report":
      return !(d as ReportData).sections.length && !(d as ReportData).summary;
    case "flashcards":
      return !(d as FlashcardsData).cards.length;
    case "quiz":
      return !(d as QuizData).questions.length;
    case "mindmap":
      return !(d as MindMapData).root.children?.length;
    case "table":
      return !(d as TableData).columns.length || !(d as TableData).rows.length;
    case "infographic":
      return !(d as InfographicData).headline || (!(d as InfographicData).stats.length && !(d as InfographicData).sections.length);
    default:
      return !(d as NoteData).text;
  }
}

export function sanitizeOutput(raw: unknown): Output | null {
  const r = obj(raw);
  if (!r || !OUTPUT_KINDS.includes(r.kind as OutputKind)) return null;
  const kind = r.kind as OutputKind;
  const id = typeof r.id === "string" && /^[\w-]{1,80}$/.test(r.id) ? r.id : "";
  const deckId = typeof r.deckId === "string" && /^[\w-]{1,80}$/.test(r.deckId) ? r.deckId : "";
  if (!id || !deckId) return null;
  return {
    id,
    deckId,
    kind,
    title: txt(r.title, 200) || KIND_INFO.find((k) => k.kind === kind)?.name || "Note",
    data: sanitizeOutputData(kind, r.data),
    ...(txt(r.model, 80) ? { model: txt(r.model, 80) } : {}),
    ...(Number.isFinite(Number(r.sourceCount)) && r.sourceCount !== undefined ? { sourceCount: Number(r.sourceCount) } : {}),
    createdAt: txt(r.createdAt, 40),
    updatedAt: txt(r.updatedAt, 40),
  };
}

export function sanitizeAnswer(raw: unknown): ChatAnswer {
  const r = obj(raw) ?? {};
  const citations = (Array.isArray(r.citations) ? r.citations : [])
    .map((c) => obj(c))
    .filter((c): c is Record<string, unknown> => !!c)
    .map((c) => ({ source: txt(c.source, 300), quote: txt(c.quote, 600) }))
    .filter((c) => c.source && c.quote)
    .slice(0, 8);
  return { answer: txt(r.answer, 12000), citations, followUps: list(r.followUps ?? r.follow_ups, 3, 200) };
}

// ---------------------------------------------------------------- downloads

const mdEsc = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
/** One line of text: a line break inside a heading, a list item or a label would break the Markdown around it. */
const line = (s: string) => s.replace(/\s*\n\s*/g, " ");

/** An output as Markdown: what the person downloads, pastes or emails. */
export function outputToMarkdown(o: Output): string {
  const d = o.data;
  const out: string[] = [`# ${line(o.title)}`, ""];
  switch (o.kind) {
    case "report": {
      const r = d as ReportData;
      if (r.summary) out.push(r.summary, "");
      for (const s of r.sections) {
        if (s.heading) out.push(`## ${line(s.heading)}`, "");
        for (const p of s.paragraphs) out.push(p, "");
        if (s.points?.length) out.push(...s.points.map((p) => `- ${line(p)}`), "");
      }
      if (r.citations.length) out.push("## Sources", "", ...r.citations.map((c) => `- ${line(c)}`), "");
      break;
    }
    case "flashcards":
      (d as FlashcardsData).cards.forEach((c, i) => out.push(`**${i + 1}. ${line(c.front)}**`, "", c.back, ...(c.source ? ["", `_Source: ${c.source}_`] : []), ""));
      break;
    case "quiz":
      (d as QuizData).questions.forEach((q, i) => {
        out.push(`**${i + 1}. ${line(q.question)}**`, "", ...q.options.map((o2, j) => `${String.fromCharCode(65 + j)}. ${line(o2)}`), "", `Answer: ${String.fromCharCode(65 + q.answer)}. ${q.explanation}`, "");
      });
      break;
    case "mindmap": {
      const walk = (n: MindNode, depth: number) => {
        out.push(`${"  ".repeat(depth)}- ${line(n.label)}${n.note ? `: ${line(n.note)}` : ""}`);
        for (const c of n.children ?? []) walk(c, depth + 1);
      };
      walk((d as MindMapData).root, 0);
      out.push("");
      break;
    }
    case "table": {
      const t = d as TableData;
      out.push(`| ${t.columns.map(mdEsc).join(" | ")} |`, `| ${t.columns.map(() => "---").join(" | ")} |`, ...t.rows.map((r) => `| ${r.map(mdEsc).join(" | ")} |`), "");
      if (t.note) out.push(t.note, "");
      if (t.source) out.push(`_Source: ${t.source}_`, "");
      break;
    }
    case "infographic": {
      const g = d as InfographicData;
      out.push(`## ${line(g.headline)}`, "", ...(g.subtitle ? [g.subtitle, ""] : []), ...g.stats.map((s) => `- **${line(s.value)}** ${line(s.label)}`), "");
      for (const s of g.sections) out.push(`### ${line(s.heading)}`, "", ...s.points.map((p) => `- ${line(p)}`), "");
      if (g.takeaway) out.push(`**${line(g.takeaway)}**`, "");
      if (g.source) out.push(`_Source: ${g.source}_`, "");
      break;
    }
    default: {
      const n = d as NoteData;
      if (n.question) out.push(`> ${line(n.question)}`, "");
      out.push(n.text, "");
      if (n.citations?.length) out.push("Sources:", ...n.citations.map((c) => `- ${line(c.source)}: "${line(c.quote)}"`), "");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** A data table as CSV, quoted the way spreadsheets read it. */
export function tableToCsv(t: TableData): string {
  const q = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  // A cell that starts like a formula is read as text, not run.
  const safe = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
  return [t.columns, ...t.rows].map((r) => r.map((c) => q(safe(c))).join(",")).join("\r\n") + "\r\n";
}
