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
    // Tokens read off a clinical benchmark deck: navy titles, brand blue against grey comparators.
    id: "clinical-evidence",
    name: "Clinical Evidence",
    fontDisplay: "Cambria",
    fontBody: "Calibri",
    radius: 8,
    slideNumbers: true,
    colors: {
      bg: "#F8FAFC",
      surface: "#FFFFFF",
      ink: "#1F2937",
      ink2: "#4B5563",
      muted: "#6B7280",
      line: "#E5E7EB",
      brand: "#479CDF",
      brandDeep: "#0F2B4C",
      accent: "#D97706",
      gold: "#15803D",
    },
    series: ["#479CDF", "#9CA3AF", "#D97706", "#15803D", "#0F2B4C"],
    slideStyle: "clean",
    darkTitle: true,
    kpiStyle: "tiles",
  },
  {
    // A bright training and booth deck: capital titles, many accents, ring gauges.
    id: "booth-bright",
    name: "Booth Bright",
    fontDisplay: "Aptos",
    fontBody: "Aptos",
    radius: 20,
    slideNumbers: true,
    colors: {
      bg: "#F4F9FE",
      surface: "#FFFFFF",
      ink: "#0B2D4D",
      ink2: "#50697F",
      muted: "#8FA2B3",
      line: "#E4EEF6",
      brand: "#2E8BD6",
      brandDeep: "#0B2D4D",
      accent: "#F0A32B",
      gold: "#0E9E8A",
    },
    series: ["#2E8BD6", "#0E9E8A", "#F0A32B", "#6F5AE0", "#F2664F", "#8FA2B3"],
    slideStyle: "gradient",
    upperTitles: true,
    darkTitle: true,
    kpiStyle: "rings",
  },
  {
    // An aesthetic clinical deck: burgundy title slides, rose accents.
    id: "rose-aesthetic",
    name: "Rose Aesthetic",
    fontDisplay: "Arial",
    fontBody: "Calibri",
    radius: 24,
    slideNumbers: true,
    colors: {
      bg: "#FFF5F8",
      surface: "#FFFFFF",
      ink: "#3B1220",
      ink2: "#7B4A5C",
      muted: "#A98090",
      line: "#FFE3EC",
      brand: "#E4708A",
      brandDeep: "#3B1220",
      accent: "#C9506B",
      gold: "#F2A9BF",
    },
    series: ["#E4708A", "#C9506B", "#F2A9BF", "#7B4A5C", "#A98090"],
    slideStyle: "gradient",
    darkTitle: true,
    kpiStyle: "rings",
  },
  {
    // A post-mortem or audit report: navy title slides, one colour per segment.
    id: "audit-report",
    name: "Audit Report",
    fontDisplay: "Cambria",
    fontBody: "Calibri",
    radius: 12,
    slideNumbers: true,
    colors: {
      bg: "#F5F8FC",
      surface: "#FFFFFF",
      ink: "#1B2533",
      ink2: "#5B6B80",
      muted: "#8A97A8",
      line: "#C9D6EA",
      brand: "#2A6FDB",
      brandDeep: "#0B2D63",
      accent: "#2E9E6A",
      gold: "#D9822B",
    },
    series: ["#2A6FDB", "#2E9E6A", "#D9822B", "#7A4FD0", "#B8336A", "#E8174B"],
    slideStyle: "clean",
    darkTitle: true,
    kpiStyle: "tiles",
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
  {
    // The house design system: dark cover and close around light content slides, teal for numbers and
    // arrows, amber eyebrows, a teal pull-quote band, 22 px cards on a soft white-to-tint wash.
    id: "house",
    name: "Teal Explainer",
    fontDisplay: "Arial",
    fontBody: "Calibri",
    fontQuote: "Cambria",
    radius: 22,
    slideNumbers: true,
    colors: {
      bg: "#FFFFFF",
      surface: "#FFFFFF",
      ink: "#0B1B3A",
      ink2: "#44546A",
      muted: "#6B7A8F",
      line: "#DCE8EC",
      brand: "#0D9488",
      brandDeep: "#16305E",
      accent: "#D97706",
      gold: "#C2410C",
    },
    series: ["#0D9488", "#D97706", "#16305E", "#14B8A6", "#C2410C"],
    slideStyle: "bloom",
    darkTitle: true,
    kpiStyle: "tiles",
  },
  {
    // The briefing look: a navy serif title on white, content on pale blue panels with no border, big
    // figures each in its own colour, navy table headers, green and red for say and don't, a navy
    // cover and a navy next-steps close. Built from a data debrief deck Wan held up as the standard.
    id: "briefing",
    name: "Navy Briefing",
    fontDisplay: "Cambria",
    fontBody: "Calibri",
    fontQuote: "Cambria",
    radius: 14,
    slideNumbers: false,
    colors: {
      bg: "#FFFFFF",
      surface: "#EAF1FB",
      ink: "#1B2533",
      ink2: "#3D4A5C",
      muted: "#5B6B80",
      line: "#C9D6EA",
      brand: "#2A6FDB",
      brandDeep: "#0B2D63",
      accent: "#E8174B",
      gold: "#D4A017",
    },
    series: ["#2A6FDB", "#0B2D63", "#2E9E6A", "#D9822B", "#7A4FD0", "#0E9F8E", "#B8336A", "#E8174B"],
    slideStyle: "briefing",
    darkTitle: true,
    kpiStyle: "tiles",
  },
];

/**
 * How each built-in design is used, for the writer: which devices it leans on
 * and its habits. The theme itself (colours, fonts, capitals, dark title slides,
 * ring gauges) is applied by the renderer, so those never depend on the writer.
 */
export const THEME_GUIDES: Record<string, string> = {
  briefing:
    "Data briefing for an internal team or a client. Navy cover with the headline figures as a hero row (kpi on the title slide). Every content slide's title states the finding and carries its number ('Two ingredients took 91% of the segment'). Fill the slide with one dominant visual: a funnel for how the numbers were reduced, number tiles for who took part, a doughnut for shares, a highlighted bar chart for a ranking, a table with verdict cells for the detail, numbered cards for what was learned. Pair a chart or table with one aside that tells the reader how to read it, and a navy callout for the line to repeat. Every slide that shows a number carries its source line. Include a two-column slide of what the data can and cannot tell us, and a Say / Don't say two-column when the figures will be quoted. Close on navy with 3 to 5 numbered next steps.",
  house:
    "The house design system: dark cover and closing slides around light content slides. Every content slide carries an amber UPPERCASE eyebrow (kicker) and a one-line statement title. Vary the layout slide to slide: icon rows of 3 to 5 cards, flows, timelines, equations, before and after as two columns, number tiles, fact sheets, tables with side panels. Most content slides end on the plain-language callout the audience will repeat. The closing slide is a 2-line statement, an italic message as its subtitle, and 4 short takeaways as its bullets.",
  "clinical-evidence":
    "Evidence deck for healthcare professionals. Calm and dense. Horizontal bar charts that show our product in the brand colour against grey comparators (set chart.highlight to our product's category). A verdict badge beside the title wherever the slide judges (DIRECT, PARTIAL, NO CLAIM). Reading and Watch-outs side panels beside charts and tables. Evidence tables with verdict cells. One fact sheet per study: design, subjects, method, result (highlighted), rating, reference. A dark callout banner for the one line the reader must keep.",
  "booth-bright":
    "Training and booth deck. Short capital titles under a letter-spaced kicker. Figures as ring gauges. A mechanism map with the product in the centre and its benefits around it, with metric pills under it. Equation slides (number + measure + days + users = the claim) with a dark callout banner. Three-step flows. A hero row of 3 or 4 stats on the title slide. Checklists as numbered cards. Picture galleries of the products.",
  "rose-aesthetic":
    "Aesthetic clinical deck. Dark title and results slides. Big stat tiles and ring gauges for results. A timeline for the study weeks. Before and after picture galleries. The routine as a numbered flow. The mechanism as a 4-step flow or a mechanism map. At most one chart, clustered columns.",
  "audit-report":
    "Post-mortem or audit report. Dark title slides. A funnel of big numbers for the drop-off. A doughnut of shares with the channels listed. Stat tiles. Tables with verdict colours. A numbered pipeline as a flow. Picture galleries with captions for the audit evidence. Segment charts, each with one summary tile. A verdict badge on each finding.",
};

export function themeGuide(id: string | undefined): string | undefined {
  return id ? THEME_GUIDES[id] : undefined;
}

/** The design a new deck starts in when the person has not chosen a default. */
export const DEFAULT_THEME_ID = "briefing";

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

/** A light, saturated version of a colour, for the second line of a title on a dark slide. */
export function glowOf(hex: string): string {
  // The house teal's glow is the one the design system names.
  if (/^#?0D9488$/i.test(hex.trim())) return "#5EEAD4";
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#5EEAD4";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  // The glow keeps the hue, as bright as a pale neon.
  const s = 0.78, l = 0.64;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), o = l - c / 2;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [rr, gg, bb].map((v) => Math.round((v + o) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

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
  const fams = Array.from(new Set([theme.fontDisplay, theme.fontBody, theme.fontQuote].filter((x): x is string => !!x).map(webFont)));
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

const COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const STYLES = ["clean", "panel", "gradient", "bloom", "briefing"];

/**
 * A theme safe to write into a style attribute, a class and a PPTX colour:
 * every colour a hex value, the radius a number, the style one of the three.
 * Anything else falls back to the preset the theme names (or the first).
 */
export function sanitizeTheme(raw: unknown): Theme {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<Theme> & Record<string, unknown>;
  const base = themePreset(typeof t.id === "string" ? t.id : "");
  const colours = (t.colors && typeof t.colors === "object" ? t.colors : {}) as Record<string, unknown>;
  const colors = { ...base.colors };
  for (const k of Object.keys(colors) as (keyof Theme["colors"])[]) {
    const v = colours[k];
    if (typeof v === "string" && COLOUR.test(v.trim())) colors[k] = v.trim();
  }
  const font = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.replace(/[^\p{L}\p{N} .,'-]/gu, "").trim().slice(0, 60) || fallback : fallback);
  const radius = Number(t.radius);
  const out: Theme = {
    id: typeof t.id === "string" && t.id ? t.id.slice(0, 60) : base.id,
    name: typeof t.name === "string" && t.name.trim() ? t.name.trim().slice(0, 80) : base.name,
    fontDisplay: font(t.fontDisplay, base.fontDisplay),
    fontBody: font(t.fontBody, base.fontBody),
    colors,
    radius: Number.isFinite(radius) ? Math.max(0, Math.min(80, radius)) : base.radius,
    slideStyle: STYLES.includes(String(t.slideStyle)) ? (t.slideStyle as Theme["slideStyle"]) : base.slideStyle,
    slideNumbers: typeof t.slideNumbers === "boolean" ? t.slideNumbers : base.slideNumbers,
  };
  if (typeof t.footer === "string" && t.footer.trim()) out.footer = t.footer.slice(0, 160);
  if (typeof t.logoMediaId === "string" && /^[\w-]{1,80}$/.test(t.logoMediaId)) out.logoMediaId = t.logoMediaId;
  if (typeof t.logoUrl === "string" && /^https?:\/\//i.test(t.logoUrl)) out.logoUrl = t.logoUrl.slice(0, 2000);
  if (typeof t.tag === "string" && t.tag.trim()) out.tag = t.tag.replace(/[<>]/g, "").trim().slice(0, 80);
  // A preset's extras carry over when a saved theme does not say otherwise.
  const series = Array.isArray(t.series) ? t.series : base.series;
  if (Array.isArray(series)) {
    const ok = series.filter((x): x is string => typeof x === "string" && COLOUR.test(x.trim())).map((x) => x.trim()).slice(0, 8);
    if (ok.length) out.series = ok;
  }
  const flag = (v: unknown, fallback: boolean | undefined) => (typeof v === "boolean" ? v : fallback);
  const upper = flag(t.upperTitles, base.upperTitles);
  if (upper !== undefined) out.upperTitles = upper;
  const dark = flag(t.darkTitle, base.darkTitle);
  if (dark !== undefined) out.darkTitle = dark;
  const ks = t.kpiStyle === "tiles" || t.kpiStyle === "rings" ? t.kpiStyle : base.kpiStyle;
  if (ks) out.kpiStyle = ks;
  const fq = typeof t.fontQuote === "string" ? font(t.fontQuote, "") : base.fontQuote;
  if (fq) out.fontQuote = fq;
  return out;
}
