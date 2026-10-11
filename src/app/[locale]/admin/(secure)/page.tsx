import type { Metadata } from "next";
import Link from "next/link";
import {
  ActivityIcon,
  BadgeCheckIcon,
  CreditCardIcon,
  GraduationCapIcon,
  LockIcon,
  MessagesSquareIcon,
  PercentIcon,
  PlusIcon,
  SearchIcon,
  ShoppingCartIcon,
  UserPlusIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatMoney, formatNumber, formatPercent } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { can } from "@/modules/access/actor";
import { requirePageActor } from "@/modules/identity/current";
import { getOverviewMetrics } from "@/modules/reports/overview.service";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.overview.title };
}

export default async function AdminOverviewPage() {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, next: `/${locale}/admin` });
  const t = dict.admin.overview;
  const n = (value: number) => formatNumber(value, locale);
  const metrics = can(actor, "reports.read") ? await getOverviewMetrics(actor) : null;

  const quickActions = [
    can(actor, "activation.batches.create") && {
      href: `/${locale}/admin/activation?new=1`,
      label: t.newBatch,
      icon: <PlusIcon />,
    },
    can(actor, "activation.codes.sell") && {
      href: `/${locale}/admin/activation?sell=1`,
      label: t.sellCards,
      icon: <ShoppingCartIcon />,
    },
    can(actor, "users.read") && {
      href: `/${locale}/admin/students`,
      label: t.findStudent,
      icon: <SearchIcon />,
    },
  ].filter(Boolean) as Array<{ href: string; label: string; icon: React.ReactNode }>;

  return (
    <div>
      <PageHeader title={t.title} description={t.subtitle} />
      {metrics ? (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t.students} value={n(metrics.students.total)} icon={<UsersIcon />} />
            <StatCard
              label={t.active30d}
              value={n(metrics.students.active30d)}
              icon={<ActivityIcon />}
            />
            <StatCard label={t.new7d} value={n(metrics.students.new7d)} icon={<UserPlusIcon />} />
            <StatCard
              label={t.withAccess}
              value={n(metrics.students.withAccess)}
              icon={<BadgeCheckIcon />}
            />
            <StatCard
              label={t.cardsIssued}
              value={n(metrics.activation.issued)}
              icon={<CreditCardIcon />}
            />
            <StatCard
              label={t.activationRate}
              value={formatPercent(metrics.activation.activationRate, locale)}
              hint={t.activationRateHint}
              icon={<PercentIcon />}
            />
            <StatCard
              label={t.completion}
              value={
                metrics.learning.averageCompletion === null
                  ? "—"
                  : `${metrics.learning.averageCompletion}%`
              }
              icon={<GraduationCapIcon />}
            />
            {metrics.sales ? (
              <StatCard
                label={t.revenue}
                value={formatMoney(metrics.sales.revenueMinor, metrics.sales.currency, locale)}
                hint={`${t.paidOrders}: ${n(metrics.sales.paidOrders)}`}
                icon={<WalletIcon />}
              />
            ) : (
              <StatCard
                label={t.communityPosts}
                value={n(metrics.community.posts30d)}
                icon={<MessagesSquareIcon />}
              />
            )}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>{t.cardFunnel}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {(
                  [
                    ["available", metrics.activation.available],
                    ["sold", metrics.activation.sold],
                    ["activated", metrics.activation.activated],
                    ["revoked", metrics.activation.revoked],
                  ] as const
                ).map(([status, value]) => {
                  const share =
                    metrics.activation.issued > 0 ? (value / metrics.activation.issued) * 100 : 0;
                  return (
                    <div key={status} className="grid gap-1.5">
                      <div className="flex justify-between text-sm">
                        <span>{dict.statuses.code[status]}</span>
                        <span className="tabular font-semibold">{n(value)}</span>
                      </div>
                      <div className="bg-muted h-2 overflow-hidden rounded-full">
                        <div
                          className={
                            status === "activated"
                              ? "bg-success h-full rounded-full"
                              : status === "sold"
                                ? "bg-lime h-full rounded-full"
                                : status === "revoked"
                                  ? "bg-destructive/70 h-full rounded-full"
                                  : "bg-primary/70 h-full rounded-full"
                          }
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="border-border text-muted-foreground flex flex-wrap gap-4 border-t pt-4 text-sm">
                  <span>
                    {t.activated7d}:{" "}
                    <strong className="text-foreground tabular">
                      {n(metrics.activation.activated7d)}
                    </strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <LockIcon className="size-3.5" />
                    {t.lockedCards}:{" "}
                    <strong className="text-foreground tabular">
                      {n(metrics.activation.locked)}
                    </strong>
                  </span>
                </div>
              </CardContent>
            </Card>
            <QuickActions title={t.quickActions} actions={quickActions} />
          </div>
        </div>
      ) : (
        <QuickActions title={t.quickActions} actions={quickActions} />
      )}
    </div>
  );
}

function QuickActions({
  title,
  actions,
}: {
  title: string;
  actions: Array<{ href: string; label: string; icon: React.ReactNode }>;
}) {
  if (actions.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {actions.map((action) => (
          <Button key={action.href} asChild variant="outline" className="justify-start">
            <Link href={action.href}>
              {action.icon}
              {action.label}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
