import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { KIND_INFO, REPORT_FORMATS, type ChatAnswer, type Deck, type KindInfo, type ModelChoice, type NotebookGuide, type Output, type SourceRef, type StudioOptions } from "@slidecraft/shared";
import { api, type Job } from "../api";
import { DropZone } from "../components/DropZone";
import { LinkSourceBox, NotRead } from "../components/SourceReview";
import { OutputBody, OutputDownloads } from "../components/OutputView";
import { ConfirmButton } from "../components/ConfirmButton";
import { toast } from "../components/Toast";

// The notebook: a deck's sources on the left, a chat that answers from them in
// the middle, and the Studio on the right, where the same sources become a
// slide deck, a report, flashcards, a quiz, a mind map, a data table or an
// infographic. Modelled on the way NotebookLM lays out the same work.

type Msg = { role: "user" | "assistant"; text: string; answer?: ChatAnswer; error?: boolean };
interface Running {
  jobId: string;
  label: string;
  progress: string[];
  status: string;
  error?: string | null;
  slides?: boolean;
}

const KIND_ICON: Record<string, string> = { slides: "▭", report: "≡", flashcards: "❏", quiz: "?", mindmap: "⋔", table: "▦", infographic: "◧", note: "✎" };

const store = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private window: the chat simply is not kept */
    }
  },
};

function ModelPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const [list, setList] = useState<ModelChoice[]>([]);
  const [current, setCurrent] = useState("");
  useEffect(() => {
    api.models().then((m) => {
      setList(m.models);
      setCurrent(m.current);
    }).catch(() => undefined);
  }, []);
  if (list.length < 2) return current ? <span className="pill" title="The AI model in use">{current}</span> : null;
  return (
    <select className="nb-model" value={value || current} onChange={(e) => onChange(e.target.value === current ? "" : e.target.value)} title="The AI model for chat and the Studio" data-testid="model-picker">
      {list.map((m) => <option key={m.id} value={m.id}>{m.label}{m.id === current ? " (default)" : ""}</option>)}
    </select>
  );
}

function StudioDialog({ info, deck, sources, onClose, onStart }: { info: KindInfo | "slides"; deck: Deck; sources: number; onClose: () => void; onStart: (o: StudioOptions | { slides: true; prompt: string; count: number | null; lang: "en" | "ms" }) => void }) {
  const [prompt, setPrompt] = useState("");
  const [lang, setLang] = useState<"en" | "ms">(deck.lang);
  const [amount, setAmount] = useState<"fewer" | "standard" | "more">("standard");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [format, setFormat] = useState<StudioOptions["format"]>("briefing");
  const [length, setLength] = useState<"short" | "default">("default");
  const [count, setCount] = useState<number | null>(null);
  const slides = info === "slides";
  const name = slides ? "Slide deck" : info.name;
  const seg = <T extends string>(val: T, set: (v: T) => void, opts: [T, string][]) => (
    <div className="seg">{opts.map(([v, l]) => <button key={v} className={val === v ? "on" : ""} onClick={() => set(v)}>{val === v ? "✓ " : ""}{l}</button>)}</div>
  );
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal nb-dialog" onClick={(e) => e.stopPropagation()} data-testid="studio-dialog">
        <div className="row between"><h2>{KIND_ICON[slides ? "slides" : info.kind]} {name}</h2><button className="btn btn-quiet btn-sm" onClick={onClose}>✕</button></div>
        <p className="small muted" style={{ margin: "6px 0 14px" }}>{slides ? "A designed slide deck from these sources, in the notebook's design. It replaces any slides already written." : info.blurb}</p>
        {!slides && info.format && (
          <div className="field"><label>Format</label>
            <div className="nb-formats">{REPORT_FORMATS.map((f) => <button key={f.id} className={`card tight pick${format === f.id ? " on" : ""}`} onClick={() => setFormat(f.id)}><b>{f.name}</b><span className="small muted">{f.hint}</span></button>)}</div>
          </div>
        )}
        <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
          <div className="field"><label>Language</label>{seg(lang, setLang, [["en", "English"], ["ms", "Bahasa Malaysia"]])}</div>
          {!slides && info.amount && <div className="field"><label>{info.kind === "table" ? "Rows" : info.kind === "quiz" ? "Questions" : "Cards"}</label>{seg(amount, setAmount, [["fewer", "Fewer"], ["standard", "Standard"], ["more", "More"]])}</div>}
          {!slides && info.difficulty && <div className="field"><label>Difficulty</label>{seg(difficulty, setDifficulty, [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]])}</div>}
          {!slides && info.length && <div className="field"><label>Length</label>{seg(length, setLength, [["short", "Short"], ["default", "Default"]])}</div>}
          {slides && <div className="field"><label>Slides</label>{seg(String(count ?? "auto"), (v) => setCount(v === "auto" ? null : Number(v)), [["auto", "AI decides"], ["8", "8"], ["12", "12"], ["20", "20"]])}</div>}
          <div className="field"><label>Sources</label><span className="pill">{sources} selected</span></div>
        </div>
        <div className="field">
          <label>{slides ? "Describe the deck you want" : "What should it focus on?"} <span className="help">Optional</span></label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={slides ? "Audience, purpose and focus, e.g. \"A 10-minute briefing for dermatologists on what changed\"" : info.placeholder} />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" data-testid="studio-generate" onClick={() => onStart(slides ? { slides: true, prompt, count, lang } : { kind: info.kind, prompt: prompt || undefined, lang, amount, difficulty, format, length })}>Generate</button>
        </div>
      </div>
    </div>
  );
}

function Answer({ a, onAsk, onSave }: { a: ChatAnswer; onAsk: (q: string) => void; onSave: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="nb-answer">
      <p style={{ whiteSpace: "pre-wrap" }}>{a.answer}</p>
      {a.citations.length > 0 && (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          {a.citations.map((c, i) => <button key={i} className={`nb-cite${open === i ? " on" : ""}`} title={c.source} onClick={() => setOpen(open === i ? null : i)}>{i + 1}</button>)}
        </div>
      )}
      {open !== null && a.citations[open] && <div className="nb-quote small"><b>{a.citations[open].source}</b><br />“{a.citations[open].quote}”</div>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-quiet btn-xs" onClick={onSave}>Save to note</button>
        <button className="btn btn-quiet btn-xs" onClick={() => navigator.clipboard?.writeText(a.answer)}>Copy</button>
        {a.model && <span className="small muted">{a.model}</span>}
      </div>
      {a.followUps.length > 0 && <div className="chips">{a.followUps.map((q) => <button key={q} className="chip" onClick={() => onAsk(q)}>{q}</button>)}</div>}
    </div>
  );
}

/** One notebook per address: moving to another notebook starts its own chat and choices afresh. */
export default function NotebookPage() {
  const { id = "" } = useParams();
  return <Notebook key={id} id={id} />;
}

function Notebook({ id }: { id: string }) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [off, setOff] = useState<Set<string>>(() => new Set(store.get<string[]>(`sc-off-${id}`, [])));
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [open, setOpen] = useState<Output | null>(null);
  const [guide, setGuide] = useState<NotebookGuide | null>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => store.get<Msg[]>(`sc-chat-${id}`, []));
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [model, setModel] = useState<string>(() => store.get("sc-model", ""));
  const [dialog, setDialog] = useState<KindInfo | "slides" | null>(null);
  const [running, setRunning] = useState<Running[]>([]);
  const [busy, setBusy] = useState(false);
  const [notRead, setNotRead] = useState<string[]>([]);
  const [paste, setPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null);

  const chosen = useMemo(() => sources.filter((s) => !off.has(s.id)), [sources, off]);
  const sourceIds = chosen.length === sources.length ? undefined : chosen.map((s) => s.id);

  const reloadOutputs = () => api.outputs(id).then(setOutputs).catch(() => undefined);
  const reloadSources = () => api.sources(id).then(setSources).catch(() => undefined);
  useEffect(() => {
    api.deck(id).then((r) => {
      setDeck(r.deck);
      setSources(r.deck.sources);
      if (r.deck.guide) setGuide(r.deck.guide);
    }).catch((e) => toast((e as Error).message, true));
    reloadOutputs();
  }, [id]);
  useEffect(() => store.set(`sc-chat-${id}`, msgs.slice(-60)), [msgs, id]);
  useEffect(() => store.set(`sc-off-${id}`, [...off]), [off, id]);
  useEffect(() => store.set("sc-model", model), [model]);
  useEffect(() => chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs.length, asking]);
  // The guide is written once for each set of sources, the first time the notebook opens with them.
  const key = sources.map((s) => `${s.id}:${s.chars}`).join(",");
  useEffect(() => {
    if (!sources.length || (guide && guide.sourceKey === key) || guideBusy) return;
    setGuideBusy(true);
    api.guide(id).then(setGuide).catch(() => undefined).finally(() => setGuideBusy(false));
  }, [key]);

  // Background work, polled until it finishes.
  useEffect(() => {
    if (!running.some((r) => r.status === "queued" || r.status === "running")) return;
    const t = setInterval(async () => {
      for (const r of running.filter((x) => x.status === "queued" || x.status === "running")) {
        try {
          const j: Job = await api.job(r.jobId);
          setRunning((all) => all.map((x) => (x.jobId === r.jobId ? { ...x, status: j.status, progress: j.progress, error: j.error } : x)));
          if (j.status === "done") {
            if (r.slides) {
              const d = await api.deck(id);
              setDeck(d.deck);
              toast("The slide deck is ready");
            } else {
              await reloadOutputs();
              if (j.result?.outputId) api.output(j.result.outputId).then(setOpen).catch(() => undefined);
            }
          }
          if (j.status === "failed") toast(j.error || "It could not be made", true);
        } catch {
          /* a dropped poll is retried on the next tick */
        }
      }
    }, 2000);
    return () => clearInterval(t);
  }, [running]);

  const start = async (o: StudioOptions | { slides: true; prompt: string; count: number | null; lang: "en" | "ms" }) => {
    setDialog(null);
    try {
      if ("slides" in o) {
        const prompt = o.prompt.trim() || "Build the strongest professional deck the sources support. Work out the purpose, the audience and the one conclusion from the material itself.";
        const { jobId } = await api.generate(id, { prompt, auto: !o.count, slides: o.count ?? undefined, title: deck?.title, lang: o.lang, angle: deck?.angle, model: model || undefined, allowUnreadPictures: true });
        setRunning((r) => [{ jobId, label: "Slide deck", progress: [], status: "queued", slides: true }, ...r]);
      } else {
        const { jobId } = await api.studio(id, { ...o, model: model || undefined, sourceIds });
        setRunning((r) => [{ jobId, label: KIND_INFO.find((k) => k.kind === o.kind)!.name, progress: [], status: "queued" }, ...r]);
      }
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || asking) return;
    setQ("");
    const history = msgs.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text }]);
    setAsking(true);
    try {
      const a = await api.ask(id, { question: text, history, model: model || undefined, sourceIds });
      setMsgs((m) => [...m, { role: "assistant", text: a.answer, answer: a }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: (e as Error).message, error: true }]);
    } finally {
      setAsking(false);
    }
  };

  const saveNote = async (question: string, a: ChatAnswer) => {
    try {
      await api.saveNote(id, { title: question.slice(0, 80), data: { text: a.answer, question, citations: a.citations } });
      await reloadOutputs();
      toast("Saved to notes");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const addFiles = async (files: { file: File; path: string }[]) => {
    setBusy(true);
    try {
      const r = await api.uploadSources(id, files);
      if (r.skipped?.length) setNotRead((n) => [...n, ...r.skipped]);
      await reloadSources();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const addPaste = async () => {
    if (!pasteText.trim()) return;
    setBusy(true);
    try {
      await api.addText(id, pasteName.trim() || "Pasted text", pasteText);
      setPasteText("");
      setPasteName("");
      setPaste(false);
      await reloadSources();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  if (!deck) return <main className="page"><p className="muted">Loading</p></main>;
  const live = running.filter((r) => r.status === "queued" || r.status === "running" || r.status === "failed");
  return (
    <main className="nb" data-testid="notebook">
      <div className="nb-top row between">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <Link to="/" className="btn btn-quiet btn-sm">← Notebooks</Link>
          <h1 className="nb-title" title={deck.title}>{deck.title}</h1>
          <span className="pill">{sources.length} source{sources.length === 1 ? "" : "s"}</span>
        </div>
        <div className="row">
          <ModelPicker value={model} onChange={setModel} />
          {deck.slides.length > 0 && <Link to={`/deck/${id}`} className="btn btn-ghost btn-sm">Open slides</Link>}
        </div>
      </div>
      <div className="nb-cols">
        <section className="nb-col nb-sources">
          <div className="row between"><h4>Sources</h4>{sources.length > 0 && <button className="btn btn-quiet btn-xs" onClick={() => setOff(off.size ? new Set() : new Set(sources.map((s) => s.id)))}>{off.size ? "Select all" : "Select none"}</button>}</div>
          <DropZone onFiles={addFiles} busy={busy} compact />
          <LinkSourceBox compact getDeckId={async () => id} onAdded={() => reloadSources()} onNotRead={(x) => setNotRead((n) => [...n, ...x])} />
          {paste ? (
            <div className="card tight stack">
              <input type="text" placeholder="Name" value={pasteName} onChange={(e) => setPasteName(e.target.value)} />
              <textarea placeholder="Paste text, notes or a transcript" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
              <div className="row"><button className="btn btn-ghost btn-sm" disabled={busy || !pasteText.trim()} onClick={addPaste}>Add</button><button className="btn btn-quiet btn-sm" onClick={() => setPaste(false)}>Cancel</button></div>
            </div>
          ) : <button className="btn btn-quiet btn-sm" onClick={() => setPaste(true)}>+ Paste text</button>}
          <NotRead items={notRead} onDismiss={() => setNotRead([])} />
          <div className="nb-srclist" data-testid="nb-sources">
            {sources.map((s) => (
              <div key={s.id} className={`nb-src${s.check?.level === "fail" ? " bad" : ""}`} title={s.check?.note ?? s.name}>
                <label>
                  <input type="checkbox" checked={!off.has(s.id)} onChange={() => setOff((o) => { const n = new Set(o); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
                  <span className="k">{s.kind}</span>
                  <span className="n">{s.name}</span>
                </label>
                <ConfirmButton className="btn btn-quiet btn-xs" confirm="Remove?" onConfirm={() => api.deleteSource(s.id).then(reloadSources)}>✕</ConfirmButton>
              </div>
            ))}
            {!sources.length && <p className="small muted">Add files, a Google Drive link or pasted text. Everything here answers from these sources only.</p>}
          </div>
        </section>

        <section className="nb-col nb-chat">
          <div className="nb-msgs">
            {sources.length > 0 && (
              <div className="nb-guide" data-testid="nb-guide">
                {guide ? (
                  <>
                    <p>{guide.summary}</p>
                    {guide.topics.length > 0 && <div className="chips">{guide.topics.map((t) => <span key={t} className="pill brand">{t}</span>)}</div>}
                    {msgs.length === 0 && <div className="nb-starters">{guide.questions.map((x) => <button key={x} className="card tight pick" onClick={() => ask(x)}>{x}<span className="muted"> ↳</span></button>)}</div>}
                  </>
                ) : <p className="muted small">{guideBusy ? <><span className="spin" /> Reading the sources</> : "Ask anything about the sources."}</p>}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`nb-msg ${m.role}${m.error ? " err" : ""}`}>
                {m.role === "assistant" && m.answer ? <Answer a={m.answer} onAsk={ask} onSave={() => saveNote(msgs[i - 1]?.text ?? "", m.answer!)} /> : <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>}
              </div>
            ))}
            {asking && <div className="nb-msg assistant"><span className="spin" /> <span className="muted small">Reading the sources</span></div>}
            <div ref={chatEnd} />
          </div>
          <div className="nb-ask">
            {msgs.length > 0 && <button className="btn btn-quiet btn-xs" onClick={() => setMsgs([])}>Clear chat</button>}
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(q)} placeholder={sources.length ? "Ask a question about the sources" : "Add a source to start"} disabled={!sources.length} data-testid="nb-question" />
              <span className="small muted" style={{ whiteSpace: "nowrap" }}>{chosen.length} source{chosen.length === 1 ? "" : "s"}</span>
              <button className="btn btn-primary btn-sm" disabled={!q.trim() || asking || !sources.length} onClick={() => ask(q)} data-testid="nb-ask">Ask</button>
            </div>
          </div>
        </section>

        <section className="nb-col nb-studio">
          <h4>Studio</h4>
          <div className="nb-tiles">
            <button className="nb-tile" disabled={!sources.length} onClick={() => setDialog("slides")}><span className="ic">{KIND_ICON.slides}</span>Slide deck</button>
            {KIND_INFO.map((k) => (
              <button key={k.kind} className="nb-tile" disabled={!sources.length} onClick={() => setDialog(k)} data-testid={`tile-${k.kind}`}><span className="ic">{KIND_ICON[k.kind]}</span>{k.name}</button>
            ))}
          </div>
          {live.map((r) => (
            <div key={r.jobId} className={`card tight nb-job${r.status === "failed" ? " bad" : ""}`}>
              <div className="row between"><b className="small">{r.status === "failed" ? "✕" : <span className="spin" />} {r.label}</b>{r.status === "failed" && <button className="btn btn-quiet btn-xs" onClick={() => setRunning((x) => x.filter((y) => y.jobId !== r.jobId))}>Dismiss</button>}</div>
              <span className="small muted">{r.status === "failed" ? r.error : r.progress[r.progress.length - 1] ?? "Waiting for the AI to start"}</span>
            </div>
          ))}
          <div className="nb-outs" data-testid="nb-outputs">
            {deck.slides.length > 0 && (
              <Link to={`/deck/${id}`} className="nb-out"><span className="ic">{KIND_ICON.slides}</span><span><b>Slide deck</b><span className="small muted">{deck.slides.length} slides</span></span></Link>
            )}
            {outputs.map((o) => (
              <button key={o.id} className="nb-out" onClick={() => setOpen(o)}>
                <span className="ic">{KIND_ICON[o.kind]}</span>
                <span><b>{o.title}</b><span className="small muted">{o.kind === "note" ? "Note" : KIND_INFO.find((k) => k.kind === o.kind)?.name}{o.sourceCount ? ` · ${o.sourceCount} source${o.sourceCount === 1 ? "" : "s"}` : ""}{o.model ? ` · ${o.model}` : ""}</span></span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {dialog && deck && <StudioDialog info={dialog} deck={deck} sources={chosen.length} onClose={() => setDialog(null)} onStart={start} />}
      {open && (
        <div className="modal-bg" onClick={() => setOpen(null)}>
          <div className="modal nb-viewer" onClick={(e) => e.stopPropagation()} data-testid="output-viewer">
            <div className="row between" style={{ marginBottom: 12 }}>
              <h2>{KIND_ICON[open.kind]} {open.title}</h2>
              <button className="btn btn-quiet btn-sm" onClick={() => setOpen(null)}>✕</button>
            </div>
            <div className="nb-viewbody"><OutputBody o={open} /></div>
            <div className="row between" style={{ marginTop: 14 }}>
              <OutputDownloads o={open} />
              <ConfirmButton confirm="Click again to delete" onConfirm={async () => { await api.deleteOutput(open.id); setOpen(null); reloadOutputs(); }}>Delete</ConfirmButton>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
