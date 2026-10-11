import type { Locale } from "@/i18n/config";

/**
 * Brand configuration — the single place to rename or re-brand the academy.
 * Defaults follow the existing "Oryx Strategy" course page (see legacy/).
 * Visual brand tokens (colours, radius, fonts) live in src/app/globals.css.
 */
export const ACADEMY = {
  name: {
    ar: "أكاديمية Oryx Strategy",
    fr: "Académie Oryx Strategy",
    en: "Oryx Strategy Academy",
  } satisfies Record<Locale, string>,
  shortName: "Oryx Academy",
  /** Prefix for printed card serials when none is chosen (e.g. OXA-B0007-00042). */
  cardIssuer: "OXA",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  defaultCurrency: "DZD",
  /** Slug of the flagship course created by the seed scripts. */
  mainCourseSlug: "main-course",
} as const;
