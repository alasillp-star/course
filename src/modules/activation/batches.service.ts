import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import { activationBatches, activationCodes, courses, users } from "@/server/db/schema";
import { uuidv7 } from "@/server/db/uuid";
import { decrypt, encrypt } from "@/server/crypto";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import type { ActivationCodeStatus } from "@/shared/enums";
import { recordAudit } from "../audit/audit.service";
import { assertCan, can, type Actor } from "../access/actor";
import { maskEmail } from "../identity/email";
import {
  batchSerialPrefix,
  cardActivationUrl,
  cipherContext,
  formatSerial,
  generateCardCode,
  generateCardPin,
  hashCardCode,
  hashCardPin,
} from "./codes";
import { recordActivationEvents } from "./events";

export const MAX_BATCH_SIZE = 10_000;
export const MAX_EXPORT_RANGE = 2_000;
const INSERT_CHUNK = 500;

export type CreateBatchInput = {
  name: string;
  courseId: string;
  quantity: number;
  requiresPin: boolean;
  requiresSale: boolean;
  redeemBy?: Date | null;
  notes?: string | null;
};

export type BatchSummary = {
  id: string;
  batchNumber: number;
  serialPrefix: string;
  name: string;
  courseId: string;
  quantity: number;
  requiresPin: boolean;
  requiresSale: boolean;
  redeemBy: Date | null;
  status: string;
  exportCount: number;
  lastExportedAt: Date | null;
  secretsPurgedAt: Date | null;
  createdAt: Date;
  createdByEmail: string | null;
  counts: Record<ActivationCodeStatus, number> & { locked: number; total: number };
};

/**
 * Generates a batch of cards in one transaction (up to 10,000). Raw secrets
 * exist only in memory here and, encrypted, in the printable columns until
 * the batch is finalised.
 */
export async function createBatch(
  actor: Actor,
  input: CreateBatchInput,
  meta: RequestMeta,
): Promise<BatchSummary> {
  assertCan(actor, "activation.batches.create");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_BATCH_SIZE) {
    throw new AppError("VALIDATION_ERROR", "quantity out of range", { field: "quantity" });
  }
  if (input.redeemBy && input.redeemBy.getTime() <= Date.now()) {
    throw new AppError("VALIDATION_ERROR", "redeemBy must be in the future", { field: "redeemBy" });
  }
  const db = getDb();

  const batchId = await db.transaction(async (tx) => {
    const [course] = await tx
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, input.courseId), sql`${courses.deletedAt} is null`));
    if (!course) throw new AppError("NOT_FOUND", "Course not found", { field: "courseId" });

    const [{ next } = { next: 0 }] = await tx.execute<{ next: number }>(
      sql`select nextval(pg_get_serial_sequence('activation_batches', 'batch_number'))::int as next`,
    );
    const batchNumber = Number(next);
    const serialPrefix = batchSerialPrefix(batchNumber);
    const id = uuidv7();
    await tx.insert(activationBatches).values({
      id,
      batchNumber,
      serialPrefix,
      name: input.name,
      courseId: input.courseId,
      quantity: input.quantity,
      requiresPin: input.requiresPin,
      requiresSale: input.requiresSale,
      redeemBy: input.redeemBy ?? null,
      notes: input.notes ?? null,
      createdBy: actor.userId,
    });

    for (let start = 1; start <= input.quantity; start += INSERT_CHUNK) {
      const end = Math.min(input.quantity, start + INSERT_CHUNK - 1);
      const rows = [];
      for (let sequence = start; sequence <= end; sequence += 1) {
        const codeId = uuidv7();
        const code = generateCardCode();
        const pin = input.requiresPin ? generateCardPin() : null;
        rows.push({
          id: codeId,
          batchId: id,
          sequence,
          serial: formatSerial(serialPrefix, sequence),
          codeHash: hashCardCode(code),
          codeCiphertext: encrypt(code, cipherContext.code(codeId)),
          pinHash: pin ? hashCardPin(codeId, pin) : null,
          pinCiphertext: pin ? encrypt(pin, cipherContext.pin(codeId)) : null,
        });
      }
      await tx.insert(activationCodes).values(rows);
    }

    await recordActivationEvents(tx, [
      {
        type: "batch_created",
        batchId: id,
        actorUserId: actor.userId,
        meta,
        metadata: { quantity: input.quantity, requiresPin: input.requiresPin, requiresSale: input.requiresSale },
      },
    ]);
    await recordAudit(tx, {
      action: "activation.batch_created",
      actorUserId: actor.userId,
      targetType: "activation_batch",
      targetId: id,
      meta,
      metadata: { name: input.name, quantity: input.quantity, serialPrefix },
    });
    return id;
  });

  const summary = await getBatchSummary(db, batchId);
  if (!summary) throw new Error("Batch not found after creation");
  return summary;
}

async function countsByBatch(executor: Executor, batchIds: string[]) {
  const result = new Map<string, BatchSummary["counts"]>();
  if (batchIds.length === 0) return result;
  const rows = await executor
    .select({
      batchId: activationCodes.batchId,
      status: activationCodes.status,
      total: count(),
      locked: sql<number>`count(*) filter (where ${activationCodes.lockedAt} is not null)::int`,
    })
    .from(activationCodes)
    .where(inArray(activationCodes.batchId, batchIds))
    .groupBy(activationCodes.batchId, activationCodes.status);
  for (const row of rows) {
    const entry = result.get(row.batchId) ?? {
      available: 0,
      sold: 0,
      activated: 0,
      revoked: 0,
      locked: 0,
      total: 0,
    };
    entry[row.status] += Number(row.total);
    entry.locked += Number(row.locked);
    entry.total += Number(row.total);
    result.set(row.batchId, entry);
  }
  return result;
}

const batchColumns = {
  id: activationBatches.id,
  batchNumber: activationBatches.batchNumber,
  serialPrefix: activationBatches.serialPrefix,
  name: activationBatches.name,
  courseId: activationBatches.courseId,
  quantity: activationBatches.quantity,
  requiresPin: activationBatches.requiresPin,
  requiresSale: activationBatches.requiresSale,
  redeemBy: activationBatches.redeemBy,
  status: activationBatches.status,
  exportCount: activationBatches.exportCount,
  lastExportedAt: activationBatches.lastExportedAt,
  secretsPurgedAt: activationBatches.secretsPurgedAt,
  createdAt: activationBatches.createdAt,
  createdByEmail: users.email,
};

export async function getBatchSummary(executor: Executor, batchId: string): Promise<BatchSummary | null> {
  const [batch] = await executor
    .select(batchColumns)
    .from(activationBatches)
    .leftJoin(users, eq(users.id, activationBatches.createdBy))
    .where(eq(activationBatches.id, batchId));
  if (!batch) return null;
  const counts = (await countsByBatch(executor, [batchId])).get(batchId);
  return {
    ...batch,
    counts: counts ?? { available: 0, sold: 0, activated: 0, revoked: 0, locked: 0, total: 0 },
  };
}

export async function listBatches(actor: Actor, options: { limit?: number; offset?: number } = {}) {
  assertCan(actor, "activation.batches.read");
  const db = getDb();
  const limit = Math.min(options.limit ?? 50, 200);
  const rows = await db
    .select(batchColumns)
    .from(activationBatches)
    .leftJoin(users, eq(users.id, activationBatches.createdBy))
    .orderBy(desc(activationBatches.batchNumber))
    .limit(limit)
    .offset(options.offset ?? 0);
  const counts = await countsByBatch(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    counts: counts.get(row.id) ?? { available: 0, sold: 0, activated: 0, revoked: 0, locked: 0, total: 0 },
  }));
}

export async function getBatchForActor(actor: Actor, batchId: string): Promise<BatchSummary> {
  assertCan(actor, "activation.batches.read");
  const summary = await getBatchSummary(getDb(), batchId);
  if (!summary) throw new AppError("NOT_FOUND");
  return summary;
}

export type CodeListItem = {
  id: string;
  sequence: number;
  serial: string;
  status: ActivationCodeStatus;
  lockedAt: Date | null;
  failedPinAttempts: number;
  soldAt: Date | null;
  activatedAt: Date | null;
  activatedByEmail: string | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/** Paginated card registry of a batch (no secrets; e-mails masked without users.read). */
export async function listBatchCodes(
  actor: Actor,
  batchId: string,
  options: { status?: ActivationCodeStatus; locked?: boolean; search?: string; limit?: number; offset?: number },
): Promise<{ items: CodeListItem[]; total: number }> {
  assertCan(actor, "activation.codes.read");
  const db = getDb();
  const conditions = [eq(activationCodes.batchId, batchId)];
  if (options.status) conditions.push(eq(activationCodes.status, options.status));
  if (options.locked) conditions.push(isNotNull(activationCodes.lockedAt));
  if (options.search) {
    const term = options.search.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (term) conditions.push(sql`${activationCodes.serial} like ${`%${term}%`}`);
  }
  const where = and(...conditions);
  const limit = Math.min(options.limit ?? 50, 500);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: activationCodes.id,
        sequence: activationCodes.sequence,
        serial: activationCodes.serial,
        status: activationCodes.status,
        lockedAt: activationCodes.lockedAt,
        failedPinAttempts: activationCodes.failedPinAttempts,
        soldAt: activationCodes.soldAt,
        activatedAt: activationCodes.activatedAt,
        activatedByEmail: users.email,
        revokedAt: activationCodes.revokedAt,
        createdAt: activationCodes.createdAt,
      })
      .from(activationCodes)
      .leftJoin(users, eq(users.id, activationCodes.activatedByUserId))
      .where(where)
      .orderBy(asc(activationCodes.sequence))
      .limit(limit)
      .offset(options.offset ?? 0),
    db.select({ total: count() }).from(activationCodes).where(where),
  ]);
  const revealEmails = can(actor, "users.read");
  return {
    items: rows.map((row) => ({
      ...row,
      activatedByEmail: row.activatedByEmail
        ? revealEmails
          ? row.activatedByEmail
          : maskEmail(row.activatedByEmail)
        : null,
    })),
    total: Number(total),
  };
}

export type PrintableCard = {
  serial: string;
  sequence: number;
  code: string;
  pin: string | null;
  url: string;
};

/**
 * Decrypts printable secrets for a sequence range (export permission only).
 * Every call is audited and counted on the batch. Cards already activated or
 * revoked have no secrets left and are skipped.
 */
export async function loadPrintableCards(
  actor: Actor,
  params: { batchId: string; from: number; to: number; format: "pdf" | "csv" },
  meta: RequestMeta,
): Promise<{ batch: BatchSummary; cards: PrintableCard[] }> {
  assertCan(actor, "activation.codes.export");
  if (params.to < params.from || params.to - params.from + 1 > MAX_EXPORT_RANGE) {
    throw new AppError("VALIDATION_ERROR", "invalid range", { field: "range" });
  }
  const db = getDb();
  const batch = await getBatchSummary(db, params.batchId);
  if (!batch) throw new AppError("NOT_FOUND");
  if (batch.secretsPurgedAt) throw new AppError("ACTIVATION_SECRETS_PURGED");

  const rows = await db
    .select({
      id: activationCodes.id,
      serial: activationCodes.serial,
      sequence: activationCodes.sequence,
      codeCiphertext: activationCodes.codeCiphertext,
      pinCiphertext: activationCodes.pinCiphertext,
    })
    .from(activationCodes)
    .where(
      and(
        eq(activationCodes.batchId, params.batchId),
        gte(activationCodes.sequence, params.from),
        lte(activationCodes.sequence, params.to),
        inArray(activationCodes.status, ["available", "sold"]),
        isNotNull(activationCodes.codeCiphertext),
      ),
    )
    .orderBy(asc(activationCodes.sequence));

  const cards = rows.map((row) => {
    const code = decrypt(row.codeCiphertext!, cipherContext.code(row.id));
    return {
      serial: row.serial,
      sequence: row.sequence,
      code,
      pin: row.pinCiphertext ? decrypt(row.pinCiphertext, cipherContext.pin(row.id)) : null,
      url: cardActivationUrl(code),
    };
  });

  await db.transaction(async (tx) => {
    await tx
      .update(activationBatches)
      .set({ exportCount: sql`${activationBatches.exportCount} + 1`, lastExportedAt: new Date() })
      .where(eq(activationBatches.id, params.batchId));
    await recordActivationEvents(tx, [
      {
        type: "batch_exported",
        batchId: params.batchId,
        actorUserId: actor.userId,
        meta,
        metadata: { from: params.from, to: params.to, cards: cards.length, format: params.format },
      },
    ]);
    await recordAudit(tx, {
      action: "activation.batch_exported",
      actorUserId: actor.userId,
      targetType: "activation_batch",
      targetId: params.batchId,
      meta,
      metadata: { from: params.from, to: params.to, cards: cards.length, format: params.format },
    });
  });
  return { batch, cards };
}

/**
 * Finalises a batch after printing: permanently deletes every printable
 * secret. Afterwards lost cards can only be revoked and replaced.
 */
export async function purgeBatchSecrets(actor: Actor, batchId: string, meta: RequestMeta): Promise<void> {
  assertCan(actor, "activation.batches.finalize");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({ id: activationBatches.id, secretsPurgedAt: activationBatches.secretsPurgedAt })
      .from(activationBatches)
      .where(eq(activationBatches.id, batchId))
      .for("update");
    if (!batch) throw new AppError("NOT_FOUND");
    if (batch.secretsPurgedAt) throw new AppError("ACTIVATION_SECRETS_PURGED");
    const purged = await tx
      .update(activationCodes)
      .set({ codeCiphertext: null, pinCiphertext: null })
      .where(eq(activationCodes.batchId, batchId))
      .returning({ id: activationCodes.id });
    await tx
      .update(activationBatches)
      .set({ secretsPurgedAt: new Date() })
      .where(eq(activationBatches.id, batchId));
    await recordActivationEvents(tx, [
      { type: "batch_secrets_purged", batchId, actorUserId: actor.userId, meta, metadata: { cards: purged.length } },
    ]);
    await recordAudit(tx, {
      action: "activation.batch_secrets_purged",
      actorUserId: actor.userId,
      targetType: "activation_batch",
      targetId: batchId,
      meta,
      metadata: { cards: purged.length },
    });
  });
}

/** Full registry for CSV export (no secrets). */
export async function loadBatchRegistry(actor: Actor, batchId: string) {
  assertCan(actor, "activation.codes.read");
  const db = getDb();
  const batch = await getBatchSummary(db, batchId);
  if (!batch) throw new AppError("NOT_FOUND");
  const rows = await db
    .select({
      serial: activationCodes.serial,
      status: activationCodes.status,
      lockedAt: activationCodes.lockedAt,
      createdAt: activationCodes.createdAt,
      soldAt: activationCodes.soldAt,
      activatedAt: activationCodes.activatedAt,
      activatedByEmail: users.email,
      revokedAt: activationCodes.revokedAt,
      revokeReason: activationCodes.revokeReason,
    })
    .from(activationCodes)
    .leftJoin(users, eq(users.id, activationCodes.activatedByUserId))
    .where(eq(activationCodes.batchId, batchId))
    .orderBy(asc(activationCodes.sequence));
  const revealEmails = can(actor, "users.read");
  return {
    batch,
    rows: rows.map((row) => ({
      ...row,
      activatedByEmail: row.activatedByEmail
        ? revealEmails
          ? row.activatedByEmail
          : maskEmail(row.activatedByEmail)
        : null,
    })),
  };
}

export async function listCourseOptions() {
  return getDb()
    .select({ id: courses.id, slug: courses.slug, title: courses.title, status: courses.status })
    .from(courses)
    .where(sql`${courses.deletedAt} is null`)
    .orderBy(asc(courses.createdAt));
}
