import { useEffect, useState } from "react";

interface T {
  id: number;
  text: string;
  err?: boolean;
}

const listeners = new Set<(t: T) => void>();
let n = 0;

export function toast(text: string, err = false): void {
  const t = { id: ++n, text, err };
  listeners.forEach((l) => l(t));
}

export function ToastHost() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const l = (t: T) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), t.err ? 7000 : 3500);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={"toast" + (t.err ? " err" : "")}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
