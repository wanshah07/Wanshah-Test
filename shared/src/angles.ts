import type { Lang } from "./deck.js";

export interface Angle {
  id: string;
  name: string;
  hat: string;
  /** One sentence the wizard shows. */
  summary: string;
  /** The brief the writer receives. */
  brief: string;
  /** Which features are on by default for this angle. */
  defaults: Partial<Features>;
  skeleton: string[];
}

export interface Features {
  charts: boolean;
  tables: boolean;
  diagrams: boolean;
  kpis: boolean;
  images: boolean;
  notes: boolean;
  citations: boolean;
  sections: boolean;
  summary: boolean;
  qa: boolean;
}

export const DEFAULT_FEATURES: Features = {
  charts: true,
  tables: true,
  diagrams: true,
  kpis: false,
  images: false,
  notes: true,
  citations: true,
  sections: true,
  summary: true,
  qa: false,
};

export const FEATURE_LABELS: Record<keyof Features, { label: string; help: string }> = {
  charts: { label: "Charts", help: "Column, bar, line, area, pie or doughnut, drawn from numbers in the sources. Native charts in PPTX." },
  tables: { label: "Tables", help: "Comparison and requirement tables." },
  diagrams: { label: "Diagrams", help: "Process flows, timelines and matrices as vector shapes." },
  kpis: { label: "KPI tiles", help: "Three to four headline figures on one slide." },
  images: { label: "Figures and images", help: "Place uploaded pictures, or generate one per marked slide with the image model." },
  notes: { label: "Speaker notes", help: "What to say on each slide. Exported into PPTX notes." },
  citations: { label: "Citations", help: "Instrument, clause, paper or dataset under each slide that states a fact." },
  sections: { label: "Section dividers", help: "A divider slide before each part of the deck." },
  summary: { label: "Summary slide", help: "One slide that restates the decisions or takeaways." },
  qa: { label: "Q&A slide", help: "A closing prompt for questions with three likely ones in the notes." },
};

export const ANGLES: Angle[] = [
  {
    id: "regulatory-briefing",
    name: "Regulatory briefing",
    hat: "In-house RA",
    summary: "Decision-ready. What changed, what it means for our products, what we do by when.",
    brief:
      "The audience is management and product teams who need a decision. Lead with the decision required. State the instrument, the clause, the effective date and the transition period exactly as the source gives them. Separate what is mandatory from what is our recommendation. End with actions, owners and dates.",
    defaults: { tables: true, diagrams: true, kpis: false, citations: true, summary: true },
    skeleton: ["Decision required", "What changed", "Scope and dates", "Impact on our products", "Options", "Recommendation", "Actions and owners"],
  },
  {
    id: "client-proposal",
    name: "Client proposal",
    hat: "Consultant",
    summary: "Defensible and client-facing. Their problem, the pathway, the deliverables, the fee logic.",
    brief:
      "The audience is a client deciding whether to engage. State their situation in their words, then the regulatory pathway with the instrument named at each step, then deliverables and timeline. Every claim of a requirement cites where it comes from. No selling language: the evidence does the selling.",
    defaults: { tables: true, diagrams: true, citations: true, summary: true },
    skeleton: ["Your situation", "The pathway", "What we deliver", "Timeline", "What you provide", "Fees and terms", "Next step"],
  },
  {
    id: "training",
    name: "Training / workshop",
    hat: "Trainer",
    summary: "Teachable and structured. Objectives, concepts in order, worked examples, a check at the end.",
    brief:
      "The audience is learning this for the first time or refreshing. Open with learning objectives. Build one concept per slide in the order a learner needs them. Use a worked example after each concept. Close with a recap and three check questions in the notes. Plain words first, technical terms introduced once and then used consistently.",
    defaults: { diagrams: true, tables: true, notes: true, summary: true, qa: true },
    skeleton: ["Objectives", "Why it matters", "Concepts", "Worked examples", "Common mistakes", "Recap", "Check your understanding"],
  },
  {
    id: "medical-affairs",
    name: "Medical affairs / HCP education",
    hat: "Medical affairs",
    summary: "HCP-grade. Mechanism, evidence with study design and n, limitations stated, fully referenced.",
    brief:
      "The audience is clinicians. Present mechanism, then evidence. For every study give design, n, key finding and its limitation. Grade the evidence honestly. Never overstate an in-vitro result as clinical. Every slide with a finding carries the reference in author, journal, year, DOI form.",
    defaults: { charts: true, tables: true, citations: true, notes: true, summary: true },
    skeleton: ["Clinical question", "Mechanism", "Evidence", "Safety", "Limitations", "Where it fits in practice", "References"],
  },
  {
    id: "brand-pitch",
    name: "Commercial / brand pitch",
    hat: "Brand owner",
    summary: "Commercial lens. Market, proposition, proof, numbers, the ask.",
    brief:
      "The audience is a buyer, distributor or investor. Lead with the proposition in one line. Show the market with a number and its source. Show proof: tests, certifications, traction. Show the commercial terms. Keep claims within what the evidence and the regulator allow.",
    defaults: { charts: true, kpis: true, images: true, tables: true, summary: true },
    skeleton: ["The proposition", "Market", "Product and proof", "Traction", "Commercials", "The ask"],
  },
  {
    id: "conference-talk",
    name: "Conference talk",
    hat: "Speaker",
    summary: "One idea, a narrative arc, few words per slide, references at the end.",
    brief:
      "The audience is peers in a hall. One idea per slide, under 20 words on most slides, the speaker notes carry the argument. Open with the problem, build to the finding, close with what it changes. References on a final slide.",
    defaults: { charts: true, images: true, notes: true, citations: true, sections: true },
    skeleton: ["The problem", "What we did", "What we found", "What it changes", "References"],
  },
  {
    id: "internal-update",
    name: "Internal status update",
    hat: "Team lead",
    summary: "Progress, blockers, decisions needed, next steps. Short.",
    brief:
      "The audience is the team and its manager. Status first: on track, at risk or blocked, with the reason. Then what was done, what is next, what needs a decision. Numbers where they exist. No narrative.",
    defaults: { kpis: true, tables: true, summary: false, sections: false },
    skeleton: ["Status", "Done", "Next", "Blockers", "Decisions needed"],
  },
  {
    id: "custom",
    name: "Custom",
    hat: "You decide",
    summary: "No preset structure. Your prompt sets the angle.",
    brief: "Follow the user's prompt for tone, audience and structure.",
    defaults: {},
    skeleton: [],
  },
];

export function angleById(id: string): Angle {
  return ANGLES.find((a) => a.id === id) ?? ANGLES[ANGLES.length - 1];
}

export const LANG_LABELS: Record<Lang, string> = { en: "English", ms: "Bahasa Malaysia" };

export const LENGTH_CHOICES = [
  { slides: 6, label: "Short (6)" },
  { slides: 10, label: "Standard (10)" },
  { slides: 15, label: "Full (15)" },
  { slides: 22, label: "Long (22)" },
];
