import { Badge } from "@/components/ui/badge";
import type { ActivationCodeStatus } from "@/shared/enums";

const VARIANT: Record<ActivationCodeStatus, "muted" | "gold" | "success" | "danger"> = {
  available: "muted",
  sold: "gold",
  activated: "success",
  revoked: "danger",
};

export function CodeStatusBadge({
  status,
  locked,
  labels,
}: {
  status: ActivationCodeStatus;
  locked?: boolean;
  labels: Record<ActivationCodeStatus | "locked", string>;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={VARIANT[status]}>{labels[status]}</Badge>
      {locked ? <Badge variant="warning">{labels.locked}</Badge> : null}
    </span>
  );
}
