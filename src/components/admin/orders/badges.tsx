import { Badge } from "@/components/ui/badge";
import type { OrderStatus, ShipmentStatus } from "@/shared/enums";

type Variant = "muted" | "brand" | "success" | "danger" | "warning" | "info" | "lime";

const SHIPMENT_VARIANT: Record<ShipmentStatus, Variant> = {
  pending: "muted",
  in_transit: "info",
  out_for_delivery: "brand",
  delivered: "success",
  failed_attempt: "warning",
  returned: "danger",
  cancelled: "danger",
};

const ORDER_VARIANT: Record<OrderStatus, Variant> = {
  draft: "muted",
  pending_payment: "warning",
  paid: "success",
  cancelled: "danger",
  refunded: "muted",
  partially_refunded: "muted",
};

export function ShipmentStatusBadge({
  status,
  labels,
}: {
  status: ShipmentStatus;
  labels: Record<ShipmentStatus, string>;
}) {
  return <Badge variant={SHIPMENT_VARIANT[status]}>{labels[status]}</Badge>;
}

export function OrderStatusBadge({
  status,
  labels,
}: {
  status: OrderStatus;
  labels: Record<OrderStatus, string>;
}) {
  return <Badge variant={ORDER_VARIANT[status]}>{labels[status]}</Badge>;
}
