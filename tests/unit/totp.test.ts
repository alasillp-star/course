import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, buildOtpauthUri, hotp, totp, verifyTotp } from "@/modules/identity/totp";

// RFC 6238 Appendix B (SHA-1, 8 digits, secret "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(VECTORS)("matches the RFC test vector at T=%i", (seconds, expected) => {
    expect(totp(RFC_SECRET, seconds * 1000, 8)).toBe(expected);
  });

  it("matches RFC 4226 HOTP vectors", () => {
    const secret = Buffer.from("12345678901234567890", "ascii");
    expect(hotp(secret, 0)).toBe("755224");
    expect(hotp(secret, 9)).toBe("520489");
  });

  it("round-trips base32", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 77]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it("accepts ±1 step of clock skew and rejects replays", () => {
    const now = 1_700_000_000_000;
    const code = totp(RFC_SECRET, now - 30_000);
    const step = verifyTotp(RFC_SECRET, code, { nowMs: now });
    expect(step).toBe(Math.floor(now / 30_000) - 1);
    expect(verifyTotp(RFC_SECRET, code, { nowMs: now, afterStep: step })).toBeNull();
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 120_000), { nowMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", { nowMs: now })).toBeNull();
  });

  it("builds an otpauth URI for authenticator apps", () => {
    const uri = buildOtpauthUri({ secret: "ABC", accountName: "a@b.c", issuer: "Oryx Academy" });
    expect(uri).toMatch(/^otpauth:\/\/totp\/Oryx%20Academy%3Aa%40b\.c\?/);
    expect(uri).toContain("secret=ABC");
  });
});
