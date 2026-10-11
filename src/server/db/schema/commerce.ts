import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  DISCOUNT_KINDS,
  INVOICE_STATUSES,
  ORDER_CHANNELS,
  ORDER_ITEM_KINDS,
  ORDER_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  SHIPMENT_STATUSES,
} from "../../../shared/enums";
import { createdAt, deletedAt, enumCheck, pk, rule, tstz, updatedAt } from "./_columns";
import { activationCodes } from "./activation";
import { courses } from "./catalog";
import { users } from "./identity";

/**
 * Commerce is modelled as three independent steps:
 *   order (what was sold) -> payment (money collected) -> entitlement (access).
 * Card sales create orders with `activation_card` items; the student's access
 * is still granted only when the card is redeemed. Online gateways plug in via
 * `payments.provider = 'card_gateway'` and `payment_webhook_events`.
 * All amounts are integers in minor units (e.g. centimes of DZD).
 */
export type ShippingAddress = {
  /** Province (wilaya). */
  region?: string;
  /** Municipality (commune) / city. */
  city?: string;
  address?: string;
};

export type ShipmentHistoryEntry = {
  at: string;
  status: string;
  carrierStatus?: string | null;
  source: string;
  actorUserId?: string | null;
  note?: string | null;
};

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1000 });
export const invoiceNumberSeq = pgSequence("invoice_number_seq", { startWith: 1000 });

export const customers = pgTable(
  "customers",
  {
    id: pk(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    fullName: text().notNull(),
    email: text(),
    phone: text(),
    city: text(),
    region: text(),
    country: text().notNull().default("DZ"),
    notes: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("customers_email_idx").on(t.email),
    index("customers_phone_idx").on(t.phone),
    index("customers_user_idx").on(t.userId),
  ],
);

export const discountCodes = pgTable(
  "discount_codes",
  {
    id: pk(),
    code: text().notNull(),
    description: text(),
    kind: text({ enum: DISCOUNT_KINDS }).notNull(),
    /** Percent in basis points (1500 = 15%) or a fixed amount in minor units. */
    value: integer().notNull(),
    currency: text(),
    maxRedemptions: integer(),
    redemptionCount: integer().notNull().default(0),
    startsAt: tstz(),
    endsAt: tstz(),
    active: boolean().notNull().default(true),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("discount_codes_code_key").on(t.code),
    enumCheck("discount_codes_kind_check", t.kind, DISCOUNT_KINDS),
    rule("discount_codes_code_normalized_check", sql`${t.code} = upper(${t.code})`),
    rule(
      "discount_codes_value_check",
      sql`${t.value} > 0 and (${t.kind} <> 'percent' or ${t.value} <= 10000)`,
    ),
    rule(
      "discount_codes_redemptions_check",
      sql`${t.maxRedemptions} is null or ${t.redemptionCount} <= ${t.maxRedemptions}`,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: pk(),
    orderNumber: text().notNull(),
    customerId: uuid().references(() => customers.id, { onDelete: "restrict" }),
    /** Staff member credited with the sale ("sales by seller" reports). */
    salesAgentId: uuid().references(() => users.id, { onDelete: "set null" }),
    channel: text({ enum: ORDER_CHANNELS }).notNull().default("in_person"),
    status: text({ enum: ORDER_STATUSES }).notNull().default("draft"),
    currency: text().notNull().default("DZD"),
    subtotalMinor: bigint({ mode: "number" }).notNull().default(0),
    discountMinor: bigint({ mode: "number" }).notNull().default(0),
    taxMinor: bigint({ mode: "number" }).notNull().default(0),
    totalMinor: bigint({ mode: "number" }).notNull().default(0),
    discountCodeId: uuid().references(() => discountCodes.id, { onDelete: "set null" }),
    notes: text(),
    /** Where the order came from (e.g. "landing_site") and its id there (idempotency). */
    externalSource: text(),
    externalId: text(),
    shippingAddress: jsonb().$type<ShippingAddress>(),
    /** Original payload / extra fields from the source system. */
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    placedAt: tstz(),
    paidAt: tstz(),
    cancelledAt: tstz(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_number_key").on(t.orderNumber),
    uniqueIndex("orders_external_key")
      .on(t.externalSource, t.externalId)
      .where(sql`${t.externalId} is not null`),
    enumCheck("orders_status_check", t.status, ORDER_STATUSES),
    enumCheck("orders_channel_check", t.channel, ORDER_CHANNELS),
    rule("orders_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    rule(
      "orders_amounts_check",
      sql`${t.subtotalMinor} >= 0 and ${t.discountMinor} >= 0 and ${t.taxMinor} >= 0 and ${t.totalMinor} = ${t.subtotalMinor} - ${t.discountMinor} + ${t.taxMinor} and ${t.totalMinor} >= 0`,
    ),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_sales_agent_idx").on(t.salesAgentId, t.createdAt),
    index("orders_customer_idx").on(t.customerId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: pk(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: text({ enum: ORDER_ITEM_KINDS }).notNull(),
    courseId: uuid().references(() => courses.id, { onDelete: "restrict" }),
    activationCodeId: uuid().references((): AnyPgColumn => activationCodes.id, {
      onDelete: "restrict",
    }),
    description: text().notNull(),
    quantity: integer().notNull().default(1),
    unitPriceMinor: bigint({ mode: "number" }).notNull(),
    totalMinor: bigint({ mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck("order_items_kind_check", t.kind, ORDER_ITEM_KINDS),
    rule("order_items_quantity_check", sql`${t.quantity} > 0`),
    rule(
      "order_items_total_check",
      sql`${t.unitPriceMinor} >= 0 and ${t.totalMinor} = ${t.unitPriceMinor} * ${t.quantity}`,
    ),
    uniqueIndex("order_items_activation_code_key")
      .on(t.activationCodeId)
      .where(sql`${t.activationCodeId} is not null`),
    index("order_items_order_idx").on(t.orderId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: text({ enum: PAYMENT_PROVIDERS }).notNull(),
    status: text({ enum: PAYMENT_STATUSES }).notNull().default("pending"),
    amountMinor: bigint({ mode: "number" }).notNull(),
    currency: text().notNull().default("DZD"),
    /** Gateway transaction id, bank transfer reference, receipt number... */
    providerReference: text(),
    /** Client-supplied key making payment creation idempotent. */
    idempotencyKey: text(),
    receivedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    receivedAt: tstz(),
    failureReason: text(),
    rawPayload: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck("payments_provider_check", t.provider, PAYMENT_PROVIDERS),
    enumCheck("payments_status_check", t.status, PAYMENT_STATUSES),
    rule("payments_amount_check", sql`${t.amountMinor} > 0`),
    uniqueIndex("payments_idempotency_key")
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    uniqueIndex("payments_provider_reference_key")
      .on(t.provider, t.providerReference)
      .where(sql`${t.providerReference} is not null`),
    index("payments_order_idx").on(t.orderId),
    index("payments_received_idx").on(t.status, t.receivedAt),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: pk(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid().references(() => payments.id, { onDelete: "restrict" }),
    amountMinor: bigint({ mode: "number" }).notNull(),
    currency: text().notNull().default("DZD"),
    reason: text().notNull(),
    status: text({ enum: REFUND_STATUSES }).notNull().default("requested"),
    /** Whether course access granted by the order's cards must be revoked. */
    revokeAccess: boolean().notNull().default(true),
    requestedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    requestedAt: tstz().notNull().defaultNow(),
    decidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedAt: tstz(),
    processedAt: tstz(),
    providerReference: text(),
    notes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck("refunds_status_check", t.status, REFUND_STATUSES),
    rule("refunds_amount_check", sql`${t.amountMinor} > 0`),
    index("refunds_order_idx").on(t.orderId),
    index("refunds_status_idx").on(t.status, t.requestedAt),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: pk(),
    invoiceNumber: text().notNull(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    status: text({ enum: INVOICE_STATUSES }).notNull().default("issued"),
    issuedAt: tstz().notNull().defaultNow(),
    /** Customer and seller details frozen at issue time. */
    billingSnapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    subtotalMinor: bigint({ mode: "number" }).notNull(),
    discountMinor: bigint({ mode: "number" }).notNull().default(0),
    taxMinor: bigint({ mode: "number" }).notNull().default(0),
    totalMinor: bigint({ mode: "number" }).notNull(),
    currency: text().notNull().default("DZD"),
    pdfStorageKey: text(),
    voidedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_number_key").on(t.invoiceNumber),
    enumCheck("invoices_status_check", t.status, INVOICE_STATUSES),
    index("invoices_order_idx").on(t.orderId),
  ],
);

/** Inbox for payment-gateway webhooks: idempotent, replayable processing. */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: pk(),
    provider: text().notNull(),
    providerEventId: text().notNull(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    receivedAt: tstz().notNull().defaultNow(),
    processedAt: tstz(),
    processingError: text(),
  },
  (t) => [
    uniqueIndex("payment_webhook_events_provider_event_key").on(t.provider, t.providerEventId),
    index("payment_webhook_events_unprocessed_idx")
      .on(t.receivedAt)
      .where(sql`${t.processedAt} is null`),
  ],
);

/**
 * Delivery of an order's parcel. The carrier is the source of truth: its
 * updates (webhook, polling, CSV import) or a staff override move `status`;
 * "delivered" is what unlocks the activation card packed in the parcel.
 */
export const shipments = pgTable(
  "shipments",
  {
    id: pk(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Carrier key, e.g. "yalidine", "zr-express", "manual". */
    carrier: text().notNull(),
    trackingNumber: text().notNull(),
    status: text({ enum: SHIPMENT_STATUSES }).notNull().default("pending"),
    /** The carrier's own label for the latest status (e.g. "Livré"). */
    carrierStatus: text(),
    deliveredAt: tstz(),
    returnedAt: tstz(),
    lastEventAt: tstz(),
    lastSyncedAt: tstz(),
    history: jsonb().$type<ShipmentHistoryEntry[]>().notNull().default([]),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("shipments_order_key").on(t.orderId),
    uniqueIndex("shipments_carrier_tracking_key").on(t.carrier, t.trackingNumber),
    enumCheck("shipments_status_check", t.status, SHIPMENT_STATUSES),
    rule(
      "shipments_delivered_check",
      sql`${t.status} <> 'delivered' or ${t.deliveredAt} is not null`,
    ),
    index("shipments_tracking_idx").on(t.trackingNumber),
    index("shipments_status_idx").on(t.status, t.updatedAt),
  ],
);
