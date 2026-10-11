# Security model

## Controls by requirement

| Requirement | Control | Where | Verified by |
|---|---|---|---|
| One QR ⇒ one account | Row lock + single transaction + partial unique indexes | `redemption.service.ts`, schema | integration: concurrent redemption, rollback |
| Hash, not raw codes | HMAC-SHA256 with a pepper outside the DB; PIN bound to card id | `activation/codes.ts` | unit + integration |
| Race conditions | `SELECT … FOR UPDATE`, conditional updates, unique constraints | services | integration |
| Codes never in logs/analytics | Code travels in `#fragment` and POST bodies only; logger redacts `code/pin/otp/token…` keys and masks e-mails | `proxy.ts`, `activation-flow.tsx`, `logger.ts` | unit (redaction), E2E (URL wiped) |
| Bot / brute-force limits | Per-IP, per-e-mail, per-day limits; 5 tries per OTP; 10 wrong PINs lock a card; MFA 10 / 15 min | `rate-limit.ts`, services | integration + E2E (429) |
| Unguessable codes | 80-bit CSPRNG card codes, 256-bit session tokens, 6-digit OTP with attempt caps | `crypto.ts` | unit |
| Revoke before activation | Revoke / replace / unlock with reasons, audited | `admin-codes.service.ts` | integration + E2E |
| Theft / photo before sale | Scratch-off PIN, point-of-sale activation, tamper evidence, lock-out | ADR-0005 | integration + E2E |
| Lost phone | Account bound to e-mail, not device; device list + remote sign-out | sessions | E2E |
| No active account without verified e-mail | Accounts created only after OTP; invited staff accounts are unusable until their first OTP | `users.service.ts`, `admin-users.service.ts` | integration |
| Duplicate e-mails | Normalised + unique index | schema | integration |
| E-mail change | Recent sign-in + OTP to the new address + notice to the old one + other sessions revoked | `email-change.service.ts` | — (manual; E2E planned) |
| Auth ≠ entitlement | `hasCourseAccess()` is the only content gate | `entitlements.service.ts` | integration |
| Server-side RBAC | Permission catalogue, `assertCan` in services, `requireApiActor`/`requirePageActor` | `modules/access` | unit (matrix), integration, E2E (403s) |
| Admin MFA | TOTP (RFC 6238) with replay protection, recovery codes, 12 h freshness | `mfa.service.ts` | unit vectors, integration, E2E |
| CSRF | SameSite=Lax cookies + Origin check on unsafe methods + JSON-only bodies | `server/http/api.ts` | unit + E2E |
| XSS | React escaping + strict nonce CSP (`'strict-dynamic'`, no inline scripts) | `proxy.ts` | E2E headers |
| SQL injection | Parameterised queries only (Drizzle); no string-built SQL with user input | — | code review |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | `next.config.ts` | E2E |
| Secure cookies | `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix on HTTPS | `identity/current.ts` | E2E |
| Secrets | Env-only, validated at boot, never sent to the browser (`server-only` imports) | `server/env.ts` | build |
| PII minimisation | Masked e-mails for staff without `users.read`; phone/IP need `users.read_sensitive` | services | integration |
| Database exposure | RLS on every table, Supabase API roles revoked | migration `0001` | integration |
| Tamper-proof audit | Append-only triggers | migration `0001` | integration |
| Spreadsheet injection | CSV cells starting with `= + - @` are neutralised | `server/csv.ts` | unit |

## Secrets

| Variable | Purpose | Rotation |
|---|---|---|
| `AUTH_SECRET` | HMAC for OTPs, recovery codes, rate-limit keys | Safe to rotate: pending OTPs become invalid (users request a new code) |
| `ACTIVATION_CODE_PEPPER` | HMAC for card codes and PINs | **Do not rotate** unless compromised: unredeemed cards stop working |
| `DATA_ENCRYPTION_KEY` (+ `_PREVIOUS`) | AES-256-GCM for printable card secrets and TOTP secrets | Supported: set the old key as `_PREVIOUS`, deploy, re-encrypt, remove |

Generate with `npm run secrets:generate`. Keep them in the hosting provider's secret store, never in git.
Back up `DATA_ENCRYPTION_KEY` and `ACTIVATION_CODE_PEPPER` separately from database backups.

## Data protection

* Retention (`npm run maintenance:cleanup`, daily): OTP challenges 7 days, dead sessions 30 days,
  e-mail logs 90 days. Audit logs are kept.
* Export / deletion requests are tracked in `data_requests`; deletion anonymises the user row
  (`status = deleted`, e-mail replaced) so orders and audit history stay consistent.
* Consent records (`consents`) store terms/privacy versions and marketing opt-in.

## Video protection

See [ADR-0006](./adr/0006-video-protection.md): signed short-lived playback, entitlement check per token,
domain restriction, dynamic watermark, device limits, optional DRM. Screen recording cannot be fully prevented.

## Reporting a vulnerability

Send details to the security contact configured for the academy. Do not open public issues for vulnerabilities.
