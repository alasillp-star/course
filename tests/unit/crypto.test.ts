import { afterEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, keyedHash, resetCryptoCache, safeEqual } from "@/server/crypto";
import { resetEnvCache } from "@/server/env";

const originalKey = process.env.DATA_ENCRYPTION_KEY;

afterEach(() => {
  process.env.DATA_ENCRYPTION_KEY = originalKey;
  delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
  resetEnvCache();
  resetCryptoCache();
});

describe("authenticated encryption", () => {
  it("round-trips and binds ciphertexts to their context", () => {
    const sealed = encrypt("ABCDEFGHJKMNPQRS", "activation_code:1:code");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("ABCDEFGHJKMNPQRS");
    expect(decrypt(sealed, "activation_code:1:code")).toBe("ABCDEFGHJKMNPQRS");
    expect(() => decrypt(sealed, "activation_code:2:code")).toThrow();
  });

  it("detects tampering", () => {
    const sealed = encrypt("secret", "ctx");
    const parts = sealed.split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 0xff;
    parts[3] = ciphertext.toString("base64url");
    expect(() => decrypt(parts.join("."), "ctx")).toThrow();
  });

  it("decrypts data sealed with the previous key during rotation", () => {
    const sealed = encrypt("rotate-me", "ctx");
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = originalKey;
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    resetEnvCache();
    expect(decrypt(sealed, "ctx")).toBe("rotate-me");
    expect(decrypt(encrypt("new", "ctx"), "ctx")).toBe("new");
  });
});

describe("keyed hashing", () => {
  it("separates purposes", () => {
    expect(keyedHash("otp-code", "x")).not.toBe(keyedHash("activation-code", "x"));
    expect(keyedHash("otp-code", "x")).toBe(keyedHash("otp-code", "x"));
  });

  it("compares in constant time and handles length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
