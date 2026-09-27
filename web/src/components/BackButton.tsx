import { useNavigate } from "react-router-dom";

// Back to where the user came from. A page opened in its own tab (from the
// new-deck wizard) has no history there, so it closes the tab instead; the
// wizard is still open in the tab it came from.
export function BackButton({ label = "← Back" }: { label?: string }) {
  const nav = useNavigate();
  const back = () => {
    if (window.history.length > 1) return nav(-1);
    window.close();
    // Browsers only close tabs a page opened itself; otherwise go home.
    setTimeout(() => nav("/"), 150);
  };
  return <button type="button" className="btn btn-quiet btn-sm" onClick={back} style={{ alignSelf: "flex-start" }}>{label}</button>;
}
