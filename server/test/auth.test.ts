import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashPassword, verifyPassword, maskKey } from "../src/crypto.js";

process.env.APP_SECRET = "test-secret-test-secret-test-secret";

describe("crypto", () => {
  it("round-trips and does not leak the plaintext", () => {
    const blob = encrypt("sk-abc");
    expect(blob).not.toContain("sk-abc");
    expect(decrypt(blob)).toBe("sk-abc");
    expect(encrypt("sk-abc")).not.toBe(blob);
  });
  it("hashes and verifies passwords with scrypt", () => {
    const h = hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
  });
  it("masks keys", () => {
    expect(maskKey("sk-proj-1234567890")).toBe("sk-pro…7890");
    expect(maskKey("")).toBe("");
  });
});
