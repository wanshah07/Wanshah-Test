import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { OneDriveLink, SourceRef } from "@slidecraft/shared";
import { api, type OneDriveImport, type OneDriveStatus } from "../api";
import { toast } from "./Toast";

// Pulls the pictures in one OneDrive folder into the deck, and links the
// folder so every later generation pulls again first.

export function OneDriveBox({ getDeckId, link, onImported }: { getDeckId: () => Promise<string>; link?: OneDriveLink; onImported: (sources: SourceRef[], link: OneDriveLink | undefined) => void }) {
  const [st, setSt] = useState<OneDriveStatus | null>(null);
  const [folder, setFolder] = useState(link?.folder ?? "");
  const [subfolders, setSubfolders] = useState(link?.subfolders ?? false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<OneDriveImport | null>(null);
  const [kids, setKids] = useState<{ folders: string[]; pictures: number } | null>(null);

  useEffect(() => {
    api.oneDrive().then((s) => {
      setSt(s);
      if (!link?.folder && s.defaultFolder) setFolder(s.defaultFolder);
    }).catch(() => {});
  }, []);

  if (!st) return null;
  if (!st.connected) {
    return (
      <div className="card tight stack">
        <b className="small">Pictures from OneDrive</b>
        <p className="small muted">Not connected. <Link to="/settings">Connect OneDrive in Settings</Link>, then pick a folder here.</p>
      </div>
    );
  }

  const browse = async (path: string) => {
    try {
      const r = await api.oneDriveBrowse(path);
      setKids({ folders: r.folders, pictures: r.pictures });
    } catch (e) {
      setKids(null);
      toast((e as Error).message, true);
    }
  };
  const into = (name: string) => {
    const next = folder && !/^https?:/i.test(folder) ? `${folder.replace(/\/+$/, "")}/${name}` : name;
    setFolder(next);
    browse(next);
  };
  const up = () => {
    const parts = folder.split("/").filter(Boolean);
    parts.pop();
    const next = parts.join("/");
    setFolder(next);
    browse(next);
  };
  const pull = async () => {
    setBusy(true);
    try {
      const id = await getDeckId();
      const r = await api.importOneDrive(id, folder, subfolders);
      setLast(r);
      onImported(r.sources, r.link);
      toast(r.summary);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    const id = await getDeckId();
    await api.unlinkOneDrive(id);
    onImported([], undefined);
    toast("This deck no longer pulls from OneDrive. The pictures already pulled stay.");
  };

  return (
    <div className="card tight stack">
      <div className="row between">
        <b className="small">Pictures from OneDrive</b>
        <span className="small muted">{st.account}</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder path, e.g. 40. HERMES/photos, or a share link" style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => browse(folder)} disabled={busy}>Browse</button>
      </div>
      {kids && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">
            In <b>{folder || "OneDrive (top level)"}</b>: {kids.pictures} picture{kids.pictures === 1 ? "" : "s"}
            {kids.folders.length ? `, ${kids.folders.length} folder${kids.folders.length === 1 ? "" : "s"}. Click one to open it.` : "."}
          </span>
          <div className="chips" style={{ marginTop: 0 }}>
            {folder && !/^https?:/i.test(folder) && <button className="chip" onClick={up}>↑ Up</button>}
            {kids.folders.map((f) => <button key={f} className="chip" onClick={() => into(f)}>📁 {f}</button>)}
          </div>
        </div>
      )}
      <label className="row small" style={{ gap: 6 }}>
        <input type="checkbox" checked={subfolders} onChange={(e) => setSubfolders(e.target.checked)} /> Include subfolders (up to 3 levels)
      </label>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={pull} disabled={busy}>{busy ? <span className="spin" /> : "Pull pictures"}</button>
        {link && <button className="btn btn-quiet btn-sm" onClick={unlink} disabled={busy}>Stop pulling automatically</button>}
      </div>
      {link && <p className="small muted">Linked to <b>{link.folder || "OneDrive (top level)"}</b>. New and changed pictures are pulled again before every generation.</p>}
      {last && last.report.skipped.length > 0 && (
        <details className="small">
          <summary>{last.report.skipped.length} skipped</summary>
          <ul>{last.report.skipped.slice(0, 30).map((s) => <li key={s.name}>{s.name}: {s.reason}</li>)}</ul>
        </details>
      )}
      <p className="small muted">The writer picks pictures by file name, so name them for what they show (lab-stability-test.jpg, not IMG_4432.jpg).</p>
    </div>
  );
}
