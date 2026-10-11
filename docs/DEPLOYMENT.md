# Deployment

Recommended production setup (lowest operational effort):

| Component | Recommended                                               | Alternatives                                                      |
| --------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| App       | **Vercel** (Node.js runtime, Fluid compute)               | Any Node 22 host: Docker on Fly.io / Railway / a VPS behind Nginx |
| Database  | **Supabase Postgres** or **Neon** (PITR enabled)          | AWS RDS, self-hosted PostgreSQL 16+                               |
| E-mail    | **Postmark**, **Resend** or **Amazon SES**                | Any SMTP provider                                                 |
| Video     | **Mux** or **Cloudflare Stream** (signed playback)        | —                                                                 |
| Files     | Supabase Storage / Cloudflare R2 / S3 (S3-compatible API) | Backblaze B2, Wasabi, MinIO                                       |
| Orders    | Your landing page (e.g. Lovable + Supabase)               | Any system able to POST JSON                                      |
| Delivery  | Your delivery company's webhook, or its CSV export        | —                                                                 |

## 1. Prepare the database

1. Create the database (Supabase: _Project → Database_; Neon: new project). Enable point-in-time recovery.
2. Use a **dedicated role** for the app (owner of the tables) and the **pooled** connection string:
   - Supabase transaction pooler (port 6543) or Neon pooled endpoint → set `DATABASE_PREPARE=false`.
   - Add `?sslmode=require` to the URL.
3. (Supabase) You may disable the Data API entirely — the app does not use it, and RLS already blocks it.

## 2. Configure e-mail

- Create a sending domain (e.g. `mail.your-academy.com`), publish **SPF**, **DKIM** and **DMARC** records.
- `EMAIL_TRANSPORT=smtp` with `SMTP_URL=smtps://user:pass@smtp.provider.com:465`, or
  `EMAIL_TRANSPORT=resend` with `RESEND_API_KEY`.
- `EMAIL_FROM="Abdou Academy <no-reply@mail.your-academy.com>"`.

## 3. Environment variables

Copy `.env.example` → configure in the host's secret store. Production requirements are validated at
start-up (`instrumentation.ts`): HTTPS `APP_URL`, real e-mail transport, distinct secrets, MFA enforced.

## 3b. Video, files and integrations

- **Mux:** create an access token (Video read + write), a URL signing key (Settings → Signing keys) and a
  webhook to `https://<domain>/api/v1/webhooks/video/mux`; set the `MUX_*` variables and `VIDEO_PROVIDER=mux`.
  Optional: a playback restriction limited to your domain (`MUX_PLAYBACK_RESTRICTION_ID`).
- **Cloudflare Stream:** API token with _Stream: Edit_, a signing key (`POST /accounts/:id/stream/keys`),
  a webhook to `https://<domain>/api/v1/webhooks/video/cloudflare-stream`; set `CLOUDFLARE_*` and
  `VIDEO_PROVIDER=cloudflare_stream`. Uploaded videos require signed URLs.
- **Files:** a **private** bucket, an access key limited to it, CORS allowing `PUT` from `APP_URL`
  (headers `Content-Type`); set `S3_*` and `STORAGE_PROVIDER=s3`.
- **Landing page & delivery company:** generate `ORDERS_INTEGRATION_TOKEN` and `DELIVERY_WEBHOOK_TOKEN`
  (different values), then follow [INTEGRATIONS.md](./INTEGRATIONS.md). Admin → Orders → Integrations shows
  whether each endpoint is enabled and the last messages received.

`local` video/storage providers are development-only and refused at start-up in staging/production.

## 4. Deploy (Vercel)

1. Import the repository; framework preset **Next.js**; Node 22.
2. Add environment variables for _Production_ (and separate values for _Preview_ with a separate database).
3. Build command: `npm run build`. Run migrations **before** promoting a deployment, e.g. in CI:
   ```bash
   npm ci
   npm run db:migrate   # uses DATABASE_URL of the target environment
   npm run db:seed      # idempotent
   ```
   (`.github/workflows/ci.yml` runs the full test suite; add a protected "deploy" job with production secrets.)
4. Custom domain + HTTPS (automatic on Vercel). Keep `APP_URL` equal to the public origin — it is printed
   in every QR code, so choose the final domain **before printing cards**.
5. Daily housekeeping: a Vercel Cron (or GitHub Actions schedule) running `npm run maintenance:cleanup`
   (also purges raw integration messages, which contain customer data, after 30 days).

## 5. Self-hosting (Docker / VPS)

```bash
npm ci && npm run build
npm run db:migrate && npm run db:seed
NODE_ENV=production node_modules/.bin/next start -p 3000
```

Put Nginx/Caddy in front with TLS and forward the client IP:
`proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
(`TRUST_PROXY_HEADERS=true`). Without a trusted proxy header, IP-based rate limits cannot apply.

## 6. First launch checklist

- [ ] `BOOTSTRAP_SUPER_ADMIN_EMAIL` set → `npm run db:seed` → owner signs in with an e-mailed code and enrols MFA
- [ ] Owner invites staff from _Team & permissions_ (each must enrol MFA)
- [ ] Brand name/support e-mail in `src/config/academy.ts`; colours in `src/app/globals.css`
- [ ] Course content in Admin → Content (modules, lessons, videos, files) — publish when ready
- [ ] Test batch of 5 QR-only cards → print → test order from the landing page → pack a card → mark the
      parcel delivered (carrier or override) → activate on a phone → revoke the rest
- [ ] Landing page and delivery company connected (Admin → Orders → Integrations shows "Enabled" and messages)
- [ ] Monitoring: uptime check on `/api/health`, log drain (Vercel → Datadog/Axiom/Better Stack), error alerts
- [ ] Backups verified with a restore drill (see BACKUP_AND_RECOVERY.md)

## 7. Monitoring & errors

- Structured JSON logs on stdout/stderr (secrets redacted). Every API response has `x-request-id`.
- `instrumentation.ts` validates configuration at start and logs unhandled request errors
  (`onRequestError`) — plug Sentry/Datadog there by adding their SDK and DSN.
- Health: `GET /api/health` (database round-trip).
