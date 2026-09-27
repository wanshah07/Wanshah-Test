import { PNG } from "pngjs";
import type { Theme } from "@slidecraft/shared";

// The bloom style's backgrounds for PowerPoint, painted once per theme as small
// pictures: the light wash (white to tint, a brand bloom top right, an accent
// one bottom left) and the dark cover (ink to deep, a brand glow, an accent one
// bottom left). They carry no words; every word on the slide stays live text.

const W = 640;
const H = 360;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/** A radial glow like CSS radial-gradient(rx ry at cx cy, colour a, transparent 70%): its strength at a point. */
function glow(x: number, y: number, cx: number, cy: number, rx: number, ry: number, a: number): number {
  const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
  return a * Math.max(0, 1 - d / 0.7);
}

function paint(fn: (x: number, y: number) => number[]): string {
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = fn(x, y);
      const i = (y * W + x) * 4;
      png.data[i] = Math.round(c[0]);
      png.data[i + 1] = Math.round(c[1]);
      png.data[i + 2] = Math.round(c[2]);
      png.data[i + 3] = 255;
    }
  return `image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

const cache = new Map<string, { light: string; dark: string }>();

export function bloomBackgrounds(t: Theme): { light: string; dark: string } {
  const key = `${t.colors.brand}|${t.colors.accent}|${t.colors.ink}|${t.colors.brandDeep}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const white = [255, 255, 255];
  const brand = rgb(t.colors.brand), accent = rgb(t.colors.accent), ink = rgb(t.colors.ink), deep = rgb(t.colors.brandDeep);
  const tint = mix(white, brand, 0.1);
  // Canvas pixels are 1920 x 1080 in the HTML; here a third of that.
  const s = W / 1920;
  const light = paint((x, y) => {
    const d = (x / W + y / H) / 2; // 135deg: top left to bottom right
    let c = mix(white, tint, d);
    c = mix(c, brand, glow(x, y, W, 0, 900 * s, 760 * s, 0.16));
    return mix(c, accent, glow(x, y, 0, H, 820 * s, 660 * s, 0.09));
  });
  const dark = paint((x, y) => {
    const d = Math.min(1, Math.max(0, (x / W) * 0.85 + (y / H) * 0.5 - 0.1)); // 120deg
    let c = d < 0.5 ? mix(ink, deep, d * 2) : mix(deep, ink, (d - 0.5) * 2);
    c = mix(c, brand, glow(x, y, W * 0.7, H * 0.4, 1200 * s, 900 * s, 0.4));
    return mix(c, accent, glow(x, y, 0, H, 900 * s, 640 * s, 0.16));
  });
  const out = { light, dark };
  if (cache.size > 20) cache.clear();
  cache.set(key, out);
  return out;
}
