import { describe, expect, it } from "vitest";
import { canApplyCarrierUpdate, normalizeCarrierStatus } from "@/modules/commerce/delivery-status";
import {
  normalizePhone,
  parseAmountMinor,
  parseCsv,
  parseDeliveryCsv,
  parseDeliveryEvents,
  parseInboundOrder,
} from "@/modules/commerce/inbound";

describe("carrier status normalisation", () => {
  it.each([
    ["Livré", "delivered"],
    ["LIVREE", "delivered"],
    ["Delivered", "delivered"],
    ["تم التسليم", "delivered"],
    ["delivered", "delivered"],
    ["out_for_delivery", "out_for_delivery"],
    ["Sorti en livraison", "out_for_delivery"],
    ["En cours de livraison", "out_for_delivery"],
    ["Chez le livreur", "out_for_delivery"],
    ["Expédié", "in_transit"],
    ["Vers Wilaya", "in_transit"],
    ["Centre de tri", "in_transit"],
    ["En préparation", "pending"],
    ["Non livré", "failed_attempt"],
    ["Échec de livraison", "failed_attempt"],
    ["Echèc livraison", "failed_attempt"],
    ["Undelivered", "failed_attempt"],
    ["Client injoignable", "failed_attempt"],
    ["لم يتم التسليم", "failed_attempt"],
    ["Retour livré au vendeur", "returned"],
    ["Retourné au vendeur", "returned"],
    ["Delivered to sender", "returned"],
    ["مرتجع", "returned"],
    ["Annulé", "cancelled"],
  ])("%s -> %s", (label, expected) => {
    expect(normalizeCarrierStatus(label)).toBe(expected);
  });

  it("returns null for unknown or empty labels (no status change)", () => {
    expect(normalizeCarrierStatus("Statut XYZ")).toBeNull();
    expect(normalizeCarrierStatus("")).toBeNull();
    expect(normalizeCarrierStatus(null)).toBeNull();
  });

  it("never lets an automated update leave the delivered state", () => {
    expect(canApplyCarrierUpdate("delivered", "returned")).toBe(false);
    expect(canApplyCarrierUpdate("delivered", "in_transit")).toBe(false);
    expect(canApplyCarrierUpdate("in_transit", "delivered")).toBe(true);
    expect(canApplyCarrierUpdate("returned", "in_transit")).toBe(true);
    expect(canApplyCarrierUpdate("pending", "pending")).toBe(false);
  });
});

describe("inbound parsing", () => {
  it("normalises Algerian phone numbers and DZD amounts", () => {
    expect(normalizePhone("+213 555 12 34 56")).toBe("0555123456");
    expect(normalizePhone("00213-661-223344")).toBe("0661223344");
    expect(normalizePhone("0770.11.22.33")).toBe("0770112233");
    expect(normalizePhone("abc")).toBeUndefined();
    expect(parseAmountMinor(4900)).toBe(490_000);
    expect(parseAmountMinor("4 900 DA")).toBe(490_000);
    expect(parseAmountMinor("4.900")).toBe(490_000);
    expect(parseAmountMinor("4900,50")).toBe(490_050);
    expect(parseAmountMinor("4,900.50")).toBe(490_050);
    expect(parseAmountMinor("free")).toBeUndefined();
  });

  it("maps French, camelCase and nested landing-site payloads", () => {
    const order = parseInboundOrder({
      order: { orderId: 42, customer: { prenom: "Amina", nom_de_famille: "B." }, montant: "3500" },
      shipping_address: { wilaya: "Oran", commune: "Bir El Djir" },
      telephone: "0550 00 00 00",
      quantité: 2,
    });
    expect(order).toMatchObject({
      externalId: "42",
      customer: { fullName: "Amina B.", phone: "0550000000", region: "Oran", city: "Bir El Djir" },
      quantity: 2,
      totalMinor: 350_000,
      currency: "DZD",
    });
    expect(() => parseInboundOrder({ name: "x", quantity: 2 })).toThrow(/id/);
    expect(() => parseInboundOrder({ id: 1, name: "x", quantity: 500 })).toThrow(/quantity/);
  });

  it("reads single events, arrays and nested carrier envelopes", () => {
    expect(parseDeliveryEvents({ tracking: " yal 1 ", status: "Livré" })).toEqual([
      expect.objectContaining({ trackingNumber: "YAL1", status: "Livré" }),
    ]);
    const events = parseDeliveryEvents({
      type: "parcel_status_updated",
      events: [
        { event_id: "e1", data: { tracking: "A", status: { label: "Expédié" }, date: 1760000000 } },
        { id: "parcel-9", tracking_number: "B", last_status: "Livré" },
      ],
    });
    expect(events[0]).toMatchObject({ eventId: "e1", trackingNumber: "A", status: "Expédié" });
    expect(events[0]!.occurredAt?.getTime()).toBe(1760000000 * 1000);
    // A parcel's own "id" is not an event id (it would drop later updates).
    expect(events[1]).toMatchObject({ eventId: undefined, trackingNumber: "B" });
    expect(() => parseDeliveryEvents({ status: "Livré" })).toThrow(/tracking/);
  });

  it("parses carrier CSV exports (quotes, BOM, delimiters)", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
    const parsed = parseDeliveryCsv("Référence;Code tracking;État\nORD-1;t-1;Livré\n;;\n");
    expect(parsed.columns).toMatchObject({
      tracking: "Code tracking",
      status: "État",
      reference: "Référence",
    });
    expect(parsed.events).toEqual([
      expect.objectContaining({ trackingNumber: "T-1", status: "Livré", orderReference: "ORD-1" }),
    ]);
    expect(() => parseDeliveryCsv("name;city\nx;y\n")).toThrow(/tracking/);
  });
});
