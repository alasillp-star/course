# HTTP API (v1)

Base path: `/api/v1`. JSON in, JSON out. All responses are `Cache-Control: no-store`.

- **Success:** `{ "data": … }` (HTTP 200/201).
- **Error:** `{ "error": { "code": "STABLE_CODE", "details"?: { … } } }` with the matching HTTP status.
  Clients localise `code` (see `errors` in `src/i18n/dictionaries/*`). Internal details are never exposed;
  500s include a `requestId` that matches server logs (`x-request-id` header on every response).

## Authentication & CSRF

- Session: `HttpOnly` cookie (`__Host-academy_session` over HTTPS, `academy_session` on http://localhost).
- State-changing requests (`POST/PUT/PATCH/DELETE`) must come from the app's origin: the `Origin`
  header (or `Sec-Fetch-Site: same-origin`) is checked → otherwise `403 CSRF_REJECTED`.
  Bodies must be `application/json` (≤ 32 KB).
- Admin endpoints (`/api/v1/admin/**`) require a staff role **and** a second factor completed within
  `STAFF_MFA_MAX_AGE_HOURS` → otherwise `401 MFA_REQUIRED`; missing permission → `403 FORBIDDEN`.
- Sensitive downloads reject cross-site navigations (`Sec-Fetch-Site: cross-site`).

## Public: sign-in

| Method & path            | Body                                    | Response                                   | Notes                                                                                                  |
| ------------------------ | --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `POST /auth/otp/request` | `{ email, locale? }`                    | `{ challengeId, expiresAt }`               | Same response whether or not the e-mail has an account. Limits: 5/h and 15/day per e-mail, 30/h per IP |
| `POST /auth/otp/verify`  | `{ challengeId, code, locale?, next? }` | `{ redirectTo, isStaff }` + session cookie | 5 attempts per code; `OTP_INVALID`, `OTP_EXPIRED`, `OTP_TOO_MANY_ATTEMPTS`, `ACCOUNT_SUSPENDED`        |
| `POST /auth/logout`      | `{}`                                    | `{ signedOut }`                            | Revokes the current session server-side                                                                |

## Public: QR activation

| Method & path               | Body                             | Response                                          | Errors                                                                                                                          |
| --------------------------- | -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `POST /activation/check`    | `{ code }`                       | `{ requiresPin, course: { title } }`              | `ACTIVATION_CODE_INVALID`, `…_ALREADY_USED`, `…_REVOKED`, `…_NOT_SOLD`, `ACTIVATION_AWAITING_DELIVERY`, `…_EXPIRED`, `…_LOCKED` |
| `POST /activation/start`    | `{ code, pin?, email, locale? }` | `{ challengeId, expiresAt, emailMasked }`         | `ACTIVATION_PIN_REQUIRED`, `ACTIVATION_PIN_INVALID` (`details.attemptsRemaining`), card errors above                            |
| `POST /activation/complete` | `{ challengeId, otp, locale? }`  | `{ accountCreated, redirectTo }` + session cookie | OTP errors, card errors, `ALREADY_ENTITLED` (card not consumed), `ACCOUNT_SUSPENDED`                                            |

The card code is always sent in the request body, never in a URL. Current cards are QR-only
(`requiresPin: false`); the PIN fields remain for legacy print runs. `ACTIVATION_AWAITING_DELIVERY` (409):
the card is packed in a customer's parcel that the carrier has not reported delivered yet.

## Student learning

All require a session **and** course access (`403 COURSE_ACCESS_REQUIRED` otherwise; free-preview lessons excepted).

| Method & path                                        | Body                                       | Response / notes                                                                                       |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GET /lessons/:id/playback`                          | —                                          | short-lived, viewer-bound source (`hls` signed URL for Mux/Stream, `file` for the dev provider); 300/h |
| `POST /lessons/:id/progress`                         | `{ positionSeconds, playedRanges[[a,b]] }` | heartbeat; coverage capped by elapsed time server-side; completion at the lesson's threshold; 1200/h   |
| `POST /lessons/:id/complete`                         | —                                          | lessons without video only                                                                             |
| `GET/POST /lessons/:id/notes`                        | `{ body, videoTimestampSeconds? }`         | the caller's notes only                                                                                |
| `PATCH/DELETE /notes/:noteId`                        | `{ body }`                                 | author only                                                                                            |
| `GET /lessons/:id/resources/:resourceId`             | —                                          | `302` to a 5-minute URL (presigned S3, or signed local URL in development); 120/h                      |
| `GET /files/:token`, `GET /media/local-video/:token` | —                                          | development storage/video only (refused in staging/production by configuration); `Range` supported     |

## Admin — course content and media

| Method & path                                                        | Permission             | Body                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/content/courses/:id`                                     | `content.read`         | outline with drafts                                                                                                          |
| `POST /admin/content/modules`                                        | `content.manage`       | `{ courseId, title{ar,fr,en}, description? }`                                                                                |
| `PATCH/DELETE /admin/content/modules/:id`                            | `content.manage`       | `{ title?, description?, status?, publishAt? }`                                                                              |
| `PUT /admin/content/courses/:id/module-order`                        | `content.manage`       | `{ moduleIds[] }`                                                                                                            |
| `POST /admin/content/lessons`                                        | `content.manage`       | `{ moduleId, title }`                                                                                                        |
| `GET/PATCH/DELETE /admin/content/lessons/:id`                        | content.read / .manage | `{ title?, summary?, body? (Markdown), isFreePreview?, completionThresholdPercent?, durationSeconds?, status?, publishAt? }` |
| `PUT /admin/content/modules/:id/lesson-order`                        | `content.manage`       | `{ lessonIds[] }`                                                                                                            |
| `POST /admin/content/lessons/:id/resources`                          | `content.manage`       | `{ kind: "link", title, url (https) }` or `{ kind: "file", title, filename, sizeBytes, contentType }` → upload URL           |
| `PUT /admin/content/lessons/:id/resource-order`                      | `content.manage`       | `{ resourceIds[] }`                                                                                                          |
| `PATCH/DELETE /admin/content/resources/:id`                          | `content.manage`       | `{ title?, url? }`                                                                                                           |
| `DELETE /admin/content/lessons/:id/video`                            | `media.manage`         | detaches the lesson video                                                                                                    |
| `GET /admin/media/providers`                                         | `media.manage`         | which video/storage providers are configured                                                                                 |
| `POST /admin/media/videos`                                           | `media.manage`         | `{ lessonId, filename, sizeBytes, contentType }` → direct upload (Mux / Stream tus / local)                                  |
| `POST /admin/media/:assetId/complete`, `GET /admin/media/:assetId`   | `media.manage`         | finalise / poll an upload                                                                                                    |
| `POST /webhooks/video/mux`, `POST /webhooks/video/cloudflare-stream` | provider signature     | asset ready / errored (HMAC, 5-minute replay window)                                                                         |

## Integrations (server-to-server)

Shared-token authentication (`Authorization: Bearer …`), no cookies. Full contract, field names and
status vocabulary: [INTEGRATIONS.md](./INTEGRATIONS.md).

| Method & path                 | Token                                      | Body                                      | Response                                                                         |
| ----------------------------- | ------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /integrations/orders`   | `ORDERS_INTEGRATION_TOKEN`                 | landing-page order (or Supabase envelope) | `201/200 { orderId, orderNumber, created, status }` (idempotent on the order id) |
| `POST /integrations/delivery` | `DELIVERY_WEBHOOK_TOKEN` (+ optional HMAC) | one or many parcel status events          | `200 { results[{ trackingNumber, outcome, status, cardsUnlocked }] }`            |
| `GET /integrations/delivery`  | `DELIVERY_WEBHOOK_TOKEN`                   | `?crc_token=`                             | URL check                                                                        |

## Admin — orders and delivery

| Method & path                            | Permission                                   | Body / query                                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/orders`                      | `orders.read`                                | `stage=all\|needs_card\|needs_tracking\|in_delivery\|delivered\|failed, q, limit, offset` → `{ items, total, stageCounts }` (phones masked without `orders.manage`) |
| `POST /admin/orders`                     | `orders.manage`                              | manual order `{ fullName, phone?, region?, city?, address?, quantity, total (DZD), product?, notes?, carrier?, trackingNumber? }`                                   |
| `GET /admin/orders/:id`                  | `orders.read`                                | order, customer, cards, shipment + history, payments                                                                                                                |
| `POST /admin/orders/:id/cards`           | `orders.manage` + `activation.codes.sell`    | `{ serial }` — pack a card (`INVALID_STATE` + `details.status`: `already_assigned`, `in_other_order`, `sold`, `no_sale_gate`, `order_full`, `order_cancelled`…)     |
| `DELETE /admin/orders/:id/cards/:codeId` | `orders.manage` + `activation.codes.sell`    | take a still-locked card out of the parcel                                                                                                                          |
| `PUT /admin/orders/:id/shipment`         | `orders.manage`                              | `{ carrier, trackingNumber }` (`CONFLICT` if used by another order)                                                                                                 |
| `POST /admin/orders/:id/delivery-status` | `orders.delivery.override`                   | `{ status, reason }` — by-hand status, audited                                                                                                                      |
| `POST /admin/orders/:id/cancel`          | `orders.manage`                              | `{ reason }` — undelivered orders only                                                                                                                              |
| `POST /admin/orders/delivery-import`     | `orders.delivery.override` + `orders.manage` | body = the carrier's CSV export (`text/csv`, ≤ 5 MB)                                                                                                                |

## Signed-in user

| Method & path                      | Body                    | Response                                                                                        |
| ---------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /me`                          | —                       | `{ id, email, locale, roles, isStaff, mfaVerified, entitlements[] }`                            |
| `GET /auth/sessions`               | —                       | `[{ id, deviceLabel, clientType, createdAt, lastSeenAt, current }]`                             |
| `DELETE /auth/sessions`            | —                       | `{ revoked }` — signs out all **other** devices; `?scope=all` includes this one                 |
| `DELETE /auth/sessions/:sessionId` | —                       | `{ revoked }` — only the caller's own sessions                                                  |
| `POST /me/email/start`             | `{ newEmail }`          | `{ challengeId, emailMasked }` — requires a sign-in within 30 min (`REAUTHENTICATION_REQUIRED`) |
| `POST /me/email/confirm`           | `{ challengeId, code }` | `{ email }` — notifies the old address, signs out other devices; `EMAIL_IN_USE`                 |

## Staff second factor

| Method & path                 | Body                                             | Response                                                     |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `POST /auth/mfa/totp/enroll`  | `{}`                                             | `{ secret, otpauthUri, qrDataUrl }` (`MFA_ALREADY_ENROLLED`) |
| `POST /auth/mfa/totp/confirm` | `{ code }`                                       | `{ recoveryCodes[10] }` — shown once                         |
| `POST /auth/mfa/verify`       | `{ code }` (TOTP or `XXXXX-XXXXX` recovery code) | `{ verified }` — 10 attempts / 15 min                        |

## Admin — activation cards

| Method & path                                    | Permission                                         | Body / query                                                                           | Response                                  |
| ------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| `GET /admin/courses`                             | batches.create ∨ entitlements.grant ∨ content.read | —                                                                                      | courses                                   |
| `GET /admin/activation/batches`                  | `activation.batches.read`                          | `limit, offset`                                                                        | batches with status counts                |
| `POST /admin/activation/batches`                 | `activation.batches.create`                        | `{ name, courseId, quantity (1–10000), requiresPin, requiresSale, redeemBy?, notes? }` | batch (201)                               |
| `GET /admin/activation/batches/:id`              | `activation.batches.read`                          | —                                                                                      | batch                                     |
| `GET /admin/activation/batches/:id/codes`        | `activation.codes.read`                            | `status, locked, search, limit, offset`                                                | `{ items, total }` (no secrets)           |
| `GET /admin/activation/batches/:id/registry`     | `activation.codes.read`                            | —                                                                                      | CSV registry (no secrets)                 |
| `GET /admin/activation/batches/:id/cards-pdf`    | `activation.codes.export`                          | `from, to` (≤ 2000 cards)                                                              | print-ready PDF — **audited**             |
| `GET /admin/activation/batches/:id/printer-data` | `activation.codes.export`                          | `from, to`                                                                             | CSV serial/code/PIN/URL — **audited**     |
| `POST /admin/activation/batches/:id/finalize`    | `activation.batches.finalize`                      | —                                                                                      | destroys printable secrets (irreversible) |
| `POST /admin/activation/codes/sell`              | `activation.codes.sell`                            | `{ serials[≤2000] }` — cards packed in an order are skipped (`IN_ORDER`)               | `{ sold[], skipped[] }`                   |
| `GET /admin/activation/codes/lookup`             | `activation.codes.read`                            | `serial`                                                                               | `{ id }`                                  |
| `GET /admin/activation/codes/:id`                | `activation.codes.read`                            | —                                                                                      | card + timeline                           |
| `POST /admin/activation/codes/:id/unsell`        | `activation.codes.sell`                            | —                                                                                      | sold → available                          |
| `POST /admin/activation/codes/:id/revoke`        | `activation.codes.revoke`                          | `{ reason }`                                                                           | unused cards only                         |
| `POST /admin/activation/codes/:id/replace`       | `activation.codes.revoke` + `.export`              | `{ reason }`                                                                           | new card secrets, **once**                |
| `POST /admin/activation/codes/:id/unlock`        | `activation.codes.unlock`                          | —                                                                                      | clears PIN lock                           |

## Admin — students, staff, audit, metrics

| Method & path                         | Permission                                              | Body / query                                                        |
| ------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /admin/overview`                 | `reports.read`                                          | — (finance figures only with `finance.reports.read`)                |
| `GET /admin/users`                    | `users.read`                                            | `search, status, access=with\|without, limit, offset`               |
| `GET /admin/users/:id`                | `users.read` (+ sections per permission)                | —                                                                   |
| `POST /admin/users/:id/suspend`       | `users.suspend`                                         | `{ reason }` — also revokes all sessions                            |
| `POST /admin/users/:id/reactivate`    | `users.suspend`                                         | —                                                                   |
| `DELETE /admin/users/:id/sessions`    | `users.sessions.manage`                                 | —                                                                   |
| `POST /admin/users/:id/entitlements`  | `entitlements.grant`                                    | `{ courseId, note, expiresAt? }`                                    |
| `POST /admin/entitlements/:id/revoke` | `entitlements.revoke`                                   | `{ reason }`                                                        |
| `GET /admin/staff`                    | `staff.read`                                            | —                                                                   |
| `POST /admin/staff/roles`             | `staff.manage` (+ `roles.manage` for admin/super_admin) | `{ email, roleKey }` — invites the account if needed                |
| `DELETE /admin/staff/roles`           | same                                                    | `{ email, roleKey }` — the last Super Admin cannot be removed       |
| `GET /admin/audit`                    | `audit.read`                                            | `action, actorEmail, targetType, targetId, from, to, limit, offset` |

## Operations

| Method & path               | Description                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`           | `{ status, database }` — 200 when the database answers, 503 otherwise                                                     |
| `GET /api/cron/maintenance` | `Authorization: Bearer $CRON_SECRET` → `{ removed: { … } }` — daily data-retention job (503 while `CRON_SECRET` is unset) |

## Error codes

`VALIDATION_ERROR` (400, with `issues[]`), `INVALID_REQUEST`, `UNAUTHENTICATED` (401), `MFA_REQUIRED` (401),
`REAUTHENTICATION_REQUIRED` (401), `FORBIDDEN` (403), `CSRF_REJECTED` (403), `ACCOUNT_SUSPENDED` (403),
`NOT_FOUND` (404), `CONFLICT`/`INVALID_STATE` (409), `RATE_LIMITED` (429 + `Retry-After`),
`OTP_*`, `MFA_*`, `EMAIL_IN_USE`, `ACTIVATION_*` (incl. `ACTIVATION_AWAITING_DELIVERY` 409), `ALREADY_ENTITLED`,
`COURSE_ACCESS_REQUIRED` (403), `VIDEO_NOT_READY` (409), `UPLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415),
`WEBHOOK_SIGNATURE_INVALID` (401), `PROVIDER_NOT_CONFIGURED` (503), `INTERNAL_ERROR` (500),
`SERVICE_UNAVAILABLE` (503, e-mail delivery failed).
