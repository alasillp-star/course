import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheckIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { MfaFlow } from "@/components/admin/mfa-flow";
import { getI18n } from "@/i18n/server";
import { requirePageActor } from "@/modules/identity/current";
import { hasConfirmedMfa } from "@/modules/identity/mfa.service";
import { getDb } from "@/server/db/client";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.admin.mfa.title, robots: { index: false } };
}

export default async function MfaPage() {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { next: `/${locale}/admin` });
  if (!actor.isStaff) redirect(`/${locale}/forbidden`);
  if (actor.mfaVerified) redirect(`/${locale}/admin`);
  const enrolled = await hasConfirmedMfa(getDb(), actor.userId);
  const t = dict.admin.mfa;
  return (
    <div className="surface-hero flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <main id="main" className="w-full max-w-md animate-fade-up rounded-3xl border border-border bg-background p-6 shadow-lifted sm:p-8">
        <Logo href={`/${locale}`} />
        <div className="mt-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold-strong dark:text-gold">
            <ShieldCheckIcon className="size-5" />
          </span>
          <h1 className="text-xl font-bold">{enrolled ? t.verifyTitle : t.enrollTitle}</h1>
        </div>
        <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
          {actor.email}
        </p>
        <div className="mt-6">
          <MfaFlow enrolled={enrolled} redirectTo={`/${locale}/admin`} t={t} common={dict.common} errors={dict.errors} />
        </div>
      </main>
    </div>
  );
}
