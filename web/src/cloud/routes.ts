import {
  angleById,
  checkSource,
  HOUSE_DEFAULT,
  DEFAULT_THEME_ID,
  HOUSE_MAX,
  houseValue,
  LAYOUTS,
  newId,
  sanitizeSlide,
  sanitizeTheme,
  scanDeck,
  scanSlide,
  themePreset,
  type Deck,
  type Slide,
  type SourceRef,
  type Theme,
} from "@slidecraft/shared";
import { ApiError } from "../apiError";
import { sb } from "./client";
import { uid } from "./ids";
import { finished, queueJob, readJob, watchJob, type JobRequest, type JobRow } from "./jobs";
import { signMedia } from "./media";

// The Supabase side of every /api request the page makes. Reads and small
// edits go straight to the tables (row level security keeps each person to
// their own rows); everything else becomes a job for the worker, which runs
// the server's own code. Each handler answers in the shape the server route
// answered in, so the pages do not know which side they talk to.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (p: Record<string, string>, body: any, query: URLSearchParams) => Promise<unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any

const notFound = (code = "not_found") => new ApiError(code, 404, code);

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new ApiError(r.error.message, 500, "supabase");
  return r.data as T;
}

async function userId(): Promise<string> {
  const { data } = await sb().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ApiError("Not signed in", 401, "not_signed_in");
  return id;
}

async function settingsRow(): Promise<Row> {
  const me = await userId();
  return check(await sb().from("sc_settings").select("*").eq("user_id", me).maybeSingle()) ?? { user_id: me };
}

async function saveSettings(patch: Row): Promise<void> {
  const me = await userId();
  check(await sb().from("sc_settings").upsert({ user_id: me, ...patch }, { onConflict: "user_id" }));
}

// ---------------------------------------------------------------- decks

async function deckRow(id: string): Promise<Row> {
  const r = check(await sb().from("sc_decks").select("id, title, doc, created_at, updated_at").eq("id", id).maybeSingle());
  if (!r) throw notFound();
  return r;
}

async function sourceRefs(deckId: string): Promise<SourceRef[]> {
  const rows = check(await sb().from("sc_sources").select("id, name, kind, chars, rel_path, text").eq("deck_id", deckId).order("created_at")) as Row[];
  return rows.map((r) => ({ id: r.id, name: r.rel_path || r.name, kind: r.kind, chars: r.chars, check: checkSource(r.kind, r.text ?? "") }));
}

/** The deck as the server's loadDeck returned it: slides and theme in shapes the renderer trusts, sources listed. */
async function loadDeck(id: string): Promise<Deck> {
  const r = await deckRow(id);
  const deck = { ...(r.doc as Deck) };
  deck.slides = (Array.isArray(deck.slides) ? deck.slides : []).map((x) => sanitizeSlide(x));
  deck.theme = sanitizeTheme(deck.theme);
  deck.sources = await sourceRefs(id);
  await signDeckMedia(id);
  return deck;
}

async function saveDoc(deck: Deck): Promise<Deck> {
  deck.updatedAt = new Date().toISOString();
  const { sources: _s, ...doc } = deck;
  const me = await userId();
  check(await sb().from("sc_decks").upsert({ id: deck.id, user_id: me, title: deck.title, doc, created_at: deck.createdAt }, { onConflict: "id" }));
  return deck;
}

async function signDeckMedia(deckId: string | null): Promise<Row[]> {
  // The id goes into a filter expression: only the characters an id is made of.
  if (deckId && !/^[A-Za-z0-9_-]+$/.test(deckId)) throw notFound();
  const q = sb().from("sc_media").select("id, name, mime, bytes, origin, deck_id, object_path").order("created_at");
  const rows = check(await (deckId ? q.or(`deck_id.eq.${deckId},deck_id.is.null`) : q.is("deck_id", null))) as Row[];
  await signMedia(rows as { id: string; object_path: string }[]);
  return rows;
}

function validDeck(raw: unknown): raw is Deck {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as Deck;
  if (typeof d.id !== "string" || typeof d.title !== "string" || !Array.isArray(d.slides)) return false;
  for (const s of d.slides as Slide[]) if (!s || typeof s.id !== "string" || typeof s.title !== "string" || !LAYOUTS.includes(s.layout)) return false;
  if (!d.theme || typeof d.theme !== "object" || !d.theme.colors) return false;
  return d.lang === "en" || d.lang === "ms";
}

async function design(id: string): Promise<Row | null> {
  return check(await sb().from("sc_designs").select("*").eq("id", id).maybeSingle());
}

function toDesign(r: Row) {
  return { id: r.id, name: r.name, theme: sanitizeTheme(r.theme), notes: r.notes, analysis: r.analysis ?? {}, previewMediaId: r.preview_media_id, sourceName: r.source_name, createdAt: r.created_at, updatedAt: r.updated_at };
}

async function removeMedia(rows: Row[]): Promise<void> {
  if (!rows.length) return;
  await sb().storage.from("sc-media").remove(rows.map((r) => r.object_path).filter(Boolean));
  check(await sb().from("sc_media").delete().in("id", rows.map((r) => r.id)));
}

async function changeSlide(deckId: string, sid: string, change: (cur: Slide) => Slide) {
  const deck = await loadDeck(deckId);
  const i = deck.slides.findIndex((s) => s.id === sid);
  if (i < 0) throw notFound("slide_not_found");
  deck.slides[i] = { ...change(deck.slides[i]), id: sid };
  await saveDoc(deck);
  return { slide: deck.slides[i], slop: scanSlide(deck.slides[i], deck.lang) };
}

// ---------------------------------------------------------------- jobs

/** Runs a request on the worker and answers like the server would have. */
async function viaWorker(method: string, path: string, body: unknown, form: FormData | undefined, kind = "api"): Promise<unknown> {
  const req = await jobRequest(method, path, body, form);
  const id = await queueJob(req, kind, deckOf(path));
  const j = await watchJob(id, finished);
  // The answer is read; the row has done its job (a failed one too). A query only runs once awaited.
  await sb().from("sc_jobs").delete().eq("id", id).then(() => undefined, () => undefined);
  // Pictures the job added (an upload, a OneDrive pull, a design preview) get their signed links now.
  const deck = deckOf(path);
  await signDeckMedia(deck).catch(() => undefined);
  return answer(j);
}

function deckOf(path: string): string | null {
  return /^\/api\/decks\/([^/?]+)/.exec(path)?.[1] ?? null;
}

async function jobRequest(method: string, path: string, body: unknown, form?: FormData): Promise<JobRequest> {
  if (!form) return { method, path, ...(body !== undefined ? { body } : {}) };
  const me = await userId();
  const folder = `${me}/${crypto.randomUUID()}`;
  const req: JobRequest = { method, path, fields: {}, files: [] };
  let n = 0;
  for (const [field, value] of form.entries()) {
    if (typeof value === "string") {
      req.fields![field] = value;
      continue;
    }
    // Stored under a plain name; the name the server sees is the one the page chose.
    const objectPath = `${folder}/${n++}`;
    const up = await sb().storage.from("sc-inbox").upload(objectPath, value, { contentType: value.type || "application/octet-stream", upsert: true });
    if (up.error) throw new ApiError(`Could not upload ${value.name}: ${up.error.message}`, 500, "upload");
    req.files!.push({ field, name: value.name, path: objectPath, type: value.type || undefined });
  }
  return req;
}

function answer(j: JobRow): unknown {
  if (j.status === "error" || !j.result) throw new ApiError(j.error || "The worker could not finish this. Try again.", 500, "worker");
  const { status, body, file } = j.result;
  if (status >= 400) {
    const b = (body ?? {}) as Row;
    throw new ApiError(String(b.message || b.error || `Failed (${status})`), status, b.error ? String(b.error) : undefined);
  }
  return file ? { file } : body;
}

/** The job as the page's Job type describes it, however far the worker has got. */
function asPageJob(j: JobRow) {
  const base = { id: j.id, deckId: j.deck_id ?? "" };
  if (j.status === "pending") return { ...base, status: "queued", progress: ["Waiting for the worker to start (usually under a minute)"], error: null, result: null };
  if (j.status === "error") return { ...base, status: "failed", progress: j.progress?.progress ?? [], error: j.error, result: null };
  const w = j.result?.work;
  if (j.status === "done" && w) return { ...base, status: w.status === "done" ? "done" : "failed", progress: j.progress?.progress ?? [], error: w.error, result: w.result };
  if (j.status === "done" && j.result && j.result.status >= 400) {
    const b = (j.result.body ?? {}) as Row;
    return { ...base, status: "failed", progress: [], error: String(b.message || b.error || "Failed"), result: null };
  }
  if (j.status === "done") return { ...base, status: "done", progress: j.progress?.progress ?? [], error: null, result: { deckId: j.deck_id } };
  return { ...base, status: j.progress?.status === "queued" ? "queued" : "running", progress: j.progress?.progress ?? ["The worker has started"], error: null, result: null };
}

/**
 * Starts background work (writing a deck, applying feedback) and returns its
 * job id once the worker has taken it, or throws the refusal the server gave
 * (a deck already being written, pictures the writer cannot read).
 */
async function startWork(path: string, body: unknown, kind: string): Promise<{ jobId: string }> {
  const id = await queueJob({ method: "POST", path, body }, kind, deckOf(path));
  const j = await watchJob(id, (x) => finished(x) || !!x.progress?.status);
  if (j.status === "error" || (j.status === "done" && j.result && j.result.status >= 400)) answer(j);
  return { jobId: id };
}

// ---------------------------------------------------------------- the routes

const routes: [string, RegExp, Handler][] = [
  // Sign-in is Supabase Auth.
  ["GET", /^\/api\/auth\/mode$/, async () => ({ mode: "local" })],
  ["GET", /^\/api\/health$/, async () => ({ ok: true, authMode: "local", mockLlm: false })],
  [
    "GET",
    /^\/api\/auth\/me$/,
    async () => {
      const { data } = await sb().auth.getSession();
      const u = data.session?.user;
      if (!u) throw new ApiError("Not signed in", 401, "not_signed_in");
      const member = check(await sb().from("sc_members").select("role").eq("user_id", u.id).maybeSingle()) as Row | null;
      return { user: { id: u.id, email: u.email ?? "", name: null, role: member?.role ?? "none" }, mode: "local", member: !!member };
    },
  ],
  [
    "POST",
    /^\/api\/auth\/login$/,
    async (_p, b) => {
      const { data, error } = await sb().auth.signInWithPassword({ email: String(b?.email ?? ""), password: String(b?.password ?? "") });
      if (error || !data.user) throw new ApiError(error?.message === "Invalid login credentials" ? "bad_credentials" : error?.message || "Sign-in failed", 401, "bad_credentials");
      return { user: { id: data.user.id, email: data.user.email ?? "", name: null, role: "member" } };
    },
  ],
  [
    "POST",
    /^\/api\/auth\/signup$/,
    async (_p, b) => {
      const { data, error } = await sb().auth.signUp({ email: String(b?.email ?? ""), password: String(b?.password ?? ""), options: { emailRedirectTo: location.href.split("#")[0] } });
      if (error) {
        // A project that only lets its owner create accounts (as a shared project should).
        if (error.code === "signup_disabled" || /signups? not allowed/i.test(error.message)) throw new ApiError("New accounts are made by the workspace owner here. Ask them to create yours, then sign in with the email and password they give you.", 403, "signup_closed");
        throw new ApiError(error.message, 400, "signup");
      }
      return { confirm: !data.session };
    },
  ],
  [
    "PUT",
    /^\/api\/auth\/password$/,
    async (_p, b) => {
      const password = String(b?.password ?? "");
      if (password.length < 8) throw new ApiError("Use at least 8 characters.", 400, "weak_password");
      const { error } = await sb().auth.updateUser({ password });
      if (error) {
        if (error.code === "same_password") throw new ApiError("That is the password you already have.", 400, "same_password");
        if (error.code === "reauthentication_needed" || /reauthenticat/i.test(error.message)) throw new ApiError("For safety, sign out and sign in again, then change the password straight away.", 401, "reauthenticate");
        throw new ApiError(error.message, 400, "password");
      }
      return { ok: true };
    },
  ],
  ["POST", /^\/api\/auth\/logout$/, async () => (await sb().auth.signOut(), { ok: true })],

  // Decks
  [
    "GET",
    /^\/api\/decks$/,
    async () => {
      const rows = check(await sb().from("sc_decks").select("id, title, doc, created_at, updated_at").order("updated_at", { ascending: false })) as Row[];
      return rows.map((r) => {
        const d = r.doc as Deck;
        const first = Array.isArray(d.slides) && d.slides[0] ? sanitizeSlide(d.slides[0]) : undefined;
        return { id: r.id, title: r.title, lang: d.lang, angle: d.angle, slides: d.slides?.length ?? 0, themeId: d.theme?.id, theme: sanitizeTheme(d.theme), cover: first, createdAt: r.created_at, updatedAt: r.updated_at };
      });
    },
  ],
  [
    "POST",
    /^\/api\/decks$/,
    async (_p, b) => {
      for (const k of ["title", "lang", "angle", "themeId", "designId"]) if (b?.[k] !== undefined && b?.[k] !== null && typeof b[k] !== "string") throw new ApiError(`${k} must be text`, 400, "invalid");
      const s = await settingsRow();
      const lang = b?.lang === "ms" ? "ms" : "en";
      const dz = b?.designId ? await design(b.designId) : null;
      const t = new Date().toISOString();
      const deck: Deck = {
        id: newId("d"),
        title: String(b?.title ?? "").slice(0, 300) || (lang === "ms" ? "Deck baharu" : "New deck"),
        lang,
        angle: angleById(b?.angle ?? "custom").id,
        theme: dz ? (JSON.parse(JSON.stringify(sanitizeTheme(dz.theme))) as Theme) : themePreset(b?.themeId ?? s.default_theme ?? DEFAULT_THEME_ID),
        ...(dz ? { designId: dz.id } : {}),
        slides: [],
        sources: [],
        createdAt: t,
        updatedAt: t,
      };
      return saveDoc(deck);
    },
  ],
  ["GET", /^\/api\/decks\/([^/]+)$/, async (p) => {
    const deck = await loadDeck(p[1]);
    return { deck, slop: scanDeck(deck) };
  }],
  [
    "PUT",
    /^\/api\/decks\/([^/]+)$/,
    async (p, body) => {
      const cur = await loadDeck(p[1]);
      if (!validDeck(body) || body.id !== p[1]) throw new ApiError("invalid_deck", 400, "invalid_deck");
      // Sources, the OneDrive link and the stored brief belong to the worker's side, as on the server.
      const next: Deck = { ...body, title: String(body.title).slice(0, 300), slides: body.slides.map((x) => sanitizeSlide(x)), theme: sanitizeTheme(body.theme), createdAt: cur.createdAt, sources: cur.sources, onedrive: cur.onedrive, brief: cur.brief };
      if (!next.onedrive) delete next.onedrive;
      if (!next.brief) delete next.brief;
      await saveDoc(next);
      return { deck: next, slop: scanDeck(next) };
    },
  ],
  [
    "DELETE",
    /^\/api\/decks\/([^/]+)$/,
    async (p) => {
      await deckRow(p[1]);
      const pics = check(await sb().from("sc_media").select("id, object_path").eq("deck_id", p[1])) as Row[];
      check(await sb().from("sc_decks").delete().eq("id", p[1]));
      await removeMedia(pics);
      return { ok: true };
    },
  ],
  [
    "POST",
    /^\/api\/decks\/([^/]+)\/duplicate$/,
    async (p) => {
      const d = await loadDeck(p[1]);
      const t = new Date().toISOString();
      return saveDoc({ ...d, id: newId("d"), title: `${d.title} (copy)`, createdAt: t, updatedAt: t, sources: [], slides: d.slides.map((s) => ({ ...s, id: newId() })) });
    },
  ],
  [
    "POST",
    /^\/api\/decks\/([^/]+)\/theme$/,
    async (p, b) => {
      const d = await loadDeck(p[1]);
      d.theme = { ...themePreset(b?.presetId ?? DEFAULT_THEME_ID), logoMediaId: d.theme.logoMediaId, footer: d.theme.footer };
      delete d.designId;
      return saveDoc(d);
    },
  ],
  [
    "POST",
    /^\/api\/decks\/([^/]+)\/design$/,
    async (p, b) => {
      const d = await loadDeck(p[1]);
      const dz = await design(String(b?.designId ?? ""));
      if (!dz) throw notFound("design_not_found");
      d.theme = { ...(JSON.parse(JSON.stringify(sanitizeTheme(dz.theme))) as Theme), logoMediaId: d.theme.logoMediaId, footer: d.theme.footer };
      d.designId = dz.id;
      return saveDoc(d);
    },
  ],
  [
    "POST",
    /^\/api\/decks\/([^/]+)\/slides\/([^/]+)\/ok$/,
    async (p, b) => {
      const ok = b?.ok !== false;
      return changeSlide(p[1], p[2], (cur) => {
        const r = { ...(cur.review ?? { ok: false, feedback: [] }), ok, okAt: ok ? new Date().toISOString() : undefined };
        if (!ok) delete r.okAt;
        return { ...cur, review: r };
      });
    },
  ],
  ["POST", /^\/api\/decks\/([^/]+)\/generate$/, async (p, b) => startWork(`/api/decks/${p[1]}/generate`, b ?? {}, "generate")],
  ["POST", /^\/api\/decks\/([^/]+)\/feedback\/apply$/, async (p) => startWork(`/api/decks/${p[1]}/feedback/apply`, {}, "feedback")],
  ["GET", /^\/api\/jobs\/([^/]+)$/, async (p) => {
    const j = await readJob(p[1]);
    if (!j) throw notFound();
    return asPageJob(j);
  }],

  // Sources and pictures
  ["GET", /^\/api\/decks\/([^/]+)\/sources$/, async (p) => (await deckRow(p[1]), sourceRefs(p[1]))],
  [
    "POST",
    /^\/api\/decks\/([^/]+)\/sources\/text$/,
    async (p, b) => {
      await deckRow(p[1]);
      if (typeof b?.text !== "string" || (b.name !== undefined && typeof b.name !== "string")) throw new ApiError("text and name must be text", 400, "invalid");
      const text = b.text.trim().slice(0, 2_000_000);
      if (!text) throw new ApiError("empty", 400, "empty");
      const me = await userId();
      const row = { id: uid("s"), user_id: me, deck_id: p[1], name: b.name?.trim().slice(0, 200) || "Pasted text", kind: "text", bytes: new TextEncoder().encode(text).length, chars: text.length, text };
      check(await sb().from("sc_sources").insert(row));
      return { id: row.id, name: row.name, kind: row.kind, chars: row.chars, check: checkSource("text", text) };
    },
  ],
  [
    "GET",
    /^\/api\/sources\/([^/]+)$/,
    async (p) => {
      const r = check(await sb().from("sc_sources").select("id, name, rel_path, kind, chars, text, media_id").eq("id", p[1]).maybeSingle());
      if (!r) throw notFound();
      return r;
    },
  ],
  [
    "DELETE",
    /^\/api\/sources\/([^/]+)$/,
    async (p) => {
      const r = check(await sb().from("sc_sources").delete().eq("id", p[1]).select("id")) as Row[];
      if (!r.length) throw notFound();
      return { ok: true };
    },
  ],
  [
    "GET",
    /^\/api\/decks\/([^/]+)\/media$/,
    async (p) => {
      await deckRow(p[1]);
      const rows = await signDeckMedia(p[1]);
      return rows.filter((r) => r.origin !== "design").map((r) => ({ id: r.id, name: r.name, mime: r.mime, bytes: r.bytes, origin: r.origin, deck_id: r.deck_id }));
    },
  ],
  [
    "DELETE",
    /^\/api\/media\/([^/]+)$/,
    async (p) => {
      const rows = check(await sb().from("sc_media").select("id, object_path").eq("id", p[1])) as Row[];
      if (!rows.length) throw notFound();
      await removeMedia(rows);
      return { ok: true };
    },
  ],

  // Settings: choices only. The AI and Composio keys belong to the workspace owner and live in GitHub.
  [
    "GET",
    /^\/api\/settings$/,
    async () => {
      const { data } = await sb().auth.getSession();
      const u = data.session?.user;
      if (!u) throw new ApiError("Not signed in", 401, "not_signed_in");
      const s = await settingsRow();
      return {
        user: { id: u.id, email: u.email ?? "", name: null, role: "member" },
        authMode: "local",
        mockLlm: false,
        key: { own: "", server: "set by the workspace owner", active: "server" },
        endpoint: { baseUrl: "", host: "", provider: "openai", serverBaseUrl: "" },
        providers: [],
        model: s.model ?? "",
        imageModel: s.image_model ?? "",
        defaults: { model: "", imageModel: "" },
        vision: s.vision_ok === "yes" || s.vision_ok === "no" ? s.vision_ok : "unknown",
        reader: { baseUrl: "", model: "", key: "", complete: false },
        appTheme: s.app_theme ?? "system",
        defaultTheme: s.default_theme ?? DEFAULT_THEME_ID,
        cloud: true,
      };
    },
  ],
  [
    "PUT",
    /^\/api\/settings$/,
    async (_p, b) => {
      const patch: Row = {};
      if (typeof b?.model === "string") patch.model = b.model.trim() || null;
      if (typeof b?.imageModel === "string") patch.image_model = b.imageModel.trim() || null;
      if (typeof b?.appTheme === "string") patch.app_theme = b.appTheme;
      if (typeof b?.defaultTheme === "string") patch.default_theme = b.defaultTheme;
      await saveSettings(patch);
      return { ok: true };
    },
  ],
  ["GET", /^\/api\/settings\/house$/, async () => houseAnswer((await settingsRow()).house_prompt ?? null)],
  [
    "PUT",
    /^\/api\/settings\/house$/,
    async (_p, b) => {
      if (b?.text !== null && typeof b?.text !== "string") throw new ApiError("text must be text or null", 400, "invalid");
      if (typeof b.text === "string" && b.text.length > HOUSE_MAX) throw new ApiError(`At most ${HOUSE_MAX} characters.`, 400, "too_long");
      const value = houseValue(b.text);
      await saveSettings({ house_prompt: value });
      return houseAnswer(value);
    },
  ],
  ["GET", /^\/api\/gdrive$/, async () => gdriveAnswer(await settingsRow())],
  [
    "PUT",
    /^\/api\/gdrive$/,
    async (_p, b) => {
      if (b?.account !== undefined) await saveSettings({ gd_account: b.account || null, gd_account_label: b.account ? (b.label ?? null) : null, gd_user: null });
      return gdriveAnswer(await settingsRow());
    },
  ],
  ["DELETE", /^\/api\/gdrive$/, async () => (await saveSettings({ gd_account: null, gd_account_label: null, gd_user: null }), gdriveAnswer(await settingsRow()))],
  ["GET", /^\/api\/onedrive$/, async () => oneDriveAnswer(await settingsRow())],
  [
    "PUT",
    /^\/api\/onedrive$/,
    async (_p, b) => {
      const patch: Row = {};
      if (b?.defaultFolder !== undefined) patch.onedrive_folder = b.defaultFolder || null;
      if (b?.composioAccount !== undefined) Object.assign(patch, { cz_account: b.composioAccount || null, cz_account_label: b.composioAccount ? (b.composioAccountLabel ?? null) : null, cz_user: null });
      if (Object.keys(patch).length) await saveSettings(patch);
      return oneDriveAnswer(await settingsRow());
    },
  ],
  ["DELETE", /^\/api\/onedrive$/, async () => (await saveSettings({ cz_account: null, cz_account_label: null, cz_user: null }), oneDriveAnswer(await settingsRow()))],

  // Designs and prompts
  [
    "GET",
    /^\/api\/designs$/,
    async () => {
      const rows = check(await sb().from("sc_designs").select("*").order("updated_at", { ascending: false })) as Row[];
      await signDeckMedia(null);
      return rows.map(toDesign);
    },
  ],
  ["GET", /^\/api\/designs\/([^/]+)$/, async (p) => {
    const r = await design(p[1]);
    if (!r) throw notFound();
    return toDesign(r);
  }],
  [
    "POST",
    /^\/api\/designs$/,
    async (_p, b) => {
      if (!b?.name?.trim() || !b.theme?.colors) throw new ApiError("A name and a theme are needed.", 400, "invalid");
      const id = uid("dz");
      const me = await userId();
      const theme = sanitizeTheme({ ...b.theme, id: `design:${id}`, name: b.name.trim() });
      const r = check(await sb().from("sc_designs").insert({ id, user_id: me, name: b.name.trim(), theme, notes: String(b.notes ?? "").slice(0, 4000), analysis: {} }).select("*").single());
      return toDesign(r as unknown as Row);
    },
  ],
  [
    "PUT",
    /^\/api\/designs\/([^/]+)$/,
    async (p, b) => {
      const cur = await design(p[1]);
      if (!cur) throw notFound();
      const name = b?.name?.trim() || cur.name;
      const theme = sanitizeTheme({ ...(b?.theme ?? cur.theme), id: `design:${p[1]}`, name });
      const r = check(await sb().from("sc_designs").update({ name, notes: b?.notes ?? cur.notes, theme }).eq("id", p[1]).select("*").single());
      return toDesign(r as unknown as Row);
    },
  ],
  [
    "DELETE",
    /^\/api\/designs\/([^/]+)$/,
    async (p) => {
      const cur = await design(p[1]);
      if (!cur) throw notFound();
      check(await sb().from("sc_designs").delete().eq("id", p[1]));
      if (cur.preview_media_id) await removeMedia(check(await sb().from("sc_media").select("id, object_path").eq("id", cur.preview_media_id)) as Row[]);
      return { ok: true };
    },
  ],
  ["GET", /^\/api\/prompts$/, async () => listPrompts()],
  ["POST", /^\/api\/prompts$/, async (_p, b) => savePrompt(undefined, b)],
  ["PUT", /^\/api\/prompts\/([^/]+)$/, async (p, b) => savePrompt(p[1], b)],
  [
    "DELETE",
    /^\/api\/prompts\/([^/]+)$/,
    async (p) => {
      const r = check(await sb().from("sc_prompts").delete().eq("id", p[1]).select("id")) as Row[];
      if (!r.length) throw notFound();
      return { ok: true };
    },
  ],
];

function houseAnswer(own: string | null) {
  return { text: own ?? HOUSE_DEFAULT, custom: !!own, default: HOUSE_DEFAULT, max: HOUSE_MAX };
}

function gdriveAnswer(s: Row) {
  return { connected: !!s.gd_account, account: s.gd_account ?? "", label: s.gd_account_label || s.gd_account || "", hasKey: true };
}

function oneDriveAnswer(s: Row) {
  return {
    provider: "composio",
    composio: { key: "set by the workspace owner", account: s.cz_account ?? "", accountLabel: s.cz_account_label ?? "" },
    clientId: "",
    clientIdFrom: "none",
    connected: !!s.cz_account,
    account: s.cz_account_label || s.cz_account || "",
    defaultFolder: s.onedrive_folder ?? "",
    pending: null,
  };
}

async function listPrompts() {
  const rows = check(await sb().from("sc_prompts").select("id, name, text, is_default, updated_at")) as Row[];
  return rows
    .map((r) => ({ id: r.id, name: r.name, text: r.text, isDefault: !!r.is_default, updatedAt: r.updated_at }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

async function savePrompt(id: string | undefined, b: Row) {
  const name = String(b?.name ?? "").trim().slice(0, 120);
  const text = String(b?.text ?? "").trim().slice(0, 8000);
  if (!name || !text) throw new ApiError("A prompt needs a name and some text.", 400, "invalid");
  if (id) {
    const r = check(await sb().from("sc_prompts").update({ name, text, is_default: !!b.isDefault }).eq("id", id).select("id")) as Row[];
    if (!r.length) throw new ApiError("A prompt needs a name and some text.", 400, "invalid");
  } else {
    id = uid("p");
    check(await sb().from("sc_prompts").insert({ id, user_id: await userId(), name, text, is_default: !!b.isDefault }));
  }
  return (await listPrompts()).find((x) => x.id === id) ?? null;
}

/** Answers one /api request from Supabase, or through the worker. */
export async function cloudRequest(method: string, url: string, body?: unknown, form?: FormData): Promise<unknown> {
  const [path, qs] = url.split("?");
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const hit = re.exec(path);
    if (hit) return h(Object.fromEntries(hit.map((v, i) => [String(i), decodeURIComponent(v)])), body, new URLSearchParams(qs ?? ""));
  }
  if (!(await sb().auth.getSession()).data.session) throw new ApiError("Not signed in", 401, "not_signed_in");
  return viaWorker(method, url, body, form);
}
