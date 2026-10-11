import type { Metadata } from "next";
import { FileClockIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { queryAuditLog } from "@/modules/audit/audit-query.service";
import { requirePageActor } from "@/modules/identity/current";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.audit.title };
}

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "audit.read" });
  const query = await searchParams;
  const action = typeof query.action === "string" ? query.action : undefined;
  const actorEmail = typeof query.actor === "string" ? query.actor : undefined;
  const offset = Math.max(0, Number(query.offset) || 0);
  const t = dict.admin.audit;
  const { items, total } = await queryAuditLog(actor, { action, actorEmail, limit: PAGE_SIZE, offset });

  return (
    <div>
      <PageHeader title={t.title} description={t.subtitle} />
      <Card className="overflow-hidden p-0">
        <form method="get" className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row">
          <Input name="action" defaultValue={action ?? ""} placeholder={`${t.filterAction} (activation., auth.)`} className="h-10 sm:max-w-xs" dir="ltr" />
          <Input name="actor" defaultValue={actorEmail ?? ""} placeholder={t.filterActor} className="h-10 sm:max-w-xs" dir="ltr" />
          <Button type="submit" variant="secondary" size="sm" className="h-10">
            {dict.common.search}
          </Button>
        </form>
        {items.length === 0 ? (
          <EmptyState icon={<FileClockIcon />} title={t.empty} className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.columns.time}</TableHead>
                <TableHead>{t.columns.action}</TableHead>
                <TableHead>{t.columns.actor}</TableHead>
                <TableHead>{t.columns.target}</TableHead>
                <TableHead>{t.columns.ip}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id} className="align-top">
                  <TableCell className="text-muted-foreground">{formatDateTime(entry.occurredAt, locale)}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs" dir="ltr">
                      {entry.action}
                    </code>
                    {Object.keys(entry.metadata ?? {}).length > 0 ? (
                      <pre className="mt-1 max-w-md overflow-hidden text-[11px] whitespace-pre-wrap text-muted-foreground" dir="ltr">
                        {JSON.stringify(entry.metadata)}
                      </pre>
                    ) : null}
                  </TableCell>
                  <TableCell dir="ltr">{entry.actorEmail ?? t.system}</TableCell>
                  <TableCell className="text-xs text-muted-foreground" dir="ltr">
                    {entry.targetType ? `${entry.targetType}:${entry.targetId?.slice(0, 8) ?? ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" dir="ltr">
                    {entry.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="px-3">
          <Pagination
            basePath={`/${locale}/admin/audit`}
            query={{ action, actor: actorEmail }}
            offset={offset}
            limit={PAGE_SIZE}
            total={total}
            labels={{ previous: dict.common.previous, next: dict.common.next, of: dict.common.of }}
          />
        </div>
      </Card>
    </div>
  );
}
