import { blankSlide, type Theme } from "@slidecraft/shared";
import { SlideFrame } from "./SlideFrame";

// A theme or saved design shown as a small slide in its own colours and fonts.

export interface ThemeOption {
  key: string;
  name: string;
  theme: Theme;
  mine?: boolean;
  hint?: string;
}

export function ThemeCards({ options, isOn, onPick, lang = "en", width = 150 }: { options: ThemeOption[]; isOn: (o: ThemeOption) => boolean; onPick: (o: ThemeOption) => void; lang?: "en" | "ms"; width?: number }) {
  return (
    <div className="picker" style={{ gridTemplateColumns: `repeat(auto-fill,minmax(${width}px,1fr))` }}>
      {options.map((o) => {
        const s = { ...blankSlide("bullets", lang), title: o.name, bullets: [`${o.theme.fontDisplay} / ${o.theme.fontBody}`, lang === "ms" ? "Contoh isi" : "Sample point"] };
        return (
          <button key={o.key} type="button" className={"pickcard" + (isOn(o) ? " on" : "")} onClick={() => onPick(o)} title={o.hint || o.name}>
            <SlideFrame slide={s} theme={o.theme} index={1} total={10} lang={lang} />
            <span>
              {o.name}
              {o.mine && <em className="pill brand" style={{ marginLeft: 6, fontStyle: "normal" }}>mine</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
