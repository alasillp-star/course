import "server-only";
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import {
  activationBatches,
  activationCodes,
  customers,
  integrationEvents,
  orderItems,
  orders,
  payments,
  shipments,
  users,
  type ShipmentHistoryEntry,
} from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { AppError, isUniqueViolation } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import type {
  IntegrationEventStatus,
  OrderChannel,
  ShipmentEventSource,
  ShipmentStatus,
} from "@/shared/enums";
import { assertCan, can, type Actor } from "../access/actor";
import { recordActivationEvents } from "../activation/events";
import { recordAudit } from "../audit/audit.service";
import { maskEmail } from "../identity/email";
import { canApplyCarrierUpdate, normalizeCarrierStatus } from "./delivery-status";
import {
  InboundPayloadError,
  isCancelledSourceStatus,
  normalizeCarrierKey,
  normalizeTracking,
  parseDeliveryCsv,
  parseDeliveryEvents,
  parseInboundOrder,
  type InboundDeliveryEvent,
  type InboundOrder,
} from "./inbound";

/**
 * Orders from the landing site and the delivery of their parcels.
 *
 * The rule this module enforces: a card packed into a customer's parcel is
 * linked to the order ("assigned") but stays NOT sold — and therefore cannot be
 * redeemed — until the carrier reports the parcel delivered. Delivery marks the
 * order paid (cash on delivery), records the payment and sells the order's
 * cards in one transaction. Statuses come from the carrier (webhook or an
 * import of its export); a by-hand override needs `orders.delivery.override`
 * and a reason, and is audited.
 */

export const LANDING_SOURCE = "landing_site";
export const INTEGRATION_SOURCES = {
  landing: "landing_site",
  deliveryWebhook: "delivery_webhook",
  deliveryImport: "delivery_import",
} as const;

const HISTORY_LIMIT = 100;
/** Carrier timestamps more than this far in the future are replaced by "now". */
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

type OrderRow = typeof orders.$inferSelect;
type ShipmentRow = typeof shipments.$inferSelect;

// Integration log ---------------------------------------------------------------

async function logIntegrationEvent(
  executor: Executor,
  entry: {
    source: string;
    externalId?: string | null;
    status: IntegrationEventStatus;
    error?: string | null;
    payload: unknown;
  },
): Promise<void> {
  await executor.insert(integrationEvents).values({
    source: entry.source,
    externalId: entry.externalId ?? null,
    status: entry.status,
    error: entry.error ?? null,
    payload: entry.payload ?? {},
  });
}

function payloadError(error: InboundPayloadError): AppError {
  return new AppError("VALIDATION_ERROR", error.message, { field: error.field });
}

// Helpers ---------------------------------------------------------------------------

function appendHistory(
  history: ShipmentHistoryEntry[],
  entry: ShipmentHistoryEntry,
): ShipmentHistoryEntry[] {
  return [...history, entry].slice(-HISTORY_LIMIT);
}

async function nextOrderNumber(tx: Transaction): Promise<string> {
  const rows = await tx.execute<{ value: string }>(
    sql`select nextval('order_number_seq')::text as value`,
  );
  return `ORD-${rows[0]!.value}`;
}

async function upsertCustomer(
  tx: Transaction,
  customer: InboundOrder["customer"],
  actorUserId: string | null,
): Promise<string> {
  if (customer.phone) {
    const [existing] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.phone, customer.phone), isNull(customers.deletedAt)))
      .limit(1);
    if (existing) {
      await tx
        .update(customers)
        .set({
          fullName: customer.fullName,
          ...(customer.email ? { email: customer.email } : {}),
          ...(customer.city ? { city: customer.city } : {}),
          ...(customer.region ? { region: customer.region } : {}),
        })
        .where(eq(customers.id, existing.id));
      return existing.id;
    }
  }
  const [created] = await tx
    .insert(customers)
    .values({
      fullName: customer.fullName,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
      city: customer.city ?? null,
      region: customer.region ?? null,
      createdBy: actorUserId,
    })
    .returning({ id: customers.id });
  return created!.id;
}

async function insertOrder(
  tx: Transaction,
  input: {
    order: InboundOrder;
    source: string | null;
    channel: OrderChannel;
    actorUserId: string | null;
  },
): Promise<OrderRow> {
  const { order: inbound } = input;
  const customerId = await upsertCustomer(tx, inbound.customer, input.actorUserId);
  const total = inbound.totalMinor ?? 0;
  const [order] = await tx
    .insert(orders)
    .values({
      orderNumber: await nextOrderNumber(tx),
      customerId,
      channel: input.channel,
      status: "pending_payment",
      currency: inbound.currency,
      subtotalMinor: total,
      totalMinor: total,
      notes: inbound.notes ?? null,
      externalSource: input.source,
      externalId: input.source ? inbound.externalId : null,
      shippingAddress: {
        region: inbound.customer.region,
        city: inbound.customer.city,
        address: inbound.address,
      },
      metadata: {
        product: inbound.product ?? null,
        shippingFeeMinor: inbound.shippingFeeMinor ?? null,
        sourceStatus: inbound.sourceStatus ?? null,
      },
      placedAt: inbound.placedAt ?? new Date(),
      createdBy: input.actorUserId,
    })
    .returning();
  const unit = Math.round(total / inbound.quantity);
  await tx.insert(orderItems).values({
    orderId: order!.id,
    kind: "activation_card",
    description: inbound.product ?? "Activation card",
    quantity: inbound.quantity,
    unitPriceMinor: unit,
    totalMinor: unit * inbound.quantity,
  });
  if (inbound.shipment) {
    await upsertShipment(tx, order!, {
      carrier: inbound.shipment.carrier,
      trackingNumber: inbound.shipment.trackingNumber,
      source: input.actorUserId ? "manual" : "webhook",
      actorUserId: input.actorUserId,
    });
  }
  return order!;
}

async function upsertShipment(
  tx: Transaction,
  order: OrderRow,
  params: {
    carrier?: string;
    trackingNumber: string;
    source: ShipmentEventSource;
    actorUserId: string | null;
  },
): Promise<ShipmentRow> {
  const trackingNumber = normalizeTracking(params.trackingNumber);
  if (!trackingNumber)
    throw new AppError("VALIDATION_ERROR", undefined, { field: "trackingNumber" });
  const carrier = params.carrier ? normalizeCarrierKey(params.carrier) : undefined;
  const [existing] = await tx
    .select()
    .from(shipments)
    .where(eq(shipments.orderId, order.id))
    .for("update");
  const now = new Date();
  try {
    if (!existing) {
      const [created] = await tx
        .insert(shipments)
        .values({
          orderId: order.id,
          carrier: carrier ?? "unknown",
          trackingNumber,
          history: [
            {
              at: now.toISOString(),
              status: "pending",
              source: params.source,
              actorUserId: params.actorUserId,
              note: "tracking_set",
            },
          ],
          createdBy: params.actorUserId,
        })
        .returning();
      return created!;
    }
    if (existing.trackingNumber === trackingNumber && (!carrier || existing.carrier === carrier)) {
      return existing;
    }
    if (existing.status === "delivered") {
      throw new AppError("INVALID_STATE", undefined, { status: "delivered" });
    }
    const [updated] = await tx
      .update(shipments)
      .set({
        trackingNumber,
        carrier: carrier ?? existing.carrier,
        history: appendHistory(existing.history, {
          at: now.toISOString(),
          status: existing.status,
          source: params.source,
          actorUserId: params.actorUserId,
          note: `tracking_changed:${existing.trackingNumber}`,
        }),
      })
      .where(eq(shipments.id, existing.id))
      .returning();
    return updated!;
  } catch (error) {
    if (isUniqueViolation(error, "shipments_carrier_tracking_key")) {
      throw new AppError("CONFLICT", "tracking number used by another order", {
        field: "trackingNumber",
      });
    }
    throw error;
  }
}

/** Sells every assigned, still-available card of a delivered order. */
async function unlockOrderCards(
  tx: Transaction,
  order: OrderRow,
  ctx: { at: Date; source: ShipmentEventSource; actorUserId: string | null; meta?: RequestMeta },
): Promise<number> {
  const cards = await tx
    .select({ id: activationCodes.id, batchId: activationCodes.batchId })
    .from(activationCodes)
    .where(and(eq(activationCodes.orderId, order.id), eq(activationCodes.status, "available")))
    .for("update");
  if (cards.length === 0) return 0;
  await tx
    .update(activationCodes)
    .set({ status: "sold", soldAt: ctx.at, soldBy: ctx.actorUserId })
    .where(
      inArray(
        activationCodes.id,
        cards.map((card) => card.id),
      ),
    );
  await recordActivationEvents(
    tx,
    cards.map((card) => ({
      type: "code_sold" as const,
      batchId: card.batchId,
      codeId: card.id,
      actorUserId: ctx.actorUserId,
      meta: ctx.meta,
      metadata: {
        via: "delivery",
        source: ctx.source,
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
    })),
  );
  return cards.length;
}

async function markOrderPaid(
  tx: Transaction,
  order: OrderRow,
  shipment: ShipmentRow,
  ctx: { at: Date; actorUserId: string | null },
): Promise<void> {
  await tx
    .update(orders)
    .set({ status: "paid", paidAt: ctx.at, cancelledAt: null })
    .where(eq(orders.id, order.id));
  if (order.totalMinor <= 0) return;
  const [existing] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.provider, "cash_on_delivery")))
    .limit(1);
  if (existing) {
    await tx
      .update(payments)
      .set({ status: "succeeded", receivedAt: ctx.at, failureReason: null })
      .where(eq(payments.id, existing.id));
    return;
  }
  await tx.insert(payments).values({
    orderId: order.id,
    provider: "cash_on_delivery",
    status: "succeeded",
    amountMinor: order.totalMinor,
    currency: order.currency,
    // Collected by the carrier; its remittance to the academy is reconciled separately.
    providerReference: `${shipment.carrier}:${shipment.trackingNumber}`,
    receivedBy: ctx.actorUserId,
    receivedAt: ctx.at,
  });
}

/** Undoes a delivery (staff override only): re-locks unused cards, voids the COD payment. */
async function revertDelivery(
  tx: Transaction,
  order: OrderRow,
  next: ShipmentStatus,
  ctx: { source: ShipmentEventSource; actorUserId: string | null; meta?: RequestMeta },
): Promise<{ relocked: number; alreadyActivated: number }> {
  const cards = await tx
    .select({
      id: activationCodes.id,
      batchId: activationCodes.batchId,
      status: activationCodes.status,
    })
    .from(activationCodes)
    .where(eq(activationCodes.orderId, order.id))
    .for("update");
  const sold = cards.filter((card) => card.status === "sold");
  if (sold.length > 0) {
    await tx
      .update(activationCodes)
      .set({ status: "available", soldAt: null, soldBy: null })
      .where(
        inArray(
          activationCodes.id,
          sold.map((card) => card.id),
        ),
      );
    await recordActivationEvents(
      tx,
      sold.map((card) => ({
        type: "code_unsold" as const,
        batchId: card.batchId,
        codeId: card.id,
        actorUserId: ctx.actorUserId,
        meta: ctx.meta,
        metadata: { via: "delivery_reverted", orderId: order.id, orderNumber: order.orderNumber },
      })),
    );
  }
  await tx
    .update(payments)
    .set({ status: "cancelled", failureReason: "delivery_reverted" })
    .where(
      and(
        eq(payments.orderId, order.id),
        eq(payments.provider, "cash_on_delivery"),
        eq(payments.status, "succeeded"),
      ),
    );
  const failed = next === "returned" || next === "cancelled";
  await tx
    .update(orders)
    .set({
      status: failed ? "cancelled" : "pending_payment",
      paidAt: null,
      cancelledAt: failed ? new Date() : null,
    })
    .where(eq(orders.id, order.id));
  return {
    relocked: sold.length,
    alreadyActivated: cards.filter((card) => card.status === "activated").length,
  };
}

export type StatusChangeResult = {
  previous: ShipmentStatus;
  status: ShipmentStatus;
  cardsUnlocked: number;
  cardsRelocked: number;
  /** Cards already redeemed when a delivery was reverted (access must be handled by staff). */
  cardsAlreadyActivated: number;
};

/** Moves a (locked) shipment to `next` and applies the consequences to the order and its cards. */
async function changeShipmentStatus(
  tx: Transaction,
  shipment: ShipmentRow,
  order: OrderRow,
  next: ShipmentStatus,
  ctx: {
    /** Effective time of the change (carrier timestamp, or now). */
    at: Date;
    /** The carrier's own timestamp, when it sent one (ordering of later messages). */
    eventAt?: Date | null;
    carrierStatus: string | null;
    source: ShipmentEventSource;
    actorUserId: string | null;
    note?: string | null;
    meta?: RequestMeta;
  },
): Promise<StatusChangeResult> {
  const previous = shipment.status;
  const now = new Date();
  await tx
    .update(shipments)
    .set({
      status: next,
      carrierStatus: ctx.carrierStatus ?? shipment.carrierStatus,
      deliveredAt: next === "delivered" ? ctx.at : null,
      returnedAt: next === "returned" ? ctx.at : shipment.returnedAt,
      lastEventAt: ctx.eventAt ?? shipment.lastEventAt,
      lastSyncedAt: now,
      history: appendHistory(shipment.history, {
        at: ctx.at.toISOString(),
        status: next,
        carrierStatus: ctx.carrierStatus,
        source: ctx.source,
        actorUserId: ctx.actorUserId,
        note: ctx.note ?? null,
      }),
    })
    .where(eq(shipments.id, shipment.id));

  const result: StatusChangeResult = {
    previous,
    status: next,
    cardsUnlocked: 0,
    cardsRelocked: 0,
    cardsAlreadyActivated: 0,
  };
  if (next === "delivered") {
    await markOrderPaid(tx, order, shipment, { at: ctx.at, actorUserId: ctx.actorUserId });
    result.cardsUnlocked = await unlockOrderCards(tx, order, ctx);
  } else if (previous === "delivered") {
    const reverted = await revertDelivery(tx, order, next, ctx);
    result.cardsRelocked = reverted.relocked;
    result.cardsAlreadyActivated = reverted.alreadyActivated;
  } else if (next === "returned" || next === "cancelled") {
    if (order.status === "pending_payment" || order.status === "draft") {
      await tx
        .update(orders)
        .set({ status: "cancelled", cancelledAt: now })
        .where(eq(orders.id, order.id));
    }
  } else if (
    order.status === "cancelled" &&
    (previous === "returned" || previous === "cancelled")
  ) {
    // The carrier picked the parcel up again.
    await tx
      .update(orders)
      .set({ status: "pending_payment", cancelledAt: null })
      .where(eq(orders.id, order.id));
  }

  await recordAudit(tx, {
    action: ctx.source === "manual" ? "orders.delivery_override" : "orders.delivery_status_changed",
    actorUserId: ctx.actorUserId,
    targetType: "order",
    targetId: order.id,
    meta: ctx.meta,
    metadata: {
      orderNumber: order.orderNumber,
      from: previous,
      to: next,
      source: ctx.source,
      carrierStatus: ctx.carrierStatus,
      cardsUnlocked: result.cardsUnlocked,
      cardsRelocked: result.cardsRelocked,
      ...(ctx.source === "manual" ? { reason: ctx.note } : {}),
    },
  });
  return result;
}

async function lockOrder(tx: Transaction, orderId: string): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new AppError("NOT_FOUND");
  return order;
}

// Landing-site orders ----------------------------------------------------------------

export type IngestResult =
  | { orderId: string; orderNumber: string; created: boolean; status: OrderRow["status"] }
  /** Cancelled or deleted on the landing site before we ever imported it. */
  | { orderId: null; orderNumber: null; created: false; status: "ignored" };

/**
 * Creates (or updates) an order sent by the landing site. Idempotent on the
 * landing site's order id: redeliveries and later updates of the same order
 * never create a second one.
 */
export async function ingestLandingOrder(
  payload: unknown,
  meta: RequestMeta,
): Promise<IngestResult> {
  const db = getDb();
  let inbound: InboundOrder;
  try {
    inbound = parseInboundOrder(payload);
  } catch (error) {
    if (error instanceof InboundPayloadError) {
      await logIntegrationEvent(db, {
        source: INTEGRATION_SOURCES.landing,
        status: "failed",
        error: error.message,
        payload,
      });
      throw payloadError(error);
    }
    throw error;
  }

  const run = () =>
    db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(
          and(eq(orders.externalSource, LANDING_SOURCE), eq(orders.externalId, inbound.externalId)),
        )
        .for("update");

      if (!existing) {
        if (inbound.event === "delete" || isCancelledSourceStatus(inbound.sourceStatus)) {
          await logIntegrationEvent(tx, {
            source: INTEGRATION_SOURCES.landing,
            status: "ignored",
            error: "cancelled_before_import",
            payload,
          });
          return { orderId: null, orderNumber: null, created: false, status: "ignored" } as const;
        }
        const order = await insertOrder(tx, {
          order: inbound,
          source: LANDING_SOURCE,
          channel: "online",
          actorUserId: null,
        });
        await recordAudit(tx, {
          action: "orders.created",
          targetType: "order",
          targetId: order.id,
          meta,
          metadata: { orderNumber: order.orderNumber, source: LANDING_SOURCE },
        });
        await logIntegrationEvent(tx, {
          source: INTEGRATION_SOURCES.landing,
          status: "processed",
          payload,
        });
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          created: true,
          status: order.status,
        } as IngestResult;
      }

      // Update of a known order.
      let status = existing.status;
      if (inbound.event === "delete" || isCancelledSourceStatus(inbound.sourceStatus)) {
        if (existing.status === "pending_payment" || existing.status === "draft") {
          await tx
            .update(orders)
            .set({ status: "cancelled", cancelledAt: new Date() })
            .where(eq(orders.id, existing.id));
          status = "cancelled";
          await recordAudit(tx, {
            action: "orders.cancelled",
            targetType: "order",
            targetId: existing.id,
            meta,
            metadata: { orderNumber: existing.orderNumber, source: LANDING_SOURCE },
          });
        }
      } else {
        const editable = existing.status === "pending_payment" || existing.status === "draft";
        await tx
          .update(orders)
          .set({
            // Partial updates only change what they carry.
            ...(editable && inbound.totalMinor !== undefined
              ? {
                  subtotalMinor: inbound.totalMinor,
                  totalMinor: inbound.totalMinor,
                  currency: inbound.currency,
                }
              : {}),
            notes: inbound.notes ?? existing.notes,
            shippingAddress: {
              region: inbound.customer.region ?? existing.shippingAddress?.region,
              city: inbound.customer.city ?? existing.shippingAddress?.city,
              address: inbound.address ?? existing.shippingAddress?.address,
            },
            metadata: {
              ...existing.metadata,
              product: inbound.product ?? existing.metadata.product ?? null,
              sourceStatus: inbound.sourceStatus ?? null,
            },
          })
          .where(eq(orders.id, existing.id));
        if (inbound.shipment) {
          await upsertShipment(tx, existing, {
            carrier: inbound.shipment.carrier,
            trackingNumber: inbound.shipment.trackingNumber,
            source: "webhook",
            actorUserId: null,
          });
        }
      }
      await logIntegrationEvent(tx, {
        source: INTEGRATION_SOURCES.landing,
        status: "processed",
        payload,
      });
      return {
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        created: false,
        status,
      } as IngestResult;
    });

  try {
    return await run();
  } catch (error) {
    // Two deliveries of the same new order raced: the loser re-reads it as an update.
    if (isUniqueViolation(error, "orders_external_key")) return run();
    if (error instanceof AppError) {
      await logIntegrationEvent(db, {
        source: INTEGRATION_SOURCES.landing,
        status: "failed",
        error: error.code,
        payload,
      });
    }
    throw error;
  }
}

// Carrier updates ----------------------------------------------------------------------

export type DeliveryOutcome =
  | "applied"
  | "delivered"
  | "unchanged"
  | "duplicate"
  | "stale"
  | "unknown_tracking"
  | "unknown_status"
  | "tracking_mismatch"
  | "ignored_after_delivery";

export type DeliveryEventResult = {
  trackingNumber?: string;
  orderReference?: string;
  outcome: DeliveryOutcome;
  orderNumber?: string;
  status?: ShipmentStatus;
  cardsUnlocked?: number;
};

async function findShipmentForEvent(
  tx: Transaction,
  event: InboundDeliveryEvent,
): Promise<{ shipment: ShipmentRow | null; mismatch?: boolean }> {
  if (event.trackingNumber) {
    const matches = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.trackingNumber, event.trackingNumber));
    const shipment =
      matches.length === 1
        ? matches[0]!
        : (matches.find((candidate) => candidate.carrier === event.carrier) ?? null);
    if (shipment) return { shipment };
  }
  if (!event.orderReference) return { shipment: null };
  const reference = event.orderReference.trim();
  const [order] = await tx
    .select()
    .from(orders)
    .where(
      or(
        eq(orders.orderNumber, reference.toUpperCase()),
        and(eq(orders.externalSource, LANDING_SOURCE), eq(orders.externalId, reference)),
      ),
    )
    .limit(1);
  if (!order) return { shipment: null };
  await lockOrder(tx, order.id);
  const [existing] = await tx.select().from(shipments).where(eq(shipments.orderId, order.id));
  if (existing) {
    if (event.trackingNumber && existing.trackingNumber !== event.trackingNumber) {
      return { shipment: null, mismatch: true };
    }
    return { shipment: existing };
  }
  if (!event.trackingNumber) return { shipment: null };
  // First message about this parcel: the carrier tells us its tracking number.
  const created = await upsertShipment(tx, order, {
    carrier: event.carrier,
    trackingNumber: event.trackingNumber,
    source: "webhook",
    actorUserId: null,
  });
  return { shipment: created };
}

/**
 * Applies one carrier status message. Each message runs in its own transaction
 * so a bad row never blocks the others; every message is logged.
 */
export async function applyDeliveryEvent(
  event: InboundDeliveryEvent,
  options: {
    source: Extract<ShipmentEventSource, "webhook" | "import" | "poll">;
    actorUserId?: string | null;
    meta?: RequestMeta;
    /** Raw message stored in the integration log (webhooks only). */
    payload?: unknown;
  },
): Promise<DeliveryEventResult> {
  const db = getDb();
  const logSource =
    options.source === "import"
      ? INTEGRATION_SOURCES.deliveryImport
      : INTEGRATION_SOURCES.deliveryWebhook;
  const base = { trackingNumber: event.trackingNumber, orderReference: event.orderReference };
  try {
    return await db.transaction(async (tx) => {
      if (event.eventId) {
        const [seen] = await tx
          .select({ id: integrationEvents.id })
          .from(integrationEvents)
          .where(
            and(
              eq(integrationEvents.source, logSource),
              eq(integrationEvents.externalId, event.eventId),
            ),
          );
        if (seen) return { ...base, outcome: "duplicate" as const };
      }
      const log = async (status: IntegrationEventStatus, outcome: DeliveryOutcome) => {
        if (options.source === "import") return; // imports are summarised once, see importDeliveryCsv
        await logIntegrationEvent(tx, {
          source: logSource,
          externalId: event.eventId,
          status,
          error: status === "processed" ? null : outcome,
          payload: options.payload ?? event,
        });
      };

      const found = await findShipmentForEvent(tx, event);
      if (!found.shipment) {
        const outcome: DeliveryOutcome = found.mismatch ? "tracking_mismatch" : "unknown_tracking";
        await log("ignored", outcome);
        return { ...base, outcome };
      }
      // Lock order then shipment, the same order as every staff operation (no deadlocks).
      const order = await lockOrder(tx, found.shipment.orderId);
      const [shipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, found.shipment.id))
        .for("update");
      if (!shipment) return { ...base, outcome: "unknown_tracking" as const };
      const result = { ...base, orderNumber: order.orderNumber };
      const now = new Date();
      const at =
        event.occurredAt && event.occurredAt.getTime() <= now.getTime() + MAX_CLOCK_SKEW_MS
          ? event.occurredAt
          : now;
      const next = normalizeCarrierStatus(event.status);

      if (!next) {
        if (shipment.carrierStatus !== event.status) {
          await tx
            .update(shipments)
            .set({
              carrierStatus: event.status,
              lastSyncedAt: now,
              history: appendHistory(shipment.history, {
                at: at.toISOString(),
                status: shipment.status,
                carrierStatus: event.status,
                source: options.source,
                actorUserId: options.actorUserId ?? null,
                note: "unrecognised_status",
              }),
            })
            .where(eq(shipments.id, shipment.id));
        }
        await log("ignored", "unknown_status");
        return { ...result, outcome: "unknown_status" as const, status: shipment.status };
      }
      if (shipment.lastEventAt && event.occurredAt && event.occurredAt < shipment.lastEventAt) {
        await log("ignored", "stale");
        return { ...result, outcome: "stale" as const, status: shipment.status };
      }
      if (next === shipment.status) {
        await tx
          .update(shipments)
          .set({
            carrierStatus: event.status,
            lastEventAt: event.occurredAt ?? shipment.lastEventAt,
            lastSyncedAt: now,
          })
          .where(eq(shipments.id, shipment.id));
        await log("processed", "unchanged");
        return { ...result, outcome: "unchanged" as const, status: next };
      }
      if (!canApplyCarrierUpdate(shipment.status, next)) {
        await tx
          .update(shipments)
          .set({
            lastSyncedAt: now,
            history: appendHistory(shipment.history, {
              at: at.toISOString(),
              status: shipment.status,
              carrierStatus: event.status,
              source: options.source,
              actorUserId: options.actorUserId ?? null,
              note: `ignored_after_delivery:${next}`,
            }),
          })
          .where(eq(shipments.id, shipment.id));
        await log("ignored", "ignored_after_delivery");
        return { ...result, outcome: "ignored_after_delivery" as const, status: shipment.status };
      }
      const change = await changeShipmentStatus(tx, shipment, order, next, {
        at,
        eventAt: at === now ? null : at,
        carrierStatus: event.status,
        source: options.source,
        actorUserId: options.actorUserId ?? null,
        meta: options.meta,
      });
      await log("processed", next === "delivered" ? "delivered" : "applied");
      return {
        ...result,
        outcome: next === "delivered" ? ("delivered" as const) : ("applied" as const),
        status: next,
        cardsUnlocked: change.cardsUnlocked,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error, "integration_events_source_external_key")) {
      return { ...base, outcome: "duplicate" };
    }
    throw error;
  }
}

/** Delivery webhook body -> results per message. */
export async function handleDeliveryWebhook(
  payload: unknown,
  meta: RequestMeta,
): Promise<{ results: DeliveryEventResult[] }> {
  let events: InboundDeliveryEvent[];
  try {
    events = parseDeliveryEvents(payload);
  } catch (error) {
    if (error instanceof InboundPayloadError) {
      await logIntegrationEvent(getDb(), {
        source: INTEGRATION_SOURCES.deliveryWebhook,
        status: "failed",
        error: error.message,
        payload,
      });
      throw payloadError(error);
    }
    throw error;
  }
  const results: DeliveryEventResult[] = [];
  for (const event of events) {
    results.push(
      await applyDeliveryEvent(event, {
        source: "webhook",
        meta,
        payload: events.length === 1 ? payload : event,
      }),
    );
  }
  return { results };
}

export type ImportSummary = {
  rows: number;
  invalidRows: number[];
  counts: Record<DeliveryOutcome, number>;
  /** Rows needing attention (unknown tracking / status, conflicts), first 100. */
  issues: DeliveryEventResult[];
  columns: { tracking: string; status: string; reference?: string; date?: string };
};

/**
 * Imports a status export downloaded from the carrier's dashboard (CSV). It can
 * unlock cards like the carrier itself, so it requires the override permission.
 */
export async function importDeliveryCsv(
  actor: Actor,
  csv: string,
  meta: RequestMeta,
): Promise<ImportSummary> {
  assertCan(actor, "orders.manage");
  assertCan(actor, "orders.delivery.override");
  let parsed: ReturnType<typeof parseDeliveryCsv>;
  try {
    parsed = parseDeliveryCsv(csv);
  } catch (error) {
    if (error instanceof InboundPayloadError) throw payloadError(error);
    throw error;
  }
  const counts = {
    applied: 0,
    delivered: 0,
    unchanged: 0,
    duplicate: 0,
    stale: 0,
    unknown_tracking: 0,
    unknown_status: 0,
    tracking_mismatch: 0,
    ignored_after_delivery: 0,
  } satisfies Record<DeliveryOutcome, number>;
  const issues: DeliveryEventResult[] = [];
  for (const event of parsed.events) {
    const result = await applyDeliveryEvent(event, {
      source: "import",
      actorUserId: actor.userId,
      meta,
    });
    counts[result.outcome] += 1;
    if (
      issues.length < 100 &&
      [
        "unknown_tracking",
        "unknown_status",
        "tracking_mismatch",
        "ignored_after_delivery",
      ].includes(result.outcome)
    ) {
      issues.push(result);
    }
  }
  const db = getDb();
  await logIntegrationEvent(db, {
    source: INTEGRATION_SOURCES.deliveryImport,
    status: "processed",
    payload: { rows: parsed.events.length, invalidRows: parsed.invalidRows.length, counts },
  });
  await recordAudit(db, {
    action: "orders.delivery_imported",
    actorUserId: actor.userId,
    meta,
    metadata: { rows: parsed.events.length, counts },
  });
  return {
    rows: parsed.events.length,
    invalidRows: parsed.invalidRows.slice(0, 100),
    counts,
    issues,
    columns: parsed.columns,
  };
}

// Staff operations --------------------------------------------------------------------

export type ManualOrderInput = {
  fullName: string;
  phone?: string;
  email?: string;
  region?: string;
  city?: string;
  address?: string;
  quantity: number;
  totalMinor: number;
  product?: string;
  notes?: string;
  carrier?: string;
  trackingNumber?: string;
};

/** Phone / walk-in order typed by staff (same delivery rules as landing-site orders). */
export async function createManualOrder(
  actor: Actor,
  input: ManualOrderInput,
  meta: RequestMeta,
): Promise<{ orderId: string; orderNumber: string }> {
  assertCan(actor, "orders.manage");
  return getDb().transaction(async (tx) => {
    const order = await insertOrder(tx, {
      order: {
        externalId: "",
        event: "upsert",
        customer: {
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          region: input.region,
          city: input.city,
        },
        address: input.address,
        quantity: input.quantity,
        totalMinor: input.totalMinor,
        currency: "DZD",
        product: input.product,
        notes: input.notes,
        shipment: input.trackingNumber
          ? { carrier: input.carrier, trackingNumber: input.trackingNumber }
          : undefined,
      },
      source: null,
      channel: "phone",
      actorUserId: actor.userId,
    });
    await tx.update(orders).set({ salesAgentId: actor.userId }).where(eq(orders.id, order.id));
    await recordAudit(tx, {
      action: "orders.created",
      actorUserId: actor.userId,
      targetType: "order",
      targetId: order.id,
      meta,
      metadata: { orderNumber: order.orderNumber, source: "manual" },
    });
    return { orderId: order.id, orderNumber: order.orderNumber };
  });
}

/**
 * Packs a printed card into an order's parcel: the card is linked to the order
 * but stays locked until the carrier reports delivery (immediately unlocked if
 * the parcel is already delivered).
 */
export async function assignCardToOrder(
  actor: Actor,
  params: { orderId: string; serial: string },
  meta: RequestMeta,
): Promise<{ codeId: string; serial: string; unlocked: boolean }> {
  assertCan(actor, "orders.manage");
  assertCan(actor, "activation.codes.sell");
  const serial = params.serial.trim().toUpperCase();
  if (!serial) throw new AppError("VALIDATION_ERROR", undefined, { field: "serial" });
  return getDb().transaction(async (tx) => {
    const order = await lockOrder(tx, params.orderId);
    if (order.status === "cancelled" || order.status === "refunded") {
      throw new AppError("INVALID_STATE", undefined, { status: "order_cancelled" });
    }
    const [row] = await tx
      .select({ code: activationCodes, batch: activationBatches })
      .from(activationCodes)
      .innerJoin(activationBatches, eq(activationBatches.id, activationCodes.batchId))
      .where(eq(activationCodes.serial, serial))
      .for("update", { of: activationCodes });
    if (!row) throw new AppError("NOT_FOUND", "card not found", { field: "serial" });
    const { code, batch } = row;
    if (code.orderId === order.id) {
      throw new AppError("INVALID_STATE", undefined, { status: "already_assigned" });
    }
    if (code.orderId) throw new AppError("INVALID_STATE", undefined, { status: "in_other_order" });
    if (code.status !== "available")
      throw new AppError("INVALID_STATE", undefined, { status: code.status });
    if (code.lockedAt) throw new AppError("INVALID_STATE", undefined, { status: "locked" });
    if (batch.status !== "active")
      throw new AppError("INVALID_STATE", undefined, { status: "batch_archived" });
    // Without the sale gate a card works as soon as it is printed: it cannot wait for delivery.
    if (!batch.requiresSale)
      throw new AppError("INVALID_STATE", undefined, { status: "no_sale_gate" });

    const items = await tx
      .select({ id: orderItems.id, quantity: orderItems.quantity })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, order.id), eq(orderItems.kind, "activation_card")));
    const capacity = items.reduce((sum, item) => sum + item.quantity, 0) || 1;
    const [{ assigned } = { assigned: 0 }] = await tx
      .select({ assigned: sql<number>`count(*)::int` })
      .from(activationCodes)
      .where(
        and(eq(activationCodes.orderId, order.id), sql`${activationCodes.status} <> 'revoked'`),
      );
    if (assigned >= capacity)
      throw new AppError("INVALID_STATE", undefined, { status: "order_full" });

    await tx
      .update(activationCodes)
      .set({ orderId: order.id, orderItemId: items[0]?.id ?? null })
      .where(eq(activationCodes.id, code.id));
    await recordActivationEvents(tx, [
      {
        type: "code_assigned",
        batchId: batch.id,
        codeId: code.id,
        actorUserId: actor.userId,
        meta,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      },
    ]);
    await recordAudit(tx, {
      action: "orders.card_assigned",
      actorUserId: actor.userId,
      targetType: "order",
      targetId: order.id,
      meta,
      metadata: { orderNumber: order.orderNumber, serial: code.serial },
    });

    // Parcel already delivered (card packed late or replaced): unlock now.
    const [shipment] = await tx
      .select({ status: shipments.status, deliveredAt: shipments.deliveredAt })
      .from(shipments)
      .where(eq(shipments.orderId, order.id));
    let unlocked = false;
    if (shipment?.status === "delivered") {
      unlocked =
        (await unlockOrderCards(tx, order, {
          at: shipment.deliveredAt ?? new Date(),
          source: "manual",
          actorUserId: actor.userId,
          meta,
        })) > 0;
    }
    return { codeId: code.id, serial: code.serial, unlocked };
  });
}

/** Takes a card out of a parcel (wrong card packed, parcel returned) while it is still locked. */
export async function unassignCardFromOrder(
  actor: Actor,
  params: { orderId: string; codeId: string },
  meta: RequestMeta,
): Promise<void> {
  assertCan(actor, "orders.manage");
  assertCan(actor, "activation.codes.sell");
  await getDb().transaction(async (tx) => {
    const order = await lockOrder(tx, params.orderId);
    const [code] = await tx
      .select()
      .from(activationCodes)
      .where(and(eq(activationCodes.id, params.codeId), eq(activationCodes.orderId, order.id)))
      .for("update");
    if (!code) throw new AppError("NOT_FOUND");
    if (code.status !== "available") {
      throw new AppError("INVALID_STATE", undefined, { status: code.status });
    }
    await tx
      .update(activationCodes)
      .set({ orderId: null, orderItemId: null })
      .where(eq(activationCodes.id, code.id));
    await recordActivationEvents(tx, [
      {
        type: "code_unassigned",
        batchId: code.batchId,
        codeId: code.id,
        actorUserId: actor.userId,
        meta,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      },
    ]);
    await recordAudit(tx, {
      action: "orders.card_unassigned",
      actorUserId: actor.userId,
      targetType: "order",
      targetId: order.id,
      meta,
      metadata: { orderNumber: order.orderNumber, serial: code.serial },
    });
  });
}

/** Records (or corrects) the carrier and tracking number of an order's parcel. */
export async function setOrderShipment(
  actor: Actor,
  params: { orderId: string; carrier: string; trackingNumber: string },
  meta: RequestMeta,
): Promise<void> {
  assertCan(actor, "orders.manage");
  await getDb().transaction(async (tx) => {
    const order = await lockOrder(tx, params.orderId);
    const shipment = await upsertShipment(tx, order, {
      carrier: params.carrier,
      trackingNumber: params.trackingNumber,
      source: "manual",
      actorUserId: actor.userId,
    });
    await recordAudit(tx, {
      action: "orders.shipment_set",
      actorUserId: actor.userId,
      targetType: "order",
      targetId: order.id,
      meta,
      metadata: {
        orderNumber: order.orderNumber,
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
      },
    });
  });
}

/**
 * Sets the delivery status by hand, e.g. when the carrier integration is down
 * and delivery was confirmed by phone with the carrier. Unlocks (delivered) or
 * re-locks (leaving delivered) the order's unused cards. Reason mandatory.
 */
export async function overrideDeliveryStatus(
  actor: Actor,
  params: { orderId: string; status: ShipmentStatus; reason: string },
  meta: RequestMeta,
): Promise<StatusChangeResult> {
  assertCan(actor, "orders.delivery.override");
  const reason = params.reason.trim();
  if (reason.length < 3) throw new AppError("VALIDATION_ERROR", undefined, { field: "reason" });
  return getDb().transaction(async (tx) => {
    const order = await lockOrder(tx, params.orderId);
    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .for("update");
    if (!shipment) throw new AppError("INVALID_STATE", undefined, { status: "no_shipment" });
    if (shipment.status === params.status) {
      throw new AppError("INVALID_STATE", undefined, { status: shipment.status });
    }
    return changeShipmentStatus(tx, shipment, order, params.status, {
      at: new Date(),
      carrierStatus: null,
      source: "manual",
      actorUserId: actor.userId,
      note: reason,
      meta,
    });
  });
}

/** Cancels an order before delivery (customer cancelled, fake order...). */
export async function cancelOrder(
  actor: Actor,
  params: { orderId: string; reason: string },
  meta: RequestMeta,
): Promise<void> {
  assertCan(actor, "orders.manage");
  await getDb().transaction(async (tx) => {
    const order = await lockOrder(tx, params.orderId);
    if (order.status !== "pending_payment" && order.status !== "draft") {
      throw new AppError("INVALID_STATE", undefined, { status: order.status });
    }
    await tx
      .update(orders)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(orders.id, order.id));
    await recordAudit(tx, {
      action: "orders.cancelled",
      actorUserId: actor.userId,
      targetType: "order",
      targetId: order.id,
      meta,
      metadata: { orderNumber: order.orderNumber, reason: params.reason.trim() },
    });
  });
}

// Queries --------------------------------------------------------------------------------

export const ORDER_STAGES = [
  "all",
  "needs_card",
  "needs_tracking",
  "in_delivery",
  "delivered",
  "failed",
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

const assignedCardsSql = sql<number>`(select count(*)::int from activation_codes c where c.order_id = ${orders.id} and c.status <> 'revoked')`;
const activatedCardsSql = sql<number>`(select count(*)::int from activation_codes c where c.order_id = ${orders.id} and c.status = 'activated')`;
const cardCapacitySql = sql<number>`(select coalesce(sum(i.quantity), 0)::int from order_items i where i.order_id = ${orders.id} and i.kind = 'activation_card')`;

function stageCondition(stage: OrderStage): SQL | undefined {
  const open = sql`${orders.status} in ('pending_payment', 'draft')`;
  switch (stage) {
    case "needs_card":
      return sql`${orders.status} in ('pending_payment', 'draft', 'paid') and ${assignedCardsSql} < greatest(${cardCapacitySql}, 1)`;
    case "needs_tracking":
      return sql`${open} and ${shipments.id} is null`;
    case "in_delivery":
      return sql`${shipments.status} in ('pending', 'in_transit', 'out_for_delivery', 'failed_attempt')`;
    case "delivered":
      return eq(shipments.status, "delivered");
    case "failed":
      return sql`(${shipments.status} in ('returned', 'cancelled') or ${orders.status} = 'cancelled')`;
    default:
      return undefined;
  }
}

/** "0555123456" -> "0555••••56" for viewers without orders.manage. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.length <= 6
    ? "••••"
    : `${phone.slice(0, 4)}${"•".repeat(phone.length - 6)}${phone.slice(-2)}`;
}

export async function listOrders(
  actor: Actor,
  params: { stage?: OrderStage; search?: string; limit: number; offset: number },
) {
  assertCan(actor, "orders.read");
  const db = getDb();
  const conditions: SQL[] = [];
  const stage = stageCondition(params.stage ?? "all");
  if (stage) conditions.push(stage);
  const search = params.search?.trim();
  if (search) {
    const like = `%${search.replace(/[%_\\]/g, "\\$&")}%`;
    const digits = search.replace(/\D/g, "");
    const upper = search.toUpperCase().replace(/\s+/g, "");
    conditions.push(
      or(
        ilike(orders.orderNumber, like),
        ilike(customers.fullName, like),
        eq(orders.externalId, search),
        eq(shipments.trackingNumber, upper),
        ...(digits.length >= 4 ? [ilike(customers.phone, `%${digits}%`)] : []),
        sql`exists (select 1 from activation_codes c where c.order_id = ${orders.id} and c.serial = ${upper})`,
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total } = { total: 0 }], stageCounts] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        channel: orders.channel,
        totalMinor: orders.totalMinor,
        currency: orders.currency,
        placedAt: orders.placedAt,
        createdAt: orders.createdAt,
        externalSource: orders.externalSource,
        shippingAddress: orders.shippingAddress,
        customerName: customers.fullName,
        customerPhone: customers.phone,
        shipmentStatus: shipments.status,
        carrier: shipments.carrier,
        trackingNumber: shipments.trackingNumber,
        carrierStatus: shipments.carrierStatus,
        cardsAssigned: assignedCardsSql,
        cardsActivated: activatedCardsSql,
        cardCapacity: cardCapacitySql,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(shipments, eq(shipments.orderId, orders.id))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(params.limit)
      .offset(params.offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(shipments, eq(shipments.orderId, orders.id))
      .where(where),
    db
      .select(
        Object.fromEntries(
          ORDER_STAGES.map((key) => [
            key,
            sql<number>`(count(*) filter (where ${stageCondition(key) ?? sql`true`}))::int`,
          ]),
        ) as Record<OrderStage, SQL<number>>,
      )
      .from(orders)
      .leftJoin(shipments, eq(shipments.orderId, orders.id)),
  ]);
  const revealPii = can(actor, "orders.manage");
  return {
    total,
    stageCounts: (stageCounts[0] ?? {}) as Record<OrderStage, number>,
    items: rows.map((row) => ({
      ...row,
      customerPhone: revealPii ? row.customerPhone : maskPhone(row.customerPhone),
    })),
  };
}

export async function getOrderDetail(actor: Actor, orderId: string) {
  assertCan(actor, "orders.read");
  const db = getDb();
  const [row] = await db
    .select({ order: orders, customer: customers })
    .from(orders)
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.id, orderId));
  if (!row) throw new AppError("NOT_FOUND");
  const [items, cards, [shipment], orderPayments] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    db
      .select({
        id: activationCodes.id,
        serial: activationCodes.serial,
        status: activationCodes.status,
        soldAt: activationCodes.soldAt,
        activatedAt: activationCodes.activatedAt,
        activatedByEmail: users.email,
        batchName: activationBatches.name,
      })
      .from(activationCodes)
      .innerJoin(activationBatches, eq(activationBatches.id, activationCodes.batchId))
      .leftJoin(users, eq(users.id, activationCodes.activatedByUserId))
      .where(eq(activationCodes.orderId, orderId))
      .orderBy(activationCodes.serial),
    db.select().from(shipments).where(eq(shipments.orderId, orderId)),
    db
      .select({
        id: payments.id,
        provider: payments.provider,
        status: payments.status,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        receivedAt: payments.receivedAt,
      })
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt)),
  ]);
  const revealPii = can(actor, "orders.manage");
  const revealEmails = can(actor, "users.read");
  const { order, customer } = row;
  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      channel: order.channel,
      currency: order.currency,
      totalMinor: order.totalMinor,
      notes: order.notes,
      externalSource: order.externalSource,
      externalId: order.externalId,
      product: typeof order.metadata.product === "string" ? order.metadata.product : null,
      shippingFeeMinor:
        typeof order.metadata.shippingFeeMinor === "number"
          ? order.metadata.shippingFeeMinor
          : null,
      placedAt: order.placedAt,
      paidAt: order.paidAt,
      cancelledAt: order.cancelledAt,
      createdAt: order.createdAt,
    },
    customer: customer
      ? {
          fullName: customer.fullName,
          phone: revealPii ? customer.phone : maskPhone(customer.phone),
          email: customer.email ? (revealPii ? customer.email : maskEmail(customer.email)) : null,
          region: order.shippingAddress?.region ?? customer.region,
          city: order.shippingAddress?.city ?? customer.city,
          address: revealPii ? (order.shippingAddress?.address ?? null) : null,
          linkedUserId: customer.userId,
        }
      : null,
    items,
    capacity:
      items
        .filter((item) => item.kind === "activation_card")
        .reduce((sum, item) => sum + item.quantity, 0) || 1,
    cards: cards.map((card) => ({
      ...card,
      activatedByEmail: card.activatedByEmail
        ? revealEmails
          ? card.activatedByEmail
          : maskEmail(card.activatedByEmail)
        : null,
    })),
    shipment: shipment
      ? {
          id: shipment.id,
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          carrierStatus: shipment.carrierStatus,
          deliveredAt: shipment.deliveredAt,
          returnedAt: shipment.returnedAt,
          lastEventAt: shipment.lastEventAt,
          lastSyncedAt: shipment.lastSyncedAt,
          history: [...shipment.history].reverse(),
        }
      : null,
    payments: orderPayments,
  };
}

/** Connection status of the integrations (never the secrets themselves). */
export async function getIntegrationStatus(actor: Actor) {
  assertCan(actor, "orders.manage");
  const env = getEnv();
  const recent = await getDb()
    .select({
      id: integrationEvents.id,
      source: integrationEvents.source,
      status: integrationEvents.status,
      error: integrationEvents.error,
      receivedAt: integrationEvents.receivedAt,
    })
    .from(integrationEvents)
    .orderBy(desc(integrationEvents.receivedAt))
    .limit(15);
  return {
    ordersEndpoint: `${env.APP_URL}/api/v1/integrations/orders`,
    deliveryEndpoint: `${env.APP_URL}/api/v1/integrations/delivery`,
    ordersConfigured: !!env.ORDERS_INTEGRATION_TOKEN,
    deliveryConfigured: !!env.DELIVERY_WEBHOOK_TOKEN,
    deliverySigned: !!env.DELIVERY_WEBHOOK_SECRET,
    recent,
  };
}
