import { afterEach, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";

// Google Drive and Sheets links as sources, with Google replaced by canned answers shaped like the real
// ones (checked against docs.google.com and drive.google.com on 27 Sep 2026), so no network is needed.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-links-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.AUTH_MODE = "off";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

type G = typeof import("../src/ingest/google.js");
let G: G;
let app: Awaited<ReturnType<typeof import("../src/index.js")["buildApp"]>>;
let deckId = "";
let real: G["google"]["get"];

function xlsxOf(tabs: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(tabs)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
const file = (body: Buffer | string, name?: string, type = "application/octet-stream") => ({ status: 200, type, disposition: name ? `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}` : "", body: Buffer.from(body), signIn: false });
const page = (status: number, html = "<!DOCTYPE html><html><body>Sorry</body></html>") => ({ status, type: "text/html; charset=utf-8", disposition: "", body: Buffer.from(html), signIn: false });
const signIn = { status: 401, type: "", disposition: "", body: Buffer.alloc(0), signIn: true };

/** Answers by address, like Google does; anything unlisted is a 404 page. */
function serve(map: Record<string, ReturnType<typeof file> | typeof signIn>): void {
  G.google.get = async (address: string) => {
    const hit = Object.entries(map).find(([k]) => address.includes(k));
    return hit ? hit[1] : page(404);
  };
}

beforeAll(async () => {
  G = await import("../src/ingest/google.js");
  real = G.google.get;
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
  deckId = (await app.inject({ method: "POST", url: "/api/decks", payload: { title: "Links" } })).json().id;
});
afterEach(() => {
  G.google.get = real;
});

describe("reading a Google link", () => {
  it("knows every kind of Google link, and nothing else", () => {
    const p = G.parseGoogleLink;
    expect(p("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0")).toEqual({ type: "sheet", id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" });
    expect(p("https://docs.google.com/spreadsheets/u/1/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing")?.type).toBe("sheet");
    expect(p("https://docs.google.com/spreadsheets/d/e/2PACX-1vSabcdefghijklmnop/pubhtml")).toEqual({ type: "sheet", id: "2PACX-1vSabcdefghijklmnop", published: true });
    expect(p("https://docs.google.com/document/d/1abcdefghijklmnopqrstuvwxyz/edit")?.type).toBe("doc");
    expect(p("https://docs.google.com/presentation/d/1abcdefghijklmnopqrstuvwxyz/edit#slide=id.p")?.type).toBe("slides");
    expect(p("https://drive.google.com/file/d/1SHafCugkpMZzYhbgOz0zCuYiy-hb9lYX/view?usp=drive_web")).toEqual({ type: "file", id: "1SHafCugkpMZzYhbgOz0zCuYiy-hb9lYX" });
    expect(p("https://drive.google.com/drive/folders/1u2xu7bSrWxrbUxk-dT-UvEJq8IjdmNTP?usp=sharing")).toEqual({ type: "folder", id: "1u2xu7bSrWxrbUxk-dT-UvEJq8IjdmNTP" });
    expect(p("https://drive.google.com/drive/u/0/folders/1u2xu7bSrWxrbUxk-dT-UvEJq8IjdmNTP")?.type).toBe("folder");
    expect(p("https://drive.google.com/open?id=1u2xu7bSrWxrbUxk-dT-UvEJq8IjdmNTP")).toEqual({ type: "file", id: "1u2xu7bSrWxrbUxk-dT-UvEJq8IjdmNTP", maybeFolder: true });
    for (const bad of ["https://example.com/x.xlsx", "https://docs.google.com/forms/d/1abcdefghijklmnop/viewform", "not a link", "file:///etc/passwd", "https://drive.google.com.evil.test/file/d/1abcdefghijklmnop/view"]) expect(p(bad)).toBeNull();
    expect(G.exportUrl({ type: "sheet", id: "abc" })).toBe("https://docs.google.com/spreadsheets/d/abc/export?format=xlsx");
    expect(G.dispositionName(`attachment; filename="Sales Q3.xlsx"; filename*=UTF-8''Jualan%20Q3.xlsx`)).toBe("Jualan Q3.xlsx");
  });

  it("reads a shared Sheet, every tab, and reports its rows before the person goes on", async () => {
    serve({ "/spreadsheets/d/SHEET1234567/export": file(xlsxOf({ Sales: [["Month", "Units"], ["Jan", 120], ["Feb", 140]], Notes: [["Note"], ["Q1 only"]], Empty: [] }), "Jualan 2026.xlsx") });
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/link`, payload: { url: "https://docs.google.com/spreadsheets/d/SHEET1234567/edit#gid=0" } });
    expect(r.statusCode).toBe(200);
    const { added, skipped } = r.json();
    expect(skipped).toEqual([]);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ name: "Jualan 2026.xlsx", kind: "sheet", check: { level: "ok" } });
    expect(added[0].check.note).toBe("Read 5 rows in 2 tabs: Sales (3 rows), Notes (2 rows).");
    expect(added[0].check.preview).toContain("Month,Units");
    // The deck's source list carries the same report.
    const list = (await app.inject({ method: "GET", url: `/api/decks/${deckId}/sources` })).json();
    expect(list.find((s: { id: string }) => s.id === added[0].id).check.level).toBe("ok");
  });

  it("says plainly when a file is not shared, and how to share it", async () => {
    for (const answer of [page(404), signIn, page(200)]) {
      serve({ "/spreadsheets/d/PRIVATE12345/export": answer as ReturnType<typeof file> });
      const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/link`, payload: { url: "https://docs.google.com/spreadsheets/d/PRIVATE12345/edit" } });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toBe("not_shared");
      expect(r.json().message).toMatch(/Google did not hand over this Google Sheet: it is not shared with "Anyone with the link"/);
      expect(r.json().message).toMatch(/set General access to "Anyone with the link" as Viewer/);
    }
    const bad = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/link`, payload: { url: "https://example.com/data.xlsx" } });
    expect(bad.json()).toMatchObject({ error: "not_google" });
  });

  it("reads an Excel file kept in Drive when the Sheets export refuses it", async () => {
    serve({ "/spreadsheets/d/OFFICE123456/export": page(404) as ReturnType<typeof file>, "download?id=OFFICE123456": file(xlsxOf({ Data: [["a", "b"], [1, 2]] }), "Stok.xlsx") });
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/link`, payload: { url: "https://docs.google.com/spreadsheets/d/OFFICE123456/edit?rtpof=true" } });
    expect(r.json().added[0]).toMatchObject({ name: "Stok.xlsx", kind: "sheet" });
  });

  it("reads a shared folder's files and says which were left out and why", async () => {
    // The shape of drive.google.com/embeddedfolderview: a subfolder, a Sheet, a Doc, an unshared file.
    const entry = (href: string, title: string) => `<div class="flip-entry" id="entry-x" tabindex="0" role="link"><div class="flip-entry-info"><a href="${href}" target="_blank"><div class="flip-entry-visual"></div><div class="flip-entry-title">${title}</div></a></div></div>`;
    const html = `<html><body><div class="flip-entries">${entry("https://drive.google.com/drive/folders/SUBFOLDER1234", "Old")}${entry("https://docs.google.com/spreadsheets/d/FSHEET123456/edit?usp=drive_web", "Budget")}${entry("https://drive.google.com/file/d/FTEXT1234567/view?usp=drive_web", "notes.txt")}${entry("https://drive.google.com/file/d/FLOCKED12345/view?usp=drive_web", "secret.pdf")}</div></body></html>`;
    serve({
      "embeddedfolderview?id=FOLDER123456": file(html, undefined, "text/html"),
      "/spreadsheets/d/FSHEET123456/export": file(xlsxOf({ Budget: [["Item", "RM"], ["Lab", 900]] })),
      "download?id=FTEXT1234567": file("Notification fee per product per year, with the source.", "notes.txt"),
    });
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/link`, payload: { url: "https://drive.google.com/drive/folders/FOLDER123456?usp=sharing" } });
    const { added, skipped } = r.json();
    expect(added.map((a: { name: string }) => a.name)).toEqual(["Budget.xlsx", "notes.txt"]);
    expect(skipped).toEqual(["secret.pdf (not shared with the link)"]);
    // An open?id= link to the same folder is found to be a folder.
    const r2 = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/link`, payload: { url: "https://drive.google.com/open?id=FOLDER123456" } });
    expect(r2.json().added).toHaveLength(2);
  });

  it("refuses a file over the limit before downloading it", async () => {
    // googleGet itself enforces the limit; here the stub stands for the answer it gives.
    G.google.get = async () => {
      throw new G.GoogleLinkError("The file is over 25 MB. Split it, or drop a smaller export here.", "too_large");
    };
    const r = await app.inject({ method: "POST", url: `/api/decks/${deckId}/sources/link`, payload: { url: "https://drive.google.com/file/d/BIGFILE12345/view" } });
    expect(r.json()).toMatchObject({ error: "too_large" });
  });

  it("never fetches anything but Google", async () => {
    await expect(G.googleGet("https://example.com/x")).rejects.toMatchObject({ code: "unreachable" });
    await expect(G.googleGet("http://docs.google.com/x")).rejects.toMatchObject({ code: "unreachable" });
    await expect(G.googleGet("https://accounts.google.com/ServiceLogin?continue=x")).resolves.toMatchObject({ signIn: true });
  });
});
