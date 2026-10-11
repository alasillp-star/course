import { createHmac, randomBytes } from "node:crypto";

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30-second steps, 6 digits) — the profile every
 * authenticator app supports (Google Authenticator, Microsoft Authenticator,
 * 1Password, Authy...). Secrets use RFC 4648 base32 as apps expect.
 */

const RFC4648 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += RFC4648[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += RFC4648[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = RFC4648.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit secret, as recommended by RFC 4226. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(message).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function timeStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function totp(secretBase32: string, nowMs: number = Date.now(), digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretBase32), timeStep(nowMs), digits);
}

/**
 * Verifies a code within ±`window` steps (clock skew tolerance). Returns the
 * matched time-step so callers can reject replays (step <= last used step).
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { nowMs?: number; window?: number; afterStep?: number | null } = {},
): number | null {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const secret = base32Decode(secretBase32);
  const current = timeStep(options.nowMs);
  const window = options.window ?? 1;
  for (let delta = -window; delta <= window; delta += 1) {
    const step = current + delta;
    if (options.afterStep != null && step <= options.afterStep) continue;
    const expected = hotp(secret, step);
    // Both strings are 6 ASCII digits; comparison time does not depend on secret material.
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ normalized.charCodeAt(i);
    if (diff === 0) return step;
  }
  return null;
}

export function buildOtpauthUri(params: { secret: string; accountName: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
