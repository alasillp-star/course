import type { Metadata } from "next";
import { ActivationFlow } from "@/components/auth/activation-flow";
import { ACADEMY } from "@/config/academy";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.activation.title, robots: { index: false }, referrer: "no-referrer" };
}

export default async function ActivatePage() {
  const { locale, dict } = await getI18n();
  return (
    <ActivationFlow
      locale={locale}
      t={dict.activation}
      errors={dict.errors}
      supportEmail={ACADEMY.supportEmail}
      signInLabel={dict.common.signIn}
    />
  );
}
