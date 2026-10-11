import "server-only";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";

/**
 * Accepts a PEM private key either raw or base64-encoded (both Mux and
 * Cloudflare hand out base64-encoded PEMs, which fit in a single env var).
 */
export function loadPrivateKey(value: string): KeyObject {
  const pem = value.includes("-----BEGIN")
    ? value
    : Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8");
  if (!pem.includes("-----BEGIN")) throw new Error("Signing key is not a PEM private key");
  return createPrivateKey(pem);
}

/** Minimal RS256 JSON Web Token (RFC 7519) — the format both video providers verify. */
export function signRs256Jwt(
  payload: Record<string, unknown>,
  key: KeyObject,
  keyId: string,
): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "RS256", typ: "JWT", kid: keyId })}.${encode(payload)}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), key).toString("base64url");
  return `${input}.${signature}`;
}
