import "server-only";
import { asc, desc, eq, inArray, max } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  activationBatches,
  activationCodes,
  activationEvents,
  courses,
  orders,
  users,
} from "@/server/db/schema";
import { uuidv7 } from "@/server/db/uuid";
import { encrypt } from "@/server/crypto";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { recordAudit } from "../audit/audit.service";
import { assertCan, can, type Actor } from "../access/actor";
import { maskEmail } from "../identity/email";
import {
  cardActivationUrl,
  cipherContext,
  formatSerial,
  generateCardCode,
  generateCardPin,
  hashCardCode,
  hashCardPin,
} from "./codes";
import { recordActivationEvents } from "./events";

const MAX_BULK = 2_000;

function normalizeSerials(serials: string[]): string[] {
  const unique = new Set(serials.map((serial) => serial.trim().toUpperCase()).filter(Boolean));
  if (unique.size === 0) throw new AppError("VALIDATION_ERROR", "no serials", { field: "serials" });
  if (unique.size > MAX_BULK) throw new AppError("VALIDATION_ERROR", "too many serials", { field: "serials" });
  return [...unique];
}

/**
 * Point-of-sale activation: marks available cards as sold (optionally linked
 * to an order). Cards from batches that require a sale cannot be redeemed
 * before this step, so stolen stock is worthless.
 */
export async function markCardsSold(
  actor: Actor,
  params: { serials: string[]; orderId?: string | null },
  meta: RequestMeta,
): Promise<{ sold: string[]; skipped: Array<{ serial: string; reason: string }> }> {
  assertCan(actor, "activation.codes.sell");
  const serials = normalizeSerials(params.serials);
  const db = getDb();
  return db.transaction(async (tx) => {
    if (params.orderId) {
      const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, params.orderId));
      if (!order) throw new AppError("NOT_FOUND", "Order not found", { field: "orderId" });
    }
    const rows = await tx
      .select({ id: activationCodes.id, serial: activationCodes.serial, status: activationCodes.status, batchId: activationCodes.batchId })
      .from(activationCodes)
      .where(inArray(activationCodes.serial, serials))
      .for("update");
    const found = new Map(rows.map((row) => [row.serial, row]));
    const skipped: Array<{ serial: string; reason: string }> = [];
    const sellable = [];
    for (const serial of serials) {
      const row = found.get(serial);
      if (!row) skipped.push({ serial, reason: "NOT_FOUND" });
      else if (row.status !== "available") skipped.push({ serial, reason: `STATUS_${row.status.toUpperCase()}` });
      else sellable.push(row);
    }
    if (sellable.length > 0) {
      const now = new Date();
      await tx
        .update(activationCodes)
        .set({ status: "sold", soldAt: now, soldBy: actor.userId, orderId: params.orderId ?? null })
        .where(inArray(activationCodes.id, sellable.map((row) => row.id)));
      await recordActivationEvents(
        tx,
        sellable.map((row) => ({
          type: "code_sold" as const,
          batchId: row.batchId,
          codeId: row.id,
          actorUserId: actor.userId,
          meta,
          metadata: params.orderId ? { orderId: params.orderId } : {},
        })),
      );
      await recordAudit(tx, {
        action: "activation.code_sold",
        actorUserId: actor.userId,
        targetType: "activation_code",
        targetId: sellable.length === 1 ? sellable[0]!.id : undefined,
        meta,
        metadata: { count: sellable.length, serials: sellable.slice(0, 50).map((row) => row.serial), orderId: params.orderId },
      });
    }
    return { sold: sellable.map((row) => row.serial), skipped };
  });
}

/** Reverts a mistaken sale (only while the card is unused). */
export async function markCardUnsold(actor: Actor, codeId: string, meta: RequestMeta): Promise<void> {
  assertCan(actor, "activation.codes.sell");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [code] = await tx.select().from(activationCodes).where(eq(activationCodes.id, codeId)).for("update");
    if (!code) throw new AppError("NOT_FOUND");
    if (code.status !== "sold") throw new AppError("INVALID_STATE", undefined, { status: code.status });
    await tx
      .update(activationCodes)
      .set({ status: "available", soldAt: null, soldBy: null, orderId: null, orderItemId: null })
      .where(eq(activationCodes.id, codeId));
    await recordActivationEvents(tx, [
      { type: "code_unsold", batchId: code.batchId, codeId, actorUserId: actor.userId, meta },
    ]);
    await recordAudit(tx, {
      action: "activation.code_unsold",
      actorUserId: actor.userId,
      targetType: "activation_code",
      targetId: codeId,
      meta,
      metadata: { serial: code.serial },
    });
  });
}

/**
 * Revokes an unused card (lost, stolen, damaged, recalled). Activated cards
 * cannot be revoked here: access is removed by revoking the entitlement.
 */
export async function revokeCard(
  actor: Actor,
  params: { codeId: string; reason: string },
  meta: RequestMeta,
): Promise<void> {
  assertCan(actor, "activation.codes.revoke");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.id, params.codeId))
      .for("update");
    if (!code) throw new AppError("NOT_FOUND");
    if (code.status === "activated" || code.status === "revoked") {
      throw new AppError("INVALID_STATE", undefined, { status: code.status });
    }
    await tx
      .update(activationCodes)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedBy: actor.userId,
        revokeReason: params.reason,
        codeCiphertext: null,
        pinCiphertext: null,
      })
      .where(eq(activationCodes.id, code.id));
    await recordActivationEvents(tx, [
      {
        type: "code_revoked",
        batchId: code.batchId,
        codeId: code.id,
        actorUserId: actor.userId,
        meta,
        metadata: { reason: params.reason },
      },
    ]);
    await recordAudit(tx, {
      action: "activation.code_revoked",
      actorUserId: actor.userId,
      targetType: "activation_code",
      targetId: code.id,
      meta,
      metadata: { serial: code.serial, reason: params.reason },
    });
  });
}

export type ReplacementCard = {
  codeId: string;
  serial: string;
  code: string;
  pin: string | null;
  url: string;
};

/**
 * Revokes an unused card and issues a replacement in the same batch, keeping
 * its sale status and order link. The new secrets are returned exactly once
 * so the replacement can be printed immediately.
 */
export async function replaceCard(
  actor: Actor,
  params: { codeId: string; reason: string },
  meta: RequestMeta,
): Promise<ReplacementCard> {
  assertCan(actor, "activation.codes.revoke");
  assertCan(actor, "activation.codes.export");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ code: activationCodes, batch: activationBatches })
      .from(activationCodes)
      .innerJoin(activationBatches, eq(activationBatches.id, activationCodes.batchId))
      .where(eq(activationCodes.id, params.codeId))
      .for("update", { of: activationCodes });
    if (!row) throw new AppError("NOT_FOUND");
    const { code: old, batch } = row;
    if (old.status === "activated" || old.status === "revoked") {
      throw new AppError("INVALID_STATE", undefined, { status: old.status });
    }

    const now = new Date();
    await tx
      .update(activationCodes)
      .set({
        status: "revoked",
        revokedAt: now,
        revokedBy: actor.userId,
        revokeReason: `replaced: ${params.reason}`,
        codeCiphertext: null,
        pinCiphertext: null,
      })
      .where(eq(activationCodes.id, old.id));

    // Serialise sequence allocation per batch with the batch row lock.
    await tx.select({ id: activationBatches.id }).from(activationBatches).where(eq(activationBatches.id, batch.id)).for("update");
    const [{ maxSequence } = { maxSequence: 0 }] = await tx
      .select({ maxSequence: max(activationCodes.sequence) })
      .from(activationCodes)
      .where(eq(activationCodes.batchId, batch.id));
    const sequence = Math.max(Number(maxSequence ?? 0), 10_000) + 1;

    const newId = uuidv7();
    const code = generateCardCode();
    const pin = batch.requiresPin ? generateCardPin() : null;
    const keepSecrets = !batch.secretsPurgedAt;
    const serial = formatSerial(batch.serialPrefix, sequence);
    await tx.insert(activationCodes).values({
      id: newId,
      batchId: batch.id,
      sequence,
      serial,
      codeHash: hashCardCode(code),
      codeCiphertext: keepSecrets ? encrypt(code, cipherContext.code(newId)) : null,
      pinHash: pin ? hashCardPin(newId, pin) : null,
      pinCiphertext: keepSecrets && pin ? encrypt(pin, cipherContext.pin(newId)) : null,
      status: old.status === "sold" ? "sold" : "available",
      soldAt: old.status === "sold" ? now : null,
      soldBy: old.status === "sold" ? actor.userId : null,
      orderId: old.orderId,
      replacesCodeId: old.id,
    });

    await recordActivationEvents(tx, [
      {
        type: "code_replaced",
        batchId: batch.id,
        codeId: old.id,
        actorUserId: actor.userId,
        meta,
        metadata: { reason: params.reason, replacementSerial: serial },
      },
    ]);
    await recordAudit(tx, {
      action: "activation.code_replaced",
      actorUserId: actor.userId,
      targetType: "activation_code",
      targetId: old.id,
      meta,
      metadata: { oldSerial: old.serial, newSerial: serial, reason: params.reason },
    });
    return { codeId: newId, serial, code, pin, url: cardActivationUrl(code) };
  });
}

/** Clears a PIN lock after support verified the buyer (e.g. receipt + intact card). */
export async function unlockCard(actor: Actor, codeId: string, meta: RequestMeta): Promise<void> {
  assertCan(actor, "activation.codes.unlock");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [code] = await tx.select().from(activationCodes).where(eq(activationCodes.id, codeId)).for("update");
    if (!code) throw new AppError("NOT_FOUND");
    if (!code.lockedAt) throw new AppError("INVALID_STATE");
    await tx
      .update(activationCodes)
      .set({ lockedAt: null, failedPinAttempts: 0 })
      .where(eq(activationCodes.id, codeId));
    await recordActivationEvents(tx, [
      { type: "code_unlocked", batchId: code.batchId, codeId, actorUserId: actor.userId, meta },
    ]);
    await recordAudit(tx, {
      action: "activation.code_unlocked",
      actorUserId: actor.userId,
      targetType: "activation_code",
      targetId: codeId,
      meta,
      metadata: { serial: code.serial },
    });
  });
}

/** Card details with lifecycle timeline (no secrets). */
export async function getCardDetails(actor: Actor, codeId: string) {
  assertCan(actor, "activation.codes.read");
  const db = getDb();
  const [row] = await db
    .select({
      id: activationCodes.id,
      serial: activationCodes.serial,
      sequence: activationCodes.sequence,
      status: activationCodes.status,
      failedPinAttempts: activationCodes.failedPinAttempts,
      lockedAt: activationCodes.lockedAt,
      soldAt: activationCodes.soldAt,
      orderId: activationCodes.orderId,
      activatedAt: activationCodes.activatedAt,
      activatedByUserId: activationCodes.activatedByUserId,
      activatedByEmail: users.email,
      revokedAt: activationCodes.revokedAt,
      revokeReason: activationCodes.revokeReason,
      replacesCodeId: activationCodes.replacesCodeId,
      createdAt: activationCodes.createdAt,
      batchId: activationBatches.id,
      batchName: activationBatches.name,
      batchNumber: activationBatches.batchNumber,
      requiresPin: activationBatches.requiresPin,
      requiresSale: activationBatches.requiresSale,
      courseTitle: courses.title,
    })
    .from(activationCodes)
    .innerJoin(activationBatches, eq(activationBatches.id, activationCodes.batchId))
    .innerJoin(courses, eq(courses.id, activationBatches.courseId))
    .leftJoin(users, eq(users.id, activationCodes.activatedByUserId))
    .where(eq(activationCodes.id, codeId));
  if (!row) throw new AppError("NOT_FOUND");

  const [replacement] = await db
    .select({ id: activationCodes.id, serial: activationCodes.serial })
    .from(activationCodes)
    .where(eq(activationCodes.replacesCodeId, codeId));
  const [replaces] = row.replacesCodeId
    ? await db
        .select({ id: activationCodes.id, serial: activationCodes.serial })
        .from(activationCodes)
        .where(eq(activationCodes.id, row.replacesCodeId))
    : [];

  const events = await db
    .select({
      id: activationEvents.id,
      type: activationEvents.type,
      occurredAt: activationEvents.occurredAt,
      actorEmail: users.email,
      metadata: activationEvents.metadata,
    })
    .from(activationEvents)
    .leftJoin(users, eq(users.id, activationEvents.actorUserId))
    .where(eq(activationEvents.codeId, codeId))
    .orderBy(desc(activationEvents.occurredAt))
    .limit(200);

  const revealEmails = can(actor, "users.read");
  const mask = (email: string | null) => (email ? (revealEmails ? email : maskEmail(email)) : null);
  return {
    ...row,
    activatedByEmail: mask(row.activatedByEmail),
    replacement: replacement ?? null,
    replaces: replaces ?? null,
    events: events.map((event) => ({ ...event, actorEmail: mask(event.actorEmail) })),
  };
}

export async function findCardBySerial(actor: Actor, serial: string) {
  assertCan(actor, "activation.codes.read");
  const [row] = await getDb()
    .select({ id: activationCodes.id })
    .from(activationCodes)
    .where(eq(activationCodes.serial, serial.trim().toUpperCase()))
    .orderBy(asc(activationCodes.createdAt))
    .limit(1);
  return row ?? null;
}

