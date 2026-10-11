import type { Metadata } from "next";
import { CheckIcon, MinusIcon } from "lucide-react";
import { ApiActionDialog } from "@/components/admin/api-action-dialog";
import { GrantRoleForm } from "@/components/admin/grant-role-form";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from "@/modules/access/catalog";
import { listStaff } from "@/modules/access/rbac.service";
import { requirePageActor } from "@/modules/identity/current";
import { getDb } from "@/server/db/client";
import { SYSTEM_ROLES, type SystemRole } from "@/shared/enums";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.staff.title };
}

export default async function StaffPage() {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "staff.read" });
  const staff = await listStaff(getDb(), actor);
  const t = dict.admin.staff;
  const staffRoles = SYSTEM_ROLES.filter((role) => role !== "student");
  const grantable = staffRoles.filter(
    (role) => can(actor, "roles.manage") || (role !== "super_admin" && role !== "admin"),
  );
  const label = (role: string) => dict.roles[role as SystemRole] ?? role;
  const modules = [...new Set(ALL_PERMISSIONS.map((permission) => permission.split(".")[0]))];

  return (
    <div className="grid gap-6">
      <PageHeader title={t.title} description={t.subtitle} />
      {can(actor, "staff.manage") ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.invite}</CardTitle>
            <CardDescription>{t.inviteBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <GrantRoleForm
              roles={grantable.map((role) => ({ key: role, label: label(role) }))}
              t={t}
              errors={dict.errors}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t.columns.member}</TableHead>
              <TableHead>{t.columns.roles}</TableHead>
              <TableHead>{t.columns.status}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((member) => (
              <TableRow key={member.userId}>
                <TableCell dir="ltr" className="font-medium">
                  {member.email}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {member.roles.map((role) => (
                      <span key={role} className="inline-flex items-center gap-1">
                        <Badge variant="brand">{label(role)}</Badge>
                        {can(actor, "staff.manage") &&
                        member.userId !== actor.userId &&
                        (grantable as readonly string[]).includes(role) ? (
                          <ApiActionDialog
                            label={t.revoke}
                            title={`${t.revoke}: ${label(role)}`}
                            endpoint="/api/v1/admin/staff/roles"
                            method="DELETE"
                            body={{ email: member.email, roleKey: role }}
                            size="sm"
                            variant="ghost"
                            common={dict.common}
                            errors={dict.errors}
                          />
                        ) : null}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={member.status === "active" ? "success" : "danger"}>
                    {dict.statuses.user[member.status as keyof typeof dict.statuses.user] ??
                      member.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle>{t.matrix}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t.permissions}</TableHead>
              {SYSTEM_ROLES.map((role) => (
                <TableHead key={role} className="text-center">
                  {label(role)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((module) => (
              <TableRow key={module}>
                <TableCell className="font-mono text-xs" dir="ltr">
                  {module}.*
                </TableCell>
                {SYSTEM_ROLES.map((role) => {
                  const granted = ROLE_PERMISSIONS[role].filter((permission) =>
                    permission.startsWith(`${module}.`),
                  ).length;
                  const totalInModule = ALL_PERMISSIONS.filter((permission) =>
                    permission.startsWith(`${module}.`),
                  ).length;
                  return (
                    <TableCell key={role} className="text-center">
                      {granted === 0 ? (
                        <MinusIcon className="text-muted-foreground/50 mx-auto size-4" />
                      ) : granted === totalInModule ? (
                        <CheckIcon className="text-success mx-auto size-4" />
                      ) : (
                        <span className="text-muted-foreground tabular text-xs">
                          {granted}/{totalInModule}
                        </span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
