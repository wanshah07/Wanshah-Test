import type { Deck, Slide, SlopHit, SourceRef } from "@slidecraft/shared";

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
  model: string;
  imageModel: string;
  defaults: { model: string; imageModel: string };
  appTheme: "light" | "dark" | "system";
  defaultTheme: string;
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
  createDeck: (b: { title?: string; lang?: string; angle?: string; themeId?: string }) => req<Deck>("POST", "/api/decks", b),
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
  saveSettings: (b: Partial<{ openaiKey: string | null; model: string; imageModel: string; appTheme: string; defaultTheme: string }>) => req<{ ok: true }>("PUT", "/api/settings", b),
  testKey: (openaiKey?: string) => req<{ ok: boolean; message: string; models?: string[] }>("POST", "/api/settings/test-key", { openaiKey }),
};

export function mediaUrl(id: string): string {
  return `/api/media/${id}`;
}
