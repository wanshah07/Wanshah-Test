import { blankSlide, LAYOUTS, type Layout, type Slide, type Theme } from "@slidecraft/shared";
import { SlideFrame } from "./SlideFrame";

// Layouts as small pictures in the deck's own theme, instead of a list of names.

export const LAYOUT_NAMES: Record<Layout, string> = {
  title: "Title",
  section: "Section divider",
  bullets: "Points",
  "two-column": "Two columns",
  chart: "Chart",
  table: "Table",
  diagram: "Diagram",
  image: "Picture",
  quote: "Quote",
  kpi: "Big numbers",
  closing: "Closing",
};

/** What a slide needs added to show a layout it has no content for yet. */
export function fillFor(slide: Slide, l: Layout): Partial<Slide> {
  const b = blankSlide(l);
  const out: Partial<Slide> = {};
  if (l === "chart" && !slide.chart) out.chart = b.chart;
  if (l === "table" && !slide.table) out.table = b.table;
  if (l === "diagram" && !slide.diagram) out.diagram = b.diagram;
  if (l === "kpi" && !slide.kpi?.length) out.kpi = b.kpi;
  if (l === "quote" && !slide.quote) out.quote = b.quote;
  if (l === "image" && !slide.image) out.image = b.image;
  if ((l === "bullets" || l === "two-column") && !slide.bullets?.length) out.bullets = b.bullets;
  if (l === "two-column") {
    if (!slide.bulletsRight?.length) out.bulletsRight = b.bulletsRight;
    if (!slide.leftHeading) out.leftHeading = b.leftHeading;
    if (!slide.rightHeading) out.rightHeading = b.rightHeading;
  }
  return out;
}

function sample(l: Layout, lang: "en" | "ms"): Slide {
  return { ...blankSlide(l, lang), title: LAYOUT_NAMES[l] };
}

/**
 * With `slide`, each card shows that slide's own content in the layout, which
 * is exactly what choosing it produces. Without, each shows a sample.
 */
export function LayoutPicker({ theme, lang, slide, current, onPick, width = 150 }: { theme: Theme; lang: "en" | "ms"; slide?: Slide; current?: Layout; onPick: (l: Layout) => void; width?: number }) {
  return (
    <div className="picker" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(${width}px,1fr))` }}>
      {LAYOUTS.map((l) => {
        const s = slide ? { ...slide, ...fillFor(slide, l), layout: l } : sample(l, lang);
        return (
          <button key={l} type="button" className={"pickcard" + (current === l ? " on" : "")} onClick={() => onPick(l)} title={LAYOUT_NAMES[l]}>
            <SlideFrame slide={s} theme={theme} index={1} total={10} lang={lang} />
            <span>{LAYOUT_NAMES[l]}</span>
          </button>
        );
      })}
    </div>
  );
}
