import { useMemo, useState } from "react";
import { outputToMarkdown, tableToCsv, type FlashcardsData, type InfographicData, type MindMapData, type MindNode, type NoteData, type Output, type QuizData, type ReportData, type TableData } from "@slidecraft/shared";

/** Saves text as a file the browser downloads. */
export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const fileName = (o: Output) => (o.title || o.kind).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80).trim() || o.kind;

/** **bold** in model text, drawn as bold and nothing else. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>;
}

function Report({ d }: { d: ReportData }) {
  return (
    <div className="ov-report">
      {d.summary && <p className="ov-lead"><Rich text={d.summary} /></p>}
      {d.sections.map((s, i) => (
        <section key={i}>
          {s.heading && <h3>{s.heading}</h3>}
          {s.paragraphs.map((p, j) => <p key={j}><Rich text={p} /></p>)}
          {s.points?.length ? <ul>{s.points.map((p, j) => <li key={j}><Rich text={p} /></li>)}</ul> : null}
        </section>
      ))}
      {d.citations.length > 0 && (
        <section className="ov-cites">
          <h4>Sources</h4>
          <ul>{d.citations.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

function Flashcards({ d }: { d: FlashcardsData }) {
  const [order, setOrder] = useState(() => d.cards.map((_, i) => i));
  const [at, setAt] = useState(0);
  const [flip, setFlip] = useState(false);
  const card = d.cards[order[at]];
  if (!card) return null;
  const go = (n: number) => {
    setFlip(false);
    setAt((a) => (a + n + order.length) % order.length);
  };
  return (
    <div className="ov-cards">
      <button className={`ov-card${flip ? " back" : ""}`} onClick={() => setFlip((f) => !f)} data-testid="flashcard">
        <span className="side">{flip ? "Answer" : "Question"}</span>
        <span className="txt">{flip ? card.back : card.front}</span>
        {flip && card.source && <span className="src small muted">{card.source}</span>}
        {!flip && <span className="small muted">Click to see the answer</span>}
      </button>
      <div className="row between">
        <button className="btn btn-ghost btn-sm" onClick={() => go(-1)}>Previous</button>
        <span className="small muted">{at + 1} / {order.length}</span>
        <div className="row">
          <button className="btn btn-quiet btn-sm" onClick={() => { setOrder((o) => [...o].sort(() => Math.random() - 0.5)); setAt(0); setFlip(false); }}>Shuffle</button>
          <button className="btn btn-ghost btn-sm" onClick={() => go(1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

function Quiz({ d }: { d: QuizData }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const done = Object.keys(picked).length;
  const right = d.questions.filter((q, i) => picked[i] === q.answer).length;
  return (
    <div className="ov-quiz">
      <div className="row between"><span className="pill brand">{done} of {d.questions.length} answered</span>{done > 0 && <span className="pill ok" data-testid="quiz-score">{right} right</span>}</div>
      {d.questions.map((q, i) => {
        const p = picked[i];
        return (
          <div key={i} className="ov-q">
            <b>{i + 1}. {q.question}</b>
            <div className="ov-opts">
              {q.options.map((o, j) => {
                const state = p === undefined ? "" : j === q.answer ? " right" : j === p ? " wrong" : "";
                return (
                  <button key={j} className={`ov-opt${state}`} disabled={p !== undefined} onClick={() => setPicked((x) => ({ ...x, [i]: j }))}>
                    <span className="l">{String.fromCharCode(65 + j)}</span>{o}
                  </button>
                );
              })}
            </div>
            {p !== undefined && <p className="small ov-why">{p === q.answer ? "Right. " : `The answer is ${String.fromCharCode(65 + q.answer)}. `}{q.explanation}{q.source ? <span className="muted"> ({q.source})</span> : null}</p>}
          </div>
        );
      })}
      {done > 0 && <button className="btn btn-quiet btn-sm" onClick={() => setPicked({})}>Start again</button>}
    </div>
  );
}

function Branch({ n, depth }: { n: MindNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const kids = n.children ?? [];
  return (
    <li>
      <div className={`ov-node d${Math.min(depth, 3)}`}>
        {kids.length ? <button className="tog" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"}>{open ? "−" : "+"}</button> : <span className="tog" />}
        <span><b>{n.label}</b>{n.note && <span className="small muted"> {n.note}</span>}</span>
      </div>
      {open && kids.length > 0 && <ul>{kids.map((c, i) => <Branch key={i} n={c} depth={depth + 1} />)}</ul>}
    </li>
  );
}

function MindMap({ d }: { d: MindMapData }) {
  return <ul className="ov-mind"><Branch n={d.root} depth={0} /></ul>;
}

function Table({ d }: { d: TableData }) {
  return (
    <div className="ov-table">
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr>{d.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>{d.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {d.note && <p className="small muted">{d.note}</p>}
      {d.source && <p className="small muted">Source: {d.source}</p>}
    </div>
  );
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The infographic as one standalone page, in the Navy Briefing colours. */
export function infographicHtml(title: string, g: InfographicData): string {
  const colours = ["#2A6FDB", "#0B2D63", "#2E9E6A", "#D9822B", "#7A4FD0", "#B8336A"];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>body{margin:0;background:#EAF1FB;font-family:Calibri,Carlito,'Segoe UI',system-ui,sans-serif;color:#1B2533}
.ig{max-width:900px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(11,45,99,.12)}
.hd{background:#0B2D63;color:#fff;padding:36px 40px}.hd h1{font-family:Cambria,Caladea,Georgia,serif;font-size:34px;margin:0 0 8px;line-height:1.15}.hd p{margin:0;color:#CFE0FA;font-size:17px}
.st{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;padding:28px 40px}.s{background:#EAF1FB;border-radius:12px;padding:18px;text-align:center}
.s b{display:block;font-family:Cambria,Caladea,Georgia,serif;font-size:40px;line-height:1.05}.s span{font-size:14px;font-weight:700}
.sec{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;padding:0 40px 24px}.c{border:1px solid #C9D6EA;border-radius:12px;padding:16px 18px}
.c h2{font-size:16px;margin:0 0 8px;color:#0B2D63}.c ul{margin:0;padding-left:18px}.c li{margin:4px 0}
.tk{margin:0 40px 24px;background:#0B2D63;color:#fff;border-radius:12px;padding:16px 20px;font-weight:700;font-size:17px}.src{padding:0 40px 28px;color:#5B6B80;font-size:12px}</style></head>
<body><div class="ig"><div class="hd"><h1>${escHtml(g.headline)}</h1>${g.subtitle ? `<p>${escHtml(g.subtitle)}</p>` : ""}</div>
<div class="st">${g.stats.map((s, i) => `<div class="s"><b style="color:${colours[i % colours.length]}">${escHtml(s.value)}</b><span>${escHtml(s.label)}</span></div>`).join("")}</div>
<div class="sec">${g.sections.map((s) => `<div class="c"><h2>${escHtml(s.heading)}</h2><ul>${s.points.map((p) => `<li>${escHtml(p)}</li>`).join("")}</ul></div>`).join("")}</div>
${g.takeaway ? `<div class="tk">${escHtml(g.takeaway)}</div>` : ""}${g.source ? `<div class="src">Source: ${escHtml(g.source)}</div>` : ""}</div></body></html>`;
}

function Infographic({ title, d }: { title: string; d: InfographicData }) {
  const html = useMemo(() => infographicHtml(title, d), [title, d]);
  return <iframe className="ov-ig" title={title} srcDoc={html} sandbox="" />;
}

function Note({ d }: { d: NoteData }) {
  return (
    <div className="ov-note">
      {d.question && <p className="small muted">You asked: {d.question}</p>}
      <p style={{ whiteSpace: "pre-wrap" }}><Rich text={d.text} /></p>
      {d.citations?.length ? <ul className="small">{d.citations.map((c, i) => <li key={i}><b>{c.source}</b>: “{c.quote}”</li>)}</ul> : null}
    </div>
  );
}

export function OutputBody({ o }: { o: Output }) {
  switch (o.kind) {
    case "report":
      return <Report d={o.data as ReportData} />;
    case "flashcards":
      return <Flashcards d={o.data as FlashcardsData} />;
    case "quiz":
      return <Quiz d={o.data as QuizData} />;
    case "mindmap":
      return <MindMap d={o.data as MindMapData} />;
    case "table":
      return <Table d={o.data as TableData} />;
    case "infographic":
      return <Infographic title={o.title} d={o.data as InfographicData} />;
    default:
      return <Note d={o.data as NoteData} />;
  }
}

/** The ways an output leaves the app: Markdown always, CSV for a table, a web page for an infographic. */
export function OutputDownloads({ o }: { o: Output }) {
  return (
    <div className="row">
      <button className="btn btn-ghost btn-sm" onClick={() => download(`${fileName(o)}.md`, outputToMarkdown(o), "text/markdown")}>Download .md</button>
      {o.kind === "table" && <button className="btn btn-ghost btn-sm" onClick={() => download(`${fileName(o)}.csv`, tableToCsv(o.data as TableData), "text/csv")}>Download .csv</button>}
      {o.kind === "infographic" && <button className="btn btn-ghost btn-sm" onClick={() => download(`${fileName(o)}.html`, infographicHtml(o.title, o.data as InfographicData), "text/html")}>Download page</button>}
      <button className="btn btn-quiet btn-sm" onClick={() => navigator.clipboard?.writeText(outputToMarkdown(o))}>Copy</button>
    </div>
  );
}
