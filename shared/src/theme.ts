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

/** Google Fonts family specs for the fonts Slidecraft can load in a browser. */
const GOOGLE: Record<string, string> = {
  Fraunces: "Fraunces:opsz,wght@9..144,400;500;600;700",
  Inter: "Inter:wght@300;400;500;600;700",
  "Playfair Display": "Playfair+Display:wght@400;600;700",
  Lora: "Lora:wght@400;500;600;700",
  "Source Serif 4": "Source+Serif+4:opsz,wght@8..60,400;600;700",
  "IBM Plex Sans": "IBM+Plex+Sans:wght@300;400;500;600;700",
  Manrope: "Manrope:wght@300;400;500;600;700;800",
  "DM Sans": "DM+Sans:opsz,wght@9..40,400;500;600;700",
  Poppins: "Poppins:wght@300;400;500;600;700",
  Montserrat: "Montserrat:wght@300;400;500;600;700",
  Roboto: "Roboto:wght@300;400;500;700",
  "Open Sans": "Open+Sans:wght@300;400;500;600;700",
  Lato: "Lato:wght@300;400;700",
  Raleway: "Raleway:wght@300;400;500;600;700",
  Nunito: "Nunito:wght@300;400;600;700",
  "Nunito Sans": "Nunito+Sans:wght@300;400;600;700",
  Merriweather: "Merriweather:wght@300;400;700",
  "Work Sans": "Work+Sans:wght@300;400;500;600;700",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@300;400;500;600;700",
  Outfit: "Outfit:wght@300;400;500;600;700",
  Carlito: "Carlito:wght@400;700",
  Caladea: "Caladea:wght@400;700",
  Arimo: "Arimo:wght@400;500;600;700",
  Tinos: "Tinos:wght@400;700",
  Cousine: "Cousine:wght@400;700",
};

/**
 * Office and system fonts a reference deck often uses, with the free font a
 * browser loads in their place. Carlito, Caladea, Arimo, Tinos and Cousine
 * have the same widths as the fonts they stand in for, so text wraps the same.
 * The theme keeps the real name, so the PPTX export asks PowerPoint for it.
 */
export const WEB_EQUIVALENT: Record<string, string> = {
  Calibri: "Carlito",
  "Calibri Light": "Carlito",
  Cambria: "Caladea",
  Arial: "Arimo",
  Helvetica: "Arimo",
  "Helvetica Neue": "Arimo",
  "Liberation Sans": "Arimo",
  "Times New Roman": "Tinos",
  Times: "Tinos",
  "Courier New": "Cousine",
  Aptos: "Inter",
  "Aptos Display": "Inter",
  "Segoe UI": "Inter",
  Verdana: "Arimo",
  Tahoma: "Arimo",
  "Century Gothic": "Montserrat",
  "Gill Sans": "Lato",
  "Gill Sans MT": "Lato",
  Garamond: "Lora",
  "Book Antiqua": "Lora",
  "Palatino Linotype": "Lora",
};

/** Every font name Slidecraft recognises, for matching a name read out of a file. */
export function knownFonts(): string[] {
  return Array.from(new Set([...Object.keys(GOOGLE), ...Object.keys(WEB_EQUIVALENT), ...FONT_CHOICES]));
}

function webFont(name: string): string {
  return GOOGLE[name] ? name : WEB_EQUIVALENT[name] ?? name;
}

/** CSS font-family value: the theme's font first, then the free stand-in a browser can load. */
export function fontStack(name: string): string {
  const clean = name.replace(/['"\\;{}]/g, "").trim();
  const web = webFont(clean);
  return web !== clean ? `'${clean}','${web}'` : `'${clean}'`;
}

/** Google Fonts URL for a theme's two families. Returns "" when both are system fonts. */
export function fontsUrl(theme: Theme): string {
  const fams = Array.from(new Set([theme.fontDisplay, theme.fontBody].filter(Boolean).map(webFont)));
  const parts = fams.map((f) => GOOGLE[f]).filter(Boolean);
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
  "Montserrat",
  "Roboto",
  "Open Sans",
  "Lato",
  "Raleway",
  "Nunito Sans",
  "Merriweather",
  "Work Sans",
  "Plus Jakarta Sans",
  "Outfit",
  "Calibri",
  "Cambria",
  "Arial",
  "Times New Roman",
  "Aptos",
  "Georgia",
  "system-ui",
];
