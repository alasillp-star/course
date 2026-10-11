# Backup & recovery runbook

## Objectives

| Metric                        | Target                               |
| ----------------------------- | ------------------------------------ |
| RPO (max data loss)           | ≤ 5 minutes (point-in-time recovery) |
| RTO (time to restore service) | ≤ 2 hours                            |

## What must be backed up

| Asset                              | How                                                                                   | Why it matters                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PostgreSQL                         | Provider PITR (Supabase/Neon/RDS) **plus** a nightly logical dump to separate storage | All accounts, entitlements, cards, sales                                     |
| `ACTIVATION_CODE_PEPPER`           | Password manager / secret vault, 2 custodians                                         | Without it **no unredeemed card can be verified**                            |
| `DATA_ENCRYPTION_KEY` (+ previous) | Same                                                                                  | Needed to print unfinalised batches and verify staff TOTP                    |
| `AUTH_SECRET`                      | Same                                                                                  | Losing it only invalidates pending OTPs/recovery codes (staff can reset MFA) |
| Object storage (Phase 3)           | Provider versioning / replication                                                     | Course files, uploads                                                        |

Keys and database dumps must be stored **separately** (a stolen dump without keys reveals no card secret).

## Nightly logical backup

```bash
pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$DATABASE_URL_DIRECT" \
  --file="academy-$(date -u +%Y%m%dT%H%MZ).dump"
# encrypt and upload, e.g.: age -r <recipient> file.dump > file.dump.age ; aws s3 cp …
```

Keep 30 daily + 12 monthly copies. Use the _direct_ (non-pooled) connection for `pg_dump`.

## Restore procedures

### A. Point-in-time recovery (accidental deletion, bad migration)

1. Put the app in maintenance (Vercel: promote a maintenance deployment, or scale to zero).
2. In the provider console, restore to a **new** database at the timestamp just before the incident.
3. Verify: `select count(*) from users; select count(*) from course_entitlements where status='active';`
   `select max(occurred_at) from audit_logs;`
4. Point `DATABASE_URL` to the restored database, redeploy, run `npm run db:migrate` (no-op if current).
5. Announce; record the incident in the audit/ops log.

### B. From a logical dump

```bash
createdb academy_restore
pg_restore --no-owner --dbname=academy_restore academy-YYYYMMDDTHHMMZ.dump
```

Then step A.3–A.5.

## Drills

Quarterly: restore last night's dump into a scratch database, run `npm run test:integration` against a copy of
the schema, check row counts and a sample activation. Record duration (RTO) and data age (RPO).

## Activation-specific notes

- Restoring to a point in time can "un-redeem" cards redeemed after that point: affected students keep their
  card and can redeem again. Cross-check `activation_events` exported before the restore if available.
- Cards printed after the restore point but generated before it remain valid (their digests are in the dump).
