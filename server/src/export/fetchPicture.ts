import dns from "node:dns/promises";
import net from "node:net";

// A picture a slide names by address, fetched for an export. Only https, only
// public hosts (never this machine or its network), no redirects, a time and
// size limit, and it must really be a PNG, JPEG or GIF. Anything else is null
// and the slide keeps its placeholder.

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8000;

function privateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

function pictureMime(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a")) return "image/gif";
  return null;
}

export async function fetchPicture(address: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  try {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return null;
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok || !res.body) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return null;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_BYTES) return null;
      chunks.push(Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    const mime = pictureMime(buf);
    return mime ? `${mime};base64,${buf.toString("base64")}` : null;
  } catch {
    return null;
  }
}
