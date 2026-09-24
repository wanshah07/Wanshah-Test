import type { Deck, Slide } from "./deck.js";

// Phrases and habits that mark text as machine-written. The writer prompt bans
// them; this pass catches what slips through so the editor can show it and
// send the slide back for a rewrite. Auto-fixes are limited to the three
// changes that cannot alter meaning: dashes, emoji, exclamation marks.

export interface SlopHit {
  field: string;
  phrase: string;
  note: string;
}

interface Rule {
  re: RegExp;
  note: string;
}

const EN: Rule[] = [
  { re: /\bdelv(e|es|ing)\b/i, note: "'delve': say what is examined" },
  { re: /\bleverag(e|es|ing)\b/i, note: "'leverage': use, apply" },
  { re: /\bunlock(s|ing)?\b/i, note: "'unlock': say the actual benefit" },
  { re: /\bin today'?s (fast-paced|ever-changing|dynamic|digital|modern)\b/i, note: "scene-setting filler" },
  { re: /\bgame[- ]chang(er|ing)\b/i, note: "'game-changer'" },
  { re: /\bseamless(ly)?\b/i, note: "'seamless'" },
  { re: /\brobust\b/i, note: "'robust': say what it withstands" },
  { re: /\bcutting[- ]edge\b/i, note: "'cutting-edge'" },
  { re: /\bstate[- ]of[- ]the[- ]art\b/i, note: "'state-of-the-art'" },
  { re: /\brevolutioni[sz](e|es|ing)\b/i, note: "'revolutionise'" },
  { re: /\btapestry\b/i, note: "'tapestry'" },
  { re: /\bnavigat(e|es|ing) the\b/i, note: "'navigate the …' metaphor" },
  { re: /\bthe (regulatory|business|digital|competitive|evolving) landscape\b/i, note: "'landscape' metaphor" },
  { re: /\bat the end of the day\b/i, note: "filler" },
  { re: /\bharness(es|ing)?\b/i, note: "'harness'" },
  { re: /\bempower(s|ed|ing|ment)?\b/i, note: "'empower'" },
  { re: /\bholistic\b/i, note: "'holistic'" },
  { re: /\bsynerg(y|ies|istic)\b/i, note: "'synergy'" },
  { re: /\bparadigm\b/i, note: "'paradigm'" },
  { re: /\belevat(e|es|ing)\b/i, note: "'elevate'" },
  { re: /\bjourney\b/i, note: "'journey' as metaphor" },
  { re: /\bit'?s (important|worth|crucial|essential) to (note|remember|mention|highlight)\b/i, note: "throat-clearing" },
  { re: /\blet'?s (dive|delve|jump) in(to)?\b/i, note: "'let's dive in'" },
  { re: /\bin conclusion\b/i, note: "'in conclusion'" },
  { re: /\bnot only\b.{3,80}\bbut also\b/i, note: "'not only … but also'" },
  { re: /\bwhether you('re| are)\b/i, note: "'whether you're a …'" },
  { re: /\bin the realm of\b/i, note: "'in the realm of'" },
  { re: /\ba testament to\b/i, note: "'a testament to'" },
  { re: /\bplays? a (crucial|vital|key|pivotal) role\b/i, note: "'plays a crucial role'" },
  { re: /\bstakeholders?\b/i, note: "'stakeholder': name who" },
  { re: /\bbest practices?\b/i, note: "'best practice': name the practice" },
  { re: /\bensur(e|es|ing) (compliance|success)\b/i, note: "'ensure compliance': say what is done" },
  { re: /\bcomprehensive\b/i, note: "'comprehensive': show it instead" },
  { re: /\bstreamlin(e|es|ed|ing)\b/i, note: "'streamline'" },
  { re: /\bfoster(s|ing)?\b/i, note: "'foster'" },
  { re: /\bunderscore(s|d)?\b/i, note: "'underscore'" },
  { re: /\bmultifaceted\b/i, note: "'multifaceted'" },
  { re: /\bever[- ]evolving\b/i, note: "'ever-evolving'" },
  { re: /\bgroundbreaking\b/i, note: "'groundbreaking'" },
  { re: /\btransformative\b/i, note: "'transformative'" },
  { re: /\bembark(s|ed|ing)? on\b/i, note: "'embark on'" },
  { re: /\bthe power of\b/i, note: "'the power of'" },
  { re: /\bdeep dive\b/i, note: "'deep dive'" },
  { re: /\bkey takeaways?\b/i, note: "'key takeaway': write the takeaway" },
  { re: /\bstay (ahead|tuned)\b/i, note: "'stay ahead'" },
  { re: /\bworld[- ]class\b/i, note: "'world-class'" },
  { re: /\bthrilled\b|\bexcited to\b/i, note: "manufactured enthusiasm" },
];

const MS: Rule[] = [
  { re: /\bdalam (era|dunia|landskap) (yang )?(pesat|moden|digital|dinamik)\b/i, note: "pembukaan kosong" },
  { re: /\bmemperkasa(kan)?\b/i, note: "'memperkasa'" },
  { re: /\bholistik\b/i, note: "'holistik'" },
  { re: /\bsinergi\b/i, note: "'sinergi'" },
  { re: /\bmenavigasi\b/i, note: "'menavigasi'" },
  { re: /\bmengoptimumkan\b/i, note: "'mengoptimumkan': kata apa yang dibuat" },
  { re: /\bperjalanan\b/i, note: "'perjalanan' sebagai metafora" },
  { re: /\badalah penting untuk (diingat|diambil perhatian|dinyatakan)\b/i, note: "pembukaan kosong" },
  { re: /\bkesimpulannya\b/i, note: "'kesimpulannya'" },
  { re: /\bbukan sahaja\b.{3,80}\bmalah\b/i, note: "'bukan sahaja … malah'" },
  { re: /\bmemainkan peranan (penting|utama)\b/i, note: "'memainkan peranan penting'" },
  { re: /\bpemegang taruh\b/i, note: "'pemegang taruh': namakan siapa" },
  { re: /\bamalan terbaik\b/i, note: "'amalan terbaik': namakan amalannya" },
  { re: /\bkomprehensif\b/i, note: "'komprehensif'" },
  { re: /\btransformatif\b/i, note: "'transformatif'" },
  { re: /\brevolusioner\b/i, note: "'revolusioner'" },
  { re: /\bmenyelami\b/i, note: "'menyelami'" },
  { re: /\bsecara mendalam\b/i, note: "'secara mendalam'" },
  { re: /\bmantap\b/i, note: "'mantap'" },
  { re: /\bpelbagai aspek\b/i, note: "'pelbagai aspek': senaraikan" },
  { re: /\bteruja\b/i, note: "keterujaan buatan" },
];

// Indonesian forms that must never appear in Malaysian text.
const INDONESIAN: Rule[] = [
  { re: /\bbisa\b/i, note: "Bahasa Indonesia: 'bisa' → 'boleh'" },
  { re: /\bobat\b/i, note: "Bahasa Indonesia: 'obat' → 'ubat'" },
  { re: /\bperusahaan\b/i, note: "Bahasa Indonesia: 'perusahaan' → 'syarikat'" },
  { re: /kualitas\b/i, note: "Bahasa Indonesia: 'kualitas' → 'kualiti'" },
  { re: /\bkemasan\b/i, note: "Bahasa Indonesia: 'kemasan' → 'pembungkusan'" },
  { re: /\bkarena\b/i, note: "Bahasa Indonesia: 'karena' → 'kerana'" },
  { re: /\bbutuh\b/i, note: "Bahasa Indonesia: 'butuh' → 'perlu'" },
  { re: /\bsaat ini\b/i, note: "Bahasa Indonesia: 'saat ini' → 'kini / sekarang'" },
  { re: /\bpihak berwenang\b/i, note: "Bahasa Indonesia: 'berwenang' → 'berkuasa'" },
  { re: /\bproduk kosmetika\b/i, note: "Bahasa Indonesia: 'kosmetika' → 'kosmetik'" },
];

const COMMON: Rule[] = [
  { re: /[—–]/, note: "dash: use a comma, colon or full stop" },
  { re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, note: "emoji" },
  { re: /!\s*$|!\s/, note: "exclamation mark" },
  { re: /\.{3}|…/, note: "ellipsis" },
];

const TITLE_RULES: Rule[] = [{ re: /\?\s*$/, note: "rhetorical question as a title" }];

export function scanText(text: string, field: string, lang: "en" | "ms", isTitle = false): SlopHit[] {
  if (!text) return [];
  const hits: SlopHit[] = [];
  const rules = [...COMMON, ...(lang === "ms" ? [...MS, ...INDONESIAN] : EN)];
  if (isTitle) rules.push(...TITLE_RULES);
  for (const r of rules) {
    const m = text.match(r.re);
    if (m) hits.push({ field, phrase: m[0].trim() || m[0], note: r.note });
  }
  // Three adjectives in a row before a noun read as padding.
  const triplet = text.match(/\b(\w+), (\w+),? and (\w+) (approach|solution|framework|strategy|system|process)\b/i);
  if (triplet) hits.push({ field, phrase: triplet[0], note: "adjective triplet" });
  return hits;
}

export function scanSlide(slide: Slide, lang: "en" | "ms"): SlopHit[] {
  const hits: SlopHit[] = [];
  hits.push(...scanText(slide.title, "title", lang, true));
  if (slide.subtitle) hits.push(...scanText(slide.subtitle, "subtitle", lang));
  if (slide.body) hits.push(...scanText(slide.body, "body", lang));
  (slide.bullets ?? []).forEach((b, i) => hits.push(...scanText(b, `bullets[${i}]`, lang)));
  (slide.bulletsRight ?? []).forEach((b, i) => hits.push(...scanText(b, `bulletsRight[${i}]`, lang)));
  if (slide.quote?.text) hits.push(...scanText(slide.quote.text, "quote", lang));
  if (slide.notes) hits.push(...scanText(slide.notes, "notes", lang));
  (slide.kpi ?? []).forEach((k, i) => {
    hits.push(...scanText(k.label, `kpi[${i}].label`, lang));
    if (k.note) hits.push(...scanText(k.note, `kpi[${i}].note`, lang));
  });
  if (slide.diagram?.kind === "flow") slide.diagram.steps.forEach((s, i) => hits.push(...scanText(s.label + " " + (s.detail ?? ""), `diagram.steps[${i}]`, lang)));
  return hits;
}

export function scanDeck(deck: Deck): Record<string, SlopHit[]> {
  const out: Record<string, SlopHit[]> = {};
  for (const s of deck.slides) {
    const h = scanSlide(s, deck.lang);
    if (h.length) out[s.id] = h;
  }
  return out;
}

/** The three fixes that cannot change meaning. Everything else is flagged, not rewritten. */
export function autoFix(text: string, isTitle = false): string {
  let t = text;
  t = t.replace(/\s*[—–]\s*/g, ", ");
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️]/gu, "");
  t = t.replace(/!+/g, ".");
  t = t.replace(/\s+([.,;:])/g, "$1").replace(/,\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
  if (isTitle) t = t.replace(/[.]+$/, "");
  return t;
}

export function autoFixSlide(slide: Slide): Slide {
  const s: Slide = JSON.parse(JSON.stringify(slide));
  s.title = autoFix(s.title, true);
  if (s.subtitle) s.subtitle = autoFix(s.subtitle, true);
  if (s.body) s.body = autoFix(s.body);
  if (s.bullets) s.bullets = s.bullets.map((b) => autoFix(b));
  if (s.bulletsRight) s.bulletsRight = s.bulletsRight.map((b) => autoFix(b));
  if (s.quote) s.quote.text = autoFix(s.quote.text);
  if (s.notes) s.notes = autoFix(s.notes);
  if (s.leftHeading) s.leftHeading = autoFix(s.leftHeading, true);
  if (s.rightHeading) s.rightHeading = autoFix(s.rightHeading, true);
  if (s.kpi) s.kpi = s.kpi.map((k) => ({ ...k, label: autoFix(k.label, true), note: k.note ? autoFix(k.note) : undefined }));
  return s;
}

/** Unresolved fact markers. The writer leaves one when the sources do not carry a fact. */
export const SAHKAN_RE = /\[SAHKAN:[^\]]*\]/g;

export function sahkanCount(deck: Deck): number {
  const text = JSON.stringify(deck.slides);
  return (text.match(SAHKAN_RE) ?? []).length;
}

/** The rule list as prose, for the writer prompt. */
export function slopBanList(lang: "en" | "ms"): string[] {
  const src = lang === "ms" ? [...MS, ...INDONESIAN] : EN;
  return src.map((r) => r.note.replace(/^'|'.*$/g, "")).filter((s) => s && !s.includes(":"));
}
