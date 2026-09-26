import { describe, expect, it } from "vitest";
import { cleanBrief, composeAudience, composeBrief } from "../src/brief.js";

describe("tick-box brief", () => {
  it("turns ticks into writer lines, with typed text after them", () => {
    const b = composeBrief({ purposes: ["reg-change"], include: ["dates"], text: "Our toner has 2% salicylic acid." });
    expect(b).toBe("- Explain what the regulation or guideline changes, from when, and who it affects.\n- Give every effective date, transition period and deadline, with its source.\n\nOur toner has 2% salicylic acid.");
  });
  it("is just the typed text when nothing is ticked", () => {
    expect(composeBrief({ purposes: [], include: [], text: "  plain brief  " })).toBe("plain brief");
  });
  it("joins ticked audiences and typed ones", () => {
    expect(composeAudience(["hcp", "management"], "KOL dermatologists")).toBe("healthcare professionals; senior management; KOL dermatologists");
    expect(composeAudience([], "")).toBe("");
  });
  it("keeps only known ids when stored", () => {
    const c = cleanBrief({ purposes: ["reg-change", "<script>"], include: ["nope"], audiences: ["hcp"], text: 5 as unknown as string, imageMode: "bogus" as never, features: { images: true, x: "y" as unknown as boolean } });
    expect(c).toEqual({ text: "", purposes: ["reg-change"], include: [], audiences: ["hcp"], slides: undefined, imageMode: undefined, features: { images: true } });
  });
});
