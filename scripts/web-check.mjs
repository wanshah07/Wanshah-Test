// Browser regressions from the 26 Sep 2026 UI bug hunt: typing in list and number fields,
// saving before a download, the present view, a missing deck, and phone widths.
// Run: CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/web-check.mjs (after npm run build).
import { spawn } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { chromium } from "playwright-core";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webchk-"));
const PORT = 8871, base = `http://localhost:${PORT}`;
const server = spawn("node", ["server/dist/index.js"], { env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, MOCK_LLM: "1", AUTH_MODE: "off", APP_SECRET: "x".repeat(40) }, stdio: "ignore" });
const results = []; const check = (n, ok, extra = "") => results.push(`${ok ? "ok  " : "FAIL"} ${n}${extra ? " (" + extra + ")" : ""}`);
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  const j = (r) => r.json();
  const { id } = await j(await fetch(base + "/api/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Web check" }) }));
  const d = (await j(await fetch(base + `/api/decks/${id}`))).deck;
  d.slides = [{ id: "s1", layout: "bullets", title: "Bullets", bullets: ["one"] }, { id: "s2", layout: "chart", title: "Chart", chart: { kind: "column", categories: ["a", "b"], series: [{ name: "s", values: [1, 2] }] } }, { id: "s3", layout: "title", title: "Third" }];
  await fetch(base + `/api/decks/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(d) });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--enable-blink-features=ProgrammaticScrollPromise"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/deck/${id}`);
  const bullets = page.locator(".field:has(label:has-text(\"One per line\"))").locator("textarea").first();
  await bullets.click(); await bullets.press("End"); await page.keyboard.press("Enter"); await page.keyboard.type("second");
  check("Enter starts a new line in a one-per-line field", (await bullets.inputValue()) === "one\nsecond", JSON.stringify(await bullets.inputValue()));
  await page.waitForTimeout(1500);
  let saved = (await j(await fetch(base + `/api/decks/${id}`))).deck;
  check("both lines are saved as two points", JSON.stringify(saved.slides[0].bullets) === '["one","second"]', JSON.stringify(saved.slides[0].bullets));
  await page.locator(".ed .list > *").nth(1).click();
  const vals = page.locator(".field", { hasText: "Values" }).locator("input").first();
  await vals.fill(""); await vals.type("1.5, -3");
  check("decimals and negatives can be typed", (await vals.inputValue()) === "1.5, -3", await vals.inputValue());
  await page.waitForTimeout(1500);
  saved = (await j(await fetch(base + `/api/decks/${id}`))).deck;
  check("chart values saved as numbers", JSON.stringify(saved.slides[1].chart.series[0].values) === "[1.5,-3]", JSON.stringify(saved.slides[1].chart.series[0].values));
  // Export right after an edit carries the edit.
  const title = page.locator("input.ed-title");
  await title.fill("Edited just now");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button:has-text('Download PPTX')")]);
  saved = (await j(await fetch(base + `/api/decks/${id}`))).deck;
  check("a download saves the edit first", saved.title === "Edited just now" && !!dl, saved.title);
  // Present: keys work with no click, and the slide number survives a reload.
  const pres = await browser.newPage();
  await pres.goto(`${base}/deck/${id}/present`);
  await pres.waitForTimeout(1500);
  await pres.keyboard.press("ArrowRight");
  await pres.waitForTimeout(300);
  check("present answers the keyboard without a click", pres.url().endsWith("#2"), pres.url());
  await pres.reload(); await pres.waitForTimeout(1500);
  const pos = await pres.frameLocator("iframe").locator("#pos").textContent();
  check("present reload stays on the slide", (pos ?? "").startsWith("2 /"), pos ?? "");
  // Missing deck.
  await page.goto(`${base}/deck/d_nope`);
  await page.waitForTimeout(800);
  check("a missing deck says so", await page.locator("text=This deck does not exist").isVisible());
  // Phone width: nothing wider than the screen.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const url of ["/", "/new", `/deck/${id}`, `/deck/${id}/notebook`, "/settings", "/designs", "/prompts"]) {
    await phone.goto(base + url); await phone.waitForTimeout(700);
    const sw = await phone.evaluate(() => document.documentElement.scrollWidth);
    check(`no sideways scroll at 390px on ${url}`, sw <= 392, `scrollWidth ${sw}`);
  }
  await phone.goto(`${base}/deck/${id}`); await phone.waitForTimeout(700);
  const canvas = await phone.locator(".ed > :nth-child(2) .frame").first().boundingBox();
  check("the slide is visible on a phone", !!canvas && canvas.width > 200, JSON.stringify(canvas));
  check("no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
} catch (e) { results.push("FAIL script: " + e.message); }
finally { server.kill(); console.log(results.join("\n")); if (results.some((r) => r.startsWith("FAIL"))) process.exitCode = 1; }
