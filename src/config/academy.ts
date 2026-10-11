import type { Locale } from "@/i18n/config";

/**
 * Brand configuration — the single place to rename or re-brand the academy.
 * Identity: Abdou Academy brand pack (direction 02) — see public/brand and docs/BRAND.md.
 * Visual brand tokens (colours, radius, fonts) live in src/app/globals.css.
 */
export const ACADEMY = {
  name: {
    ar: "أكاديمية عبدو",
    fr: "Abdou Academy",
    en: "Abdou Academy",
  } satisfies Record<Locale, string>,
  shortName: "Abdou Academy",
  /** Social handle from the brand pack. */
  handle: "@abdouacademy",
  /** Prefix for printed card serials when none is chosen (e.g. ABD-B0007-00042). */
  cardIssuer: "ABD",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  defaultCurrency: "DZD",
  /** Time zone in which staff enter schedules (IANA name). */
  timeZone: "Africa/Algiers",
  /** Slug of the flagship course created by the seed scripts. */
  mainCourseSlug: "main-course",
} as const;
