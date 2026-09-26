import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ANGLES, blankSlide, composeAudience, composeBrief, pendingFeedback, DEFAULT_FEATURES, FEATURE_LABELS, LENGTH_CHOICES, newId, scanDeck, sahkanCount, type Deck, type Features, type Layout, type Slide, type SlopHit, type SourceRef, type Theme } from "@slidecraft/shared";
import { api, type Job } from "../api";
import { SlideFrame } from "../components/SlideFrame";
import { SlideInspector } from "../components/SlideInspector";
import { ThemePanel } from "../components/ThemePanel";
import { toast } from "../components/Toast";
import { BriefPicker, defaultPromptIds, EMPTY_BRIEF, type BriefValue } from "../components/BriefPicker";
import { ConfirmButton } from "../components/ConfirmButton";
import { ReviewBar } from "../components/ReviewBar";
import { LayoutPicker } from "../components/LayoutPicker";
import { DropZone } from "../components/DropZone";
import { OneDriveBox } from "../components/OneDriveBox";
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

  useEffect(() => {
    api.deck(id).then((r) => {
      setDeck(r.deck);
      latest.current = r.deck;
      setSel(0);
    }).catch((e) => toast(e.message, true));
  }, [id]);

  const slop = useMemo(() => (deck ? scanDeck(deck) : {}), [deck]);
  const sahkan = useMemo(() => (deck ? sahkanCount(deck) : 0), [deck]);
  const slopCount = Object.values(slop).reduce((a, h) => a + h.length, 0);
  const okCount = deck ? deck.slides.filter((x) => x.review?.ok).length : 0;
  const waitingCount = deck ? deck.slides.reduce((a, x) => a + pendingFeedback(x).length, 0) : 0;
  const [applyJob, setApplyJob] = useState<string | null>(null);

  const flush = useCallback(async () => {
    const d = latest.current;
    if (!d) return;
    setSaving("saving");
    try {
      await api.saveDeck(d);
      setSaving("saved");
    } catch (e) {
      setSaving("error");
      toast("Save failed: " + (e as Error).message, true);
    }
  }, []);

  const update = useCallback((next: Deck) => {
    setDeck(next);
    latest.current = next;
    setSaving("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 900);
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

  if (!deck) return <main className="page"><p className="muted">Loading</p></main>;
  const slide = deck.slides[sel];

  const setSlide = (s: Slide) => update({ ...deck, slides: deck.slides.map((x, i) => (i === sel ? s : x)) });
  const setTheme = (t: Theme) => update({ ...deck, theme: t });
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
    }
  };
  const replaceSlide = (s: Slide, _hits: SlopHit[]) => {
    const cur = latest.current ?? deck;
    const next = { ...cur, slides: cur.slides.map((x) => (x.id === s.id ? s : x)) };
    setDeck(next);
    latest.current = next;
    setSaving("saved");
  };
  const applyAll = async () => {
    try {
      await flushNow();
      const { jobId } = await api.applyAllFeedback(deck.id);
      setApplyJob(jobId);
      const tick = async () => {
        const j = await api.job(jobId);
        if (j.status === "done" || j.status === "failed") {
          setApplyJob(null);
          const r = await api.deck(deck.id);
          setDeck(r.deck);
          latest.current = r.deck;
          setSaving("saved");
          toast(j.status === "done" ? j.progress[j.progress.length - 1]?.replace(/^\S+ /, "") || "Feedback applied" : j.error || "Failed", j.status === "failed");
        } else setTimeout(tick, 1500);
      };
      tick();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const rewrite = async (instruction: string) => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      await flush();
    }
    try {
      const r = await api.rewrite(deck.id, slide.id, instruction);
      const next = { ...deck, slides: deck.slides.map((x, i) => (i === sel ? r.slide : x)) };
      setDeck(next);
      latest.current = next;
      setSaving("saved");
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
          <input type="text" value={deck.title} onChange={(e) => update({ ...deck, title: e.target.value })} style={{ width: 420, fontWeight: 600, fontFamily: "var(--font-display)", fontSize: 18 }} />
          <span className="pill">{deck.lang === "ms" ? "BM" : "EN"}</span>
          <span className="pill">{ANGLES.find((a) => a.id === deck.angle)?.name ?? deck.angle}</span>
        </div>
        <div className="row">
          {sahkan > 0 && <span className="pill warn" title="Facts the writer could not source. Search for each, then edit the marker away.">{sahkan} SAHKAN</span>}
          {slopCount > 0 && <span className="pill danger" title="Wording flagged by the de-slop scan">{slopCount} flagged</span>}
          {deck.slides.length > 0 && <span className={"pill" + (okCount === deck.slides.length ? " ok" : "")} title="Slides you have marked OK">{okCount}/{deck.slides.length} OK</span>}
          {waitingCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={applyAll} disabled={!!applyJob}>
              {applyJob ? <><span className="spin" /> Applying</> : `Apply saved feedback (${waitingCount})`}
            </button>
          )}
          <span className="small muted">{saving === "saving" ? "Saving" : saving === "dirty" ? "Unsaved" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved" : ""}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setTab("sources")}>Add files / regenerate</button>
          <a className="btn btn-ghost btn-sm" href={`/deck/${deck.id}/present`} target="_blank" rel="noreferrer">Present</a>
          <a className="btn btn-primary btn-sm" href={`/api/decks/${deck.id}/export.pptx`}>Download PPTX</a>
        </div>
      </div>

      <div className="ed">
        <aside className="col">
          <div className="tools">
            <button className="btn btn-ghost btn-xs" onClick={() => setAddOpen(true)}>+ Add</button>
            <button className="btn btn-quiet btn-xs" onClick={dupSlide} title="Duplicate">Dup</button>
            <button className="btn btn-quiet btn-xs" onClick={() => move(-1)} disabled={sel === 0}>↑</button>
            <button className="btn btn-quiet btn-xs" onClick={() => move(1)} disabled={sel >= deck.slides.length - 1}>↓</button>
            <button className="btn btn-quiet btn-xs" onClick={delSlide} disabled={deck.slides.length <= 1} title="Delete slide">✕</button>
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
                  <SlideFrame slide={slide} theme={deck.theme} index={sel} total={deck.slides.length} lang={deck.lang} />
                </div>
              </div>
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
          {tab === "export" && <ExportPanel deck={deck} sahkan={sahkan} slopCount={slopCount} />}
          {tab === "sources" && <SourcesPanel deck={deck} onDeck={(d) => { setDeck(d); latest.current = d; setSel(0); setSaving("saved"); }} />}
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

function ExportPanel({ deck, sahkan, slopCount }: { deck: Deck; sahkan: number; slopCount: number }) {
  return (
    <div className="stack">
      {sahkan > 0 && <div className="banner warn">{sahkan} unresolved [SAHKAN] marker{sahkan === 1 ? "" : "s"}. They print on the slides in yellow until you replace each with the sourced fact.</div>}
      {slopCount > 0 && <div className="banner warn">{slopCount} flagged phrase{slopCount === 1 ? "" : "s"} left. Open each slide's inspector to see them, or rewrite the slide.</div>}
      {sahkan === 0 && slopCount === 0 && <div className="banner info">No unresolved markers and nothing flagged.</div>}
      <a className="btn btn-primary" href={`/api/decks/${deck.id}/export.pptx`}>PowerPoint (.pptx)</a>
      <p className="small muted">Native text, charts, tables and shapes. Edit anything in PowerPoint or Keynote. Fonts fall back to the machine's if {deck.theme.fontDisplay} or {deck.theme.fontBody} is not installed.</p>
      <a className="btn btn-ghost" href={`/api/decks/${deck.id}/export.html`}>Web deck (.html)</a>
      <p className="small muted">One file with the pictures inside. Opens in any browser: arrows to move, N for notes, G for the grid, F for full screen.</p>
      <a className="btn btn-ghost" href={`/api/decks/${deck.id}/export.json`}>Deck data (.json)</a>
      <p className="small muted">The slide specification, for re-import or a script.</p>
    </div>
  );
}

function SourcesPanel({ deck, onDeck }: { deck: Deck; onDeck: (d: Deck) => void }) {
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
  const prompt = composeBrief(brief);
  const reload = () => api.sources(deck.id).then(setSources).catch(() => {});
  const add = async (files: PathedFile[]) => {
    setBusy(true);
    try {
      const r = await api.uploadSources(deck.id, files);
      if (r.skipped.length) toast(`Added ${r.added.length}, skipped ${r.skipped.length} that could not be read`, true);
      else toast(`Added ${r.added.length}`);
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const run = async (allowUnreadPictures = false) => {
    if (prompt.trim().length < 10) {
      toast("Tick what the deck is for, or type a few words", true);
      return;
    }
    try {
      const audience = composeAudience(brief.audiences, brief.audienceText) || deck.audience;
      const { jobId } = await api.generate(deck.id, { prompt, title: deck.title, lang: deck.lang, angle, audience, slides, features, imageMode, allowUnreadPictures, brief: { text: brief.text, purposes: brief.purposes, include: brief.include, audiences: brief.audiences, prompts: brief.prompts } });
      const tick = async () => {
        const j = await api.job(jobId);
        setJob(j);
        if (j.status === "done") {
          const r = await api.deck(deck.id);
          onDeck(r.deck);
          toast("Deck regenerated");
        } else if (j.status === "failed") toast(j.error || "Failed", true);
        else setTimeout(tick, 1500);
      };
      tick();
    } catch (e) {
      // A refusal before the job starts (pictures the model cannot read, no key)
      // is shown in the same panel as a failed job, with its choices.
      setJob({ id: "", deckId: deck.id, status: "failed", progress: [], error: (e as Error).message, result: null });
    }
  };
  const running = job && (job.status === "queued" || job.status === "running");
  return (
    <div className="stack">
      <h4>Sources</h4>
      <DropZone onFiles={add} busy={busy} compact />
      <OneDriveBox getDeckId={async () => deck.id} link={link} onImported={(src, l) => { if (src.length) setSources(src); setLink(l); }} />
      <div className="srcs">
        {sources.map((s) => (
          <div key={s.id} className="src">
            <span className="k">{s.kind}</span><span className="n" title={s.name}>{s.name}</span>
            <button className="btn btn-quiet btn-xs" onClick={() => api.deleteSource(s.id).then(reload)}>✕</button>
          </div>
        ))}
        {sources.length === 0 && <p className="small muted">No sources attached.</p>}
      </div>
      <hr />
      <h4>Regenerate</h4>
      {stored && <p className="small muted">Your last choices are ticked. Change anything, then regenerate.</p>}
      <BriefPicker value={brief} onChange={setBrief} compact />
      <div className="grid c2" style={{ gap: 8 }}>
        <select value={slides} onChange={(e) => setSlides(Number(e.target.value))}>{LENGTH_CHOICES.map((c) => <option key={c.slides} value={c.slides}>{c.label}</option>)}</select>
        <select value={angle} onChange={(e) => setAngle(e.target.value)}>{ANGLES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>
      <div className="grid c2" style={{ gap: 4 }}>
        {(Object.keys(FEATURE_LABELS) as (keyof Features)[]).map((k) => (
          <label key={k} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={features[k]} onChange={(e) => setFeatures({ ...features, [k]: e.target.checked })} />{FEATURE_LABELS[k].label}</label>
        ))}
      </div>
      {features.images && (
        <select value={imageMode} onChange={(e) => setImageMode(e.target.value as typeof imageMode)}>
          <option value="uploaded">Pictures from sources (uploads and OneDrive)</option>
          <option value="generate">Pictures from the image model</option>
          <option value="none">Placeholders only</option>
        </select>
      )}
      {deck.slides.length > 0 ? (
        <ConfirmButton className="btn btn-primary" confirm={`Click again: replace all ${deck.slides.length} slides`} onConfirm={() => run()} disabled={!!running}>
          {running ? <span className="spin" /> : "Regenerate deck"}
        </ConfirmButton>
      ) : (
        <button className="btn btn-primary" onClick={() => run()} disabled={!!running}>{running ? <span className="spin" /> : "Generate deck"}</button>
      )}
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
