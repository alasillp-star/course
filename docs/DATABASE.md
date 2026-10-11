# Database

PostgreSQL 16+ · schema in `src/server/db/schema/*.ts` · SQL migrations in `drizzle/` · 68 tables.

## Conventions

| Topic        | Convention                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Keys         | `uuid` primary keys generated as **UUIDv7** by the app (time-ordered), `gen_random_uuid()` as DB fallback           |
| Time         | `timestamptz` everywhere                                                                                            |
| Enums        | `text` + `CHECK (... in (...))` — evolvable with plain migrations                                                   |
| Money        | integer **minor units** (`bigint`) + ISO currency (`DZD` default)                                                   |
| Translations | `jsonb` objects `{ "ar": "…", "fr": "…" }` (`LocalizedText`)                                                        |
| Soft delete  | `deleted_at` on user-facing content; users are anonymised, never hard-deleted                                       |
| Integrity    | FKs everywhere, CHECK constraints for state machines, partial unique indexes for invariants                         |
| Security     | RLS enabled on every table with no policies (blocks Supabase Data API roles); audit tables append-only via triggers |

## Business invariants enforced by the database

| Invariant                                                                | Mechanism                                                                                 |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| One account per e-mail (case-insensitive)                                | `users_email_key` unique + `users_email_normalized_check` (`email = lower(btrim(email))`) |
| A card backs at most one entitlement, ever                               | `course_entitlements_activation_code_key` partial unique index                            |
| At most one active entitlement per (student, course)                     | `course_entitlements_active_key` partial unique index                                     |
| An activated card has an owner and a date                                | `activation_codes_activated_check`                                                        |
| Used/revoked cards keep no printable secret                              | `activation_codes_consumed_secrets_check`                                                 |
| A card is sold before `sold_at` is set (and vice-versa for revocation)   | `activation_codes_sold_check`, `activation_codes_revoked_check`                           |
| OTP attempts never exceed the maximum                                    | `auth_otp_challenges_attempts_check`                                                      |
| One active TOTP factor per staff member                                  | `auth_mfa_factors_one_active_key`                                                         |
| One verified answer per question                                         | `post_comments_one_verified_key`                                                          |
| One reaction per user per target                                         | `post_reactions_user_post_key`, `post_reactions_user_comment_key`                         |
| Order totals add up                                                      | `orders_amounts_check`, `order_items_total_check`                                         |
| Webhooks processed once                                                  | `payment_webhook_events_provider_event_key`, `integration_events_source_external_key`     |
| One parcel per order; a tracking number belongs to one order per carrier | `shipments_order_key`, `shipments_carrier_tracking_key`                                   |
| A delivered parcel has a delivery date                                   | `shipments_delivered_check`                                                               |
| A landing-page order is imported once                                    | `orders_external_key`                                                                     |
| Audit trail cannot be edited                                             | triggers `audit_logs_append_only`, `activation_events_append_only`                        |

## ERD

### Identity, access control, entitlements, activation

```mermaid
erDiagram
  users ||--o| profiles : has
  users ||--o{ auth_sessions : "signs in with"
  users ||--o{ auth_otp_challenges : "proves e-mail"
  users ||--o{ auth_mfa_factors : "staff 2FA"
  users ||--o{ auth_recovery_codes : ""
  users ||--o{ user_email_changes : ""
  users ||--o{ user_roles : ""
  roles ||--o{ user_roles : ""
  roles ||--o{ role_permissions : ""
  permissions ||--o{ role_permissions : ""
  courses ||--o{ activation_batches : "cards for"
  activation_batches ||--o{ activation_codes : contains
  activation_codes ||--o{ activation_events : "lifecycle"
  activation_codes |o--o| activation_codes : "replaces"
  activation_codes ||--o| course_entitlements : "redeemed into"
  users ||--o{ course_entitlements : owns
  courses ||--o{ course_entitlements : grants
  orders |o--o{ activation_codes : "sold in"
  auth_otp_challenges }o--o| activation_codes : "activation OTP"

  users {
    uuid id PK
    text email UK
    timestamptz email_verified_at
    text status
    text locale
  }
  auth_sessions {
    uuid id PK
    text token_hash UK
    uuid user_id FK
    timestamptz expires_at
    timestamptz mfa_verified_at
    timestamptz revoked_at
    text device_label
  }
  auth_otp_challenges {
    uuid id PK
    text purpose
    text email
    text code_hash
    smallint attempts
    timestamptz expires_at
    timestamptz consumed_at
    uuid activation_code_id FK
  }
  activation_batches {
    uuid id PK
    int batch_number UK
    text serial_prefix UK
    uuid course_id FK
    int quantity
    bool requires_pin
    bool requires_sale
    timestamptz secrets_purged_at
  }
  activation_codes {
    uuid id PK
    uuid batch_id FK
    text serial UK
    text code_hash UK
    text pin_hash
    text status
    smallint failed_pin_attempts
    timestamptz locked_at
    uuid activated_by_user_id FK
  }
  course_entitlements {
    uuid id PK
    uuid user_id FK
    uuid course_id FK
    text status
    text source
    uuid activation_code_id FK
    timestamptz expires_at
  }
```

### Catalogue, learning and assessments

```mermaid
erDiagram
  courses ||--o{ course_modules : has
  course_modules ||--o{ lessons : has
  lessons ||--o{ lesson_resources : has
  media_assets ||--o{ lessons : "video of"
  media_assets ||--o{ lesson_resources : "file of"
  media_assets ||--o{ video_text_tracks : subtitles
  media_assets ||--o{ video_transcripts : transcript
  users ||--o{ lesson_progress : ""
  users ||--o{ video_progress : ""
  users ||--o{ course_progress : ""
  users ||--o{ student_notes : ""
  lessons ||--o{ lesson_progress : ""
  lessons ||--o{ video_progress : ""
  lessons ||--o{ student_notes : ""
  lessons ||--o{ quizzes : ""
  quizzes ||--o{ quiz_questions : ""
  quiz_questions ||--o{ quiz_question_options : ""
  quizzes ||--o{ quiz_attempts : ""
  lessons ||--o{ assignments : ""
  assignments ||--o{ assignment_submissions : ""
  assignment_submissions ||--o{ submission_attachments : ""
  users ||--o{ certificates : ""
  courses ||--o{ certificates : ""
```

### Commerce

```mermaid
erDiagram
  customers ||--o{ orders : places
  users |o--o{ orders : "sales agent"
  discount_codes |o--o{ orders : ""
  orders ||--o{ order_items : contains
  order_items |o--o| activation_codes : "card sold"
  orders ||--o{ payments : "paid by"
  orders ||--o| shipments : "delivered by"
  orders ||--o{ refunds : ""
  payments |o--o{ refunds : ""
  orders ||--o{ invoices : ""
  payment_webhook_events }o..o{ payments : "reconciles"
```

### Community, notifications, live sessions, support, platform

```mermaid
erDiagram
  courses ||--o{ community_spaces : has
  community_spaces ||--o{ community_posts : has
  users ||--o{ community_posts : writes
  community_posts ||--o{ post_comments : ""
  post_comments |o--o{ post_comments : replies
  community_posts ||--o{ post_reactions : ""
  post_comments ||--o{ post_reactions : ""
  community_posts ||--o{ post_attachments : ""
  community_posts ||--o{ post_tags : ""
  community_tags ||--o{ post_tags : ""
  community_posts ||--o{ post_reports : ""
  users ||--o{ community_bans : ""
  users ||--o{ notifications : ""
  users ||--o{ notification_preferences : ""
  courses ||--o{ live_sessions : ""
  live_sessions ||--o{ session_bookings : ""
  users ||--o{ coach_availability : coach
  users ||--o{ support_tickets : requests
  support_tickets ||--o{ support_ticket_messages : ""
  users ||--o{ audit_logs : "acts in"
  users ||--o{ consents : ""
  users ||--o{ data_requests : ""
```

## Table catalogue

| Domain         | Tables                                                                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | `users`, `profiles`, `user_email_changes`, `auth_otp_challenges`, `auth_sessions`, `auth_mfa_factors`, `auth_recovery_codes`, `rate_limit_buckets`, `consents`, `data_requests`                                                               |
| Access control | `roles`, `permissions`, `role_permissions`, `user_roles`                                                                                                                                                                                      |
| Catalogue      | `courses`, `course_modules`, `lessons`, `lesson_resources`, `media_assets`, `video_text_tracks`, `video_transcripts`                                                                                                                          |
| Learning       | `lesson_progress`, `video_progress`, `course_progress`, `student_notes`                                                                                                                                                                       |
| Assessments    | `quizzes`, `quiz_questions`, `quiz_question_options`, `quiz_attempts`, `assignments`, `assignment_submissions`, `submission_attachments`, `certificates`                                                                                      |
| Activation     | `card_templates`, `activation_batches`, `activation_codes`, `activation_events`                                                                                                                                                               |
| Entitlements   | `course_entitlements`                                                                                                                                                                                                                         |
| Commerce       | `customers`, `discount_codes`, `orders` (+ `external_source/external_id`, `shipping_address`), `order_items`, `payments`, `refunds`, `invoices`, `payment_webhook_events`, `shipments` (+ sequences `order_number_seq`, `invoice_number_seq`) |
| Community      | `community_spaces`, `community_posts`, `post_attachments`, `post_comments`, `post_reactions`, `post_mentions`, `community_tags`, `post_tags`, `post_reports`, `community_bans`                                                                |
| Engagement     | `notifications`, `notification_preferences`, `email_deliveries`, `live_sessions`, `session_bookings`, `coach_availability`, `support_tickets` (+ `ticket_number_seq`), `support_ticket_messages`                                              |
| Platform       | `platform_settings`, `audit_logs`, `integration_events` (raw inbound messages, purged after 30 days)                                                                                                                                          |

## Migrations workflow

```bash
# 1. change src/server/db/schema/*.ts
npm run db:generate -- --name=describe_change   # writes drizzle/NNNN_describe_change.sql
# 2. review the SQL (and add RLS for new tables: ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
# 3. apply
npm run db:migrate
npm run db:seed        # idempotent: permissions, roles, course shell, community spaces
```

Hand-written SQL (triggers, policies, data fixes) goes in a custom migration:
`npx drizzle-kit generate --custom --name=...`.

Production rules: migrations are additive and backwards-compatible with the running release
(expand → deploy → contract); never edit an applied migration; run `db:migrate` before switching traffic.

## Seeds

| Command               | Environments                                       | Creates                                                                                                                           |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:seed`     | all (idempotent)                                   | permission catalogue, 7 system roles, main course shell, 7 community spaces, first Super Admin from `BOOTSTRAP_SUPER_ADMIN_EMAIL` |
| `npm run db:seed:dev` | development/test only (refuses staging/production) | demo curriculum (5 modules), one account per staff role (`*@academy.test`), a demo batch of 20 cards (10 sold)                    |
