import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { markCardsSold, markCardUnsold } from "@/modules/activation/admin-codes.service";
import { createBatch, loadPrintableCards } from "@/modules/activation/batches.service";
import {
  checkActivationCode,
  completeActivation,
  startActivation,
} from "@/modules/activation/redemption.service";
import type { Actor } from "@/modules/access/actor";
import {
  applyDeliveryEvent,
  assignCardToOrder,
  cancelOrder,
  getOrderDetail,
  handleDeliveryWebhook,
  importDeliveryCsv,
  ingestLandingOrder,
  listOrders,
  overrideDeliveryStatus,
  setOrderShipment,
  unassignCardFromOrder,
} from "@/modules/commerce/orders.service";
import { hasCourseAccess } from "@/modules/entitlements/entitlements.service";
import { closeDb, getDb } from "@/server/db/client";
import {
  activationCodes,
  activationEvents,
  customers,
  integrationEvents,
  orders,
  payments,
  shipments,
} from "@/server/db/schema";
import {
  createCourse,
  expectAppError,
  installMemoryTransport,
  resetDatabase,
  staffActor,
  testMeta,
  type MemoryTransport,
} from "./helpers";

let mail: MemoryTransport;
let courseId: string;
let admin: Actor;

type Card = { serial: string; code: string; pin: string | null };

/** QR-only cards gated by a sale (the delivery flow's configuration). */
async function newCards(quantity = 2, options: { requiresSale?: boolean } = {}): Promise<Card[]> {
  const batch = await createBatch(
    admin,
    {
      name: "Delivery stock",
      courseId,
      quantity,
      requiresPin: false,
      requiresSale: options.requiresSale ?? true,
    },
    testMeta(),
  );
  const { cards } = await loadPrintableCards(
    admin,
    { batchId: batch.id, from: 1, to: quantity, format: "csv" },
    testMeta(),
  );
  return cards;
}

function landingOrder(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "lp-1001",
    full_name: "Yacine Benali",
    phone: "+213 555 12 34 56",
    wilaya: "16 - Alger",
    commune: "Bab Ezzouar",
    address: "Cité 1200 logements, bt 4",
    product: "Formation e-commerce",
    total: "4 900",
    shipping_fee: 400,
    created_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

async function orderId(externalId = "lp-1001"): Promise<string> {
  const [row] = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.externalId, externalId));
  return row!.id;
}

async function cardRow(serial: string) {
  const [row] = await getDb()
    .select()
    .from(activationCodes)
    .where(eq(activationCodes.serial, serial));
  return row!;
}

function deliver(trackingNumber: string, status: string, extra: Record<string, unknown> = {}) {
  return handleDeliveryWebhook({ tracking: trackingNumber, status, ...extra }, testMeta());
}

async function redeem(card: Card, email: string) {
  const started = await startActivation({
    code: card.code,
    pin: card.pin,
    email,
    locale: "ar",
    meta: testMeta(),
  });
  return completeActivation({
    challengeId: started.challengeId,
    otp: mail.otpFor(email),
    meta: testMeta(),
  });
}

beforeEach(async () => {
  await resetDatabase();
  mail = installMemoryTransport();
  courseId = await createCourse();
  admin = await staffActor("owner@academy.test", "super_admin");
});

afterAll(async () => {
  await closeDb();
});

describe("landing-site orders", () => {
  it("creates an order with its customer, item and amounts, idempotently", async () => {
    const first = await ingestLandingOrder(landingOrder(), testMeta());
    expect(first.created).toBe(true);
    expect(first.orderNumber).toMatch(/^ORD-\d+$/);

    const again = await ingestLandingOrder(landingOrder(), testMeta());
    expect(again).toMatchObject({ orderId: first.orderId, created: false });

    const db = getDb();
    const rows = await db.select().from(orders);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "pending_payment",
      channel: "online",
      externalSource: "landing_site",
      totalMinor: 490_000,
      currency: "DZD",
      shippingAddress: { region: "16 - Alger", city: "Bab Ezzouar" },
    });
    const [customer] = await db.select().from(customers);
    expect(customer).toMatchObject({ fullName: "Yacine Benali", phone: "0555123456" });

    const detail = await getOrderDetail(admin, first.orderId!);
    expect(detail.items).toHaveLength(1);
    expect(detail.capacity).toBe(1);
    expect(detail.order.shippingFeeMinor).toBe(40_000);
  });

  it("accepts a Supabase database-webhook envelope and applies later updates", async () => {
    const created = await ingestLandingOrder(
      {
        type: "INSERT",
        table: "orders",
        schema: "public",
        record: { id: "uuid-7", name: "Amina", phone: "0661 22 33 44", price: 5500, quantity: 2 },
        old_record: null,
      },
      testMeta(),
    );
    expect(created.created).toBe(true);
    const detail = await getOrderDetail(admin, created.orderId!);
    expect(detail.capacity).toBe(2);
    expect(detail.order.totalMinor).toBe(550_000);

    // The shop adds the carrier's tracking number later.
    await ingestLandingOrder(
      {
        type: "UPDATE",
        table: "orders",
        record: {
          id: "uuid-7",
          name: "Amina",
          phone: "0661223344",
          tracking_number: "yal-77 ab",
          carrier: "Yalidine",
        },
      },
      testMeta(),
    );
    const [shipment] = await getDb().select().from(shipments);
    const [updated] = await getDb().select().from(orders).where(eq(orders.id, created.orderId!));
    expect(updated!.totalMinor).toBe(550_000);
    expect(shipment).toMatchObject({
      carrier: "yalidine",
      trackingNumber: "YAL-77AB",
      status: "pending",
    });

    // Cancelled on the landing site before shipping.
    await ingestLandingOrder(
      { type: "DELETE", table: "orders", record: null, old_record: { id: "uuid-7" } },
      testMeta(),
    );
    const [order] = await getDb().select().from(orders).where(eq(orders.id, created.orderId!));
    expect(order!.status).toBe("cancelled");
  });

  it("rejects payloads without an order id or a name, and logs them", async () => {
    await expectAppError(
      ingestLandingOrder({ full_name: "No id" }, testMeta()),
      "VALIDATION_ERROR",
    );
    await expectAppError(ingestLandingOrder({ id: "x-1" }, testMeta()), "VALIDATION_ERROR");
    const logged = await getDb()
      .select()
      .from(integrationEvents)
      .where(eq(integrationEvents.status, "failed"));
    expect(logged).toHaveLength(2);
    expect(await getDb().select().from(orders)).toHaveLength(0);
  });

  it("creates a single order when the same new order arrives twice concurrently", async () => {
    const results = await Promise.all([
      ingestLandingOrder(landingOrder({ order_id: "race-1" }), testMeta()),
      ingestLandingOrder(landingOrder({ order_id: "race-1" }), testMeta()),
    ]);
    expect(new Set(results.map((result) => result.orderId)).size).toBe(1);
    expect(await getDb().select().from(orders)).toHaveLength(1);
  });
});

describe("delivery-gated activation", () => {
  it("keeps a packed card locked until the carrier reports delivery, then unlocks it", async () => {
    const [card] = await newCards(1);
    await ingestLandingOrder(
      landingOrder({ tracking_number: "ZR-100", carrier: "ZR Express" }),
      testMeta(),
    );
    const id = await orderId();
    await assignCardToOrder(admin, { orderId: id, serial: card!.serial }, testMeta());
    expect((await cardRow(card!.serial)).status).toBe("available");

    // Scanning before delivery: a clear, specific answer.
    await expectAppError(
      checkActivationCode({ code: card!.code, meta: testMeta() }),
      "ACTIVATION_AWAITING_DELIVERY",
    );
    await expectAppError(
      startActivation({
        code: card!.code,
        email: "yacine@example.com",
        locale: "ar",
        meta: testMeta(),
      }),
      "ACTIVATION_AWAITING_DELIVERY",
    );

    expect((await deliver("zr-100", "En cours de livraison")).results[0]).toMatchObject({
      outcome: "applied",
      status: "out_for_delivery",
    });
    await expectAppError(
      checkActivationCode({ code: card!.code, meta: testMeta() }),
      "ACTIVATION_AWAITING_DELIVERY",
    );

    const delivered = await deliver("ZR-100", "Livré", { occurred_at: "2026-10-03T15:00:00Z" });
    expect(delivered.results[0]).toMatchObject({ outcome: "delivered", cardsUnlocked: 1 });

    const row = await cardRow(card!.serial);
    expect(row.status).toBe("sold");
    expect(row.soldAt?.toISOString()).toBe("2026-10-03T15:00:00.000Z");
    const [order] = await getDb().select().from(orders).where(eq(orders.id, id));
    expect(order).toMatchObject({ status: "paid" });
    const [payment] = await getDb().select().from(payments).where(eq(payments.orderId, id));
    expect(payment).toMatchObject({
      provider: "cash_on_delivery",
      status: "succeeded",
      amountMinor: 490_000,
      providerReference: "zr-express:ZR-100",
    });

    const result = await redeem(card!, "yacine@example.com");
    expect(await hasCourseAccess(getDb(), result.userId, courseId)).toBe(true);
    // The delivery customer is now linked to the student account.
    const [customer] = await getDb().select().from(customers);
    expect(customer!.userId).toBe(result.userId);

    const events = await getDb()
      .select({ type: activationEvents.type })
      .from(activationEvents)
      .where(eq(activationEvents.codeId, row.id));
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["code_assigned", "code_sold", "code_activated"]),
    );
  });

  it("never reads failure or return wording as a delivery", async () => {
    const [card] = await newCards(1);
    await ingestLandingOrder(landingOrder({ tracking_number: "T-1" }), testMeta());
    await assignCardToOrder(admin, { orderId: await orderId(), serial: card!.serial }, testMeta());

    for (const label of ["Non livré", "Échec de livraison", "Tentative échouée", "Client absent"]) {
      const { results } = await deliver("T-1", label);
      expect(results[0]!.status).toBe("failed_attempt");
    }
    expect((await deliver("T-1", "Statut inconnu XYZ")).results[0]).toMatchObject({
      outcome: "unknown_status",
      status: "failed_attempt",
    });
    expect((await deliver("T-1", "Retour livré au vendeur")).results[0]!.status).toBe("returned");
    expect((await cardRow(card!.serial)).status).toBe("available");
    await expectAppError(
      checkActivationCode({ code: card!.code, meta: testMeta() }),
      "ACTIVATION_AWAITING_DELIVERY",
    );
    // A returned parcel cancels the order; the card can go back to stock.
    const id = await orderId();
    const [order] = await getDb().select().from(orders).where(eq(orders.id, id));
    expect(order!.status).toBe("cancelled");
    const row = await cardRow(card!.serial);
    await unassignCardFromOrder(admin, { orderId: id, codeId: row.id }, testMeta());
    await expectAppError(
      checkActivationCode({ code: card!.code, meta: testMeta() }),
      "ACTIVATION_CODE_NOT_SOLD",
    );
  });

  it("treats delivery as final for the carrier and ignores stale or repeated messages", async () => {
    const [card] = await newCards(1);
    await ingestLandingOrder(landingOrder({ tracking_number: "T-2" }), testMeta());
    await assignCardToOrder(admin, { orderId: await orderId(), serial: card!.serial }, testMeta());

    await deliver("T-2", "delivered", { event_id: "evt-1", occurred_at: "2026-10-05T10:00:00Z" });
    expect((await deliver("T-2", "delivered", { event_id: "evt-1" })).results[0]!.outcome).toBe(
      "duplicate",
    );
    expect(
      (await deliver("T-2", "in_transit", { occurred_at: "2026-10-04T10:00:00Z" })).results[0]!
        .outcome,
    ).toBe("stale");
    expect(
      (await deliver("T-2", "Retourné", { occurred_at: "2026-10-06T10:00:00Z" })).results[0]!
        .outcome,
    ).toBe("ignored_after_delivery");
    expect((await cardRow(card!.serial)).status).toBe("sold");
    const [shipment] = await getDb().select().from(shipments);
    expect(shipment!.status).toBe("delivered");
  });

  it("attaches the carrier's tracking number from an order reference", async () => {
    const created = await ingestLandingOrder(landingOrder(), testMeta());
    const { results } = await handleDeliveryWebhook(
      {
        events: [
          { order_id: "lp-1001", tracking_number: "NEW-1", status: "Expédié", carrier: "Noest" },
        ],
      },
      testMeta(),
    );
    expect(results[0]).toMatchObject({
      outcome: "applied",
      status: "in_transit",
      orderNumber: created.orderNumber,
    });
    const [shipment] = await getDb().select().from(shipments);
    expect(shipment).toMatchObject({ trackingNumber: "NEW-1", carrier: "noest" });
    expect((await deliver("UNKNOWN-9", "Livré")).results[0]!.outcome).toBe("unknown_tracking");
  });

  it("unlocks a card packed after the parcel was already delivered", async () => {
    const [card] = await newCards(1);
    await ingestLandingOrder(landingOrder({ tracking_number: "T-3" }), testMeta());
    await deliver("T-3", "Livrée");
    const assigned = await assignCardToOrder(
      admin,
      { orderId: await orderId(), serial: card!.serial },
      testMeta(),
    );
    expect(assigned.unlocked).toBe(true);
    await checkActivationCode({ code: card!.code, meta: testMeta() });
  });
});

describe("packing rules", () => {
  it("only packs available, sale-gated cards, within the ordered quantity", async () => {
    const [first, second] = await newCards(2);
    const [ungated] = await newCards(1, { requiresSale: false });
    const [counterSold] = await newCards(1);
    await markCardsSold(admin, { serials: [counterSold!.serial] }, testMeta());

    await ingestLandingOrder(landingOrder(), testMeta());
    await ingestLandingOrder(landingOrder({ order_id: "lp-2", phone: "0770000000" }), testMeta());
    const id = await orderId();
    const other = await orderId("lp-2");

    const refused = async (serial: string, status: string, target = id) => {
      try {
        await assignCardToOrder(admin, { orderId: target, serial }, testMeta());
      } catch (error) {
        expect((error as { details?: { status?: string } }).details?.status).toBe(status);
        return;
      }
      throw new Error(`expected ${status}`);
    };
    await refused(ungated!.serial, "no_sale_gate");
    await refused(counterSold!.serial, "sold");
    await expectAppError(
      assignCardToOrder(admin, { orderId: id, serial: "B9999-00001" }, testMeta()),
      "NOT_FOUND",
    );

    await assignCardToOrder(admin, { orderId: id, serial: first!.serial }, testMeta());
    await refused(first!.serial, "already_assigned");
    await refused(first!.serial, "in_other_order", other);
    await refused(second!.serial, "order_full");

    // Counter sales cannot bypass the carrier for a packed card.
    const sale = await markCardsSold(admin, { serials: [first!.serial] }, testMeta());
    expect(sale.skipped).toEqual([{ serial: first!.serial, reason: "IN_ORDER" }]);

    // Sales agents pack cards but cannot set a delivery status by hand.
    const sales = await staffActor("sales@academy.test", "sales_agent");
    await assignCardToOrder(sales, { orderId: other, serial: second!.serial }, testMeta());
    await setOrderShipment(
      sales,
      { orderId: other, carrier: "Yalidine", trackingNumber: "Y-1" },
      testMeta(),
    );
    await expectAppError(
      overrideDeliveryStatus(
        sales,
        { orderId: other, status: "delivered", reason: "trust me" },
        testMeta(),
      ),
      "FORBIDDEN",
    );
    await expectAppError(
      importDeliveryCsv(sales, "tracking,status\nY-1,Livré\n", testMeta()),
      "FORBIDDEN",
    );
    const support = await staffActor("support@academy.test", "support_agent");
    await expectAppError(listOrders(support, { limit: 10, offset: 0 }), "FORBIDDEN");
  });

  it("lets an admin override the delivery status, with a reason, both ways", async () => {
    const [card] = await newCards(1);
    await ingestLandingOrder(landingOrder({ tracking_number: "T-4" }), testMeta());
    const id = await orderId();
    await assignCardToOrder(admin, { orderId: id, serial: card!.serial }, testMeta());

    const delivered = await overrideDeliveryStatus(
      admin,
      { orderId: id, status: "delivered", reason: "Confirmed by phone with the carrier" },
      testMeta(),
    );
    expect(delivered).toMatchObject({ previous: "pending", status: "delivered", cardsUnlocked: 1 });
    expect((await cardRow(card!.serial)).status).toBe("sold");
    const row = await cardRow(card!.serial);
    await expectAppError(markCardUnsold(admin, row.id, testMeta()), "INVALID_STATE");

    const reverted = await overrideDeliveryStatus(
      admin,
      { orderId: id, status: "returned", reason: "Carrier corrected: parcel refused" },
      testMeta(),
    );
    expect(reverted).toMatchObject({ cardsRelocked: 1, cardsAlreadyActivated: 0 });
    expect((await cardRow(card!.serial)).status).toBe("available");
    const [payment] = await getDb().select().from(payments).where(eq(payments.orderId, id));
    expect(payment!.status).toBe("cancelled");
    const [order] = await getDb().select().from(orders).where(eq(orders.id, id));
    expect(order!.status).toBe("cancelled");
    const [shipment] = await getDb().select().from(shipments);
    expect(shipment!.history.map((entry) => entry.source)).toEqual(["webhook", "manual", "manual"]);
  });

  it("cancels an undelivered order and refuses to cancel a delivered one", async () => {
    await ingestLandingOrder(landingOrder({ tracking_number: "T-5" }), testMeta());
    await ingestLandingOrder(
      landingOrder({ order_id: "lp-6", tracking_number: "T-6" }),
      testMeta(),
    );
    await cancelOrder(
      admin,
      { orderId: await orderId(), reason: "Customer cancelled" },
      testMeta(),
    );
    await deliver("T-6", "Livré");
    await expectAppError(
      cancelOrder(admin, { orderId: await orderId("lp-6"), reason: "too late" }, testMeta()),
      "INVALID_STATE",
    );
  });
});

describe("carrier CSV import and order lists", () => {
  it("imports a semicolon-separated carrier export", async () => {
    const [a, b] = await newCards(2);
    await ingestLandingOrder(
      landingOrder({ order_id: "c-1", tracking_number: "YAL-1" }),
      testMeta(),
    );
    await ingestLandingOrder(
      landingOrder({ order_id: "c-2", phone: "0770111222", tracking_number: "YAL-2" }),
      testMeta(),
    );
    await assignCardToOrder(
      admin,
      { orderId: await orderId("c-1"), serial: a!.serial },
      testMeta(),
    );
    await assignCardToOrder(
      admin,
      { orderId: await orderId("c-2"), serial: b!.serial },
      testMeta(),
    );

    const csv = [
      "N° Tracking;Destinataire;Statut;Date",
      "yal-1;Yacine;Livré;2026-10-07 11:00:00",
      'YAL-2;"Amina; B";Sorti en livraison;2026-10-07 09:00:00',
      "YAL-404;Inconnu;Livré;2026-10-07 09:00:00",
      ";;;",
      "YAL-2;Amina;???;",
    ].join("\r\n");
    const summary = await importDeliveryCsv(admin, csv, testMeta());
    expect(summary.columns).toMatchObject({ tracking: "N° Tracking", status: "Statut" });
    expect(summary.counts).toMatchObject({
      delivered: 1,
      applied: 1,
      unknown_tracking: 1,
      unknown_status: 1,
    });
    expect((await cardRow(a!.serial)).status).toBe("sold");
    expect((await cardRow(b!.serial)).status).toBe("available");
  });

  it("filters by stage and finds orders by phone, tracking number or card serial", async () => {
    const [card] = await newCards(1);
    await ingestLandingOrder(landingOrder({ order_id: "s-1", tracking_number: "S-1" }), testMeta());
    await ingestLandingOrder(landingOrder({ order_id: "s-2", phone: "0699887766" }), testMeta());
    await assignCardToOrder(
      admin,
      { orderId: await orderId("s-1"), serial: card!.serial },
      testMeta(),
    );

    const all = await listOrders(admin, { limit: 10, offset: 0 });
    expect(all.total).toBe(2);
    expect(all.stageCounts).toMatchObject({
      all: 2,
      needs_card: 1,
      needs_tracking: 1,
      in_delivery: 1,
      delivered: 0,
    });

    const needsCard = await listOrders(admin, { stage: "needs_card", limit: 10, offset: 0 });
    expect(needsCard.items.map((item) => item.customerPhone)).toEqual(["0699887766"]);
    expect((await listOrders(admin, { search: "99 88 77", limit: 10, offset: 0 })).total).toBe(1);
    expect((await listOrders(admin, { search: "s-1", limit: 10, offset: 0 })).total).toBe(1);
    expect(
      (await listOrders(admin, { search: card!.serial.toLowerCase(), limit: 10, offset: 0 })).total,
    ).toBe(1);

    await deliver("S-1", "Livré");
    const delivered = await listOrders(admin, { stage: "delivered", limit: 10, offset: 0 });
    expect(delivered.items).toHaveLength(1);
    expect(delivered.items[0]).toMatchObject({ cardsAssigned: 1, cardCapacity: 1 });
  });

  it("stores raw carrier messages for traceability without duplicating event ids", async () => {
    await ingestLandingOrder(landingOrder({ tracking_number: "L-1" }), testMeta());
    await applyDeliveryEvent(
      { trackingNumber: "L-1", status: "Livré", eventId: "e-9" },
      { source: "webhook" },
    );
    await applyDeliveryEvent(
      { trackingNumber: "L-1", status: "Livré", eventId: "e-9" },
      { source: "webhook" },
    );
    const logged = await getDb()
      .select()
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.source, "delivery_webhook"),
          eq(integrationEvents.externalId, "e-9"),
        ),
      );
    expect(logged).toHaveLength(1);
  });
});
