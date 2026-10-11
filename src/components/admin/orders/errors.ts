import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

/** INVALID_STATE answers of the order endpoints carry the precise reason in details.status. */
export function orderErrorMessage(
  error: ApiError,
  assignErrors: Dictionary["admin"]["orders"]["assignErrors"],
  errors: Dictionary["errors"],
): string {
  const status = typeof error.details.status === "string" ? error.details.status : null;
  if (error.code === "INVALID_STATE" && status && status in assignErrors) {
    return assignErrors[status as keyof typeof assignErrors];
  }
  return errorMessage(error, errors);
}
