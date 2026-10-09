import { cleanModelId } from "@slidecraft/shared";
import type { LlmAuth } from "./client.js";

// The backup endpoints every call can fall back to, so a deck still gets written when one gateway
// is down, out of quota, refuses the model or sends something unusable. Each endpoint is the
// server owner's, set in the environment (on the worker, as repository secrets and variables):
//
//   MIRELD_API_KEY   MIRELD_BASE_URL (default https://api.mireld.my/v1)   MIRELD_MODELS (default deepseek-v4-pro)
//   AFIQ_API_KEY     AFIQ_BASE_URL   (no default: AfiqStore's Docs page)  AFIQ_MODELS   (default kimi-k3, kimi-k2.7+vision)
//   AI_ROUTE_ORDER   which backups come first (default "mireld, afiq")
//
// A model written with "+vision" reads pictures, so uploaded pictures go to it when the writer
// cannot see. A key is only ever sent to the endpoint named with it, never to another.

export interface Route {
  /** The provider's short name, as AI_ROUTE_ORDER names it. */
  provider: string;
  /** How the job log names the provider. */
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  vision: boolean;
}

interface Provider {
  id: string;
  label: string;
  key: string;
  base: string;
  defaultBase: string;
  models: string;
  defaultModels: string;
}

const PROVIDERS = (env: NodeJS.ProcessEnv): Provider[] => [
  { id: "mireld", label: "Mireld", key: "MIRELD_API_KEY", base: "MIRELD_BASE_URL", defaultBase: "https://api.mireld.my/v1", models: "MIRELD_MODELS", defaultModels: "deepseek-v4-pro" },
  { id: "afiq", label: "AfiqStore", key: "AFIQ_API_KEY", base: "AFIQ_BASE_URL", defaultBase: "", models: "AFIQ_MODELS", defaultModels: "kimi-k3, kimi-k2.7+vision" },
].map((p) => ({ ...p, key: env[p.key] ?? "", base: env[p.base] ?? "", models: env[p.models] ?? "" }) as Provider);

/** An http(s) address with no trailing slash, or "" when it is not one. */
function cleanBase(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+/i.test(u) ? u : "";
}

/** "kimi-k3, kimi-k2.7+vision" as models, each marked when it reads pictures. */
export function parseRouteModels(text: string): { model: string; vision: boolean }[] {
  const out: { model: string; vision: boolean }[] = [];
  for (const part of text.split(/[,\n]/)) {
    const raw = part.trim();
    const vision = /\+vision$/i.test(raw);
    const model = cleanModelId(raw.replace(/\+vision$/i, ""));
    if (model && !out.some((m) => m.model === model)) out.push({ model, vision });
  }
  return out.slice(0, 10);
}

/** Every backup the environment sets up completely (key and address), in AI_ROUTE_ORDER. */
export function envRoutes(env: NodeJS.ProcessEnv = process.env): Route[] {
  const order = (env.AI_ROUTE_ORDER || "mireld, afiq").split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const providers = PROVIDERS(env).sort((a, b) => rank(order, a.id) - rank(order, b.id));
  const out: Route[] = [];
  for (const p of providers) {
    const apiKey = p.key.trim();
    const baseUrl = cleanBase(p.base || p.defaultBase);
    if (!apiKey || !baseUrl) continue;
    for (const m of parseRouteModels(p.models.trim() || p.defaultModels)) out.push({ provider: p.id, label: p.label, baseUrl, apiKey, model: m.model, vision: m.vision });
  }
  return out;
}

function rank(order: string[], id: string): number {
  const i = order.indexOf(id);
  return i < 0 ? order.length : i;
}

export function authOf(r: Route, imageModel = ""): LlmAuth {
  return { apiKey: r.apiKey, baseUrl: r.baseUrl, model: r.model, imageModel, label: r.label };
}

const same = (a: { baseUrl: string; model: string }, b: { baseUrl: string; model: string }) => a.baseUrl === b.baseUrl && a.model === b.model;

/** The first call, then every backup it does not already duplicate, in order. */
export function withFallbacks(primary: LlmAuth, backups: LlmAuth[]): LlmAuth {
  const fallbacks: LlmAuth[] = [];
  for (const b of backups) if (!same(b, primary) && !fallbacks.some((f) => same(f, b))) fallbacks.push({ ...b, fallbacks: undefined });
  return { ...primary, fallbacks };
}

/** The backup that serves this model, when the model belongs to one. */
export function routeServing(model: unknown, routes: Route[]): Route | undefined {
  const m = cleanModelId(model);
  return m ? routes.find((r) => r.model === m) : undefined;
}

/** The model id that means "the best available, in the set order". */
export const AUTO_MODEL = "auto";
