import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { mergeDoc, ANGLES, blankSlide, composeAudience, composeBrief, pendingFeedback, DEFAULT_FEATURES, LENGTH_CHOICES, VISUAL_FEATURES, newId, scanDeck, type Deck, type FitResult, type Features, type Layout, type Slide, type SlopHit, type SourceRef, type Theme } from "@slidecraft/shared";
import { api, cloud, exportDeck, type Job } from "../api";
import { appHref } from "../cloud/client";
import { SlideFrame } from "../components/SlideFrame";
import { SlideInspector } from "../components/SlideInspector";
import { ThemePanel } from "../components/ThemePanel";
import { toast } from "../components/Toast";
import { BriefPicker, defaultPromptIds, EMPTY_BRIEF, type BriefValue } from "../components/BriefPicker";
import { ConfirmButton } from "../components/ConfirmButton";
import { ReviewBar } from "../components/ReviewBar";
import { LayoutPicker } from "../components/LayoutPicker";
import { FeatureChoices } from "../components/FeatureChoices";
import { DropZone } from "../components/DropZone";
import { OneDriveBox } from "../components/OneDriveBox";
import { LinkSourceBox, NotRead, SourceReview, sourcesBlocker, sourcesSummary } from "../components/SourceReview";
import type { PathedFile } from "../lib/files";
import { explainFailure } from "../lib/errors";

type Tab = "slide" | "theme" | "export" | "sources";
const TAB_LABEL: Record<Tab, string> = { slide: "Slide", theme: "Theme", export: "Export", sources: "Files & regenerate" };

export default function Editor() {
  const { id = "" } = useParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<Tab>("slide");
  const [saving, setSaving] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [addOpen, setAddOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<Deck | null>(null);
  // The deck as the store last had it: the base a conflicting save is merged against.
  const saved = useRef<Deck | null>(null);
  // Polls stop when the page is left: a finished job must not pull the person back from wherever they went.
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);


  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => {
    setMissing(null);
    api.deck(id).then((r) => {
      setDeck(r.deck);
      latest.current = r.deck;
      saved.current = r.deck;
      setSel(0);
    }).catch((e) => setMissing((e as { status?: number }).status === 404 ? "This deck does not exist, or it was deleted." : (e as Error).message));
  }, [id]);

  const slop = useMemo(() => (deck ? scanDeck(deck) : {}), [deck]);
  const [fit, setFit] = useState<FitResult | null>(null);
  const slopCount = Object.values(slop).reduce((a, h) => a + h.length, 0);
  const okCount = deck ? deck.slides.filter((x) => x.review?.ok).length : 0;
  const waitingCount = deck ? deck.slides.reduce((a, x) => a + pendingFeedback(x).length, 0) : 0;
  const [applyJob, setApplyJob] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const inFlight = useRef(false);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  // One save at a time: a save that started earlier must never land after a later one and win.
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const flush = useCallback(async (): Promise<void> => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const p = (async () => {
      do {
        again.current = false;
        await saveOnce();
      } while (again.current);
    })();
    running.current = p;
    try {
      await p;
    } finally {
      running.current = null;
    }
  }, []);
  const saveOnce = async () => {
    const d = latest.current;
    if (!d) return;
    setSaving("saving");
    inFlight.current = true;
    try {
      await api.saveDeck(d);
      saved.current = d;
      setSaving(again.current ? "saving" : "saved");
    } catch (e) {
      if ((e as { code?: string }).code === "deck_changed") {
        // The worker wrote the deck while this was being edited: merge its work with the edits here, worker's
        // version first where both touched the same slide, and save that.
        try {
          const srv = (await api.deck(d.id)).deck;
          const merged = mergeDoc((saved.current ?? srv) as unknown as Record<string, unknown>, srv as unknown as Record<string, unknown>, (latest.current ?? d) as unknown as Record<string, unknown>) as unknown as Deck;
          merged.sources = srv.sources;
          latest.current = merged;
          saved.current = srv;
          setDeck(merged);
          setSel((i) => Math.min(i, Math.max(0, merged.slides.length - 1)));
          again.current = true;
          toast("The deck was updated while you edited it. Your edits were merged in.");
          return;
        } catch {
          /* fall through to the ordinary retry */
        }
      }
      setSaving("error");
      toast("Save failed: " + (e as Error).message + ". Trying again in a few seconds.", true);
      // The edit is still only on this screen: try again, and keep the leave-warning on until it lands.
      if (!saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null;
          void flushRef.current?.();
        }, 8000);
    } finally {
      inFlight.current = false;
    }
  };
  flushRef.current = flush;

  const update = useCallback((next: Deck) => {
    setDeck(next);
    latest.current = next;
    setSaving("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void flush();
    }, 900);
  }, [flush]);

  // Leaving with an edit not yet saved: save it now, and ask the browser to hold the page if it cannot wait.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!saveTimer.current && !inFlight.current) return;
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void flush();
      }
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [flush]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  if (missing) return <main className="page"><div className="banner warn">{missing}</div><p><Link to="/" className="btn btn-primary">Back to decks</Link></p></main>;
  if (!deck) return <main className="page"><p className="muted">Loading</p></main>;
  const slide = deck.slides[sel];

  // Built from the deck as it is now, not as it was when this render ran: an upload that returns a minute
  // later must not put back slides and edits from before it started.
  const setSlide = (s: Slide) => {
    const cur = latest.current ?? deck;
    update({ ...cur, slides: cur.slides.map((x) => (x.id === s.id ? s : x)) });
  };
  const setTheme = (t: Theme) => update({ ...(latest.current ?? deck), theme: t });
  const addSlide = (layout: Layout) => {
    const s = blankSlide(layout, deck.lang);
    const slides = [...deck.slides];
    slides.splice(sel + 1, 0, s);
    update({ ...deck, slides });
    setSel(sel + 1);
    setAddOpen(false);
    setTab("slide");
  };
  const dupSlide = () => {
    const slides = [...deck.slides];
    slides.splice(sel + 1, 0, { ...JSON.parse(JSON.stringify(slide)), id: newId() });
    update({ ...deck, slides });
    setSel(sel + 1);
  };
  const delSlide = () => {
    if (deck.slides.length <= 1) return;
    const slides = deck.slides.filter((_, i) => i !== sel);
    update({ ...deck, slides });
    setSel(Math.max(0, sel - 1));
  };
  const move = (dir: -1 | 1) => {
    const j = sel + dir;
    if (j < 0 || j >= deck.slides.length) return;
    const slides = [...deck.slides];
    [slides[sel], slides[j]] = [slides[j], slides[sel]];
    update({ ...deck, slides });
    setSel(j);
  };
  const flushNow = async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await flush();
    } else if (running.current) await running.current;
  };
  /** Put a slide the server rewrote into the deck as it is now, keeping every edit made meanwhile. */
  const replaceSlide = (s: Slide, _hits?: SlopHit[]) => {
    const cur = latest.current ?? deck;
    const next = { ...cur, slides: cur.slides.map((x) => (x.id === s.id ? s : x)) };
    // Saved again as a whole: an autosave that left while the writer worked may have carried
    // the old version of this slide, and the server must end up holding what the screen shows.
    update(next);
  };
  /** Save what is waiting, then go: a download or the present view shows the deck as it is on screen. */
  const download = async (kind: "pptx" | "html" | "json") => {
    setExporting(kind);
    try {
      await flushNow();
      await exportDeck(deck.id, kind);
    } catch (e) {
      toast(`The download did not work: ${(e as Error).message}`, true);
    } finally {
      setExporting(null);
    }
  };
  const openAfterSave = async (url: string, newTab = false) => {
    const w = newTab ? window.open("about:blank", "_blank") : null;
    await flushNow();
    if (w) w.location.href = url;
    else window.location.href = url;
  };
  const applyAll = async () => {
    try {
      await flushNow();
      const { jobId } = await api.applyAllFeedback(deck.id);
      setApplyJob(jobId);
      // What each slide looked like when the job began: a slide edited meanwhile keeps the edit.
      const before = new Map((latest.current ?? deck).slides.map((x) => [x.id, JSON.stringify(x)]));
      const tick = async () => {
        if (!alive.current) return;
        try {
          const j = await api.job(jobId);
          if (j.status === "done" || j.status === "failed") {
            setApplyJob(null);
            const r = await api.deck(deck.id);
            const server = new Map(r.deck.slides.map((x) => [x.id, x]));
            const cur = latest.current ?? deck;
            let edited = false;
            const slides = cur.slides.map((x) => {
              const untouched = before.get(x.id) === JSON.stringify(x);
              if (!untouched) edited = true;
              return untouched && server.has(x.id) ? server.get(x.id)! : x;
            });
            const next = { ...cur, slides };
            setDeck(next);
            latest.current = next;
            saved.current = r.deck;
            if (edited) update(next);
            else setSaving("saved");
            toast(j.status === "done" ? j.progress[j.progress.length - 1]?.replace(/^\S+ /, "") || "Feedback applied" : j.error || "Failed", j.status === "failed");
          } else setTimeout(tick, 1500);
        } catch (e) {
          setApplyJob(null);
          toast(`Lost track of the feedback job: ${(e as Error).message}. Reload to see the result.`, true);
        }
      };
      tick();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const rewrite = async (instruction: string) => {
    // The writer loads the deck from the store, so the edit must be there first, including one still saving.
    await flushNow();
    try {
      const r = await api.rewrite(deck.id, slide.id, instruction);
      replaceSlide(r.slide);
      toast(r.slop.length ? `Rewritten, ${r.slop.length} flag${r.slop.length === 1 ? "" : "s"} remain` : "Rewritten, nothing flagged");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <main className="page wide">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row">
          <Link to="/" className="btn btn-quiet btn-sm">← Decks</Link>
          <input type="text" value={deck.title} onChange={(e) => update({ ...deck, title: e.target.value })} className="ed-title" style={{ width: 420, maxWidth: "100%", fontWeight: 600, fontFamily: "var(--font-display)", fontSize: 18 }} />
          <span className="pill">{deck.lang === "ms" ? "BM" : "EN"}</span>
          <span className="pill">{ANGLES.find((a) => a.id === deck.angle)?.name ?? deck.angle}</span>
        </div>
        <div className="row">
          {slopCount > 0 && <span className="pill danger" title="Wording flagged by the de-slop scan">{slopCount} flagged</span>}
          {deck.slides.length > 0 && <span className={"pill" + (okCount === deck.slides.length ? " ok" : "")} title="Slides you have marked OK">{okCount}/{deck.slides.length} OK</span>}
          {waitingCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={applyAll} disabled={!!applyJob}>
              {applyJob ? <><span className="spin" /> Applying</> : `Apply saved feedback (${waitingCount})`}
            </button>
          )}
          <span className="small muted">{saving === "saving" ? "Saving" : saving === "dirty" ? "Unsaved" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved" : ""}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setTab("sources")}>Add files / regenerate</button>
          <Link to={`/deck/${deck.id}/notebook`} className="btn btn-ghost btn-sm" data-testid="open-notebook">Notebook</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => openAfterSave(appHref(`/deck/${deck.id}/present`), true)} disabled={deck.slides.length === 0} title={deck.slides.length ? "" : "Add a slide first"}>Present</button>
          <button className="btn btn-primary btn-sm" onClick={() => download("pptx")} disabled={!!exporting}>{exporting === "pptx" ? <><span className="spin" /> Building PPTX</> : "Download PPTX"}</button>
        </div>
      </div>

      <div className="ed">
        <aside className="col">
          <div className="tools">
            <button className="btn btn-ghost btn-xs" onClick={() => setAddOpen(true)}>+ Add</button>
            <button className="btn btn-quiet btn-xs" onClick={dupSlide} title="Duplicate">Dup</button>
            <button className="btn btn-quiet btn-xs" onClick={() => move(-1)} disabled={sel === 0}>↑</button>
            <button className="btn btn-quiet btn-xs" onClick={() => move(1)} disabled={sel >= deck.slides.length - 1}>↓</button>
            <ConfirmButton className="btn btn-quiet btn-xs" confirm="Delete slide?" onConfirm={delSlide} disabled={deck.slides.length <= 1}>✕</ConfirmButton>
          </div>
          <div className="list">
            {deck.slides.map((s, i) => (
              <div key={s.id} className={"thumb" + (i === sel ? " on" : "")} onClick={() => setSel(i)}>
                <SlideFrame slide={s} theme={deck.theme} index={i} total={deck.slides.length} lang={deck.lang} />
                <span className="n">{i + 1}</span>
                {slop[s.id]?.length ? <span className="flag pill danger" style={{ padding: "0 6px", fontSize: 10 }}>{slop[s.id].length}</span> : null}
                {s.review?.ok ? <span className="okmark" title="OK">✓</span> : pendingFeedback(s).length ? <span className="fbmark" title="Feedback saved for later">{pendingFeedback(s).length}</span> : null}
              </div>
            ))}
            {deck.slides.length === 0 && (
              <div className="card tight small">
                <p>No slides yet.</p>
                <button className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={() => { update({ ...deck, slides: [blankSlide("title", deck.lang)] }); setSel(0); }}>Add a title slide</button>
              </div>
            )}
          </div>
        </aside>

        <section className="col" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {slide ? (
            <>
              <div className="canvasWrap" style={{ padding: 18 }}>
                <div style={{ width: "100%", maxWidth: 1100 }}>
                  <SlideFrame slide={slide} theme={deck.theme} index={sel} total={deck.slides.length} lang={deck.lang} onFit={setFit} />
                </div>
              </div>
              {fit?.overflow || fit?.tooSmall ? (
                <div className="banner warn" data-testid="fit-over">This slide has so much text it had to shrink below half size to fit. Shorten it, move detail to the notes, split it in two, or show it as a chart, diagram or picture.</div>
              ) : fit && fit.scale < 0.85 ? (
                <p className="small muted" data-testid="fit-shrunk">Text shrunk to {Math.round(fit.scale * 100)}% to fit. Shorter text reads better from the back of the room.</p>
              ) : null}
              <ReviewBar deckId={deck.id} slide={slide} index={sel} beforeCall={flushNow} onSlide={replaceSlide} />
              {slide.notes && (
                <div className="card tight small" style={{ whiteSpace: "pre-line" }}>
                  <b className="muted" style={{ fontSize: 11, letterSpacing: ".08em" }}>NOTES</b>
                  <div style={{ marginTop: 4 }}>{slide.notes}</div>
                </div>
              )}
            </>
          ) : (
            <div className="card" style={{ textAlign: "center" }}>
              <p className="muted">Add a slide, or generate the deck from the Sources tab.</p>
            </div>
          )}
        </section>

        <aside className="col card" style={{ padding: 16 }}>
          <div className="tabs">
            {(["slide", "theme", "export", "sources"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
            ))}
          </div>
          {tab === "slide" && slide && <SlideInspector deckId={deck.id} slide={slide} hits={slop[slide.id] ?? []} lang={deck.lang} theme={deck.theme} onChange={setSlide} onRewrite={rewrite} />}
          {tab === "slide" && !slide && <p className="muted small">No slide selected.</p>}
          {tab === "theme" && <ThemePanel deckId={deck.id} theme={deck.theme} designId={deck.designId} onChange={setTheme} onDesign={(t, designId) => update({ ...deck, theme: t, designId })} />}
          {tab === "export" && <ExportPanel deck={deck} slopCount={slopCount} open={download} busy={exporting} />}
          {/* Mounted whatever the tab, only hidden: a regeneration started here must still land when the person
              is back on the Slide tab, or the page keeps the old slides and the next autosave writes them back. */}
          <div hidden={tab !== "sources"}>
            <SourcesPanel deck={deck} onDeck={(d) => { setDeck(d); latest.current = d; saved.current = d; setSel(0); setSaving("saved"); }} />
          </div>
        </aside>
      </div>

      {addOpen && (
        <div className="modal-bg" onClick={() => setAddOpen(false)}>
          <div className="modal" style={{ width: "min(900px,94vw)", maxHeight: "88vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12 }}>Add a slide after {sel + 1}</h3>
            <LayoutPicker theme={deck.theme} lang={deck.lang} onPick={addSlide} width={170} />
          </div>
        </div>
      )}
    </main>
  );
}

function ExportPanel({ deck, slopCount, open, busy }: { deck: Deck; slopCount: number; open: (kind: "pptx" | "html" | "json") => void; busy: string | null }) {
  return (
    <div className="stack">
      {slopCount > 0 && <div className="banner warn">{slopCount} flagged phrase{slopCount === 1 ? "" : "s"} left. Open each slide's inspector to see them, or rewrite the slide.</div>}
      {slopCount === 0 && <div className="banner info">Nothing flagged.</div>}
      <button className="btn btn-primary" onClick={() => open("pptx")} disabled={!!busy}>{busy === "pptx" ? <><span className="spin" /> Building the PowerPoint</> : "PowerPoint (.pptx)"}</button>
      {busy === "pptx" && cloud && <p className="small muted">The worker builds it on GitHub; this takes about a minute.</p>}
      <p className="small muted">Native text, charts, tables and shapes. Edit anything in PowerPoint or Keynote. Fonts fall back to the machine's if {deck.theme.fontDisplay} or {deck.theme.fontBody} is not installed.</p>
      <button className="btn btn-ghost" onClick={() => open("html")} disabled={!!busy}>Web deck (.html)</button>
      <p className="small muted">One file with the pictures inside. Opens in any browser: arrows to move, N for notes, G for the grid, F for full screen.</p>
      <button className="btn btn-ghost" onClick={() => open("json")} disabled={!!busy}>Deck data (.json)</button>
      <p className="small muted">The slide specification, for re-import or a script.</p>
    </div>
  );
}

function SourcesPanel({ deck, onDeck }: { deck: Deck; onDeck: (d: Deck) => void }) {
  // Polls stop when the page is left: a finished job must not pull the person back from wherever they went.
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const stored = deck.brief;
  const [sources, setSources] = useState<SourceRef[]>(deck.sources);
  const [brief, setBrief] = useState<BriefValue>(stored ? { purposes: stored.purposes, include: stored.include, audiences: stored.audiences, text: stored.text, audienceText: "", prompts: stored.prompts ?? [] } : { ...EMPTY_BRIEF, audienceText: deck.audience ?? "" });
  useEffect(() => {
    // A deck generated before prompts existed, or with none named, used the defaults.
    if (!stored?.prompts) defaultPromptIds().then((prompts) => setBrief((b) => ({ ...b, prompts })));
  }, []);
  const [slides, setSlides] = useState(stored?.slides ?? Math.max(6, deck.slides.length || 10));
  const [angle, setAngle] = useState(deck.angle);
  const [features, setFeatures] = useState<Features>({ ...DEFAULT_FEATURES, ...(ANGLES.find((a) => a.id === deck.angle)?.defaults ?? {}), ...((stored?.features as Partial<Features> | undefined) ?? {}) });
  const [imageMode, setImageMode] = useState<"none" | "uploaded" | "generate">(stored?.imageMode ?? "uploaded");
  const [link, setLink] = useState(deck.onedrive);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [notRead, setNotRead] = useState<string[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [auto, setAuto] = useState(!!stored?.auto);
  // Auto's own ticks: every device on unless the last Auto run had it off.
  const [autoFeatures, setAutoFeatures] = useState<Features>(() => {
    const was = (stored?.auto ? stored.features : undefined) as Partial<Features> | undefined;
    return { ...features, ...Object.fromEntries(VISUAL_FEATURES.map((k) => [k, was?.[k] !== false])) };
  });
  const prompt = composeBrief(brief);
  const reload = () => api.sources(deck.id).then(setSources).catch(() => {});
  const add = async (files: PathedFile[]) => {
    setBusy(true);
    try {
      const r = await api.uploadSources(deck.id, files);
      if (r.skipped.length) setNotRead((n) => [...n, ...r.skipped]);
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const run = async (allowUnreadPictures = false) => {
    if (!auto && prompt.trim().length < 10) {
      toast("Tick what the deck is for, or type a few words", true);
      return;
    }
    try {
      const audience = composeAudience(brief.audiences, brief.audienceText) || deck.audience;
      const { jobId } = await api.generate(deck.id, { prompt, auto, title: deck.title, lang: deck.lang, angle, audience, slides, features: auto ? autoFeatures : features, imageMode, allowUnreadPictures, brief: { text: brief.text, purposes: brief.purposes, include: brief.include, audiences: brief.audiences, prompts: brief.prompts } });
      const tick = async () => {
        if (!alive.current) return;
        try {
          const j = await api.job(jobId);
          setJob(j);
          if (j.status === "done") {
            const r = await api.deck(deck.id);
            onDeck(r.deck);
            toast("Deck regenerated");
          } else if (j.status === "failed") toast(j.error || "Failed", true);
          else setTimeout(tick, 1500);
        } catch (e) {
          // A lost connection must not leave the spinner running for ever.
          setJob({ id: jobId, deckId: deck.id, status: "failed", progress: [], error: `Lost track of the job: ${(e as Error).message}. Reload to see whether it finished.`, result: null });
        }
      };
      tick();
    } catch (e) {
      // A refusal before the job starts (pictures the model cannot read, no key)
      // is shown in the same panel as a failed job, with its choices.
      setJob({ id: "", deckId: deck.id, status: "failed", progress: [], error: (e as Error).message, result: null });
    }
  };
  const running = job && (job.status === "queued" || job.status === "running");
  const summary = sourcesSummary(sources);
  const blocker = sourcesBlocker(sources, notRead, busy || linkBusy);
  return (
    <div className="stack">
      <h4>Sources</h4>
      <DropZone onFiles={add} busy={busy} compact />
      <OneDriveBox getDeckId={async () => deck.id} link={link} onImported={(src, l) => { if (src.length) setSources(src); setLink(l); }} />
      <LinkSourceBox compact getDeckId={async () => deck.id} onAdded={() => reload()} onNotRead={(x) => setNotRead((n) => [...n, ...x])} onBusy={setLinkBusy} />
      <NotRead items={notRead} onDismiss={() => setNotRead([])} />
      {summary && <div className={`srcsum t-${summary.tone}`}>{summary.text}</div>}
      <SourceReview compact sources={sources} onRemove={(s) => api.deleteSource(s.id).then(reload)} />
      {sources.length === 0 && <p className="small muted">No sources attached.</p>}
      <hr />
      <h4>Regenerate</h4>
      {stored && <p className="small muted">Your last choices are ticked. Change anything, then regenerate.</p>}
      <label className="row small" style={{ gap: 6 }} data-testid="regen-auto">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        <b>Auto: let the AI decide</b> the angle, length and layouts
      </label>
      <BriefPicker value={brief} onChange={setBrief} compact />
      {auto && <FeatureChoices features={autoFeatures} onChange={setAutoFeatures} auto compact />}
      {!auto && <>
      <div className="grid c2" style={{ gap: 8 }}>
        <select value={slides} onChange={(e) => setSlides(Number(e.target.value))}>{LENGTH_CHOICES.map((c) => <option key={c.slides} value={c.slides}>{c.label}</option>)}</select>
        <select value={angle} onChange={(e) => setAngle(e.target.value)}>{ANGLES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>
      <FeatureChoices features={features} onChange={setFeatures} auto={false} compact />
      {features.images && (
        <select value={imageMode} onChange={(e) => setImageMode(e.target.value as typeof imageMode)}>
          <option value="uploaded">Pictures from sources (uploads and OneDrive)</option>
          <option value="generate">Pictures from the image model</option>
          <option value="none">Placeholders only</option>
        </select>
      )}
      </>}
      {deck.slides.length > 0 ? (
        <ConfirmButton className="btn btn-primary" confirm={`Click again: replace all ${deck.slides.length} slides`} onConfirm={() => run()} disabled={!!running || !!blocker}>
          {running ? <span className="spin" /> : "Regenerate deck"}
        </ConfirmButton>
      ) : (
        <button className="btn btn-primary" onClick={() => run()} disabled={!!running || !!blocker}>{running ? <span className="spin" /> : "Generate deck"}</button>
      )}
      {blocker && !running && <span className="small muted" data-testid="regen-blocker">{blocker}</span>}
      {job?.status === "failed" && (() => {
        const why = explainFailure(job.error || "");
        return (
          <div className="banner danger" style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <b>{why.what}</b>
            <span>{why.todo}</span>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn btn-primary btn-xs" onClick={() => run()}>Try again</button>
              {why.anyway && <button className="btn btn-ghost btn-xs" onClick={() => run(true)}>Write anyway</button>}
              {why.settings && <Link className="btn btn-ghost btn-xs" to="/settings" target="_blank">Open Settings</Link>}
            </span>
          </div>
        );
      })()}
      {job && job.progress.length > 0 && <div className="log">{job.progress.join("\n")}</div>}
    </div>
  );
}
