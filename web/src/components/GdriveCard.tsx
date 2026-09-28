import { useEffect, useState } from "react";
import { api, cloud, type GdriveStatus } from "../api";
import { toast } from "./Toast";

// Private Google Drive files: a link that is not shared publicly is read as the
// Google account connected in Composio. The key is the one OneDrive uses.
export function GdriveCard({ onKeyChanged }: { onKeyChanged?: () => void }) {
  const [gd, setGd] = useState<GdriveStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; label: string; status: string }[] | null>(null);
  useEffect(() => {
    api.gdrive().then(setGd).catch(() => {});
  }, []);

  const pick = async (a: { id: string; label: string }) => {
    setGd(await api.saveGdrive({ account: a.id, label: a.label }));
    toast(`Google Drive: ${a.label}`);
  };
  const find = async () => {
    setBusy(true);
    setMsg("");
    try {
      if (key.trim()) {
        setGd(await api.saveGdrive({ composioKey: key.trim() }));
        setKey("");
        onKeyChanged?.();
      }
      const r = await api.gdriveAccounts();
      setAccounts(r.accounts);
      const active = r.accounts.filter((a) => a.status.toUpperCase() === "ACTIVE");
      if (active.length === 1) await pick(active[0]);
    } catch (e) {
      setMsg((e as { code?: string }).code === "composio_key" ? "Composio refused this API key. Copy the key again from composio.dev (Settings, API keys) and paste it above." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setGd(await api.deleteGdrive());
    setAccounts(null);
    toast("Google Drive disconnected");
  };

  return (
    <section className="card stack">
      <h2>Google Drive (private files)</h2>
      <p className="small">
        A Google Drive or Sheets link that is not shared publicly is read as the Google account {cloud ? "you pick below, through the workspace's Composio connection" : "you connected in Composio"}. Public links are still read directly. Slidecraft only reads; it never changes anything in Drive. The file must be one that account can open.
      </p>
      {gd && (
        <>
          {!cloud && <label className="f">
            Composio API key <span className="h">{gd.hasKey ? "Saved, shared with OneDrive. Paste a new one to replace it; both drives are then picked again." : "From a Composio project that has Google Drive connected. The same key serves OneDrive."}</span>
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key" autoComplete="off" />
          </label>}
          <div className="row">
            <button className="btn btn-ghost" onClick={find} disabled={busy || (!key.trim() && !gd.hasKey)}>{busy ? <span className="spin" /> : "Find my Google Drive accounts"}</button>
            {gd.connected && <span className="pill ok">Connected: {gd.label}</span>}
            {gd.connected && <button className="btn btn-quiet" onClick={disconnect}>Disconnect</button>}
          </div>
          {accounts && accounts.length === 0 && <div className="banner warn">This key's Composio project has no Google Drive connection. Connect Google Drive in that project on composio.dev, then try again.</div>}
          {accounts && accounts.length > 0 && (
            <div>
              <b className="small">Pick the Google Drive account</b>
              <div className="chips">
                {accounts.map((a) => (
                  <button key={a.id} className={"chip" + (gd.account === a.id ? " on" : "")} onClick={() => pick(a)}>
                    {a.label} <span className="muted">({a.status.toLowerCase() || "unknown"})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {msg && <div className="banner danger">{msg}</div>}
        </>
      )}
    </section>
  );
}
