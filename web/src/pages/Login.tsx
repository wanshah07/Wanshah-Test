import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    api.authMode().then((m) => {
      if (m.mode === "off") nav("/", { replace: true });
    }).catch(() => {});
  }, [nav]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api.login(email, password);
      const next = new URLSearchParams(location.search).get("next") || "/";
      nav(next, { replace: true });
    } catch (ex) {
      setErr((ex as Error).message === "bad_credentials" ? "Email or password is wrong." : (ex as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="card stack" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="muted small">Accounts are created by the administrator with <code>npm run user:add</code>.</p>
        <label className="f">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="f">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {err && <div className="banner danger">{err}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
    </div>
  );
}
