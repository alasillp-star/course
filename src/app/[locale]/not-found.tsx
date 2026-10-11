import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { locale, dict } = await getI18n();
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <CompassIcon className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">{dict.notFound.title}</h1>
        <p className="mt-2 text-muted-foreground">{dict.notFound.body}</p>
        <Button asChild className="mt-6">
          <Link href={`/${locale}`}>{dict.notFound.home}</Link>
        </Button>
      </div>
    </main>
  );
}
