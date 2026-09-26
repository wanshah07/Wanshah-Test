import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ANGLES, composeAudience, composeBrief, DEFAULT_FEATURES, FEATURE_LABELS, LENGTH_CHOICES, THEME_PRESETS, type Features, type OneDriveLink, type SourceRef } from "@slidecraft/shared";
import { api, type Job } from "../api";
import { toast } from "../components/Toast";
import { BriefPicker, EMPTY_BRIEF, type BriefValue } from "../components/BriefPicker";
import { DropZone } from "../components/DropZone";
import { OneDriveBox } from "../components/OneDriveBox";
import type { PathedFile } from "../lib/files";

type Step = 0 | 1 | 2 | 3 | 4;
const STEPS = ["Brief", "Sources", "Angle", "Features", "Generate"];

function fmtChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k chars` : `${n} chars`;
}

export default function NewDeck() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState<BriefValue>(EMPTY_BRIEF);
  const [link, setLink] = useState<OneDriveLink | undefined>(undefined);
  const [lang, setLang] = useState<"en" | "ms">("en");
  const [angle, setAngle] = useState("regulatory-briefing");
  const [features, setFeatures] = useState<Features>({ ...DEFAULT_FEATURES, ...ANGLES[0].defaults });
  const [slides, setSlides] = useState(10);
  const [imageMode, setImageMode] = useState<"none" | "uploaded" | "generate">("uploaded");
  const [themeId, setThemeId] = useState("facerinna");
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const prompt = composeBrief(brief);
  const audience = composeAudience(brief.audiences, brief.audienceText);

  useEffect(() => {
    api.settings().then((s) => setThemeId(s.defaultTheme)).catch(() => {});
  }, []);

  // The deck row exists from step 2 so uploads have somewhere to go.
  const ensureDeck = async (): Promise<string> => {
    if (deckId) return deckId;
    const d = await api.createDeck({ title, lang, angle, themeId });
    setDeckId(d.id);
    return d.id;
  };

  const pickAngle = (id: string) => {
    setAngle(id);
    const a = ANGLES.find((x) => x.id === id);
    setFeatures({ ...DEFAULT_FEATURES, ...(a?.defaults ?? {}) });
  };

  const addFiles = async (files: PathedFile[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const id = await ensureDeck();
      const r = await api.uploadSources(id, files);
      setSources((s) => [...s, ...r.added]);
      if (r.skipped.length) toast(`Skipped ${r.skipped.length} file(s) that could not be read: ${r.skipped.slice(0, 3).join(", ")}`, true);
      else toast(`Added ${r.added.length} source${r.added.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setUploading(false);
    }
  };

  const addPaste = async () => {
    if (!pasteText.trim()) return;
    const id = await ensureDeck();
    const r = await api.addText(id, pasteName, pasteText);
    setSources((s) => [...s, r]);
    setPasteName("");
    setPasteText("");
  };

  const removeSource = async (s: SourceRef) => {
    await api.deleteSource(s.id);
    setSources((x) => x.filter((y) => y.id !== s.id));
  };

  const start = async () => {
    const id = await ensureDeck();
    setStep(4);
    try {
      const { jobId } = await api.generate(id, { prompt, title, lang, angle, audience, slides, features, imageMode, brief: { text: brief.text, purposes: brief.purposes, include: brief.include, audiences: brief.audiences } });
      const tick = async () => {
        const j = await api.job(jobId);
        setJob(j);
        if (j.status === "done") {
          toast("Deck ready");
          nav(`/deck/${id}`);
        } else if (j.status === "failed") {
          toast(j.error || "Generation failed", true);
        } else setTimeout(tick, 1500);
      };
      tick();
    } catch (e) {
      toast((e as Error).message, true);
      setStep(3);
    }
  };

  const hasPictures = sources.some((s) => s.kind === "image");
  const canNext = step === 0 ? prompt.trim().length > 10 : true;
  const briefHint = step === 0 && !canNext ? "Tick what the deck is for, or type a few words." : "";

  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <h1 style={{ marginBottom: 6 }}>New deck</h1>
      <p className="muted" style={{ marginBottom: 20 }}>Brief, sources, angle, features. The writer works only from what you give it and marks what it cannot source.</p>
      <div className="steps">
        {STEPS.map((s, i) => (
          <>
            <div key={s} className={"s" + (i === step ? " on" : i < step ? " done" : "")}><span className="n">{i < step ? "✓" : i + 1}</span>{s}</div>
            {i < STEPS.length - 1 && <div key={s + "bar"} className="bar" />}
          </>
        ))}
      </div>

      {step === 0 && (
        <div className="card stack">
          <label className="f">
            Deck title <span className="h">Optional. The writer proposes one if empty.</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Salicylic acid: what the 2026 amendment changes for our range" />
          </label>
          <BriefPicker value={brief} onChange={setBrief} />
          <div>
            <b className="small">Language</b>
            <div className="chips">
              {([["en", "English"], ["ms", "Bahasa Malaysia"]] as const).map(([v, l]) => (
                <label key={v} className={"chip" + (lang === v ? " on" : "")}>
                  <input type="radio" name="lang" checked={lang === v} onChange={() => setLang(v)} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <DropZone onFiles={addFiles} busy={uploading} />
          <OneDriveBox getDeckId={ensureDeck} link={link} onImported={(src, l) => { setSources(src.length ? src : sources); setLink(l); }} />
          <div className="card tight stack">
            <div className="row between"><b className="small">Paste text</b><span className="small muted">Notes, an email, a clause you copied.</span></div>
            <input type="text" value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Name this source" />
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder="Paste here" />
            <div className="row"><button className="btn btn-ghost btn-sm" onClick={addPaste} disabled={!pasteText.trim()}>Add text</button></div>
          </div>
          {sources.length > 0 && (
            <div className="srcs">
              {sources.map((s) => (
                <div key={s.id} className="src">
                  <span className="k">{s.kind}</span>
                  <span className="n" title={s.name}>{s.name}</span>
                  <span className="muted">{s.kind === "image" ? "picture" : fmtChars(s.chars)}</span>
                  <button className="btn btn-quiet btn-xs" onClick={() => removeSource(s)}>Remove</button>
                </div>
              ))}
            </div>
          )}
          {sources.length === 0 && <p className="small muted">No sources yet. You can continue without any; every fact the writer is unsure of will carry a [SAHKAN] marker.</p>}
        </div>
      )}

      {step === 2 && (
        <div className="grid c2">
          {ANGLES.map((a) => (
            <div key={a.id} className={"card pick" + (angle === a.id ? " on" : "")} onClick={() => pickAngle(a.id)}>
              <div className="row between"><h3>{a.name}</h3><span className="pill">{a.hat}</span></div>
              <p className="small" style={{ margin: "8px 0" }}>{a.summary}</p>
              {a.skeleton.length > 0 && <p className="small muted">{a.skeleton.join(" → ")}</p>}
            </div>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <div className="card stack">
            <h3>Length and theme</h3>
            <div className="grid c2">
              <label className="f">
                Slides
                <select value={slides} onChange={(e) => setSlides(Number(e.target.value))}>
                  {LENGTH_CHOICES.map((c) => <option key={c.slides} value={c.slides}>{c.label}</option>)}
                </select>
              </label>
              <label className="f">
                Theme <span className="h">Change any colour or font later in the editor.</span>
                <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
                  {THEME_PRESETS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="card stack">
            <h3>Features</h3>
            <div className="grid c2">
              {(Object.keys(FEATURE_LABELS) as (keyof Features)[]).map((k) => (
                <label key={k} className={"toggle" + (features[k] ? " on" : "")}>
                  <input type="checkbox" checked={features[k]} onChange={(e) => setFeatures({ ...features, [k]: e.target.checked })} />
                  <div><b>{FEATURE_LABELS[k].label}</b><span>{FEATURE_LABELS[k].help}</span></div>
                </label>
              ))}
            </div>
            {features.images && (
              <label className="f" style={{ maxWidth: 420 }}>
                Pictures come from
                <select value={imageMode} onChange={(e) => setImageMode(e.target.value as typeof imageMode)}>
                  <option value="uploaded">Uploaded files{hasPictures ? "" : " (none uploaded yet)"}</option>
                  <option value="generate">The image model (costs credits, at most 4 per deck)</option>
                  <option value="none">Nowhere: leave a labelled placeholder</option>
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card stack">
          <div className="row">
            {job?.status !== "failed" && <span className="spin" />}
            <h3>{job?.status === "failed" ? "Generation failed" : "Writing the deck"}</h3>
          </div>
          <div className="log">{(job?.progress ?? ["Starting"]).join("\n")}</div>
          {job?.status === "failed" && (
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
              {deckId && <button className="btn btn-quiet" onClick={() => nav(`/deck/${deckId}`)}>Open the empty deck anyway</button>}
            </div>
          )}
        </div>
      )}

      {step < 4 && (
        <div className="row between" style={{ marginTop: 20 }}>
          <button className="btn btn-quiet" onClick={() => setStep((s) => Math.max(0, s - 1) as Step)} disabled={step === 0}>Back</button>
          {step < 3 ? (
            <span className="row">
              {briefHint && <span className="small muted">{briefHint}</span>}
              <button className="btn btn-primary" onClick={() => setStep((s) => (s + 1) as Step)} disabled={!canNext}>Continue</button>
            </span>
          ) : (
            <button className="btn btn-primary" onClick={start}>Generate {slides} slides</button>
          )}
        </div>
      )}
    </main>
  );
}
