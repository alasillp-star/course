# Integrations: landing page orders and delivery company

<div dir="rtl">

**الملخص بالعربية**

1. الزبون يطلب من صفحة البيع (مثلًا `ecommerce-voyage-mentor.lovable.app`). صفحة البيع ترسل الطلبية إلى المنصة
   عبر `POST /api/v1/integrations/orders` برمز سري خاص بها.
2. فريقك يضع **بطاقة مطبوعة** في الطرد ويكتب (أو يمسح بقارئ الباركود) رقمها التسلسلي في صفحة الطلبية، ويسجّل رقم التتبع.
   البطاقة الآن مرتبطة بالطلبية لكنها **مقفلة**.
3. شركة التوصيل ترسل تحديثات حالة الطرد إلى `POST /api/v1/integrations/delivery` برمزها السري الخاص
   (أو تستورد ملف CSV من لوحة شركة التوصيل).
4. عندما تصل حالة **«تم التسليم»** فقط: تُسجَّل الطلبية مدفوعة (الدفع عند الاستلام) وتُفتح البطاقة، فيمسحها الزبون ويبدأ التعلم.
   قبل ذلك، مسح البطاقة يُظهر رسالة «بانتظار تأكيد تسليم الطرد».
5. أي حالة لا نفهمها لا تغيّر شيئًا (تظهر للفريق فقط). «تم التسليم» نهائية بالنسبة للتحديثات الآلية؛ تغييرها يدويًا
   يتطلب صلاحية خاصة وسببًا، ويُسجَّل في سجل العمليات.

**لا تضع أي رمز سري في كود صفحة البيع (Frontend)**: كل من يفتح الصفحة يستطيع قراءته. الإرسال يتم من الخادم
(Supabase Database Webhook أو Edge Function — انظر أدناه).

</div>

---

## Overview

```
Landing page ──(1) order──▶ Platform ◀──(3) parcel status── Delivery company
                               │
                    (2) staff pack a printed card
                        into the parcel (serial)
                               │
             card linked to the order, LOCKED until "delivered"
                               │
            (4) delivered ⇒ order paid (cash on delivery) + card unlocked
                               │
                     customer scans the QR code ⇒ OTP ⇒ lifetime access
```

| Variable                   | Given to                                    | Required for                  |
| -------------------------- | ------------------------------------------- | ----------------------------- |
| `ORDERS_INTEGRATION_TOKEN` | the landing page's **server side** only     | `POST /integrations/orders`   |
| `DELIVERY_WEBHOOK_TOKEN`   | the delivery company (or the relay sending) | `POST /integrations/delivery` |
| `DELIVERY_WEBHOOK_SECRET`  | optional, same sender                       | HMAC signature of the body    |

Generate tokens with `openssl rand -hex 32` (at least 32 characters, each different). An endpoint whose
token is not set answers `503 PROVIDER_NOT_CONFIGURED`. A wrong or missing token answers `401 UNAUTHENTICATED`.

**Authentication** (both endpoints, in order of preference):
`Authorization: Bearer <token>` · `X-Api-Key: <token>` · `X-Webhook-Token: <token>` · `?token=<token>`
(the query-string form exists for dashboards that only accept a URL; query strings can end up in access
logs — rotate the token if a log leaks).

No cookies, no CSRF check, JSON (`application/json`) or form (`application/x-www-form-urlencoded`) bodies
up to 512 KB. Every message is stored in `integration_events` for 30 days (it contains customer data),
visible as a summary in **Admin → Orders → Integrations**.

---

## 1. Orders from the landing page

`POST /api/v1/integrations/orders`

```json
{
  "order_id": "lp-10293",
  "full_name": "Yacine Benali",
  "phone": "+213 555 12 34 56",
  "email": "optional@example.com",
  "wilaya": "16 - Alger",
  "commune": "Bab Ezzouar",
  "address": "Cité 1200 logements, bt 4",
  "product": "Formation e-commerce",
  "quantity": 1,
  "total": 4900,
  "shipping_fee": 400,
  "created_at": "2026-10-11T09:00:00Z",
  "tracking_number": "YAL-123456",
  "carrier": "Yalidine"
}
```

| Field                         | Required | Accepted names (case and `_`/`-` insensitive)                                    |
| ----------------------------- | -------- | -------------------------------------------------------------------------------- |
| order id (idempotency key)    | **yes**  | `external_id`, `order_id`, `orderId`, `id`, `reference`, `ref`, `order_number`   |
| customer name                 | **yes**  | `full_name`, `name`, `customer_name`, `nom` — or `first_name` + `last_name`      |
| phone                         | no       | `phone`, `phone_number`, `telephone`, `tel`, `mobile` (normalised: `0555123456`) |
| province / municipality       | no       | `wilaya`, `state`, `region`, `province` / `commune`, `city`, `ville`             |
| address                       | no       | `address`, `adresse`, `street`                                                   |
| quantity (cards in parcel)    | no (1)   | `quantity`, `qty`, `quantite` (1–20)                                             |
| amount to collect, **in DZD** | no       | `total`, `amount`, `price`, `prix`, `montant` — or `total_minor` in centimes     |
| delivery fee (DZD)            | no       | `shipping_fee`, `delivery_fee`, `shipping`, `frais`                              |
| product label                 | no       | `product`, `product_name`, `offer`, `produit`                                    |
| tracking number / carrier     | no       | `tracking_number`, `tracking` / `carrier`, `delivery_company`, `courier`         |
| landing-page status           | no       | `status` — `cancelled`, `annulé`, `fake`, `duplicate`… cancels the order         |

Also accepted: the same object nested as `{ "order": { … } }` or `{ "data": { … } }`, a nested
`customer` / `shipping_address` object, and a **Supabase Database Webhook** envelope
(`{ "type": "INSERT" | "UPDATE" | "DELETE", "table": …, "record": …, "old_record": … }`).

**Responses:** `201 { data: { orderId, orderNumber, created: true, status } }` for a new order, `200` with
`created: false` when the same `order_id` arrives again (re-deliveries and later updates never create a
second order). Partial updates change only the fields they carry. Missing id or name → `400
VALIDATION_ERROR` with `details.field`.

Delivery **statuses are never taken from this endpoint** — only from the delivery channel below.

### Connecting a Lovable / Supabase landing page

Lovable apps store form submissions in Supabase. Do **not** call this API from the browser code (the
token would be public). Use one of:

1. **Database Webhook** (no code): Supabase → _Database → Webhooks → Create_ → table `orders`
   (or the table the form writes to), events _Insert_ + _Update_ (+ _Delete_), type _HTTP Request_,
   method `POST`, URL `https://<your-academy-domain>/api/v1/integrations/orders`,
   HTTP header `Authorization: Bearer <ORDERS_INTEGRATION_TOKEN>`. The envelope is understood as is.
2. **Edge Function** (if the data needs reshaping): store the token as a Supabase secret and `fetch` the
   endpoint from the function.

Test from a terminal:

```bash
curl -X POST https://<domain>/api/v1/integrations/orders \
  -H "Authorization: Bearer $ORDERS_INTEGRATION_TOKEN" -H "Content-Type: application/json" \
  -d '{"order_id":"test-1","full_name":"Test","phone":"0555000000","total":4900}'
```

---

## 2. Parcel status from the delivery company

`POST /api/v1/integrations/delivery`

One event, an array of events, or `{ "events" | "data" | "parcels" | "updates": [ … ] }`:

```json
{
  "event_id": "evt-8812",
  "tracking_number": "YAL-123456",
  "status": "Livré",
  "occurred_at": "2026-10-13T15:02:00Z",
  "order_id": "lp-10293",
  "carrier": "Yalidine"
}
```

| Field           | Required                    | Notes                                                                                    |
| --------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| tracking number | yes (or an order reference) | `tracking`, `tracking_number`, `tracking_code`… matched case/space-insensitively         |
| status          | **yes**                     | the carrier's own label, or one of our keys (below); `status.label` objects are accepted |
| order reference | no                          | our `ORD-1234` or the landing-page order id: attaches a tracking number seen first here  |
| event id        | no, recommended             | `event_id`, `webhook_id`… — repeated ids are ignored (`duplicate`)                       |
| occurred_at     | no, recommended             | ISO 8601 or Unix seconds — older messages than the last one applied are `stale`          |
| carrier         | no                          | only used to tell apart identical tracking numbers of two carriers                       |

Optional HMAC: with `DELIVERY_WEBHOOK_SECRET` set, the sender must add
`X-Signature: sha256=<hex HMAC-SHA256 of the raw body>` (also read from `X-Hub-Signature-256` /
`X-Webhook-Signature`), otherwise `401 WEBHOOK_SIGNATURE_INVALID`.

`GET /api/v1/integrations/delivery?token=…` answers `200` (URL check); with `crc_token=X` it echoes `X`.

**Response:** always `200` once authenticated and parsable, with one result per message, so the sender
does not retry messages we cannot use:

```json
{
  "data": {
    "results": [
      {
        "trackingNumber": "YAL-123456",
        "orderNumber": "ORD-1042",
        "outcome": "delivered",
        "status": "delivered",
        "cardsUnlocked": 1
      }
    ]
  }
}
```

| outcome                  | meaning                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `delivered`              | parcel delivered: order paid (cash on delivery), packed cards unlocked         |
| `applied`                | status changed (in transit, failed attempt, returned…)                         |
| `unchanged`              | same status as before (label and sync time refreshed)                          |
| `duplicate` / `stale`    | already processed / older than the last applied message                        |
| `unknown_tracking`       | no order has this tracking number (nor the given order reference)              |
| `unknown_status`         | label not understood: nothing changes, the label is shown to staff             |
| `tracking_mismatch`      | the order reference points to an order with another tracking number            |
| `ignored_after_delivery` | a contradicting message after "delivered" — needs a staff decision (see below) |

### Status vocabulary

Our keys: `pending`, `in_transit`, `out_for_delivery`, `delivered`, `failed_attempt`, `returned`,
`cancelled`. Carrier labels are mapped conservatively (`src/modules/commerce/delivery-status.ts`,
unit-tested): failure and return wording is checked **before** delivery wording, so
"Non livré", "Échec de livraison", "Retour livré au vendeur", "Undelivered", "لم يتم التسليم" are never read
as delivered. Examples: _Livré / Delivered / تم التسليم_ → delivered; _Sorti en livraison / En cours de
livraison_ → out for delivery; _Expédié / Centre / Vers wilaya_ → in transit; _Retour… / مرتجع_ → returned;
_Annulé_ → cancelled. Anything else → `unknown_status` (no change). Sending our own keys avoids any guessing.

### Rules

- Only **delivered** unlocks cards. Returned/cancelled parcels cancel the order; packed cards stay
  locked and can be taken out of the parcel and reused.
- **Delivered is final for automated sources.** A later "returned" from the carrier is logged as
  `ignored_after_delivery`; reverting needs a staff override (permission `orders.delivery.override`,
  reason mandatory, audited), which re-locks unused cards and voids the cash-on-delivery payment. Cards
  already activated stay activated (revoke the access from the student page if needed).
- A card packed after the parcel was delivered is unlocked immediately.

### Without an API: CSV import

Admin → Orders → **Import statuses**: upload the parcels export (CSV, `,` `;` or tab separated) from the
carrier's dashboard. The tracking-number and status columns are found by their headers (`Tracking`,
`N° de suivi`, `Statut`, `État`, `الحالة`…). Import can unlock cards like the carrier itself, so it
requires `orders.delivery.override`. Each row goes through the same rules as the webhook.

### Polling a carrier API

Not built: carriers' APIs differ (Yalidine, ZR Express, Maystro, Noest, EcoTrack-based companies…) and
none was assumed. Once the academy's carrier and its API documentation are known, an adapter will call
its tracking endpoint on a schedule and feed `applyDeliveryEvent` (`source: "poll"`) — same rules.

---

## 3. Packing cards (staff)

Admin → Orders → order → **Cards in the parcel**: type or scan the printed serial (`B0001-00042`).
Accepted only for cards that are available, not counter-sold, not in another order, from a batch with
"activate after sale" (otherwise the card would work without delivery), and within the ordered
quantity. Counter sales (`Mark as sold`) skip cards that belong to an order.

**Packing tip:** with QR-only cards, anyone who photographs the QR code could try to activate it once the
parcel is delivered. Put the card in a sealed envelope (or behind an opaque sticker) inside the parcel.
If a customer reports that someone else activated their card, the order shows which account activated
it; support can revoke that access and grant access manually to the customer's own account.
