import type { Metadata } from "next";
import Link from "next/link";
import { CreditCardIcon } from "lucide-react";
import { CreateBatchDialog } from "@/components/admin/create-batch-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { SellCardsDialog } from "@/components/admin/sell-cards-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber, pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { listBatches, listCourseOptions } from "@/modules/activation/batches.service";
import { requirePageActor } from "@/modules/identity/current";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.batches.title };
}

export default async function ActivationBatchesPage({ searchParams }: PageProps<"/[locale]/admin/activation">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "activation.batches.read" });
  const params = await searchParams;
  const t = dict.admin.batches;
  const [batches, courses] = await Promise.all([listBatches(actor, { limit: 100 }), listCourseOptions()]);
  const n = (value: number) => formatNumber(value, locale);

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.subtitle}
        actions={
          <>
            {can(actor, "activation.codes.sell") ? (
              <SellCardsDialog t={t.sell} triggerLabel={t.sellCards} common={dict.common} errors={dict.errors} defaultOpen={params.sell === "1"} />
            ) : null}
            {can(actor, "activation.batches.create") ? (
              <CreateBatchDialog
                locale={locale}
                courses={courses.map((course) => ({ id: course.id, title: pickLocalized(course.title, locale) || course.slug }))}
                t={t.form}
                triggerLabel={t.newBatch}
                common={dict.common}
                errors={dict.errors}
                defaultOpen={params.new === "1"}
              />
            ) : null}
          </>
        }
      />
      {batches.length === 0 ? (
        <EmptyState icon={<CreditCardIcon />} title={t.empty} />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.columns.batch}</TableHead>
                <TableHead>{t.columns.quantity}</TableHead>
                <TableHead>{t.columns.available}</TableHead>
                <TableHead>{t.columns.sold}</TableHead>
                <TableHead>{t.columns.activated}</TableHead>
                <TableHead>{t.columns.revoked}</TableHead>
                <TableHead>{t.columns.secrets}</TableHead>
                <TableHead>{t.columns.created}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id}>
                  <TableCell>
                    <Link href={`/${locale}/admin/activation/${batch.id}`} className="font-semibold hover:underline">
                      {batch.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {batch.serialPrefix}
                    </p>
                  </TableCell>
                  <TableCell className="tabular">{n(batch.counts.total)}</TableCell>
                  <TableCell className="tabular">{n(batch.counts.available)}</TableCell>
                  <TableCell className="tabular">{n(batch.counts.sold)}</TableCell>
                  <TableCell className="font-semibold text-success tabular">{n(batch.counts.activated)}</TableCell>
                  <TableCell className="tabular">{n(batch.counts.revoked)}</TableCell>
                  <TableCell>
                    {batch.secretsPurgedAt ? <Badge variant="muted">{t.secretsPurged}</Badge> : <Badge variant="warning">{t.secretsActive}</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(batch.createdAt, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
