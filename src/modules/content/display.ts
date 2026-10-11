import type { ContentStatus } from "@/shared/enums";

export type DisplayStatus = ContentStatus | "scheduled";

/** "scheduled" = published with a publication date still in the future. */
export function displayStatus(
  status: ContentStatus,
  publishAt: Date | string | null,
  now: Date = new Date(),
): DisplayStatus {
  if (status === "published" && publishAt && new Date(publishAt).getTime() > now.getTime()) {
    return "scheduled";
  }
  return status;
}
