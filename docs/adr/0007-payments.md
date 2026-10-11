# ADR-0007 — Payments: provider-agnostic; order ≠ payment ≠ access

**Status:** accepted (schema ready, gateway integration in Phase 5+)

- Card sales today are offline (cash, transfer). They are modelled as **orders** (what was sold),
  **payments** (money received, recorded by staff with `payments.record`) and **entitlements**
  (granted only when a card is redeemed). Three independent steps.
- Online gateways (e.g. Chargily/SATIM for EDAHABIA/CIB, Stripe internationally) plug in via
  `payments.provider = 'card_gateway'`, idempotency keys, and an idempotent webhook inbox
  (`payment_webhook_events`, unique per provider event id).
- No gateway is assumed and no fake gateway is presented as real payment.
