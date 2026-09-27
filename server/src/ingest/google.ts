import https from "node:https";
import type { IncomingMessage } from "node:http";
import { guardedLookup } from "../export/fetchPicture.js";

// A Google Drive, Docs, Sheets or Slides link as a source. Google hands out a
// file shared as "Anyone with the link" without signing in: a Sheet as .xlsx
// (every tab), a Doc as .docx, Slides as .pptx, any other file as it is, and a
// shared folder as a list of its files. A file that is not shared answers with
// a sign-in page or a 404, never the data, and that is said plainly so the
// person can share it and try again. Only Google's own hosts are ever fetched.

export const MAX_LINK_BYTES = 25 * 1024 * 1024;
const MAX_FOLDER_FILES = 25;
const TIMEOUT_MS = 30_000;

export type GoogleLink =
  | { type: "sheet"; id: string; published?: boolean }
  | { type: "doc"; id: string }
  | { type: "slides"; id: string }
  | { type: "file"; id: string; maybeFolder?: boolean }
  | { type: "folder"; id: string };

export class GoogleLinkError extends Error {
  constructor(message: string, readonly code: "not_google" | "not_shared" | "too_large" | "unreachable" | "empty_folder") {
    super(message);
  }
}

export const SHARE_HELP = "In Google Drive, open Share, set General access to \"Anyone with the link\" as Viewer, then paste the link again. Or connect your Google Drive in Settings to read private files, or download the file and drop it here.";

const ID = "([A-Za-z0-9_-]{10,})";

/** The file or folder a Google link points at, or null when it is not one. */
export function parseGoogleLink(raw: string): GoogleLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const p = u.pathname;
  let m: RegExpExecArray | null;
  if (host === "docs.google.com") {
    if ((m = new RegExp(`^/spreadsheets/d/e/${ID}`).exec(p))) return { type: "sheet", id: m[1], published: true };
    if ((m = new RegExp(`^/spreadsheets/(?:u/\\d+/)?d/${ID}`).exec(p))) return { type: "sheet", id: m[1] };
    if ((m = new RegExp(`^/document/(?:u/\\d+/)?d/${ID}`).exec(p))) return { type: "doc", id: m[1] };
    if ((m = new RegExp(`^/presentation/(?:u/\\d+/)?d/${ID}`).exec(p))) return { type: "slides", id: m[1] };
    return null;
  }
  if (host === "drive.google.com" || host === "drive.usercontent.google.com") {
    if ((m = new RegExp(`^/(?:drive/)?(?:u/\\d+/)?folders/${ID}`).exec(p))) return { type: "folder", id: m[1] };
    if ((m = new RegExp(`^/file/(?:u/\\d+/)?d/${ID}`).exec(p))) return { type: "file", id: m[1] };
    const q = u.searchParams.get("id");
    // open?id= and uc?id= name a file or a folder alike; which one is found out by asking.
    if (q && new RegExp(`^${ID}$`).test(q)) return /^\/embeddedfolderview/.test(p) ? { type: "folder", id: q } : { type: "file", id: q, maybeFolder: /^\/open/.test(p) };
  }
  return null;
}

/** Where Google serves the link's content without signing in. */
export function exportUrl(l: Exclude<GoogleLink, { type: "folder" }>): string {
  if (l.type === "sheet") return l.published ? `https://docs.google.com/spreadsheets/d/e/${l.id}/pub?output=xlsx` : `https://docs.google.com/spreadsheets/d/${l.id}/export?format=xlsx`;
  if (l.type === "doc") return `https://docs.google.com/document/d/${l.id}/export?format=docx`;
  if (l.type === "slides") return `https://docs.google.com/presentation/d/${l.id}/export/pptx`;
  return `https://drive.usercontent.google.com/download?id=${l.id}&export=download&confirm=t`;
}

const GOOGLE_HOST = /(^|\.)(google\.com|googleusercontent\.com)$/i;

export interface Got {
  status: number;
  type: string;
  disposition: string;
  body: Buffer;
  signIn: boolean;
}

function once(url: URL): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: guardedLookup, timeout: TIMEOUT_MS, headers: { "user-agent": "Mozilla/5.0 Slidecraft", accept: "*/*" } }, resolve);
    req.on("timeout", () => req.destroy(new Error("Google took too long to answer")));
    req.on("error", reject);
  });
}

/** The one door to Google, replaceable in tests so they run without the network. */
export const google = { get: (address: string, max?: number): Promise<Got> => googleGet(address, max) };

/** GET with redirects, each one only to a Google host; a sign-in page is reported, not followed. */
export async function googleGet(address: string, max = MAX_LINK_BYTES): Promise<Got> {
  let url = new URL(address);
  for (let hop = 0; hop < 6; hop++) {
    if (url.protocol !== "https:" || !GOOGLE_HOST.test(url.hostname)) throw new GoogleLinkError("Google sent the download somewhere other than Google, so it was not followed.", "unreachable");
    if (/^accounts\.google\.com$/i.test(url.hostname) || /ServiceLogin|signin/i.test(url.pathname)) return { status: 401, type: "", disposition: "", body: Buffer.alloc(0), signIn: true };
    let res: IncomingMessage;
    try {
      res = await once(url);
    } catch (e) {
      throw new GoogleLinkError(`Could not reach Google from the server (${(e as Error).message}).`, "unreachable");
    }
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      url = new URL(res.headers.location, url);
      continue;
    }
    if (Number(res.headers["content-length"] ?? 0) > max) {
      res.destroy();
      throw new GoogleLinkError(`The file is over ${Math.round(max / 1024 / 1024)} MB. Split it, or drop a smaller export here.`, "too_large");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const body = await new Promise<Buffer>((resolve, reject) => {
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > max) {
          res.destroy();
          reject(new GoogleLinkError(`The file is over ${Math.round(max / 1024 / 1024)} MB. Split it, or drop a smaller export here.`, "too_large"));
        } else chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", (e) => reject(new GoogleLinkError(`The download from Google broke off (${e.message}).`, "unreachable")));
    });
    return { status, type: String(res.headers["content-type"] ?? ""), disposition: String(res.headers["content-disposition"] ?? ""), body, signIn: false };
  }
  throw new GoogleLinkError("Google redirected too many times.", "unreachable");
}

/** The file name Google gives in Content-Disposition, if any. */
export function dispositionName(h: string): string | null {
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(h);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(h);
  return plain ? plain[1].trim() : null;
}

const EXT: Record<string, string> = { sheet: ".xlsx", doc: ".docx", slides: ".pptx" };
const LABEL: Record<string, string> = { sheet: "Google Sheet", doc: "Google Doc", slides: "Google Slides", file: "Drive file" };

const html = (g: Got) => /text\/html/i.test(g.type) || /^\s*<(!doctype|html)/i.test(g.body.subarray(0, 200).toString("utf8"));
const refused = (g: Got) => g.signIn || g.status === 401 || g.status === 403 || g.status === 404 || g.status >= 500 || (g.status === 200 && html(g));

/** One shared file, downloaded: its name and bytes. */
export async function fetchGoogleFile(l: Exclude<GoogleLink, { type: "folder" }>, fallbackName?: string): Promise<{ name: string; buf: Buffer }> {
  let g = await google.get(exportUrl(l));
  // An Excel, Word or PowerPoint file kept in Drive opens in Sheets, Docs or Slides under the same kind of
  // link, but is the file itself: when the export is refused, the plain download is tried before giving up.
  if (refused(g) && l.type !== "file") {
    const plain = await google.get(exportUrl({ type: "file", id: l.id }));
    if (!refused(plain) && plain.status === 200) g = plain;
  }
  if (refused(g)) {
    throw new GoogleLinkError(`Google did not hand over this ${LABEL[l.type]}: it is not shared with "Anyone with the link", or it does not exist. ${SHARE_HELP}`, "not_shared");
  }
  if (g.status !== 200) throw new GoogleLinkError(`Google answered ${g.status} for this link. Try again in a minute, or download the file and drop it here.`, "unreachable");
  const given = dispositionName(g.disposition);
  let name = given || fallbackName || `${LABEL[l.type]} ${l.id.slice(0, 8)}`;
  // A Google-native file is exported: make sure the name carries the format it came as.
  if (EXT[l.type] && !/\.(xlsx|xlsm|xls|csv|docx|pptx|pdf)$/i.test(name)) name = name.replace(/\.(gsheet|gdoc|gslides)$/i, "") + EXT[l.type];
  return { name: name.replace(/[\\/]/g, "-").slice(0, 200), buf: g.body };
}

/** The files a shared folder lists: its public list view, read as plain HTML. */
export function folderEntries(html: string): { name: string; link: GoogleLink }[] {
  const out: { name: string; link: GoogleLink }[] = [];
  for (const m of html.matchAll(/<div class="flip-entry"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g)) {
    const href = m[1].replace(/&amp;/g, "&");
    const name = m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const link = parseGoogleLink(href);
    if (link && link.type !== "folder") out.push({ name, link });
  }
  return out;
}

export interface LinkFile {
  name: string;
  relPath: string;
  buf: Buffer;
}

/** Reads a link as the person's connected Google account: the way in for files that are not shared by link. */
export type PrivateReader = (l: GoogleLink) => Promise<{ files: LinkFile[]; skipped: string[] }>;

/**
 * Every file a link stands for: one for a file, up to 25 for a folder, with what could not be read and why.
 * A link Google will not hand out publicly is read through the connected Google Drive account, when there is one.
 */
export async function fetchGoogleLink(raw: string, privateReader?: PrivateReader): Promise<{ files: LinkFile[]; skipped: string[] }> {
  const l = parseGoogleLink(raw);
  if (!l) throw new GoogleLinkError("That is not a Google Drive, Docs, Sheets or Slides link. Copy the link from Share, or from the address bar of the open file.", "not_google");
  try {
    return await fetchPublic(l);
  } catch (e) {
    if (!privateReader || !(e instanceof GoogleLinkError) || (e.code !== "not_shared" && e.code !== "empty_folder")) throw e;
    return privateReader(l);
  }
}

async function fetchPublic(l: GoogleLink): Promise<{ files: LinkFile[]; skipped: string[] }> {
  if (l.type !== "folder") {
    try {
      const f = await fetchGoogleFile(l);
      return { files: [{ name: f.name, relPath: f.name, buf: f.buf }], skipped: [] };
    } catch (e) {
      // An open?id= link that is not a file may be a shared folder.
      if (!(l.type === "file" && l.maybeFolder && e instanceof GoogleLinkError && e.code === "not_shared")) throw e;
      try {
        return await readFolder(l.id);
      } catch {
        throw e;
      }
    }
  }
  return readFolder(l.id);
}

async function readFolder(folderId: string): Promise<{ files: LinkFile[]; skipped: string[] }> {
  const page = await google.get(`https://drive.google.com/embeddedfolderview?id=${folderId}`, 5 * 1024 * 1024);
  if (page.signIn || page.status !== 200) throw new GoogleLinkError(`Google did not show this folder: it is not shared with "Anyone with the link", or it does not exist. ${SHARE_HELP}`, "not_shared");
  const entries = folderEntries(page.body.toString("utf8"));
  if (!entries.length) throw new GoogleLinkError("The folder is shared but lists no files that can be read (subfolders are not opened). Link the files themselves, or a folder that holds them directly.", "empty_folder");
  const files: LinkFile[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const e of entries.slice(0, MAX_FOLDER_FILES)) {
    try {
      const f = await fetchGoogleFile(e.link as Exclude<GoogleLink, { type: "folder" }>, e.name);
      total += f.buf.length;
      if (total > 4 * MAX_LINK_BYTES) {
        skipped.push(`${e.name} (the folder holds more than ${4 * Math.round(MAX_LINK_BYTES / 1024 / 1024)} MB; link the rest separately)`);
        break;
      }
      files.push({ name: f.name, relPath: f.name, buf: f.buf });
    } catch (err) {
      skipped.push(`${e.name} (${err instanceof GoogleLinkError && err.code === "not_shared" ? "not shared with the link" : (err as Error).message})`);
    }
  }
  if (entries.length > MAX_FOLDER_FILES) skipped.push(`${entries.length - MAX_FOLDER_FILES} more file(s): only the first ${MAX_FOLDER_FILES} in a folder are read`);
  return { files, skipped };
}
