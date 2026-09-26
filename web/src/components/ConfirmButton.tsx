import { useEffect, useState } from "react";

// Two clicks instead of window.confirm(), which a framed page (VS Code's
// preview pane, an embedded viewer) is not allowed to show: the browser
// answers "cancel" silently and the button appears to do nothing.

export function ConfirmButton({ children, confirm, onConfirm, className = "btn btn-quiet btn-sm", disabled }: { children: React.ReactNode; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={className + (armed ? " btn-danger" : "")}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : children}
    </button>
  );
}
