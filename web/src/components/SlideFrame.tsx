import { useEffect, useMemo, useRef, useState } from "react";
import { renderSlideHtml, SLIDE_CSS, type Slide, type Theme } from "@slidecraft/shared";
import { mediaUrl } from "../api";

let cssInjected = false;
function ensureCss(): void {
  if (cssInjected) return;
  const el = document.createElement("style");
  el.id = "sc-slide-css";
  el.textContent = SLIDE_CSS;
  document.head.appendChild(el);
  cssInjected = true;
}

/** One slide, rendered by the shared renderer and scaled to its container. */
export function SlideFrame({ slide, theme, index, total, lang, className, fixedWidth }: { slide: Slide; theme: Theme; index: number; total: number; lang: "en" | "ms"; className?: string; fixedWidth?: number }) {
  ensureCss();
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(fixedWidth ? fixedWidth / 1920 : 0.1);
  useEffect(() => {
    if (fixedWidth) return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1920));
    ro.observe(el);
    setScale(el.clientWidth / 1920);
    return () => ro.disconnect();
  }, [fixedWidth]);
  const html = useMemo(() => renderSlideHtml(slide, theme, { index, total, mediaUrl, lang }), [slide, theme, index, total, lang]);
  return (
    <div ref={ref} className={"frame " + (className ?? "")} style={fixedWidth ? { width: fixedWidth } : undefined}>
      <div style={{ position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "top left", width: 1920, height: 1080 }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
