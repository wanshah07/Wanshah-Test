export type AppTheme = "light" | "dark" | "system";

const KEY = "sc.appTheme";

export function readAppTheme(): AppTheme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

export function applyAppTheme(t: AppTheme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable */
  }
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function watchSystemTheme(): void {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (readAppTheme() === "system") applyAppTheme("system");
  });
}
