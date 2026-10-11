import { z } from "zod";
import { ENABLED_LOCALES, type Locale } from "@/i18n/config";
import { AppError } from "./errors";

export const localeSchema = z
  .string()
  .optional()
  .transform((value): Locale => (ENABLED_LOCALES.includes(value as Locale) ? (value as Locale) : "ar"));

export const uuidSchema = z.uuid();

export const otpCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "OTP must be 6 digits"));

export const reasonSchema = z.string().trim().min(3).max(500);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

/** Validates a dynamic route segment as a UUID (404 instead of a DB error). */
export function parseIdParam(value: string | undefined): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new AppError("NOT_FOUND");
  return parsed.data;
}

/**
 * Post-login redirect target: only same-site, locale-prefixed relative paths
 * are accepted (prevents open redirects through ?next=).
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback;
  if (!/^\/(ar|fr|en)(\/[A-Za-z0-9\-_/.?=&%]*)?$/.test(candidate) || candidate.startsWith("//")) {
    return fallback;
  }
  return candidate;
}
