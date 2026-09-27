import dns from "node:dns";
import https from "node:https";
import net from "node:net";

// A picture a slide names by address, fetched for an export. Only https, only
// public hosts (never this machine or its network), no redirects, a time and
// size limit, and it must really be a PNG, JPEG or GIF. Anything else is null
// and the slide keeps its placeholder. The address is checked at the moment
// the connection is made (the socket's own lookup), so a name that answers
// public first and private second cannot slip through.

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8000;

export function privateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv4 inside IPv6, in either spelling: ::ffff:127.0.0.1 or ::ffff:7f00:1.
  const mapped = /^(?:0*:)*:?ffff:(.+)$/.exec(v)?.[1] ?? /^::(.+)$/.exec(v)?.[1];
  if (mapped) {
    if (net.isIPv4(mapped)) return privateAddress(mapped);
    const h = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
    if (h) {
      const hi = parseInt(h[1], 16);
      const lo = parseInt(h[2], 16);
      return privateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
  }
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff") || v.startsWith("64:ff9b:");
}

function pictureMime(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "image/gif";
  return null;
}

/** A lookup that refuses private addresses, used by the socket itself. */
const guardedLookup: net.LookupFunction = (host, opts, cb) => {
  dns.lookup(host, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err, "", 4);
    const list = addrs as dns.LookupAddress[];
    if (!list.length || list.some((a) => privateAddress(a.address))) return cb(new Error("private address refused"), "", 4);
    if ((opts as { all?: boolean }).all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    cb(null, list[0].address, list[0].family);
  });
};

export function fetchPicture(address: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return Promise.resolve(null);
  }
  if (url.protocol !== "https:" || url.username || url.password) return Promise.resolve(null);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && privateAddress(host)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const req = https.get(url, { lookup: guardedLookup, timeout: TIMEOUT_MS, headers: { accept: "image/png,image/jpeg,image/gif" } }, (res) => {
        if ((res.statusCode ?? 0) !== 200 || Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
          res.resume();
          return done(null);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy();
            return done(null);
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const mime = pictureMime(buf);
          done(mime ? `${mime};base64,${buf.toString("base64")}` : null);
        });
        res.on("error", () => done(null));
      });
      req.on("timeout", () => {
        req.destroy();
        done(null);
      });
      req.on("error", () => done(null));
      setTimeout(() => {
        req.destroy();
        done(null);
      }, TIMEOUT_MS + 2000).unref();
    } catch {
      done(null);
    }
  });
}
