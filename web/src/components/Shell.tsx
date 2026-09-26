import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type Settings } from "../api";
import { framed } from "../lib/files";

export function Shell() {
  const [me, setMe] = useState<Settings["user"] | null>(null);
  const [mode, setMode] = useState<string>("off");
  const nav = useNavigate();
  const [inFrame] = useState(framed);
  // A file dropped beside a drop zone would otherwise replace the whole page with the file.
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".drop")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
  useEffect(() => {
    api.me().then((r) => {
      setMe(r.user);
      setMode(r.mode);
    }).catch(() => {});
  }, []);
  return (
    <>
      <header className="nav">
        <div className="in">
          <NavLink to="/" className="brand">
            <span className="mark">
              <svg width="18" height="18" viewBox="0 0 64 64"><rect x="4" y="12" width="56" height="40" rx="10" fill="#fff" opacity=".95" /><rect x="14" y="24" width="24" height="5" rx="2.5" fill="#2E7CBE" /><rect x="14" y="34" width="36" height="5" rx="2.5" fill="#4898D8" /></svg>
            </span>
            Slidecraft
          </NavLink>
          <nav className="links">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "on" : "")}>Decks</NavLink>
            <NavLink to="/new" className={({ isActive }) => (isActive ? "on" : "")}>New deck</NavLink>
            <NavLink to="/designs" className={({ isActive }) => (isActive ? "on" : "")}>Designs</NavLink>
            <NavLink to="/prompts" className={({ isActive }) => (isActive ? "on" : "")}>Prompts</NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "on" : "")}>Settings</NavLink>
          </nav>
          <span className="sp" />
          {me && (
            <span className="row small muted">
              {me.name || me.email}
              {mode === "local" && (
                <button className="btn btn-quiet btn-sm" onClick={() => api.logout().then(() => nav("/login"))}>Sign out</button>
              )}
            </span>
          )}
        </div>
      </header>
      {inFrame && (
        <div className="banner warn" style={{ margin: "10px auto 0", maxWidth: 1100 }}>
          Slidecraft is open inside another window (such as VS Code's preview pane), where dragging files in and some buttons do not work.
          <a href={window.location.href} target="_blank" rel="noreferrer"><b>Open it in its own browser tab</b></a>
        </div>
      )}
      <Outlet />
    </>
  );
}
