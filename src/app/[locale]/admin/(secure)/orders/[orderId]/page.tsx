import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, LockIcon, PackageIcon, UnlockIcon } from "lucide-react";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { AssignCardForm } from "@/components/admin/orders/assign-card-form";
import { OrderStatusBadge, ShipmentStatusBadge } from "@/components/admin/orders/badges";
import { OverrideStatusDialog } from "@/components/admin/orders/override-status-dialog";
import { ShipmentForm } from "@/components/admin/orders/shipment-form";
import { PageHeader } from "@/components/admin/page-header";
import { CodeStatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { getOrderDetail } from "@/modules/commerce/orders.service";
import { requirePageActor } from "@/modules/identity/current";
import { isUuid } from "@/server/db/uuid";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.orders.title };
}

/** Staff reasons are shown as typed; system notes are translated (or hidden). */
function historyNote(
  note: string | null | undefined,
  source: string,
  labels: Record<"ignored_after_delivery" | "unrecognised_status" | "tracking_changed", string>,
): string | null {
  if (!note || note === "tracking_set") return null;
  if (note.startsWith("ignored_after_delivery")) return labels.ignored_after_delivery;
  if (note === "unrecognised_status") return labels.unrecognised_status;
  if (note.startsWith("tracking_changed:")) {
    return `${labels.tracking_changed} ${note.slice("tracking_changed:".length)}`;
  }
  return source === "manual" ? note : null;
}

export default async function OrderDetailPage({
  params,
}: PageProps<"/[locale]/admin/orders/[orderId]">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "orders.read" });
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  const detail = await getOrderDetail(actor, orderId).catch(() => null);
  if (!detail) notFound();
  const { order, customer, shipment, cards } = detail;
  const t = dict.admin.orders;
  const d = t.detail;
  const manage = can(actor, "orders.manage") && can(actor, "activation.codes.sell");
  const open = order.status === "pending_payment" || order.status === "draft";
  const canPack =
    manage &&
    order.status !== "cancelled" &&
    order.status !== "refunded" &&
    cards.filter((card) => card.status !== "revoked").length < detail.capacity;
  const delivered = shipment?.status === "delivered";

  const facts: Array<[string, React.ReactNode]> = [
    [d.customer, customer?.fullName ?? "—"],
    [
      d.phone,
      customer?.phone ? (
        <span key="p" dir="ltr" className="font-mono">
          {customer.phone}
        </span>
      ) : (
        "—"
      ),
    ],
    [
      d.address,
      [customer?.region, customer?.city, customer?.address].filter(Boolean).join(" · ") || "—",
    ],
    [d.product, order.product ?? "—"],
    [d.quantity, detail.capacity],
    [d.total, formatMoney(order.totalMinor, order.currency, locale)],
  ];
  if (order.shippingFeeMinor !== null) {
    facts.push([d.shippingFee, formatMoney(order.shippingFeeMinor, order.currency, locale)]);
  }
  if (customer?.email) {
    facts.push([
      d.email,
      <span key="e" dir="ltr">
        {customer.email}
      </span>,
    ]);
  }
  if (order.externalId) {
    facts.push([
      d.externalId,
      <span key="x" dir="ltr" className="font-mono text-xs">
        {order.externalId}
      </span>,
    ]);
  }
  if (customer?.linkedUserId && can(actor, "users.read")) {
    facts.push([
      d.linkedStudent,
      <Link
        key="s"
        href={`/${locale}/admin/students/${customer.linkedUserId}`}
        className="text-primary font-medium hover:underline"
      >
        {d.linkedStudent}
      </Link>,
    ]);
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        back={
          <Link
            href={`/${locale}/admin/orders`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowRightIcon className="size-4 ltr:rotate-180" />
            {d.back}
          </Link>
        }
        title={
          <>
            {d.title.split("{number}")[0]}
            <span dir="ltr" className="font-mono">
              {order.orderNumber}
            </span>
            {d.title.split("{number}")[1]}
          </>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} labels={t.orderStatus} />
            <Badge variant="muted">
              {order.externalSource === "landing_site" ? t.source.landing_site : t.source.manual}
            </Badge>
            <span className="text-sm">
              {formatDateTime(order.placedAt ?? order.createdAt, locale)}
            </span>
          </span>
        }
        actions={
          manage && open ? (
            <ApiActionDialog
              label={d.cancel}
              title={d.cancelTitle}
              description={d.cancelBody}
              endpoint={`/api/v1/admin/orders/${order.id}/cancel`}
              reason={{ label: d.reason }}
              successMessage={d.cancelled}
              variant="outline"
              common={dict.common}
              errors={dict.errors}
            />
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageIcon className="text-primary size-5" />
                {d.cards}
              </CardTitle>
              <CardDescription>{d.cardsHint}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {cards.length === 0 ? (
                <p className="text-muted-foreground text-sm">{d.noCards}</p>
              ) : (
                <ul className="divide-border border-border divide-y rounded-xl border">
                  {cards.map((card) => (
                    <li key={card.id} className="flex flex-wrap items-center gap-3 p-3">
                      {card.status === "available" ? (
                        <LockIcon className="text-warning size-4 shrink-0" aria-hidden />
                      ) : (
                        <UnlockIcon className="text-success size-4 shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        {can(actor, "activation.codes.read") ? (
                          <Link
                            href={`/${locale}/admin/activation/cards/${card.id}`}
                            className="font-mono text-sm font-semibold hover:underline"
                            dir="ltr"
                          >
                            {card.serial}
                          </Link>
                        ) : (
                          <span className="font-mono text-sm font-semibold" dir="ltr">
                            {card.serial}
                          </span>
                        )}
                        <p className="text-muted-foreground text-xs">
                          {card.status === "available"
                            ? d.cardLocked
                            : card.status === "sold"
                              ? d.cardUnlocked
                              : card.activatedByEmail
                                ? `${formatDateTime(card.activatedAt, locale)} · `
                                : ""}
                          {card.activatedByEmail ? (
                            <span dir="ltr">{card.activatedByEmail}</span>
                          ) : null}
                        </p>
                      </div>
                      <CodeStatusBadge status={card.status} labels={dict.statuses.code} />
                      {manage && card.status === "available" ? (
                        <ApiActionDialog
                          label={d.unassign}
                          title={d.unassignTitle}
                          description={d.unassignBody}
                          endpoint={`/api/v1/admin/orders/${order.id}/cards/${card.id}`}
                          method="DELETE"
                          variant="ghost"
                          common={dict.common}
                          errors={dict.errors}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canPack ? (
                <AssignCardForm
                  orderId={order.id}
                  t={d}
                  assignErrors={t.assignErrors}
                  errors={dict.errors}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 sm:pt-6">
              {facts.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="mt-0.5 text-sm break-words">{value}</p>
                </div>
              ))}
              {order.notes ? (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs">{d.notes}</p>
                  <p className="mt-0.5 text-sm whitespace-pre-line">{order.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {detail.payments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{d.payments}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {detail.payments.map((payment) => (
                  <div key={payment.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {d.provider[payment.provider as keyof typeof d.provider] ?? payment.provider}
                    </span>
                    <span className="tabular">
                      {formatMoney(payment.amountMinor, payment.currency, locale)}
                    </span>
                    <Badge variant={payment.status === "succeeded" ? "success" : "muted"}>
                      {d.paymentStatus[payment.status]}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(payment.receivedAt, locale)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{d.shipment}</CardTitle>
            {shipment ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <ShipmentStatusBadge status={shipment.status} labels={t.shipmentStatus} />
                {shipment.carrierStatus ? (
                  <span className="text-muted-foreground text-xs">
                    {d.carrierLabel}: {shipment.carrierStatus}
                  </span>
                ) : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-5">
            {shipment ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">{d.carrier}</dt>
                  <dd className="mt-0.5 font-medium">{shipment.carrier}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{d.tracking}</dt>
                  <dd className="mt-0.5 font-mono" dir="ltr">
                    {shipment.trackingNumber}
                  </dd>
                </div>
                {shipment.deliveredAt ? (
                  <div>
                    <dt className="text-muted-foreground text-xs">{d.deliveredAt}</dt>
                    <dd className="mt-0.5">{formatDateTime(shipment.deliveredAt, locale)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground text-xs">{d.lastSync}</dt>
                  <dd className="mt-0.5">{formatDateTime(shipment.lastSyncedAt, locale)}</dd>
                </div>
              </dl>
            ) : null}
            {can(actor, "orders.manage") && !delivered ? (
              <ShipmentForm
                orderId={order.id}
                initial={shipment}
                t={d}
                assignErrors={t.assignErrors}
                errors={dict.errors}
              />
            ) : null}
            {shipment && can(actor, "orders.delivery.override") ? (
              <div>
                <OverrideStatusDialog
                  orderId={order.id}
                  current={shipment.status}
                  t={d}
                  statusLabels={t.shipmentStatus}
                  assignErrors={t.assignErrors}
                  common={dict.common}
                  errors={dict.errors}
                />
              </div>
            ) : null}
            {shipment && shipment.history.length > 0 ? (
              <div>
                <p className="mb-3 text-sm font-semibold">{d.history}</p>
                <ol className="border-border relative grid gap-3 border-s ps-5">
                  {shipment.history.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="relative">
                      <span className="bg-primary ring-card absolute -start-[25px] top-1.5 size-2.5 rounded-full ring-4" />
                      <p className="text-sm font-medium">
                        {t.shipmentStatus[entry.status as keyof typeof t.shipmentStatus] ??
                          entry.status}
                        {entry.carrierStatus &&
                        entry.carrierStatus.toLowerCase() !==
                          (
                            t.shipmentStatus[entry.status as keyof typeof t.shipmentStatus] ?? ""
                          ).toLowerCase() ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            — {entry.carrierStatus}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDateTime(entry.at, locale)} ·{" "}
                        {d.historySource[entry.source as keyof typeof d.historySource] ??
                          entry.source}
                      </p>
                      {historyNote(entry.note, entry.source, d.historyNotes) ? (
                        <p className="text-muted-foreground mt-0.5 text-xs italic">
                          {historyNote(entry.note, entry.source, d.historyNotes)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
