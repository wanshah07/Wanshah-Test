import { sb } from "./client";

// Pictures live in the private sc-media bucket. The page shows them through
// short-lived signed links, made in one batch whenever a list of pictures is
// read, so the synchronous mediaUrl() the renderer calls can answer at once.

const urls = new Map<string, string>();
const HOURS = 12;

export function signedMediaUrl(id: string): string {
  return urls.get(id) ?? "";
}

export async function signMedia(rows: { id: string; object_path: string }[]): Promise<void> {
  const want = rows.filter((r) => r.object_path);
  if (!want.length) return;
  const { data, error } = await sb().storage.from("sc-media").createSignedUrls(want.map((r) => r.object_path), HOURS * 3600);
  if (error || !data) return;
  const byPath = new Map(want.map((r) => [r.object_path, r.id]));
  for (const d of data) {
    const id = d.path ? byPath.get(d.path) : undefined;
    if (id && d.signedUrl) urls.set(id, d.signedUrl);
  }
}

/** The picture's bytes as a data URI, for an HTML export that must carry its own pictures. */
export async function mediaDataUrl(id: string): Promise<string> {
  const u = urls.get(id);
  if (!u) return "";
  try {
    const blob = await (await fetch(u)).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve("");
      r.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}
