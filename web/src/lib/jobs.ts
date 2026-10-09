import { useSyncExternalStore } from "react";
import { api, type Job } from "../api";
import { toast } from "../components/Toast";

// A deck being written keeps being written wherever the person goes. The job runs on the server (or the
// worker), never in a page, so leaving a page cannot stop it; what leaving a page used to stop was the
// page's own polling, so the progress vanished and a finished deck went unnoticed. The tracker below owns
// the polling instead: it lives outside every page, keeps the running jobs in the browser's storage so a
// reload resumes them, and tells the person when one finishes. A page that started a job may watch it too,
// for its own progress panel and for what it does when the job ends; when that page is gone the tracker
// says so itself.

export interface Tracked {
  jobId: string;
  deckId: string;
  title: string;
  startedAt: number;
  job: Job | null;
  /** The person has seen how it ended, or does not need to: it is not offered again. */
  dismissed: boolean;
}

export interface Watcher {
  /** Every poll, with the job as the server last described it. */
  onUpdate?: (j: Job) => void;
  /** The job finished and the deck is ready. Only called while the page that asked is still open. */
  onDone?: (j: Job) => void;
  /** The job failed. Only called while the page that asked is still open. */
  onFailed?: (j: Job) => void;
}

const KEY = "sc-bg-jobs";
/** A job older than this is not resumed after a reload: the worker's own limit is far shorter. */
const MAX_AGE_MS = 2 * 60 * 60_000;
const POLL_MS = 1500;
/** Dropped polls in a row before the tracker stops waiting: one is a blip, five is a lost connection. */
const MAX_MISSES = 5;

let jobs: Tracked[] = load();
let version = 0;
const listeners = new Set<() => void>();
const watchers = new Map<string, Watcher>();
const misses = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let polling = false;

function load(): Tracked[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as Tracked[];
    return raw.filter((t) => t && t.jobId && Date.now() - t.startedAt < MAX_AGE_MS);
  } catch {
    return [];
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs.map((t) => ({ ...t, job: t.job && { ...t.job, progress: t.job.progress.slice(-6) } }))));
  } catch {
    /* storage is a convenience: a blocked one only costs the resume after a reload */
  }
}

function emit(): void {
  version++;
  save();
  listeners.forEach((l) => l());
}

const isLive = (t: Tracked) => !t.job || t.job.status === "queued" || t.job.status === "running";

/** What a log line says, without the clock the server puts in front of it. */
export function lastLine(j: Job | null): string {
  const p = j?.progress ?? [];
  return (p[p.length - 1] ?? "").replace(/^\d\d:\d\d:\d\d\s+/, "");
}

/** Follows a job until it ends, whichever page is open. Returns a function that stops the page's own watching, not the job. */
export function trackJob(t: { jobId: string; deckId: string; title: string }, w?: Watcher): () => void {
  jobs = [{ jobId: t.jobId, deckId: t.deckId, title: t.title || "New deck", startedAt: Date.now(), job: null, dismissed: false }, ...jobs.filter((x) => x.jobId !== t.jobId)];
  if (w) watchers.set(t.jobId, w);
  emit();
  schedule(0);
  return () => {
    if (watchers.get(t.jobId) === w) watchers.delete(t.jobId);
    emit();
  };
}

/** A page that comes back to a deck still being written picks the job up again. */
export function attachJob(jobId: string, w: Watcher): () => void {
  watchers.set(jobId, w);
  const t = jobs.find((x) => x.jobId === jobId);
  if (t?.job) w.onUpdate?.(t.job);
  emit();
  return () => {
    if (watchers.get(jobId) === w) watchers.delete(jobId);
    emit();
  };
}

/** The deck's job that is still being written, if there is one. */
export function liveJobFor(deckId: string): Tracked | undefined {
  return jobs.find((t) => t.deckId === deckId && isLive(t));
}

export function dismissJob(jobId: string): void {
  jobs = jobs.filter((t) => t.jobId !== jobId);
  watchers.delete(jobId);
  misses.delete(jobId);
  emit();
}

/** The deck was opened: how its job ended no longer needs saying. */
export function dismissFinishedFor(deckId: string): void {
  const before = jobs.length;
  jobs = jobs.filter((t) => !(t.deckId === deckId && !isLive(t)));
  if (jobs.length !== before) emit();
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (jobs.some(isLive)) timer = setTimeout(() => void poll(), ms);
}

async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    for (const t of jobs.filter(isLive)) {
      let j: Job;
      try {
        j = await api.job(t.jobId);
        misses.set(t.jobId, 0);
      } catch (e) {
        const n = (misses.get(t.jobId) ?? 0) + 1;
        misses.set(t.jobId, n);
        if (n < MAX_MISSES) continue;
        // A lost connection is not a failed job: the deck may well have finished. Say that.
        j = { id: t.jobId, deckId: t.deckId, status: "failed", progress: t.job?.progress ?? [], error: `Lost track of the job: ${(e as Error).message}. Open the deck to see whether it finished.`, result: null };
      }
      settle(t.jobId, j);
    }
  } finally {
    polling = false;
    schedule(POLL_MS);
  }
}

function settle(jobId: string, j: Job): void {
  const now = jobs.find((x) => x.jobId === jobId);
  if (!now) return; // dismissed while the poll was in flight
  const was = now.job?.status;
  jobs = jobs.map((x) => (x.jobId === jobId ? { ...x, job: j } : x));
  emit();
  const w = watchers.get(jobId);
  w?.onUpdate?.(j);
  if (j.status !== "done" && j.status !== "failed") return;
  if (was === "done" || was === "failed") return; // handled once however many polls see it
  if (j.status === "done") void ready(jobId, w);
  else if (w?.onFailed) w.onFailed(j);
  else toast(`${now.title}: ${j.error || "the deck could not be written"}`, true);
}

async function ready(jobId: string, w: Watcher | undefined): Promise<void> {
  const t = jobs.find((x) => x.jobId === jobId);
  if (!t) return;
  // The writer may have chosen the title; the bar names the deck by it.
  const title = await api.deck(t.deckId).then((r) => r.deck.title).catch(() => "");
  if (title) {
    jobs = jobs.map((x) => (x.jobId === jobId ? { ...x, title } : x));
    emit();
  }
  const j = jobs.find((x) => x.jobId === jobId)?.job;
  if (w?.onDone && j) w.onDone(j);
  // The page that started it is still open and handled it; otherwise the tray says so.
  else toast(`Deck ready: ${title || t.title}. Open it from the bar at the bottom left.`);
}

// A tab opened again (or a reload) resumes whatever was still being written.
if (jobs.some(isLive)) schedule(0);

export function useTracked(): Tracked[] {
  useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, () => version);
  return jobs;
}

/** Whether a page is watching this job and so showing its progress itself. */
export const isWatched = (jobId: string) => watchers.has(jobId);
