# Abdou Academy — e-learning platform

<div dir="rtl">

**منصة أكاديمية إلكترونية متكاملة**: بيع الدورة عبر بطاقات QR مطبوعة تُرسل مع الطرد ولا تعمل إلا بعد أن تؤكد شركة التوصيل التسليم، تفعيل آمن لمرة واحدة، دخول دائم بالبريد الإلكتروني ورمز OTP، وصول مدى الحياة، مشغّل فيديو محمي، لوحة طالب، ولوحة إدارة محمية بالتحقق بخطوتين — بالعربية (RTL) والفرنسية، مع بنية جاهزة للإنجليزية.

- **حالة التسليم وما هو مكتمل وغير مكتمل:** [docs/STATUS.md](docs/STATUS.md)
- **دليل لوحة الإدارة بالعربية:** [docs/ADMIN_GUIDE.ar.md](docs/ADMIN_GUIDE.ar.md)
- **ربط صفحة البيع وشركة التوصيل:** [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)
- **▶ افتح المنصة في السحابة بنقرة واحدة (بدون تثبيت):** [https://codespaces.new/alasillp-star/course?ref=claude/exciting-albattani-r5u25c&quickstart=1](https://codespaces.new/alasillp-star/course?ref=claude/exciting-albattani-r5u25c&quickstart=1)
- **جرّب المنصة على حاسوبك (أمر واحد `npm run try`):** [docs/TRY_IT.ar.md](docs/TRY_IT.ar.md)
- **التشغيل على الإنترنت:** [docs/GO_LIVE.ar.md](docs/GO_LIVE.ar.md)

</div>

---

## What is in this repository

| Area                  | Highlights                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QR activation**     | Batches of up to 10,000 QR-only cards · 80-bit codes stored as keyed hashes · sale gate (counter sale or delivery) · print-ready A4 PDF · revoke / replace · atomic, race-safe redemption → lifetime access |
| **Orders & delivery** | Landing-page order intake (token, idempotent) · pack cards into parcels by serial · carrier webhook / CSV import / audited override · card unlocked **only when the parcel is delivered**                   |
| **Learning**          | Course editor (drag & drop, drafts, scheduling) · direct video upload to Mux / Cloudflare Stream · signed playback + watermark · server-validated progress, resume, notes, private files (S3)               |
| **Authentication**    | Passwordless e-mail OTP · server-side sessions with device list and remote sign-out · brute-force limits · staff TOTP MFA with recovery codes · verified e-mail change                                      |
| **Authorisation**     | 7 roles, 57 permissions, enforced in services and API (not just the UI) · course access via entitlements, separate from authentication                                                                      |
| **Security**          | Strict nonce CSP · CSRF origin checks · HttpOnly `__Host-` cookies · RLS lock-down · append-only audit log · secret redaction in logs                                                                       |
| **UI**                | Abdou Academy identity (purple & lime, light/dark) · RTL-first · mobile-first · student dashboard and lesson player · admin console                                                                         |
| **Data**              | PostgreSQL schema for the whole roadmap (68 tables): learning, assessments, community, commerce, delivery, live sessions, support                                                                           |
| **Quality**           | 71 unit · 78 integration (real PostgreSQL, incl. concurrency) + 3 S3 · 31 end-to-end (production build, mobile + desktop)                                                                                   |

Documentation: [Architecture](docs/ARCHITECTURE.md) · [Database & ERD](docs/DATABASE.md) · [API](docs/API.md) ·
[Security](docs/SECURITY.md) · [Integrations](docs/INTEGRATIONS.md) · [Deployment](docs/DEPLOYMENT.md) · [Backup & recovery](docs/BACKUP_AND_RECOVERY.md) · [Brand](docs/BRAND.md) ·
[Decision records](docs/adr) · [Status & acceptance criteria](docs/STATUS.md)

## Tech stack

Next.js 16 (App Router, Node.js runtime) · React 19 · TypeScript 5.9 (strict) · Tailwind CSS 4 · Radix UI primitives
(shadcn-style components) · PostgreSQL 16 · Drizzle ORM + postgres.js · Zod 4 · pdf-lib + qrcode · Nodemailer / Resend ·
Vitest · Playwright. Rationale in [ADRs](docs/adr).

## Quick start (development)

**In the cloud, nothing to install:** [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/alasillp-star/course?ref=claude/exciting-albattani-r5u25c&quickstart=1)
— the codespace starts PostgreSQL + Mailpit, configures, seeds demo data, builds and serves the platform on
its https address (`.devcontainer/devcontainer.json` → `npm run codespace`).

**On your computer:**

Requirements: Node.js ≥ 22.11 and Docker Desktop running (or your own PostgreSQL 16 in `DATABASE_URL`).

```bash
npm ci
npm run try          # one command: .env.local, PostgreSQL + Mailpit, migrations, demo data, dev server
```

`npm run try` (or `npm run setup` without starting the server) creates `.env.local` with fresh secrets and
integration tokens — values already present are never changed — starts PostgreSQL and Mailpit with
`docker compose`, applies migrations, seeds the platform and, on the first run, demo data: curriculum with
a playable sample video, one account per staff role, 20 QR-only cards and three delivery orders. Card links
are saved in `.data/demo-data.txt`. `npm run setup -- --reset` starts over.

- Platform: http://localhost:3000 · sign-in codes: Mailpit at http://localhost:8025
- Staff: `owner@academy.test` (Super Admin), `admin@`, `sales@`, `support@`, `instructor@`, `moderator@academy.test`;
  staff enrol an authenticator app on first sign-in.
- Play the landing page and the carrier: `npm run simulate -- order`, then
  `npm run simulate -- delivery <TRACKING> ["Non livré" | "Livré" | …]`.
- Phones on the same Wi-Fi: `npm run start:phone` (production build on the computer's network address, QR code in the terminal).
- Step-by-step trial in Arabic: [docs/TRY_IT.ar.md](docs/TRY_IT.ar.md).
- If pages keep reloading in development (browser console: `HMR hash mismatch`), the Turbopack dev
  cache is stale, usually after the dev server was killed. Stop `npm run dev`, delete `.next/dev`
  and start it again.

## Scripts

| Command                                                         | Purpose                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`                               | Next.js                                                                                           |
| `npm run lint` / `typecheck` / `format`                         | Quality gates                                                                                     |
| `npm run test:unit`                                             | Pure logic (no I/O)                                                                               |
| `npm run test:integration`                                      | Services against PostgreSQL (`TEST_DATABASE_URL`, default local `academy_test`; rebuilt each run) |
| `npm run test:e2e`                                              | Playwright on a production build (`E2E_DATABASE_URL`, default local `academy_e2e`)                |
| `npm run db:generate`                                           | Generate a migration from schema changes                                                          |
| `npm run db:migrate` / `db:seed` / `db:seed:dev` / `db:reset`   | Database lifecycle (`db:reset`, `db:seed:dev` refuse staging/production)                          |
| `npm run admin:grant-role -- --email x@y.z --role super_admin`  | Break-glass role assignment (audited)                                                             |
| `npm run maintenance:cleanup`                                   | Data retention housekeeping (daily; on Vercel: cron → `/api/cron/maintenance`)                    |
| `npm run secrets:generate`                                      | Print fresh secrets, integration tokens and the cron secret                                       |
| `npm run try` / `setup` (`-- --reset`)                          | One-command local trial (see Quick start)                                                         |
| `npm run simulate -- order` / `-- delivery <TRACKING> [STATUS]` | Play the landing page / the carrier against a running platform (`--url=` for a deployment)        |
| `npm run start:phone`                                           | Serve a production build to phones on the local network                                           |
| `npm run env:check`                                             | Validate the configuration like the server does (run by `vercel-build`)                           |

## Project structure

```
src/
  proxy.ts                  locale routing, CSP nonce, /a QR short link, optimistic auth redirects
  instrumentation.ts        config validation at start-up, error reporting hook
  app/
    [locale]/(public)       home (curriculum from DB)
    [locale]/(auth)         login (OTP), activate (QR), recover
    [locale]/app            student dashboard, course & lesson player, notes, settings, devices
    [locale]/admin          MFA, overview, activation cards, orders & delivery, content, students, staff, audit
    api/v1                  JSON API (see docs/API.md)
  modules/                  business logic: identity, access, activation, commerce (orders, delivery),
                            entitlements, catalog, content, learning, reports, audit, platform
  server/                   infrastructure: db (schema + client), env, crypto, rate-limit, email, http,
                            storage (S3 / local), video (Mux / Cloudflare Stream / local), logger
  components/               design system (ui/), layout, auth, admin, student, marketing
  i18n/                     locales, dictionaries (ar reference, fr, en), formatting
drizzle/                    SQL migrations (generated + hand-written hardening)
scripts/                    migrate, seed, reset, grant-role, cleanup, secrets
tests/                      unit · integration · e2e
docs/                       architecture, ADRs, database, API, security, deployment, backups, admin guide, status
legacy/                     the previous single-page course landing page (kept for reference)
```

## Branding

Abdou Academy identity — see [docs/BRAND.md](docs/BRAND.md).

- Name, support e-mail, card issuer prefix, time zone: `src/config/academy.ts`
- Colour tokens (purple `#4B2AF0`, lime `#D6FF46`, ink, lilac, ivory) and typography: `src/app/globals.css`
- Logo components (official paths): `src/components/brand/logo.tsx`; official files in `public/brand/`

## License

Proprietary — all rights reserved by the academy owner.
