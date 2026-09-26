import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { PICTURE_BUDGET, shrinkPicture } from "../src/llm/shrink.js";
import { readPicture } from "../src/llm/vision.js";

// A poster export is several MiB; a gateway may refuse any request over 1 MiB
// (AfiqStore's kimi-k2.7 answered 413 on 26 Sep 2026). The reader must still
// get the picture, small enough to fit and large enough to read.

/** A noisy picture: noise does not compress, so the PNG is as big as a photo. */
function noisyPng(w: number, h: number): Buffer {
  const p = new PNG({ width: w, height: h });
  let seed = 7;
  for (let i = 0; i < w * h; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    p.data.set([seed & 255, (seed >> 8) & 255, (seed >> 16) & 255, i % 7 === 0 ? 128 : 255], i * 4);
  }
  return PNG.sync.write(p);
}

const LIMIT = 1024 * 1024;
let server: http.Server;
let base = "";
const seen: number[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const size = Buffer.concat(chunks).length;
      seen.push(size);
      if (size > LIMIT) {
        res.writeHead(413, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Request body exceeds the 1 MiB limit for kimi-k2.7." } }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "FACERINNA B5 | 5% panthenol" }, finish_reason: "stop" }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

describe("pictures sent to a reader", () => {
  it("leaves a picture that already fits alone", () => {
    const small = noisyPng(64, 64);
    const r = shrinkPicture(small, "image/png");
    expect(r.shrunk).toBe(false);
    expect(r.buf).toBe(small);
  });

  it("re-encodes a large poster under the budget, on white, keeping enough pixels to read", () => {
    const big = noisyPng(1800, 1300);
    expect(big.length).toBeGreaterThan(4 * PICTURE_BUDGET);
    const r = shrinkPicture(big, "image/png");
    expect(r.shrunk).toBe(true);
    expect(r.mime).toBe("image/jpeg");
    expect(r.buf.length).toBeLessThanOrEqual(PICTURE_BUDGET);
    const img = jpeg.decode(r.buf);
    expect(Math.max(img.width, img.height)).toBeGreaterThanOrEqual(640);
    expect(img.width / img.height).toBeCloseTo(1800 / 1300, 1);
  });

  it("gets a large poster read through a gateway that refuses bodies over 1 MiB", async () => {
    seen.length = 0;
    const text = await readPicture({ apiKey: "k", baseUrl: base, model: "kimi-k2.7", imageModel: "" }, "poster.png", noisyPng(1800, 1300), "image/png");
    expect(text).toBe("FACERINNA B5 | 5% panthenol");
    expect(Math.max(...seen)).toBeLessThanOrEqual(LIMIT);
  });

  it("tries once more at a quarter of the size when a gateway's limit is lower than ours", async () => {
    seen.length = 0;
    const text = await readPicture({ apiKey: "k", baseUrl: base, model: "kimi-k2.7", imageModel: "" }, "poster.png", noisyPng(1800, 1300), "image/png", 4 * LIMIT);
    expect(text).toBe("FACERINNA B5 | 5% panthenol");
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toBeGreaterThan(LIMIT);
    expect(seen.at(-1)!).toBeLessThanOrEqual(LIMIT);
  });
});
