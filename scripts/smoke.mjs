// Browser smoke run against a mock server: the wizard, the editor, the exports.
// Usage: node scripts/smoke.mjs   (needs a built web/dist and Playwright's Chromium)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

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
  // Library: a design from a screenshot, and a saved prompt ticked by default.
  await page.goto(`http://localhost:${PORT}/designs`);
  await page.locator("h1", { hasText: "Designs" }).waitFor({ timeout: 10000 });
  check("Designs has a Back button", (await page.locator("button:has-text('← Back')").count()) === 1);
  const png = path.join(tmp, "Reference slide.png");
  {
    // An opaque slide picture: navy with a blue bar.
    const img = new PNG({ width: 160, height: 90 });
    for (let i = 0; i < 160 * 90; i++) {
      const y = Math.floor(i / 160);
      const c = y > 20 && y < 30 ? [0x48, 0x98, 0xd8] : [0x16, 0x32, 0x4f];
      img.data.set([...c, 255], i * 4);
    }
    fs.writeFileSync(png, PNG.sync.write(img));
  }
  await page.locator("input[type=file]").first().setInputFiles(png);
  await page.locator(".design-card").first().waitFor({ timeout: 10000 });
  check("a screenshot becomes a design", (await page.locator(".design-card").count()) === 1);
  await page.goto(`http://localhost:${PORT}/prompts`);
  await page.click("button:has-text('New prompt')");
  await page.click(".chip:has-text('Malaysia first')");
  await page.check("text=Tick by default on new decks");
  await page.click("button:has-text('Save')");
  await page.locator(".card b", { hasText: "Malaysia first" }).waitFor({ timeout: 5000 });
  check("a saved prompt is kept", (await page.locator(".pill", { hasText: "default" }).count()) === 1);
  await page.goto(`http://localhost:${PORT}/`);
  await page.click("text=New deck");
  await page.locator(".chip.on", { hasText: "Malaysia first" }).waitFor({ timeout: 5000 }).catch(() => {});
  check("a default prompt starts ticked", (await page.locator(".chip.on", { hasText: "Malaysia first" }).count()) === 1);
  let dialogs = 0;
  page.on("dialog", async (d) => {
    dialogs++;
    await d.dismiss();
  });
  await page.fill('input[placeholder^="e.g. Salicylic"]', "Smoke deck");
  check("Auto starts ticked and needs no brief", (await page.locator("[data-testid=auto] input").isChecked()) && (await page.locator("button:has-text('Continue')").isEnabled()));
  // The rest of this deck is briefed by hand.
  await page.click("[data-testid=auto]");
  check("Continue waits for a brief", await page.locator("button:has-text('Continue')").isDisabled());
  // A brief made of ticks only, no typing.
  await page.click(".chip:has-text('Explain a regulation change')");
  await page.click(".chip:has-text('Dates and deadlines')");
  await page.click(".chip:has-text('Doctors and pharmacists')");
  check("ticks alone are enough to continue", await page.locator("button:has-text('Continue')").isEnabled());
  await page.click("text=Continue");
  const fileInput = page.locator('input[type=file]').first();
  fs.writeFileSync(path.join(tmp, "notes.md"), "# Notes\nAnnex III entry 98: 2% rinse-off.");
  await fileInput.setInputFiles(path.join(tmp, "notes.md"));
  await page.waitForSelector(".src", { timeout: 10000 });
  check("source uploaded from the wizard", (await page.locator(".src").count()) === 1);
  await page.click("text=Continue");
  await page.click("text=Training / workshop");
  await page.click("text=Continue");
  await page.locator(".pickcard", { hasText: "Reference slide" }).click();
  check("my design can be picked as a picture card", (await page.locator(".pickcard.on", { hasText: "Reference slide" }).count()) === 1);
  // The first attempt fails the way a silent endpoint does; Try again must recover without re-entering anything.
  // First call: a silent endpoint. Second: a model that cannot read an uploaded
  // picture. Third must carry the user's choice to write anyway.
  let genCalls = 0;
  let allowSent = false;
  await page.route("**/api/decks/*/generate", async (route) => {
    genCalls++;
    if (genCalls === 1) return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "timeout", message: "api.mireld.my did not answer within 240 s" }) });
    if (genCalls === 2) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "pictures_unreadable", message: "The writer model (m1) cannot read pictures. 1 picture source (scan.png) would be used only as slide pictures; any text, table or figure inside them would not reach the deck.", pictures: ["scan.png"] }) });
    if (genCalls === 3) allowSent = JSON.parse(route.request().postData() || "{}").allowUnreadPictures === true;
    return route.continue();
  });
  await page.click("button:has-text('Generate')");
  await page.locator("text=The writer endpoint did not answer in time.").waitFor({ timeout: 10000 }).catch(() => {});
  check("a failure says what went wrong in plain words", (await page.locator("text=The writer endpoint did not answer in time.").count()) === 1);
  check("a failed generation offers Back", (await page.locator("button:has-text('← Back')").count()) === 1);
  await page.click("button:has-text('Try again')");
  await page.locator("button:has-text('Write anyway')").waitFor({ timeout: 10000 }).catch(() => {});
  check("unreadable pictures stop the writer and offer a choice", (await page.locator("text=cannot read pictures").count()) >= 1 && (await page.locator("button:has-text('Write anyway')").count()) === 1);
  await page.click("button:has-text('Write anyway')");
  await page.waitForURL(/\/deck\//, { timeout: 30000 });
  check("Try again and Write anyway recover with the same choices", allowSent);
  // No unroute: removing a route while the editor's first request is in flight can leave that request hanging.
  // The handler already lets every later call through.
  await page.waitForSelector(".thumb", { timeout: 10000 });
  const thumbs = await page.locator(".thumb").count();
  check("editor shows the generated slides", thumbs >= 6);
  {
    const id = page.url().split("/deck/")[1];
    const d = await (await fetch(`http://localhost:${PORT}/api/decks/${id}`)).json();
    check("the deck uses the picked design and the ticked prompt", !!d.deck.designId && (d.deck.brief?.prompts ?? []).length === 1);
  }
  // Layouts as pictures: change one slide's layout, add a slide from the picture modal.
  await page.locator(".thumb").nth(3).click();
  await page.click("button:has-text('Change layout')");
  check("layouts show as pictures", (await page.locator(".field .pickcard").count()) === 12);
  await page.locator(".field .pickcard", { hasText: "Table" }).click();
  await page.waitForTimeout(1200);
  {
    const id = page.url().split("/deck/")[1];
    const d = await (await fetch(`http://localhost:${PORT}/api/decks/${id}`)).json();
    check("picking a layout picture changes and saves the slide", d.deck.slides[3].layout === "table" && !!d.deck.slides[3].table);
  }
  const thumbsBefore = await page.locator(".thumb").count();
  await page.click("button:has-text('+ Add')");
  await page.locator(".modal .pickcard", { hasText: "Big numbers" }).click();
  check("add a slide from a picture", (await page.locator(".thumb").count()) === thumbsBefore + 1);
  // Sign-off and feedback on slides.
  await page.locator(".thumb").nth(1).click();
  await page.click(".review button:has-text('OK ✓')");
  await page.locator(".thumb .okmark").first().waitFor({ timeout: 5000 }).catch(() => {});
  check("OK marks the slide", (await page.locator(".thumb .okmark").count()) === 1);
  await page.locator(".thumb").nth(3).click();
  await page.fill(".review textarea", "Shorter title please");
  await page.click(".review button:has-text('Save for later')");
  await page.locator(".thumb .fbmark").first().waitFor({ timeout: 5000 }).catch(() => {});
  check("feedback saved for later shows on the slide", (await page.locator(".thumb .fbmark").count()) === 1);
  await page.click("button:has-text('Apply saved feedback')");
  await page.waitForFunction(() => !document.querySelector(".thumb .fbmark"), null, { timeout: 15000 }).catch(() => {});
  check("apply saved feedback clears the queue", (await page.locator(".thumb .fbmark").count()) === 0);
  check("a slide stays OK while others change", (await page.locator(".thumb .okmark").count()) === 1);
  await page.locator(".thumb").nth(2).click();
  await page.fill(".field textarea >> nth=0", "Edited from the smoke run");
  await page.waitForFunction(() => document.body.innerText.includes("Saved"), null, { timeout: 5000 }).catch(() => {});
  check("edit autosaves", (await page.locator("text=Saved").count()) > 0);
  // Files and regenerate, in the editor.
  await page.click("button:has-text('Files & regenerate')");
  check("regenerate starts from the ticked brief", (await page.locator(".chip.on").count()) >= 3);
  const before = await page.locator(".src").count();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["# Dropped\nA note dropped into the editor."], "dropped.md", { type: "text/markdown" }));
    document.querySelector(".drop").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction((n) => document.querySelectorAll(".src").length > n, before, { timeout: 10000 }).catch(() => {});
  check("a file dropped in the editor is added", (await page.locator(".src").count()) === before + 1);
  await page.click("button:has-text('Regenerate deck')");
  check("regenerate asks with a second click, not a pop-up", (await page.locator("button:has-text('Click again')").count()) === 1 && dialogs === 0);
  await page.click("button:has-text('Click again')");
  await page.waitForFunction(() => document.body.innerText.includes("Deck regenerated"), null, { timeout: 20000 }).catch(() => {});
  check("regenerate runs", (await page.locator("text=Deck regenerated").count()) > 0);
  await page.getByRole("button", { name: "Slide", exact: true }).click();
  await page.locator(".thumb").nth(2).click();
  await page.fill(".field textarea >> nth=0", "Edited from the smoke run");
  await page.waitForTimeout(1200);
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
  await page.locator("h2", { hasText: "OneDrive pictures" }).waitFor({ timeout: 10000 }).catch(() => {});
  check("settings page renders", await page.locator("h1", { hasText: "Settings" }).isVisible());
  check("settings offers OneDrive", await page.locator("h2", { hasText: "OneDrive pictures" }).isVisible());
  await page.click(".chip:has-text('Composio')");
  await page.locator("text=Composio API key").waitFor({ timeout: 5000 }).catch(() => {});
  check("OneDrive can go through Composio", (await page.locator("text=Composio API key").count()) === 1 && (await page.locator("button:has-text('Find my OneDrive accounts')").count()) === 1);
  check("settings says whether the writer reads pictures", (await page.locator("text=Reads pictures:").count()) === 1);
  check("settings offers a separate picture reader", (await page.locator("[data-testid=reader] h2", { hasText: "Picture reader" }).count()) === 1 && (await page.locator("button:has-text('Save picture reader')").count()) === 1);
  // Inside another page (VS Code's preview pane), say so and offer a real tab.
  await page.setContent(`<iframe src="http://localhost:${PORT}/" style="width:1200px;height:700px"></iframe>`);
  const inner = page.frameLocator("iframe");
  await inner.locator("h1", { hasText: "Decks" }).waitFor({ timeout: 10000 });
  check("framed page shows the open-in-a-tab banner", await inner.locator("text=Open it in its own browser tab").isVisible());
  await page.goto(`http://localhost:${PORT}/`);
  await page.locator(".deckcard").first().waitFor({ timeout: 10000 });
  const cards = await page.locator(".deckcard").count();
  await page.locator(".deckcard button:has-text('Delete')").first().click();
  await page.locator(".deckcard button:has-text('Click again')").first().click();
  await page.waitForFunction((n) => document.querySelectorAll(".deckcard").length < n, cards, { timeout: 5000 }).catch(() => {});
  check("delete works with two clicks", (await page.locator(".deckcard").count()) === cards - 1);
  // Auto: nothing typed, nothing ticked; the AI chooses. Angle is skipped.
  await page.click("text=New deck");
  await page.click("button:has-text('Continue')");
  await page.locator("text=Drop files").first().waitFor({ timeout: 5000 }).catch(() => {});
  await page.click("button:has-text('Continue')");
  check("Auto skips the angle step and the feature choices", (await page.locator("h3", { hasText: "Design" }).count()) === 1 && (await page.locator("h3", { hasText: "Features" }).count()) === 0 && (await page.locator("text=Training / workshop").count()) === 0);
  await page.click("button:has-text('Generate (AI decides)')");
  await page.waitForURL(/\/deck\//, { timeout: 30000 });
  {
    const id = page.url().split("/deck/")[1];
    const d = await (await fetch(`http://localhost:${PORT}/api/decks/${id}`)).json();
    check("an Auto deck is written from an empty brief", d.deck.slides.length >= 6 && d.deck.brief?.auto === true);
    check("an Auto deck has kickers and numbered cards", d.deck.slides.some((x) => x.kicker) && d.deck.slides.some((x) => x.layout === "cards" && x.cards?.length >= 2));
  }
  await page.click("button:has-text('Add files / regenerate')");
  check("Regenerate remembers Auto", await page.locator("[data-testid=regen-auto] input").isChecked());
  check("no browser pop-ups used", dialogs === 0);
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
