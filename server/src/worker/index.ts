import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The Slidecraft worker, run by .github/workflows/worker.yml: takes every
// pending job from Supabase and runs it with the server's own code. Needs
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; OPENAI_API_KEY and
// COMPOSIO_API_KEY are read by the code it runs.

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.log("[worker] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set; nothing to do.");
    return;
  }
  // Set before the server code is imported: its config is read once, at import.
  process.env.SC_WORKER = "1";
  process.env.AUTH_MODE = "off";
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-worker-"));
  process.env.APP_SECRET = crypto.randomBytes(32).toString("hex");

  const { buildApp } = await import("../index.js");
  const { Supabase } = await import("./supabase.js");
  const { drain, log } = await import("./run.js");
  const app = await buildApp();
  const n = await drain(app, new Supabase({ url, serviceKey: key }), Number(process.env.SC_RUN_BUDGET_MS || 35 * 60_000));
  log("ran", n, "job(s)");
  await app.close();
}

main().catch((e) => {
  console.error("[worker] stopped:", (e as Error).name, (e as Error).message.replace(/https?:\/\/\S+/g, "<url>").slice(0, 200));
  process.exit(1);
});
