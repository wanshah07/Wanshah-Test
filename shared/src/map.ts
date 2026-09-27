import type { MapRegion } from "./deck.js";

// A tile map: every country one square, placed where it sits on a real map,
// so a status map reads at a glance and draws the same in the browser and in
// PowerPoint (plain shapes, no map data, no licence). Positions are columns
// and rows on one world grid; a region shows its own part of it.

export interface MapTile {
  code: string;
  name: string;
  nameMs: string;
  col: number;
  row: number;
}

export const MAP_TILES: MapTile[] = [
  { code: "CA", name: "Canada", nameMs: "Kanada", col: 1, row: 0 },
  { code: "US", name: "United States", nameMs: "Amerika Syarikat", col: 1, row: 1 },
  { code: "MX", name: "Mexico", nameMs: "Mexico", col: 1, row: 2 },
  { code: "BR", name: "Brazil", nameMs: "Brazil", col: 2, row: 4 },
  { code: "UK", name: "United Kingdom", nameMs: "United Kingdom", col: 4, row: 0 },
  { code: "EU", name: "European Union", nameMs: "Kesatuan Eropah", col: 5, row: 1 },
  { code: "TR", name: "Türkiye", nameMs: "Türkiye", col: 6, row: 1 },
  { code: "GCC", name: "Gulf states", nameMs: "Negara Teluk", col: 6, row: 2 },
  { code: "ZA", name: "South Africa", nameMs: "Afrika Selatan", col: 5, row: 5 },
  { code: "IN", name: "India", nameMs: "India", col: 8, row: 2 },
  { code: "CN", name: "China", nameMs: "China", col: 10, row: 1 },
  { code: "KR", name: "South Korea", nameMs: "Korea Selatan", col: 11, row: 1 },
  { code: "JP", name: "Japan", nameMs: "Jepun", col: 12, row: 1 },
  { code: "HK", name: "Hong Kong", nameMs: "Hong Kong", col: 10, row: 2 },
  { code: "TW", name: "Taiwan", nameMs: "Taiwan", col: 11, row: 2 },
  { code: "MM", name: "Myanmar", nameMs: "Myanmar", col: 9, row: 3 },
  { code: "LA", name: "Laos", nameMs: "Laos", col: 10, row: 3 },
  { code: "VN", name: "Vietnam", nameMs: "Vietnam", col: 11, row: 3 },
  { code: "TH", name: "Thailand", nameMs: "Thailand", col: 9, row: 4 },
  { code: "KH", name: "Cambodia", nameMs: "Kemboja", col: 10, row: 4 },
  { code: "PH", name: "Philippines", nameMs: "Filipina", col: 12, row: 4 },
  { code: "MY", name: "Malaysia", nameMs: "Malaysia", col: 9, row: 5 },
  { code: "BN", name: "Brunei", nameMs: "Brunei", col: 11, row: 5 },
  { code: "SG", name: "Singapore", nameMs: "Singapura", col: 9, row: 6 },
  { code: "ID", name: "Indonesia", nameMs: "Indonesia", col: 10, row: 6 },
  { code: "TL", name: "Timor-Leste", nameMs: "Timor-Leste", col: 11, row: 6 },
  { code: "AU", name: "Australia", nameMs: "Australia", col: 11, row: 7 },
  { code: "NZ", name: "New Zealand", nameMs: "New Zealand", col: 12, row: 7 },
];

const ASEAN = ["MM", "LA", "VN", "TH", "KH", "PH", "MY", "BN", "SG", "ID", "TL"];
const ASIA = [...ASEAN, "IN", "CN", "KR", "JP", "HK", "TW", "AU", "NZ"];

export const MAP_REGIONS: { id: MapRegion; label: string }[] = [
  { id: "asean", label: "ASEAN" },
  { id: "asia", label: "Asia Pacific" },
  { id: "world", label: "World" },
];

/** Names a model or a person might write for a tile, mapped to its code. */
const ALIASES: Record<string, string> = {
  GB: "UK", "UNITED KINGDOM": "UK", BRITAIN: "UK", ENGLAND: "UK",
  "EUROPEAN UNION": "EU", EUROPE: "EU", EROPAH: "EU",
  USA: "US", "UNITED STATES": "US", AMERICA: "US", "AMERIKA SYARIKAT": "US",
  KOREA: "KR", "SOUTH KOREA": "KR", "KOREA SELATAN": "KR",
  JAPAN: "JP", JEPUN: "JP", CHINA: "CN", INDIA: "IN", TAIWAN: "TW", "HONG KONG": "HK",
  MALAYSIA: "MY", SINGAPORE: "SG", SINGAPURA: "SG", INDONESIA: "ID", THAILAND: "TH", VIETNAM: "VN", "VIET NAM": "VN",
  PHILIPPINES: "PH", FILIPINA: "PH", BRUNEI: "BN", "BRUNEI DARUSSALAM": "BN", CAMBODIA: "KH", KEMBOJA: "KH",
  LAOS: "LA", "LAO PDR": "LA", MYANMAR: "MM", "TIMOR-LESTE": "TL", "TIMOR LESTE": "TL", "EAST TIMOR": "TL",
  AUSTRALIA: "AU", "NEW ZEALAND": "NZ", CANADA: "CA", KANADA: "CA", MEXICO: "MX", BRAZIL: "BR",
  "SOUTH AFRICA": "ZA", "AFRIKA SELATAN": "ZA", TURKEY: "TR", "TÜRKIYE": "TR", TURKIYE: "TR",
  GULF: "GCC", "GULF STATES": "GCC", "SAUDI ARABIA": "GCC", SA: "GCC", UAE: "GCC", AE: "GCC", "NEGARA TELUK": "GCC",
};

/** The tile code for a code or a country name, or null when it is not on the map. */
export function mapCode(raw: string): string | null {
  const k = raw.trim().toUpperCase();
  if (MAP_TILES.some((t) => t.code === k)) return k;
  return ALIASES[k] ?? null;
}

/**
 * The tiles a map draws: the region's own, plus any country the map names
 * from outside it (a UK row on an ASEAN map still shows).
 */
export function mapTiles(region: MapRegion, codes: string[] = []): MapTile[] {
  const base = region === "world" ? MAP_TILES.map((t) => t.code) : region === "asia" ? ASIA : ASEAN;
  const want = new Set([...base, ...codes]);
  return MAP_TILES.filter((t) => want.has(t.code));
}

/** The grid the tiles span, shifted to start at 0,0. */
export function mapGrid(tiles: MapTile[]): { cols: number; rows: number; at: (t: MapTile) => { col: number; row: number } } {
  const c0 = Math.min(...tiles.map((t) => t.col));
  const r0 = Math.min(...tiles.map((t) => t.row));
  const cols = Math.max(...tiles.map((t) => t.col)) - c0 + 1;
  const rows = Math.max(...tiles.map((t) => t.row)) - r0 + 1;
  return { cols, rows, at: (t) => ({ col: t.col - c0, row: t.row - r0 }) };
}

export function tileName(code: string, lang: "en" | "ms"): string {
  const t = MAP_TILES.find((x) => x.code === code);
  return t ? (lang === "ms" ? t.nameMs : t.name) : code;
}
