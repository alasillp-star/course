# ADR-0008 — QR-only cards unlocked by the carrier's delivery confirmation

**Status:** accepted (supersedes the scratch-off PIN of ADR-0005 for new print runs)

## Context

Cards are sold through a landing page and shipped cash-on-delivery. The printed card carries only a QR
code (no scratch-off PIN): the customer scans it and starts learning. The owner's rule: a card must not
work until the delivery company shows the parcel as delivered.

## Decision

- **Orders** arrive from the landing page through an authenticated, idempotent intake endpoint
  (`POST /api/v1/integrations/orders`, keyed on the landing page's order id). Staff can also type phone orders.
- Staff **pack** a printed card into the parcel by its serial. The card is linked to the order
  (`activation_codes.order_id`) but stays `available`; with the batch's sale gate (`requires_sale`) an
  available card cannot be redeemed. Redemption answers `ACTIVATION_AWAITING_DELIVERY` for such cards.
  Only sale-gated batches can be packed; counter sales skip packed cards.
- **Shipments** (`shipments`, one per order) hold the carrier, the tracking number, a normalised status and
  the carrier's own label, plus a history. Statuses come from the carrier: a webhook
  (`POST /api/v1/integrations/delivery`, its own token, optional HMAC), an import of the carrier's CSV
  export, or (later) polling its API. The landing page cannot set a delivery status.
- **Delivered** — in one transaction — marks the order paid, records a `cash_on_delivery` payment and sells
  the order's packed cards (`code_sold` events with `via: delivery`). Activation then works as before
  (OTP, one account, lifetime entitlement) and links the order's customer to the student account.
- **Conservative label mapping:** failure/return wording is matched before delivery wording; unknown
  labels change nothing. **Delivered is final** for automated sources (a later contradicting message is
  logged and shown to staff); reverting requires `orders.delivery.override` (Admin/Super Admin) with a
  reason, re-locks unused cards and voids the payment. Out-of-order (older) and repeated events are ignored.
- Raw integration messages are kept 30 days (`integration_events`), then purged.

## Consequences and residual risk

- Stock stolen from the warehouse, or a card lost in transit, never works: it is either not packed or its
  parcel is never delivered.
- **QR-only cards can be photographed** by anyone who handles them (packer, courier). After delivery, such
  a person could race the customer to activate. Mitigations: pack the card in a sealed envelope or behind
  an opaque sticker; the activating account is visible on the order; support revokes the wrong access and
  grants the customer's own account. The legacy PIN remains available in the API for print runs that need it.
- Carrier statuses can lag behind the physical hand-over; the customer sees a clear "waiting for delivery
  confirmation" message with a retry button.
- No carrier is assumed: the generic webhook contract, CSV import and manual override work with any
  company; a carrier-specific polling adapter is added once the company and its API are known.
