import { useEffect, useRef, useState } from "react";
import { MAP_REGIONS, MAP_TILES, type AsidePanel, type CardItem, type ChartSpec, type DiagramSpec, type FactItem, type ImageRef, type Layout, type MapSpec, type Slide, type SlopHit, type TableSpec, type Theme } from "@slidecraft/shared";
import { fillFor, LAYOUT_NAMES, LayoutPicker } from "./LayoutPicker";
import { api, mediaUrl, type MediaItem } from "../api";
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

/**
 * Text the user is typing, kept exactly as typed ("first⏎", "1.", "-"), and
 * only replaced when the value changes from outside (a rewrite, another slide).
 */
function useDraft<T>(value: T, format: (v: T) => string, parse: (s: string) => T): [string, (s: string) => void] {
  const [draft, setDraft] = useState(() => format(value));
  const outside = format(value);
  useEffect(() => {
    setDraft((d) => (format(parse(d)) === outside ? d : outside));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outside]);
  return [draft, setDraft];
}

const splitLines = (s: string) => s.split("\n").filter((l) => l.trim());

function Lines({ label, value, onChange, help, rows = 4 }: { label: string; value: string[] | undefined; onChange: (v: string[]) => void; help?: string; rows?: number }) {
  const [draft, setDraft] = useDraft(value ?? [], (v) => v.join("\n"), splitLines);
  return (
    <div className="field">
      <label>{label}<span className="help">{help ?? "One per line"}</span></label>
      <textarea
        rows={rows}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(splitLines(e.target.value));
        }}
      />
    </div>
  );
}

const parseNumbers = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean).map(Number).filter((x) => Number.isFinite(x));

/** Numbers as typed: "1." and "-" stay in the box until they are numbers. */
function Numbers({ label, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  const [draft, setDraft] = useDraft(value, (v) => v.join(", "), parseNumbers);
  return (
    <div className="field">
      <label>{label}<span className="help">Comma separated numbers</span></label>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(parseNumbers(e.target.value));
        }}
      />
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

const cardLine = (c: CardItem) => [c.heading, c.detail ?? "", c.tag ?? ""].join(" | ").replace(/( \| )+$/, "");

/** Cards as lines of "heading | detail | tag". The text is kept as typed, so a half-written line is not rewritten under the cursor. */
const parseCards = (text: string): CardItem[] =>
  text
    .split("\n")
    .map((line) => {
      const [heading = "", detail, tag] = line.split("|").map((x) => x.trim());
      return { heading, ...(detail ? { detail } : {}), ...(tag ? { tag } : {}) };
    })
    .filter((c) => c.heading);

function CardsEditor({ cards, onChange }: { cards: CardItem[]; onChange: (c: CardItem[]) => void }) {
  // Follows the slide when a rewrite changes its cards, so a keystroke never writes stale cards back.
  const [text, setText] = useDraft(cards, (c) => c.map(cardLine).join("\n"), parseCards);
  return (
    <div className="field">
      <label>Cards<span className="help">One per line: heading | detail | tag. Tags like YES, PARTLY, NO or HIGH, MEDIUM, LOW are coloured.</span></label>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseCards(e.target.value));
        }}
      />
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
      {chart.series.length === 1 && (chart.kind === "bar" || chart.kind === "column") && (
        <div className="field"><label>Highlight<span className="help">Draws one category in the brand colour and the rest in grey, e.g. our product against competitors</span></label>
          <select value={chart.highlight ?? ""} onChange={(e) => onChange({ ...chart, highlight: e.target.value || undefined })}>
            <option value="">None</option>
            {chart.categories.filter(Boolean).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      )}
      {chart.series.map((s, i) => (
        <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 2fr auto", gap: 6, alignItems: "end" }}>
          <Text label={`Series ${i + 1}`} value={s.name} onChange={(v) => setSeries(i, { name: v })} />
          <Numbers label="Values" value={s.values} onChange={(v) => setSeries(i, { values: v })} />
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
    if (k !== kind) onChange(sampleDiagram(k));
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {DIAGRAM_KINDS.map(([k, name]) => <button key={k} className={"btn btn-ghost btn-xs" + (kind === k ? " active" : "")} onClick={() => switchKind(k)}>{name}</button>)}
      </div>
      {d.kind === "hub" && (
        <>
          <Text label="Centre" help="The product, ingredient or claim" value={d.center} onChange={(v) => onChange({ ...d, center: v })} />
          {d.nodes.map((n, i) => (
            <div key={i} className="grid" style={{ gridTemplateColumns: "1fr 1.4fr auto", gap: 6, alignItems: "end" }}>
              <Text label={`Benefit ${i + 1}`} value={n.label} onChange={(v) => onChange({ ...d, nodes: d.nodes.map((x, k) => (k === i ? { ...x, label: v } : x)) })} />
              <Text label="Detail" value={n.detail} onChange={(v) => onChange({ ...d, nodes: d.nodes.map((x, k) => (k === i ? { ...x, detail: v || undefined } : x)) })} />
              <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => onChange({ ...d, nodes: d.nodes.filter((_, k) => k !== i) })} disabled={d.nodes.length < 2}>✕</button>
            </div>
          ))}
          <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => onChange({ ...d, nodes: [...d.nodes, { label: `Benefit ${d.nodes.length + 1}` }] })} disabled={d.nodes.length >= 8}>Add benefit</button></div>
          <Lines label="Metric pills" help="One per line, e.g. +45% hydration. Up to 5." value={d.pills} onChange={(v) => onChange({ ...d, pills: v.length ? v.slice(0, 5) : undefined })} rows={3} />
        </>
      )}
      {d.kind === "funnel" && (
        <>
          {d.stages.map((st, i) => (
            <div key={i} className="grid" style={{ gridTemplateColumns: "0.7fr 1.5fr auto", gap: 6, alignItems: "end" }}>
              <Text label={`Stage ${i + 1}`} value={st.value} onChange={(v) => onChange({ ...d, stages: d.stages.map((x, k) => (k === i ? { ...x, value: v } : x)) })} />
              <Text label="What it counts" value={st.label} onChange={(v) => onChange({ ...d, stages: d.stages.map((x, k) => (k === i ? { ...x, label: v } : x)) })} />
              <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => onChange({ ...d, stages: d.stages.filter((_, k) => k !== i) })} disabled={d.stages.length < 3}>✕</button>
            </div>
          ))}
          <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => onChange({ ...d, stages: [...d.stages, { value: "0", label: "" }] })} disabled={d.stages.length >= 7}>Add stage</button></div>
          <span className="help">Plain counts show how many carried over from the stage before (26%).</span>
        </>
      )}
      {d.kind === "equation" && (
        <>
          {d.terms.map((t, i) => (
            <div key={i} className="grid" style={{ gridTemplateColumns: "0.7fr 1.5fr auto", gap: 6, alignItems: "end" }}>
              <Text label={`Term ${i + 1}`} value={t.value} onChange={(v) => onChange({ ...d, terms: d.terms.map((x, k) => (k === i ? { ...x, value: v } : x)) })} />
              <Text label="Label" value={t.label} onChange={(v) => onChange({ ...d, terms: d.terms.map((x, k) => (k === i ? { ...x, label: v } : x)) })} />
              <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => onChange({ ...d, terms: d.terms.filter((_, k) => k !== i) })} disabled={d.terms.length < 3}>✕</button>
            </div>
          ))}
          <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => onChange({ ...d, terms: [...d.terms, { value: "", label: "" }] })} disabled={d.terms.length >= 5}>Add term</button></div>
          <div className="grid" style={{ gridTemplateColumns: "0.7fr 1.5fr", gap: 6 }}>
            <Text label="= Result" value={d.result?.value} onChange={(v) => onChange({ ...d, result: v || d.result?.label ? { value: v, label: d.result?.label ?? "" } : undefined })} />
            <Text label="Result label" value={d.result?.label} onChange={(v) => onChange({ ...d, result: v || d.result?.value ? { value: d.result?.value ?? "", label: v } : undefined })} />
          </div>
        </>
      )}
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


const DIAGRAM_KINDS: [DiagramSpec["kind"], string][] = [["flow", "Flow"], ["timeline", "Timeline"], ["matrix", "Matrix"], ["hub", "Mechanism map"], ["funnel", "Funnel"], ["equation", "Equation"]];

export function sampleDiagram(k: DiagramSpec["kind"]): DiagramSpec {
  if (k === "timeline") return { kind: "timeline", events: [{ when: "2025", label: "Event" }, { when: "2026", label: "Event" }] };
  if (k === "matrix") return { kind: "matrix", rows: ["Row 1", "Row 2"], cols: ["A", "B"], cells: [["yes", "no"], ["no", "yes"]] };
  if (k === "hub") return { kind: "hub", center: "Product", nodes: [{ label: "Benefit 1" }, { label: "Benefit 2" }, { label: "Benefit 3" }, { label: "Benefit 4" }], pills: ["+00% metric"] };
  if (k === "funnel") return { kind: "funnel", stages: [{ value: "300", label: "Reached" }, { value: "80", label: "Engaged" }, { value: "20", label: "Converted" }] };
  if (k === "equation") return { kind: "equation", terms: [{ value: "3", label: "actives" }, { value: "28", label: "days" }], result: { value: "1", label: "claim" } };
  return { kind: "flow", steps: [{ label: "Step 1" }, { label: "Step 2" }, { label: "Step 3" }] };
}

function FactsEditor({ facts, onChange }: { facts: FactItem[]; onChange: (f: FactItem[]) => void }) {
  return (
    <div className="field">
      <label>Fact sheet<span className="help">Tick the row that matters most: it is shaded.</span></label>
      {facts.map((f, i) => (
        <div key={i} className="grid" style={{ gridTemplateColumns: "0.9fr 1.6fr auto auto", gap: 6, alignItems: "end" }}>
          <Text label="Label" value={f.label} onChange={(v) => onChange(facts.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
          <Text label="Value" value={f.value} onChange={(v) => onChange(facts.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
          <label className="row small" style={{ gap: 4, marginBottom: 14 }} title="Shade this row"><input type="checkbox" checked={!!f.highlight} onChange={(e) => onChange(facts.map((x, j) => (j === i ? { ...x, highlight: e.target.checked || undefined } : x)))} />Key</label>
          <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => onChange(facts.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => onChange([...facts, { label: "", value: "" }])} disabled={facts.length >= 10}>Add row</button></div>
    </div>
  );
}

function MapEditor({ map, lang, onChange }: { map: MapSpec; lang: "en" | "ms"; onChange: (m: MapSpec) => void }) {
  const used = new Set(map.areas.map((a) => a.code));
  const free = MAP_TILES.filter((t) => !used.has(t.code));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field"><label>Region<span className="help">Countries outside it are still drawn when you add them</span></label>
        <select value={map.region} onChange={(e) => onChange({ ...map, region: e.target.value as MapSpec["region"] })}>{MAP_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      </div>
      <span className="help">Status sets the colour: YES, ALLOWED, APPROVED are green; PARTLY, RESTRICTED, PENDING are amber; NO, BANNED, PROHIBITED are red; anything else is the brand colour.</span>
      {map.areas.map((a, i) => (
        <div key={a.code} className="grid" style={{ gridTemplateColumns: "1.1fr 1fr 1.3fr auto", gap: 6, alignItems: "end" }}>
          <div className="field"><label>Country</label>
            <select value={a.code} onChange={(e) => onChange({ ...map, areas: map.areas.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)) })}>
              {MAP_TILES.filter((t) => t.code === a.code || !used.has(t.code)).map((t) => <option key={t.code} value={t.code}>{lang === "ms" ? t.nameMs : t.name}</option>)}
            </select>
          </div>
          <Text label="Status" value={a.status} onChange={(v) => onChange({ ...map, areas: map.areas.map((x, j) => (j === i ? { ...x, status: v } : x)) })} />
          <Text label="Note" value={a.note} onChange={(v) => onChange({ ...map, areas: map.areas.map((x, j) => (j === i ? { ...x, note: v || undefined } : x)) })} />
          <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => onChange({ ...map, areas: map.areas.filter((_, j) => j !== i) })} disabled={map.areas.length < 2}>✕</button>
        </div>
      ))}
      <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => free[0] && onChange({ ...map, areas: [...map.areas, { code: free[0].code, status: "" }] })} disabled={!free.length}>Add country</button></div>
      <Text label="What the colours show" value={map.legend} onChange={(v) => onChange({ ...map, legend: v || undefined })} />
      <Text label="Source" value={map.source} onChange={(v) => onChange({ ...map, source: v || undefined })} />
    </div>
  );
}

function GalleryEditor({ deckId, items, onChange }: { deckId: string; items: ImageRef[]; onChange: (g: ImageRef[]) => void }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const load = () => api.media(deckId).then(setMedia).catch(() => {});
  useEffect(() => {
    load();
  }, [deckId]);
  const setItem = (i: number, patch: Partial<ImageRef>) => onChange(items.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const m = await api.uploadMedia(deckId, Array.from(files));
      // New pictures fill the empty frames first, then are added as frames of their own.
      const next = items.slice();
      for (const x of m) {
        const empty = next.findIndex((g) => !g.mediaId && !g.url);
        if (empty >= 0) next[empty] = { ...next[empty], mediaId: x.id };
        else if (next.length < 6) next.push({ mediaId: x.id, caption: "" });
      }
      onChange(next);
      load();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <div className="field">
      <label>Gallery<span className="help">2 to 6 pictures, each with a caption</span></label>
      {items.map((g, i) => (
        <div key={i} className="grid" style={{ gridTemplateColumns: "64px 1fr auto auto", gap: 6, alignItems: "center" }}>
          {g.mediaId ? <img src={mediaUrl(g.mediaId)} alt="" style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} /> : <span className="small muted" style={{ width: 64 }}>empty</span>}
          <input type="text" value={g.caption ?? ""} placeholder="Caption" onChange={(e) => setItem(i, { caption: e.target.value || undefined })} />
          <button className="btn btn-ghost btn-xs" onClick={() => setPick(pick === i ? null : i)}>{pick === i ? "Close" : "Pick"}</button>
          <button className="btn btn-quiet btn-xs" onClick={() => onChange(items.filter((_, j) => j !== i))} disabled={items.length < 3}>✕</button>
          {pick === i && (
            <div className="row" style={{ gap: 6, gridColumn: "1 / -1" }}>
              {media.length ? media.map((m) => (
                <img key={m.id} src={mediaUrl(m.id)} alt={m.name} title={m.name} onClick={() => { setItem(i, { mediaId: m.id, url: undefined }); setPick(null); }}
                  style={{ width: 64, height: 44, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: g.mediaId === m.id ? "2px solid var(--brand)" : "1px solid var(--line)" }} />
              )) : <span className="small muted">No pictures in this deck yet. Upload some.</span>}
            </div>
          )}
        </div>
      ))}
      <div className="row">
        <button className="btn btn-ghost btn-xs" onClick={() => ref.current?.click()}>Upload pictures</button>
        <button className="btn btn-ghost btn-xs" onClick={() => onChange([...items, { caption: "" }])} disabled={items.length >= 6}>Add frame</button>
        <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
    </div>
  );
}

function AsideEditor({ aside, onChange }: { aside: AsidePanel[]; onChange: (a: AsidePanel[] | undefined) => void }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {aside.map((a, i) => (
        <div key={i} className="stack" style={{ gap: 4, borderLeft: "3px solid var(--line)", paddingLeft: 8 }}>
          <div className="grid" style={{ gridTemplateColumns: "1fr auto", gap: 6, alignItems: "end" }}>
            <Text label={`Side panel ${i + 1}`} value={a.heading} onChange={(v) => onChange(aside.map((x, j) => (j === i ? { ...x, heading: v } : x)))} />
            <button className="btn btn-quiet btn-xs" style={{ marginBottom: 12 }} onClick={() => { const next = aside.filter((_, j) => j !== i); onChange(next.length ? next : undefined); }}>✕</button>
          </div>
          <Lines label="Points" value={a.items} onChange={(v) => onChange(aside.map((x, j) => (j === i ? { ...x, items: v.slice(0, 5) } : x)))} rows={3} />
        </div>
      ))}
      {aside.length < 2 && <div className="row"><button className="btn btn-ghost btn-xs" onClick={() => onChange([...aside, { heading: aside.length ? "Watch-outs" : "Reading", items: [] }])}>Add side panel</button></div>}
    </div>
  );
}

/** Everything a slide can carry, as one choice each: pick it and the slide shows it. */
type AddChoice = { id: string; label: string; help: string; apply: (s: Slide, lang: "en" | "ms") => Partial<Slide>; on: (s: Slide) => boolean };

const asLayout = (l: Layout, extra?: (s: Slide) => Partial<Slide>) => (s: Slide) => ({ ...fillFor(s, l), layout: l, ...(extra ? extra(s) : {}) });
const asDiagram = (k: DiagramSpec["kind"]) => (s: Slide): Partial<Slide> => ({ layout: "diagram", diagram: s.diagram?.kind === k ? s.diagram : sampleDiagram(k) });

const ADD_VISUALS: AddChoice[] = [
  { id: "chart", label: "Chart", help: "Column, bar, line, area, pie or doughnut", apply: asLayout("chart"), on: (s) => s.layout === "chart" },
  { id: "table", label: "Table", help: "Rows and columns with verdict colours", apply: asLayout("table"), on: (s) => s.layout === "table" },
  { id: "flow", label: "Flow", help: "A process in numbered steps", apply: asDiagram("flow"), on: (s) => s.layout === "diagram" && s.diagram?.kind === "flow" },
  { id: "timeline", label: "Timeline", help: "Dated events on a line", apply: asDiagram("timeline"), on: (s) => s.layout === "diagram" && s.diagram?.kind === "timeline" },
  { id: "matrix", label: "Matrix", help: "A comparison grid with ticks", apply: asDiagram("matrix"), on: (s) => s.layout === "diagram" && s.diagram?.kind === "matrix" },
  { id: "hub", label: "Mechanism map", help: "The product in the centre, benefits around it", apply: asDiagram("hub"), on: (s) => s.layout === "diagram" && s.diagram?.kind === "hub" },
  { id: "funnel", label: "Funnel", help: "Big numbers dropping stage by stage", apply: asDiagram("funnel"), on: (s) => s.layout === "diagram" && s.diagram?.kind === "funnel" },
  { id: "equation", label: "Equation", help: "Terms that add up to a result", apply: asDiagram("equation"), on: (s) => s.layout === "diagram" && s.diagram?.kind === "equation" },
  { id: "map", label: "Country map", help: "ASEAN, Asia Pacific or world, coloured by status", apply: asLayout("map"), on: (s) => s.layout === "map" },
  { id: "kpi", label: "Big numbers", help: "3 or 4 headline figures as tiles", apply: asLayout("kpi", () => ({ kpiStyle: "tiles" })), on: (s) => s.layout === "kpi" && s.kpiStyle !== "rings" },
  { id: "rings", label: "Ring gauges", help: "Percentages as rings", apply: asLayout("kpi", () => ({ kpiStyle: "rings" })), on: (s) => s.layout === "kpi" && s.kpiStyle === "rings" },
  { id: "facts", label: "Fact sheet", help: "Label and value rows, like a study card", apply: asLayout("facts"), on: (s) => s.layout === "facts" },
  { id: "cards", label: "Numbered cards", help: "2 to 6 points with a tag each", apply: asLayout("cards"), on: (s) => s.layout === "cards" },
  { id: "image", label: "Figure", help: "One picture with points beside it", apply: asLayout("image"), on: (s) => s.layout === "image" },
  { id: "gallery", label: "Gallery", help: "2 to 6 pictures with captions", apply: asLayout("gallery"), on: (s) => s.layout === "gallery" },
  { id: "two-column", label: "Two columns", help: "Before and after, option A and B", apply: asLayout("two-column"), on: (s) => s.layout === "two-column" },
  { id: "quote", label: "Quote", help: "One quotation, large", apply: asLayout("quote"), on: (s) => s.layout === "quote" },
];

function AddPanel({ slide, lang, onChange }: { slide: Slide; lang: "en" | "ms"; onChange: (s: Slide) => void }) {
  const structural = ["title", "section", "closing"].includes(slide.layout);
  const extras = [
    { id: "badge", label: "Verdict badge", on: !!slide.badge, add: { badge: "PARTIAL" }, off: { badge: undefined } },
    { id: "callout", label: "Callout banner", on: !!slide.callout, add: { callout: lang === "ms" ? "Satu ayat yang perlu diingati." : "The one line to remember." }, off: { callout: undefined } },
    { id: "aside", label: "Side panels", on: !!slide.aside?.length, add: { aside: [{ heading: "Reading", items: [lang === "ms" ? "Apa yang ditunjukkan" : "What it shows"] }, { heading: "Watch-outs", items: [lang === "ms" ? "Had dan kaveat" : "Limits and caveats"] }] }, off: { aside: undefined } },
  ] as const;
  return (
    <div className="field">
      <label>Add to this slide <span className="help">Pick what the slide should show. What you typed for another layout is kept and comes back if you switch again.</span></label>
      <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ADD_VISUALS.map((c) => (
          <button key={c.id} type="button" title={c.help} className={"btn btn-ghost btn-xs" + (c.on(slide) ? " active" : "")} onClick={() => onChange({ ...slide, ...c.apply(slide, lang) })}>{c.label}</button>
        ))}
      </div>
      {slide.layout === "title" && (
        <button type="button" className={"btn btn-ghost btn-xs" + (slide.kpi?.length ? " active" : "")} style={{ alignSelf: "flex-start", marginTop: 6 }} title="3 or 4 figures in a row under the subtitle"
          onClick={() => onChange({ ...slide, kpi: slide.kpi?.length ? undefined : [{ label: "Metric", value: "0" }, { label: "Metric", value: "0" }, { label: "Metric", value: "0" }] })}>{slide.kpi?.length ? "Remove hero figures" : "Hero figures"}</button>
      )}
      {!structural && (
        <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {extras.map((x) => (
            <button key={x.id} type="button" className={"btn btn-ghost btn-xs" + (x.on ? " active" : "")} onClick={() => onChange({ ...slide, ...(x.on ? x.off : x.add) } as Slide)}>{x.on ? `Remove ${x.label.toLowerCase()}` : `+ ${x.label}`}</button>
          ))}
        </div>
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
            <img key={m.id} src={mediaUrl(m.id)} alt={m.name} title={m.name} onClick={() => onChange({ ...slide, image: { ...img, mediaId: m.id, url: undefined } })}
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
  // One flagged phrase at a time: the writer is asked to take that phrase out and keep the slide's facts.
  const fixHit = async (h: SlopHit) => {
    setBusy(true);
    try {
      await onRewrite(`Remove the ${h.note} ("${h.phrase}") from the ${h.field}; keep every fact and figure, change nothing else.`);
    } finally {
      setBusy(false);
    }
  };
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
          <div className="hits">{hits.map((h, i) => <div key={i} className="hit row between" style={{ gap: 8 }}><span><b>{h.field}</b> · "{h.phrase}" · {h.note}</span><button className="btn btn-quiet btn-xs" disabled={busy} onClick={() => fixHit(h)} title="Ask the writer to remove this phrase and keep the facts">Fix</button></div>)}</div>
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
      <AddPanel slide={slide} lang={lang} onChange={onChange} />
      {L !== "title" && L !== "closing" && L !== "section" && <Text label="Kicker" help="Small label above the title, e.g. AT A GLANCE" value={slide.kicker} onChange={(v) => set({ kicker: v || undefined })} />}
      <Text label="Title" value={slide.title} onChange={(v) => set({ title: v })} rows={2} />
      <Text label={L === "title" || L === "closing" || L === "section" ? "Subtitle" : "Reading line"} help={L === "title" || L === "closing" || L === "section" ? undefined : "One sentence under the title: how to read this slide"} value={slide.subtitle} onChange={(v) => set({ subtitle: v || undefined })} rows={2} />
      {(L === "bullets" || L === "kpi" || L === "diagram" || L === "cards" || L === "facts" || L === "gallery" || L === "title" || L === "closing") && <Text label="Body text" help={L === "bullets" ? "One sentence above the bullets" : "Optional line under the content"} value={slide.body} onChange={(v) => set({ body: v || undefined })} rows={2} />}
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
          <label>Draw figures as</label>
          <select value={slide.kpiStyle ?? ""} onChange={(e) => set({ kpiStyle: (e.target.value || undefined) as Slide["kpiStyle"] })}>
            <option value="">As the design says{theme.kpiStyle === "rings" ? " (ring gauges)" : " (tiles)"}</option>
            <option value="tiles">Tiles</option>
            <option value="rings">Ring gauges (percentages fill the ring)</option>
          </select>
        </div>
      )}
      {(L === "kpi" || (L === "title" && !!slide.kpi?.length)) && (
        <div className="field">
          <label>{L === "title" ? "Hero figures" : "KPI tiles"}</label>
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
      {L === "cards" && <CardsEditor key={slide.id} cards={slide.cards ?? []} onChange={(cards) => set({ cards })} />}
      {L === "quote" && (
        <>
          <Text label="Quotation" value={slide.quote?.text} onChange={(v) => set({ quote: { ...(slide.quote ?? { text: "" }), text: v } })} rows={3} />
          <Text label="Attributed to" value={slide.quote?.by} onChange={(v) => set({ quote: { ...(slide.quote ?? { text: "" }), by: v || undefined } })} />
        </>
      )}
      {L === "image" && <ImagePicker deckId={deckId} slide={slide} onChange={onChange} />}
      {L === "facts" && <FactsEditor facts={slide.facts ?? []} onChange={(facts) => set({ facts })} />}
      {L === "gallery" && <GalleryEditor deckId={deckId} items={slide.gallery ?? []} onChange={(gallery) => set({ gallery })} />}
      {L === "map" && <MapEditor map={slide.map ?? { region: "asean", areas: [{ code: "MY", status: "" }] }} lang={lang} onChange={(map) => set({ map })} />}
      {slide.badge !== undefined && L !== "title" && L !== "closing" && L !== "section" && <Text label="Verdict badge" help="YES, PARTLY, NO and HIGH, MEDIUM, LOW are coloured" value={slide.badge} onChange={(v) => set({ badge: v })} />}
      {slide.callout !== undefined && L !== "title" && L !== "closing" && L !== "section" && <Text label="Callout banner" help="One sentence in a dark banner under the content" value={slide.callout} onChange={(v) => set({ callout: v })} rows={2} />}
      {!!slide.aside?.length && L !== "title" && L !== "closing" && L !== "section" && <AsideEditor aside={slide.aside} onChange={(aside) => set({ aside })} />}
      <hr />
      <Lines label="Citations" help="One per line. Instrument and clause, paper, dataset or file." value={slide.citations} onChange={(v) => set({ citations: v })} rows={3} />
      <Text label="Speaker notes" value={slide.notes} onChange={(v) => set({ notes: v || undefined })} rows={6} help={lang === "ms" ? "Apa yang dikatakan penyampai" : "What the presenter says"} />
    </div>
  );
}
