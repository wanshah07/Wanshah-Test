import { Component, type ReactNode } from "react";

/** A page that throws while drawing shows what went wrong and a way out, never a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ maxWidth: 720, margin: "48px auto", padding: 28 }}>
        <h2 style={{ marginTop: 0 }}>This page could not be drawn</h2>
        <p>Something in it is in a shape Slidecraft did not expect. Your work is saved; nothing was lost.</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "#f4f6fb", padding: 12, borderRadius: 8 }}>{String(this.state.error.message)}</pre>
        <p style={{ display: "flex", gap: 12 }}>
          <a className="btn btn-primary" href="/">Back to decks</a>
          <button className="btn" onClick={() => location.reload()}>Reload</button>
        </p>
      </div>
    );
  }
}
