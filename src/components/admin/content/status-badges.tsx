import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { DisplayStatus } from "@/modules/content/display";
import type { MediaStatus } from "@/shared/enums";

const STATUS_VARIANT: Record<DisplayStatus, "muted" | "success" | "warning" | "info"> = {
  draft: "muted",
  published: "success",
  hidden: "warning",
  scheduled: "info",
};

export function ContentStatusBadge({
  status,
  labels,
}: {
  status: DisplayStatus;
  labels: Dictionary["admin"]["content"]["status"];
}) {
  return <Badge variant={STATUS_VARIANT[status]}>{labels[status]}</Badge>;
}

const VIDEO_VARIANT: Record<
  MediaStatus | "none",
  "muted" | "success" | "warning" | "danger" | "info"
> = {
  none: "muted",
  pending_upload: "warning",
  processing: "info",
  ready: "success",
  failed: "danger",
  deleted: "muted",
};

export function VideoStatusBadge({
  status,
  labels,
}: {
  status: MediaStatus | "none";
  labels: Dictionary["admin"]["content"]["video"];
}) {
  return <Badge variant={VIDEO_VARIANT[status]}>{labels[status]}</Badge>;
}
