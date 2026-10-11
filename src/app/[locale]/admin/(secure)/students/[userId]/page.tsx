import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { GrantAccessDialog } from "@/components/admin/grant-access-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { format, formatDate, formatDateTime, formatRelative, pickLocalized } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { listCourseOptions } from "@/modules/activation/batches.service";
import { getStudentDetail } from "@/modules/identity/admin-users.service";
import { requirePageActor } from "@/modules/identity/current";
import { isUuid } from "@/server/db/uuid";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.students.title };
}

export default async function StudentDetailPage({ params }: PageProps<"/[locale]/admin/students/[userId]">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "users.read" });
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  const student = await getStudentDetail(actor, userId).catch(() => null);
  if (!student) notFound();
  const t = dict.admin.students.detail;
  const courses = can(actor, "entitlements.grant") ? await listCourseOptions() : [];
  const apiBase = `/api/v1/admin/users/${student.id}`;

  return (
    <div className="grid gap-6">
      <PageHeader
        back={
          <Link href={`/${locale}/admin/students`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowRightIcon className="size-4 ltr:rotate-180" />
            {t.back}
          </Link>
        }
        title={student.displayName ?? student.email}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span dir="ltr">{student.email}</span>
            <Badge variant={student.status === "active" ? "success" : "danger"}>{dict.statuses.user[student.status]}</Badge>
            {student.roles
              .filter((role) => role !== "student")
              .map((role) => (
                <Badge key={role} variant="gold">
                  {dict.roles[role as keyof typeof dict.roles] ?? role}
                </Badge>
              ))}
          </span>
        }
        actions={
          <>
            {can(actor, "users.sessions.manage") ? (
              <ApiActionDialog
                label={t.signOutAll}
                title={t.signOutAll}
                endpoint={`${apiBase}/sessions`}
                method="DELETE"
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
            {can(actor, "users.suspend") && student.status === "active" && student.id !== actor.userId ? (
              <ApiActionDialog
                label={t.suspend}
                title={t.suspend}
                endpoint={`${apiBase}/suspend`}
                reason={{ label: t.suspendReason }}
                variant="destructive"
                common={dict.common}
                errors={dict.errors}
              />
            ) : null}
            {can(actor, "users.suspend") && student.status === "suspended" ? (
              <ApiActionDialog label={t.reactivate} title={t.reactivate} endpoint={`${apiBase}/reactivate`} variant="default" common={dict.common} errors={dict.errors} />
            ) : null}
          </>
        }
      />

      {student.status === "suspended" && student.suspendedAt ? (
        <p className="rounded-xl border border-destructive/25 bg-destructive/8 p-4 text-sm">
          {format(t.suspended, { date: formatDateTime(student.suspendedAt, locale), reason: student.suspendedReason ?? "" })}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.profile}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact label={dict.admin.students.columns.joined} value={formatDate(student.createdAt, locale)} />
            <Fact label={dict.admin.students.columns.lastSeen} value={student.lastSeenAt ? formatRelative(student.lastSeenAt, locale) : "—"} />
            <Fact label={t.fullName} value={student.fullName ?? "—"} />
            <Fact label={t.phone} value={student.phone ?? "—"} />
          </CardContent>
        </Card>

        {student.entitlements ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t.entitlements}</CardTitle>
              {can(actor, "entitlements.grant") ? (
                <GrantAccessDialog
                  userId={student.id}
                  courses={courses.map((course) => ({ id: course.id, title: pickLocalized(course.title, locale) || course.slug }))}
                  label={t.grantAccess}
                  noteLabel={t.grantNote}
                  courseLabel={dict.admin.batches.form.course}
                  common={dict.common}
                  errors={dict.errors}
                />
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-3">
              {student.entitlements.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noEntitlements}</p>
              ) : (
                student.entitlements.map((entitlement) => (
                  <div key={entitlement.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
                    <span className="me-auto font-medium">{pickLocalized(entitlement.courseTitle, locale)}</span>
                    <Badge variant={entitlement.status === "active" ? "success" : "muted"}>{dict.statuses.entitlement[entitlement.status]}</Badge>
                    <Badge variant="outline">{dict.statuses.source[entitlement.source]}</Badge>
                    <span className="w-full text-xs text-muted-foreground">
                      {formatDate(entitlement.startsAt, locale)} → {entitlement.expiresAt ? formatDate(entitlement.expiresAt, locale) : dict.student.dashboard.lifetime}
                    </span>
                    {entitlement.status === "active" && can(actor, "entitlements.revoke") ? (
                      <ApiActionDialog
                        label={t.revokeAccess}
                        title={t.revokeAccess}
                        endpoint={`/api/v1/admin/entitlements/${entitlement.id}/revoke`}
                        reason={{ label: dict.admin.card.reason }}
                        variant="destructive"
                        common={dict.common}
                        errors={dict.errors}
                      />
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        {student.sessions ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.sessions}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {student.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noSessions}</p>
              ) : (
                student.sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                    <span dir="ltr">{session.deviceLabel ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(session.lastSeenAt, locale)}
                      {session.ipAddress ? <span dir="ltr"> · {session.ipAddress}</span> : null}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        {student.cards ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.cards}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {student.cards.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                student.cards.map((card) => (
                  <Link key={card.id} href={`/${locale}/admin/activation/cards/${card.id}`} className="flex justify-between rounded-xl border border-border p-3 hover:bg-muted/50">
                    <span className="font-mono" dir="ltr">
                      {card.serial}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(card.activatedAt, locale)}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}

        {student.progress ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.progress}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {student.progress.length === 0 ? (
                <p className="text-sm text-muted-foreground">0%</p>
              ) : (
                student.progress.map((row) => (
                  <div key={row.courseId} className="grid gap-1.5 text-sm">
                    <div className="flex justify-between">
                      <span>{pickLocalized(row.courseTitle, locale)}</span>
                      <span className="font-semibold tabular">{row.percentComplete}%</span>
                    </div>
                    <Progress value={row.percentComplete} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
