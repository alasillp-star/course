import "server-only";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { safeEqual } from "../crypto";
import { AppError } from "./errors";

export const MAX_INTEGRATION_BODY_BYTES = 512 * 1024;

/**
 * Authenticates a server-to-server call with a shared token (no cookies, no
 * CSRF). The token is accepted, in order of preference, from
 * `Authorization: Bearer …`, `X-Api-Key`, `X-Webhook-Token`, or a `token`
 * query parameter for senders that can only be given a URL (query strings may
 * end up in access logs: rotate the token if a log leaks).
 *
 * When `hmacSecret` is set, the raw body must also carry a valid HMAC-SHA256
 * signature (`X-Signature` / `X-Hub-Signature-256` / `X-Webhook-Signature`,
 * hex, optionally prefixed with "sha256=").
 */
export function assertIntegrationAuth(
  request: NextRequest,
  params: { token: string | undefined; hmacSecret?: string; rawBody?: string },
): void {
  if (!params.token) throw new AppError("PROVIDER_NOT_CONFIGURED");
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = /^bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  const presented =
    bearer ||
    request.headers.get("x-api-key")?.trim() ||
    request.headers.get("x-webhook-token")?.trim() ||
    request.nextUrl.searchParams.get("token")?.trim();
  if (!presented || !safeEqual(presented, params.token)) throw new AppError("UNAUTHENTICATED");

  if (params.hmacSecret) {
    const header =
      request.headers.get("x-signature") ??
      request.headers.get("x-hub-signature-256") ??
      request.headers.get("x-webhook-signature");
    const signature = header
      ?.trim()
      .replace(/^sha256=/i, "")
      .toLowerCase();
    const expected = createHmac("sha256", params.hmacSecret)
      .update(params.rawBody ?? "", "utf8")
      .digest("hex");
    if (!signature || !safeEqual(signature, expected)) {
      throw new AppError("WEBHOOK_SIGNATURE_INVALID");
    }
  }
}

/** Reads a JSON body with a size cap; returns both the raw text (for HMAC) and the value. */
export async function readIntegrationJson(
  request: Request,
): Promise<{ rawBody: string; json: unknown }> {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_INTEGRATION_BODY_BYTES) {
    throw new AppError("INVALID_REQUEST", "Body too large");
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_INTEGRATION_BODY_BYTES) {
    throw new AppError("INVALID_REQUEST", "Body too large");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { rawBody, json: Object.fromEntries(new URLSearchParams(rawBody)) };
  }
  try {
    return { rawBody, json: JSON.parse(rawBody) };
  } catch {
    throw new AppError("INVALID_REQUEST", "Malformed JSON");
  }
}
