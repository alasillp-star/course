import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, ShieldIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailChangeForm } from "@/components/student/email-change-form";
import { formatDate } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { findUserById } from "@/modules/identity/users.service";
import { isRecentlyAuthenticated, requirePageActor } from "@/modules/identity/current";
import { getDb } from "@/server/db/client";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.student.settings.title };
}

export default async function SettingsPage() {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { next: `/${locale}/app/settings` });
  const user = await findUserById(getDb(), actor.userId);
  const t = dict.student.settings;
  const recentlyAuthenticated = isRecentlyAuthenticated(actor);

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t.account}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">{t.email}</p>
            <p className="font-medium" dir="ltr">
              {actor.email}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{t.memberSince}</p>
            <p className="font-medium">
              {formatDate(user?.createdAt, locale, { dateStyle: "long" })}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.changeEmail}</CardTitle>
          <CardDescription>{t.changeEmailBody}</CardDescription>
        </CardHeader>
        <CardContent>
          {recentlyAuthenticated ? (
            <EmailChangeForm t={t} errors={dict.errors} />
          ) : (
            <Alert variant="info">
              <AlertDescription className="text-foreground col-start-1">
                {t.reauth}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <Link
        href={`/${locale}/app/settings/security`}
        className="border-border bg-card shadow-soft hover:bg-muted/40 flex items-center gap-4 rounded-2xl border p-5 transition"
      >
        <ShieldIcon className="text-gold-strong dark:text-gold size-5" />
        <div className="flex-1">
          <p className="font-semibold">{dict.student.security.title}</p>
          <p className="text-muted-foreground text-sm">{dict.student.security.subtitle}</p>
        </div>
        <ChevronRightIcon className="text-muted-foreground size-4 rtl:rotate-180" />
      </Link>
    </div>
  );
}
