# ADR-0004 — Strict nonce-based CSP instead of Partial Prerendering

**Status:** accepted

## Context
Next.js 16.4 scaffolds enable Cache Components / Partial Prerendering. Its documentation states that
PPR is incompatible with nonce-based CSP (the static shell cannot carry a per-request nonce).
The platform hosts user-generated content (community) and a powerful admin area, so XSS resistance
is a priority.

## Decision
`cacheComponents: false`. `src/proxy.ts` issues a fresh nonce per request and sends
`script-src 'self' 'nonce-…' 'strict-dynamic'` (plus `object-src 'none'`, `base-uri 'self'`,
`frame-ancestors 'none'`, `form-action 'self'`). Inline styles stay allowed (React/Radix need style
attributes); script execution remains nonce-locked. All HTML is server-rendered per request.

## Consequences
* An injected `<script>` cannot run even if output escaping fails somewhere.
* No static HTML caching at the CDN for pages; acceptable for an authenticated product. Revisit when
  Next.js supports nonces with PPR, or move marketing pages to a separate static deployment.
