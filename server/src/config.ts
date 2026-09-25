import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Paths resolve from this file, not the working directory, so `npm start`
// from the repository root and `node dist/index.js` from server/ agree.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

function readDotEnv(): void {
  // Minimal .env loader so the app needs no dotenv dependency. Values already
  // in the environment win.
  for (const p of [path.resolve(process.cwd(), ".env"), path.resolve(repoRoot, ".env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
    break;
  }
}
readDotEnv();

const dataDir = path.resolve(process.env.DATA_DIR || path.join(repoRoot, "data"));

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "0.0.0.0",
  dataDir,
  dbPath: path.join(dataDir, "slidecraft.sqlite"),
  mediaDir: path.join(dataDir, "media"),
  sourcesDir: path.join(dataDir, "sources"),
  appSecret: process.env.APP_SECRET || "",
  authMode: (process.env.AUTH_MODE || "off") as "off" | "local",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1",
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
  openaiBase: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  mockLlm: process.env.MOCK_LLM === "1",
  /** Pause inside a mock generation, so progress is visible and a second request can be refused. */
  mockDelayMs: Number(process.env.MOCK_LLM_DELAY_MS || 0),
  /** Characters of source text sent to the writer in one call before condensing kicks in. */
  sourceBudget: Number(process.env.SOURCE_BUDGET || 90000),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 40) * 1024 * 1024,
  webDist: path.join(repoRoot, "web", "dist"),
  secure: process.env.COOKIE_SECURE === "1",
};

export function ensureDirs(): void {
  for (const d of [config.dataDir, config.mediaDir, config.sourcesDir]) fs.mkdirSync(d, { recursive: true });
}

export function requireSecret(): string {
  if (!config.appSecret || config.appSecret.length < 16 || config.appSecret === "change-me-to-a-long-random-string") {
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET must be set to a long random string in production");
    return "dev-only-secret-not-for-production-use";
  }
  return config.appSecret;
}
