import "server-only";
import { randomBytes } from "node:crypto";
import { keyedHash, randomDigits, verifyKeyedHash } from "@/server/crypto";
import { getEnv } from "@/server/env";

/**
 * Activation card secrets.
 *
 *  - Card code: 16 Crockford base32 characters = 80 bits of CSPRNG output,
 *    encoded in the QR code and printed for manual entry (XXXX-XXXX-XXXX-XXXX).
 *    Guessing is infeasible (2^80 space) and lookups are rate-limited.
 *  - PIN: 8 digits under a scratch-off panel. A photographed QR code is useless
 *    without it, and a scratched panel shows the card was tampered with.
 *  - Serial: printed, non-secret identifier for sales and support.
 *
 * Only keyed HMAC-SHA256 digests are used for lookups; the PIN digest is
 * bound to the card id so PIN digests cannot be compared across cards.
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CARD_CODE_LENGTH = 16;
export const CARD_PIN_LENGTH = 8;
export const MAX_FAILED_PIN_ATTEMPTS = 10;

export function generateCardCode(): string {
  const bytes = randomBytes(10); // 80 bits -> exactly 16 base32 symbols
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

export function generateCardPin(): string {
  return randomDigits(CARD_PIN_LENGTH);
}

/**
 * Normalises user input: case-insensitive, separators ignored, and the
 * look-alike letters O/I/L read as 0/1 (Crockford). Returns null if invalid.
 */
export function normalizeCardCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== CARD_CODE_LENGTH) return null;
  for (const char of cleaned) if (!CROCKFORD.includes(char)) return null;
  return cleaned;
}

export function normalizeCardPin(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

export function formatCardCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export function formatCardPin(pin: string): string {
  return `${pin.slice(0, 4)} ${pin.slice(4)}`;
}

export function hashCardCode(normalizedCode: string): string {
  return keyedHash("activation-code", normalizedCode);
}

export function hashCardPin(codeId: string, normalizedPin: string): string {
  return keyedHash("activation-pin", `${codeId}:${normalizedPin}`);
}

export function verifyCardPin(codeId: string, normalizedPin: string, pinHash: string): boolean {
  return verifyKeyedHash("activation-pin", `${codeId}:${normalizedPin}`, pinHash);
}

/**
 * URL encoded in the QR code. The code travels in the fragment (#...), which
 * browsers never send to servers: it stays out of access logs, CDN logs and
 * Referer headers. The activation page reads it client-side, then removes it
 * from the address bar.
 */
export function cardActivationUrl(code: string): string {
  return `${getEnv().APP_URL}/a#${code}`;
}

export function formatSerial(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(5, "0")}`;
}

export function batchSerialPrefix(batchNumber: number): string {
  return `B${String(batchNumber).padStart(4, "0")}`;
}

/** AAD contexts binding ciphertexts to their row and field. */
export const cipherContext = {
  code: (codeId: string) => `activation_code:${codeId}:code`,
  pin: (codeId: string) => `activation_code:${codeId}:pin`,
};
