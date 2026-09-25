import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { requireSecret } from "./config.js";

function key(): Buffer {
  return createHash("sha256").update(requireSecret()).digest();
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function decrypt(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const h = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${h.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const h = scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
  const s = Buffer.from(hashHex, "hex");
  return h.length === s.length && timingSafeEqual(h, s);
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function maskKey(k: string): string {
  if (!k) return "";
  if (k.length < 12) return "•".repeat(k.length);
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
