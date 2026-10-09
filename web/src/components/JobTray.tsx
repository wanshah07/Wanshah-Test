import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { dismissFinishedFor, dismissJob, isWatched, lastLine, useTracked } from "../lib/jobs";

// Every deck still being written, and every one that has just finished, from any page. Leaving the page
// that started a build does not stop it; this is where it stays in view until it is done.
export function JobTray() {
  const tracked = useTracked();
  const loc = useLocation();
  // Opening a deck is how its "ready" is acknowledged.
  useEffect(() => {
    const m = /^\/deck\/([^/]+)/.exec(loc.pathname);
    if (m) dismissFinishedFor(m[1]);
  }, [loc.pathname, tracked.length]);
  // A page showing a job's progress itself does not need it repeated here.
  const shown = tracked.filter((t) => !t.dismissed && !isWatched(t.jobId));
  if (!shown.length) return null;
  return (
    <div role="status" aria-live="polite" data-testid="job-tray" style={{ position: "fixed", left: 18, bottom: 18, zIndex: 49, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
      {shown.map((t) => {
        const status = t.job?.status ?? "queued";
        const live = status === "queued" || status === "running";
        const failed = status === "failed";
        const line = live ? lastLine(t.job) || "Starting" : failed ? t.job?.error || "The deck could not be written" : "Ready";
        return (
          <div key={t.jobId} className="card" data-testid="job-chip" data-status={status} style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, boxShadow: "var(--shadow-md)", borderColor: failed ? "#F5C2C2" : undefined }}>
            <div className="row between" style={{ gap: 8 }}>
              <b className="small" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {live ? <span className="spin" /> : failed ? "✕" : "✓"}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              </b>
              <span className="row" style={{ gap: 4 }}>
                <Link className="btn btn-quiet btn-xs" to={`/deck/${t.deckId}`}>{live ? "Open" : failed ? "Open deck" : "Open"}</Link>
                {!live && <button className="btn btn-quiet btn-xs" onClick={() => dismissJob(t.jobId)} aria-label="Dismiss">✕</button>}
              </span>
            </div>
            <span className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {live ? `Writing in the background: ${line}` : line}
            </span>
          </div>
        );
      })}
    </div>
  );
}
