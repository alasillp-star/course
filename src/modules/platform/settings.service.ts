import "server-only";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Executor } from "@/server/db/client";
import { platformSettings } from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { assertCan, type Actor } from "../access/actor";
import { recordAudit } from "../audit/audit.service";

/**
 * Platform settings editable from the admin area (stored in platform_settings,
 * one row per key). Every key has a schema and a default here: a missing or
 * invalid stored value falls back to the default, so readers never fail.
 * Infrastructure secrets stay in environment variables, never here.
 */
export const SETTINGS = {
  // Contact shown to students
  "academy.supportEmail": { schema: z.union([z.literal(""), z.email().max(254)]), default: "" },
  /** International format, e.g. +213 555 12 34 56; empty = hidden. */
  "academy.whatsapp": {
    schema: z.union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^\+?[0-9 ]{8,20}$/),
    ]),
    default: "",
  },
  // Sections
  "community.enabled": { schema: z.boolean(), default: true },
  "community.chatEnabled": { schema: z.boolean(), default: true },
  "live.enabled": { schema: z.boolean(), default: true },
  /** Minutes before the start when the join link opens. */
  "live.joinWindowMinutes": { schema: z.number().int().min(0).max(120), default: 15 },
  "certificates.enabled": { schema: z.boolean(), default: true },
  /** Share of the published lessons a student must complete. */
  "certificates.completionPercent": { schema: z.number().int().min(50).max(100), default: 100 },
  "certificates.signatoryName": { schema: z.string().trim().min(1).max(80), default: "Abdou" },
  "certificates.signatoryTitle": {
    schema: z.string().trim().max(120),
    default: "Fondateur · Abdou Academy",
  },
} as const satisfies Record<string, { schema: z.ZodType; default: unknown }>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.output<(typeof SETTINGS)[K]["schema"]>;
export type PlatformSettings = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(value: string): value is SettingKey {
  return Object.hasOwn(SETTINGS, value);
}

function parseStored<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const parsed = SETTINGS[key].schema.safeParse(raw);
  return (parsed.success ? parsed.data : SETTINGS[key].default) as SettingValue<K>;
}

/** All settings with defaults applied (one query). */
export async function getSettings(executor: Executor = getDb()): Promise<PlatformSettings> {
  const rows = await executor
    .select({ key: platformSettings.key, value: platformSettings.value })
    .from(platformSettings)
    .where(inArray(platformSettings.key, SETTING_KEYS));
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [
      key,
      stored.has(key) ? parseStored(key, stored.get(key)) : SETTINGS[key].default,
    ]),
  ) as PlatformSettings;
}

export async function getSetting<K extends SettingKey>(
  key: K,
  executor: Executor = getDb(),
): Promise<SettingValue<K>> {
  const [row] = await executor
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(inArray(platformSettings.key, [key]));
  return row ? parseStored(key, row.value) : (SETTINGS[key].default as SettingValue<K>);
}

/** Throws FEATURE_DISABLED when a section is switched off. */
export async function assertFeatureEnabled(
  key: "community.enabled" | "community.chatEnabled" | "live.enabled" | "certificates.enabled",
  executor: Executor = getDb(),
): Promise<void> {
  if (!(await getSetting(key, executor))) throw new AppError("FEATURE_DISABLED");
}

/**
 * Validates and saves several settings at once (settings.manage). Unknown keys
 * and invalid values are refused as a whole; the audit log keeps old and new
 * values (settings never hold secrets).
 */
export async function updateSettings(
  actor: Actor,
  changes: Record<string, unknown>,
  meta: RequestMeta,
): Promise<PlatformSettings> {
  assertCan(actor, "settings.manage");
  const entries = Object.entries(changes);
  if (entries.length === 0) throw new AppError("VALIDATION_ERROR");
  const values: Array<{ key: SettingKey; value: unknown }> = [];
  for (const [key, raw] of entries) {
    if (!isSettingKey(key)) throw new AppError("VALIDATION_ERROR", `Unknown setting ${key}`);
    const parsed = SETTINGS[key].schema.safeParse(raw);
    if (!parsed.success) throw new AppError("VALIDATION_ERROR", `Invalid value for ${key}`);
    values.push({ key, value: parsed.data });
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const before = await getSettings(tx);
    await tx
      .insert(platformSettings)
      .values(values.map(({ key, value }) => ({ key, value, updatedBy: actor.userId })))
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: {
          value: sql`excluded.value`,
          updatedBy: actor.userId,
          updatedAt: sql`now()`,
        },
      });
    await recordAudit(tx, {
      action: "settings.updated",
      actorUserId: actor.userId,
      targetType: "settings",
      targetId: values.map(({ key }) => key).join(","),
      meta,
      metadata: {
        changes: values.map(({ key, value }) => ({ key, from: before[key], to: value })),
      },
    });
    return getSettings(tx);
  });
}
