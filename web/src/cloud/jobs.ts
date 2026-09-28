import { sb } from "./client";

// Work the page cannot do itself goes to the worker in GitHub Actions: the
// page queues a row in sc_jobs and watches it. A job's result is the HTTP
// answer the server gave, so callers treat it like a fetch response.

export interface JobRequest {
  method: string;
  path: string;
  body?: unknown;
  fields?: Record<string, string>;
  files?: { field: string; name: string; path: string; type?: string }[];
}

export interface JobRow {
  id: string;
  deck_id: string | null;
  kind: string;
  status: "pending" | "running" | "done" | "error";
  progress: { status?: string; progress?: string[] } | null;
  result: { status: number; body?: unknown; file?: { bucket: string; path: string; name: string; type: string; bytes: number }; work?: { id: string; kind: string; status: string; error: string | null; result: unknown } } | null;
  error: string | null;
}

export async function queueJob(req: JobRequest, kind: string, deckId: string | null): Promise<string> {
  const { data, error } = await sb().from("sc_jobs").insert({ kind, deck_id: deckId, request: req }).select("id").single();
  if (error || !data) throw new Error(error?.message || "The job could not be queued.");
  return String(data.id);
}

export async function readJob(id: string): Promise<JobRow | null> {
  const { data } = await sb().from("sc_jobs").select("id, deck_id, kind, status, progress, result, error").eq("id", id).maybeSingle();
  return (data as JobRow | null) ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls a job until `done` says stop, or 35 minutes pass (the worker's own limit is shorter). */
export async function watchJob(id: string, done: (j: JobRow) => boolean, everyMs = 2000): Promise<JobRow> {
  const until = Date.now() + 35 * 60_000;
  for (;;) {
    const j = await readJob(id);
    if (j && done(j)) return j;
    if (Date.now() > until) throw new Error("The worker did not pick this up. Check the Worker workflow in GitHub Actions, then try again.");
    await sleep(everyMs);
  }
}

export const finished = (j: JobRow) => j.status === "done" || j.status === "error";
