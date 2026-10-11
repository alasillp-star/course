/**
 * Tolerant parsers for messages from external systems. Pure functions (no I/O)
 * so the field mapping is unit-tested on its own.
 *
 *  - Landing-site orders: our documented JSON contract, the same object wrapped
 *    by a Supabase Database Webhook ({ type, table, record }), or a form-style
 *    payload with French / English / snake / camel case field names.
 *  - Carrier updates: one event, an array, or { events | data | parcels: [...] }.
 *
 * Nothing here decides access: an order or a status update only ever unlocks a
 * card that staff physically packed into that order's parcel.
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** First non-empty value among candidate keys, case- and separator-insensitive. */
function pick(source: Json, keys: readonly string[]): unknown {
  const index = new Map<string, unknown>();
  for (const [key, value] of Object.entries(source)) {
    index.set(key.toLowerCase().replace(/[\s_-]+/g, ""), value);
  }
  for (const key of keys) {
    const value = index.get(key.toLowerCase().replace(/[\s_-]+/g, ""));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function text(value: unknown, max = 500): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** "+213 555 12 34 56", "00213555123456", "0555-12-34-56" -> "0555123456". */
export function normalizePhone(raw: unknown): string | undefined {
  const value = text(raw, 40);
  if (!value) return undefined;
  let digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+213")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("00213")) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith("213") && digits.length === 12) digits = `0${digits.slice(3)}`;
  digits = digits.replace(/\+/g, "");
  return digits.length >= 6 && digits.length <= 15 ? digits : undefined;
}

/**
 * Amount in major units (DZD) -> minor units (centimes). Accepts numbers and
 * strings such as "4900", "4 900 DA", "4.900", "4,900.50", "4900,50".
 */
export function parseAmountMinor(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : undefined;
  }
  const value = text(raw, 40);
  if (!value) return undefined;
  let cleaned = value.replace(/[^\d.,\s]/g, "").trim();
  // Thousands grouped with space, dot or comma and no decimals: "4 900", "4.900", "12,500".
  if (/^\d{1,3}([.,\s]\d{3})+$/.test(cleaned)) cleaned = cleaned.replace(/[.,\s]/g, "");
  cleaned = cleaned.replace(/\s/g, "");
  // "4,900.50" -> "4900.50"; "4900,50" -> "4900.50"
  if (/,\d{3}\./.test(cleaned)) cleaned = cleaned.replace(/,/g, "");
  cleaned = cleaned.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

function parseDate(raw: unknown): Date | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Seconds or milliseconds since the epoch.
    const date = new Date(raw < 1e12 ? raw * 1000 : raw);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const value = text(raw, 64);
  if (!value) return undefined;
  const date = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(value) ? value.replace(" ", "T") : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export class InboundPayloadError extends Error {
  constructor(readonly field: string) {
    super(`invalid or missing field: ${field}`);
    this.name = "InboundPayloadError";
  }
}

// Landing-site orders ---------------------------------------------------------

export type InboundOrder = {
  externalId: string;
  /** Supabase webhook event type when wrapped (INSERT / UPDATE / DELETE). */
  event: "upsert" | "delete";
  customer: { fullName: string; phone?: string; email?: string; region?: string; city?: string };
  address?: string;
  quantity: number;
  /** Undefined when the message carries no amount (partial update). */
  totalMinor?: number;
  shippingFeeMinor?: number;
  currency: string;
  product?: string;
  notes?: string;
  /** The landing site's own order status (e.g. "cancelled"), if sent. */
  sourceStatus?: string;
  placedAt?: Date;
  /** Carrier and tracking number only: delivery statuses come from the carrier channel. */
  shipment?: { carrier?: string; trackingNumber: string };
};

const ORDER_KEYS = {
  id: ["external_id", "order_id", "orderId", "id", "reference", "ref", "order_number"],
  name: ["full_name", "fullName", "name", "customer_name", "client_name", "nom", "nom_complet"],
  firstName: ["first_name", "firstName", "prenom", "prénom"],
  lastName: ["last_name", "lastName", "family_name", "nom_de_famille"],
  phone: ["phone", "phone_number", "phoneNumber", "telephone", "téléphone", "tel", "mobile"],
  email: ["email", "e_mail", "mail"],
  region: ["wilaya", "wilaya_name", "state", "region", "province"],
  city: ["commune", "commune_name", "city", "ville", "town", "baladia"],
  address: ["address", "adresse", "street", "address_line"],
  quantity: ["quantity", "qty", "quantite", "quantité", "count"],
  totalMinor: ["total_minor", "totalMinor", "amount_minor"],
  total: ["total", "total_price", "totalPrice", "amount", "price", "prix", "montant"],
  shipping: ["shipping_fee", "shippingFee", "delivery_fee", "deliveryFee", "shipping", "frais"],
  currency: ["currency", "devise"],
  product: ["product", "product_name", "productName", "offer", "offre", "produit", "pack"],
  notes: ["notes", "note", "comment", "remarks", "remarque"],
  status: ["status", "order_status", "state_label"],
  placedAt: ["created_at", "createdAt", "placed_at", "date", "submitted_at"],
  tracking: ["tracking_number", "trackingNumber", "tracking", "tracking_code", "tracking_id"],
  carrier: ["carrier", "delivery_company", "shipping_company", "courier", "transporteur"],
} as const;

/** Unwraps Supabase Database Webhooks ({ type, record, old_record }) and { order: {...} }. */
function unwrapOrder(payload: unknown): { record: Json; event: InboundOrder["event"] } {
  if (!isObject(payload)) throw new InboundPayloadError("body");
  if (isObject(payload.record) && typeof payload.type === "string") {
    return { record: payload.record, event: "upsert" };
  }
  if (payload.type === "DELETE" && isObject(payload.old_record)) {
    return { record: payload.old_record, event: "delete" };
  }
  if (isObject(payload.order)) return { record: { ...payload, ...payload.order }, event: "upsert" };
  if (isObject(payload.data)) return { record: payload.data, event: "upsert" };
  return { record: payload, event: "upsert" };
}

export function parseInboundOrder(payload: unknown): InboundOrder {
  const { record, event } = unwrapOrder(payload);
  const customerSource = isObject(record.customer) ? { ...record, ...record.customer } : record;
  const addressSource = isObject(record.shipping_address)
    ? { ...customerSource, ...record.shipping_address }
    : isObject(record.address)
      ? { ...customerSource, ...record.address, address: (record.address as Json).street }
      : customerSource;

  const externalId = text(pick(record, ORDER_KEYS.id), 120);
  if (!externalId) throw new InboundPayloadError("id");

  const first = text(pick(customerSource, ORDER_KEYS.firstName), 120);
  const last = text(pick(customerSource, ORDER_KEYS.lastName), 120);
  const fullName =
    text(pick(customerSource, ORDER_KEYS.name), 200) ??
    ([first, last].filter(Boolean).join(" ") || undefined);
  if (!fullName && event === "upsert") throw new InboundPayloadError("full_name");

  const phone = normalizePhone(pick(customerSource, ORDER_KEYS.phone));
  const emailRaw = text(pick(customerSource, ORDER_KEYS.email), 254)?.toLowerCase();
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : undefined;

  const quantityRaw = Number(text(pick(record, ORDER_KEYS.quantity), 6) ?? "1");
  const quantity = Number.isInteger(quantityRaw) && quantityRaw >= 1 ? quantityRaw : 1;
  if (quantity > 20) throw new InboundPayloadError("quantity");

  const explicitMinor = Number(text(pick(record, ORDER_KEYS.totalMinor), 20));
  const totalMinor = Number.isInteger(explicitMinor)
    ? Math.max(0, explicitMinor)
    : parseAmountMinor(pick(record, ORDER_KEYS.total));

  const currencyRaw = text(pick(record, ORDER_KEYS.currency), 8)?.toUpperCase();
  const currency = currencyRaw && /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : "DZD";

  const trackingRaw = text(pick(record, ORDER_KEYS.tracking), 80);
  const trackingNumber = trackingRaw ? normalizeTracking(trackingRaw) : undefined;
  const carrier = text(pick(record, ORDER_KEYS.carrier), 60);

  return {
    externalId,
    event,
    customer: {
      fullName: fullName ?? "—",
      phone,
      email,
      region: text(pick(addressSource, ORDER_KEYS.region), 120),
      city: text(pick(addressSource, ORDER_KEYS.city), 120),
    },
    address: text(pick(addressSource, ORDER_KEYS.address), 500),
    quantity,
    totalMinor,
    shippingFeeMinor: parseAmountMinor(pick(record, ORDER_KEYS.shipping)),
    currency,
    product: text(pick(record, ORDER_KEYS.product), 200),
    notes: text(pick(record, ORDER_KEYS.notes), 1000),
    sourceStatus: text(pick(record, ORDER_KEYS.status), 60),
    placedAt: parseDate(pick(record, ORDER_KEYS.placedAt)),
    shipment: trackingNumber
      ? {
          trackingNumber,
          carrier: carrier ? normalizeCarrierKey(carrier) : undefined,
        }
      : undefined,
  };
}

/** Tracking numbers are matched case- and space-insensitively ("yal 12ab" = "YAL12AB"). */
export function normalizeTracking(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase().slice(0, 80);
}

/** "ZR Express" -> "zr-express" (stable key for display and matching). */
export function normalizeCarrierKey(raw: string): string {
  const key = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return key || "carrier";
}

/** Landing-site statuses that mean the customer or the shop cancelled the order. */
export function isCancelledSourceStatus(status: string | undefined): boolean {
  return (
    !!status && /cancel|annul|إلغاء|ملغ|rejected|refus|spam|fake|duplicate|doublon/i.test(status)
  );
}

// Carrier updates --------------------------------------------------------------

export type InboundDeliveryEvent = {
  /** Sender's event id, used to ignore redeliveries. */
  eventId?: string;
  trackingNumber?: string;
  /** Our order number or the landing-site order id, to attach a new tracking number. */
  orderReference?: string;
  carrier?: string;
  /** The carrier's own label (kept for staff) — normalised by delivery-status.ts. */
  status: string;
  occurredAt?: Date;
};

const EVENT_KEYS = {
  // Never a bare "id": on a parcel object that is the parcel's id, and treating
  // it as an event id would drop every later update of that parcel.
  eventId: ["event_id", "eventId", "webhook_id", "notification_id", "delivery_id"],
  tracking: ["tracking", "tracking_number", "trackingNumber", "tracking_code", "tracking_id"],
  orderRef: ["order_id", "orderId", "order_number", "reference", "ref", "external_id"],
  carrier: ["carrier", "courier", "delivery_company", "company", "transporteur"],
  status: [
    "status",
    "last_status",
    "lastStatus",
    "status_label",
    "statut",
    "state",
    "etat",
    "état",
    "event",
  ],
  occurredAt: ["occurred_at", "occurredAt", "date", "updated_at", "updatedAt", "timestamp", "time"],
} as const;

function eventList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) throw new InboundPayloadError("body");
  for (const key of ["events", "data", "parcels", "updates", "items"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (isObject(value) && key === "data") return [{ ...payload, ...value }];
  }
  return [payload];
}

export function parseDeliveryEvents(payload: unknown): InboundDeliveryEvent[] {
  const list = eventList(payload);
  if (list.length === 0) throw new InboundPayloadError("events");
  if (list.length > 500) throw new InboundPayloadError("events");
  return list.map((item, index) => {
    if (!isObject(item)) throw new InboundPayloadError(`events[${index}]`);
    // Some carriers nest the parcel: { event_id, data: { tracking, status } }.
    const source = isObject(item.data) ? { ...item, ...item.data } : item;
    let status = pick(source, EVENT_KEYS.status);
    if (isObject(status)) status = pick(status, ["label", "name", "value", "code"]);
    const label = text(status, 120);
    if (!label) throw new InboundPayloadError(`events[${index}].status`);
    const trackingRaw = text(pick(source, EVENT_KEYS.tracking), 80);
    const trackingNumber = trackingRaw ? normalizeTracking(trackingRaw) : undefined;
    const orderReference = text(pick(source, EVENT_KEYS.orderRef), 120);
    if (!trackingNumber && !orderReference) {
      throw new InboundPayloadError(`events[${index}].tracking_number`);
    }
    const carrier = text(pick(source, EVENT_KEYS.carrier), 60);
    return {
      eventId: text(pick(item, EVENT_KEYS.eventId), 120),
      trackingNumber,
      orderReference,
      carrier: carrier ? normalizeCarrierKey(carrier) : undefined,
      status: label,
      occurredAt: parseDate(pick(source, EVENT_KEYS.occurredAt)),
    };
  });
}

// CSV import (carrier dashboard exports) -----------------------------------------

/** Minimal RFC 4180 reader (quoted fields, "" escapes, CRLF/LF, ; or , delimiters). */
export function parseCsv(input: string): string[][] {
  const textValue = input.replace(/^﻿/, "");
  const firstLine = textValue.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
        ? "\t"
        : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < textValue.length; i += 1) {
    const char = textValue[i]!;
    if (quoted) {
      if (char === '"') {
        if (textValue[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && textValue[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

const CSV_TRACKING = [/track|suivi|التتبع/i, /colis|parcel|code/i];
const CSV_STATUS = [/status|statut|[ée]tat|state|situation|الحالة/i];
const CSV_REFERENCE = [/order|commande|r[ée]f|الطلب/i];
const CSV_DATE = [/date|updated|mis\s*[àa]\s*jour|التاريخ/i];

export type CsvDeliveryImport = {
  events: InboundDeliveryEvent[];
  /** 1-based data rows that could not be read (missing tracking/status). */
  invalidRows: number[];
  columns: { tracking: string; status: string; reference?: string; date?: string };
};

/** Reads a carrier export: finds the tracking and status columns by their headers. */
export function parseDeliveryCsv(input: string): CsvDeliveryImport {
  const rows = parseCsv(input);
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  const find = (patterns: RegExp[], exclude: number[] = []) => {
    for (const pattern of patterns) {
      const index = header.findIndex((cell, i) => !exclude.includes(i) && pattern.test(cell));
      if (index >= 0) return index;
    }
    return -1;
  };
  const tracking = find(CSV_TRACKING);
  const status = find(CSV_STATUS, [tracking]);
  if (tracking < 0) throw new InboundPayloadError("csv.tracking_column");
  if (status < 0) throw new InboundPayloadError("csv.status_column");
  const reference = find(CSV_REFERENCE, [tracking, status]);
  const date = find(CSV_DATE, [tracking, status, reference]);
  if (rows.length - 1 > 20_000) throw new InboundPayloadError("csv.rows");

  const events: InboundDeliveryEvent[] = [];
  const invalidRows: number[] = [];
  rows.slice(1).forEach((row, index) => {
    const trackingRaw = text(row[tracking], 80);
    const trackingNumber = trackingRaw ? normalizeTracking(trackingRaw) : undefined;
    const label = text(row[status], 120);
    if (!trackingNumber || !label) {
      invalidRows.push(index + 1);
      return;
    }
    events.push({
      trackingNumber,
      status: label,
      orderReference: reference >= 0 ? text(row[reference], 120) : undefined,
      occurredAt: date >= 0 ? parseDate(row[date]) : undefined,
    });
  });
  return {
    events,
    invalidRows,
    columns: {
      tracking: header[tracking]!,
      status: header[status]!,
      reference: reference >= 0 ? header[reference] : undefined,
      date: date >= 0 ? header[date] : undefined,
    },
  };
}
