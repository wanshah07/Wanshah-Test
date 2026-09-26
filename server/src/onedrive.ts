import fs from "node:fs";
import { config } from "./config.js";
import { createHash } from "node:crypto";
import { decrypt, encrypt, maskKey } from "./crypto.js";
import { getDb, now } from "./db.js";
import { addMedia, addSource, getMedia } from "./store.js";

// Pictures from a OneDrive folder, read through Microsoft Graph.
//
// Sign-in is the device code flow: the server asks Microsoft for a short code,
// the user types it at microsoft.com/devicelogin, and the server collects a
// refresh token. It needs only a public client id (no secret, no redirect
// address), which matters because every codespace has a different address.
// The refresh token is stored encrypted with APP_SECRET, like the writer key.

const SCOPE = "Files.Read offline_access";
const IMAGE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };
const OK_MIME = new Set(Object.values(IMAGE_MIME));
/** Formats a camera or phone produces that a slide cannot show. Named in the report rather than silently dropped. */
const UNSHOWABLE = new Set([".heic", ".heif", ".tif", ".tiff", ".bmp", ".raw", ".cr2", ".nef", ".arw", ".dng"]);
export const MAX_PICTURES = 300;
const MAX_DEPTH = 3;

/** Read at call time so tests can point these at a local stand-in. */
function ms() {
  return {
    login: (process.env.MS_LOGIN_BASE || "https://login.microsoftonline.com").replace(/\/+$/, ""),
    graph: (process.env.MS_GRAPH_BASE || "https://graph.microsoft.com/v1.0").replace(/\/+$/, ""),
    tenant: process.env.MS_TENANT || "common",
  };
}

export class OneDriveError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

interface MsRow {
  ms_client_id: string | null;
  ms_refresh_enc: string | null;
  ms_account: string | null;
  ms_folder: string | null;
  /** "microsoft" (default) or "composio". */
  od_provider: string | null;
  cz_key_enc: string | null;
  cz_account: string | null;
  cz_account_label: string | null;
}

const EMPTY_ROW: MsRow = { ms_client_id: null, ms_refresh_enc: null, ms_account: null, ms_folder: null, od_provider: null, cz_key_enc: null, cz_account: null, cz_account_label: null };

function row(userId: string): MsRow {
  const r = getDb().prepare("SELECT ms_client_id, ms_refresh_enc, ms_account, ms_folder, od_provider, cz_key_enc, cz_account, cz_account_label FROM settings WHERE user_id = ?").get(userId) as MsRow | undefined;
  return r ?? EMPTY_ROW;
}

export type Provider = "microsoft" | "composio";

export function providerFor(userId: string): Provider {
  return row(userId).od_provider === "composio" ? "composio" : "microsoft";
}

export function composioKey(userId: string): string {
  const enc = row(userId).cz_key_enc;
  if (!enc) return "";
  try {
    return decrypt(enc);
  } catch {
    return "";
  }
}

function write(userId: string, patch: Partial<MsRow>): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)").run(userId, now());
  for (const [k, v] of Object.entries(patch)) {
    // Column names come from the MsRow keys above, never from a request.
    db.prepare(`UPDATE settings SET ${k} = ?, updated_at = ? WHERE user_id = ?`).run(v ?? null, now(), userId);
  }
}

export function clientIdFor(userId: string): { id: string; from: "settings" | "server" | "none" } {
  const own = row(userId).ms_client_id;
  if (own) return { id: own, from: "settings" };
  if (process.env.MS_CLIENT_ID) return { id: process.env.MS_CLIENT_ID, from: "server" };
  return { id: "", from: "none" };
}

export function status(userId: string) {
  const r = row(userId);
  const c = clientIdFor(userId);
  const provider = providerFor(userId);
  const key = composioKey(userId);
  return {
    provider,
    clientId: c.id,
    clientIdFrom: c.from,
    connected: provider === "composio" ? !!key && !!r.cz_account : !!r.ms_refresh_enc,
    account: provider === "composio" ? r.cz_account_label || r.cz_account || "" : r.ms_account || "",
    defaultFolder: r.ms_folder || "",
    pending: pending.has(userId) ? publicPending(pending.get(userId)!) : null,
    composio: { key: key ? maskKey(key) : "", account: r.cz_account || "", accountLabel: r.cz_account_label || "" },
  };
}

export function saveOneDriveSettings(userId: string, b: { clientId?: string | null; defaultFolder?: string | null; provider?: string; composioKey?: string | null; composioAccount?: string | null; composioAccountLabel?: string | null }): void {
  const patch: Partial<MsRow> = {};
  if (b.provider !== undefined) patch.od_provider = b.provider === "composio" ? "composio" : "microsoft";
  if (b.composioKey !== undefined) {
    const k = (b.composioKey ?? "").trim();
    patch.cz_key_enc = k ? encrypt(k) : null;
    // A new key may belong to another project, where the old account id means nothing.
    patch.cz_account = null;
    patch.cz_account_label = null;
  }
  if (b.composioAccount !== undefined) {
    patch.cz_account = (b.composioAccount ?? "").trim() || null;
    patch.cz_account_label = (b.composioAccountLabel ?? "").trim() || null;
  }
  if (b.clientId !== undefined) {
    const id = (b.clientId ?? "").trim();
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new OneDriveError("The client ID is the Application (client) ID from the app registration: 36 characters, like 1a2b3c4d-....", "bad_client_id");
    patch.ms_client_id = id || null;
  }
  if (b.defaultFolder !== undefined) patch.ms_folder = (b.defaultFolder ?? "").trim() || null;
  write(userId, patch);
}

export function disconnect(userId: string): void {
  if (providerFor(userId) === "composio") {
    write(userId, { cz_key_enc: null, cz_account: null, cz_account_label: null });
    return;
  }
  write(userId, { ms_refresh_enc: null, ms_account: null });
  tokens.delete(userId);
  pending.delete(userId);
}

// ---------------------------------------------------------------- sign-in

interface Pending {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  clientId: string;
  expiresAt: number;
  interval: number;
  nextPollAt: number;
}
const pending = new Map<string, Pending>();
const tokens = new Map<string, { token: string; exp: number }>();

function publicPending(p: Pending) {
  return { userCode: p.userCode, verificationUri: p.verificationUri, expiresAt: new Date(p.expiresAt).toISOString(), interval: p.interval };
}

async function form(url: string, body: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new OneDriveError(`Could not reach ${new URL(url).host}: ${(e as Error).message}`, "unreachable");
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: "bad_response", error_description: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function msMessage(j: Record<string, unknown>): string {
  const d = String(j.error_description ?? j.error ?? "unknown error");
  // Microsoft appends trace and correlation ids on new lines; the first line is the message.
  return d.split(/\r?\n/)[0].replace(/^AADSTS\d+:\s*/, "");
}

export async function startLogin(userId: string) {
  const c = clientIdFor(userId);
  if (!c.id) throw new OneDriveError("Add the Microsoft app client ID first (Settings, OneDrive pictures).", "no_client_id");
  const { login, tenant } = ms();
  const r = await form(`${login}/${tenant}/oauth2/v2.0/devicecode`, { client_id: c.id, scope: SCOPE });
  if (r.status !== 200 || !r.json.device_code) throw new OneDriveError(`Microsoft refused the sign-in: ${msMessage(r.json)}`, String(r.json.error ?? "refused"));
  const interval = Math.max(1, Number(r.json.interval) || 5);
  const p: Pending = {
    deviceCode: String(r.json.device_code),
    userCode: String(r.json.user_code),
    verificationUri: String(r.json.verification_uri ?? "https://microsoft.com/devicelogin"),
    clientId: c.id,
    expiresAt: Date.now() + (Number(r.json.expires_in) || 900) * 1000,
    interval,
    nextPollAt: 0,
  };
  pending.set(userId, p);
  return publicPending(p);
}

/** One poll of the token endpoint. The page calls this every few seconds while the code is on screen. */
export async function pollLogin(userId: string): Promise<{ state: "waiting" | "connected" | "expired" | "declined" | "none"; account?: string; message?: string }> {
  const p = pending.get(userId);
  if (!p) return { state: row(userId).ms_refresh_enc ? "connected" : "none", account: row(userId).ms_account || undefined };
  if (Date.now() > p.expiresAt) {
    pending.delete(userId);
    return { state: "expired", message: "The code expired. Start again." };
  }
  // Polling faster than Microsoft's interval earns slow_down, so hold back here.
  if (Date.now() < p.nextPollAt) return { state: "waiting" };
  const { login, tenant } = ms();
  const r = await form(`${login}/${tenant}/oauth2/v2.0/token`, { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: p.clientId, device_code: p.deviceCode });
  if (r.status === 200 && r.json.refresh_token) {
    pending.delete(userId);
    keepTokens(userId, r.json);
    const account = await accountName(userId).catch(() => "");
    write(userId, { ms_account: account || null });
    return { state: "connected", account };
  }
  const err = String(r.json.error ?? "");
  if (err === "authorization_pending") {
    p.nextPollAt = Date.now() + p.interval * 1000;
    return { state: "waiting" };
  }
  if (err === "slow_down") {
    p.interval += 5;
    p.nextPollAt = Date.now() + p.interval * 1000;
    return { state: "waiting" };
  }
  pending.delete(userId);
  if (err === "expired_token") return { state: "expired", message: "The code expired. Start again." };
  if (err === "authorization_declined" || err === "access_denied") return { state: "declined", message: "Sign-in was declined." };
  return { state: "declined", message: msMessage(r.json) };
}

function keepTokens(userId: string, j: Record<string, unknown>): void {
  if (j.refresh_token) write(userId, { ms_refresh_enc: encrypt(String(j.refresh_token)) });
  // A minute's margin so a token never expires between the check and the call.
  tokens.set(userId, { token: String(j.access_token), exp: Date.now() + ((Number(j.expires_in) || 3600) - 60) * 1000 });
}

async function accessToken(userId: string): Promise<string> {
  const t = tokens.get(userId);
  if (t && t.exp > Date.now()) return t.token;
  const r = row(userId);
  if (!r.ms_refresh_enc) throw new OneDriveError("OneDrive is not connected. Connect it in Settings.", "not_connected");
  let refresh: string;
  try {
    refresh = decrypt(r.ms_refresh_enc);
  } catch {
    disconnect(userId);
    throw new OneDriveError("The stored OneDrive sign-in can no longer be read (APP_SECRET changed). Connect again in Settings.", "not_connected");
  }
  const c = clientIdFor(userId);
  const { login, tenant } = ms();
  const res = await form(`${login}/${tenant}/oauth2/v2.0/token`, { grant_type: "refresh_token", client_id: c.id, refresh_token: refresh, scope: SCOPE });
  if (res.status !== 200 || !res.json.access_token) {
    if (res.json.error === "invalid_grant") {
      disconnect(userId);
      throw new OneDriveError("The OneDrive sign-in has expired or was revoked. Connect again in Settings.", "not_connected");
    }
    throw new OneDriveError(`Microsoft refused to renew the sign-in: ${msMessage(res.json)}`, "refresh_failed");
  }
  keepTokens(userId, res.json);
  return String(res.json.access_token);
}

// ---------------------------------------------------------------- Graph

async function graph(userId: string, pathOrUrl: string): Promise<Record<string, unknown>> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : ms().graph + pathOrUrl;
  const call = async () => {
    try {
      return await fetch(url, { headers: { authorization: `Bearer ${await accessToken(userId)}` }, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      if (e instanceof OneDriveError) throw e;
      throw new OneDriveError(`Could not reach ${new URL(url).host}: ${(e as Error).message}`, "unreachable");
    }
  };
  let res = await call();
  if (res.status === 401) {
    // An access token revoked before its expiry: renew once.
    tokens.delete(userId);
    res = await call();
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* not JSON */
  }
  if (res.ok) return json;
  const msg = String((json.error as { message?: string } | undefined)?.message ?? res.statusText);
  if (res.status === 404) throw new OneDriveError("That folder was not found in OneDrive. Check the path, including capitals and spaces.", "not_found");
  if (res.status === 403) throw new OneDriveError(`OneDrive refused access: ${msg}. A work or school account may need an administrator to approve the app.`, "forbidden");
  throw new OneDriveError(`OneDrive answered ${res.status}: ${msg}`, "graph_error");
}

async function accountName(userId: string): Promise<string> {
  // /me/drive needs only Files.Read, where /me would need User.Read too.
  const d = await graph(userId, "/me/drive");
  const u = (d.owner as { user?: { displayName?: string; email?: string } } | undefined)?.user;
  return u?.email || u?.displayName || "";
}

/** "u!" + unpadded base64url of the link: Graph's encoding for a sharing URL. */
export function shareToken(link: string): string {
  return "u!" + Buffer.from(link, "utf8").toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

export function normaliseFolder(input: string): string {
  const t = input.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return t.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
}

interface Item {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  folder?: unknown;
  file?: { mimeType?: string; hashes?: { sha256Hash?: string } };
  parentReference?: { driveId?: string; id?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

async function resolveFolder(userId: string, folder: string): Promise<{ driveId: string; id: string; name: string }> {
  const f = normaliseFolder(folder);
  let item: Item;
  if (/^https?:\/\//i.test(f)) {
    try {
      item = (await graph(userId, `/shares/${shareToken(f)}/driveItem`)) as unknown as Item;
    } catch (e) {
      if (e instanceof OneDriveError && e.code === "not_found") throw new OneDriveError("That link is not a OneDrive share link. In OneDrive use Share, then Copy link, or type the folder path instead.", "not_found");
      throw e;
    }
  } else if (!f) {
    item = (await graph(userId, "/me/drive/root")) as unknown as Item;
  } else {
    item = (await graph(userId, `/me/drive/root:/${f.split("/").map(encodeURIComponent).join("/")}`)) as unknown as Item;
  }
  if (!item.folder) throw new OneDriveError(`"${item.name}" is a file, not a folder.`, "not_a_folder");
  const driveId = item.parentReference?.driveId;
  if (!driveId) throw new OneDriveError("OneDrive did not say which drive the folder is on.", "graph_error");
  return { driveId, id: item.id, name: item.name };
}

async function children(userId: string, driveId: string, id: string): Promise<Item[]> {
  const out: Item[] = [];
  let next: string | undefined = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(id)}/children?$top=200`;
  while (next) {
    const page = await graph(userId, next);
    out.push(...((page.value as Item[] | undefined) ?? []));
    next = page["@odata.nextLink"] as string | undefined;
  }
  return out;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

/** Subfolders and picture counts, for the folder picker. */
export async function browse(userId: string, folder: string) {
  const route = routeFor(userId);
  const f = await route.resolve(folder);
  const items = await route.children(f);
  return {
    name: f.name,
    folders: items.filter((i) => i.folder).map((i) => i.name).sort((a, b) => a.localeCompare(b)),
    pictures: items.filter((i) => i.file && IMAGE_MIME[extOf(i.name)]).length,
  };
}

// ---------------------------------------------------------------- Composio

// The same pictures through Composio's OneDrive connection, for someone who
// already has OneDrive connected there. Slidecraft holds a Composio API key
// (encrypted) and a connected account id. Measured on 26 Sep 2026 against a
// real personal OneDrive: ONE_DRIVE_LIST_FOLDER_CHILDREN answers with
// data.value[] and data.next_page_token; ONE_DRIVE_DOWNLOAD_FILE answers with
// data.content.s3url, a short-lived pre-signed link whose bytes matched the
// sha256 the listing reported.

function composioBase(): string {
  return (process.env.COMPOSIO_API_BASE || "https://backend.composio.dev/api/v3").replace(/\/+$/, "");
}

async function composioFetch(key: string, method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
  const url = composioBase() + path;
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "x-api-key": key, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw new OneDriveError(`Could not reach ${new URL(url).host}: ${(e as Error).message}`, "unreachable");
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 200) };
  }
  if (res.status === 401 || res.status === 403) throw new OneDriveError("Composio refused the API key. Check it in Settings, OneDrive pictures.", "composio_key");
  if (!res.ok) {
    const err = json.error as { message?: string } | string | undefined;
    const msg = (typeof err === "string" ? err : err?.message) || (json.message as string) || res.statusText;
    throw new OneDriveError(`Composio answered ${res.status}: ${msg}`, "composio_error");
  }
  return json;
}

/** OneDrive accounts connected in the key's Composio project. */
export async function composioAccounts(key: string): Promise<{ id: string; label: string; status: string }[]> {
  const j = await composioFetch(key, "GET", "/connected_accounts?toolkit_slugs=one_drive&limit=50");
  const items = (j.items as Record<string, unknown>[] | undefined) ?? [];
  return items
    .filter((a) => String((a.toolkit as { slug?: string } | undefined)?.slug ?? "one_drive").toLowerCase() === "one_drive")
    .map((a) => ({ id: String(a.id), label: String(a.alias ?? a.user_id ?? a.id), status: String(a.status ?? "") }));
}

let composioVersion: "latest" | null = "latest";

/** Runs one Composio tool and returns its data, or throws with Composio's own message. */
async function composioTool(userId: string, slug: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = composioKey(userId);
  const account = row(userId).cz_account;
  if (!key || !account) throw new OneDriveError("Composio is not set up. Add the API key and pick the OneDrive account in Settings.", "not_connected");
  const call = (version: string | null) => composioFetch(key, "POST", `/tools/execute/${slug}`, { connected_account_id: account, arguments: args, ...(version ? { version } : {}) });
  let j: Record<string, unknown>;
  try {
    j = await call(composioVersion);
  } catch (e) {
    // Ask for the current tool version; an API that does not know "latest" gets its default instead.
    if (composioVersion && e instanceof OneDriveError && e.code === "composio_error" && /version/i.test(e.message)) {
      composioVersion = null;
      j = await call(null);
    } else throw e;
  }
  if (j.successful === false) {
    const msg = String(j.error ?? "the tool failed");
    if (/not ?found|itemNotFound|404/i.test(msg)) throw new OneDriveError("That folder was not found in OneDrive. Check the path, including capitals and spaces.", "not_found");
    throw new OneDriveError(`Composio: ${msg}`, "composio_error");
  }
  return (j.data as Record<string, unknown>) ?? {};
}

// ---------------------------------------------------------------- routes

interface Folder {
  name: string;
  /** Graph ids; for Composio known once a listing has named them. */
  driveId?: string;
  id?: string;
  /** Path from the drive root, for the first Composio listing. */
  path?: string;
}

interface Route {
  resolve(folder: string): Promise<Folder>;
  children(f: Folder): Promise<Item[]>;
  download(f: Folder, it: Item): Promise<Buffer>;
}

function graphRoute(userId: string): Route {
  return {
    resolve: (folder) => resolveFolder(userId, folder),
    children: (f) => children(userId, f.driveId!, f.id!),
    download: (f, it) => download(userId, f.driveId!, it),
  };
}

function composioRoute(userId: string): Route {
  return {
    async resolve(folder) {
      const f = normaliseFolder(folder);
      if (/^https?:\/\//i.test(f)) throw new OneDriveError("Through Composio, type the folder path (for example 40. HERMES/photos) rather than a share link.", "not_found");
      return { name: f ? f.split("/").pop()! : "OneDrive", path: "/" + f };
    },
    async children(f) {
      const out: Item[] = [];
      const base: Record<string, unknown> = f.id ? { folder_item_id: f.id, ...(f.driveId ? { drive_id: f.driveId } : { use_me_drive: true }) } : { use_me_drive: true, folder_path: f.path ?? "/" };
      let token: string | undefined;
      for (let page = 0; page < 50; page++) {
        const d = await composioTool(userId, "ONE_DRIVE_LIST_FOLDER_CHILDREN", { ...base, top: 999, ...(token ? { page_token: token } : {}) });
        out.push(...((d.value as Item[] | undefined) ?? []));
        token = d.next_page_token as string | undefined;
        if (!token) break;
      }
      return out;
    },
    async download(_f, it) {
      const d = await composioTool(userId, "ONE_DRIVE_DOWNLOAD_FILE", { item_id: it.id, file_name: it.name, ...(it.parentReference?.driveId ? { drive_id: it.parentReference.driveId } : {}) });
      const url = (d.content as { s3url?: string } | undefined)?.s3url;
      if (!url) throw new OneDriveError("Composio returned no download link", "download_failed");
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      } catch (e) {
        throw new OneDriveError(`download failed: ${(e as Error).message}`, "download_failed");
      }
      if (!res.ok) throw new OneDriveError(`download answered ${res.status}`, "download_failed");
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

function routeFor(userId: string): Route {
  return providerFor(userId) === "composio" ? composioRoute(userId) : graphRoute(userId);
}

/** A folder inside the one being walked, addressed the way each route can reach it. */
function subfolder(parent: Folder, it: Item): Folder {
  return { name: it.name, id: it.id, driveId: it.parentReference?.driveId ?? parent.driveId };
}

// ---------------------------------------------------------------- import

export interface ImportReport {
  folder: string;
  added: number;
  updated: number;
  unchanged: number;
  skipped: { name: string; reason: string }[];
  capped: boolean;
}

async function download(userId: string, driveId: string, it: Item): Promise<Buffer> {
  const direct = it["@microsoft.graph.downloadUrl"];
  let res: Response;
  try {
    // The download URL is pre-authorised and short-lived; sending the bearer token to it is refused.
    res = direct
      ? await fetch(direct, { signal: AbortSignal.timeout(60000) })
      : await fetch(`${ms().graph}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(it.id)}/content`, { headers: { authorization: `Bearer ${await accessToken(userId)}` }, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw new OneDriveError(`download failed: ${(e as Error).message}`, "download_failed");
  }
  if (!res.ok) throw new OneDriveError(`download answered ${res.status}`, "download_failed");
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Copies the pictures in a OneDrive folder into a deck's sources. A picture
 * already pulled at the same version is skipped; a changed one is replaced in
 * place, so slides that show it pick up the new version.
 */
export async function importFolder(userId: string, deckId: string, folder: string, subfolders: boolean, log?: (line: string) => void): Promise<ImportReport> {
  const route = routeFor(userId);
  const root = await route.resolve(folder);
  const report: ImportReport = { folder: root.name, added: 0, updated: 0, unchanged: 0, skipped: [], capped: false };
  const found: { item: Item; rel: string; at: Folder }[] = [];
  const walk = async (f: Folder, prefix: string, depth: number): Promise<void> => {
    for (const it of await route.children(f)) {
      if (it.folder) {
        if (subfolders && depth < MAX_DEPTH) await walk(subfolder(f, it), prefix + it.name + "/", depth + 1);
        continue;
      }
      if (!it.file) continue;
      const ext = extOf(it.name);
      if (IMAGE_MIME[ext]) found.push({ item: it, rel: prefix + it.name, at: f });
      else if (UNSHOWABLE.has(ext)) report.skipped.push({ name: prefix + it.name, reason: `${ext.slice(1).toUpperCase()} cannot be shown on a slide; save it as JPG or PNG` });
    }
  };
  await walk(root, "", 0);
  if (found.length > MAX_PICTURES) {
    report.capped = true;
    found.length = MAX_PICTURES;
  }
  const db = getDb();
  let n = 0;
  for (const { item, rel, at } of found) {
    n++;
    if ((item.size ?? 0) > config.maxUploadBytes) {
      report.skipped.push({ name: rel, reason: `larger than ${Math.round(config.maxUploadBytes / 1048576)} MB` });
      continue;
    }
    const known = db.prepare("SELECT id, media_id, remote_etag FROM sources WHERE deck_id = ? AND user_id = ? AND remote_id = ?").get(deckId, userId, item.id) as { id: string; media_id: string | null; remote_etag: string | null } | undefined;
    if (known && item.eTag && known.remote_etag === item.eTag && known.media_id && getMedia(userId, known.media_id)) {
      report.unchanged++;
      continue;
    }
    const mime = IMAGE_MIME[extOf(item.name)];
    if (!OK_MIME.has(mime)) continue;
    let buf: Buffer;
    try {
      if (log && n % 10 === 1) log(`OneDrive: downloading ${n} of ${found.length}`);
      buf = await route.download(at, item);
    } catch (e) {
      report.skipped.push({ name: rel, reason: (e as Error).message });
      continue;
    }
    // OneDrive reports a SHA-256 for personal drives: a picture that does not match it is not stored.
    const want = item.file?.hashes?.sha256Hash;
    if (want && createHash("sha256").update(buf).digest("hex").toUpperCase() !== want.toUpperCase()) {
      report.skipped.push({ name: rel, reason: "the download was damaged (checksum did not match); pull again" });
      continue;
    }
    const old = known?.media_id ? getMedia(userId, known.media_id) : null;
    if (known && old && old.mime === mime) {
      // Same media id, new bytes: every slide showing it updates.
      fs.writeFileSync(old.path, buf);
      db.prepare("UPDATE media SET bytes = ? WHERE id = ?").run(buf.length, old.id);
      db.prepare("UPDATE sources SET remote_etag = ?, bytes = ?, name = ?, rel_path = ? WHERE id = ?").run(item.eTag ?? null, buf.length, item.name, rel.includes("/") ? rel : null, known.id);
      report.updated++;
    } else if (known) {
      const m = addMedia(userId, deckId, item.name, mime, buf, "onedrive");
      db.prepare("UPDATE sources SET media_id = ?, remote_etag = ?, bytes = ?, name = ?, rel_path = ? WHERE id = ?").run(m.id, item.eTag ?? null, buf.length, item.name, rel.includes("/") ? rel : null, known.id);
      report.updated++;
    } else {
      const m = addMedia(userId, deckId, item.name, mime, buf, "onedrive");
      const s = addSource(userId, deckId, { name: item.name, relPath: rel.includes("/") ? rel : undefined, kind: "image", bytes: buf.length, text: "", mediaId: m.id });
      db.prepare("UPDATE sources SET remote_id = ?, remote_etag = ? WHERE id = ?").run(item.id, item.eTag ?? null, s.id);
      report.added++;
    }
  }
  return report;
}

export function summarise(r: ImportReport): string {
  const parts = [`${r.added} new`, `${r.updated} updated`, `${r.unchanged} unchanged`];
  if (r.skipped.length) parts.push(`${r.skipped.length} skipped`);
  return `OneDrive "${r.folder}": ${parts.join(", ")}${r.capped ? `, stopped at ${MAX_PICTURES} pictures` : ""}`;
}
