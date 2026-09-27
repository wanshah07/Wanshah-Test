import { useState } from "react";
import type { SourceRef } from "@slidecraft/shared";
import { api } from "../api";

/**
 * A Google Drive, Docs, Sheets or Slides link (or a shared folder), read on the
 * spot. What came through joins the source list below with its read report;
 * what did not stays on screen with the reason until the person deals with it.
 */
export function LinkSourceBox({ getDeckId, onAdded, onNotRead, onBusy, compact }: { getDeckId: () => Promise<string>; onAdded: (s: SourceRef[]) => void; onNotRead: (items: string[]) => void; onBusy?: (b: boolean) => void; compact?: boolean }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const read = async () => {
    const link = url.trim();
    if (!link) return;
    setBusy(true);
    onBusy?.(true);
    try {
      const id = await getDeckId();
      const r = await api.addLink(id, link);
      onAdded(r.added);
      if (r.skipped.length) onNotRead(r.skipped);
      setUrl("");
    } catch (e) {
      onNotRead([`${link.length > 70 ? link.slice(0, 67) + "…" : link}: ${(e as Error).message}`]);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  };
  return (
    <div className="card tight stack" data-testid="link-source">
      <div className="row between"><b className="small">Google Drive or Sheets link</b>{!compact && <span className="small muted">A Sheet (every tab), a Doc, Slides, any Drive file, or a shared folder.</span>}</div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" onKeyDown={(e) => e.key === "Enter" && !busy && read()} />
        <button className="btn btn-ghost btn-sm" onClick={read} disabled={busy || !url.trim()}>{busy ? <><span className="spin" /> Reading</> : "Read link"}</button>
      </div>
      {!compact && <span className="small muted">Shared as "Anyone with the link" (Viewer), or private to the Google account connected in Settings. It is read now, and what was read is shown below before you go on.</span>}
    </div>
  );
}

const MARK = { ok: "✓", warn: "!", fail: "✕" } as const;

/** Every source with what was read from it; a click shows the first words, so the person can see it is the right data. */
export function SourceReview({ sources, onRemove, compact }: { sources: SourceRef[]; onRemove: (s: SourceRef) => void; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!sources.length) return null;
  return (
    <div className="srcs" data-testid="source-review">
      {sources.map((s) => {
        const c = s.check;
        const level = c?.level ?? "ok";
        return (
          <div key={s.id} className={`src src-${level}`} data-level={level}>
            <div className="row" style={{ gap: 10, flexWrap: "nowrap", width: "100%" }}>
              <span className={`mark m-${level}`} title={level === "ok" ? "Read" : level === "warn" ? "Read, with a caveat" : "Not readable"}>{MARK[level]}</span>
              <span className="k">{s.kind}</span>
              <span className="n" title={s.name}>{s.name}</span>
              {c?.preview && <button className="btn btn-quiet btn-xs" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide" : "Show data"}</button>}
              <button className="btn btn-quiet btn-xs" onClick={() => onRemove(s)}>{compact ? "✕" : "Remove"}</button>
            </div>
            {c && <div className={`note small ${level === "ok" ? "muted" : ""}`}>{c.note}</div>}
            {open === s.id && c?.preview && <div className="peek small">{c.preview}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Files and links that were not read, kept on screen until the person says to go on without them. */
export function NotRead({ items, onDismiss }: { items: string[]; onDismiss: () => void }) {
  if (!items.length) return null;
  return (
    <div className="banner danger" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }} data-testid="not-read">
      <b>{items.length === 1 ? "This was not read" : `${items.length} were not read`}, so the writer will not have it:</b>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((x, i) => <li key={i} className="small">{x}</li>)}</ul>
      <button className="btn btn-ghost btn-xs" onClick={onDismiss}>OK, go on without {items.length === 1 ? "it" : "them"}</button>
    </div>
  );
}

/** Why the person cannot go on yet, or "" when every source is read. */
export function sourcesBlocker(sources: SourceRef[], notRead: string[], busy: boolean): string {
  if (busy) return "Reading your sources…";
  const bad = sources.filter((s) => s.check?.level === "fail");
  if (bad.length) return `${bad.length} source${bad.length === 1 ? " has" : "s have"} nothing the writer can read. Remove ${bad.length === 1 ? "it" : "them"}, or add a readable version.`;
  if (notRead.length) return "Some files or links were not read. Fix them, or press OK to go on without them.";
  return "";
}

/** The line above the list: what the writer will have. */
export function sourcesSummary(sources: SourceRef[]): { text: string; tone: "ok" | "warn" | "fail" } | null {
  if (!sources.length) return null;
  const n = (l: string) => sources.filter((s) => (s.check?.level ?? "ok") === l).length;
  const fail = n("fail"), warn = n("warn"), ok = n("ok");
  if (fail) return { text: `${ok + warn} of ${sources.length} sources read. ${fail} could not be read.`, tone: "fail" };
  if (warn) return { text: `All ${sources.length} sources read; ${warn} with a caveat below.`, tone: "warn" };
  return { text: `All ${sources.length} source${sources.length === 1 ? "" : "s"} read. The writer will have this data.`, tone: "ok" };
}
