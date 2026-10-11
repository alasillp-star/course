import "server-only";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getEnv } from "../env";
import { logger } from "../logger";
import { AppError, isAppError } from "./errors";
import { requestMetaFromHeaders, type RequestMeta } from "./request-meta";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_JSON_BODY_BYTES = 32 * 1024;

/** Error details that are safe to return to clients. */
const PUBLIC_DETAIL_KEYS = new Set(["attemptsRemaining", "retryAfterSeconds", "field", "status"]);

export type ApiContext<P> = { params: Promise<P>; meta: RequestMeta };

/**
 * CSRF defence for cookie-authenticated endpoints: state-changing requests
 * must come from our own origin. Combined with SameSite=Lax cookies and JSON
 * bodies (which cross-site forms cannot produce), this blocks cross-site
 * request forgery without per-form tokens.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError("CSRF_REJECTED");
    }
    const trustProxy = process.env.TRUST_PROXY_HEADERS !== "false";
    const allowed = new Set<string>([new URL(getEnv().APP_URL).host]);
    const host = (trustProxy && request.headers.get("x-forwarded-host")) || request.headers.get("host");
    if (host) allowed.add(host);
    if (!allowed.has(originHost)) throw new AppError("CSRF_REJECTED");
    return;
  }
  if (fetchSite === "same-origin") return;
  throw new AppError("CSRF_REJECTED");
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export function errorResponse(error: unknown, meta: RequestMeta): Response {
  if (isAppError(error)) {
    const details = Object.fromEntries(
      Object.entries(error.details ?? {}).filter(([key]) => PUBLIC_DETAIL_KEYS.has(key)),
    );
    const headers = new Headers();
    if (error.code === "RATE_LIMITED" && typeof error.details?.retryAfterSeconds === "number") {
      headers.set("Retry-After", String(error.details.retryAfterSeconds));
    }
    if (error.status >= 500) logger.error("request failed", { requestId: meta.requestId, error });
    return Response.json(
      { error: { code: error.code, ...(Object.keys(details).length ? { details } : {}) } },
      { status: error.status, headers },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      },
      { status: 400 },
    );
  }
  logger.error("unhandled API error", { requestId: meta.requestId, error });
  return Response.json(
    { error: { code: "INTERNAL_ERROR", requestId: meta.requestId } },
    { status: 500 },
  );
}

/**
 * Wraps a Route Handler: request metadata, CSRF origin check for unsafe
 * methods, uniform JSON errors, request id propagation.
 */
export function withApi<P = Record<string, never>>(
  handler: (request: NextRequest, context: ApiContext<P>) => Promise<Response>,
  options: { csrf?: boolean } = {},
) {
  return async (request: NextRequest, routeContext: { params: Promise<P> }): Promise<Response> => {
    const meta = requestMetaFromHeaders(request.headers);
    let response: Response;
    try {
      if (UNSAFE_METHODS.has(request.method) && options.csrf !== false) assertSameOrigin(request);
      response = await handler(request, { params: routeContext.params, meta });
    } catch (error) {
      response = errorResponse(error, meta);
    }
    response.headers.set("x-request-id", meta.requestId);
    return response;
  };
}

/** Parses and validates a JSON body with a size limit. */
export async function parseJsonBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError("INVALID_REQUEST", "Expected application/json");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BODY_BYTES) throw new AppError("INVALID_REQUEST", "Body too large");
  const text = await request.text();
  if (text.length > MAX_JSON_BODY_BYTES) throw new AppError("INVALID_REQUEST", "Body too large");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError("INVALID_REQUEST", "Malformed JSON");
  }
  return schema.parse(json);
}

/** Validates URL search params against a schema (strings in, typed values out). */
export function parseSearchParams<S extends z.ZodType>(request: NextRequest, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
}
