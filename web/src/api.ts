import type { Deck, OneDriveLink, Slide, SlopHit, SourceRef, Theme } from "@slidecraft/shared";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown, form?: FormData): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: form ? undefined : body !== undefined ? { "content-type": "application/json" } : undefined,
    body: form ? form : body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401) {
    if (!location.pathname.startsWith("/login")) location.assign("/login?next=" + encodeURIComponent(location.pathname));
    throw new ApiError("Not signed in", 401, "not_signed_in");
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
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
  createdAt: string;
  updatedAt: string;
}

export interface DeckResponse {
  deck: Deck;
  slop: Record<string, SlopHit[]>;
  sahkan: number;
}

export interface Job {
  id: string;
  deckId: string;
  status: "queued" | "running" | "done" | "failed";
  progress: string[];
  error: string | null;
  result: { deckId: string } | null;
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
  me: () => req<{ user: Settings["user"]; mode: string }>("GET", "/api/auth/me"),
  login: (email: string, password: string) => req<{ user: Settings["user"] }>("POST", "/api/auth/login", { email, password }),
  logout: () => req<{ ok: true }>("POST", "/api/auth/logout"),
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
  testKey: (openaiKey?: string, baseUrl?: string, model?: string) => req<{ ok: boolean; message: string; models?: string[]; imageModels?: string[]; vision?: string }>("POST", "/api/settings/test-key", { openaiKey, baseUrl, model }),
};

export function mediaUrl(id: string): string {
  return `/api/media/${id}`;
}
