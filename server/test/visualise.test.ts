import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURES, type Slide } from "@slidecraft/shared";
import { VISUAL, visualise } from "../src/llm/visualise.js";

// What a writer that ignores the balance rule sends: every content slide as
// bullets. The pass redraws them from their own words; it never invents.

const f = { ...DEFAULT_FEATURES, kpis: true, diagrams: true };
const b = (title: string, bullets: string[]): Slide => ({ id: title, layout: "bullets", title, bullets });

function textDeck(): Slide[] {
  return [
    { id: "t", layout: "title", title: "FACERINNA B5 UKM: Clinical Evidence" },
    b("Results at week 4", ["32% less redness", "18% more hydration", "92% of subjects saw calmer skin"]),
    b("How the study ran", ["1. Screening of 30 volunteers", "2. Baseline skin measurements", "3. Twice-daily application for 4 weeks", "4. Final measurements and survey"]),
    b("Why B5 works", ["Panthenol: converts to pantothenic acid in the skin", "Barrier: supports lipid synthesis", "Water: holds moisture in the outer layer"]),
    b("Who it suits", ["Sensitive skin", "After procedures", "Dry, tight skin"]),
    b("What the study cannot say", ["It was open-label with no placebo arm, so expectation effects cannot be ruled out", "Thirty volunteers from one site are not enough to generalise to every skin type"]),
    { id: "c", layout: "closing", title: "Thank you" },
  ];
}

describe("redrawing a text-only deck as visuals", () => {
  it("turns figures into tiles, numbered steps into a flow and labelled points into cards", () => {
    const deck = textDeck();
    const n = visualise(deck, f);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(deck[1].layout).toBe("kpi");
    expect(deck[1].kpi).toEqual([
      { label: "less redness", value: "32%" },
      { label: "more hydration", value: "18%" },
      { label: "of subjects saw calmer skin", value: "92%" },
    ]);
    expect(deck[2].layout).toBe("diagram");
    expect(deck[2].diagram).toMatchObject({ kind: "flow", steps: [{ label: "Screening of 30 volunteers" }, { label: "Baseline skin measurements" }, { label: "Twice-daily application for 4 weeks" }, { label: "Final measurements and survey" }] });
    expect(deck[3].layout).toBe("cards");
    expect(deck[3].cards![0]).toEqual({ heading: "Panthenol", detail: "converts to pantothenic acid in the skin" });
    expect(deck[1].bullets).toBeUndefined();
  });

  it("leaves long reasoning as text rather than chopping it into tiles", () => {
    const deck = textDeck();
    visualise(deck, f);
    expect(deck[5].layout).toBe("bullets");
    expect(deck[5].bullets).toHaveLength(2);
  });

  it("reaches half the content slides visual when the words allow it", () => {
    const deck = textDeck();
    visualise(deck, f);
    const content = deck.filter((s) => !["title", "section", "closing"].includes(s.layout));
    expect(content.filter((s) => VISUAL.has(s.layout)).length * 2).toBeGreaterThanOrEqual(content.length - 1);
  });

  it("never draws what the deck's features forbid", () => {
    const deck = textDeck();
    visualise(deck, { ...f, kpis: false, diagrams: false });
    expect(deck.some((s) => s.layout === "kpi" || s.layout === "diagram")).toBe(false);
  });

  it("keeps every point: tiles only when every bullet carries its own figure", () => {
    const deck = [b("Mixed", ["32% less redness", "Gentle on skin", "92% would use again"]), b("x", ["a b", "c d", "e f"]), b("y", ["g h", "i j", "k l"])];
    visualise(deck, f);
    expect(deck[0].layout).not.toBe("kpi");
    const kept = deck[0].bullets ?? deck[0].cards?.map((c) => c.heading) ?? [];
    expect(kept).toHaveLength(3);
  });

  it("leaves a deck that is already balanced alone", () => {
    const deck: Slide[] = [
      { id: "k", layout: "kpi", title: "Numbers", kpi: [{ label: "a", value: "1" }, { label: "b", value: "2" }] },
      b("Points", ["one", "two", "three"]),
    ];
    expect(visualise(deck, f)).toBe(0);
    expect(deck[1].layout).toBe("bullets");
  });
});
