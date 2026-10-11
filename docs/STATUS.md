# Delivery status

Legend: ✅ done & tested · 🟡 partially done · ⏳ planned (schema ready, no UI/service yet)

## Phase 1 — Foundation ✅

| Item                                                                                      | Status | Notes                               |
| ----------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| Project setup (Next.js 16, TS strict, Tailwind v4, ESLint, Vitest, Playwright)            | ✅     |                                     |
| Architecture + ADRs                                                                       | ✅     | `docs/ARCHITECTURE.md`, `docs/adr/` |
| Database schema (68 tables), migrations, RLS lock-down, append-only audit                 | ✅     | `docs/DATABASE.md`                  |
| Authentication: e-mail OTP, DB sessions, devices, sign-out everywhere, brute-force limits | ✅     |                                     |
| Staff MFA (TOTP + recovery codes)                                                         | ✅     |                                     |
| E-mail change with verification                                                           | ✅     | UI in Settings; E2E pending         |
| Roles & permissions (7 roles, server-enforced)                                            | ✅     |                                     |
| Design system (tokens, light/dark, RTL, components), i18n ar/fr (+en ready)               | ✅     |                                     |

## Phase 2 — Activation ✅

| Item                                                                               | Status | Notes                                                                      |
| ---------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Batch generation (1–10,000), hashed codes; QR-only cards (PIN kept for legacy)     | ✅     | 10,000-card batch tested                                                   |
| Sale gate: counter sale, or carrier delivery confirmation for shipped cards        | ✅     | per batch                                                                  |
| Printable PDF (A4, 10 cards, crop marks, brand artwork), printer CSV, registry CSV | ✅     | QR decoding verified                                                       |
| Batch finalisation (destroy printable secrets)                                     | ✅     |                                                                            |
| Revoke / replace / unlock / undo sale, events timeline, audit                      | ✅     |                                                                            |
| Atomic redemption + lifetime entitlement, race-safe                                | ✅     | concurrency + rollback tests                                               |
| Student account management (list, detail, suspend, sessions, grant/revoke access)  | ✅     |                                                                            |
| Card template designer (custom artwork upload)                                     | 🟡     | PDF renderer accepts background artwork; upload UI in Phase 5              |
| Support-assisted recovery when the e-mail is lost                                  | 🟡     | procedure documented; admin "move account to new e-mail" action in Phase 5 |

## Orders & delivery-gated activation ✅ (ADR-0008, [INTEGRATIONS.md](./INTEGRATIONS.md))

| Item                                                                                          | Status | Notes                                                            |
| --------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Landing-page order intake (token, idempotent, tolerant field names, Supabase envelope)        | ✅     | tested over HTTP; **not yet connected** to the real landing page |
| Pack cards into parcels by serial; card locked until delivery                                 | ✅     | integration + E2E                                                |
| Carrier webhook (token, optional HMAC, event ids, stale/out-of-order protection)              | ✅     | generic contract; **no carrier connected yet**                   |
| Carrier CSV import, manual override (permission + reason, audited)                            | ✅     |                                                                  |
| Delivered ⇒ order paid (cash on delivery) + payment + cards unlocked, in one transaction      | ✅     |                                                                  |
| Admin Orders screens (stages, search by phone/tracking/serial, detail, history, integrations) | ✅     | phones/addresses masked without `orders.manage`                  |
| Polling a specific carrier's API                                                              | ⏳     | needs the carrier's name and API documentation                   |
| Carrier remittance reconciliation (cash collected vs. transferred)                            | ⏳     |                                                                  |

## Phase 3 — Learning platform ✅

| Item                                                                                                  | Status                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Student dashboard (access, outline, progress, continue watching)                                      | ✅                                                                                                            |
| Course editor (modules/lessons CRUD, drag & drop ordering, draft/published/hidden, scheduled publish) | ✅                                                                                                            |
| Video upload (direct to Mux / Cloudflare Stream; local provider in development)                       | ✅ (Mux/Stream tested with signed webhook fixtures and token checks; **not exercised against real accounts**) |
| Protected player (signed short-lived playback, entitlement per token, watermark, resume)              | ✅                                                                                                            |
| Server-validated progress, completion threshold, course progress                                      | ✅                                                                                                            |
| Notes with video timestamps, lesson resources (files via presigned S3 URLs, links)                    | ✅ (S3 verified against MinIO; SigV4 against the AWS test vector)                                             |
| Subtitles, transcript search                                                                          | ⏳                                                                                                            |

## Phase 4 — Community ⏳

Spaces are created by the seed; posts, comments, reactions, mentions, reports, bans, verified answers and
notifications have tables and constraints ready.

## Phase 5 — Administration & commerce

| Item                                                                       | Status            |
| -------------------------------------------------------------------------- | ----------------- |
| Admin overview metrics                                                     | ✅                |
| Students, staff, audit log screens                                         | ✅                |
| Orders, customers, COD payments, delivery tracking                         | ✅                |
| Refunds, invoices, discounts UI                                            | ⏳ (schema ready) |
| Reports & exports (sales by period/seller, inactivity, lesson performance) | ⏳                |
| Support tickets                                                            | ⏳ (schema ready) |
| Platform settings screen                                                   | ⏳                |
| Personal-data export & account deletion (anonymisation) workflow           | ⏳ (schema ready) |

## Phase 6 — Advanced learning ⏳

Quizzes, assignments (with files/links, grading, feedback), certificates with public verification page,
live sessions & 1-on-1 booking: schema ready.

## Phase 7 — Quality & deployment 🟡

| Item                                                                            | Status                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Unit (71), integration (78 + 3 S3, real PostgreSQL), E2E (31, production build) | ✅                                                                            |
| CI pipeline                                                                     | ✅ `.github/workflows/ci.yml`                                                 |
| Deployment, backup/recovery, security docs                                      | ✅                                                                            |
| One-command local trial (`npm run try`), simulators, phone mode                 | ✅ tested on Linux (Windows/macOS: same Node + Docker commands, not run here) |
| Deployment automation: Vercel build validates config + migrates, daily cron     | ✅ tested locally (not yet run on a real Vercel account)                      |
| Production deployment, monitoring provider, backup automation                   | ⏳ needs your accounts                                                        |

## Acceptance criteria

| Scenario                                                             | Status | Test                                                                                                         |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| First activation of a valid QR succeeds                              | ✅     | `integration/activation.test.ts` "activates a valid card…", `e2e/activation.spec.ts`                         |
| Reusing a consumed QR fails                                          | ✅     | integration "rejects a card that was already used", E2E "cannot be used a second time"                       |
| Same QR redeemed concurrently by two accounts ⇒ one subscription     | ✅     | integration "concurrent redemptions … exactly one entitlement" (6 parallel)                                  |
| Revoked QR grants no access                                          | ✅     | integration + E2E                                                                                            |
| Student signs in again with e-mail OTP, no QR                        | ✅     | integration "returning students", E2E student.spec                                                           |
| Non-entitled user cannot open protected lessons                      | ✅     | integration `learning.test.ts` "opens published lessons for enrolled students only"                          |
| Student cannot use Admin API                                         | ✅     | E2E security.spec "a student cannot use any admin API"                                                       |
| Video progress saved and restored                                    | ✅     | integration `learning.test.ts` "restores the playback position"; checked by hand in the browser (no E2E yet) |
| Card in a parcel does not work before the carrier reports delivery   | ✅     | integration `orders.test.ts`, E2E delivery.spec                                                              |
| Failure/return labels never unlock a card                            | ✅     | unit `delivery.test.ts`, integration `orders.test.ts`                                                        |
| Community visible to subscribers only                                | ⏳     | Phase 4 (membership is derived from entitlements by design)                                                  |
| Support agent cannot change sales or admin permissions               | ✅     | integration rbac.test, E2E security.spec                                                                     |
| Activation failure leaves no partial state or duplicate subscription | ✅     | integration "rolls back everything…"                                                                         |
| UI works on phones and desktops                                      | ✅     | E2E mobile (Pixel 7) + desktop projects, overflow checks                                                     |

## What needs your accounts / keys

| Service                                                                       | Needed for      | Variables                                                       |
| ----------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| PostgreSQL host (Supabase / Neon / RDS)                                       | everything      | `DATABASE_URL`, `DATABASE_PREPARE`                              |
| E-mail provider (Postmark / Resend / SES / any SMTP) + DNS for SPF/DKIM/DMARC | OTP delivery    | `EMAIL_TRANSPORT`, `SMTP_URL` or `RESEND_API_KEY`, `EMAIL_FROM` |
| Hosting (Vercel or a Node host) + final domain                                | production      | `APP_URL`                                                       |
| Mux or Cloudflare Stream                                                      | lesson videos   | `VIDEO_PROVIDER`, `MUX_*` or `CLOUDFLARE_*`                     |
| Object storage (S3/R2/Supabase Storage)                                       | lesson files    | `STORAGE_PROVIDER=s3`, `S3_*`                                   |
| Landing page (server side: Supabase webhook / edge function)                  | order intake    | `ORDERS_INTEGRATION_TOKEN`                                      |
| Delivery company (webhook or CSV export)                                      | unlocking cards | `DELIVERY_WEBHOOK_TOKEN` (+ `DELIVERY_WEBHOOK_SECRET`)          |
| Payment gateway (optional)                                                    | online payments | to be added                                                     |
| Error monitoring (Sentry/Datadog, optional)                                   | alerting        | hook in `src/instrumentation.ts`                                |

Nothing in this repository fakes an external service: in development e-mails are written to
`.data/mailbox` (the `dev-outbox` transport, refused in staging/production by configuration validation).
