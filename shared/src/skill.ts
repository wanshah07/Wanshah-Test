// The deck skill: the parts of Wan's deck-builder skill that decide what goes on a slide, built into
// every deck's instructions. Its rendering half (HTML backgrounds, pptxgenjs, fonts, the grid) is
// Slidecraft's renderer and themes, so only the writing half is here: the archetypes, how evidence
// and sources are footnoted, the claims guardrail, the cosmetic and drug border, and who signs off.
// Shared so the Settings page can show the exact text the writer reads.

/** The line that frames the skill in every prompt; FACTS AND SOURCES and the person's own house rules outrank it. */
export const DECK_SKILL_HEADER =
  "DECK SKILL (Wan's deck-builder house style, built in; FACTS AND SOURCES outrank it, and where the HOUSE DESIGN SYSTEM above says otherwise, the house design system wins):";

export const DECK_SKILL: string[] = [
  "- Read the BRIEF for the audience (KOL or HCP, marketing, trainees, regulator or client, consumer), the brand and the length. The audience sets the register and how much mechanism goes in. A spoken deck runs about 1.5 minutes a slide: a 30 minute talk is 14 to 18 slides.",
  "- Vary the archetypes, never the same one twice in a row: stat trio (kpi, three big numbers with a one-line label each); journey rail (diagram timeline, 4 milestones with a date under each); icon grid (cards, 4 or 5 categories); mechanism (diagram hub or flow, a one-line kicker and nothing else); two-column concept; before and after (two-column, the verdict in plain words in callout); numbered points (cards, at most 4); balanced view (two-column, the honest caveat on the left, the evidence on the right); chart with a one-line read-out; headline KPIs (kpi, each with metric, timepoint and product); routine strip (diagram flow of numbered steps); closing recap (the closing slide with 4 takeaways).",
  "- Every number, study result or regulatory position carries its source, in `citations` or the chart, table or map source, in these forms. An internal or unpublished test report: 'Cosmetic Efficacy Evaluation Report, <lab>, <product> (<report ID>, n=<n>, <duration> <design>). Data on file.' Published literature: '<First author> et al. <Year>. <Full article title>. <Journal> <vol>(<issue>):<pages>. doi:<doi>', always with the article title, never author and year alone. A regulatory instrument: 'NPRA, Guidelines for Control of Cosmetic Products in Malaysia, Annex <n> Part <n>, entry <n> (<revision date>)'. Fill only the parts the sources give: never invent a report ID, an n, a page or a date.",
  "- Regulatory sources in this order: NPRA, then the ASEAN Cosmetic Directive, then EC 1223/2009 and the SCCS, then ECHA. Name the market on every regulatory figure: an EU limit on a Malaysian slide without its jurisdiction misleads.",
  "- The references slide lists only published sources, numbered in the order they first appear. Unpublished internal reports stay in the slide citations and never appear in the references list.",
  "- Study data shows its weight: n, design and duration with every result. Self-controlled, open-label or single-arm data is presented as what it is; never lay it out as if there were a comparator that did not exist.",
  "- An evidence deck has one balanced-view slide that says plainly what the data does not yet show: small n, short duration, one formula, in vitro only. A literature review slide is a table with the columns Citation, Quartile or JIF, Study type, n, Key finding, Limitations, strongest evidence first.",
  "- Claims: do not judge or rewrite marketing claims against regulations unless the BRIEF asks for it. When it does, give each claim both forms on a two-column slide, leftHeading 'Compliant marketing hook' and rightHeading 'Plain safe phrase'. Wording that draws a regulator's attention: repairs, regenerates, heals, treats, anti-inflammatory, clinically proven without the study, dermatologist approved without the panel, and any percentage without its n.",
  "- Cosmetic and drug border: when the deck touches fluoride, hydroquinone, retinoids, high-strength AHAs, antiperspirant actives, antiseptics, anti-dandruff, medicated toothpaste, therapeutic sunscreen positioning or scalp treatments, say so on the caveat slide and in that slide's notes: the point needs a cross-check against the current DRGD before the deck ships.",
  "- Safety conclusions, notifiability calls and sign-off statements belong to the presenter: state plainly what the data supports and stop there. Never write the verdict or a sign-off line.",
];

export const DECK_SKILL_TEXT = DECK_SKILL.join("\n");

/** The skill as one block for a system prompt. */
export function deckSkillBlock(): string {
  return `${DECK_SKILL_HEADER}\n${DECK_SKILL_TEXT}`;
}

/**
 * The instructions in a skill file a person imports (a SKILL.md): the YAML front matter that names
 * and describes the skill for a tool is dropped, and what follows is the text the writer reads.
 */
export function skillFileText(raw: string): string {
  const t = String(raw ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const body = /^---\n[\s\S]*?\n---\n?/.test(t) ? t.replace(/^---\n[\s\S]*?\n---\n?/, "") : t;
  return body.trim();
}
