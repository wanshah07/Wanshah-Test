import { useEffect, useRef, useState } from "react";
import { DECK_SKILL_TEXT, skillFileText } from "@slidecraft/shared";
import { api, type HouseRules } from "../api";
import { toast } from "./Toast";

// The instructions every deck is written and designed with. The facts and
// sources rules always come first and cannot be overridden from here.
export function HouseCard() {
  const [h, setH] = useState<HouseRules | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSkill, setShowSkill] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api.house().then((r) => {
      setH(r);
      setText(r.text);
    }).catch(() => {});
  }, []);
  if (!h) return null;

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      const r = await api.saveHouse(value);
      setH(r);
      setText(r.text);
      toast(r.custom ? "Instructions saved. They apply to every new deck and every rewrite." : "Back to the built-in rules");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // A skill file (a SKILL.md) goes into the box, without its front matter, for the person to check and Save.
  const importSkill = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return toast("That file is too large for instructions. Pick a skill file under 1 MB.");
    const body = skillFileText(await f.text());
    if (!body) return toast("That file has no instructions in it.");
    // Added after what is in the box, so the rules already in force stay; the limit below says if it is too long.
    const next = text.trim() ? `${text.trim()}\n\n${body}` : body;
    setText(next);
    toast(`${f.name} is in the box. Check it, then press Save.`);
  };
  const over = text.length > h.max;
  const changed = text !== h.text;

  return (
    <section className="card stack">
      <h2>Instructions for every deck</h2>
      <p className="small">
        The system prompt every deck is written, designed and rewritten with: how slides look, how they read, what a deck always carries. The rules on facts and sources always come first, so nothing here can make the writer invent a figure or drop a citation.
      </p>
      <label className="f">
        Instructions{" "}
        <span className="h">
          {h.custom ? "Your own text is in force." : "The built-in rules are in force; edit them to make them yours."} {text.length.toLocaleString("en")} / {h.max.toLocaleString("en")} characters.
        </span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} style={{ fontFamily: "var(--mono, monospace)", fontSize: 13 }} spellCheck={false} />
      </label>
      {over && <div className="banner danger">Over the limit by {(text.length - h.max).toLocaleString("en")} characters.</div>}
      <div className="row">
        <button className="btn btn-primary" onClick={() => save(text)} disabled={busy || over || !changed}>Save</button>
        <button className="btn btn-ghost" onClick={() => file.current?.click()} disabled={busy} title="Load a skill file (.md or .txt) into the box. Its front matter is dropped.">Import skill file</button>
        <input ref={file} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden data-testid="skill-file" onChange={(e) => { void importSkill(e.target.files?.[0]); e.target.value = ""; }} />
        {changed && <button className="btn btn-quiet" onClick={() => setText(h.text)} disabled={busy}>Undo changes</button>}
        {h.custom && <button className="btn btn-ghost" onClick={() => save(null)} disabled={busy}>Reset to the built-in rules</button>}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>Deck skill (built in, always on)</b>
          <button type="button" className="btn btn-quiet btn-xs" onClick={() => setShowSkill(!showSkill)}>{showSkill ? "Hide" : "Show"}</button>
        </div>
        <span className="small muted">Wan's deck-builder style, followed by every deck after the instructions above: the slide archetypes, footnotes with report ID, n, design and duration, published sources only in the references list, the claims guardrail, the cosmetic and drug border check, and no safety verdict written for you. Where your instructions say otherwise, yours win.</span>
        {showSkill && <pre className="small" data-testid="deck-skill" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--mono, monospace)", fontSize: 12, margin: 0 }}>{DECK_SKILL_TEXT}</pre>}
      </div>
    </section>
  );
}
