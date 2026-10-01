import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

// The sign-in hook, in the mode where it matters.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slidecraft-auth-"));
process.env.DATA_DIR = tmp;
process.env.MOCK_LLM = "1";
process.env.AUTH_MODE = "local";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../src/index.js");
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("the sign-in hook (review of 1 Oct 2026)", () => {
  it("decides on the matched route, so a percent-encoded path cannot slip past it", async () => {
    expect((await app.inject({ method: "GET", url: "/api/decks" })).statusCode).toBe(401);
    // The router decodes "%61" to "a" before matching: this reaches the decks handler.
    expect((await app.inject({ method: "GET", url: "/%61pi/decks" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/%61pi/auth/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/%61pi/onedrive/composio/accounts", payload: { key: "x" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
  });

  it("answers 400, not 500, to a sign-in whose fields are not text", async () => {
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: 5, password: ["x"] } })).statusCode).toBe(400);
  });
});
