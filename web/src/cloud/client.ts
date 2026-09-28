import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The build decides where Slidecraft keeps its data. With VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY set (the GitHub Pages build), the page reads and
// writes Supabase directly and hands heavy work to the worker; without them it
// talks to the Node server as before. The anon key is public by design: row
// level security (supabase/002_rls.sql) is what protects the data.

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

export const cloud = !!(url && anon);

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!cloud) throw new Error("Supabase is not configured for this build");
  client ??= createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "slidecraft-auth" } });
  return client;
}

/** A link inside the app: a hash route on GitHub Pages, a plain path on the server. */
export function appHref(path: string): string {
  return cloud ? `#${path}` : path;
}
