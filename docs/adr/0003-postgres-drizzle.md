# ADR-0003 — PostgreSQL + Drizzle ORM, SQL migrations, RLS lock-down

**Status:** accepted

## Decision
* PostgreSQL 16+ is the system of record. Schema in TypeScript (`src/server/db/schema`), migrations
  generated as plain SQL into `drizzle/` and applied by `npm run db:migrate` (transactional).
* Integrity lives in the database, not only in code: foreign keys, CHECK constraints for every
  status machine, partial unique indexes for business invariants, text enums with CHECKs (easy to
  evolve), UUIDv7 primary keys (time-ordered), `timestamptz` everywhere, integer minor units for money.
* Hardening migration (`0001_security_hardening.sql`): RLS enabled on **every** table with no policies,
  privileges revoked from Supabase's `anon` / `authenticated` roles, and triggers making `audit_logs`
  and `activation_events` append-only. The application connects as the table owner.
* Soft delete where history matters (content, community, users are anonymised rather than deleted).

## Consequences
* Even if the Supabase Data API is left enabled, it can read or write nothing.
* A test asserts RLS is enabled on every table so new migrations cannot silently forget it.
* Transaction-mode poolers (Supabase :6543, PgBouncer) require `DATABASE_PREPARE=false`.
