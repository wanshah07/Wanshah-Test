import type { ChartSpec, ThemeColors } from "../deck.js";
import { esc } from "./escape.js";

// SVG charts drawn from the spec. Deterministic, no library, same picture in the
// editor and in the HTML export. PPTX gets native charts from the same spec.

export function seriesPalette(c: ThemeColors): string[] {
  return [c.brand, c.accent, c.gold, c.brandDeep, c.ink2, c.muted];
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function chartSvg(chart: ChartSpec, colors: ThemeColors, W = 1400, H = 640, fontName = "Inter"): string {
  const pal = seriesPalette(colors);
  const font = `${fontName}, system-ui, sans-serif`;
  const kind = chart.kind;
  if (kind === "pie" || kind === "doughnut") return pieSvg(chart, colors, pal, W, H, font);
  if (kind === "bar") return barSvgHorizontal(chart, colors, pal, W, H, font);
  return columnLineSvg(chart, colors, pal, W, H, font);
}

function legend(chart: ChartSpec, pal: string[], colors: ThemeColors, x: number, y: number, font: string): string {
  if (chart.series.length < 2) return "";
  let out = "";
  let cx = x;
  chart.series.forEach((s, i) => {
    out += `<rect x="${cx}" y="${y - 12}" width="18" height="18" rx="4" fill="${pal[i % pal.length]}"/>`;
    out += `<text x="${cx + 26}" y="${y + 3}" font-family="${font}" font-size="28" fill="${colors.ink2}">${esc(s.name)}</text>`;
    cx += 26 + s.name.length * 12 + 40;
  });
  return out;
}

function columnLineSvg(chart: ChartSpec, colors: ThemeColors, pal: string[], W: number, H: number, font: string): string {
  const padL = 110, padR = 40, padT = 60, padB = 90;
  const iw = W - padL - padR, ih = H - padT - padB;
  const all = chart.series.flatMap((s) => s.values);
  const max = niceMax(Math.max(...all, 0));
  const minRaw = Math.min(...all, 0);
  const min = minRaw < 0 ? -niceMax(-minRaw) : 0;
  const yOf = (v: number) => padT + ih - ((v - min) / (max - min)) * ih;
  const n = chart.categories.length || 1;
  const slot = iw / n;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img">`;
  // grid
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const y = yOf(v);
    g += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="${colors.line}" stroke-width="2"/>`;
    g += `<text x="${padL - 14}" y="${y + 8}" text-anchor="end" font-family="${font}" font-size="28" fill="${colors.muted}">${fmt(v)}</text>`;
  }
  if (chart.unit) g += `<text x="${padL}" y="${padT - 24}" font-family="${font}" font-size="28" fill="${colors.muted}">${esc(chart.unit)}</text>`;
  // x labels
  chart.categories.forEach((c, i) => {
    const x = padL + slot * i + slot / 2;
    g += `<text x="${x}" y="${H - padB + 40}" text-anchor="middle" font-family="${font}" font-size="28" fill="${colors.ink2}">${esc(truncate(c, 16))}</text>`;
  });
  const sCount = chart.series.length;
  if (chart.kind === "column") {
    const groupW = slot * 0.7;
    const bw = groupW / sCount;
    chart.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const x = padL + slot * i + (slot - groupW) / 2 + bw * si;
        const y0 = yOf(0), y1 = yOf(v);
        const top = Math.min(y0, y1), h = Math.abs(y0 - y1);
        g += `<rect x="${x + 2}" y="${top}" width="${bw - 4}" height="${h}" rx="6" fill="${pal[si % pal.length]}"/>`;
        if (sCount === 1) g += `<text x="${x + bw / 2}" y="${top - 10}" text-anchor="middle" font-family="${font}" font-size="28" fill="${colors.ink}">${fmt(v)}</text>`;
      });
    });
  } else {
    chart.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [padL + slot * i + slot / 2, yOf(v)] as const);
      const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
      if (chart.kind === "area") {
        const area = `${d} L${pts[pts.length - 1][0]},${yOf(0)} L${pts[0][0]},${yOf(0)} Z`;
        g += `<path d="${area}" fill="${pal[si % pal.length]}" fill-opacity="0.18"/>`;
      }
      g += `<path d="${d}" fill="none" stroke="${pal[si % pal.length]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((p, i) => {
        g += `<circle cx="${p[0]}" cy="${p[1]}" r="9" fill="${colors.surface}" stroke="${pal[si % pal.length]}" stroke-width="5"/>`;
        if (sCount === 1) g += `<text x="${p[0]}" y="${p[1] - 20}" text-anchor="middle" font-family="${font}" font-size="28" fill="${colors.ink}">${fmt(s.values[i])}</text>`;
      });
    });
  }
  g += legend(chart, pal, colors, padL, H - 18, font);
  return g + "</svg>";
}

function barSvgHorizontal(chart: ChartSpec, colors: ThemeColors, pal: string[], W: number, H: number, font: string): string {
  const padL = 320, padR = 100, padT = 40, padB = 60;
  const iw = W - padL - padR, ih = H - padT - padB;
  const all = chart.series.flatMap((s) => s.values);
  const max = niceMax(Math.max(...all, 0));
  const n = chart.categories.length || 1;
  const slot = ih / n;
  const sCount = chart.series.length;
  const groupH = slot * 0.7;
  const bh = groupH / sCount;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img">`;
  chart.categories.forEach((c, i) => {
    const y = padT + slot * i + slot / 2;
    g += `<text x="${padL - 20}" y="${y + 8}" text-anchor="end" font-family="${font}" font-size="30" fill="${colors.ink2}">${esc(truncate(c, 26))}</text>`;
  });
  chart.series.forEach((s, si) => {
    s.values.forEach((v, i) => {
      const y = padT + slot * i + (slot - groupH) / 2 + bh * si;
      const w = (Math.max(v, 0) / max) * iw;
      g += `<rect x="${padL}" y="${y + 2}" width="${w}" height="${bh - 4}" rx="6" fill="${pal[si % pal.length]}"/>`;
      g += `<text x="${padL + w + 14}" y="${y + bh / 2 + 8}" font-family="${font}" font-size="28" fill="${colors.ink}">${fmt(v)}${chart.unit && sCount === 1 ? " " + esc(chart.unit) : ""}</text>`;
    });
  });
  g += legend(chart, pal, colors, padL, H - 14, font);
  return g + "</svg>";
}

function pieSvg(chart: ChartSpec, colors: ThemeColors, pal: string[], W: number, H: number, font: string): string {
  const s = chart.series[0] ?? { name: "", values: [] };
  const total = s.values.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
  const cx = H / 2 + 40, cy = H / 2, r = H / 2 - 50;
  const inner = chart.kind === "doughnut" ? r * 0.55 : 0;
  let a0 = -Math.PI / 2;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img">`;
  s.values.forEach((v, i) => {
    const frac = Math.max(v, 0) / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    let d: string;
    if (inner) {
      const ix0 = cx + inner * Math.cos(a1), iy0 = cy + inner * Math.sin(a1);
      const ix1 = cx + inner * Math.cos(a0), iy1 = cy + inner * Math.sin(a0);
      d = `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${ix0},${iy0} A${inner},${inner} 0 ${large} 0 ${ix1},${iy1} Z`;
    } else {
      d = `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
    }
    g += `<path d="${d}" fill="${pal[i % pal.length]}" stroke="${colors.surface}" stroke-width="4"/>`;
    a0 = a1;
  });
  // legend on the right
  const lx = cx + r + 80;
  chart.categories.forEach((c, i) => {
    const y = cy - (chart.categories.length * 44) / 2 + i * 44 + 16;
    const v = s.values[i] ?? 0;
    g += `<rect x="${lx}" y="${y - 16}" width="22" height="22" rx="5" fill="${pal[i % pal.length]}"/>`;
    g += `<text x="${lx + 34}" y="${y + 2}" font-family="${font}" font-size="30" fill="${colors.ink}">${esc(truncate(c, 30))} <tspan fill="${colors.muted}">${Math.round((v / total) * 100)}%</tspan></text>`;
  });
  if (inner) g += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-family="${font}" font-size="44" font-weight="600" fill="${colors.ink}">${fmt(total)}</text>`;
  return g + "</svg>";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
