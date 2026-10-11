# ADR-0001 — Modular monolith on Next.js (App Router)

**Status:** accepted

## Context
One flagship course, a few thousand to tens of thousands of students, a small team. The core
invariant (one card ⇒ one lifetime entitlement) needs strong transactional guarantees.

## Decision
A single Next.js 16 application (TypeScript, App Router, Node.js runtime) with internal modules
(`src/modules/*`) over shared infrastructure (`src/server/*`) and one PostgreSQL database.
A versioned JSON API (`/api/v1`) is exposed for the web UI today and mobile apps later.

## Consequences
* One deployable, one database, local ACID transactions, simple operations.
* Module boundaries keep the code splittable later (e.g. extracting video processing or
  notifications into workers) without a rewrite.
* Long-running work (bulk e-mail, transcoding) will need background jobs (Vercel Cron / a queue);
  synchronous work today is bounded (≤ 10,000 cards per batch, ≤ 2,000 cards per print file).
