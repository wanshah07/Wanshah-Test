import { renderDeckHtml, type ChatAnswer, type ChatTurn, type Deck, type ModelChoice, type NotebookGuide, type OneDriveLink, type Output, type Slide, type SlopHit, type SourceRef, type StudioOptions, type Theme } from "@slidecraft/shared";
import { ApiError } from "./apiError";
import { cloud, sb } from "./cloud/client";
import { cloudRequest } from "./cloud/routes";
import { mediaDataUrl, signedMediaUrl } from "./cloud/media";

export { ApiError } from "./apiError";
export { cloud } from "./cloud/client";

async function req<T>(method: string, url: string, body?: unknown, form?: FormData): Promise<T> {
  if (cloud) {
    try {
      return (await cloudRequest(method, url, body, form)) as T;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && !location.hash.startsWith("#/login")) location.hash = "#/login?next=" + encodeURIComponent(location.hash.slice(1) || "/");
      throw e;
    }
  }
  const res = await fetch(url, {
    method,
    headers: form ? undefined : body !== undefined ? { "content-type": "application/json" } : undefined,
    body: form ? form : body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  // A 401 with its own reason (a wrong password at sign-in) is that reason; any other 401 is a lapsed session.
  if (res.status === 401 && json.error !== "bad_credentials") {
    if (!location.pathname.startsWith("/login")) location.assign("/login?next=" + encodeURIComponent(location.pathname));
    throw new ApiError("Not signed in", 401, "not_signed_in");
  }
  // 502/503/504 with no JSON body comes from a proxy in front of Slidecraft (a
  // reverse proxy or port forwarder), not from Slidecraft: its server is stopped, restarting or still building.
  if (!res.ok && res.status >= 502 && res.status <= 504 && !json.message && !json.error)
    throw new ApiError(`Slidecraft's server did not answer (${res.status}). It is stopped, restarting or still building: check the terminal running npm start, start it again if it has stopped, then reload this page.`, res.status, "server_down");
  if (!res.ok) throw new ApiError(String(json.message || json.error || `${res.status} ${res.statusText}`), res.status, json.error ? String(json.error) : undefined);
  return json as T;
}

export interface DeckSummary {
  id: string;
  title: string;
  lang: "en" | "ms";
  angle: string;
  slides: number;
  themeId?: string;
  /** The deck's own theme and first slide, for its card. */
  theme?: Theme;
  cover?: Slide;
  createdAt: string;
  updatedAt: string;
}

export interface DeckResponse {
  deck: Deck;
  slop: Record<string, SlopHit[]>;
}

export interface Job {
  id: string;
  deckId: string;
  status: "queued" | "running" | "done" | "failed";
  progress: string[];
  error: string | null;
  result: { deckId: string; outputId?: string } | null;
}

export interface Settings {
  user: { id: string; email: string; name: string | null; role: string };
  authMode: "off" | "local";
  mockLlm: boolean;
  key: { own: string; server: string; active: "own" | "server" | "none" };
  endpoint: { baseUrl: string; host: string; provider: string; serverBaseUrl: string };
  providers: { id: string; name: string; baseUrl: string }[];
  model: string;
  imageModel: string;
  defaults: { model: string; imageModel: string };
  /** Whether the writer model reads pictures, as last checked. */
  vision: "yes" | "no" | "unknown";
  /** An optional second endpoint that only reads uploaded pictures. */
  reader: { baseUrl: string; model: string; key: string; complete: boolean };
  appTheme: "light" | "dark" | "system";
  defaultTheme: string;
}

export interface OneDriveStatus {
  provider: "microsoft" | "composio";
  composio: { key: string; account: string; accountLabel: string };
  clientId: string;
  clientIdFrom: "settings" | "server" | "none";
  connected: boolean;
  account: string;
  defaultFolder: string;
  pending: { userCode: string; verificationUri: string; expiresAt: string; interval: number } | null;
}

export interface GdriveStatus {
  connected: boolean;
  account: string;
  label: string;
  /** A Composio key is saved (the same one OneDrive uses). */
  hasKey: boolean;
}

export interface HouseRules {
  text: string;
  /** false: the built-in rules are in force. */
  custom: boolean;
  default: string;
  max: number;
}

export interface OneDriveImport {
  report: { folder: string; added: number; updated: number; unchanged: number; skipped: { name: string; reason: string }[]; capped: boolean };
  summary: string;
  link: OneDriveLink;
  sources: SourceRef[];
}

export interface Design {
  id: string;
  name: string;
  theme: Theme;
  notes: string;
  analysis: {
    kind?: "pptx" | "pdf" | "image";
    files?: string[];
    colours?: { hex: string; share: number }[];
    fonts?: { display?: string; body?: string; found: string[] };
    stats?: { slides: number; titleWords: number; longestTitle: number; linesPerSlide: number; charts: number; tables: number; pictures: number };
    warnings?: string[];
  };
  previewMediaId: string | null;
  sourceName: string | null;
  updatedAt: string;
}

export interface SavedPrompt {
  id: string;
  name: string;
  text: string;
  isDefault: boolean;
}

export interface MediaItem {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  origin: string;
}

export const api = {
  health: () => req<{ ok: boolean; authMode: string; mockLlm: boolean }>("GET", "/api/health"),
  authMode: () => req<{ mode: "off" | "local" }>("GET", "/api/auth/mode"),
  me: () => req<{ user: Settings["user"]; mode: string; member?: boolean }>("GET", "/api/auth/me"),
  login: (email: string, password: string) => req<{ user: Settings["user"] }>("POST", "/api/auth/login", { email, password }),
  logout: () => req<{ ok: true }>("POST", "/api/auth/logout"),
  /** Supabase builds only: a teammate makes their own account, then the owner adds them. */
  signUp: (email: string, password: string) => req<{ confirm: boolean }>("POST", "/api/auth/signup", { email, password }),
  /** Supabase builds only: the signed-in person sets a new password. */
  changePassword: (password: string) => req<{ ok: true }>("PUT", "/api/auth/password", { password }),
  decks: () => req<DeckSummary[]>("GET", "/api/decks"),
  createDeck: (b: { title?: string; lang?: string; angle?: string; themeId?: string; designId?: string }) => req<Deck>("POST", "/api/decks", b),
  deck: (id: string) => req<DeckResponse>("GET", `/api/decks/${id}`),
  saveDeck: (deck: Deck) => req<DeckResponse>("PUT", `/api/decks/${deck.id}`, deck),
  deleteDeck: (id: string) => req<{ ok: true }>("DELETE", `/api/decks/${id}`),
  duplicateDeck: (id: string) => req<Deck>("POST", `/api/decks/${id}/duplicate`),
  applyPreset: (id: string, presetId: string) => req<Deck>("POST", `/api/decks/${id}/theme`, { presetId }),
  sources: (id: string) => req<SourceRef[]>("GET", `/api/decks/${id}/sources`),
  uploadSources: (id: string, files: { file: File; path: string }[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f.file, encodeURIComponent(f.path));
    return req<{ added: SourceRef[]; skipped: string[] }>("POST", `/api/decks/${id}/sources`, undefined, fd);
  },
  addLink: (id: string, url: string) => req<{ added: SourceRef[]; skipped: string[] }>("POST", `/api/decks/${id}/sources/link`, { url }),
  addText: (id: string, name: string, text: string) => req<SourceRef>("POST", `/api/decks/${id}/sources/text`, { name, text }),
  deleteSource: (sid: string) => req<{ ok: true }>("DELETE", `/api/sources/${sid}`),
  media: (id: string) => req<MediaItem[]>("GET", `/api/decks/${id}/media`),
  uploadMedia: (id: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    return req<MediaItem[]>("POST", `/api/decks/${id}/media`, undefined, fd);
  },
  deleteMedia: (mid: string) => req<{ ok: true }>("DELETE", `/api/media/${mid}`),
  generate: (id: string, params: Record<string, unknown>) => req<{ jobId: string }>("POST", `/api/decks/${id}/generate`, params),
  job: (jid: string) => req<Job>("GET", `/api/jobs/${jid}`),
  rewrite: (id: string, sid: string, instruction: string) => req<{ slide: Slide; slop: SlopHit[] }>("POST", `/api/decks/${id}/slides/${sid}/rewrite`, { instruction }),
  settings: () => req<Settings>("GET", "/api/settings"),
  saveSettings: (b: Partial<{ openaiKey: string | null; model: string; imageModel: string; appTheme: string; defaultTheme: string; baseUrl: string | null }>) => req<{ ok: true }>("PUT", "/api/settings", b),
  oneDrive: () => req<OneDriveStatus>("GET", "/api/onedrive"),
  saveOneDrive: (b: { clientId?: string | null; defaultFolder?: string | null; provider?: "microsoft" | "composio"; composioKey?: string | null; composioAccount?: string | null; composioAccountLabel?: string | null }) => req<OneDriveStatus>("PUT", "/api/onedrive", b),
  disconnectOneDrive: () => req<OneDriveStatus>("DELETE", "/api/onedrive"),
  composioAccounts: (key?: string) => req<{ accounts: { id: string; label: string; status: string }[] }>("POST", "/api/onedrive/composio/accounts", { key }),
  gdrive: () => req<GdriveStatus>("GET", "/api/gdrive"),
  saveGdrive: (b: { composioKey?: string | null; account?: string | null; label?: string | null }) => req<GdriveStatus>("PUT", "/api/gdrive", b),
  deleteGdrive: () => req<GdriveStatus>("DELETE", "/api/gdrive"),
  gdriveAccounts: (key?: string) => req<{ accounts: { id: string; label: string; status: string }[] }>("POST", "/api/gdrive/accounts", { key }),
  house: () => req<HouseRules>("GET", "/api/settings/house"),
  saveHouse: (text: string | null) => req<HouseRules>("PUT", "/api/settings/house", { text }),
  oneDriveLogin: () => req<NonNullable<OneDriveStatus["pending"]>>("POST", "/api/onedrive/login"),
  oneDrivePoll: () => req<{ state: "waiting" | "connected" | "expired" | "declined" | "none"; account?: string; message?: string }>("POST", "/api/onedrive/login/poll"),
  oneDriveBrowse: (folder: string) => req<{ name: string; folders: string[]; pictures: number }>("GET", `/api/onedrive/browse?folder=${encodeURIComponent(folder)}`),
  importOneDrive: (id: string, folder: string, subfolders: boolean) => req<OneDriveImport>("POST", `/api/decks/${id}/onedrive`, { folder, subfolders }),
  unlinkOneDrive: (id: string) => req<{ ok: true }>("DELETE", `/api/decks/${id}/onedrive`),
  designs: () => req<Design[]>("GET", "/api/designs"),
  analyseDesign: (files: File[], name: string) => {
    const fd = new FormData();
    if (name.trim()) fd.append("name", name.trim());
    for (const f of files) fd.append("files", f, encodeURIComponent(f.name));
    return req<Design>("POST", "/api/designs/analyse", undefined, fd);
  },
  saveDesign: (name: string, theme: Theme, notes = "") => req<Design>("POST", "/api/designs", { name, theme, notes }),
  updateDesign: (id: string, b: { name?: string; notes?: string; theme?: Theme }) => req<Design>("PUT", `/api/designs/${id}`, b),
  deleteDesign: (id: string) => req<{ ok: true }>("DELETE", `/api/designs/${id}`),
  applyDesign: (deckId: string, designId: string) => req<Deck>("POST", `/api/decks/${deckId}/design`, { designId }),
  prompts: () => req<SavedPrompt[]>("GET", "/api/prompts"),
  addPrompt: (b: { name: string; text: string; isDefault: boolean }) => req<SavedPrompt>("POST", "/api/prompts", b),
  updatePrompt: (id: string, b: { name: string; text: string; isDefault: boolean }) => req<SavedPrompt>("PUT", `/api/prompts/${id}`, b),
  deletePrompt: (id: string) => req<{ ok: true }>("DELETE", `/api/prompts/${id}`),
  feedback: (deckId: string, sid: string, text: string, apply: boolean) => req<{ slide: Slide; slop: SlopHit[] }>("POST", `/api/decks/${deckId}/slides/${sid}/feedback`, { text, apply }),
  slideOk: (deckId: string, sid: string, ok: boolean) => req<{ slide: Slide; slop: SlopHit[] }>("POST", `/api/decks/${deckId}/slides/${sid}/ok`, { ok }),
  applyAllFeedback: (deckId: string) => req<{ jobId: string }>("POST", `/api/decks/${deckId}/feedback/apply`),
  saveReader: (b: { key?: string | null; baseUrl?: string | null; model?: string | null }) => req<{ ok: true }>("PUT", "/api/settings/reader", b),
  clearReader: () => req<{ ok: true }>("DELETE", "/api/settings/reader"),
  testReader: (b: { key?: string; baseUrl?: string; model?: string }) => req<{ ok: boolean; message: string; models?: string[]; vision?: string }>("POST", "/api/settings/reader/test", b),
  // The notebook: models to pick from, the Studio, the chat, the guide.
  models: () => req<{ current: string; models: ModelChoice[]; fast: string | null; open: boolean }>("GET", "/api/models"),
  outputs: (deckId: string) => req<Output[]>("GET", `/api/decks/${deckId}/outputs`),
  output: (oid: string) => req<Output>("GET", `/api/outputs/${oid}`),
  renameOutput: (oid: string, title: string) => req<Output>("PUT", `/api/outputs/${oid}`, { title }),
  deleteOutput: (oid: string) => req<{ ok: true }>("DELETE", `/api/outputs/${oid}`),
  saveNote: (deckId: string, b: { title?: string; data: { text: string; question?: string; citations?: { source: string; quote: string }[] } }) => req<Output>("POST", `/api/decks/${deckId}/outputs`, b),
  studio: (deckId: string, o: StudioOptions) => req<{ jobId: string }>("POST", `/api/decks/${deckId}/studio`, o),
  ask: (deckId: string, b: { question: string; history: ChatTurn[]; model?: string; sourceIds?: string[] }) => req<ChatAnswer>("POST", `/api/decks/${deckId}/ask`, b),
  guide: (deckId: string, refresh = false) => req<NotebookGuide>("POST", `/api/decks/${deckId}/guide`, { refresh }),
  testKey: (openaiKey?: string, baseUrl?: string, model?: string) => req<{ ok: boolean; message: string; models?: string[]; imageModels?: string[]; vision?: string }>("POST", "/api/settings/test-key", { openaiKey, baseUrl, model }),
};

export function mediaUrl(id: string): string {
  return cloud ? signedMediaUrl(id) : `/api/media/${id}`;
}

function saveBlob(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

const fileName = (title: string) => title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "deck";

/** The whole deck as one HTML page with its pictures inside, as the server's export and presenter build it. */
export async function deckHtml(deckId: string): Promise<string> {
  const { deck } = await api.deck(deckId);
  const ids = new Set<string>();
  JSON.stringify(deck, (k, v) => ((k === "mediaId" || k === "logoMediaId") && typeof v === "string" ? (ids.add(v), v) : v));
  const data = new Map<string, string>();
  for (const id of ids) data.set(id, await mediaDataUrl(id));
  return renderDeckHtml(deck, (id) => data.get(id) ?? "");
}

/**
 * Downloads a deck as PowerPoint, HTML or JSON. On the server the browser simply
 * opens the export address; on GitHub Pages HTML and JSON are built here and the
 * PowerPoint is built by the worker and fetched from sc-exports.
 */
export async function exportDeck(deckId: string, kind: "pptx" | "html" | "json"): Promise<void> {
  if (!cloud) {
    window.location.href = `/api/decks/${deckId}/export.${kind}`;
    return;
  }
  const { deck } = await api.deck(deckId);
  if (kind === "json") return saveBlob(new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" }), `${fileName(deck.title)}.json`);
  if (kind === "html") return saveBlob(new Blob([await deckHtml(deckId)], { type: "text/html" }), `${fileName(deck.title)}.html`);
  const r = await req<{ file: { bucket: string; path: string; name: string } }>("GET", `/api/decks/${deckId}/export.pptx`);
  const { data, error } = await sb().storage.from(r.file.bucket).download(r.file.path);
  if (error || !data) throw new ApiError(error?.message || "The PowerPoint could not be downloaded.", 500, "download");
  saveBlob(data, r.file.name);
  // Downloaded: the copy in sc-exports is no longer needed.
  void sb().storage.from(r.file.bucket).remove([r.file.path]);
}
