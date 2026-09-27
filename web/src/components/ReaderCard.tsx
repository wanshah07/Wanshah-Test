import { useState } from "react";
import { api, type Settings } from "../api";
import { toast } from "./Toast";

// A second endpoint that only reads uploaded pictures and hands their content
// to the writer, so a writer that cannot see (a text model on Mireld) still
// gets what a poster or a table screenshot says.

export function ReaderCard({ s, onSaved }: { s: Settings; onSaved: () => void }) {
  const r = s.reader;
  const [provider, setProvider] = useState(s.providers.find((p) => p.baseUrl === r.baseUrl)?.id ?? (r.baseUrl ? "custom" : "gemini"));
  const [baseUrl, setBaseUrl] = useState(r.baseUrl || s.providers.find((p) => p.id === "gemini")?.baseUrl || "");
  const [key, setKey] = useState("");
  const [model, setModel] = useState(r.model);
  const [models, setModels] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (id: string) => {
    setProvider(id);
    const p = s.providers.find((x) => x.id === id);
    if (p) setBaseUrl(p.baseUrl);
  };
  const save = async () => {
    try {
      await api.saveReader({ baseUrl, model, ...(key.trim() ? { key: key.trim() } : {}) });
      setKey("");
      toast(model ? `Pictures will be read by ${model}` : "Picture reader saved");
      onSaved();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await api.testReader({ baseUrl, model, ...(key.trim() ? { key: key.trim() } : {}) });
      setMsg({ ok: t.ok && t.vision === "yes", text: t.message });
      setModels(t.models ?? []);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    await api.clearReader();
    setModel("");
    setMsg(null);
    toast("Picture reader removed: the writer reads pictures itself again");
    onSaved();
  };

  return (
    <section className="card stack" data-testid="reader">
      <h2>Picture reader <span className="small muted">(optional)</span></h2>
      <p className="small">
        A second model that only reads the pictures you upload as sources (a poster, a table screenshot) and hands their text to the writer. Use it when the writer cannot see, for example Gemini reads the pictures and Mireld writes the slides.
        {" "}{r.complete ? <>Now: <b>{r.model}</b> at <code>{new URL(r.baseUrl).host}</code> reads pictures.</> : <>Now: <b>off</b>, the writer reads pictures itself.</>}
      </p>
      <div className="grid c2">
        <label className="f">
          Provider
          <select value={provider} onChange={(e) => pick(e.target.value)}>
            {s.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="custom">Other OpenAI-compatible</option>
          </select>
        </label>
        <label className="f">
          Endpoint
          <input type="url" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setProvider(s.providers.find((p) => p.baseUrl === e.target.value.replace(/\/+$/, ""))?.id ?? "custom"); }} />
        </label>
      </div>
      <div className="grid c2">
        <label className="f">
          Key <span className="h">{r.key ? `Saved: ${r.key}. Paste a new one to replace it.` : "Stored encrypted; sent only to this endpoint."}</span>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key" autoComplete="off" />
        </label>
        <label className="f">
          Model <span className="h">One that reads pictures, e.g. a Gemini Flash model.</span>
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gemini-…-flash" />
        </label>
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={!baseUrl || (!key.trim() && !r.key) || !model.trim()}>Save picture reader</button>
        <button className="btn btn-ghost" onClick={test} disabled={busy}>{busy ? "Testing" : "Test"}</button>
        {(r.baseUrl || r.model || r.key) && <button className="btn btn-quiet" onClick={clear}>Turn off</button>}
      </div>
      {msg && <div className={"banner " + (msg.ok ? "info" : "danger")}>{msg.text}</div>}
      {models.length > 0 && (
        <p className="small muted">
          Models this key can use: {models.slice(0, 40).map((m, i) => <span key={m}>{i ? ", " : ""}<a href="#" onClick={(e) => { e.preventDefault(); setModel(m); }}>{m}</a></span>)}. Click one, then Save and Test.
        </p>
      )}
    </section>
  );
}
