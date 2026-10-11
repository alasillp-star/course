import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { ReplaceCardDialog } from "@/components/admin/replace-card-dialog";
import { ShipmentStatusBadge } from "@/components/admin/orders/badges";
import { CodeStatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, formatDateTime, pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { getCardDetails } from "@/modules/activation/admin-codes.service";
import { requirePageActor } from "@/modules/identity/current";
import { isUuid } from "@/server/db/uuid";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.batches.title };
}

export default async function CardDetailPage({
  params,
}: PageProps<"/[locale]/admin/activation/cards/[codeId]">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, {
    adminArea: true,
    permission: "activation.codes.read",
  });
  const { codeId } = await params;
  if (!isUuid(codeId)) notFound();
  const card = await getCardDetails(actor, codeId).catch(() => null);
  if (!card) notFound();
  const t = dict.admin.card;
  const api = `/api/v1/admin/activation/codes/${card.id}`;
  const unused = card.status === "available" || card.status === "sold";

  const facts: Array<[string, React.ReactNode]> = [
    [
      t.batch,
      <Link
        key="b"
        href={`/${locale}/admin/activation/${card.batchId}`}
        className="font-medium hover:underline"
      >
        {card.batchName}
      </Link>,
    ],
    [t.course, pickLocalized(card.courseTitle, locale)],
    [dict.admin.batch.columns.sold, formatDateTime(card.soldAt, locale)],
    [dict.admin.batch.columns.activated, formatDateTime(card.activatedAt, locale)],
    [
      t.activatedBy,
      card.activatedByEmail ? (
        <span key="e" dir="ltr">
          {card.activatedByEmail}
        </span>
      ) : (
        "—"
      ),
    ],
    [t.failedPin, card.failedPinAttempts],
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        back={
          <Link
            href={`/${locale}/admin/activation/${card.batchId}`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowRightIcon className="size-4 ltr:rotate-180" />
            {card.batchName}
          </Link>
        }
        title={
          <span dir="ltr" className="font-mono">
            {format(t.title, { serial: card.serial })}
          </span>
        }
        description={
          <CodeStatusBadge
            status={card.status}
            locked={!!card.lockedAt}
            labels={dict.statuses.code}
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 sm:pt-6">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="mt-0.5 text-sm">{value}</p>
                </div>
              ))}
              {card.revokeReason ? (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs">{t.reason}</p>
                  <p className="mt-0.5 text-sm">{card.revokeReason}</p>
                </div>
              ) : null}
              {card.replacement ? (
                <div>
                  <p className="text-muted-foreground text-xs">{t.replacement}</p>
                  <Link
                    href={`/${locale}/admin/activation/cards/${card.replacement.id}`}
                    className="font-mono text-sm hover:underline"
                    dir="ltr"
                  >
                    {card.replacement.serial}
                  </Link>
                </div>
              ) : null}
              {card.replaces ? (
                <div>
                  <p className="text-muted-foreground text-xs">{t.replaces}</p>
                  <Link
                    href={`/${locale}/admin/activation/cards/${card.replaces.id}`}
                    className="font-mono text-sm hover:underline"
                    dir="ltr"
                  >
                    {card.replaces.serial}
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {card.delivery ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.delivery}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {can(actor, "orders.read") ? (
                    <Link
                      href={`/${locale}/admin/orders/${card.delivery.orderId}`}
                      className="font-mono font-semibold hover:underline"
                      dir="ltr"
                    >
                      {card.delivery.orderNumber}
                    </Link>
                  ) : (
                    <span className="font-mono font-semibold" dir="ltr">
                      {card.delivery.orderNumber}
                    </span>
                  )}
                  {card.delivery.shipmentStatus ? (
                    <ShipmentStatusBadge
                      status={card.delivery.shipmentStatus}
                      labels={dict.admin.orders.shipmentStatus}
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {dict.admin.orders.noShipment}
                    </span>
                  )}
                </div>
                {card.delivery.trackingNumber ? (
                  <p className="text-muted-foreground">
                    {card.delivery.carrier} ·{" "}
                    <span dir="ltr" className="font-mono">
                      {card.delivery.trackingNumber}
                    </span>
                    {card.delivery.carrierStatus ? ` · ${card.delivery.carrierStatus}` : null}
                  </p>
                ) : null}
                {card.status === "available" ? (
                  <p className="text-warning-foreground dark:text-warning font-medium">
                    {t.deliveryLocked}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t.timeline}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="border-border relative grid gap-4 border-s ps-5">
                {card.events.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="bg-primary ring-card absolute -start-[25px] top-1.5 size-2.5 rounded-full ring-4" />
                    <p className="text-sm font-medium">
                      {t.events[event.type as keyof typeof t.events] ?? event.type}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(event.occurredAt, locale)}
                      {event.actorEmail ? <span dir="ltr"> · {event.actorEmail}</span> : null}
                    </p>
                  </li>
                ))}
                <li className="relative">
                  <span className="bg-muted-foreground/40 ring-card absolute -start-[25px] top-1.5 size-2.5 rounded-full ring-4" />
                  <p className="text-sm font-medium">{t.generated}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDateTime(card.createdAt, locale)}
                  </p>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t.actions}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {card.status === "available" && !card.orderId && can(actor, "activation.codes.sell") ? (
              <ApiActionDialog
                label={t.sell}
                title={t.sell}
                endpoint="/api/v1/admin/activation/codes/sell"
                body={{ serials: [card.serial] }}
                variant="default"
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
            {card.status === "sold" && !card.orderId && can(actor, "activation.codes.sell") ? (
              <ApiActionDialog
                label={t.unsell}
                title={t.unsell}
                endpoint={`${api}/unsell`}
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
            {card.lockedAt && can(actor, "activation.codes.unlock") ? (
              <ApiActionDialog
                label={t.unlock}
                title={t.unlock}
                endpoint={`${api}/unlock`}
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
            {unused &&
            can(actor, "activation.codes.revoke") &&
            can(actor, "activation.codes.export") ? (
              <ReplaceCardDialog codeId={card.id} t={t} common={dict.common} errors={dict.errors} />
            ) : null}
            {unused && can(actor, "activation.codes.revoke") ? (
              <ApiActionDialog
                label={t.revoke}
                title={t.revoke}
                endpoint={`${api}/revoke`}
                reason={{ label: t.reason, placeholder: t.reasonPlaceholder }}
                variant="destructive"
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
