// Browser smoke run against a mock server: the wizard, the editor, the exports.
// Usage: node scripts/smoke.mjs   (needs a built web/dist and Playwright's Chromium)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const PORT = 8799;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-smoke-"));
const server = spawn("node", ["server/dist/index.js"], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, MOCK_LLM: "1", AUTH_MODE: "off", APP_SECRET: "smoke-secret-smoke-secret-smoke-secret" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write(d));
const waitFor = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start");
};
const fails = [];
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
try {
  await waitFor();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  check("decks page renders", await page.locator("h1", { hasText: "Decks" }).isVisible());
  await page.click("text=New deck");
  await page.fill("textarea", "Brief the team on the salicylic acid amendment and what it changes for the rinse-off range.");
  await page.fill('input[placeholder^="e.g. Salicylic"]', "Smoke deck");
  await page.click("text=Continue");
  const fileInput = page.locator('input[type=file]').first();
  fs.writeFileSync(path.join(tmp, "notes.md"), "# Notes\nAnnex III entry 98: 2% rinse-off.");
  await fileInput.setInputFiles(path.join(tmp, "notes.md"));
  await page.waitForSelector(".src", { timeout: 10000 });
  check("source uploaded from the wizard", (await page.locator(".src").count()) === 1);
  await page.click("text=Continue");
  await page.click("text=Training / workshop");
  await page.click("text=Continue");
  await page.click("button:has-text('Generate')");
  await page.waitForURL(/\/deck\//, { timeout: 30000 });
  await page.waitForSelector(".thumb", { timeout: 10000 });
  const thumbs = await page.locator(".thumb").count();
  check("editor shows the generated slides", thumbs >= 6);
  await page.locator(".thumb").nth(2).click();
  await page.fill(".field textarea >> nth=0", "Edited from the smoke run");
  await page.waitForFunction(() => document.body.innerText.includes("Saved"), null, { timeout: 5000 }).catch(() => {});
  check("edit autosaves", (await page.locator("text=Saved").count()) > 0);
  await page.click("button:has-text('Theme')");
  await page.click("button:has-text('Mono')");
  await page.waitForTimeout(1200);
  const deckId = page.url().split("/deck/")[1];
  const deck = await (await fetch(`http://localhost:${PORT}/api/decks/${deckId}`)).json();
  check("theme preset applied and saved", deck.deck.theme.id === "mono");
  check("edited title saved", deck.deck.slides[2].title === "Edited from the smoke run");
  const pptx = await fetch(`http://localhost:${PORT}/api/decks/${deckId}/export.pptx`);
  check("pptx export answers", pptx.ok && (await pptx.arrayBuffer()).byteLength > 10000);
  await page.goto(`http://localhost:${PORT}/deck/${deckId}/present`);
  const frame = page.frameLocator("iframe");
  await frame.locator(".sc-slide.on").waitFor({ timeout: 10000 });
  check("presenter renders the first slide", await frame.locator(".sc-slide.on").isVisible());
  await page.goto(`http://localhost:${PORT}/settings`);
  check("settings page renders", await page.locator("h1", { hasText: "Settings" }).isVisible());
  check("no page errors", errors.length === 0);
  if (errors.length) console.log(errors);
  await browser.close();
} catch (e) {
  console.error(e);
  fails.push("exception");
} finally {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("\nall checks passed");
