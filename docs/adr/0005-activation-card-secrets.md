# ADR-0005 — Activation card secrets

**Status:** accepted — new print runs are QR-only (no PIN), see ADR-0008; the PIN remains supported for legacy runs

## Threats

Card photographed in the shop before sale · stock stolen from the warehouse · guessing codes ·
database leak · insider re-printing cards · double redemption · codes leaking into logs/analytics.

## Decision

| Element                  | Design                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card code                | 16 Crockford base32 chars (80 random bits), in the QR only (support can read it out for manual entry while printable copies exist)                                               |
| Lookup                   | `HMAC-SHA256(ACTIVATION_CODE_PEPPER, code)` — the raw code is never stored in clear                                                                                              |
| Hidden PIN               | 8 digits under scratch-off foil; `HMAC(pepper, cardId:PIN)`; 10 wrong PINs lock the card                                                                                         |
| Point-of-sale activation | per batch (default on): a card works only after a seller marks it sold                                                                                                           |
| QR URL                   | `https://<domain>/a#CODE` — the fragment never reaches servers, logs, CDNs or Referer headers; the page wipes it from history                                                    |
| Printable copies         | AES-256-GCM (`DATA_ENCRYPTION_KEY`, AAD bound to card + field), only to print. Wiped on activation/revocation, and for the whole batch at **finalisation** (`secrets_purged_at`) |
| Exports                  | PDF / printer CSV need `activation.codes.export` (Super Admin, Admin); every export is audited and counted                                                                       |
| Replacement              | revoke + new card (new secrets shown once); sale/order link carried over                                                                                                         |

## Why encrypted copies at all?

Printing usually happens after generation (and sometimes twice, e.g. a damaged print run). Keeping
reversible copies until the batch is finalised is the operational compromise; after finalisation the
platform cannot reproduce any card secret. A database leak alone reveals nothing usable (keys live
outside the database).

## Consequences

- Rotating `ACTIVATION_CODE_PEPPER` invalidates all unredeemed cards — only rotate after a compromise.
- `DATA_ENCRYPTION_KEY` must be backed up separately from database backups (see backup runbook).
