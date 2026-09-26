import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ANGLES, composeAudience, composeBrief, DEFAULT_FEATURES, FEATURE_LABELS, LENGTH_CHOICES, THEME_PRESETS, type Features, type OneDriveLink, type SourceRef } from "@slidecraft/shared";
import { api, type Design, type Job } from "../api";
import { toast } from "../components/Toast";
import { BriefPicker, defaultPromptIds, EMPTY_BRIEF, type BriefValue } from "../components/BriefPicker";
import { ThemeCards } from "../components/ThemeCards";
import { DropZone } from "../components/DropZone";
import { OneDriveBox } from "../components/OneDriveBox";
import type { PathedFile } from "../lib/files";
import { explainFailure } from "../lib/errors";

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
  const [params] = useSearchParams();
  const [designId, setDesignId] = useState<string | undefined>(params.get("design") ?? undefined);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [startError, setStartError] = useState("");
  // Auto: the AI reads the material and chooses the angle, audience, length and layouts.
  const [auto, setAuto] = useState(true);
  const prompt = composeBrief(brief);
  const audience = composeAudience(brief.audiences, brief.audienceText);

  useEffect(() => {
    api.settings().then((s) => setThemeId(s.defaultTheme)).catch(() => {});
    api.designs().then(setDesigns).catch(() => {});
    // A design added in the other tab shows up on coming back, and the wizard keeps its place.
    const refresh = () => api.designs().then(setDesigns).catch(() => {});
    window.addEventListener("focus", refresh);
    defaultPromptIds().then((prompts) => setBrief((b) => ({ ...b, prompts })));
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // The deck row exists from step 2 so uploads have somewhere to go.
  const ensureDeck = async (): Promise<string> => {
    if (deckId) return deckId;
    const d = await api.createDeck({ title, lang, angle, themeId, designId });
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

  const start = async (allowUnreadPictures = false) => {
    setJob(null);
    setStartError("");
    setStep(4);
    try {
      const existed = !!deckId;
      const id = await ensureDeck();
      // The deck may have been created at the Sources step, before a design was picked.
      if (existed) {
        if (designId) await api.applyDesign(id, designId);
        else await api.applyPreset(id, themeId);
      }
      const { jobId } = await api.generate(id, { prompt, auto, title, lang, angle, audience, slides, features, imageMode, allowUnreadPictures, brief: { text: brief.text, purposes: brief.purposes, include: brief.include, audiences: brief.audiences, prompts: brief.prompts } });
      const tick = async () => {
        try {
          const j = await api.job(jobId);
          setJob(j);
          if (j.status === "done") {
            toast("Deck ready");
            nav(`/deck/${id}`);
          } else if (j.status !== "failed") setTimeout(tick, 1500);
        } catch (e) {
          setStartError((e as Error).message);
        }
      };
      tick();
    } catch (e) {
      setStartError((e as Error).message);
    }
  };

  const hasPictures = sources.some((s) => s.kind === "image");
  const canNext = step === 0 ? auto || prompt.trim().length > 10 : true;
  const briefHint = step === 0 && !canNext ? "Tick what the deck is for, or type a few words." : "";
  // Auto skips the Angle step; the Features step keeps only the design.
  const next = () => setStep((s) => (auto && s === 1 ? 3 : s + 1) as Step);
  const back = () => setStep((s) => Math.max(0, auto && s === 3 ? 1 : s - 1) as Step);

  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <h1 style={{ marginBottom: 6 }}>New deck</h1>
      <p className="muted" style={{ marginBottom: 20 }}>Brief, sources, angle, features. The writer works only from what you give it and marks what it cannot source.</p>
      <div className="steps">
        {STEPS.map((s, i) => (
          <>
            <div key={s} className={"s" + (i === step ? " on" : i < step ? " done" : "")}><span className="n">{i < step ? "✓" : i + 1}</span>{auto && i === 2 ? "Angle: AI" : auto && i === 3 ? "Design" : s}</div>
            {i < STEPS.length - 1 && <div key={s + "bar"} className="bar" />}
          </>
        ))}
      </div>

      {step === 0 && (
        <div className="card stack">
          <label className={"toggle" + (auto ? " on" : "")} data-testid="auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <div>
              <b>Auto: let the AI decide</b>
              <span>Nothing to fill in. The AI reads your sources and chooses the angle, audience, number of slides and layouts, then builds the deck to a professional standard (kicker labels, action titles, an at-a-glance slide, verdict tags, next steps). Anything you tick or type below still steers it.</span>
            </div>
          </label>
          <label className="f">
            Deck title <span className="h">Optional. The writer proposes one if empty.</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Salicylic acid: what the 2026 amendment changes for our range" />
          </label>
          {auto ? (
            <details>
              <summary className="small">Steer it (optional)</summary>
              <BriefPicker value={brief} onChange={setBrief} />
            </details>
          ) : (
            <BriefPicker value={brief} onChange={setBrief} />
          )}
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
          {sources.length === 0 && <p className="small muted">No sources yet. You can continue without any; the writer then works from the brief alone and leaves out figures it cannot stand behind.</p>}
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
          {!auto && <div className="card stack">
            <h3>Length and theme</h3>
            <div className="grid c2">
              <label className="f">
                Slides
                <select value={slides} onChange={(e) => setSlides(Number(e.target.value))}>
                  {LENGTH_CHOICES.map((c) => <option key={c.slides} value={c.slides}>{c.label}</option>)}
                </select>
              </label>
            </div>
          </div>}
          <div className="card stack">
            <div className="row between">
              <h3>Design</h3>
              <a href="/designs" target="_blank" rel="noopener" className="small">Add a reference design (opens in a new tab)</a>
            </div>
            <ThemeCards
              width={190}
              lang={lang}
              options={[...designs.map((d) => ({ key: d.id, name: d.name, theme: d.theme, mine: true, hint: d.notes })), ...THEME_PRESETS.map((t) => ({ key: t.id, name: t.name, theme: t }))]}
              isOn={(o) => (o.mine ? designId === o.key : !designId && themeId === o.key)}
              onPick={(o) => (o.mine ? setDesignId(o.key) : (setDesignId(undefined), setThemeId(o.key)))}
            />
            <span className="small muted">Your designs also carry notes the writer follows (title length, text per slide). Colours and fonts can be changed later in the editor.</span>
          </div>
          {auto && <p className="small muted">Auto chooses the length and the layouts from your material, and uses your uploaded pictures if there are any. Untick Auto on the first step to choose them yourself.</p>}
          {!auto && <div className="card stack">
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
          </div>}
        </div>
      )}

      {step === 4 && (() => {
        const failed = job?.status === "failed" || !!startError;
        const why = failed ? explainFailure(startError || job?.error || "") : null;
        return (
          <div className="card stack">
            <div className="row">
              {!failed && <span className="spin" />}
              <h3>{failed ? "The deck was not written" : "Writing the deck"}</h3>
            </div>
            {why && (
              <div className="banner danger" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                <b>{why.what}</b>
                <span>{why.todo}</span>
              </div>
            )}
            {(job?.progress?.length || !failed) && <div className="log">{(job?.progress ?? ["Starting"]).join("\n")}</div>}
            {failed && why?.anyway && <p className="small muted">Pictures pulled from OneDrive are never read; they are slide pictures. This is only about pictures you uploaded as sources.</p>}
            {failed && (
              <div className="row">
                <button className="btn btn-quiet" onClick={() => setStep(3)}>← Back</button>
                <button className="btn btn-primary" onClick={() => start()}>Try again</button>
                {why?.anyway && <button className="btn btn-ghost" onClick={() => start(true)}>Write anyway (pictures as slide pictures only)</button>}
                {why?.settings && <Link className="btn btn-ghost" to="/settings" target="_blank">Open Settings</Link>}
                <button className="btn btn-ghost" onClick={() => setStep(auto ? 0 : 3)}>Change the choices</button>
                {deckId && <button className="btn btn-quiet" onClick={() => nav(`/deck/${deckId}`)}>Open the deck</button>}
              </div>
            )}
            {failed && <p className="small muted">Your brief, sources and choices are kept. Try again uses them exactly as they are.</p>}
          </div>
        );
      })()}

      {step < 4 && (
        <div className="row between" style={{ marginTop: 20 }}>
          <button className="btn btn-quiet" onClick={back} disabled={step === 0}>Back</button>
          {step < 3 ? (
            <span className="row">
              {briefHint && <span className="small muted">{briefHint}</span>}
              <button className="btn btn-primary" onClick={next} disabled={!canNext}>Continue</button>
            </span>
          ) : (
            <button className="btn btn-primary" onClick={() => start()}>{auto ? "Generate (AI decides)" : `Generate ${slides} slides`}</button>
          )}
        </div>
      )}
    </main>
  );
}
