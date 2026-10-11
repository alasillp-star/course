import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual } from "../crypto";

/**
 * Verifies "timestamp.body" HMAC-SHA256 webhook signatures, the scheme used by
 * both Mux (`Mux-Signature: t=…,v1=…`) and Cloudflare Stream
 * (`Webhook-Signature: time=…,sig1=…`). Rejects stale timestamps (replays).
 */
export function verifyTimestampedSignature(params: {
  header: string | null;
  rawBody: string;
  secret: string;
  timestampKey: "t" | "time";
  signatureKey: "v1" | "sig1";
  toleranceSeconds?: number;
  nowMs?: number;
}): boolean {
  if (!params.header) return false;
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of params.header.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === params.timestampKey) timestamp = Number(value);
    else if (key === params.signatureKey) signatures.push(value);
  }
  if (!timestamp || !Number.isFinite(timestamp) || signatures.length === 0) return false;
  const now = (params.nowMs ?? Date.now()) / 1000;
  if (Math.abs(now - timestamp) > (params.toleranceSeconds ?? 300)) return false;
  const expected = createHmac("sha256", params.secret)
    .update(`${timestamp}.${params.rawBody}`, "utf8")
    .digest("hex");
  return signatures.some((signature) => safeEqual(signature.toLowerCase(), expected));
}
