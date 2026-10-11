import "server-only";
import { keyedHash, safeEqual } from "./crypto";

/**
 * Compact, tamper-proof, expiring tokens for URLs we issue ourselves (local
 * media streams and file downloads in development, upload targets). Format:
 * base64url(JSON payload) "." HMAC-SHA256 (sub-key derived from AUTH_SECRET).
 * The `use` field separates token kinds, so a download token can never be
 * replayed as a stream token.
 */

export type TokenUse = "local-video" | "local-file" | "local-upload";

type Envelope<T> = { use: TokenUse; exp: number; data: T };

export function signUrlToken<T>(use: TokenUse, data: T, ttlSeconds: number): string {
  const envelope: Envelope<T> = { use, exp: Math.floor(Date.now() / 1000) + ttlSeconds, data };
  const body = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  return `${body}.${keyedHash("signed-url", body)}`;
}

/** Returns the payload, or null when the token is malformed, forged, expired or of another use. */
export function verifyUrlToken<T>(use: TokenUse, token: string): T | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  if (!safeEqual(keyedHash("signed-url", body), signature)) return null;
  let envelope: Envelope<T>;
  try {
    envelope = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Envelope<T>;
  } catch {
    return null;
  }
  if (envelope.use !== use || typeof envelope.exp !== "number") return null;
  if (envelope.exp <= Math.floor(Date.now() / 1000)) return null;
  return envelope.data;
}
