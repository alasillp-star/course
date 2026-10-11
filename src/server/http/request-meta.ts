import { isIP } from "node:net";
import { randomUUID } from "node:crypto";

export type RequestMeta = {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
};

/**
 * Extracts client metadata from request headers. Proxy headers are only
 * trusted when TRUST_PROXY_HEADERS is enabled (the default for platforms such
 * as Vercel that overwrite them); otherwise the IP is unknown rather than
 * attacker-controlled.
 */
export function requestMetaFromHeaders(headers: Headers): RequestMeta {
  const trustProxy = process.env.TRUST_PROXY_HEADERS !== "false";
  let ip: string | null = null;
  if (trustProxy) {
    const candidates = [
      headers.get("x-real-ip"),
      headers.get("x-forwarded-for")?.split(",")[0],
      headers.get("cf-connecting-ip"),
    ];
    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value && isIP(value)) {
        ip = value;
        break;
      }
    }
  }
  const userAgent = headers.get("user-agent")?.slice(0, 512) ?? null;
  const incomingId = headers.get("x-request-id");
  const requestId =
    incomingId && /^[A-Za-z0-9._-]{8,128}$/.test(incomingId) ? incomingId : randomUUID();
  return { ip, userAgent, requestId };
}

export const SYSTEM_REQUEST_META: RequestMeta = {
  ip: null,
  userAgent: "system",
  requestId: "system",
};
