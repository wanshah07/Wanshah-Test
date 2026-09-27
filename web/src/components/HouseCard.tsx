import { useEffect, useState } from "react";
import { api, type HouseRules } from "../api";
import { toast } from "./Toast";

// The instructions every deck is written and designed with. The facts and
// sources rules always come first and cannot be overridden from here.
export function HouseCard() {
  const [h, setH] = useState<HouseRules | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
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
        {changed && <button className="btn btn-quiet" onClick={() => setText(h.text)} disabled={busy}>Undo changes</button>}
        {h.custom && <button className="btn btn-ghost" onClick={() => save(null)} disabled={busy}>Reset to the built-in rules</button>}
      </div>
    </section>
  );
}
