import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { ApiError } from "./api-client";

/** Localised, user-facing message for an API error. */
export function errorMessage(error: unknown, errors: Dictionary["errors"]): string {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK_ERROR") return errors.network;
    const template = (errors as Record<string, string>)[error.code];
    if (template) {
      const vars = Object.fromEntries(
        Object.entries(error.details).filter(([, value]) => typeof value === "string" || typeof value === "number"),
      ) as Record<string, string | number>;
      return format(template, vars);
    }
  }
  return errors.generic;
}
