import type { DeckBrief } from "./deck.js";

// Tick-box choices for the brief. Each id maps to the line the writer reads,
// so a user can brief a deck without typing and still give the writer
// concrete instructions. Free text is added after the ticked lines.

export interface BriefChoice {
  id: string;
  label: string;
  line: string;
}

export const BRIEF_PURPOSES: BriefChoice[] = [
  { id: "reg-change", label: "Explain a regulation change", line: "Explain what the regulation or guideline changes, from when, and who it affects." },
  { id: "compliance", label: "Check a product's compliance", line: "Assess whether the product in the sources complies, name each gap and the fix." },
  { id: "registration", label: "Walk through a registration", line: "Walk through the registration or notification pathway step by step, with who does what." },
  { id: "training", label: "Train a team", line: "Teach the audience the procedure so they can do it themselves, with worked examples." },
  { id: "pitch", label: "Pitch a product or service", line: "Make the commercial case for the product or service, grounded in what the sources support." },
  { id: "evidence", label: "Present study evidence", line: "Present the study evidence: design, population, results with numbers, and limitations." },
  { id: "update", label: "Update management", line: "Report status to management: what is done, what is blocked, decisions needed." },
  { id: "proposal", label: "Propose to a client", line: "Propose scope, approach, timeline and deliverables to a client." },
];

export const BRIEF_INCLUDES: BriefChoice[] = [
  { id: "dates", label: "Dates and deadlines", line: "Give every effective date, transition period and deadline, with its source." },
  { id: "checklist", label: "Action checklist", line: "End the body with a checklist of concrete actions and owners." },
  { id: "fees", label: "Fees and costs", line: "State fees and costs only where a source gives them." },
  { id: "penalties", label: "Risks and penalties", line: "Name the risks of non-compliance and the penalty provisions, with the clause." },
  { id: "compare", label: "Comparison table", line: "Include a comparison table (for example before and after, or country by country)." },
  { id: "cases", label: "Real cases", line: "Include real enforcement or product cases from the sources as examples." },
  { id: "claims", label: "Claims do's and don'ts", line: "Show which claims are allowed and which are not, with compliant rewrites." },
  { id: "timeline", label: "Timeline", line: "Show the sequence as a timeline." },
];

export const BRIEF_AUDIENCES: BriefChoice[] = [
  { id: "brand-owner", label: "Brand owner", line: "brand owners and founders" },
  { id: "product-team", label: "Product and marketing team", line: "product and marketing teams" },
  { id: "ra-qa", label: "Regulatory and QA team", line: "regulatory and QA staff" },
  { id: "hcp", label: "Doctors and pharmacists", line: "healthcare professionals" },
  { id: "trade", label: "Distributors and retailers", line: "distributors and retailers" },
  { id: "authority", label: "Authority officers", line: "authority officers" },
  { id: "management", label: "Management", line: "senior management" },
  { id: "students", label: "Students and trainees", line: "students and trainees" },
  { id: "public", label: "General public", line: "the general public, with no technical background" },
];

function pick(list: BriefChoice[], ids: string[]): BriefChoice[] {
  return list.filter((c) => ids.includes(c.id));
}

/** Keeps only known ids, so a stored brief never carries arbitrary strings. */
export function cleanBrief(raw: Partial<DeckBrief> | undefined | null): DeckBrief {
  const ids = (v: unknown, list: BriefChoice[]) => (Array.isArray(v) ? list.map((c) => c.id).filter((id) => v.includes(id)) : []);
  const b = raw ?? {};
  return {
    text: typeof b.text === "string" ? b.text.slice(0, 20000) : "",
    purposes: ids(b.purposes, BRIEF_PURPOSES),
    include: ids(b.include, BRIEF_INCLUDES),
    audiences: ids(b.audiences, BRIEF_AUDIENCES),
    prompts: Array.isArray(b.prompts) ? b.prompts.filter((x): x is string => typeof x === "string" && /^p_[a-z0-9]{4,40}$/.test(x)).slice(0, 30) : undefined,
    slides: typeof b.slides === "number" ? b.slides : undefined,
    imageMode: b.imageMode === "none" || b.imageMode === "uploaded" || b.imageMode === "generate" ? b.imageMode : undefined,
    features: b.features && typeof b.features === "object" ? Object.fromEntries(Object.entries(b.features).filter(([, v]) => typeof v === "boolean")) : undefined,
    auto: b.auto === true ? true : undefined,
  };
}

/** The brief the writer reads: ticked purposes and must-haves as lines, then the typed text. */
export function composeBrief(b: Pick<DeckBrief, "text" | "purposes" | "include">): string {
  const lines = [...pick(BRIEF_PURPOSES, b.purposes), ...pick(BRIEF_INCLUDES, b.include)].map((c) => `- ${c.line}`);
  const text = b.text.trim();
  if (!lines.length) return text;
  return [lines.join("\n"), text].filter(Boolean).join("\n\n");
}

/** The audience line: ticked groups, then anything typed. */
export function composeAudience(audiences: string[], typed: string): string {
  const parts = pick(BRIEF_AUDIENCES, audiences).map((c) => c.line);
  if (typed.trim()) parts.push(typed.trim());
  return parts.join("; ");
}
