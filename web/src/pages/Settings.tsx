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
  const load = () => api.settings().then((r) => {
    setS(r);
    setModel(r.model);
    setImageModel(r.imageModel);
  });
  useEffect(() => {
    load().catch((e) => toast(e.message, true));
  }, []);
  if (!s) return <main className="page"><p className="muted">Loading</p></main>;

  const saveKey = async () => {
    await api.saveSettings({ openaiKey: key.trim() });
    setKey("");
    toast("Key saved");
    load();
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
      const r = await api.testKey(key.trim() || undefined);
      setTestMsg(r.message);
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
        <h2>OpenAI key</h2>
        {s.mockLlm && <div className="banner info">The server runs with MOCK_LLM=1: generation returns a fixture deck and no key is used.</div>}
        <p className="small">
          Active key: {s.key.active === "own" ? <>your own, <code>{s.key.own}</code></> : s.key.active === "server" ? <>the server's, <code>{s.key.server}</code></> : <b>none</b>}.
          {" "}Stored encrypted with the server secret. Only this server ever sends it, and only to api.openai.com.
        </p>
        <label className="f">
          New key
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
        </label>
        <div className="row">
          <button className="btn btn-primary" onClick={saveKey} disabled={!key.trim()}>Save key</button>
          <button className="btn btn-ghost" onClick={test} disabled={testing}>{testing ? "Testing" : "Test key"}</button>
          {s.key.own && <button className="btn btn-quiet" onClick={clearKey}>Remove my key</button>}
        </div>
        {testMsg && <div className={"banner " + (testMsg.startsWith("Key accepted") ? "info" : "danger")}>{testMsg}</div>}
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
