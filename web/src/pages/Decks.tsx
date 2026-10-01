import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { appHref } from "../cloud/client";
import { ANGLES, blankSlide, themePreset } from "@slidecraft/shared";
import { api, type DeckSummary } from "../api";
import { SlideFrame } from "../components/SlideFrame";
import { toast } from "../components/Toast";
import { ConfirmButton } from "../components/ConfirmButton";

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Decks() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const nav = useNavigate();
  const load = () => api.decks().then(setDecks).catch((e) => toast(e.message, true));
  useEffect(() => {
    load();
  }, []);
  const del = async (d: DeckSummary) => {
    try {
      await api.deleteDeck(d.id);
      toast("Deleted");
      load();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const notebook = async () => {
    try {
      const d = await api.createDeck({ title: "Untitled notebook" });
      nav(`/deck/${d.id}/notebook`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const dup = async (d: DeckSummary) => {
    try {
      const c = await api.duplicateDeck(d.id);
      nav(`/deck/${c.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <main className="page">
      <div className="row between" style={{ marginBottom: 22 }}>
        <div>
          <h1>Notebooks</h1>
          <p className="muted">Each one keeps its sources, a chat that answers from them, its slide deck and everything made in its Studio.</p>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={notebook} data-testid="new-notebook">New notebook</button>
          <Link to="/new" className="btn btn-primary">New deck</Link>
        </div>
      </div>
      {decks === null && <p className="muted">Loading</p>}
      {decks && decks.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <h2>No decks yet</h2>
          <p className="muted" style={{ margin: "8px 0 18px" }}>Start from a brief and your files. The wizard takes about a minute.</p>
          <Link to="/new" className="btn btn-primary">Create the first deck</Link>
        </div>
      )}
      <div className="grid auto">
        {decks?.map((d) => {
          const theme = d.theme ?? themePreset(d.themeId ?? "facerinna");
          const cover = d.cover ?? { ...blankSlide("title", d.lang), title: d.title, subtitle: ANGLES.find((a) => a.id === d.angle)?.name ?? "" };
          return (
            <div key={d.id} className="card deckcard">
              <Link to={d.slides ? `/deck/${d.id}` : `/deck/${d.id}/notebook`}>
                <SlideFrame slide={cover} theme={theme} index={0} total={d.slides || 1} lang={d.lang} />
              </Link>
              <h3><Link to={d.slides ? `/deck/${d.id}` : `/deck/${d.id}/notebook`} style={{ color: "inherit" }}>{d.title}</Link></h3>
              <div className="row small muted">
                <span className="pill">{d.slides ? `${d.slides} slides` : "No slides yet"}</span>
                <span className="pill">{d.lang === "ms" ? "BM" : "EN"}</span>
                <span>{when(d.updatedAt)}</span>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <Link to={`/deck/${d.id}/notebook`} className="btn btn-ghost btn-sm">Notebook</Link>
                <Link to={`/deck/${d.id}`} className="btn btn-ghost btn-sm">Slides</Link>
                {d.slides > 0 && <a href={appHref(`/deck/${d.id}/present`)} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm">Present</a>}
                <button className="btn btn-quiet btn-sm" onClick={() => dup(d)}>Duplicate</button>
                <ConfirmButton confirm="Click again to delete for good" onConfirm={() => del(d)}>Delete</ConfirmButton>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
