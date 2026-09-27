// What was actually read from a source, so the person sees before going on
// whether the writer will have the data: rows and tabs of a sheet, the text of
// a document, or nothing at all.

export interface SourceCheck {
  /** ok: read. warn: read, but less than it may hold. fail: nothing the writer can use. */
  level: "ok" | "warn" | "fail";
  note: string;
  /** The first words read, so the person can see it is the right data. */
  preview?: string;
}

const SHEET_CAP = 400;

/** The first lines read, row breaks kept, a sheet's tab named where it starts. */
function previewOf(text: string): string | undefined {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\[sheet: ([^\]]*)\]$/, "Tab: $1").replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.replace(/[,\s]/g, ""));
  const t = lines.slice(0, 6).join("\n");
  return t ? (t.length > 400 ? t.slice(0, 397) + "…" : t) : undefined;
}

/** The tabs of a sheet source as read: name, data rows, and whether rows were cut. */
export function sheetTabs(text: string): { name: string; rows: number; capped: boolean }[] {
  const blocks = text.split(/\n?\[sheet: /).filter(Boolean);
  return blocks.map((b) => {
    const nl = b.indexOf("]\n");
    const name = nl >= 0 ? b.slice(0, nl) : b.replace(/\]$/, "");
    const lines = (nl >= 0 ? b.slice(nl + 2) : "").split("\n").filter((l) => l.replace(/[,\s]/g, ""));
    const capped = lines.some((l) => /^\[… \d+ more rows\]$/.test(l));
    const extra = capped ? Number(/\[… (\d+) more rows\]/.exec(lines.find((l) => /^\[… /.test(l)) ?? "")?.[1] ?? 0) : 0;
    return { name, rows: lines.filter((l) => !/^\[… \d+ more rows\]$/.test(l)).length + extra, capped };
  });
}

export function checkSource(kind: string, text: string): SourceCheck {
  if (kind === "image") return { level: "ok", note: "Picture. What it shows is read when the deck is written." };
  const chars = text.trim().length;
  const preview = previewOf(text);
  if (kind === "sheet") {
    const tabs = sheetTabs(text);
    const rows = tabs.reduce((a, t) => a + t.rows, 0);
    const withData = tabs.filter((t) => t.rows > 0);
    if (!rows) return { level: "fail", note: tabs.length > 1 ? `The sheet has ${tabs.length} tabs and no data in any of them.` : "The sheet has no data in it." };
    const list = withData.slice(0, 4).map((t) => `${t.name} (${t.rows} row${t.rows === 1 ? "" : "s"})`).join(", ") + (withData.length > 4 ? `, and ${withData.length - 4} more` : "");
    const cut = tabs.filter((t) => t.capped);
    if (cut.length) return { level: "warn", note: `Read ${rows} rows in ${withData.length} tab${withData.length === 1 ? "" : "s"}: ${list}. Only the first ${SHEET_CAP} rows of ${cut.map((t) => t.name).join(", ")} go to the writer; put the rows that matter first, or split the tab.`, preview };
    return { level: "ok", note: `Read ${rows} row${rows === 1 ? "" : "s"} in ${withData.length} tab${withData.length === 1 ? "" : "s"}: ${list}.`, preview };
  }
  if (!chars) return { level: "fail", note: kind === "pdf" ? "No text in this PDF. A scanned PDF holds only pictures of pages; upload a text PDF, or paste the text." : "No text could be read from this file." };
  const words = text.trim().split(/\s+/).length;
  if (kind === "pdf" && chars < 200) return { level: "warn", note: `Only ${words} word${words === 1 ? "" : "s"} read. If this is a scan, its pages are pictures and their words are not read.`, preview };
  if (chars < 40) return { level: "warn", note: `Only ${words} word${words === 1 ? "" : "s"} read.`, preview };
  return { level: "ok", note: `Read ${words.toLocaleString("en")} words.`, preview };
}
