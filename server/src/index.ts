import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { config, ensureDirs, requireSecret } from "./config.js";
import { getDb } from "./db.js";
import { registerAuth } from "./auth.js";
import { authRoutes } from "./routes/auth.js";
import { deckRoutes } from "./routes/decks.js";
import { sourceRoutes } from "./routes/sources.js";
import { mediaRoutes } from "./routes/media.js";
import { generateRoutes } from "./routes/generate.js";
import { exportRoutes } from "./routes/export.js";
import { settingsRoutes } from "./routes/settings.js";
import { oneDriveRoutes } from "./routes/onedrive.js";
import { libraryRoutes } from "./routes/library.js";

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  ensureDirs();
  const db = getDb();
  // A job that was running when the process died is not coming back.
  db.prepare("UPDATE jobs SET status = 'failed', error = 'server restarted' WHERE status IN ('queued','running')").run();

  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 20 * 1024 * 1024 });
  await app.register(cookie, { secret: requireSecret() });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 500 } });
  registerAuth(app);

  app.get("/api/health", async () => ({ ok: true, authMode: config.authMode, mockLlm: config.mockLlm }));
  await app.register(authRoutes);
  await app.register(deckRoutes);
  await app.register(sourceRoutes);
  await app.register(mediaRoutes);
  await app.register(generateRoutes);
  await app.register(exportRoutes);
  await app.register(settingsRoutes);
  await app.register(oneDriveRoutes);
  await app.register(libraryRoutes);

  if (fs.existsSync(path.join(config.webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: config.webDist, prefix: "/", wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: "not_found" });
    });
  }
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  buildApp()
    .then((app) => app.listen({ port: config.port, host: config.host }))
    .then(() => {
      console.log(`slidecraft listening on http://localhost:${config.port}  auth=${config.authMode}  mock=${config.mockLlm ? "on" : "off"}  data=${config.dataDir}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
