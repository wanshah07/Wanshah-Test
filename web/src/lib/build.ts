// Which build this page is, and whether the site has a newer one. A tab kept open across a deploy keeps
// running the bundle it loaded, and a plain reload can serve a cached index.html for a while longer: the
// crash on 1 Oct 2026 was fixed and deployed, and a tab still showed it an hour later.

const BASE = import.meta.env.BASE_URL || "/";

/** The bundle this page runs, by the file name Vite hashed into index.html. */
export function thisBuild(): string {
  const s = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).map((x) => x.src).find((x) => /\/assets\/index-[^/]+\.js$/.test(x));
  return s ? s.replace(/.*\/assets\//, "") : "";
}

/** The bundle the site serves now, fetched past every cache; "" when it cannot be read. */
export async function servedBuild(): Promise<string> {
  try {
    const res = await fetch(`${BASE}index.html?check=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return "";
    const m = /\/assets\/(index-[^/"']+\.js)/.exec(await res.text());
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

/** True when the site has moved on from the bundle this tab runs. */
export async function newerBuildExists(): Promise<boolean> {
  const mine = thisBuild();
  const served = await servedBuild();
  return !!mine && !!served && mine !== served;
}

/** Reloads past the cache: a fresh index.html, same route. */
export function hardReload(): void {
  const u = new URL(location.href);
  u.searchParams.set("v", String(Date.now()));
  location.replace(u.toString());
}
