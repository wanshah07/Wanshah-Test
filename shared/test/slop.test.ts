import { describe, it, expect } from "vitest";
import { scanText, autoFix, scanSlide, autoFixSlide, faceWords, FACE_WORDS_MAX } from "../src/slop.js";
import type { Slide } from "../src/deck.js";

describe("slop scanner", () => {
  it("flags English clichés", () => {
    const hits = scanText("In today's fast-paced world we leverage synergy to unlock value.", "body", "en");
    const notes = hits.map((h) => h.note);
    expect(notes.some((n) => n.includes("leverage"))).toBe(true);
    expect(notes.some((n) => n.includes("unlock"))).toBe(true);
    expect(notes.some((n) => n.includes("synergy"))).toBe(true);
    expect(notes.some((n) => n.includes("scene-setting"))).toBe(true);
  });
  it("flags Indonesian vocabulary in Malaysian text", () => {
    const hits = scanText("Syarikat bisa memohon kerana obat ini berkualitas.", "body", "ms");
    expect(hits.map((h) => h.phrase.toLowerCase())).toEqual(expect.arrayContaining(["bisa", "obat", "kualitas"]));
  });
  it("does not flag plain regulatory prose", () => {
    const hits = scanText("Annex III entry 325 limits salicylic acid to 2% in rinse-off products.", "body", "en");
    expect(hits).toEqual([]);
    const ms = scanText("Notifikasi kosmetik perlu dibuat sebelum produk dipasarkan.", "body", "ms");
    expect(ms).toEqual([]);
  });
  it("flags dashes, emoji and exclamation marks in either language", () => {
    expect(scanText("Wajib — tiada pengecualian", "body", "ms").length).toBe(1);
    expect(scanText("Great news 🎉", "body", "en").some((h) => h.note === "emoji")).toBe(true);
    expect(scanText("Act now!", "body", "en").some((h) => h.note === "exclamation mark")).toBe(true);
  });
  it("flags a question as a title but not in a bullet", () => {
    expect(scanText("Is it safe?", "title", "en", true).some((h) => h.note.includes("rhetorical"))).toBe(true);
    expect(scanText("Is it safe?", "bullets[0]", "en").length).toBe(0);
  });
});

describe("autoFix", () => {
  it("replaces dashes, strips emoji and exclamation marks and nothing else", () => {
    expect(autoFix("Wajib — tiada pengecualian 🎉!")).toBe("Wajib, tiada pengecualian.");
    expect(autoFix("Leverage synergy")).toBe("Leverage synergy");
  });
  it("removes a trailing full stop from a title", () => {
    expect(autoFix("Scope and dates!", true)).toBe("Scope and dates");
  });
  it("fixes every text field of a slide", () => {
    const s: Slide = { id: "a", layout: "two-column", title: "A — B", bullets: ["x — y"], bulletsRight: ["p — q"], notes: "n — m", kpi: [{ label: "L — M", value: "1" }] };
    const f = autoFixSlide(s);
    expect(f.title).toBe("A, B");
    expect(f.bullets).toEqual(["x, y"]);
    expect(f.bulletsRight).toEqual(["p, q"]);
    expect(f.notes).toBe("n, m");
    expect(f.kpi?.[0].label).toBe("L, M");
  });
});

describe("scanSlide", () => {
  it("flags a slide with too much text on its face, and ignores the notes", () => {
    const long = Array.from({ length: 20 }, (_, i) => `point ${i} with a few more words`);
    const s: Slide = { id: "a", layout: "bullets", title: "Many", bullets: long, notes: "word ".repeat(500) };
    expect(faceWords(s)).toBeGreaterThan(FACE_WORDS_MAX);
    expect(scanSlide(s, "en").some((h) => h.field === "slide" && /too much text/.test(h.note))).toBe(true);
    const short: Slide = { id: "b", layout: "bullets", title: "Few", bullets: ["one point"], notes: "word ".repeat(500) };
    expect(scanSlide(short, "en").some((h) => h.field === "slide")).toBe(false);
  });

  it("names the field", () => {
    const s: Slide = { id: "a", layout: "bullets", title: "Fine", bullets: ["ok", "we delve deep"] };
    const hits = scanSlide(s, "en");
    expect(hits[0].field).toBe("bullets[1]");
  });
});
