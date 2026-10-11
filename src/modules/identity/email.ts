import { z } from "zod";

/**
 * E-mail normalisation: trim + lower-case. We deliberately do NOT strip dots
 * or "+tags" (that would merge addresses some providers treat as distinct);
 * case-insensitive uniqueness is enough to prevent duplicate accounts.
 */
export function normalizeEmail(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .transform(normalizeEmail)
  .pipe(z.email({ error: "INVALID_EMAIL" }));

/** j***@example.com — for UI confirmations and notifications. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "***";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}
