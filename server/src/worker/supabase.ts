// The few Supabase REST calls the worker makes, with the service role key.
// PostgREST for tables, the Storage API for files. No SDK: fetch is enough, and
// a test can stand in for the whole service with one small HTTP server.
//
// The service role key bypasses row level security, so every call that reads
// or writes a person's rows filters by their user id itself. Callers never pass
// a filter that leaves the owner out.

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
}

/**
 * An object path the worker may touch: plain segments only. `fetch` collapses "." and ".." in a URL, so
 * "<me>/../../sc-media/<someone>/x.png" would otherwise reach another person's file with the service key.
 */
export function safeObjectPath(p: string): string {
  if (typeof p !== "string" || !p || p.length > 500 || /[\\\u0000-\u001f]/.test(p) || p.startsWith("/") || p.split("/").some((s) => !s || s === "." || s === "..")) throw new Error("unsafe_path");
  return p;
}

export class SupabaseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Row = Record<string, unknown>;

/** A PostgREST filter value, quoted when it holds a character PostgREST treats as syntax. */
function lit(v: string): string {
  return /[,.:()"\s]/.test(v) ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v;
}

export function eq(v: string): string {
  return `eq.${encodeURIComponent(v)}`;
}

export function inList(values: string[]): string {
  return `in.(${values.map((v) => encodeURIComponent(lit(v))).join(",")})`;
}

export class Supabase {
  constructor(private readonly cfg: SupabaseConfig) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: this.cfg.serviceKey, Authorization: `Bearer ${this.cfg.serviceKey}`, ...extra };
  }

  private async call(method: string, path: string, init: { body?: string | Uint8Array; headers?: Record<string, string> } = {}): Promise<Response> {
    const res = await fetch(this.cfg.url.replace(/\/+$/, "") + path, { method, headers: this.headers(init.headers), body: init.body, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      // The message names the table or bucket and the status only: a response body can echo row content.
      await res.arrayBuffer().catch(() => undefined);
      throw new SupabaseError(`Supabase ${method} ${path.split("?")[0]} answered ${res.status}`, res.status);
    }
    return res;
  }

  /** Rows of a table. `filters` maps a column to a PostgREST filter such as eq(x) or inList(xs). */
  async select(table: string, filters: Record<string, string>, opts: { order?: string; limit?: number; columns?: string } = {}): Promise<Row[]> {
    const q = new URLSearchParams();
    q.set("select", opts.columns ?? "*");
    if (opts.order) q.set("order", opts.order);
    if (opts.limit) q.set("limit", String(opts.limit));
    const parts = [q.toString(), ...Object.entries(filters).map(([k, v]) => `${encodeURIComponent(k)}=${v}`)];
    const res = await this.call("GET", `/rest/v1/${table}?${parts.join("&")}`);
    return (await res.json()) as Row[];
  }

  async insert(table: string, rows: Row[]): Promise<void> {
    if (!rows.length) return;
    await this.call("POST", `/rest/v1/${table}`, { body: JSON.stringify(rows), headers: { "Content-Type": "application/json", Prefer: "return=minimal" } });
  }

  /** Updates the rows matching `filters` and returns them; an empty list means nothing matched. */
  async update(table: string, filters: Record<string, string>, patch: Row): Promise<Row[]> {
    const q = Object.entries(filters).map(([k, v]) => `${encodeURIComponent(k)}=${v}`).join("&");
    const res = await this.call("PATCH", `/rest/v1/${table}?${q}`, { body: JSON.stringify(patch), headers: { "Content-Type": "application/json", Prefer: "return=representation" } });
    return (await res.json()) as Row[];
  }

  async remove(table: string, filters: Record<string, string>): Promise<void> {
    const q = Object.entries(filters).map(([k, v]) => `${encodeURIComponent(k)}=${v}`).join("&");
    await this.call("DELETE", `/rest/v1/${table}?${q}`, { headers: { Prefer: "return=minimal" } });
  }

  async download(bucket: string, path: string): Promise<Buffer> {
    safeObjectPath(path);
    const res = await this.call("GET", `/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async upload(bucket: string, path: string, body: Buffer, contentType: string): Promise<void> {
    safeObjectPath(path);
    await this.call("POST", `/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      body: new Uint8Array(body),
      headers: { "Content-Type": contentType, "x-upsert": "true" },
    });
  }

  /** Files in a bucket's folders (one level: <user>/<file>) created before `iso`. */
  async listOlderThan(bucket: string, iso: string): Promise<string[]> {
    const list = async (prefix: string) => {
      const res = await this.call("POST", `/storage/v1/object/list/${bucket}`, { body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "created_at", order: "asc" } }), headers: { "Content-Type": "application/json" } });
      return (await res.json()) as { name: string; id: string | null; created_at?: string }[];
    };
    const out: string[] = [];
    for (const folder of await list("")) {
      if (folder.id) continue; // a file at the root: not ours
      for (const f of await list(folder.name)) if (f.id && f.created_at && f.created_at < iso) out.push(`${folder.name}/${f.name}`);
    }
    return out;
  }

  async removeOlderThan(bucket: string, iso: string): Promise<number> {
    const paths = await this.listOlderThan(bucket, iso);
    for (let i = 0; i < paths.length; i += 100) await this.removeFiles(bucket, paths.slice(i, i + 100));
    return paths.length;
  }

  async removeFiles(bucket: string, paths: string[]): Promise<void> {
    if (!paths.length) return;
    paths.forEach(safeObjectPath);
    await this.call("DELETE", `/storage/v1/object/${bucket}`, { body: JSON.stringify({ prefixes: paths }), headers: { "Content-Type": "application/json" } });
  }
}
