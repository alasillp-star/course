import { describe, expect, it } from "vitest";
import {
  batchSerialPrefix,
  formatCardCode,
  formatCardPin,
  formatSerial,
  generateCardCode,
  generateCardPin,
  hashCardCode,
  hashCardPin,
  normalizeCardCode,
  normalizeCardPin,
  verifyCardPin,
} from "@/modules/activation/codes";

describe("activation card codes", () => {
  it("generates 16-character Crockford base32 codes (80 bits) without collisions", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const code = generateCardCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
      codes.add(code);
    }
    expect(codes.size).toBe(10_000);
  });

  it("normalises user input (case, separators, look-alike letters)", () => {
    expect(normalizeCardCode("abcd-efgh-jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
    expect(normalizeCardCode(" o1l1 OOII llLL 2345 ")).toBe("0111001111112345");
    expect(normalizeCardCode("ABCD EFGH JKMN PQR")).toBeNull();
    expect(normalizeCardCode("ABCD-EFGH-JKMN-PQRU")).toBeNull(); // U is not in the alphabet
  });

  it("formats codes, PINs and serials for printing", () => {
    expect(formatCardCode("ABCDEFGHJKMNPQRS")).toBe("ABCD-EFGH-JKMN-PQRS");
    expect(formatCardPin("12345678")).toBe("1234 5678");
    expect(formatSerial(batchSerialPrefix(7), 42)).toBe("B0007-00042");
  });

  it("generates 8-digit PINs and normalises PIN input", () => {
    expect(generateCardPin()).toMatch(/^\d{8}$/);
    expect(normalizeCardPin("1234 5678")).toBe("12345678");
    expect(normalizeCardPin("1234-567")).toBeNull();
  });

  it("keys digests with the pepper and binds PINs to their card", () => {
    const digest = hashCardCode("ABCDEFGHJKMNPQRS");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(hashCardCode("ABCDEFGHJKMNPQRS"));
    const pinDigest = hashCardPin("card-a", "12345678");
    expect(pinDigest).not.toBe(hashCardPin("card-b", "12345678"));
    expect(verifyCardPin("card-a", "12345678", pinDigest)).toBe(true);
    expect(verifyCardPin("card-b", "12345678", pinDigest)).toBe(false);
  });
});
