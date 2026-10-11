# ADR-0002 — First-party e-mail OTP authentication (not Supabase Auth)

**Status:** accepted

## Context
Requirements: passwordless e-mail OTP; no account without a verified e-mail; QR redemption that
creates/links the account, grants access and consumes the card **atomically**; device list with
per-device revocation and "sign out everywhere"; mandatory MFA for staff; strict brute-force limits.

## Options
1. **Supabase Auth** — mature, but the user row is created by GoTrue outside our transaction, sessions
   are JWTs (revocation is delayed until expiry), device listing requires the service role, and default
   e-mail rate limits are tight. It also couples the platform to one vendor.
2. **Auth library (Auth.js / Better Auth)** — faster start, but OTP-plus-card redemption, device
   management and staff MFA would still be custom, on top of a fast-moving dependency.
3. **First-party implementation** on PostgreSQL following OWASP guidance — small, auditable surface.

## Decision
Option 3:
* OTP: 6 digits from a CSPRNG, stored as HMAC-SHA256 (keyed, bound to the challenge id), 10-minute
  expiry, 5 attempts per code, single use, newest code invalidates older ones, per-IP / per-e-mail /
  per-day limits, identical responses for unknown e-mails (no enumeration).
* Sessions: 256-bit random token in an `HttpOnly; SameSite=Lax; Secure` (`__Host-` prefixed) cookie;
  only its SHA-256 is stored. Server-side lookup on each request ⇒ instant revocation. Sliding 30-day
  expiry, per-account device limit (default 5).
* Staff: RFC 6238 TOTP with encrypted secrets, replay protection and single-use recovery codes.

## Consequences
* We own the security of this code: it is covered by unit vectors (RFC 4226/6238) and integration tests.
* The database stays portable (Supabase Postgres, Neon, RDS, self-hosted).
* Supabase can still be used as managed Postgres and Storage; its Data API is locked out by RLS (ADR-0003).
