import jpeg from "jpeg-js";
import { PNG } from "pngjs";

// Gateways cap the request body (1 MiB on some), and a phone photo or a poster
// export is several times that once base64 adds a third. A picture sent to a
// reader is made small enough to fit, keeping enough pixels for its text.

/** Bytes a picture may take before base64, leaving room for the prompt in a 1 MiB request. */
export const PICTURE_BUDGET = 640 * 1024;

interface Raster {
  width: number;
  height: number;
  data: Buffer | Uint8Array; // RGBA
}

function decode(buf: Buffer, mime: string): Raster | null {
  try {
    if (/png/i.test(mime) || buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return PNG.sync.read(buf);
    if (/jpe?g/i.test(mime) || (buf[0] === 0xff && buf[1] === 0xd8)) return jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  } catch {
    /* not a picture we can decode: sent as it is */
  }
  return null;
}

/** Box-filter downscale: each new pixel is the average of the block it covers, which keeps small text legible. */
function resize(src: Raster, maxSide: number): Raster {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (k >= 1) return src;
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const out = Buffer.alloc(w * h * 4);
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * src.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3]; n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out };
}

/** JPEG has no transparency: put the picture on white first, as it would print. */
function onWhite(r: Raster): Raster {
  const d = Buffer.from(r.data);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a < 1) {
      d[i] = d[i] * a + 255 * (1 - a);
      d[i + 1] = d[i + 1] * a + 255 * (1 - a);
      d[i + 2] = d[i + 2] * a + 255 * (1 - a);
      d[i + 3] = 255;
    }
  }
  return { ...r, data: d };
}

/**
 * The picture as it will be sent: unchanged when it already fits the budget,
 * otherwise re-encoded as JPEG, first at 2400 px on the long side and then
 * smaller and lighter until it fits.
 */
export function shrinkPicture(buf: Buffer, mime: string, budget = PICTURE_BUDGET): { buf: Buffer; mime: string; shrunk: boolean } {
  if (buf.length <= budget) return { buf, mime, shrunk: false };
  const raw = decode(buf, mime);
  if (!raw) return { buf, mime, shrunk: false };
  const flat = onWhite(raw);
  // Encoding is the slow part, so each try aims straight at the budget: JPEG size
  // scales roughly with pixel count, so the side shrinks by the square root of the overshoot.
  let side = Math.min(2400, Math.max(raw.width, raw.height));
  let out = Buffer.alloc(0);
  for (let i = 0; i < 6; i++) {
    const r = resize(flat, side);
    out = Buffer.from(jpeg.encode({ width: r.width, height: r.height, data: r.data as Buffer }, 80).data);
    if (out.length <= budget) return { buf: out, mime: "image/jpeg", shrunk: true };
    side = Math.max(320, Math.floor(side * Math.sqrt(budget / out.length) * 0.92));
  }
  return { buf: out, mime: "image/jpeg", shrunk: true };
}
