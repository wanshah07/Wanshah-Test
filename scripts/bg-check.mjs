// A deck being written keeps being written when the person leaves the page: it stays in view in the tray
// from every page, resumes after a reload, says when it is done, and does not pull the person back.
// Usage: node scripts/bg-check.mjs   (needs a built web/dist and Playwright's Chromium)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const PORT = 8797;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-bg-"));
// The mock writer pauses, so the build is still running while the person clicks around.
const server = spawn("node", ["server/dist/index.js"], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, MOCK_LLM: "1", MOCK_LLM_DELAY_MS: "9000", AUTH_MODE: "off", APP_SECRET: "smoke-secret-smoke-secret-smoke-secret" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write(d));
const base = `http://localhost:${PORT}`;
const fails = [];
const check = (name, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    await sleep(200);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/new`);
  // Auto, no brief: Continue to Sources, Continue to Design, Generate.
  await page.click("button:has-text('Continue')");
  await page.locator("text=Drop files").first().waitFor({ timeout: 5000 }).catch(() => {});
  await page.click("button:has-text('Continue')");
  await page.click("button:has-text('Generate (AI decides)')");
  // This page shows its own progress, so the tray does not repeat it here.
  await page.locator(".spin").first().waitFor({ timeout: 10000 });
  check("on the page that started it, the progress is the page's own and the tray stays out of the way", (await page.locator("[data-testid=job-chip]").count()) === 0);

  // Leave mid-build, to three other segments.
  await page.click("nav.links >> text=Settings");
  await page.locator("[data-testid=job-chip][data-status=running], [data-testid=job-chip][data-status=queued]").first().waitFor({ timeout: 10000 });
  check("leaving mid-build keeps the deck in the tray on Settings", (await page.locator("[data-testid=job-chip]").count()) === 1);
  await page.click("nav.links >> text=Designs");
  check("and on Designs", (await page.locator("[data-testid=job-chip]").count()) === 1);
  await page.click("nav.links >> text=Prompts");
  check("and on Prompts", (await page.locator("[data-testid=job-chip]").count()) === 1);
  check("the tray says it is writing in the background", /Writing in the background/.test(await page.locator("[data-testid=job-chip]").first().innerText()));
  const jobs = await (async () => {
    const decks = await (await fetch(`${base}/api/decks`)).json();
    return decks;
  })();
  check("the server has the deck while it is being written", Array.isArray(jobs.decks ?? jobs) && (jobs.decks ?? jobs).length >= 1);

  // A reload mid-build resumes it.
  await page.reload();
  await page.locator("[data-testid=job-chip]").first().waitFor({ timeout: 10000 });
  check("a reload mid-build resumes the tray", (await page.locator("[data-testid=job-chip]").count()) === 1);

  // It finishes without the person being pulled back from where they are.
  await page.locator("[data-testid=job-chip][data-status=done]").waitFor({ timeout: 40000 });
  check("the build finished while the person was on another page", true);
  check("and did not pull them off it", new URL(page.url()).pathname === "/prompts");
  check("the tray says it is ready", /Ready/.test(await page.locator("[data-testid=job-chip]").first().innerText()));
  check("a toast says the deck is ready", (await page.locator(".toast", { hasText: "Deck ready" }).count()) >= 1);

  // Opening the deck acknowledges it, and the deck is complete.
  await page.locator("[data-testid=job-chip] a:has-text('Open')").click();
  await page.waitForURL(/\/deck\//, { timeout: 10000 });
  const id = page.url().split("/deck/")[1];
  const d = await (await fetch(`${base}/api/decks/${id}`)).json();
  check("the deck that finished in the background is complete", d.deck.slides.length >= 6);
  await sleep(500);
  check("opening the deck clears its chip", (await page.locator("[data-testid=job-chip]").count()) === 0);

  // Regenerate from the editor, leave, come back while it is still running: it is picked up again.
  await page.click("button:has-text('Add files / regenerate')");
  // Replacing a written deck asks to be clicked twice.
  await page.locator("button.btn-primary:has-text('Regenerate')").first().click();
  await page.locator("button:has-text('Click again')").first().click();
  await page.locator(".spin").first().waitFor({ timeout: 10000 });
  await page.click("nav.links >> text=Designs");
  await page.locator("[data-testid=job-chip]").first().waitFor({ timeout: 10000 });
  check("a regenerate left mid-build stays in the tray", (await page.locator("[data-testid=job-chip]").count()) === 1);
  await page.goBack();
  await page.click("button:has-text('Add files / regenerate')").catch(() => {});
  await sleep(800);
  check("coming back to the deck shows the build still in progress, and its own panel takes over from the tray", (await page.locator("[data-testid=job-chip]").count()) === 0 && (await page.locator(".spin").count()) >= 1);
  await page.locator("text=Deck regenerated").first().waitFor({ timeout: 40000 }).catch(() => {});
  check("it finishes in place", (await page.locator("text=Deck regenerated").count()) >= 1);

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
