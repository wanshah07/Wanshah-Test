import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FONT_CHOICES, THEME_PRESETS, themePreset, type Theme, type ThemeColors } from "@slidecraft/shared";
import { api, type Design, type MediaItem } from "../api";
import { toast } from "./Toast";
import { ThemeCards } from "./ThemeCards";

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  bg: "Background", surface: "Surface", ink: "Text", ink2: "Secondary text", muted: "Muted", line: "Lines", brand: "Brand", brandDeep: "Brand deep", accent: "Accent", gold: "Gold",
};

export function ThemePanel({ deckId, theme, designId, onChange, onDesign }: { deckId: string; theme: Theme; designId?: string; onChange: (t: Theme) => void; onDesign: (t: Theme, designId: string | undefined) => void }) {
  const logoRef = useRef<HTMLInputElement>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [saveName, setSaveName] = useState<string | null>(null);
  useEffect(() => {
    api.designs().then(setDesigns).catch(() => {});
  }, []);
  const set = (patch: Partial<Theme>) => onChange({ ...theme, ...patch });
  const setColor = (k: keyof ThemeColors, v: string) => onChange({ ...theme, colors: { ...theme.colors, [k]: v } });
  const applyPreset = (id: string) => {
    const p = themePreset(id);
    onDesign({ ...p, footer: theme.footer, logoMediaId: theme.logoMediaId, slideNumbers: theme.slideNumbers }, undefined);
  };
  const applyDesign = (d: Design) => {
    onDesign({ ...JSON.parse(JSON.stringify(d.theme)), footer: theme.footer, logoMediaId: theme.logoMediaId }, d.id);
    toast(`Design "${d.name}" applied. Its notes guide the writer from the next rewrite or regenerate.`);
  };
  const saveAsDesign = async () => {
    if (!saveName?.trim()) return;
    try {
      const d = await api.saveDesign(saveName.trim(), theme);
      setDesigns((x) => [d, ...x]);
      onDesign({ ...theme, id: d.theme.id, name: d.name }, d.id);
      setSaveName(null);
      toast(`Saved as design "${d.name}"`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const uploadLogo = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const m: MediaItem[] = await api.uploadMedia(deckId, Array.from(files));
      if (m[0]) set({ logoMediaId: m[0].id });
      else toast("That file type is not accepted. Use PNG, JPEG, WebP or SVG.", true);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <div className="stack">
      <div className="field">
        <label>Look <span className="help">{designId ? "Your design" : "Preset"}: {theme.name}</span></label>
        <ThemeCards
          width={130}
          options={[...designs.map((d) => ({ key: d.id, name: d.name, theme: d.theme, mine: true, hint: d.notes })), ...THEME_PRESETS.map((t) => ({ key: t.id, name: t.name, theme: t }))]}
          isOn={(o) => (o.mine ? designId === o.key : !designId && theme.id === o.key)}
          onPick={(o) => {
            const d = designs.find((x) => x.id === o.key);
            if (o.mine && d) applyDesign(d);
            else applyPreset(o.key);
          }}
        />
        {designs.length === 0 && <span className="help">Your own designs appear here too. <Link to="/designs">Add a reference design</Link> (PowerPoint, PDF or a screenshot).</span>}
        <span className="help">Choosing a look replaces colours, fonts, radius and style. Footer and logo stay.</span>
        {saveName === null ? (
          <button className="btn btn-quiet btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => setSaveName(theme.name.startsWith("design") ? "" : `${theme.name} (mine)`)}>Save this look as a design</button>
        ) : (
          <div className="row" style={{ gap: 6 }}>
            <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Design name" style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-xs" onClick={saveAsDesign} disabled={!saveName.trim()}>Save</button>
            <button className="btn btn-quiet btn-xs" onClick={() => setSaveName(null)}>Cancel</button>
          </div>
        )}
      </div>
      <div className="field">
        <label>Colours</label>
        <div className="mini" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {(Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]).map((k) => (
            <label key={k} className="row small" style={{ gap: 6 }}>
              <input type="color" value={toHex(theme.colors[k])} onChange={(e) => setColor(k, e.target.value.toUpperCase())} />
              <span>{COLOR_LABELS[k]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid c2" style={{ gap: 10 }}>
        <div className="field">
          <label>Display font</label>
          <select value={theme.fontDisplay} onChange={(e) => set({ fontDisplay: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f}>{f}</option>)}</select>
        </div>
        <div className="field">
          <label>Body font</label>
          <select value={theme.fontBody} onChange={(e) => set({ fontBody: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f}>{f}</option>)}</select>
        </div>
      </div>
      <div className="field">
        <label>Corner radius <span>{theme.radius}px</span></label>
        <input type="range" min={0} max={60} value={theme.radius} onChange={(e) => set({ radius: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label>Slide style</label>
        <div className="row">
          {(["clean", "panel", "gradient"] as const).map((s) => (
            <button key={s} className={"btn btn-ghost btn-xs" + (theme.slideStyle === s ? " active" : "")} onClick={() => set({ slideStyle: s })}>{s}</button>
          ))}
        </div>
        <span className="help">clean: flat background. panel: content on a card. gradient: brand wash behind everything.</span>
      </div>
      <div className="field">
        <label>Footer text</label>
        <input type="text" value={theme.footer ?? ""} onChange={(e) => set({ footer: e.target.value || undefined })} placeholder="e.g. ws.regulab · Confidential" />
      </div>
      <div className="field">
        <label>Logo</label>
        <div className="row">
          {theme.logoMediaId && <img src={`/api/media/${theme.logoMediaId}`} alt="" style={{ height: 28, maxWidth: 140, objectFit: "contain", background: "#fff", padding: 3, borderRadius: 6, border: "1px solid var(--line)" }} />}
          <button className="btn btn-ghost btn-xs" onClick={() => logoRef.current?.click()}>{theme.logoMediaId ? "Replace" : "Upload"}</button>
          {theme.logoMediaId && <button className="btn btn-quiet btn-xs" onClick={() => set({ logoMediaId: undefined })}>Remove</button>}
          <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => uploadLogo(e.target.files)} />
        </div>
        <span className="help">Top-left on every content slide. PNG with transparency works best.</span>
      </div>
      <label className="row small"><input type="checkbox" checked={theme.slideNumbers} onChange={(e) => set({ slideNumbers: e.target.checked })} /> Slide numbers</label>
    </div>
  );
}

function toHex(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000";
}
