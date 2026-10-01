import { Component, type ErrorInfo, type ReactNode } from "react";
import { appHref } from "../cloud/client";

/** A page that throws while drawing shows what went wrong and a way out, never a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; where: string }> {
  state = { error: null as Error | null, where: "" };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  // Where it broke, so a screenshot of this card is enough to find the fault: the page, and the first lines
  // of the stack (file and position in the built page).
  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = (error.stack ?? "").split("\n").filter((l) => /\d+:\d+/.test(l)).slice(0, 3).map((l) => l.trim().replace(/^at\s+/, "").replace(/https?:\/\/[^/]+/g, ""));
    const comp = (info.componentStack ?? "").split("\n").map((l) => l.trim().replace(/^at\s+/, "").split(" ")[0]).filter(Boolean).slice(0, 3);
    this.setState({ where: [`page ${location.hash || location.pathname}`, ...stack, comp.length ? `in ${comp.join(" < ")}` : ""].filter(Boolean).join("\n") });
    console.error(error);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, where: "" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ maxWidth: 720, margin: "48px auto", padding: 28 }}>
        <h2 style={{ marginTop: 0 }}>This page could not be drawn</h2>
        <p>Something in it is in a shape Slidecraft did not expect. Your work is saved; nothing was lost.</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "#f4f6fb", padding: 12, borderRadius: 8 }}>{String(this.state.error.message)}{this.state.where ? `\n\n${this.state.where}` : ""}</pre>
        <p style={{ display: "flex", gap: 12 }}>
          <a className="btn btn-primary" href={appHref("/")}>Back to decks</a>
          <button className="btn" onClick={() => location.reload()}>Reload</button>
        </p>
      </div>
    );
  }
}
