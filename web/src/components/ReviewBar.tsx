import { useEffect, useState } from "react";
import { pendingFeedback, type Slide, type SlopHit } from "@slidecraft/shared";
import { api } from "../api";
import { toast } from "./Toast";

// Under the slide: sign it off with OK, or say what should change and either
// have the writer apply it now or keep it for later. Feedback can be added to
// a slide that was already OK; that reopens it.

export function ReviewBar({ deckId, slide, index, beforeCall, onSlide }: { deckId: string; slide: Slide; index: number; beforeCall: () => Promise<void>; onSlide: (s: Slide, slop: SlopHit[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "apply" | "save" | "ok">("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setText("");
    setOpen(false);
  }, [slide.id]);
  const ok = !!slide.review?.ok;
  const waiting = pendingFeedback(slide);
  const history = slide.review?.feedback ?? [];
  const call = async (kind: "apply" | "save" | "ok", fn: () => Promise<{ slide: Slide; slop: SlopHit[] }>, done: string) => {
    setBusy(kind);
    try {
      await beforeCall();
      const r = await fn();
      onSlide(r.slide, r.slop);
      setText("");
      toast(done);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };
  const showForm = !ok || open;
  return (
    <div className={"card tight stack review" + (ok ? " ok" : "")}>
      <div className="row between">
        <b className="small">
          {ok ? `✓ Slide ${index + 1} is OK` : `Slide ${index + 1}: OK, or what should change?`}
          {waiting.length > 0 && <span className="pill warn" style={{ marginLeft: 8 }}>{waiting.length} saved for later</span>}
        </b>
        <span className="row" style={{ gap: 6 }}>
          {ok ? (
            <>
              {!open && <button className="btn btn-ghost btn-xs" onClick={() => setOpen(true)}>Give feedback</button>}
              <button className="btn btn-quiet btn-xs" disabled={!!busy} onClick={() => call("ok", () => api.slideOk(deckId, slide.id, false), "Slide reopened")}>Undo OK</button>
            </>
          ) : (
            <button className="btn btn-primary btn-xs" disabled={!!busy} onClick={() => call("ok", () => api.slideOk(deckId, slide.id, true), `Slide ${index + 1} OK`)}>{busy === "ok" ? <span className="spin" /> : "OK ✓"}</button>
          )}
        </span>
      </div>
      {showForm && (
        <>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Title too long. Add the 2026 effective date. Make this a table. Simpler words for a brand owner." />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-xs" disabled={!!busy || (!text.trim() && !waiting.length)} onClick={() => call("apply", () => api.feedback(deckId, slide.id, text, true), "Feedback applied. Check the slide, then OK it.")}>
              {busy === "apply" ? <span className="spin" /> : waiting.length && !text.trim() ? `Apply the ${waiting.length} saved` : "Apply now"}
            </button>
            <button className="btn btn-quiet btn-xs" disabled={!!busy || !text.trim()} onClick={() => call("save", () => api.feedback(deckId, slide.id, text, false), "Saved. Apply it later from here or with Apply saved feedback.")}>
              {busy === "save" ? <span className="spin" /> : "Save for later"}
            </button>
          </div>
        </>
      )}
      {history.length > 0 && (
        <details className="small">
          <summary className="muted">Feedback on this slide ({history.length})</summary>
          <ul style={{ margin: "6px 0 0 16px" }}>
            {history.map((f, i) => (
              <li key={i}>
                {f.text} <span className="muted">· {f.appliedAt ? "applied" : "waiting"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
