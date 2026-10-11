import type { Metadata } from "next";
import Link from "next/link";
import { MailWarningIcon, SmartphoneIcon, InboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACADEMY } from "@/config/academy";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.recover.title };
}

export default async function RecoverPage() {
  const { locale, dict } = await getI18n();
  const t = dict.recover;
  const items = [
    { icon: SmartphoneIcon, title: t.lostPhoneTitle, body: t.lostPhoneBody },
    { icon: InboxIcon, title: t.noCodeTitle, body: t.noCodeBody },
    { icon: MailWarningIcon, title: t.lostEmailTitle, body: t.lostEmailBody },
  ];
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.title}</h1>
      <p className="text-muted-foreground mt-2">{t.subtitle}</p>
      <div className="mt-8 grid gap-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="border-border bg-card shadow-soft flex gap-4 rounded-2xl border p-5"
          >
            <item.icon className="text-highlight mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{item.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        <Button asChild>
          <a href={`mailto:${ACADEMY.supportEmail}`}>{t.contact}</a>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${locale}/login`}>{t.backToLogin}</Link>
        </Button>
      </div>
    </div>
  );
}
