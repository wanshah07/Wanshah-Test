import { useParams } from "react-router-dom";

// The presenter is the export itself, served with the pictures inlined, so
// what is presented is exactly what a downloaded HTML deck shows. The slide
// number lives in the address (#3), so a reload stays on the same slide.
export default function Present() {
  const { id } = useParams();
  const onLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const w = e.currentTarget.contentWindow;
    // Keys go to the slides straight away, without a click first.
    w?.focus();
    try {
      w?.addEventListener("hashchange", () => history.replaceState(null, "", `${location.pathname}${w.location.hash}`));
    } catch {
      /* another origin: the position is simply not mirrored */
    }
  };
  return <iframe title="Presentation" src={`/api/decks/${id}/present${location.hash}`} onLoad={onLoad} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, background: "#0b1620" }} allowFullScreen />;
}
