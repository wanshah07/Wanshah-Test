import https from "node:https";
import { getDb, now } from "./db.js";
import { guardedLookup } from "./export/fetchPicture.js";
import { composioFetch, composioKey, composioOwner, OneDriveError } from "./onedrive.js";
import { GoogleLinkError, MAX_LINK_BYTES, type GoogleLink, type LinkFile } from "./ingest/google.js";

// Private Google Drive files through the Google Drive account the person has
// connected in Composio. The same Composio API key as OneDrive, and a Google
// Drive account picked in Settings. Only read: the tools used are metadata,
// download and folder listing, never a write.
//
// Measured on 27 Sep 2026 against a connected account:
// - GOOGLEDRIVE_GET_FILE_METADATA answers data.{id, name, mimeType}.
// - GOOGLEDRIVE_DOWNLOAD_FILE answers data.downloaded_file_content.{name, mimetype, s3url}: an hour-long signed
//   link. A Google Sheet, Doc or Slides is exported when mime_type is given (export_applied: true).
// - GOOGLEDRIVE_FIND_FILE with folder_id answers data.files[{id, name, mimeType, size}] and nextPageToken.
// - A file the account cannot open answers successful: false, status_code 404, "File not found".

const MAX_FOLDER_FILES = 25;

interface GdRow {
  gd_account: string | null;
  gd_account_label: string | null;
  gd_user: string | null;
}

function row(userId: string): GdRow {
  const r = getDb().prepare("SELECT gd_account, gd_account_label, gd_user FROM settings WHERE user_id = ?").get(userId) as GdRow | undefined;
  return r ?? { gd_account: null, gd_account_label: null, gd_user: null };
}

function write(userId: string, patch: Partial<GdRow>): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)").run(userId, now());
  for (const [k, v] of Object.entries(patch)) {
    // Column names come from the GdRow keys above, never from a request.
    if (!["gd_account", "gd_account_label", "gd_user"].includes(k)) continue;
    db.prepare(`UPDATE settings SET ${k} = ?, updated_at = ? WHERE user_id = ?`).run(v ?? null, now(), userId);
  }
}

export function gdriveStatus(userId: string): { connected: boolean; account: string; label: string; hasKey: boolean } {
  const r = row(userId);
  const hasKey = !!composioKey(userId);
  return { connected: hasKey && !!r.gd_account, account: r.gd_account ?? "", label: r.gd_account_label || r.gd_account || "", hasKey };
}

export function saveGdrive(userId: string, account: string | null, label?: string | null): void {
  // A new account has its own owner; the old one's would make every call fail.
  write(userId, { gd_account: account?.trim() || null, gd_account_label: label?.trim() || null, gd_user: null });
}

/** Runs one Google Drive tool through Composio and returns its data, or throws a reason the person can act on. */
async function gdTool(userId: string, slug: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = composioKey(userId);
  const r = row(userId);
  if (!key || !r.gd_account) throw new GoogleLinkError("Google Drive is not connected. Add the Composio key and pick the Google Drive account in Settings.", "not_shared");
  let owner = r.gd_user;
  try {
    if (!owner) {
      owner = await composioOwner(key, r.gd_account, "googledrive");
      write(userId, { gd_user: owner });
    }
    const j = await composioFetch(key, "POST", `/tools/execute/${slug}`, { connected_account_id: r.gd_account, user_id: owner, arguments: args, version: "latest" });
    if (j.successful === false) {
      const data = (j.data as { status_code?: number } | undefined) ?? {};
      const msg = String(j.error ?? "the tool failed");
      if (data.status_code === 404 || /not ?found|notFound/i.test(msg)) throw new GoogleLinkError(`Your connected Google account (${r.gd_account_label || r.gd_account}) cannot open this file: it does not exist, or it is not shared with that account. Share it with that account, or connect the account that owns it in Settings.`, "not_shared");
      if (data.status_code === 403 || /permission|forbidden|insufficient/i.test(msg)) throw new GoogleLinkError(`Your connected Google account (${r.gd_account_label || r.gd_account}) has no permission to read this file. Ask the owner to share it with that account.`, "not_shared");
      throw new GoogleLinkError(`Google Drive through Composio: ${msg.slice(0, 300)}`, "unreachable");
    }
    return (j.data as Record<string, unknown>) ?? {};
  } catch (e) {
    if (e instanceof GoogleLinkError) throw e;
    if (e instanceof OneDriveError) throw new GoogleLinkError(e.code === "composio_key" ? "Composio refused the API key. Paste the key again in Settings." : e.message, "unreachable");
    throw e;
  }
}

/** The signed download link's bytes: https only, public hosts only, under the size limit. */
export function fetchSigned(address: string, max = MAX_LINK_BYTES, hops = 3): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return Promise.reject(new GoogleLinkError("Composio returned a download link that is not a web address.", "unreachable"));
  }
  if (url.protocol !== "https:") return Promise.reject(new GoogleLinkError("Composio returned a download link that is not https.", "unreachable"));
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: guardedLookup, timeout: 60_000 }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location && hops > 0) {
        res.resume();
        fetchSigned(new URL(res.headers.location, url).toString(), max, hops - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        return reject(new GoogleLinkError(`The download from Composio answered ${status}. Try again.`, "unreachable"));
      }
      if (Number(res.headers["content-length"] ?? 0) > max) {
        res.destroy();
        return reject(new GoogleLinkError(`The file is over ${Math.round(max / 1024 / 1024)} MB. Split it, or drop a smaller export here.`, "too_large"));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > max) {
          res.destroy();
          reject(new GoogleLinkError(`The file is over ${Math.round(max / 1024 / 1024)} MB. Split it, or drop a smaller export here.`, "too_large"));
        } else chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", (e) => reject(new GoogleLinkError(`The download broke off (${e.message}).`, "unreachable")));
    });
    req.on("timeout", () => req.destroy(new Error("the download took too long")));
    req.on("error", (e) => reject(new GoogleLinkError(`Could not download the file (${e.message}).`, "unreachable")));
  });
}

/** The signed-link reader, as an object so a test can stand in for Composio's storage host. */
export const gdSigned = { get: (url: string): Promise<Buffer> => fetchSigned(url) };

const NATIVE: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.spreadsheet": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx" },
  "application/vnd.google-apps.document": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ".docx" },
  "application/vnd.google-apps.presentation": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ".pptx" },
};
const FOLDER = "application/vnd.google-apps.folder";

/** One file, by id and what Drive says it is: a Google-native file exported to Office, any other as it is. */
async function downloadOne(userId: string, id: string, mimeType: string, fallbackName: string): Promise<LinkFile> {
  const native = NATIVE[mimeType];
  if (mimeType.startsWith("application/vnd.google-apps.") && !native) throw new GoogleLinkError(`this kind of Google file (${mimeType.replace("application/vnd.google-apps.", "")}) cannot be exported`, "unreachable");
  const d = await gdTool(userId, "GOOGLEDRIVE_DOWNLOAD_FILE", { fileId: id, ...(native ? { mime_type: native.mime } : {}) });
  const got = (d.downloaded_file_content as { name?: string; s3url?: string } | undefined) ?? {};
  if (!got.s3url) throw new GoogleLinkError("Composio returned no download link for this file.", "unreachable");
  const buf = await gdSigned.get(got.s3url);
  let name = (got.name || fallbackName || `Drive file ${id.slice(0, 8)}`).replace(/[\\/]/g, "-").slice(0, 200);
  if (native && !name.toLowerCase().endsWith(native.ext)) name += native.ext;
  return { name, relPath: name, buf };
}

/** Every file a link stands for, read as the connected Google account. */
export async function fetchPrivateLink(userId: string, link: GoogleLink): Promise<{ files: LinkFile[]; skipped: string[] }> {
  const meta = await gdTool(userId, "GOOGLEDRIVE_GET_FILE_METADATA", { fileId: link.id, fields: "id,name,mimeType,size" });
  const mimeType = String(meta.mimeType ?? "");
  const name = String(meta.name ?? "");
  if (mimeType !== FOLDER) {
    if (Number(meta.size ?? 0) > MAX_LINK_BYTES) throw new GoogleLinkError(`The file is over ${Math.round(MAX_LINK_BYTES / 1024 / 1024)} MB. Split it, or drop a smaller export here.`, "too_large");
    return { files: [await downloadOne(userId, link.id, mimeType, name)], skipped: [] };
  }
  const entries: { id: string; name: string; mimeType: string; size?: string }[] = [];
  let token: string | undefined;
  for (let page = 0; page < 5 && entries.length < 200; page++) {
    const d = await gdTool(userId, "GOOGLEDRIVE_FIND_FILE", { folder_id: link.id, fields: "nextPageToken,files(id,name,mimeType,size)", pageSize: 100, q: "trashed = false", ...(token ? { pageToken: token } : {}) });
    entries.push(...(((d.files as typeof entries | undefined) ?? []).filter((f) => f && typeof f.id === "string")));
    token = typeof d.nextPageToken === "string" ? d.nextPageToken : undefined;
    if (!token) break;
  }
  const files: LinkFile[] = [];
  const skipped: string[] = [];
  const readable = entries.filter((e) => e.mimeType !== FOLDER);
  if (!readable.length) throw new GoogleLinkError(`The folder "${name}" holds no files that can be read (subfolders are not opened). Link the files themselves, or a folder that holds them directly.`, "empty_folder");
  let total = 0;
  for (const e of readable.slice(0, MAX_FOLDER_FILES)) {
    if (Number(e.size ?? 0) > MAX_LINK_BYTES) {
      skipped.push(`${e.name} (the file is over ${Math.round(MAX_LINK_BYTES / 1024 / 1024)} MB)`);
      continue;
    }
    try {
      const f = await downloadOne(userId, e.id, e.mimeType, e.name);
      total += f.buf.length;
      if (total > 4 * MAX_LINK_BYTES) {
        skipped.push(`${e.name} (the folder holds more than ${4 * Math.round(MAX_LINK_BYTES / 1024 / 1024)} MB; link the rest separately)`);
        break;
      }
      files.push(f);
    } catch (err) {
      skipped.push(`${e.name} (${(err as Error).message})`);
    }
  }
  if (readable.length > MAX_FOLDER_FILES) skipped.push(`${readable.length - MAX_FOLDER_FILES} more file(s): only the first ${MAX_FOLDER_FILES} in a folder are read`);
  return { files, skipped };
}
