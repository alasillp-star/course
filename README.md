# Abdou Academy — e-learning platform

<div dir="rtl">

**منصة أكاديمية إلكترونية متكاملة**: بيع الدورة عبر بطاقات QR مطبوعة، تفعيل آمن لمرة واحدة، دخول دائم بالبريد الإلكتروني ورمز OTP، وصول مدى الحياة، لوحة طالب، ولوحة إدارة محمية بالتحقق بخطوتين — بالعربية (RTL) والفرنسية، مع بنية جاهزة للإنجليزية.

- **حالة التسليم وما هو مكتمل وغير مكتمل:** [docs/STATUS.md](docs/STATUS.md)
- **دليل لوحة الإدارة بالعربية:** [docs/ADMIN_GUIDE.ar.md](docs/ADMIN_GUIDE.ar.md)

</div>

---

## What is in this repository

| Area               | Highlights                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QR activation**  | Batches of up to 10,000 cards · 80-bit codes stored as keyed hashes · scratch-off PIN · point-of-sale activation · print-ready A4 PDF with crop marks · revoke / replace / unlock · atomic, race-safe redemption → lifetime access |
| **Authentication** | Passwordless e-mail OTP · server-side sessions with device list and remote sign-out · brute-force limits · staff TOTP MFA with recovery codes · verified e-mail change                                                             |
| **Authorisation**  | 7 roles, 56 permissions, enforced in services and API (not just the UI) · course access via entitlements, separate from authentication                                                                                             |
| **Security**       | Strict nonce CSP · CSRF origin checks · HttpOnly `__Host-` cookies · RLS lock-down · append-only audit log · secret redaction in logs                                                                                              |
| **UI**             | Premium design system (navy & champagne, light/dark) · RTL-first · mobile-first · student dashboard · admin console                                                                                                                |
| **Data**           | PostgreSQL schema for the whole roadmap (66 tables): learning, assessments, community, commerce, live sessions, support                                                                                                            |
| **Quality**        | 41 unit · 47 integration (real PostgreSQL, incl. concurrency) · 29 end-to-end (production build, mobile + desktop)                                                                                                                 |

Documentation: [Architecture](docs/ARCHITECTURE.md) · [Database & ERD](docs/DATABASE.md) · [API](docs/API.md) ·
[Security](docs/SECURITY.md) · [Deployment](docs/DEPLOYMENT.md) · [Backup & recovery](docs/BACKUP_AND_RECOVERY.md) ·
[Decision records](docs/adr) · [Status & acceptance criteria](docs/STATUS.md)

## Tech stack

Next.js 16 (App Router, Node.js runtime) · React 19 · TypeScript 5.9 (strict) · Tailwind CSS 4 · Radix UI primitives
(shadcn-style components) · PostgreSQL 16 · Drizzle ORM + postgres.js · Zod 4 · pdf-lib + qrcode · Nodemailer / Resend ·
Vitest · Playwright. Rationale in [ADRs](docs/adr).

## Quick start (development)

Requirements: Node.js ≥ 22.11, PostgreSQL 16 (local or `docker compose up -d`).

```bash
npm ci
cp .env.example .env.local
npm run secrets:generate   # paste the 3 printed values into .env.local
#   and set BOOTSTRAP_SUPER_ADMIN_EMAIL=you@example.com in .env.local

npm run db:migrate        # apply SQL migrations
npm run db:seed           # permissions, roles, course shell, community spaces, first Super Admin
npm run db:seed:dev       # optional demo data: curriculum, staff accounts, 20 demo cards (prints 3 codes)
npm run dev               # http://localhost:3000
```

- E-mails (OTP codes) are written to `.data/mailbox/*.json` in development (`EMAIL_TRANSPORT=dev-outbox`).
  With Docker you can use Mailpit instead: `EMAIL_TRANSPORT=smtp`, `SMTP_URL=smtp://localhost:1025`, UI on :8025.
- Sign in at `/ar/login` with the bootstrap e-mail, then enrol an authenticator app at `/ar/admin/mfa`.
- Try an activation: open one of the demo URLs printed by `db:seed:dev` (`http://localhost:3000/a#…`)
  on your phone or browser and enter the printed PIN.
- If pages keep reloading in development (browser console: `HMR hash mismatch`), the Turbopack dev
  cache is stale, usually after the dev server was killed. Stop `npm run dev`, delete `.next/dev`
  and start it again.

## Scripts

| Command                                                        | Purpose                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`                              | Next.js                                                                                           |
| `npm run lint` / `typecheck` / `format`                        | Quality gates                                                                                     |
| `npm run test:unit`                                            | Pure logic (no I/O)                                                                               |
| `npm run test:integration`                                     | Services against PostgreSQL (`TEST_DATABASE_URL`, default local `academy_test`; rebuilt each run) |
| `npm run test:e2e`                                             | Playwright on a production build (`E2E_DATABASE_URL`, default local `academy_e2e`)                |
| `npm run db:generate`                                          | Generate a migration from schema changes                                                          |
| `npm run db:migrate` / `db:seed` / `db:seed:dev` / `db:reset`  | Database lifecycle (`db:reset`, `db:seed:dev` refuse staging/production)                          |
| `npm run admin:grant-role -- --email x@y.z --role super_admin` | Break-glass role assignment (audited)                                                             |
| `npm run maintenance:cleanup`                                  | Data retention housekeeping (schedule daily)                                                      |
| `npm run secrets:generate`                                     | Print fresh secrets                                                                               |

## Project structure

```
src/
  proxy.ts                  locale routing, CSP nonce, /a QR short link, optimistic auth redirects
  instrumentation.ts        config validation at start-up, error reporting hook
  app/
    [locale]/(public)       home (curriculum from DB)
    [locale]/(auth)         login (OTP), activate (QR), recover
    [locale]/app            student dashboard, settings, devices
    [locale]/admin          MFA, overview, activation cards, students, staff, audit
    api/v1                  JSON API (see docs/API.md)
  modules/                  business logic: identity, access, activation, entitlements, catalog,
                            learning, reports, audit, platform
  server/                   infrastructure: db (schema + client), env, crypto, rate-limit, email, http, logger
  components/               design system (ui/), layout, auth, admin, student, marketing
  i18n/                     locales, dictionaries (ar reference, fr, en), formatting
drizzle/                    SQL migrations (generated + hand-written hardening)
scripts/                    migrate, seed, reset, grant-role, cleanup, secrets
tests/                      unit · integration · e2e
docs/                       architecture, ADRs, database, API, security, deployment, backups, admin guide, status
legacy/                     the previous single-page course landing page (kept for reference)
```

## Branding

- Academy name, support e-mail, card issuer prefix: `src/config/academy.ts`
- Colours, radius, typography tokens: `src/app/globals.css` (defaults derived from the existing navy & gold page)
- Logo: `src/components/brand/logo.tsx` (replace the monogram with official artwork)

## License

Proprietary — all rights reserved by the academy owner.
