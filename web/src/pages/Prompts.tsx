import { useEffect, useState } from "react";
import { api, type SavedPrompt } from "../api";
import { ConfirmButton } from "../components/ConfirmButton";
import { toast } from "../components/Toast";

// Saved prompts: instructions written once and ticked on any deck. The ones
// marked "tick by default" start ticked on every new deck.

const EXAMPLES = [
  { name: "Malaysia first", text: "Cite NPRA, JAKIM or KKM instruments before any EU or other source. Use Malaysian examples and ringgit." },
  { name: "Plain words for brand owners", text: "Write for a brand owner with no regulatory background. Explain each term the first time it appears." },
  {
    name: "Deck standard",
    text: [
      "Build every deck to a professional consultancy standard.",
      "1. Structure: title; an at-a-glance slide that gives the answer and the 3 or 4 numbers or decisions behind it; the evidence, one point per slide; a caveats slide if the evidence is thin; decisions and next steps as numbered cards (owner, action, date); references; closing.",
      "2. Every content slide has a kicker (a 1 to 4 word uppercase label such as AT A GLANCE, THE EVIDENCE, COSTING, NEXT STEPS), an action title under 12 words that states the conclusion with its number, and a one-sentence reading line under the title.",
      "3. One visual per slide, chosen by the content: figures as big-number tiles or a chart; a process or plan as a flow or timeline; a comparison as a table or two columns; points, answers, risks or steps as numbered cards. Never two plain bullet slides in a row.",
      "4. Show judgements as verdict tags: YES / PARTLY / NO, HIGH / MEDIUM / LOW, PASS / FAIL.",
      "5. Every chart and table names its source. Cite the instrument, clause or paper, never a blog.",
      "6. Density follows the audience: experts, clinicians and management get 80 to 160 words a slide; consumers and trade get under 60. Speaker notes on every slide carry the argument and the caveats.",
    ].join("\n"),
  },
  { name: "Numbers up front", text: "Lead each slide with the figure or date that matters, then the explanation." },
];

export default function Prompts() {
  const [list, setList] = useState<SavedPrompt[] | null>(null);
  const [edit, setEdit] = useState<{ id?: string; name: string; text: string; isDefault: boolean } | null>(null);
  const load = () => api.prompts().then(setList).catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
  }, []);
  const save = async () => {
    if (!edit) return;
    try {
      if (edit.id) await api.updatePrompt(edit.id, edit);
      else await api.addPrompt(edit);
      setEdit(null);
      load();
      toast("Prompt saved");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <main className="page stack" style={{ maxWidth: 820 }}>
      <div className="row between">
        <div>
          <h1>Prompts</h1>
          <p className="muted">Instructions you give the writer on every deck, written once. Tick them in the brief; the ones marked default start ticked.</p>
        </div>
        {!edit && <button className="btn btn-primary" onClick={() => setEdit({ name: "", text: "", isDefault: false })}>New prompt</button>}
      </div>
      {edit && (
        <div className="card stack">
          <label className="f">
            Name <span className="h">Shown as the tick box.</span>
            <input type="text" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Malaysia first" />
          </label>
          <label className="f">
            Instruction
            <textarea rows={5} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} placeholder="What the writer should always do." />
          </label>
          <label className="row small"><input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} /> Tick by default on new decks</label>
          {!edit.id && (
            <div className="chips" style={{ marginTop: 0 }}>
              <span className="small muted">Start from:</span>
              {EXAMPLES.map((x) => <button key={x.name} className="chip" onClick={() => setEdit({ ...edit, ...x })}>{x.name}</button>)}
            </div>
          )}
          <div className="row">
            <button className="btn btn-primary" onClick={save} disabled={!edit.name.trim() || !edit.text.trim()}>Save</button>
            <button className="btn btn-quiet" onClick={() => setEdit(null)}>Cancel</button>
          </div>
          <p className="small muted">The writer follows these unless they clash with its fact rules: it never invents a fee, date or clause, whatever a prompt says.</p>
        </div>
      )}
      {list === null && <p className="muted">Loading</p>}
      {list && list.length === 0 && !edit && <p className="muted">No saved prompts yet.</p>}
      {list?.map((p) => (
        <div key={p.id} className="card tight stack">
          <div className="row between">
            <b>{p.name} {p.isDefault && <span className="pill brand">default</span>}</b>
            <span className="row">
              <button className="btn btn-ghost btn-xs" onClick={() => setEdit({ id: p.id, name: p.name, text: p.text, isDefault: p.isDefault })}>Edit</button>
              <ConfirmButton className="btn btn-quiet btn-xs" confirm="Click again to delete" onConfirm={() => api.deletePrompt(p.id).then(load)}>Delete</ConfirmButton>
            </span>
          </div>
          <p className="small" style={{ whiteSpace: "pre-line" }}>{p.text}</p>
        </div>
      ))}
    </main>
  );
}
