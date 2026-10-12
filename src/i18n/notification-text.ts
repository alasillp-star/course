import { NOTIFICATION_TYPES, type NotificationType } from "@/shared/enums";
import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries";
import { format, formatDateTime } from "./format";

const DATE_KEYS = new Set(["startsAt"]);

/** Localised text of a stored notification (type + data). */
export function notificationText(
  dict: Dictionary,
  locale: Locale,
  notification: { type: string; data: Record<string, unknown> },
): string {
  const t = dict.notifications;
  if (!(NOTIFICATION_TYPES as readonly string[]).includes(notification.type)) return t.fallback;
  const vars: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(notification.data ?? {})) {
    if (typeof value === "number") vars[key] = value;
    else if (typeof value === "string") {
      vars[key] = DATE_KEYS.has(key) ? formatDateTime(value, locale) : value;
    }
  }
  const [group, key] = (notification.type as NotificationType).split(".") as [string, string];
  const template = (t.types as Record<string, Record<string, string>>)[group]?.[key];
  return template ? format(template, vars) : t.fallback;
}

/** Locale-prefixed href of a notification link ("/app/…" → "/ar/app/…"). */
export function notificationHref(locale: Locale, link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? `/${locale}${link}` : null;
}
