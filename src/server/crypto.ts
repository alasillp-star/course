import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "./env";

/** URL-safe random token (default 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Uniformly random numeric string of `digits` length (e.g. OTPs, PINs). */
export function randomDigits(digits: number): string {
  let out = "";
  for (let i = 0; i < digits; i += 1) out += String(randomInt(0, 10));
  return out;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-time comparison of two hex/base64 digests. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// Keyed hashing with domain separation
// ---------------------------------------------------------------------------

/**
 * Purposes for keyed digests. Each purpose gets its own sub-key derived with
 * HKDF, so a digest computed for one purpose is useless for another.
 */
export type HmacPurpose =
  "otp-code" | "mfa-recovery-code" | "activation-code" | "activation-pin" | "rate-limit-key";

const keyCache = new Map<HmacPurpose, Buffer>();

function baseSecretFor(purpose: HmacPurpose): string {
  const env = getEnv();
  return purpose === "activation-code" || purpose === "activation-pin"
    ? env.ACTIVATION_CODE_PEPPER
    : env.AUTH_SECRET;
}

function hmacKey(purpose: HmacPurpose): Buffer {
  let key = keyCache.get(purpose);
  if (!key) {
    const ikm = Buffer.from(baseSecretFor(purpose), "base64");
    key = Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), `academy:${purpose}:v1`, 32));
    keyCache.set(purpose, key);
  }
  return key;
}

/** HMAC-SHA256 hex digest of `input` under the sub-key for `purpose`. */
export function keyedHash(purpose: HmacPurpose, input: string): string {
  return createHmac("sha256", hmacKey(purpose)).update(input, "utf8").digest("hex");
}

export function verifyKeyedHash(purpose: HmacPurpose, input: string, expectedHex: string): boolean {
  return safeEqual(keyedHash(purpose, input), expectedHex);
}

// ---------------------------------------------------------------------------
// Authenticated encryption (AES-256-GCM) with key rotation support
// ---------------------------------------------------------------------------

const CIPHER_VERSION = "v1";

function keyId(key: Buffer): string {
  return sha256Hex(key).slice(0, 8);
}

function encryptionKeys(): { current: Buffer; all: Map<string, Buffer> } {
  const env = getEnv();
  const current = Buffer.from(env.DATA_ENCRYPTION_KEY, "base64");
  const all = new Map<string, Buffer>([[keyId(current), current]]);
  if (env.DATA_ENCRYPTION_KEY_PREVIOUS) {
    const previous = Buffer.from(env.DATA_ENCRYPTION_KEY_PREVIOUS, "base64");
    all.set(keyId(previous), previous);
  }
  return { current, all };
}

/**
 * Encrypts `plaintext`. `context` is bound as additional authenticated data
 * (e.g. "activation_code:<id>:pin") so a ciphertext copied to another row or
 * field fails to decrypt.
 */
export function encrypt(plaintext: string, context: string): string {
  const { current } = encryptionKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CIPHER_VERSION,
    keyId(current),
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decrypt(payload: string, context: string): string {
  const [version, kid, iv, ciphertext, tag] = payload.split(".");
  if (version !== CIPHER_VERSION || !kid || !iv || !ciphertext || !tag) {
    throw new Error("Malformed ciphertext");
  }
  const key = encryptionKeys().all.get(kid);
  if (!key) throw new Error("Ciphertext was encrypted with an unknown key");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Test helper: clear derived keys after changing secrets in process.env. */
export function resetCryptoCache(): void {
  keyCache.clear();
}
