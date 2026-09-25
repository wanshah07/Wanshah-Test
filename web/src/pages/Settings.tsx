import { useEffect, useState } from "react";
import { THEME_PRESETS } from "@slidecraft/shared";
import { api, type Settings as S } from "../api";
import { toast } from "../components/Toast";
import { applyAppTheme, type AppTheme } from "../lib/theme";

export default function Settings() {
  const [s, setS] = useState<S | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testOk, setTestOk] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const load = () => api.settings().then((r) => {
    setS(r);
    setModel(r.model);
    setImageModel(r.imageModel);
    setProvider(r.endpoint.provider);
    setBaseUrl(r.endpoint.baseUrl);
  });
  useEffect(() => {
    load().catch((e) => toast(e.message, true));
  }, []);
  if (!s) return <main className="page"><p className="muted">Loading</p></main>;

  const pickProvider = (id: string) => {
    setProvider(id);
    const p = s.providers.find((x) => x.id === id);
    if (p) setBaseUrl(p.baseUrl);
    setTestMsg("");
    setModels([]);
  };
  const saveKey = async () => {
    try {
      await api.saveSettings({ openaiKey: key.trim(), baseUrl });
      setKey("");
      toast("Key and endpoint saved");
      load();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const saveEndpoint = async () => {
    try {
      await api.saveSettings({ baseUrl });
      toast("Endpoint saved");
      load();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const clearKey = async () => {
    await api.saveSettings({ openaiKey: null });
    toast("Key removed");
    load();
  };
  const saveModels = async () => {
    await api.saveSettings({ model, imageModel });
    toast("Models saved");
    load();
  };
  const test = async () => {
    setTesting(true);
    setTestMsg("");
    try {
      const r = await api.testKey(key.trim() || undefined, baseUrl);
      setTestMsg(r.message);
      setTestOk(r.ok);
      setModels(r.models ?? []);
    } finally {
      setTesting(false);
    }
  };
  const setAppTheme = async (t: AppTheme) => {
    applyAppTheme(t);
    await api.saveSettings({ appTheme: t });
    load();
  };
  const setDefaultTheme = async (id: string) => {
    await api.saveSettings({ defaultTheme: id });
    load();
    toast("Default theme set");
  };

  return (
    <main className="page stack" style={{ maxWidth: 820 }}>
      <div>
        <h1>Settings</h1>
        <p className="muted">Signed in as {s.user.name || s.user.email}. Login is {s.authMode === "off" ? "off: single-user mode" : "on"}.</p>
      </div>

      <section className="card stack">
        <h2>Writer endpoint and key</h2>
        {s.mockLlm && <div className="banner info">The server runs with MOCK_LLM=1: generation returns a fixture deck and no key is used.</div>}
        <p className="small">
          Calls go to <code>{s.endpoint.host}</code> with {s.key.active === "own" ? <>your own key, <code>{s.key.own}</code></> : s.key.active === "server" ? <>the server's key, <code>{s.key.server}</code>, which is only ever sent to <code>{new URL(s.endpoint.serverBaseUrl).host}</code></> : <b>no key yet</b>}.
          {" "}Any OpenAI-compatible endpoint works. The key is stored encrypted and is sent only to the endpoint saved with it.
        </p>
        <div className="grid c2">
          <label className="f">
            Provider
            <select value={provider} onChange={(e) => pickProvider(e.target.value)}>
              {s.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="custom">Other OpenAI-compatible</option>
            </select>
          </label>
          <label className="f">
            Endpoint <span className="h">Ends in /v1.</span>
            <input type="url" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setProvider(s.providers.find((p) => p.baseUrl === e.target.value.replace(/\/+$/, ""))?.id ?? "custom"); }} />
          </label>
        </div>
        <label className="f">
          New key <span className="h">Leave empty to test the saved key against the endpoint above.</span>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
        </label>
        <div className="row">
          <button className="btn btn-primary" onClick={saveKey} disabled={!key.trim()}>Save key and endpoint</button>
          <button className="btn btn-ghost" onClick={saveEndpoint} disabled={baseUrl === s.endpoint.baseUrl}>Save endpoint only</button>
          <button className="btn btn-ghost" onClick={test} disabled={testing}>{testing ? "Testing" : "Test"}</button>
          {s.key.own && <button className="btn btn-quiet" onClick={clearKey}>Remove my key</button>}
        </div>
        {testMsg && <div className={"banner " + (testOk ? "info" : "danger")}>{testMsg}</div>}
        {models.length > 0 && (
          <p className="small muted">
            Models this key can use: {models.slice(0, 40).map((m, i) => <span key={m}>{i ? ", " : ""}<a href="#" onClick={(e) => { e.preventDefault(); setModel(m); }}>{m}</a></span>)}
            {models.length > 40 ? ` and ${models.length - 40} more` : ""}. Click one to put it in the writer model box below.
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>Models</h2>
        <div className="grid c2">
          <label className="f">
            Writer model <span className="h">Writes the outline, slides and notes. Default {s.defaults.model}.</span>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
          <label className="f">
            Image model <span className="h">Used only when Figures is on with Generate. Default {s.defaults.imageModel}.</span>
            <input type="text" value={imageModel} onChange={(e) => setImageModel(e.target.value)} />
          </label>
        </div>
        <div className="row"><button className="btn btn-primary" onClick={saveModels}>Save models</button></div>
      </section>

      <section className="card stack">
        <h2>Appearance</h2>
        <div className="row">
          {(["light", "dark", "system"] as AppTheme[]).map((t) => (
            <button key={t} className={"btn btn-ghost btn-sm" + (s.appTheme === t ? " active" : "")} onClick={() => setAppTheme(t)}>{t}</button>
          ))}
        </div>
        <h4 style={{ marginTop: 6 }}>Default slide theme for new decks</h4>
        <div className="row">
          {THEME_PRESETS.map((t) => (
            <button key={t.id} className={"btn btn-ghost btn-sm" + (s.defaultTheme === t.id ? " active" : "")} onClick={() => setDefaultTheme(t.id)}>
              <span className="swatch" style={{ width: 14, height: 14, background: t.colors.brand, borderRadius: 4 }} /> {t.name}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
