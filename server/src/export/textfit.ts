// Sizes text for PowerPoint boxes. PowerPoint only applies "shrink text on
// overflow" when a box is edited, so a file straight from the exporter shows
// whatever font size it was given; that size has to fit already. This
// estimates wrapped height from per-character widths (em units of a typical
// sans face, with a safety margin) and picks the largest size that fits.

const SAFETY = 1.1;
// PowerPoint's default text box insets: 0.1 in left and right, 0.05 in top and bottom.
const INSET_X = 0.2;
const INSET_Y = 0.1;

function charEm(ch: string, bold: boolean): number {
  let w: number;
  if (ch === " ") w = 0.28;
  else if ("iljtf.,;:'|!Iír()[]{}".includes(ch)) w = 0.3;
  else if ("mwMW@%".includes(ch)) w = 0.85;
  else if (/[A-Z]/.test(ch)) w = 0.66;
  else if (/[0-9]/.test(ch)) w = 0.56;
  else if (/[a-z]/.test(ch)) w = 0.52;
  else if (ch.charCodeAt(0) > 0x2e7f) w = 1; // CJK and other full-width
  else w = 0.56;
  return bold ? w * 1.07 : w;
}

function widthPt(s: string, size: number, bold: boolean): number {
  let em = 0;
  for (const ch of s) em += charEm(ch, bold);
  return em * size * SAFETY;
}

/** Lines one paragraph wraps to in a line of the given width, breaking long words. */
export function linesFor(text: string, lineWidthPt: number, size: number, bold = false): number {
  if (!text.trim()) return 1;
  let lines = 1;
  let cur = 0;
  const space = widthPt(" ", size, bold);
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = widthPt(word, size, bold);
    if (cur === 0) {
      // A word longer than the line breaks across lines.
      while (w > lineWidthPt) {
        lines++;
        w -= lineWidthPt;
      }
      cur = w;
    } else if (cur + space + w <= lineWidthPt) cur += space + w;
    else {
      lines++;
      while (w > lineWidthPt) {
        lines++;
        w -= lineWidthPt;
      }
      cur = w;
    }
  }
  return lines;
}

export interface FitOpts {
  bold?: boolean;
  /** Line height as a multiple of the font size. */
  lineSpacing?: number;
  /** Space after each paragraph, in points at the largest size (scaled with the size). */
  paraSpacePt?: number;
  /** Indent of each paragraph (bullets), in points. */
  indentPt?: number;
  /** Largest number of lines allowed, e.g. 1 for a figure on one line. */
  maxLines?: number;
}

/** Height in inches the paragraphs need at a size, in a box of the given width in inches. */
export function textHeightIn(paras: string[], boxW: number, size: number, o: FitOpts = {}, scaleFrom = size): number {
  const lineW = Math.max(1, (boxW - INSET_X) * 72 - (o.indentPt ?? 0));
  const lh = size * (o.lineSpacing ?? 1.2);
  const space = (o.paraSpacePt ?? 0) * (size / scaleFrom);
  let pt = 0;
  paras.forEach((p, i) => {
    pt += linesFor(p, lineW, size, o.bold) * lh;
    if (i < paras.length - 1) pt += space;
  });
  return pt / 72 + INSET_Y;
}

/** The largest size from max down to min (half points) at which the text fits the box. */
export function fitFont(text: string | string[], boxW: number, boxH: number, max: number, min = 6, o: FitOpts = {}): number {
  // Nothing may overflow: below the preferred floor the text keeps shrinking, down to 3 pt.
  const floor = 3;
  void min;
  const paras = (Array.isArray(text) ? text : text.split("\n")).map((p) => p.trim()).filter((p, i, a) => p || a.length === 1);
  for (let size = max; size >= floor; size -= 0.5) {
    const lineW = Math.max(1, (boxW - INSET_X) * 72 - (o.indentPt ?? 0));
    if (o.maxLines && paras.some((p) => linesFor(p, lineW, size, o.bold) > o.maxLines!)) continue;
    if (textHeightIn(paras, boxW, size, o, max) <= boxH) return size;
  }
  return floor;
}
