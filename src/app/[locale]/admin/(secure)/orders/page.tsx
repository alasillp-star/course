import type { Metadata } from "next";
import Link from "next/link";
import { PlugIcon, TruckIcon } from "lucide-react";
import { OrderStatusBadge, ShipmentStatusBadge } from "@/components/admin/orders/badges";
import { CreateOrderDialog } from "@/components/admin/orders/create-order-dialog";
import { ImportStatusesDialog } from "@/components/admin/orders/import-statuses-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, formatDate, formatMoney, formatNumber } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { listOrders, ORDER_STAGES, type OrderStage } from "@/modules/commerce/orders.service";
import { requirePageActor } from "@/modules/identity/current";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.orders.title };
}

const PAGE_SIZE = 50;

export default async function OrdersPage({ searchParams }: PageProps<"/[locale]/admin/orders">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "orders.read" });
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.slice(0, 120) : undefined;
  const stage: OrderStage = ORDER_STAGES.includes(query.stage as OrderStage)
    ? (query.stage as OrderStage)
    : "all";
  const offset = Math.max(0, Number(query.offset) || 0);
  const t = dict.admin.orders;
  const { items, total, stageCounts } = await listOrders(actor, {
    stage,
    search,
    limit: PAGE_SIZE,
    offset,
  });
  const base = `/${locale}/admin/orders`;
  const stageHref = (key: OrderStage) => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("stage", key);
    if (search) params.set("q", search);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.subtitle}
        actions={
          <>
            {can(actor, "orders.manage") ? (
              <Button asChild variant="ghost">
                <Link href={`${base}/integrations`}>
                  <PlugIcon />
                  {t.integrations}
                </Link>
              </Button>
            ) : null}
            {can(actor, "orders.delivery.override") ? (
              <ImportStatusesDialog
                t={t.import}
                triggerLabel={t.importStatuses}
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
            {can(actor, "orders.manage") ? (
              <CreateOrderDialog
                locale={locale}
                t={t.form}
                detail={t.detail}
                triggerLabel={t.newOrder}
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
          </>
        }
      />
      <nav
        className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1"
        aria-label={t.columns.delivery}
      >
        {ORDER_STAGES.map((key) => (
          <Link
            key={key}
            href={stageHref(key)}
            aria-current={key === stage ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
              key === stage
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.stages[key]}
            <span
              className={cn(
                "tabular rounded-full px-1.5 text-xs",
                key === stage ? "bg-primary-foreground/20" : "bg-muted",
              )}
            >
              {formatNumber(stageCounts[key] ?? 0, locale)}
            </span>
          </Link>
        ))}
      </nav>
      <Card className="overflow-hidden p-0">
        <form method="get" className="border-border flex flex-col gap-2 border-b p-4 sm:flex-row">
          {stage !== "all" ? <input type="hidden" name="stage" value={stage} /> : null}
          <Input
            name="q"
            defaultValue={search ?? ""}
            placeholder={t.search}
            className="h-10 sm:max-w-md"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-10">
            {dict.common.search}
          </Button>
        </form>
        {items.length === 0 ? (
          <EmptyState icon={<TruckIcon />} title={t.empty} className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.columns.order}</TableHead>
                <TableHead>{t.columns.customer}</TableHead>
                <TableHead className="hidden md:table-cell">{t.columns.destination}</TableHead>
                <TableHead>{t.columns.total}</TableHead>
                <TableHead>{t.columns.cards}</TableHead>
                <TableHead>{t.columns.delivery}</TableHead>
                <TableHead className="hidden md:table-cell">{t.columns.placed}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((order) => {
                const missing = order.cardsAssigned < Math.max(order.cardCapacity, 1);
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`${base}/${order.id}`}
                        className="font-mono font-semibold hover:underline"
                        dir="ltr"
                      >
                        {order.orderNumber}
                      </Link>
                      <div className="mt-1">
                        <OrderStatusBadge status={order.status} labels={t.orderStatus} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{order.customerName ?? "—"}</p>
                      {order.customerPhone ? (
                        <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                          {order.customerPhone}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {[order.shippingAddress?.region, order.shippingAddress?.city]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="tabular">
                      {formatMoney(order.totalMinor, order.currency, locale)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={missing && order.status !== "cancelled" ? "warning" : "muted"}
                      >
                        <span dir="ltr" className="tabular">
                          {format(t.cardsCount, {
                            assigned: order.cardsAssigned,
                            capacity: Math.max(order.cardCapacity, 1),
                          })}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.shipmentStatus ? (
                        <div className="grid gap-1">
                          <ShipmentStatusBadge
                            status={order.shipmentStatus}
                            labels={t.shipmentStatus}
                          />
                          <span className="text-muted-foreground font-mono text-xs" dir="ltr">
                            {order.trackingNumber}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">{t.noShipment}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                      {formatDate(order.placedAt ?? order.createdAt, locale)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <div className="px-4 pb-4">
          <Pagination
            basePath={base}
            query={{ q: search, stage: stage === "all" ? undefined : stage }}
            offset={offset}
            limit={PAGE_SIZE}
            total={total}
            labels={{
              previous: dict.common.previous,
              next: dict.common.next,
              of: dict.common.of,
            }}
          />
        </div>
      </Card>
    </div>
  );
}
