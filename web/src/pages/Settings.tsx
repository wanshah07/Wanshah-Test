import { useEffect, useState } from "react";
import { THEME_PRESETS } from "@slidecraft/shared";
import { api, type OneDriveStatus, type Settings as S } from "../api";
import { toast } from "../components/Toast";
import { ThemeCards } from "../components/ThemeCards";
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
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [od, setOd] = useState<OneDriveStatus | null>(null);
  const [odClient, setOdClient] = useState("");
  const [odFolder, setOdFolder] = useState("");
  const [odMsg, setOdMsg] = useState("");
  const [czKey, setCzKey] = useState("");
  const [czBusy, setCzBusy] = useState(false);
  const [czAccounts, setCzAccounts] = useState<{ id: string; label: string; status: string }[] | null>(null);
  const loadOd = () => api.oneDrive().then((r) => {
    setOd(r);
    setOdClient(r.clientIdFrom === "settings" ? r.clientId : "");
    setOdFolder(r.defaultFolder);
  });
  useEffect(() => {
    loadOd().catch(() => {});
  }, []);
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
      const r = await api.testKey(key.trim() || undefined, baseUrl, model);
      setTestMsg(r.message);
      setTestOk(r.ok);
      setModels(r.models ?? []);
      setImageModels(r.imageModels ?? []);
      // Only the picture answer changes; reloading everything would drop an unsaved model name.
      if (r.vision === "yes" || r.vision === "no" || r.vision === "unknown") setS((x) => (x ? { ...x, vision: r.vision as S["vision"] } : x));
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

  const findAccounts = async () => {
    setCzBusy(true);
    setOdMsg("");
    try {
      // A newly pasted key is saved first, so the account picked next belongs to it.
      if (czKey.trim()) {
        setOd(await api.saveOneDrive({ composioKey: czKey.trim() }));
        setCzKey("");
      }
      const r = await api.composioAccounts();
      setCzAccounts(r.accounts);
      const active = r.accounts.filter((a) => a.status.toUpperCase() === "ACTIVE");
      if (active.length === 1) await pickAccount(active[0]);
    } catch (e) {
      setOdMsg((e as Error).message);
    } finally {
      setCzBusy(false);
    }
  };
  const pickAccount = async (a: { id: string; label: string }) => {
    setOd(await api.saveOneDrive({ composioAccount: a.id, composioAccountLabel: a.label }));
    toast(`OneDrive through Composio: ${a.label}`);
  };
  const saveOd = async () => {
    try {
      setOd(await api.saveOneDrive(od?.provider === "composio" ? { defaultFolder: odFolder } : { clientId: odClient.trim() || null, defaultFolder: odFolder }));
      toast("OneDrive settings saved");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const connectOd = async () => {
    setOdMsg("");
    try {
      const p = await api.oneDriveLogin();
      setOd((o) => (o ? { ...o, pending: p } : o));
      const poll = async () => {
        const r = await api.oneDrivePoll();
        if (r.state === "waiting") return void setTimeout(poll, Math.max(2, p.interval) * 1000);
        if (r.state === "connected") toast(`OneDrive connected${r.account ? `: ${r.account}` : ""}`);
        else setOdMsg(r.message || "Sign-in did not finish");
        loadOd();
      };
      setTimeout(poll, Math.max(2, p.interval) * 1000);
    } catch (e) {
      setOdMsg((e as Error).message);
    }
  };
  const disconnectOd = async () => {
    setOd(await api.disconnectOneDrive());
    toast("OneDrive disconnected");
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
        <p className="small muted">
          Reads pictures: <b>{s.vision === "yes" ? "yes" : s.vision === "no" ? "no" : "not checked yet"}</b>
          {s.vision === "no" ? ". Pictures you upload as sources are used only as slide pictures, and you are asked before a deck is written." : s.vision === "yes" ? ". Pictures you upload as sources are read before a deck is written." : ". Press Test to check."}
        </p>
        {testMsg && <div className={"banner " + (testOk ? "info" : "danger")}>{testMsg}</div>}
        {models.length > 0 && (
          <p className="small muted">
            Models this key can use: {models.slice(0, 40).map((m, i) => <span key={m}>{i ? ", " : ""}<a href="#" onClick={(e) => { e.preventDefault(); setModel(m); }}>{m}</a></span>)}
            {models.length > 40 ? ` and ${models.length - 40} more` : ""}. Click one to put it in the writer model box below.
          </p>
        )}
        {imageModels.length > 0 && (
          <p className="small muted">
            Picture models (not writers; used only when slide pictures are generated): {imageModels.slice(0, 20).map((m, i) => <span key={m}>{i ? ", " : ""}<a href="#" onClick={(e) => { e.preventDefault(); setImageModel(m); }}>{m}</a></span>)}. Click one to put it in the image model box below.
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>OneDrive pictures</h2>
        <p className="small">Pull pictures from a OneDrive folder into a deck. Slidecraft only reads; it never changes anything in OneDrive. Keys and sign-ins are stored encrypted.</p>
        {od && (
          <>
            <div>
              <b className="small">Connect through</b>
              <div className="chips">
                {([["composio", "Composio", "Uses the OneDrive you already connected in Composio. No Microsoft setup."], ["microsoft", "Microsoft direct", "Signs in to Microsoft yourself. Needs an Azure app registration once; no third party."]] as const).map(([v, l, h]) => (
                  <label key={v} className={"chip" + (od.provider === v ? " on" : "")} title={h}>
                    <input type="radio" name="odprov" checked={od.provider === v} onChange={() => api.saveOneDrive({ provider: v }).then(setOd)} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <label className="f">
              Default folder <span className="h">Filled in for every new deck.{od.provider === "microsoft" ? " A path, or a OneDrive share link." : " A path, e.g. 40. HERMES/photos."}</span>
              <input type="text" value={odFolder} onChange={(e) => setOdFolder(e.target.value)} placeholder="e.g. 40. HERMES/photos" />
            </label>
            {od.provider === "composio" ? (
              <div className="stack">
                <label className="f">
                  Composio API key <span className="h">{od.composio.key ? `Saved: ${od.composio.key}. Paste a new one to replace it.` : "From a Composio project that has OneDrive connected. Safest: a project with only OneDrive in it, or a scoped key limited to reading."}</span>
                  <input type="password" value={czKey} onChange={(e) => setCzKey(e.target.value)} placeholder="Paste the key" autoComplete="off" />
                </label>
                <div className="row">
                  <button className="btn btn-ghost" onClick={findAccounts} disabled={czBusy || (!czKey.trim() && !od.composio.key)}>{czBusy ? <span className="spin" /> : "Find my OneDrive accounts"}</button>
                  <button className="btn btn-ghost" onClick={saveOd}>Save folder</button>
                  {od.connected && (
                    <>
                      <span className="pill ok">Connected: {od.account}</span>
                      <button className="btn btn-quiet" onClick={disconnectOd}>Remove key</button>
                    </>
                  )}
                </div>
                {czAccounts && czAccounts.length === 0 && <div className="banner warn">This key's Composio project has no OneDrive connection. Connect OneDrive in that project on composio.dev, then try again.</div>}
                {czAccounts && czAccounts.length > 0 && (
                  <div>
                    <b className="small">Pick the OneDrive account</b>
                    <div className="chips">
                      {czAccounts.map((a) => (
                        <button key={a.id} className={"chip" + (od.composio.account === a.id ? " on" : "")} onClick={() => pickAccount(a)}>
                          {a.label} <span className="muted">({a.status.toLowerCase() || "unknown"})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="stack">
                <label className="f">
                  Microsoft app client ID <span className="h">{od.clientIdFrom === "server" ? "Set on the server (MS_CLIENT_ID). Fill this only to use a different one." : "Application (client) ID from your app registration. See README, OneDrive."}</span>
                  <input type="text" value={odClient} onChange={(e) => setOdClient(e.target.value)} placeholder={od.clientIdFrom === "server" ? od.clientId : "1a2b3c4d-…"} autoComplete="off" />
                </label>
                <div className="row">
                  <button className="btn btn-ghost" onClick={saveOd}>Save</button>
                  {od.connected ? (
                    <>
                      <span className="pill ok">Connected{od.account ? `: ${od.account}` : ""}</span>
                      <button className="btn btn-quiet" onClick={disconnectOd}>Disconnect</button>
                    </>
                  ) : (
                    <button className="btn btn-primary" onClick={connectOd} disabled={!od.clientId || !!od.pending}>Connect OneDrive</button>
                  )}
                </div>
                {!od.connected && !od.clientId && <p className="small muted">Save a client ID first, then Connect.</p>}
                {od.pending && !od.connected && (
                  <div className="banner info" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                    <span>1. Open <a href={od.pending.verificationUri} target="_blank" rel="noreferrer"><b>{od.pending.verificationUri}</b></a></span>
                    <span>2. Enter this code: <b style={{ fontSize: 20, letterSpacing: 2 }}>{od.pending.userCode}</b></span>
                    <span>3. Sign in with the Microsoft account that owns the folder and accept. This page updates by itself.</span>
                  </div>
                )}
              </div>
            )}
            {odMsg && <div className="banner danger">{odMsg}</div>}
          </>
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
        <ThemeCards width={170} options={THEME_PRESETS.map((t) => ({ key: t.id, name: t.name, theme: t }))} isOn={(o) => s.defaultTheme === o.key} onPick={(o) => setDefaultTheme(o.key)} />
      </section>
    </main>
  );
}
