# HTTP API (v1)

Base path: `/api/v1`. JSON in, JSON out. All responses are `Cache-Control: no-store`.

* **Success:** `{ "data": … }` (HTTP 200/201).
* **Error:** `{ "error": { "code": "STABLE_CODE", "details"?: { … } } }` with the matching HTTP status.
  Clients localise `code` (see `errors` in `src/i18n/dictionaries/*`). Internal details are never exposed;
  500s include a `requestId` that matches server logs (`x-request-id` header on every response).

## Authentication & CSRF

* Session: `HttpOnly` cookie (`__Host-academy_session` over HTTPS, `academy_session` on http://localhost).
* State-changing requests (`POST/PUT/PATCH/DELETE`) must come from the app's origin: the `Origin`
  header (or `Sec-Fetch-Site: same-origin`) is checked → otherwise `403 CSRF_REJECTED`.
  Bodies must be `application/json` (≤ 32 KB).
* Admin endpoints (`/api/v1/admin/**`) require a staff role **and** a second factor completed within
  `STAFF_MFA_MAX_AGE_HOURS` → otherwise `401 MFA_REQUIRED`; missing permission → `403 FORBIDDEN`.
* Sensitive downloads reject cross-site navigations (`Sec-Fetch-Site: cross-site`).

## Public: sign-in

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `POST /auth/otp/request` | `{ email, locale? }` | `{ challengeId, expiresAt }` | Same response whether or not the e-mail has an account. Limits: 5/h and 15/day per e-mail, 30/h per IP |
| `POST /auth/otp/verify` | `{ challengeId, code, locale?, next? }` | `{ redirectTo, isStaff }` + session cookie | 5 attempts per code; `OTP_INVALID`, `OTP_EXPIRED`, `OTP_TOO_MANY_ATTEMPTS`, `ACCOUNT_SUSPENDED` |
| `POST /auth/logout` | `{}` | `{ signedOut }` | Revokes the current session server-side |

## Public: QR activation

| Method & path | Body | Response | Errors |
|---|---|---|---|
| `POST /activation/check` | `{ code }` | `{ requiresPin, course: { title } }` | `ACTIVATION_CODE_INVALID`, `…_ALREADY_USED`, `…_REVOKED`, `…_NOT_SOLD`, `…_EXPIRED`, `…_LOCKED` |
| `POST /activation/start` | `{ code, pin?, email, locale? }` | `{ challengeId, expiresAt, emailMasked }` | `ACTIVATION_PIN_REQUIRED`, `ACTIVATION_PIN_INVALID` (`details.attemptsRemaining`), card errors above |
| `POST /activation/complete` | `{ challengeId, otp, locale? }` | `{ accountCreated, redirectTo }` + session cookie | OTP errors, card errors, `ALREADY_ENTITLED` (card not consumed), `ACCOUNT_SUSPENDED` |

The card code is always sent in the request body, never in a URL.

## Signed-in user

| Method & path | Body | Response |
|---|---|---|
| `GET /me` | — | `{ id, email, locale, roles, isStaff, mfaVerified, entitlements[] }` |
| `GET /auth/sessions` | — | `[{ id, deviceLabel, clientType, createdAt, lastSeenAt, current }]` |
| `DELETE /auth/sessions` | — | `{ revoked }` — signs out all **other** devices; `?scope=all` includes this one |
| `DELETE /auth/sessions/:sessionId` | — | `{ revoked }` — only the caller's own sessions |
| `POST /me/email/start` | `{ newEmail }` | `{ challengeId, emailMasked }` — requires a sign-in within 30 min (`REAUTHENTICATION_REQUIRED`) |
| `POST /me/email/confirm` | `{ challengeId, code }` | `{ email }` — notifies the old address, signs out other devices; `EMAIL_IN_USE` |

## Staff second factor

| Method & path | Body | Response |
|---|---|---|
| `POST /auth/mfa/totp/enroll` | `{}` | `{ secret, otpauthUri, qrDataUrl }` (`MFA_ALREADY_ENROLLED`) |
| `POST /auth/mfa/totp/confirm` | `{ code }` | `{ recoveryCodes[10] }` — shown once |
| `POST /auth/mfa/verify` | `{ code }` (TOTP or `XXXXX-XXXXX` recovery code) | `{ verified }` — 10 attempts / 15 min |

## Admin — activation cards

| Method & path | Permission | Body / query | Response |
|---|---|---|---|
| `GET /admin/courses` | batches.create ∨ entitlements.grant ∨ content.read | — | courses |
| `GET /admin/activation/batches` | `activation.batches.read` | `limit, offset` | batches with status counts |
| `POST /admin/activation/batches` | `activation.batches.create` | `{ name, courseId, quantity (1–10000), requiresPin, requiresSale, redeemBy?, notes? }` | batch (201) |
| `GET /admin/activation/batches/:id` | `activation.batches.read` | — | batch |
| `GET /admin/activation/batches/:id/codes` | `activation.codes.read` | `status, locked, search, limit, offset` | `{ items, total }` (no secrets) |
| `GET /admin/activation/batches/:id/registry` | `activation.codes.read` | — | CSV registry (no secrets) |
| `GET /admin/activation/batches/:id/cards-pdf` | `activation.codes.export` | `from, to` (≤ 2000 cards) | print-ready PDF — **audited** |
| `GET /admin/activation/batches/:id/printer-data` | `activation.codes.export` | `from, to` | CSV serial/code/PIN/URL — **audited** |
| `POST /admin/activation/batches/:id/finalize` | `activation.batches.finalize` | — | destroys printable secrets (irreversible) |
| `POST /admin/activation/codes/sell` | `activation.codes.sell` | `{ serials[≤2000], orderId? }` | `{ sold[], skipped[] }` |
| `GET /admin/activation/codes/lookup` | `activation.codes.read` | `serial` | `{ id }` |
| `GET /admin/activation/codes/:id` | `activation.codes.read` | — | card + timeline |
| `POST /admin/activation/codes/:id/unsell` | `activation.codes.sell` | — | sold → available |
| `POST /admin/activation/codes/:id/revoke` | `activation.codes.revoke` | `{ reason }` | unused cards only |
| `POST /admin/activation/codes/:id/replace` | `activation.codes.revoke` + `.export` | `{ reason }` | new card secrets, **once** |
| `POST /admin/activation/codes/:id/unlock` | `activation.codes.unlock` | — | clears PIN lock |

## Admin — students, staff, audit, metrics

| Method & path | Permission | Body / query |
|---|---|---|
| `GET /admin/overview` | `reports.read` | — (finance figures only with `finance.reports.read`) |
| `GET /admin/users` | `users.read` | `search, status, access=with\|without, limit, offset` |
| `GET /admin/users/:id` | `users.read` (+ sections per permission) | — |
| `POST /admin/users/:id/suspend` | `users.suspend` | `{ reason }` — also revokes all sessions |
| `POST /admin/users/:id/reactivate` | `users.suspend` | — |
| `DELETE /admin/users/:id/sessions` | `users.sessions.manage` | — |
| `POST /admin/users/:id/entitlements` | `entitlements.grant` | `{ courseId, note, expiresAt? }` |
| `POST /admin/entitlements/:id/revoke` | `entitlements.revoke` | `{ reason }` |
| `GET /admin/staff` | `staff.read` | — |
| `POST /admin/staff/roles` | `staff.manage` (+ `roles.manage` for admin/super_admin) | `{ email, roleKey }` — invites the account if needed |
| `DELETE /admin/staff/roles` | same | `{ email, roleKey }` — the last Super Admin cannot be removed |
| `GET /admin/audit` | `audit.read` | `action, actorEmail, targetType, targetId, from, to, limit, offset` |

## Operations

| Method & path | Description |
|---|---|
| `GET /api/health` | `{ status, database }` — 200 when the database answers, 503 otherwise |

## Error codes

`VALIDATION_ERROR` (400, with `issues[]`), `INVALID_REQUEST`, `UNAUTHENTICATED` (401), `MFA_REQUIRED` (401),
`REAUTHENTICATION_REQUIRED` (401), `FORBIDDEN` (403), `CSRF_REJECTED` (403), `ACCOUNT_SUSPENDED` (403),
`NOT_FOUND` (404), `CONFLICT`/`INVALID_STATE` (409), `RATE_LIMITED` (429 + `Retry-After`),
`OTP_*`, `MFA_*`, `EMAIL_IN_USE`, `ACTIVATION_*`, `ALREADY_ENTITLED`, `INTERNAL_ERROR` (500),
`SERVICE_UNAVAILABLE` (503, e-mail delivery failed).
