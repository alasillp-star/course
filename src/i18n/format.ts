import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "./config";

/** Replaces {name} placeholders. Pure: safe on server and client. */
export function format(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match,
  );
}

export type LocalizedValue = Partial<Record<Locale, string>> | null | undefined;

/** Picks a translation with sensible fallbacks (requested -> default -> any). */
export function pickLocalized(value: LocalizedValue, locale: Locale): string {
  if (!value) return "";
  return value[locale] ?? value[DEFAULT_LOCALE] ?? Object.values(value).find(Boolean) ?? "";
}

export function formatDate(
  value: Date | string | null | undefined,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], options).format(date);
}

export function formatDateTime(value: Date | string | null | undefined, locale: Locale): string {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

export function formatPercent(ratio: number | null, locale: Locale): string {
  if (ratio === null || Number.isNaN(ratio)) return "—";
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "percent", maximumFractionDigits: 1 }).format(ratio);
}

export function formatMoney(minor: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelative(value: Date | string | null | undefined, locale: Locale, now = Date.now()): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}
