import type { Metadata } from "next";
import Link from "next/link";
import { ShieldOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.forbidden.title, robots: { index: false } };
}

export default async function ForbiddenPage() {
  const { locale, dict } = await getI18n();
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <ShieldOffIcon className="text-muted-foreground mx-auto size-12" />
        <h1 className="mt-4 text-2xl font-bold">{dict.forbidden.title}</h1>
        <p className="text-muted-foreground mt-2">{dict.forbidden.body}</p>
        <Button asChild className="mt-6">
          <Link href={`/${locale}/app`}>{dict.forbidden.home}</Link>
        </Button>
      </div>
    </main>
  );
}
