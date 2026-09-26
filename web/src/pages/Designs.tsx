import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { blankSlide } from "@slidecraft/shared";
import { api, mediaUrl, type Design } from "../api";
import { ConfirmButton } from "../components/ConfirmButton";
import { DropZone } from "../components/DropZone";
import { SlideFrame } from "../components/SlideFrame";
import { toast } from "../components/Toast";
import type { PathedFile } from "../lib/files";

// Reference designs: drop a PowerPoint, a PDF or a screenshot of slides you
// like; Slidecraft reads its colours, fonts and density and keeps it here to
// pick for any deck.

function sample(d: Design) {
  const s = blankSlide("bullets", "en");
  return { ...s, title: "What the reference looks like", bullets: ["Colours and fonts read from your file", `Headings in ${d.theme.fontDisplay}, body in ${d.theme.fontBody}`, "Every deck using it can still be edited"] };
}

export default function Designs() {
  const [list, setList] = useState<Design[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.designs().then(setList).catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
  }, []);

  const add = async (files: PathedFile[]) => {
    setBusy(true);
    try {
      const d = await api.analyseDesign(files.map((f) => f.file), name);
      setName("");
      setList((l) => [d, ...(l ?? [])]);
      toast(`Read "${d.name}"${d.analysis.warnings?.length ? ", with notes to check" : ""}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page stack" style={{ maxWidth: 1000 }}>
      <div>
        <h1>Designs</h1>
        <p className="muted">Drop a deck or a picture of slides whose look you want. Slidecraft reads the colours, fonts and how much goes on a slide, and the writer follows it for any deck you use it on.</p>
      </div>
      <div className="card stack">
        <label className="f">
          Name <span className="h">Optional. The file name is used if empty.</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client X house style" />
        </label>
        <DropZone onFiles={add} busy={busy} compact />
        <p className="small muted">
          PowerPoint (.pptx) gives the most: exact theme colours and fonts, and slide density. PDF gives colours, fonts and density. A PNG or JPEG screenshot gives colours; fonts and layout need a writer model that can see pictures (set in Settings).
        </p>
      </div>
      {list === null && <p className="muted">Loading</p>}
      {list && list.length === 0 && <p className="muted">No designs yet.</p>}
      {list?.map((d) => <DesignCard key={d.id} d={d} onChange={(x) => setList((l) => l!.map((y) => (y.id === x.id ? x : y)))} onDelete={() => setList((l) => l!.filter((y) => y.id !== d.id))} />)}
    </main>
  );
}

function DesignCard({ d, onChange, onDelete }: { d: Design; onChange: (d: Design) => void; onDelete: () => void }) {
  const [notes, setNotes] = useState(d.notes);
  const [name, setName] = useState(d.name);
  const dirty = notes !== d.notes || name !== d.name;
  const save = async () => {
    try {
      onChange(await api.updateDesign(d.id, { name, notes }));
      toast("Saved");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const del = async () => {
    await api.deleteDesign(d.id);
    onDelete();
    toast("Design deleted. Decks that used it keep their look.");
  };
  const a = d.analysis;
  return (
    <div className="card stack design-card">
      <div className="grid c2" style={{ alignItems: "start" }}>
        <div className="stack">
          <SlideFrame slide={sample(d)} theme={d.theme} index={1} total={10} lang="en" />
          {d.previewMediaId && (
            <details className="small">
              <summary className="muted">Your reference</summary>
              <img src={mediaUrl(d.previewMediaId)} alt="" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", marginTop: 6 }} />
            </details>
          )}
        </div>
        <div className="stack">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ fontWeight: 600 }} />
          <div className="row small" style={{ gap: 6 }}>
            {(["bg", "ink", "brand", "brandDeep", "accent", "gold"] as const).map((k) => <span key={k} className="sw" style={{ background: d.theme.colors[k] }} title={`${k} ${d.theme.colors[k]}`} />)}
            <span className="muted">{d.theme.fontDisplay} / {d.theme.fontBody}</span>
          </div>
          {d.sourceName && <span className="small muted">From {d.sourceName}{a.kind ? ` (${a.kind.toUpperCase()})` : ""}</span>}
          <label className="f">
            What the writer follows <span className="h">Read from the file. Edit freely: "one idea per slide", "numbers big, words few".</span>
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {a.warnings && a.warnings.length > 0 && <div className="banner warn" style={{ flexDirection: "column", alignItems: "flex-start" }}>{a.warnings.map((w) => <span key={w}>{w}</span>)}</div>}
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={save} disabled={!dirty}>Save</button>
            <Link className="btn btn-primary btn-sm" to={`/new?design=${d.id}`}>New deck with this design</Link>
            <ConfirmButton confirm="Click again to delete" onConfirm={del}>Delete</ConfirmButton>
          </div>
        </div>
      </div>
    </div>
  );
}
