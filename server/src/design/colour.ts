import type { Theme, ThemeColors } from "@slidecraft/shared";

// Colour arithmetic for turning a handful of colours read off a reference
// (a PPTX theme, the fills in a PDF, the pixels of a screenshot) into the ten
// tokens a Slidecraft theme needs, with readable contrast guaranteed.

export type RGB = [number, number, number];

export function parseHex(h: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function hsl([r, g, b]: RGB): { h: number; s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return { h, s, l };
}

export function hueGap(a: RGB, b: RGB): number {
  const d = Math.abs(hsl(a).h - hsl(b).h) % 360;
  return d > 180 ? 360 - d : d;
}

/** A colour that carries hue: not grey, not near white, not near black. */
export function isChromatic(c: RGB): boolean {
  const { s, l } = hsl(c);
  return s >= 0.28 && l > 0.12 && l < 0.9;
}

export function distance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const BLACK: RGB = [17, 17, 17];
const WHITE: RGB = [255, 255, 255];

/** Moves c toward black or white, whichever increases contrast with bg, until the ratio is met. */
export function ensureContrast(c: RGB, bg: RGB, ratio: number): RGB {
  if (contrast(c, bg) >= ratio) return c;
  const target = luminance(bg) > 0.4 ? BLACK : WHITE;
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const m = mix(c, target, t);
    if (contrast(m, bg) >= ratio) return m;
  }
  return target;
}

export interface Picked {
  bg?: RGB;
  ink?: RGB;
  brand?: RGB;
  accent?: RGB;
  accent2?: RGB;
}

/** The ten theme tokens from what a reference gave, filling the gaps so text always reads. */
export function themeColors(p: Picked): ThemeColors {
  const bg = p.bg ?? WHITE;
  const dark = luminance(bg) < 0.35;
  const ink = ensureContrast(p.ink ?? (dark ? [241, 245, 251] : [29, 52, 78]), bg, 7);
  // Brand and accents are the reference's own colours and stay exact; they are
  // fills and rules. Only a colour that vanishes into the background is moved.
  // Text takes brandDeep, which is held to reading contrast.
  const brand = ensureContrast(p.brand ?? (dark ? [72, 152, 216] : [46, 124, 190]), bg, 1.5);
  const brandDeep = ensureContrast(mix(brand, dark ? WHITE : BLACK, 0.25), bg, 4.5);
  const accent = ensureContrast(p.accent ?? brand, bg, 1.5);
  const gold = ensureContrast(p.accent2 ?? p.accent ?? brand, bg, 1.5);
  return {
    bg: toHex(bg),
    surface: toHex(mix(bg, dark ? WHITE : ink, dark ? 0.06 : 0.035)),
    ink: toHex(ink),
    ink2: toHex(mix(ink, bg, 0.28)),
    muted: toHex(ensureContrast(mix(ink, bg, 0.5), bg, 3)),
    line: toHex(mix(ink, bg, 0.84)),
    brand: toHex(brand),
    brandDeep: toHex(brandDeep),
    accent: toHex(accent),
    gold: toHex(gold),
  };
}

export function designTheme(name: string, colors: ThemeColors, fonts: { display?: string; body?: string }): Theme {
  return {
    id: "design",
    name,
    fontDisplay: fonts.display || fonts.body || "Inter",
    fontBody: fonts.body || fonts.display || "Inter",
    colors,
    radius: 16,
    slideStyle: "clean",
    slideNumbers: true,
  };
}
