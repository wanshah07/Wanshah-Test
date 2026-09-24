import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { getDb, now, uid } from "./db.js";
import { hashPassword, token, verifyPassword } from "./crypto.js";

// Two modes. `off`: one implicit local account, no login screen, for a single
// person running this on their own machine. `local`: email + password accounts
// created with `npm run user:add`, cookie sessions, 30 days.
//
// Another provider (Google, Microsoft, magic link) plugs in by adding a route
// that ends in `startSession(reply, userId)`. Nothing else needs to change.

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export const COOKIE = "sc_session";
const SESSION_DAYS = 30;
export const LOCAL_USER_ID = "u_local";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}

export function ensureLocalUser(): User {
  const db = getDb();
  const row = db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(LOCAL_USER_ID) as User | undefined;
  if (row) return row;
  db.prepare("INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, 'owner', ?)").run(LOCAL_USER_ID, "local@localhost", "Local user", now());
  return { id: LOCAL_USER_ID, email: "local@localhost", name: "Local user", role: "owner" };
}

export function createUser(email: string, password: string, name?: string, role = "member"): User {
  const db = getDb();
  const id = uid("u");
  db.prepare("INSERT INTO users (id, email, name, pass_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, email.toLowerCase().trim(), name ?? null, hashPassword(password), role, now());
  return { id, email: email.toLowerCase().trim(), name: name ?? null, role };
}

export function authenticate(email: string, password: string): User | null {
  const db = getDb();
  const row = db.prepare("SELECT id, email, name, role, pass_hash FROM users WHERE email = ?").get(email.toLowerCase().trim()) as (User & { pass_hash: string | null }) | undefined;
  if (!row || !verifyPassword(password, row.pass_hash)) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function startSession(reply: FastifyReply, userId: string): void {
  const db = getDb();
  const id = token();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400e3);
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(id, userId, now(), expires.toISOString());
  reply.setCookie(COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", secure: config.secure, expires });
}

export function endSession(request: FastifyRequest, reply: FastifyReply): void {
  const id = request.cookies?.[COOKIE];
  if (id) getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  reply.clearCookie(COOKIE, { path: "/" });
}

function userFromSession(request: FastifyRequest): User | null {
  const id = request.cookies?.[COOKIE];
  if (!id) return null;
  const db = getDb();
  const row = db.prepare("SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?").get(id) as (User & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Registers the auth hook. Public paths: the login endpoints and static files. */
export function registerAuth(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0];
    if (!url.startsWith("/api/")) return;
    if (url === "/api/auth/login" || url === "/api/auth/mode" || url === "/api/health") return;
    if (config.authMode === "off") {
      request.user = ensureLocalUser();
      return;
    }
    const u = userFromSession(request);
    if (!u) {
      reply.code(401).send({ error: "not_signed_in" });
      return reply;
    }
    request.user = u;
  });
}
