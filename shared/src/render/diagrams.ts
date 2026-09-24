import type { DiagramSpec, ThemeColors } from "../deck.js";
import { esc } from "./escape.js";

export function diagramSvg(d: DiagramSpec, c: ThemeColors, W = 1600, H = 620, fontName = "Inter", radius = 20): string {
  const font = `${fontName}, system-ui, sans-serif`;
  if (d.kind === "flow") return flowSvg(d.steps, c, W, H, font, radius);
  if (d.kind === "timeline") return timelineSvg(d.events, c, W, H, font);
  return matrixSvg(d.rows, d.cols, d.cells, c, W, H, font, radius);
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function tspans(lines: string[], x: number, y: number, lh: number, anchor = "middle"): string {
  return lines.map((l, i) => `<tspan x="${x}" y="${y + i * lh}" text-anchor="${anchor}">${esc(l)}</tspan>`).join("");
}

function flowSvg(steps: { label: string; detail?: string }[], c: ThemeColors, W: number, H: number, font: string, r: number): string {
  const n = Math.max(steps.length, 1);
  const gap = 56;
  const rows = n > 5 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const bw = (W - gap * (perRow - 1)) / perRow;
  const bh = rows === 1 ? Math.min(H * 0.6, 300) : (H - 70) / 2;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img">`;
  g += `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${c.brandDeep}"/></marker></defs>`;
  steps.forEach((s, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = col * (bw + gap);
    const y = rows === 1 ? (H - bh) / 2 : row * (bh + 70);
    g += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${r}" fill="${c.surface}" stroke="${c.line}" stroke-width="3"/>`;
    g += `<circle cx="${x + 44}" cy="${y + 44}" r="26" fill="${c.brand}"/><text x="${x + 44}" y="${y + 54}" text-anchor="middle" font-family="${font}" font-size="26" font-weight="600" fill="#fff">${i + 1}</text>`;
    const labelLines = wrap(s.label, Math.max(12, Math.floor(bw / 17)));
    g += `<text font-family="${font}" font-size="30" font-weight="600" fill="${c.ink}">${tspans(labelLines, x + 30, y + 118, 38, "start")}</text>`;
    if (s.detail) {
      const dl = wrap(s.detail, Math.max(14, Math.floor(bw / 13))).slice(0, 4);
      g += `<text font-family="${font}" font-size="23" fill="${c.ink2}">${tspans(dl, x + 30, y + 118 + labelLines.length * 38 + 12, 30, "start")}</text>`;
    }
    if (i < n - 1) {
      if (col < perRow - 1) {
        g += `<line x1="${x + bw + 6}" y1="${y + bh / 2}" x2="${x + bw + gap - 8}" y2="${y + bh / 2}" stroke="${c.brandDeep}" stroke-width="5" marker-end="url(#arr)"/>`;
      } else {
        g += `<line x1="${x + bw / 2}" y1="${y + bh + 6}" x2="${x + bw / 2}" y2="${y + bh + 62}" stroke="${c.brandDeep}" stroke-width="5" marker-end="url(#arr)"/>`;
      }
    }
  });
  return g + "</svg>";
}

function timelineSvg(events: { when: string; label: string }[], c: ThemeColors, W: number, H: number, font: string): string {
  const n = Math.max(events.length, 1);
  const padX = 80;
  const y = H / 2;
  const step = (W - padX * 2) / Math.max(n - 1, 1);
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img">`;
  g += `<line x1="${padX}" x2="${W - padX}" y1="${y}" y2="${y}" stroke="${c.line}" stroke-width="8" stroke-linecap="round"/>`;
  events.forEach((e, i) => {
    const x = n === 1 ? W / 2 : padX + step * i;
    const up = i % 2 === 0;
    g += `<circle cx="${x}" cy="${y}" r="20" fill="${c.brand}" stroke="${c.surface}" stroke-width="6"/>`;
    const wy = up ? y - 60 : y + 78;
    const ly = up ? y - 108 : y + 118;
    g += `<text x="${x}" y="${wy}" text-anchor="middle" font-family="${font}" font-size="26" font-weight="600" fill="${c.brandDeep}">${esc(e.when)}</text>`;
    const lines = wrap(e.label, Math.max(14, Math.floor(step / 14)));
    g += `<text font-family="${font}" font-size="24" fill="${c.ink}">${tspans(up ? lines.reverse() : lines, x, ly, up ? -30 : 30)}</text>`;
  });
  return g + "</svg>";
}

function matrixSvg(rows: string[], cols: string[], cells: string[][], c: ThemeColors, W: number, H: number, font: string, r: number): string {
  const headW = 300;
  const headH = 76;
  const cw = (W - headW) / Math.max(cols.length, 1);
  const rh = Math.min(120, (H - headH) / Math.max(rows.length, 1));
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img">`;
  g += `<rect x="0" y="0" width="${W}" height="${headH + rh * rows.length}" rx="${r}" fill="${c.surface}" stroke="${c.line}" stroke-width="3"/>`;
  cols.forEach((col, j) => {
    const x = headW + cw * j;
    g += `<text x="${x + cw / 2}" y="${headH / 2 + 10}" text-anchor="middle" font-family="${font}" font-size="26" font-weight="600" fill="${c.brandDeep}">${esc(col)}</text>`;
  });
  rows.forEach((row, i) => {
    const y = headH + rh * i;
    g += `<line x1="8" x2="${W - 8}" y1="${y}" y2="${y}" stroke="${c.line}" stroke-width="2"/>`;
    g += `<text font-family="${font}" font-size="26" font-weight="600" fill="${c.ink}">${tspans(wrap(row, 20).slice(0, 2), 24, y + rh / 2 + 4, 30, "start")}</text>`;
    cols.forEach((_, j) => {
      const x = headW + cw * j;
      const v = cells[i]?.[j] ?? "";
      const mark = /^(yes|ya|✓|true|wajib|required|mandatory)$/i.test(v.trim()) ? "✓" : /^(no|tidak|✗|false|x)$/i.test(v.trim()) ? "✗" : "";
      if (mark) {
        g += `<circle cx="${x + cw / 2}" cy="${y + rh / 2}" r="24" fill="${mark === "✓" ? c.brand : c.line}"/>`;
        g += `<text x="${x + cw / 2}" y="${y + rh / 2 + 11}" text-anchor="middle" font-family="${font}" font-size="30" font-weight="700" fill="${mark === "✓" ? "#fff" : c.ink2}">${mark}</text>`;
      } else {
        g += `<text font-family="${font}" font-size="23" fill="${c.ink2}">${tspans(wrap(v, Math.max(10, Math.floor(cw / 13))).slice(0, 3), x + cw / 2, y + rh / 2 - 8, 28)}</text>`;
      }
    });
  });
  return g + "</svg>";
}
