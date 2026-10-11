import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, FileDownIcon, FileSpreadsheetIcon, PrinterIcon, ShieldAlertIcon } from "lucide-react";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { SellCardsDialog } from "@/components/admin/sell-cards-dialog";
import { CodeStatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDate, formatDateTime, formatNumber } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { getBatchForActor, listBatchCodes, MAX_EXPORT_RANGE } from "@/modules/activation/batches.service";
import { requirePageActor } from "@/modules/identity/current";
import { isUuid } from "@/server/db/uuid";
import { ACTIVATION_CODE_STATUSES, type ActivationCodeStatus } from "@/shared/enums";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.batches.title };
}

const PAGE_SIZE = 50;

export default async function BatchDetailPage({ params, searchParams }: PageProps<"/[locale]/admin/activation/[batchId]">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "activation.batches.read" });
  const { batchId } = await params;
  if (!isUuid(batchId)) notFound();
  const query = await searchParams;
  const status = ACTIVATION_CODE_STATUSES.includes(query.status as ActivationCodeStatus) ? (query.status as ActivationCodeStatus) : undefined;
  const search = typeof query.q === "string" ? query.q : undefined;
  const offset = Math.max(0, Number(query.offset) || 0);
  const t = dict.admin.batch;
  const statusLabels = { ...dict.statuses.code };

  const batch = await getBatchForActor(actor, batchId).catch(() => null);
  if (!batch) notFound();
  const codes = can(actor, "activation.codes.read")
    ? await listBatchCodes(actor, batchId, { status, search, limit: PAGE_SIZE, offset })
    : { items: [], total: 0 };
  const n = (value: number) => formatNumber(value, locale);
  const canExport = can(actor, "activation.codes.export") && !batch.secretsPurgedAt;
  const apiBase = `/api/v1/admin/activation/batches/${batch.id}`;
  const maxSequence = batch.quantity;
  const ranges: Array<[number, number]> = [];
  for (let from = 1; from <= maxSequence; from += MAX_EXPORT_RANGE) {
    ranges.push([from, Math.min(maxSequence, from + MAX_EXPORT_RANGE - 1)]);
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        back={
          <Link href={`/${locale}/admin/activation`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowRightIcon className="size-4 ltr:rotate-180" />
            {t.back}
          </Link>
        }
        title={batch.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm" dir="ltr">
              {batch.serialPrefix}
            </span>
            <Badge variant={batch.requiresPin ? "gold" : "muted"}>{batch.requiresPin ? t.requiresPin : t.noPin}</Badge>
            <Badge variant={batch.requiresSale ? "info" : "muted"}>{batch.requiresSale ? t.requiresSale : t.noSale}</Badge>
            {batch.redeemBy ? <Badge variant="outline">{format(t.redeemBy, { date: formatDate(batch.redeemBy, locale) })}</Badge> : null}
            {batch.createdByEmail ? (
              <span className="text-xs">{format(t.createdBy, { email: batch.createdByEmail })}</span>
            ) : null}
          </span>
        }
        actions={
          can(actor, "activation.codes.sell") ? (
            <SellCardsDialog t={dict.admin.batches.sell} triggerLabel={dict.admin.batches.sellCards} common={dict.common} errors={dict.errors} variant="gold" />
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label={dict.admin.batches.columns.quantity} value={n(batch.counts.total)} />
        <StatCard label={dict.statuses.code.available} value={n(batch.counts.available)} />
        <StatCard label={dict.statuses.code.sold} value={n(batch.counts.sold)} />
        <StatCard label={dict.statuses.code.activated} value={n(batch.counts.activated)} />
        <StatCard label={dict.statuses.code.revoked} value={n(batch.counts.revoked)} hint={batch.counts.locked ? `${dict.statuses.code.locked}: ${n(batch.counts.locked)}` : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <PrinterIcon className="size-4" />
            {t.exports}
          </CardTitle>
          <CardDescription>{t.exportsBody}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`${apiBase}/registry`}>
                <FileSpreadsheetIcon />
                {t.registryCsv}
              </a>
            </Button>
            <span className="text-xs text-muted-foreground">{format(t.exportCount, { count: batch.exportCount })}</span>
          </div>
          {canExport ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ranges.map(([from, to]) => (
                <div key={from} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
                  <span className="me-auto text-sm font-medium tabular">{format(t.range, { from, to })}</span>
                  <Button asChild size="sm">
                    <a href={`${apiBase}/cards-pdf?from=${from}&to=${to}`}>
                      <FileDownIcon />
                      PDF
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`${apiBase}/printer-data?from=${from}&to=${to}`}>CSV</a>
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {batch.secretsPurgedAt ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlertIcon className="size-4" />
              {format(t.finalized, { date: formatDateTime(batch.secretsPurgedAt, locale) })}
            </p>
          ) : can(actor, "activation.batches.finalize") ? (
            <div>
              <ApiActionDialog
                label={t.finalize}
                title={t.finalize}
                description={t.finalizeConfirm}
                endpoint={`${apiBase}/finalize`}
                variant="destructive"
                common={dict.common}
                errors={dict.errors}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {can(actor, "activation.codes.read") ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end">
            <h2 className="me-auto font-semibold">{t.cards}</h2>
            <form className="flex flex-col gap-2 sm:flex-row" method="get">
              <NativeSelect name="status" defaultValue={status ?? ""} aria-label={t.filterStatus} className="h-10 sm:w-40">
                <option value="">{dict.common.all}</option>
                {ACTIVATION_CODE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </NativeSelect>
              <Input name="q" defaultValue={search ?? ""} placeholder={t.searchSerial} className="h-10 sm:w-56" dir="ltr" />
              <Button type="submit" size="sm" variant="secondary" className="h-10">
                {dict.common.search}
              </Button>
            </form>
          </div>
          {codes.items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t.columns.serial}</TableHead>
                  <TableHead>{t.columns.status}</TableHead>
                  <TableHead>{t.columns.sold}</TableHead>
                  <TableHead>{t.columns.activated}</TableHead>
                  <TableHead>{t.columns.by}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.items.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell>
                      <Link href={`/${locale}/admin/activation/cards/${code.id}`} className="font-mono font-semibold hover:underline" dir="ltr">
                        {code.serial}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CodeStatusBadge status={code.status} locked={!!code.lockedAt} labels={statusLabels} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(code.soldAt, locale)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(code.activatedAt, locale)}</TableCell>
                    <TableCell className="text-muted-foreground" dir="ltr">
                      {code.activatedByEmail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="px-3">
            <Pagination
              basePath={`/${locale}/admin/activation/${batch.id}`}
              query={{ status, q: search }}
              offset={offset}
              limit={PAGE_SIZE}
              total={codes.total}
              labels={{ previous: dict.common.previous, next: dict.common.next, of: dict.common.of }}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
