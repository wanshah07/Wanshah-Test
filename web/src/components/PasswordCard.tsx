import { useState } from "react";
import { api } from "../api";
import { toast } from "./Toast";

// On GitHub Pages the workspace owner makes each account with a first
// password; this is where its holder replaces it with their own.
export function PasswordCard() {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mismatch = again.length > 0 && pw !== again;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pw !== again) return setErr("The two passwords are not the same.");
    setBusy(true);
    try {
      await api.changePassword(pw);
      setPw("");
      setAgain("");
      toast("Password changed. Use the new one next time you sign in.");
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack">
      <h2>Password</h2>
      <p className="small">If the workspace owner made your account with a first password, replace it here with one only you know.</p>
      <form className="stack" onSubmit={save}>
        <div className="grid c2">
          <label className="f">New password <span className="h">At least 8 characters.</span>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          <label className="f">The same again
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
        </div>
        {mismatch && <div className="banner warn">The two passwords are not the same yet.</div>}
        {err && <div className="banner danger">{err}</div>}
        <div className="row"><button className="btn btn-primary" disabled={busy || pw.length < 8 || pw !== again}>{busy ? "Changing" : "Change password"}</button></div>
      </form>
    </section>
  );
}
