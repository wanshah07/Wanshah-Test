import { angleById, slopBanList, type Features, type Lang } from "@slidecraft/shared";

export interface GenerateParams {
  prompt: string;
  title?: string;
  lang: Lang;
  angle: string;
  audience?: string;
  slides: number;
  features: Features;
  imageMode: "none" | "uploaded" | "generate";
  /** The user's saved prompts ticked for this deck. */
  house?: { name: string; text: string }[];
  /** Notes read from the reference design the deck uses. */
  designNotes?: string;
}

function houseLines(house: GenerateParams["house"], designNotes: string | undefined): string[] {
  const out: string[] = [];
  if (house?.length) {
    out.push("HOUSE INSTRUCTIONS (the user's own saved prompts; follow them unless they conflict with FACTS AND SOURCES or STYLE, which always win):");
    for (const h of house) out.push(`- ${h.name}: ${h.text.replace(/\s*\n\s*/g, " ")}`);
    out.push("");
  }
  if (designNotes?.trim()) {
    out.push(`DESIGN REFERENCE (the user chose this design; match its density and visual habits): ${designNotes.trim()}`);
    out.push("");
  }
  return out;
}

const LANG_RULES: Record<Lang, string> = {
  en: "Write in English. Short sentences. No filler.",
  ms:
    "Tulis dalam Bahasa Malaysia (Malaysia, BUKAN Bahasa Indonesia). Gunakan: boleh (bukan bisa), ubat (bukan obat), syarikat (bukan perusahaan), kualiti (bukan kualitas), pembungkusan (bukan kemasan), kerana (bukan karena), perlu (bukan butuh), pihak berkuasa (bukan berwenang), kosmetik (bukan kosmetika). Istilah rasmi kekal dalam bentuk asal: Notifikasi Kosmetik, Garis Panduan, Borang, Sijil Halal. Ayat pendek.",
};

export function systemPrompt(p: GenerateParams): string {
  const angle = angleById(p.angle);
  const f = p.features;
  const allowed: string[] = ["title", "bullets", "two-column", "quote", "closing"];
  if (f.sections) allowed.push("section");
  if (f.charts) allowed.push("chart");
  if (f.tables) allowed.push("table");
  if (f.diagrams) allowed.push("diagram");
  if (f.kpis) allowed.push("kpi");
  if (f.images && p.imageMode !== "none") allowed.push("image");

  const lines: string[] = [];
  lines.push("You write slide decks for a regulatory and scientific professional. The reader is expert. Every slide must earn its place with a fact, a number, a decision or a step.");
  lines.push("");
  lines.push(`ANGLE: ${angle.name} (${angle.hat}). ${angle.brief}`);
  if (angle.skeleton.length) lines.push(`Suggested structure, adapt to the material: ${angle.skeleton.join(" → ")}.`);
  if (p.audience) lines.push(`AUDIENCE: ${p.audience}.`);
  lines.push("");
  lines.push(`LANGUAGE: ${LANG_RULES[p.lang]}`);
  lines.push("");
  lines.push("FACTS AND SOURCES:");
  lines.push("- Use the sources provided. Prefer a figure, a date, a clause or a quotation from a source over a general statement.");
  lines.push("- Do not invent a fee, a date, a clause number, a statistic or a study. If the sources do not carry a fact the slide needs, write the marker [SAHKAN: <the exact missing fact>] in its place, e.g. [SAHKAN: NPRA notification fee 2026]. Never write [SAHKAN: what to verify]; name the fact.");
  if (f.citations) lines.push("- `citations`: for every slide that states a fact, name where it comes from: the instrument and clause (e.g. EC 1223/2009 Annex III entry 98), the paper (authors, journal, year, DOI), the dataset or the source file name. Never cite a blog, newsletter or aggregator; cite what it was reading.");
  else lines.push("- `citations`: leave empty.");
  lines.push("");
  lines.push("STYLE, NON-NEGOTIABLE:");
  lines.push("- No dashes (— or –) anywhere; use a comma, a colon or a full stop.");
  lines.push("- No emoji, no exclamation marks, no rhetorical questions as titles, no ellipses.");
  lines.push("- Titles state the point, not the topic: 'Salicylic acid is capped at 2% in rinse-off' not 'Salicylic acid limits'.");
  lines.push("- Bullets are fragments of at most 14 words, one idea each, at most 6 per slide. Speaker notes carry the argument.");
  lines.push(`- Banned words and habits: ${slopBanList(p.lang).join("; ")}. Also banned in any language: the words 'landscape', 'journey', 'leverage', 'unlock', 'seamless', 'robust', 'comprehensive', 'holistic', 'synergy', 'stakeholder', 'best practice', 'key takeaway', 'deep dive', 'game-changer', 'cutting-edge'. Say the concrete thing instead.`);
  lines.push("- Do not open with a scene-setter or close with a summary of the summary. Do not congratulate the reader or the presenter.");
  lines.push("- Use **bold** only for the single figure or term on a slide that matters most, at most once per slide.");
  lines.push("");
  lines.push("SLIDE LAYOUTS you may use: " + allowed.join(", ") + ". Any other layout is forbidden.");
  lines.push("- title: first slide only. subtitle carries the occasion, audience or date if known.");
  lines.push("- closing: last slide. If a summary is requested, put it on a bullets slide before the closing slide.");
  if (f.sections) lines.push("- section: a divider before each part. Title is the part name, subtitle one line on what it decides.");
  lines.push("- bullets: 3 to 6 bullets. body is optional, one sentence of context above the bullets.");
  lines.push("- two-column: leftHeading/rightHeading with bullets/bulletsRight, for before/after, option A/B, mandatory/recommended.");
  if (f.charts) lines.push("- chart: ONLY when the sources carry the numbers. categories and series values must come from the sources; unit and source filled. Use column for categories, line/area for time, bar for ranked items, pie/doughnut for shares that sum to a whole. bullets may hold 2 or 3 readings of the chart.");
  if (f.tables) lines.push("- table: header plus 2 to 8 rows, at most 5 columns, cells under 12 words. Fill source.");
  if (f.diagrams) lines.push("- diagram: flow (3 to 7 steps with a short detail each) for a process or pathway; timeline (3 to 7 events with when + label) for dates; matrix (rows x cols, cells short, 'yes'/'no' where binary) for a comparison. Fill only the arrays the kind uses; leave the others empty.");
  if (f.kpis) lines.push("- kpi: 3 or 4 items, value is the figure as a short string with its unit, label what it is, note the source or period.");
  if (allowed.includes("image")) {
    if (p.imageMode === "uploaded") lines.push("- image: use for an uploaded picture. Set image.sourceName to the file name from the source list that fits, caption what it shows. bullets may hold 2 or 3 points beside it.");
    else lines.push("- image: at most 3 slides in the deck. image.prompt describes a photograph or clean illustration to generate (no text in the picture, no logos, no people's faces), caption what it shows.");
  }
  if (f.notes) lines.push("- notes: 40 to 120 words of what the presenter says on this slide, in the same language, plain prose, no bullets. Include the caveats that do not fit on the slide.");
  else lines.push("- notes: leave null.");
  if (f.summary) lines.push("- Include one bullets slide titled with the decision or takeaways, immediately before the closing slide.");
  if (f.qa) lines.push("- The closing slide invites questions; its notes list three questions the audience is likely to ask, each with a one-line answer.");
  lines.push("");
  lines.push(...houseLines(p.house, p.designNotes));
  lines.push(`LENGTH: exactly ${p.slides} slides including the title and closing slides.`);
  lines.push("Answer only with the JSON the schema asks for.");
  return lines.join("\n");
}

export function userPrompt(p: GenerateParams, sources: { name: string; kind: string; text: string }[], condensed: boolean): string {
  const parts: string[] = [];
  parts.push(`BRIEF:\n${p.prompt.trim()}`);
  if (p.title) parts.push(`DECK TITLE (use it): ${p.title}`);
  if (sources.length) {
    parts.push(`SOURCES (${sources.length}${condensed ? ", condensed to the facts relevant to the brief" : ""}):`);
    for (const s of sources) {
      if (s.kind === "image" && s.text && s.text !== "NONE") parts.push(`### Picture: ${s.name} (its content, transcribed from the picture; cite the file name)\n${s.text}`);
      else if (s.kind === "image") parts.push(`### Picture available: ${s.name}`);
      else parts.push(`### Source: ${s.name} (${s.kind})\n${s.text}`);
    }
  } else {
    parts.push("SOURCES: none provided. Draw on what the brief states. Mark every fact you cannot stand behind with [SAHKAN: <the fact>].");
  }
  return parts.join("\n\n");
}

export function condensePrompt(p: GenerateParams): string {
  return [
    "You extract the material a slide writer will need from one source document.",
    `The deck's brief: ${p.prompt.trim()}`,
    "Return plain text notes, under 900 words: every figure with its unit and period, every date, every clause or entry number, every named product, organisation or study, and any quotation worth using, each with enough context to be cited. Keep the source's own wording for numbers and legal terms. Do not summarise in general terms; list facts. Omit anything irrelevant to the brief.",
    `Write the notes in ${p.lang === "ms" ? "Bahasa Malaysia (Malaysia)" : "English"} but keep quotations in their original language.`,
  ].join("\n");
}

export function rewriteSystem(p: { lang: Lang; angle: string; house?: GenerateParams["house"]; designNotes?: string }): string {
  const angle = angleById(p.angle);
  return [
    ...houseLines(p.house, p.designNotes).filter(Boolean),
    "You revise one slide of a deck. Keep the slide's layout unless the instruction asks for a change. Keep every fact and citation unless the instruction changes it. Keep the schema shape.",
    `ANGLE: ${angle.name}. ${angle.brief}`,
    `LANGUAGE: ${LANG_RULES[p.lang]}`,
    "STYLE: no dashes, no emoji, no exclamation marks, no rhetorical questions as titles. Titles state the point. Bullets under 14 words, at most 6. Banned: " + slopBanList(p.lang).join("; ") + ".",
    "Do not invent facts; use [SAHKAN: <the exact missing fact>] where one is missing.",
    "Answer only with the JSON the schema asks for.",
  ].join("\n");
}
