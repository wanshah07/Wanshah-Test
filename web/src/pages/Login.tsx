import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, cloud } from "../api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();
  useEffect(() => {
    if (cloud) return;
    api.authMode().then((m) => {
      if (m.mode === "off") nav("/", { replace: true });
    }).catch(() => {});
  }, [nav]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setNote("");
    try {
      if (creating) {
        const r = await api.signUp(email, password);
        if (r.confirm) {
          setNote("Check your email and open the confirmation link, then sign in here. After that, ask the workspace owner to add you.");
          setCreating(false);
          return;
        }
      } else await api.login(email, password);
      nav(params.get("next") || "/", { replace: true });
    } catch (ex) {
      setErr((ex as Error).message === "bad_credentials" ? "Email or password is wrong." : (ex as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="card stack" onSubmit={submit}>
        <h1>{creating ? "Create your account" : "Sign in"}</h1>
        {cloud ? (
          <p className="muted small">
            {creating ? "Use your work email. Once your account exists, the workspace owner adds you, and then your decks, sources and settings are yours alone." : "Sign in with the email and password from the workspace owner. You can change the password in Settings afterwards."}
          </p>
        ) : (
          <p className="muted small">Accounts are created by the administrator with <code>npm run user:add</code>.</p>
        )}
        <label className="f">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="f">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? "new-password" : "current-password"} minLength={creating ? 8 : undefined} required /></label>
        {err && <div className="banner danger">{err}</div>}
        {note && <div className="banner info">{note}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? (creating ? "Creating" : "Signing in") : creating ? "Create account" : "Sign in"}</button>
        {cloud && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setCreating(!creating); setErr(""); setNote(""); }}>
            {creating ? "I already have an account" : "New here? Create an account"}
          </button>
        )}
      </form>
    </div>
  );
}
