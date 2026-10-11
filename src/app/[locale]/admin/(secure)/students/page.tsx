import type { Metadata } from "next";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { Avatar } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelative } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { listStudents } from "@/modules/identity/admin-users.service";
import { requirePageActor } from "@/modules/identity/current";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.students.title };
}

const PAGE_SIZE = 50;

export default async function StudentsPage({
  searchParams,
}: PageProps<"/[locale]/admin/students">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "users.read" });
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : undefined;
  const access = query.access === "with" || query.access === "without" ? query.access : undefined;
  const offset = Math.max(0, Number(query.offset) || 0);
  const t = dict.admin.students;
  const { items, total } = await listStudents(actor, { search, access, limit: PAGE_SIZE, offset });

  return (
    <div>
      <PageHeader title={t.title} description={t.subtitle} />
      <Card className="overflow-hidden p-0">
        <form method="get" className="border-border flex flex-col gap-2 border-b p-4 sm:flex-row">
          <Input
            name="q"
            defaultValue={search ?? ""}
            placeholder={t.search}
            className="h-10 sm:max-w-sm"
          />
          <NativeSelect
            name="access"
            defaultValue={access ?? ""}
            aria-label={t.filterAccess}
            className="h-10 sm:w-48"
          >
            <option value="">{dict.common.all}</option>
            <option value="with">{t.withAccess}</option>
            <option value="without">{t.withoutAccess}</option>
          </NativeSelect>
          <Button type="submit" variant="secondary" size="sm" className="h-10">
            {dict.common.search}
          </Button>
        </form>
        {items.length === 0 ? (
          <EmptyState icon={<UsersIcon />} title={t.empty} className="m-4" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.columns.student}</TableHead>
                <TableHead>{t.columns.status}</TableHead>
                <TableHead>{t.columns.access}</TableHead>
                <TableHead>{t.columns.progress}</TableHead>
                <TableHead>{t.columns.joined}</TableHead>
                <TableHead>{t.columns.lastSeen}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <Link
                      href={`/${locale}/admin/students/${student.id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar
                        label={student.displayName ?? student.email}
                        className="size-8 text-[11px]"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium hover:underline">
                          {student.displayName ?? student.email.split("@")[0]}
                        </span>
                        <span className="text-muted-foreground block text-xs" dir="ltr">
                          {student.email}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={student.status === "active" ? "success" : "danger"}>
                      {dict.statuses.user[student.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {student.hasAccess ? (
                      <Badge variant="brand">{t.withAccess}</Badge>
                    ) : (
                      <Badge variant="muted">{t.withoutAccess}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular">
                    {student.progress === null ? "—" : `${student.progress}%`}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(student.createdAt, locale)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {student.lastSeenAt ? formatRelative(student.lastSeenAt, locale) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="px-3">
          <Pagination
            basePath={`/${locale}/admin/students`}
            query={{ q: search, access }}
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
