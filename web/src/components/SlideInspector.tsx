import { useEffect, useRef, useState } from "react";
import { type ChartSpec, type DiagramSpec, type Slide, type SlopHit, type TableSpec, type Theme } from "@slidecraft/shared";
import { fillFor, LAYOUT_NAMES, LayoutPicker } from "./LayoutPicker";
import { api, type MediaItem } from "../api";
import { toast } from "./Toast";

interface Props {
  deckId: string;
  slide: Slide;
  hits: SlopHit[];
  lang: "en" | "ms";
  theme: Theme;
  onChange: (s: Slide) => void;
  onRewrite: (instruction: string) => Promise<void>;
}

function Lines({ label, value, onChange, help, rows = 4 }: { label: string; value: string[] | undefined; onChange: (v: string[]) => void; help?: string; rows?: number }) {
  return (
    <div className="field">
      <label>{label}<span className="help">{help ?? "One per line"}</span></label>
      <textarea rows={rows} value={(value ?? []).join("\n")} onChange={(e) => onChange(e.target.value.split("\n").filter((l, i, a) => l.trim() || i < a.length - 1))} />
    </div>
  );
}

function Text({ label, value, onChange, help, rows }: { label: string; value: string | undefined; onChange: (v: string) => void; help?: string; rows?: number }) {
  return (
    <div className="field">
      <label>{label}{help && <span className="help">{help}</span>}</label>
      {rows ? <textarea rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} /> : <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function ChartEditor({ chart, onChange }: { chart: ChartSpec; onChange: (c: ChartSpec) => void }) {
  const setSeries = (i: number, patch: Partial<{ name: string; values: number[] }>) => onChange({ ...chart, series: chart.series.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="grid c2" style={{ gap: 8 }}>
        <div className="field"><label>Kind</label>
          <select value={chart.kind} onChange={(e) => onChange({ ...chart, kind: e.target.value as ChartSpec["kind"] })}>
            {["column", "bar", "line", "area", "pie", "doughnut"].map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <Text label="Unit" value={chart.unit} onChange={(v) => onChange({ ...chart, unit: v || undefined })} />
      </div>
      <Text label="Categories" help="Comma separated" value={chart.categories.join(", ")} onChange={(v) => onChange({ ...chart, categories: v.split(",").map((s) => s.trim()) })} />
      {chart.series.map((s, i) => (
        <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 2fr auto", gap: 6, alignItems: "end" }}>
          <Text label={`Series ${i + 1}`} value={s.name} onChange={(v) => setSeries(i, { name: v })} />
          <Text label="Values" help="Comma separated numbers" value={s.values.join(", ")} onChange={(v) => setSeries(i, { values: v.split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)) })} />
          <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => onChange({ ...chart, series: chart.series.filter((_, k) => k !== i) })} disabled={chart.series.length < 2}>✕</button>
        </div>
      ))}
      <div className="row">
        <button className="btn btn-ghost btn-xs" onClick={() => onChange({ ...chart, series: [...chart.series, { name: `Series ${chart.series.length + 1}`, values: chart.categories.map(() => 0) }] })}>Add series</button>
      </div>
      <Text label="Source" value={chart.source} onChange={(v) => onChange({ ...chart, source: v || undefined })} />
    </div>
  );
}

function TableEditor({ table, onChange }: { table: TableSpec; onChange: (t: TableSpec) => void }) {
  const cols = table.header.length;
  const setCell = (r: number, c: number, v: string) => onChange({ ...table, rows: table.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <table className="edit">
        <thead>
          <tr>{table.header.map((h, j) => <td key={j}><input type="text" value={h} style={{ fontWeight: 600 }} onChange={(e) => onChange({ ...table, header: table.header.map((x, k) => (k === j ? e.target.value : x)) })} /></td>)}<td /></tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {Array.from({ length: cols }).map((_, j) => <td key={j}><input type="text" value={row[j] ?? ""} onChange={(e) => setCell(i, j, e.target.value)} /></td>)}
              <td><button className="btn btn-quiet btn-xs" onClick={() => onChange({ ...table, rows: table.rows.filter((_, k) => k !== i) })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn btn-ghost btn-xs" onClick={() => onChange({ ...table, rows: [...table.rows, Array(cols).fill("")] })}>Add row</button>
        <button className="btn btn-ghost btn-xs" onClick={() => onChange({ ...table, header: [...table.header, ""], rows: table.rows.map((r) => [...r, ""]) })} disabled={cols >= 6}>Add column</button>
        <button className="btn btn-quiet btn-xs" onClick={() => onChange({ ...table, header: table.header.slice(0, -1), rows: table.rows.map((r) => r.slice(0, -1)) })} disabled={cols <= 1}>Drop last column</button>
      </div>
      <Text label="Source" value={table.source} onChange={(v) => onChange({ ...table, source: v || undefined })} />
    </div>
  );
}

function DiagramEditor({ d, onChange }: { d: DiagramSpec; onChange: (d: DiagramSpec) => void }) {
  const kind = d.kind;
  const switchKind = (k: DiagramSpec["kind"]) => {
    if (k === kind) return;
    if (k === "flow") onChange({ kind: "flow", steps: [{ label: "Step 1" }, { label: "Step 2" }, { label: "Step 3" }] });
    else if (k === "timeline") onChange({ kind: "timeline", events: [{ when: "2025", label: "Event" }, { when: "2026", label: "Event" }] });
    else onChange({ kind: "matrix", rows: ["Row 1", "Row 2"], cols: ["A", "B"], cells: [["yes", "no"], ["no", "yes"]] });
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {(["flow", "timeline", "matrix"] as const).map((k) => <button key={k} className={"btn btn-ghost btn-xs" + (kind === k ? " active" : "")} onClick={() => switchKind(k)}>{k}</button>)}
      </div>
      {d.kind === "flow" && (
        <>
          {d.steps.map((s, i) => (
            <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1.4fr auto", gap: 6, alignItems: "end" }}>
              <Text label={`Step ${i + 1}`} value={s.label} onChange={(v) => onChange({ ...d, steps: d.steps.map((x, k) => (k === i ? { ...x, label: v } : x)) })} />
              <Text label="Detail" value={s.detail} onChange={(v) => onChange({ ...d, steps: d.steps.map((x, k) => (k === i ? { ...x, detail: v || undefined } : x)) })} />
              <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => onChange({ ...d, steps: d.steps.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => onChange({ ...d, steps: [...d.steps, { label: `Step ${d.steps.length + 1}` }] })} disabled={d.steps.length >= 10}>Add step</button></div>
        </>
      )}
      {d.kind === "timeline" && (
        <>
          {d.events.map((s, i) => (
            <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1.6fr auto", gap: 6, alignItems: "end" }}>
              <Text label="When" value={s.when} onChange={(v) => onChange({ ...d, events: d.events.map((x, k) => (k === i ? { ...x, when: v } : x)) })} />
              <Text label="Label" value={s.label} onChange={(v) => onChange({ ...d, events: d.events.map((x, k) => (k === i ? { ...x, label: v } : x)) })} />
              <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => onChange({ ...d, events: d.events.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => onChange({ ...d, events: [...d.events, { when: "", label: "" }] })} disabled={d.events.length >= 9}>Add event</button></div>
        </>
      )}
      {d.kind === "matrix" && (
        <>
          <Text label="Columns" help="Comma separated" value={d.cols.join(", ")} onChange={(v) => { const cols = v.split(",").map((s) => s.trim()); onChange({ ...d, cols, cells: d.rows.map((_, i) => cols.map((_, j) => d.cells[i]?.[j] ?? "")) }); }} />
          <Text label="Rows" help="Comma separated" value={d.rows.join(", ")} onChange={(v) => { const rows = v.split(",").map((s) => s.trim()); onChange({ ...d, rows, cells: rows.map((_, i) => d.cols.map((_, j) => d.cells[i]?.[j] ?? "")) }); }} />
          <table className="edit">
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={i}><td className="small" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r}</td>{d.cols.map((_, j) => <td key={j}><input type="text" value={d.cells[i]?.[j] ?? ""} placeholder="yes / no / text" onChange={(e) => onChange({ ...d, cells: d.rows.map((_, ri) => d.cols.map((_, cj) => (ri === i && cj === j ? e.target.value : d.cells[ri]?.[cj] ?? ""))) })} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ImagePicker({ deckId, slide, onChange }: { deckId: string; slide: Slide; onChange: (s: Slide) => void }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const load = () => api.media(deckId).then(setMedia).catch(() => {});
  useEffect(() => {
    load();
  }, [deckId]);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const m = await api.uploadMedia(deckId, Array.from(files));
      if (m[0]) onChange({ ...slide, image: { ...(slide.image ?? {}), mediaId: m[0].id, url: undefined } });
      load();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const img = slide.image ?? {};
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <button className="btn btn-ghost btn-xs" onClick={() => ref.current?.click()}>Upload picture</button>
        {img.mediaId && <button className="btn btn-quiet btn-xs" onClick={() => onChange({ ...slide, image: { ...img, mediaId: undefined } })}>Clear</button>}
        <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {media.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {media.map((m) => (
            <img key={m.id} src={`/api/media/${m.id}`} alt={m.name} title={m.name} onClick={() => onChange({ ...slide, image: { ...img, mediaId: m.id, url: undefined } })}
              style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: img.mediaId === m.id ? "2px solid var(--brand)" : "1px solid var(--line)" }} />
          ))}
        </div>
      )}
      <Text label="Or a picture address" value={img.url} onChange={(v) => onChange({ ...slide, image: { ...img, url: v || undefined } })} help="Used when no uploaded picture is chosen" />
      <Text label="Caption" value={img.caption} onChange={(v) => onChange({ ...slide, image: { ...img, caption: v || undefined } })} />
      <Text label="Alt text" value={img.alt} onChange={(v) => onChange({ ...slide, image: { ...img, alt: v || undefined } })} />
      <Text label="What the writer wanted here" value={img.prompt} onChange={(v) => onChange({ ...slide, image: { ...img, prompt: v || undefined } })} rows={2} />
    </div>
  );
}

export function SlideInspector({ deckId, slide, hits, lang, theme, onChange, onRewrite }: Props) {
  const [instr, setInstr] = useState("");
  const [pickLayout, setPickLayout] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Slide>) => onChange({ ...slide, ...patch });
  const rewrite = async () => {
    setBusy(true);
    try {
      await onRewrite(instr);
      setInstr("");
    } finally {
      setBusy(false);
    }
  };
  const L = slide.layout;
  return (
    <div>
      {hits.length > 0 && (
        <div className="field">
          <label>Flagged wording <span className="help">{hits.length} hit{hits.length === 1 ? "" : "s"}</span></label>
          <div className="hits">{hits.map((h, i) => <div key={i} className="hit"><b>{h.field}</b> · "{h.phrase}" · {h.note}</div>)}</div>
        </div>
      )}
      <div className="field">
        <label>Rewrite with the writer <span className="help">Sends this slide only</span></label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="text" value={instr} onChange={(e) => setInstr(e.target.value)} placeholder={hits.length ? "Remove the flagged wording, keep the facts" : "e.g. shorter, add the 2024 figure, make it a table"} onKeyDown={(e) => e.key === "Enter" && !busy && rewrite()} />
          <button className="btn btn-primary btn-sm" onClick={rewrite} disabled={busy}>{busy ? <span className="spin" /> : "Rewrite"}</button>
        </div>
      </div>
      <hr />
      <div className="field">
        <label>Layout <span className="help">{LAYOUT_NAMES[L]}</span></label>
        <button className="btn btn-ghost btn-xs" style={{ alignSelf: "flex-start" }} onClick={() => setPickLayout((v) => !v)}>{pickLayout ? "Close" : "Change layout"}</button>
        {pickLayout && (
          <>
            <span className="help">Each picture is this slide in that layout. Content that does not fit a layout stays saved and comes back if you switch again.</span>
            <LayoutPicker theme={theme} lang={lang} slide={slide} current={L} width={130} onPick={(l) => { set({ ...fillFor(slide, l), layout: l }); setPickLayout(false); }} />
          </>
        )}
      </div>
      <Text label="Title" value={slide.title} onChange={(v) => set({ title: v })} rows={2} />
      {(L === "title" || L === "closing" || L === "section") && <Text label="Subtitle" value={slide.subtitle} onChange={(v) => set({ subtitle: v || undefined })} rows={2} />}
      {(L === "bullets" || L === "kpi" || L === "diagram" || L === "title" || L === "closing") && <Text label="Body text" help={L === "bullets" ? "One sentence above the bullets" : "Optional line under the content"} value={slide.body} onChange={(v) => set({ body: v || undefined })} rows={2} />}
      {(L === "bullets" || L === "chart" || L === "image") && <Lines label={L === "bullets" ? "Bullets" : "Points beside the figure"} value={slide.bullets} onChange={(v) => set({ bullets: v })} rows={L === "bullets" ? 7 : 4} />}
      {L === "two-column" && (
        <>
          <div className="grid c2" style={{ gap: 8 }}>
            <Text label="Left heading" value={slide.leftHeading} onChange={(v) => set({ leftHeading: v || undefined })} />
            <Text label="Right heading" value={slide.rightHeading} onChange={(v) => set({ rightHeading: v || undefined })} />
          </div>
          <Lines label="Left bullets" value={slide.bullets} onChange={(v) => set({ bullets: v })} />
          <Lines label="Right bullets" value={slide.bulletsRight} onChange={(v) => set({ bulletsRight: v })} />
        </>
      )}
      {L === "chart" && <ChartEditor chart={slide.chart ?? { kind: "column", categories: ["A", "B"], series: [{ name: "Series", values: [1, 2] }] }} onChange={(c) => set({ chart: c })} />}
      {L === "table" && <TableEditor table={slide.table ?? { header: ["Item", "Value"], rows: [["", ""]] }} onChange={(t) => set({ table: t })} />}
      {L === "diagram" && <DiagramEditor d={slide.diagram ?? { kind: "flow", steps: [{ label: "Step 1" }, { label: "Step 2" }] }} onChange={(d) => set({ diagram: d })} />}
      {L === "kpi" && (
        <div className="field">
          <label>KPI tiles</label>
          {(slide.kpi ?? []).map((k, i) => (
            <div key={i} className="grid" style={{ gridTemplateColumns: "0.8fr 1.2fr 1fr auto", gap: 6, alignItems: "end" }}>
              <Text label="Value" value={k.value} onChange={(v) => set({ kpi: slide.kpi!.map((x, j) => (j === i ? { ...x, value: v } : x)) })} />
              <Text label="Label" value={k.label} onChange={(v) => set({ kpi: slide.kpi!.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
              <Text label="Note" value={k.note} onChange={(v) => set({ kpi: slide.kpi!.map((x, j) => (j === i ? { ...x, note: v || undefined } : x)) })} />
              <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => set({ kpi: slide.kpi!.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => set({ kpi: [...(slide.kpi ?? []), { label: "Metric", value: "0" }] })} disabled={(slide.kpi?.length ?? 0) >= 4}>Add tile</button></div>
        </div>
      )}
      {L === "quote" && (
        <>
          <Text label="Quotation" value={slide.quote?.text} onChange={(v) => set({ quote: { ...(slide.quote ?? { text: "" }), text: v } })} rows={3} />
          <Text label="Attributed to" value={slide.quote?.by} onChange={(v) => set({ quote: { ...(slide.quote ?? { text: "" }), by: v || undefined } })} />
        </>
      )}
      {L === "image" && <ImagePicker deckId={deckId} slide={slide} onChange={onChange} />}
      <hr />
      <Lines label="Citations" help="One per line. Instrument and clause, paper, dataset or file." value={slide.citations} onChange={(v) => set({ citations: v })} rows={3} />
      <Text label="Speaker notes" value={slide.notes} onChange={(v) => set({ notes: v || undefined })} rows={6} help={lang === "ms" ? "Apa yang dikatakan penyampai" : "What the presenter says"} />
    </div>
  );
}
