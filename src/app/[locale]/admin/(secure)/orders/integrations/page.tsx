import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, CircleDashedIcon } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getIntegrationStatus } from "@/modules/commerce/orders.service";
import { requirePageActor } from "@/modules/identity/current";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.orders.integration.title };
}

export default async function IntegrationsPage() {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, permission: "orders.manage" });
  const status = await getIntegrationStatus(actor);
  const t = dict.admin.orders.integration;
  const endpoints = [
    {
      label: t.orders,
      url: status.ordersEndpoint,
      configured: status.ordersConfigured,
      signed: false,
    },
    {
      label: t.delivery,
      url: status.deliveryEndpoint,
      configured: status.deliveryConfigured,
      signed: status.deliverySigned,
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        back={
          <Link
            href={`/${locale}/admin/orders`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowRightIcon className="size-4 ltr:rotate-180" />
            {dict.admin.orders.detail.back}
          </Link>
        }
        title={t.title}
        description={t.body}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {endpoints.map((endpoint) => (
          <Card key={endpoint.label}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {endpoint.configured ? (
                  <CheckCircle2Icon className="text-success size-5" />
                ) : (
                  <CircleDashedIcon className="text-muted-foreground size-5" />
                )}
                {endpoint.label}
              </CardTitle>
              <CardDescription className="flex flex-wrap gap-2">
                <Badge variant={endpoint.configured ? "success" : "muted"}>
                  {endpoint.configured ? t.configured : t.notConfigured}
                </Badge>
                {endpoint.signed ? <Badge variant="brand">{t.signed}</Badge> : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <code
                dir="ltr"
                className="bg-muted block overflow-x-auto rounded-lg px-3 py-2 font-mono text-xs"
              >
                POST {endpoint.url}
              </code>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.recent}</CardTitle>
        </CardHeader>
        <CardContent>
          {status.recent.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.none}</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {status.recent.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">
                    {t.sources[event.source as keyof typeof t.sources] ?? event.source}
                  </span>
                  <Badge
                    variant={
                      event.status === "processed"
                        ? "success"
                        : event.status === "failed"
                          ? "danger"
                          : "muted"
                    }
                  >
                    {t.statuses[event.status]}
                  </Badge>
                  {event.error ? (
                    <span className="text-muted-foreground font-mono text-xs" dir="ltr">
                      {event.error}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground ms-auto text-xs">
                    {formatDateTime(event.receivedAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
