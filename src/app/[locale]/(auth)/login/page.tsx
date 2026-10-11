import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getI18n } from "@/i18n/server";
import { getCurrentActor } from "@/modules/identity/current";
import { safeRedirectPath } from "@/server/http/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.auth.login.title, robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const { locale, dict } = await getI18n();
  const params = await searchParams;
  const nextParam = typeof params.next === "string" ? params.next : undefined;
  const actor = await getCurrentActor();
  if (actor) {
    redirect(safeRedirectPath(nextParam, actor.isStaff ? `/${locale}/admin` : `/${locale}/app`));
  }
  const t = dict.auth.login;
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.title}</h1>
      <p className="mt-2 text-muted-foreground">{t.subtitle}</p>
      <div className="mt-8">
        <LoginForm locale={locale} next={nextParam} t={t} errors={dict.errors} />
      </div>
      <div className="mt-10 rounded-2xl border border-border bg-card p-4 text-sm">
        <span className="text-muted-foreground">{t.noAccount} </span>
        <Link href={`/${locale}/activate`} className="font-semibold underline-offset-4 hover:underline">
          {t.activateLink}
        </Link>
      </div>
    </div>
  );
}
