import "server-only";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import { isEnabledLocale, localeDirection, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

/**
 * Locale + dictionary for the current request, read from the root [locale]
 * segment (no prop drilling). Unknown or disabled locales render a 404.
 */
export async function getI18n() {
  const value = await rootLocale();
  if (!isEnabledLocale(value)) notFound();
  const locale: Locale = value;
  return { locale, dir: localeDirection(locale), dict: getDictionary(locale) };
}
