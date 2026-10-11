/**
 * Locale configuration. Pure module: safe to import from server, client and
 * scripts. Arabic is the default (RTL); French is fully supported; English is
 * wired into the structure (dictionary + routing) and can be enabled by adding
 * it to ENABLED_LOCALES once the dictionary is reviewed.
 */
export const LOCALES = ["ar", "fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const ENABLED_LOCALES: readonly Locale[] = ["ar", "fr"];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function isEnabledLocale(value: unknown): value is Locale {
  return isLocale(value) && ENABLED_LOCALES.includes(value);
}

export function localeDirection(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

/** BCP 47 tags used for Intl formatting (Algeria-first). */
export const INTL_LOCALE: Record<Locale, string> = {
  ar: "ar-DZ",
  fr: "fr-DZ",
  en: "en-GB",
};

export const LOCALE_LABELS: Record<Locale, string> = {
  ar: "العربية",
  fr: "Français",
  en: "English",
};

/**
 * Picks the best enabled locale from an Accept-Language header value.
 * Only the primary language subtag is considered (fr-FR -> fr).
 */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.toLowerCase().split("-")[0] ?? "", q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((entry) => entry.lang)
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) {
    if (isEnabledLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}
