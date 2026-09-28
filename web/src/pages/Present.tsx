import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { cloud, deckHtml } from "../api";

// The presenter is the export itself, served with the pictures inlined, so
// what is presented is exactly what a downloaded HTML deck shows. The slide
// number lives in the address (#3), so a reload stays on the same slide. On
// GitHub Pages the same page is built here from the deck in Supabase.
export default function Present() {
  const { id } = useParams();
  const [doc, setDoc] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!cloud || !id) return;
    deckHtml(id).then(setDoc).catch((e) => setErr((e as Error).message === "not_found" ? "This deck does not exist, or it was deleted." : (e as Error).message));
  }, [id]);
  const onLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const w = e.currentTarget.contentWindow;
    // Keys go to the slides straight away, without a click first.
    w?.focus();
    if (cloud) return; // the address holds the route there, not the slide
    try {
      w?.addEventListener("hashchange", () => history.replaceState(null, "", `${location.pathname}${w.location.hash}`));
    } catch {
      /* another origin: the position is simply not mirrored */
    }
  };
  const style = { position: "fixed" as const, inset: 0, width: "100%", height: "100%", border: 0, background: "#0b1620" };
  if (cloud) {
    if (err) return <div style={{ ...style, color: "#dce6f0", display: "grid", placeItems: "center", font: "18px system-ui" }}>{err}</div>;
    if (doc === null) return <div style={{ ...style, color: "#dce6f0", display: "grid", placeItems: "center", font: "18px system-ui" }}>Opening the deck</div>;
    return <iframe title="Presentation" srcDoc={doc} onLoad={onLoad} style={style} allowFullScreen />;
  }
  return <iframe title="Presentation" src={`/api/decks/${id}/present${location.hash}`} onLoad={onLoad} style={style} allowFullScreen />;
}
