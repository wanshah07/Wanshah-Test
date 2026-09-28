/** An id in the server's own format (prefix, time, random), so rows made here and by the worker look alike. */
export function uid(prefix: string): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}${r}`;
}
