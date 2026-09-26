import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fitSlide, renderSlideHtml, SLIDE_CSS, type FitResult, type Slide, type Theme } from "@slidecraft/shared";
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
export function SlideFrame({ slide, theme, index, total, lang, className, fixedWidth, onFit }: { slide: Slide; theme: Theme; index: number; total: number; lang: "en" | "ms"; className?: string; fixedWidth?: number; onFit?: (r: FitResult) => void }) {
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
  const inner = useRef<HTMLDivElement>(null);
  // Shrink the text until nothing overflows, now and again once web fonts have loaded.
  useLayoutEffect(() => {
    const el = inner.current?.querySelector(".sc-slide") as HTMLElement | null;
    if (!el) return;
    let live = true;
    const run = () => {
      if (!live || !el.isConnected) return;
      const r = fitSlide(el);
      onFit?.(r);
    };
    run();
    document.fonts?.ready.then(run).catch(() => {});
    // Pictures change the layout when they arrive.
    const imgs = Array.from(el.querySelectorAll("img"));
    imgs.forEach((i) => i.complete || i.addEventListener("load", run, { once: true }));
    return () => {
      live = false;
    };
  }, [html]);
  return (
    <div ref={ref} className={"frame " + (className ?? "")} style={fixedWidth ? { width: fixedWidth } : undefined}>
      <div ref={inner} style={{ position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "top left", width: 1920, height: 1080 }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
