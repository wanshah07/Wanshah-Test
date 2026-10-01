import type { FastifyInstance } from "fastify";
import { getDb } from "../db.js";
import { clearDisk, flush, load } from "./mirror.js";
import { multipartBody, type Part } from "./multipart.js";
import { eq, type Supabase } from "./supabase.js";

// One job, start to finish: claim it, load the person's data, send the request
// to the existing app exactly as the page used to, wait for any work the route
// started in the background, write back what changed, record the answer.
//
// Logs carry ids, counts and timings only. The repository is public and so are
// its Actions logs: never slide text, source text, a file name or a key.

export interface JobRequest {
  method?: string;
  path?: string;
  body?: unknown;
  /** Text fields sent alongside files in a multipart upload. */
  fields?: Record<string, string>;
  /** Files the page put in sc-inbox for this job, under <owner>/. */
  files?: { field?: string; name: string; path: string; type?: string }[];
}

export interface JobRow {
  id: string;
  user_id: string;
  deck_id: string | null;
  kind: string;
  request: JobRequest;
  attempts: number;
}

export interface JobResult {
  /** The HTTP status the app answered with; the page reads it like a fetch response. */
  status: number;
  body?: unknown;
  /** A file answer (PowerPoint, HTML): where the worker put it. */
  file?: { bucket: string; path: string; name: string; type: string; bytes: number };
  /** Background work the request started (writing a deck), as it finished. */
  work?: { id: string; kind: string; status: string; error: string | null; result: unknown };
}

const ALLOWED = /^\/api\/(?!auth\/|health$)[A-Za-z0-9_\-/.]+$/;

/** An /api path the page may ask for, with its query string; never a sign-in route or a path that climbs out with "..". */
export function allowedPath(p: string, method = "GET"): boolean {
  const [pathname] = p.split("?");
  if (!ALLOWED.test(pathname) || pathname.split("/").some((seg) => seg === ".." || seg === ".")) return false;
  // Keys are the worker's own secrets now: the routes that test, save or sign in with a key have no job to do here.
  if (/^\/api\/(settings\/(test-key|reader)|onedrive\/login)/.test(pathname)) return false;
  if (method !== "GET" && /^\/api\/(settings|onedrive|gdrive)$/.test(pathname)) return false;
  return true;
}
const LIMIT_MS = Number(process.env.SC_JOB_LIMIT_MS || 25 * 60_000);

export const log = (...parts: (string | number)[]) => console.log(`[worker] ${parts.join(" ")}`);

/** What a request is about, from its path: a deck, a picture or a source. */
export function scopeOf(path: string): { deck?: string; media?: string; source?: string; output?: string } {
  const p = path.split("?")[0];
  const deck = /^\/api\/decks\/([^/]+)/.exec(p)?.[1];
  if (deck) return { deck };
  const media = /^\/api\/media\/([^/]+)/.exec(p)?.[1];
  if (media) return { media };
  const source = /^\/api\/sources\/([^/]+)/.exec(p)?.[1];
  if (source) return { source };
  const output = /^\/api\/outputs\/([^/]+)/.exec(p)?.[1];
  if (output) return { output };
  return {};
}

function fileName(disposition: string | undefined, fallback: string): string {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? "") ?? /filename="([^"]+)"/i.exec(disposition ?? "");
  const raw = m ? decodeURIComponent(m[1]) : fallback;
  return raw.replace(/[\\/]/g, "-").slice(0, 150) || fallback;
}

async function progress(sb: Supabase, job: JobRow, p: unknown): Promise<void> {
  await sb.update("sc_jobs", { id: eq(job.id), user_id: eq(job.user_id) }, { progress: p }).catch(() => undefined);
}

/** Waits for background jobs the request started, passing their progress on to the page. */
async function waitForWork(sb: Supabase, job: JobRow, started: number): Promise<JobResult["work"]> {
  let last = "";
  for (;;) {
    const rows = getDb().prepare("SELECT id, kind, status, progress, error, result FROM jobs ORDER BY created_at").all() as {
      id: string;
      kind: string;
      status: string;
      progress: string;
      error: string | null;
      result: string | null;
    }[];
    const w = rows[rows.length - 1];
    if (!w) return undefined;
    const snap = JSON.stringify({ status: w.status, progress: JSON.parse(w.progress || "[]") });
    if (snap !== last) {
      last = snap;
      await progress(sb, job, JSON.parse(snap));
    }
    if (w.status !== "queued" && w.status !== "running") return { id: w.id, kind: w.kind, status: w.status, error: w.error, result: w.result ? JSON.parse(w.result) : null };
    if (Date.now() - started > LIMIT_MS) throw new Error("time_limit");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/**
 * Takes the job if it is still pending. Only one worker runs at a time (the
 * workflow's concurrency group), and the status check makes a second claim a no-op anyway.
 */
export async function claim(sb: Supabase, job: JobRow): Promise<boolean> {
  const got = await sb.update("sc_jobs", { id: eq(job.id), status: "eq.pending" }, { status: "running", started_at: new Date().toISOString(), attempts: job.attempts + 1 });
  return got.length === 1;
}

/**
 * Runs one job. "abandoned" means work the request started in the background is still going after the
 * time limit: it holds the in-memory database, and the next job would load another person's rows into
 * it, so the run must stop taking jobs.
 */
export async function runJob(app: FastifyInstance, sb: Supabase, job: JobRow): Promise<"ok" | "abandoned"> {
  const started = Date.now();
  const finish = (patch: Record<string, unknown>) => sb.update("sc_jobs", { id: eq(job.id), user_id: eq(job.user_id) }, patch);
  const req = job.request ?? {};
  const method = String(req.method || "POST").toUpperCase();
  const path = String(req.path || "");
  const ownFiles = () => (req.files ?? []).map((f) => f.path).filter((p) => p.startsWith(job.user_id + "/") && !p.split("/").some((x) => !x || x === "." || x === ".."));
  if (!allowedPath(path, method) || !["GET", "POST", "PUT", "DELETE"].includes(method)) {
    if (ownFiles().length) await sb.removeFiles("sc-inbox", ownFiles()).catch(() => undefined);
    await finish({ status: "error", error: "This request cannot run as a job." });
    log("job", job.id, "refused: not an allowed request");
    return "ok";
  }
  try {
    const loaded = await load(sb, job.user_id, scopeOf(path));
    log("job", job.id, "loaded", `decks=${loaded.counts.decks}`, `sources=${loaded.counts.sources}`, `media=${loaded.counts.media}`);

    let payload: string | Buffer | undefined;
    const headers: Record<string, string> = {};
    if (req.files?.length) {
      const parts: Part[] = Object.entries(req.fields ?? {}).map(([field, value]) => ({ field, value: String(value) }));
      for (const f of req.files) {
        // A job may only hand over files from its owner's own inbox folder.
        if (!f.path.startsWith(job.user_id + "/") || f.path.split("/").some((s) => !s || s === "." || s === "..")) throw new Error("foreign_file");
        parts.push({ field: f.field || "file", value: await sb.download("sc-inbox", f.path), filename: f.name, type: f.type });
      }
      const mp = multipartBody(parts);
      payload = mp.body;
      headers["content-type"] = mp.contentType;
    } else if (req.body !== undefined && method !== "GET") {
      payload = JSON.stringify(req.body);
      headers["content-type"] = "application/json";
    }

    const res = await app.inject({ method: method as "GET", url: path, headers, payload });
    const result: JobResult = { status: res.statusCode };
    const type = String(res.headers["content-type"] ?? "");
    if (type.includes("application/json")) result.body = res.json();
    else if (res.rawPayload.length) {
      const name = fileName(res.headers["content-disposition"] as string | undefined, "slidecraft-export");
      const objectPath = `${job.user_id}/${job.id}/${name}`;
      await sb.upload("sc-exports", objectPath, res.rawPayload, type.split(";")[0] || "application/octet-stream");
      result.file = { bucket: "sc-exports", path: objectPath, name, type: type.split(";")[0], bytes: res.rawPayload.length };
    }
    if (res.statusCode < 300) result.work = await waitForWork(sb, job, started);

    const wrote = await flush(sb, loaded);
    if (req.files?.length) await sb.removeFiles("sc-inbox", req.files.map((f) => f.path)).catch(() => undefined);
    // The work is saved by now: a dropped write of the status must not turn it into a failure that re-runs it.
    // Left as running after three tries, the sweep marks it; the deck is in the store either way.
    for (let attempt = 0; ; attempt++) {
      try {
        await finish({ status: "done", result, error: null });
        break;
      } catch (e) {
        if (attempt >= 2) {
          log("job", job.id, "saved but its status could not be written", (e as Error).name);
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    log("job", job.id, "done", `http=${res.statusCode}`, `work=${result.work?.status ?? "-"}`, `+${wrote.added}`, `~${wrote.changed}`, `-${wrote.removed}`, `files=${wrote.files}`, `merged=${wrote.merged}`, `${((Date.now() - started) / 1000).toFixed(1)}s`);
    return "ok";
  } catch (e) {
    // A failed job's uploads are someone's confidential sources: they do not wait in the inbox for ever.
    const own = ownFiles();
    if (own.length) await sb.removeFiles("sc-inbox", own).catch(() => undefined);
    const code = (e as Error).message === "time_limit" ? "It took longer than the worker allows and was stopped. Try again, or with fewer sources." : "The worker could not finish this. Try again.";
    await finish({ status: "error", error: code }).catch(() => undefined);
    // The error's class only: its message may quote content.
    log("job", job.id, "failed", (e as Error).name, ["time_limit", "foreign_file", "unsafe_path", "deck_busy"].includes((e as Error).message) ? (e as Error).message : "");
    return (e as Error).message === "time_limit" ? "abandoned" : "ok";
  } finally {
    clearDisk();
  }
}

/** Marks jobs a crashed or cancelled run left as running. */
export async function sweepStale(sb: Supabase, olderThanMs = LIMIT_MS + 5 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  // Finished jobs the page has long since read: their request bodies (a brief, a question) need not stay.
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  await sb.remove("sc_jobs", { status: "in.(done,error)", updated_at: `lt.${encodeURIComponent(day)}` }).catch(() => undefined);
  // Exports nobody downloaded and uploads whose job never ran: a day is longer than any of them is needed.
  for (const bucket of ["sc-exports", "sc-inbox"]) await sb.removeOlderThan(bucket, day).catch(() => undefined);
  const rows = await sb.update("sc_jobs", { status: "eq.running", started_at: `lt.${encodeURIComponent(cutoff)}` }, { status: "error", error: "The worker stopped before finishing. Try again." });
  return rows.length;
}

/**
 * Every pending job, oldest first, until none is left or the run's time is up. With idleMs, the run
 * stays warm that long after its last job, checking every 2 seconds: the next question, Studio output
 * or slide rewrite then starts at once instead of waiting for a new runner to install and build.
 */
export async function drain(app: FastifyInstance, sb: Supabase, budgetMs = 35 * 60_000, idleMs = 0): Promise<number> {
  const start = Date.now();
  let n = 0;
  let lastWork = Date.now();
  const swept = await sweepStale(sb);
  if (swept) log("marked", swept, "stale job(s) as failed");
  while (Date.now() - start < budgetMs) {
    const [job] = (await sb.select("sc_jobs", { status: "eq.pending" }, { order: "created_at.asc", limit: 1 })) as unknown as JobRow[];
    if (!job) {
      if (Date.now() - lastWork >= idleMs) break;
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    lastWork = Date.now();
    if (job.attempts >= 2) {
      await sb.update("sc_jobs", { id: eq(job.id) }, { status: "error", error: "The worker could not finish this. Try again." });
      continue;
    }
    if (!(await claim(sb, job))) continue;
    log("job", job.id, "claimed", job.kind);
    const outcome = await runJob(app, sb, job);
    lastWork = Date.now();
    n++;
    if (outcome === "abandoned") {
      log("stopping: a job's background work outlived its time limit");
      break;
    }
  }
  return n;
}
