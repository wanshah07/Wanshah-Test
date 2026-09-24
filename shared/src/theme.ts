import type { Theme, ThemeColors } from "./deck.js";

// Tokens read off my.facerinna.com on 24 Sep 2026: Fraunces for display,
// Inter for body, brand #4898D8 on ink #1D344E, 20px radius.
export const FACERINNA_LIGHT: ThemeColors = {
  bg: "#EFF5FA",
  surface: "#FFFFFF",
  ink: "#1D344E",
  ink2: "#52697F",
  muted: "#8299AD",
  line: "#D9E5F1",
  brand: "#4898D8",
  brandDeep: "#2E7CBE",
  accent: "#0E9AA3",
  gold: "#C9A24B",
};

export const FACERINNA_DARK: ThemeColors = {
  bg: "#0B1620",
  surface: "#141A2E",
  ink: "#F1F5FB",
  ink2: "#C6D4E8",
  muted: "#9BADC7",
  line: "#2A3650",
  brand: "#4898D8",
  brandDeep: "#7FC4F2",
  accent: "#3FA6EE",
  gold: "#C9A24B",
};

const base = {
  fontDisplay: "Fraunces",
  fontBody: "Inter",
  radius: 28,
  slideNumbers: true,
} as const;

export const THEME_PRESETS: Theme[] = [
  {
    id: "facerinna",
    name: "Facerinna (light)",
    ...base,
    colors: FACERINNA_LIGHT,
    slideStyle: "panel",
  },
  {
    id: "facerinna-dark",
    name: "Facerinna (dark)",
    ...base,
    colors: FACERINNA_DARK,
    slideStyle: "gradient",
  },
  {
    id: "regulab",
    name: "ws.regulab",
    ...base,
    fontDisplay: "Fraunces",
    fontBody: "Inter",
    colors: {
      bg: "#F4F7F5",
      surface: "#FFFFFF",
      ink: "#0A3822",
      ink2: "#3D5A4A",
      muted: "#7A8F84",
      line: "#D6E2DB",
      brand: "#1B7F4B",
      brandDeep: "#0F5A34",
      accent: "#C9A24B",
      gold: "#C9A24B",
    },
    slideStyle: "clean",
  },
  {
    id: "clinical",
    name: "Clinical",
    ...base,
    fontDisplay: "Inter",
    fontBody: "Inter",
    radius: 12,
    colors: {
      bg: "#FFFFFF",
      surface: "#F6F8FB",
      ink: "#10222F",
      ink2: "#3E5366",
      muted: "#7D8FA1",
      line: "#E3E8EF",
      brand: "#2E7CBE",
      brandDeep: "#16324F",
      accent: "#E85B5B",
      gold: "#E8A13B",
    },
    slideStyle: "clean",
  },
  {
    id: "mono",
    name: "Mono",
    ...base,
    fontDisplay: "Fraunces",
    fontBody: "Inter",
    radius: 0,
    colors: {
      bg: "#FFFFFF",
      surface: "#F4F4F4",
      ink: "#111111",
      ink2: "#444444",
      muted: "#888888",
      line: "#DDDDDD",
      brand: "#111111",
      brandDeep: "#000000",
      accent: "#C9A24B",
      gold: "#C9A24B",
    },
    slideStyle: "clean",
  },
];

export function themePreset(id: string): Theme {
  const t = THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
  return JSON.parse(JSON.stringify(t)) as Theme;
}

/** Google Fonts URL for a theme's two families. Returns "" when both are system fonts. */
export function fontsUrl(theme: Theme): string {
  const fams = Array.from(new Set([theme.fontDisplay, theme.fontBody].filter(Boolean)));
  const known: Record<string, string> = {
    Fraunces: "Fraunces:opsz,wght@9..144,400;500;600;700",
    Inter: "Inter:wght@300;400;500;600;700",
    "Playfair Display": "Playfair+Display:wght@400;600;700",
    Lora: "Lora:wght@400;500;600;700",
    "Source Serif 4": "Source+Serif+4:opsz,wght@8..60,400;600;700",
    "IBM Plex Sans": "IBM+Plex+Sans:wght@300;400;500;600;700",
    Manrope: "Manrope:wght@300;400;500;600;700;800",
    "DM Sans": "DM+Sans:opsz,wght@9..40,400;500;600;700",
    Poppins: "Poppins:wght@300;400;500;600;700",
  };
  const parts = fams.map((f) => known[f]).filter(Boolean);
  if (!parts.length) return "";
  return `https://fonts.googleapis.com/css2?${parts.map((p) => "family=" + p).join("&")}&display=swap`;
}

export const FONT_CHOICES = [
  "Fraunces",
  "Inter",
  "Playfair Display",
  "Lora",
  "Source Serif 4",
  "IBM Plex Sans",
  "Manrope",
  "DM Sans",
  "Poppins",
  "Georgia",
  "system-ui",
];
