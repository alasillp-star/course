import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  isEnabledLocale,
  isLocale,
  LOCALE_COOKIE,
  matchLocale,
  type Locale,
} from "@/i18n/config";

/**
 * Network-edge concerns only:
 *  1. Locale routing (/ -> /ar, cookie / Accept-Language aware).
 *  2. Short activation link printed in QR codes: /a#CODE -> /{locale}/activate#CODE
 *     (browsers carry the #fragment across redirects; it never reaches the server).
 *  3. A per-request nonce and strict Content-Security-Policy for HTML documents.
 *  4. Optimistic redirect to sign-in when no session cookie is present.
 * Authorisation itself is enforced server-side in layouts, pages and route handlers.
 */

const SESSION_COOKIES = ["__Host-academy_session", "academy_session"];

function preferredLocale(request: NextRequest): Locale {
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isEnabledLocale(fromCookie)) return fromCookie;
  return matchLocale(request.headers.get("accept-language"));
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const httpsOnly = (process.env.APP_URL ?? "").startsWith("https://");
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are needed by React/Radix; script execution stays nonce-locked.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(httpsOnly ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/a" || pathname === "/a/") {
    const response = NextResponse.redirect(new URL(`/${preferredLocale(request)}/activate`, request.url), 307);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  const segment = pathname.split("/")[1] ?? "";
  if (!isLocale(segment) || !isEnabledLocale(segment)) {
    const locale = isLocale(segment) ? DEFAULT_LOCALE : preferredLocale(request);
    const rest = isLocale(segment) ? pathname.slice(segment.length + 1) : pathname;
    const target = new URL(`/${locale}${rest === "/" ? "" : rest}${search}`, request.url);
    return NextResponse.redirect(target, 307);
  }

  const area = pathname.split("/")[2];
  if ((area === "app" || area === "admin") && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const login = new URL(`/${segment}/login`, request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login, 307);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (area === "activate") response.headers.set("Referrer-Policy", "no-referrer");
  if (area === "app" || area === "admin") response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
