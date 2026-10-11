import type { ShipmentStatus } from "@/shared/enums";
import { SHIPMENT_STATUSES } from "@/shared/enums";

/**
 * Maps a carrier's own status label (French, Arabic or English, as used by
 * Algerian couriers and most COD platforms) to our normalised states.
 *
 * Only "delivered" unlocks an activation card, so the rules are deliberately
 * conservative: failure and return wording is checked BEFORE delivery wording
 * ("Non livré", "Échec de livraison", "Retour livré au vendeur" must never read
 * as delivered), and an unrecognised label returns null — the shipment then
 * keeps its current status and the label is shown to staff.
 */
const RULES: ReadonlyArray<readonly [ShipmentStatus, RegExp]> = [
  ["cancelled", /annul|cancel|إلغاء|ملغ[ىاي]/u],
  [
    "returned",
    /retour|return|renvoy|(au|to)\s+(vendeur|sender|shipper|exp[ée]diteur)|مرتجع|إرجاع|ارجاع|استرجاع|مسترجع/u,
  ],
  [
    "failed_attempt",
    /non[\s-]*(livr|distribu)|pas\s+livr|[ée]ch[eèé]c|[ée]chou|fail|undeliver|not\s+delivered|tentative|attempt|injoignable|unreachable|absent|refus|report[ée]|postpon|فشل|تعذر|لم\s*يتم|رفض|مؤجل|غائب|غير\s/u,
  ],
  ["delivered", /livr(?:ée|ee|é|e)(?![a-zà-ÿ])|delivered|تم\s*التسليم|تم\s*التوصيل/u],
  [
    "out_for_delivery",
    /en\s+cours\s+de\s+livraison|sorti[e]?\s+(en|pour)\s+livraison|en\s+livraison|livreur|out\s+for\s+delivery|with\s+courier|قيد\s*التوصيل|خرج\s*للتوصيل|مع\s*الموزع/u,
  ],
  [
    "in_transit",
    /transit|exp[ée]di|shipped|dispatch|ramass|picked|centre|center|hub|agence|bureau|vers\s+wilaya|transfert|en\s+cours|في\s*الطريق|تم\s*الشحن|مركز|نقل/u,
  ],
  [
    "pending",
    /attente|pending|pr[ée]par|created|nouveau|new|confirm|enregistr|في\s*الانتظار|قيد\s*التحضير|جديد|مؤكد/u,
  ],
];

export function normalizeCarrierStatus(raw: string | null | undefined): ShipmentStatus | null {
  if (!raw) return null;
  const label = raw.normalize("NFC").trim().toLowerCase();
  if (!label) return null;
  // Exact normalised keys (our own API contract) first.
  const key = label.replace(/[\s-]+/g, "_");
  if ((SHIPMENT_STATUSES as readonly string[]).includes(key)) return key as ShipmentStatus;
  for (const [status, pattern] of RULES) {
    if (pattern.test(label)) return status;
  }
  return null;
}

/** States the carrier will normally not leave. */
export const FINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "delivered",
  "returned",
  "cancelled",
];

/**
 * Whether an automated update (webhook, import, polling) may move a shipment
 * from `current` to `next`. Delivery is final for automated sources: a later
 * contradictory message is recorded but needs a staff decision (manual
 * override), because reverting it would re-lock a card the customer may have
 * already used.
 */
export function canApplyCarrierUpdate(current: ShipmentStatus, next: ShipmentStatus): boolean {
  if (current === next) return false;
  if (current === "delivered") return false;
  return true;
}
