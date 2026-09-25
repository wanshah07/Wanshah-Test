import { useParams } from "react-router-dom";

// The presenter is the export itself, served with the pictures inlined, so
// what is presented is exactly what a downloaded HTML deck shows.
export default function Present() {
  const { id } = useParams();
  return <iframe title="Presentation" src={`/api/decks/${id}/present`} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, background: "#0b1620" }} allowFullScreen />;
}
