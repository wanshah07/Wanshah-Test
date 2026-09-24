import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { authenticate, endSession, startSession } from "../auth.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/mode", async () => ({ mode: config.authMode }));

  app.get("/api/auth/me", async (req) => ({ user: req.user, mode: config.authMode }));

  app.post("/api/auth/login", async (req, reply) => {
    if (config.authMode === "off") return reply.code(400).send({ error: "auth_off" });
    const body = (req.body ?? {}) as { email?: string; password?: string };
    if (!body.email || !body.password) return reply.code(400).send({ error: "missing" });
    const u = authenticate(body.email, body.password);
    if (!u) {
      await new Promise((r) => setTimeout(r, 400));
      return reply.code(401).send({ error: "bad_credentials" });
    }
    startSession(reply, u.id);
    return { user: u };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    endSession(req, reply);
    return { ok: true };
  });
}
