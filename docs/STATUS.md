# Delivery status

Legend: ✅ done & tested · 🟡 partially done · ⏳ planned (schema ready, no UI/service yet)

## Phase 1 — Foundation ✅

| Item                                                                                      | Status | Notes                               |
| ----------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| Project setup (Next.js 16, TS strict, Tailwind v4, ESLint, Vitest, Playwright)            | ✅     |                                     |
| Architecture + ADRs                                                                       | ✅     | `docs/ARCHITECTURE.md`, `docs/adr/` |
| Database schema (66 tables), migrations, RLS lock-down, append-only audit                 | ✅     | `docs/DATABASE.md`                  |
| Authentication: e-mail OTP, DB sessions, devices, sign-out everywhere, brute-force limits | ✅     |                                     |
| Staff MFA (TOTP + recovery codes)                                                         | ✅     |                                     |
| E-mail change with verification                                                           | ✅     | UI in Settings; E2E pending         |
| Roles & permissions (7 roles, server-enforced)                                            | ✅     |                                     |
| Design system (tokens, light/dark, RTL, components), i18n ar/fr (+en ready)               | ✅     |                                     |

## Phase 2 — Activation ✅

| Item                                                                              | Status | Notes                                                                      |
| --------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Batch generation (1–10,000), hashed codes, scratch-off PIN                        | ✅     | 10,000-card batch tested                                                   |
| Point-of-sale activation (sell before redeem)                                     | ✅     | per batch                                                                  |
| Printable PDF (A4, 10 cards, crop marks), printer CSV, registry CSV               | ✅     | QR decoding verified                                                       |
| Batch finalisation (destroy printable secrets)                                    | ✅     |                                                                            |
| Revoke / replace / unlock / undo sale, events timeline, audit                     | ✅     |                                                                            |
| Atomic redemption + lifetime entitlement, race-safe                               | ✅     | concurrency + rollback tests                                               |
| Student account management (list, detail, suspend, sessions, grant/revoke access) | ✅     |                                                                            |
| Card template designer (custom artwork upload)                                    | 🟡     | PDF renderer accepts background artwork; upload UI in Phase 5              |
| Support-assisted recovery when the e-mail is lost                                 | 🟡     | procedure documented; admin "move account to new e-mail" action in Phase 5 |

## Phase 3 — Learning platform

| Item                                                                                                      | Status            |
| --------------------------------------------------------------------------------------------------------- | ----------------- |
| Student dashboard (real data: access, outline, progress, notes, notifications, live, certificates)        | ✅                |
| Course editor (modules/lessons CRUD, drag & drop, scheduling)                                             | ⏳                |
| Protected video player (Mux / Cloudflare Stream signed playback, watermark, subtitles, transcript search) | ⏳                |
| Progress tracking & resume playback, notes, resources                                                     | ⏳ (tables ready) |

## Phase 4 — Community ⏳

Spaces are created by the seed; posts, comments, reactions, mentions, reports, bans, verified answers and
notifications have tables and constraints ready.

## Phase 5 — Administration & commerce

| Item                                                                       | Status            |
| -------------------------------------------------------------------------- | ----------------- |
| Admin overview metrics                                                     | ✅                |
| Students, staff, audit log screens                                         | ✅                |
| Orders, customers, payments, refunds, invoices, discounts UI               | ⏳ (schema ready) |
| Reports & exports (sales by period/seller, inactivity, lesson performance) | ⏳                |
| Support tickets                                                            | ⏳ (schema ready) |
| Platform settings screen                                                   | ⏳                |
| Personal-data export & account deletion (anonymisation) workflow           | ⏳ (schema ready) |

## Phase 6 — Advanced learning ⏳

Quizzes, assignments (with files/links, grading, feedback), certificates with public verification page,
live sessions & 1-on-1 booking: schema ready.

## Phase 7 — Quality & deployment 🟡

| Item                                                                           | Status                        |
| ------------------------------------------------------------------------------ | ----------------------------- |
| Unit (41), integration (47, real PostgreSQL), E2E (29, production build) tests | ✅                            |
| CI pipeline                                                                    | ✅ `.github/workflows/ci.yml` |
| Deployment, backup/recovery, security docs                                     | ✅                            |
| Production deployment, monitoring provider, backup automation                  | ⏳ needs your accounts        |

## Acceptance criteria

| Scenario                                                             | Status    | Test                                                                                   |
| -------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| First activation of a valid QR succeeds                              | ✅        | `integration/activation.test.ts` "activates a valid card…", `e2e/activation.spec.ts`   |
| Reusing a consumed QR fails                                          | ✅        | integration "rejects a card that was already used", E2E "cannot be used a second time" |
| Same QR redeemed concurrently by two accounts ⇒ one subscription     | ✅        | integration "concurrent redemptions … exactly one entitlement" (6 parallel)            |
| Revoked QR grants no access                                          | ✅        | integration + E2E                                                                      |
| Student signs in again with e-mail OTP, no QR                        | ✅        | integration "returning students", E2E student.spec                                     |
| Non-entitled user cannot open protected lessons                      | ✅ (gate) | `hasCourseAccess` tests; lesson pages arrive in Phase 3 and use the same gate          |
| Student cannot use Admin API                                         | ✅        | E2E security.spec "a student cannot use any admin API"                                 |
| Video progress saved and restored                                    | ⏳        | Phase 3                                                                                |
| Community visible to subscribers only                                | ⏳        | Phase 4 (membership is derived from entitlements by design)                            |
| Support agent cannot change sales or admin permissions               | ✅        | integration rbac.test, E2E security.spec                                               |
| Activation failure leaves no partial state or duplicate subscription | ✅        | integration "rolls back everything…"                                                   |
| UI works on phones and desktops                                      | ✅        | E2E mobile (Pixel 7) + desktop projects, overflow checks                               |

## What needs your accounts / keys

| Service                                                                       | Needed for      | Variables                                                       |
| ----------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| PostgreSQL host (Supabase / Neon / RDS)                                       | everything      | `DATABASE_URL`, `DATABASE_PREPARE`                              |
| E-mail provider (Postmark / Resend / SES / any SMTP) + DNS for SPF/DKIM/DMARC | OTP delivery    | `EMAIL_TRANSPORT`, `SMTP_URL` or `RESEND_API_KEY`, `EMAIL_FROM` |
| Hosting (Vercel or a Node host) + final domain                                | production      | `APP_URL`                                                       |
| Mux or Cloudflare Stream                                                      | Phase 3 videos  | to be added                                                     |
| Object storage (S3/R2/Supabase Storage)                                       | Phase 3 files   | to be added                                                     |
| Payment gateway (optional)                                                    | online payments | to be added                                                     |
| Error monitoring (Sentry/Datadog, optional)                                   | alerting        | hook in `src/instrumentation.ts`                                |

Nothing in this repository fakes an external service: in development e-mails are written to
`.data/mailbox` (the `dev-outbox` transport, refused in staging/production by configuration validation).
