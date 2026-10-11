import { ShieldCheckIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ACADEMY } from "@/config/academy";
import { getI18n } from "@/i18n/server";

export async function SiteFooter() {
  const { locale, dict } = await getI18n();
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-2">
          <Logo href={`/${locale}`} />
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {ACADEMY.name[locale]}. {dict.home.footer.rights}
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end">
          <a href={`mailto:${ACADEMY.supportEmail}`} className="font-medium text-foreground hover:underline">
            {ACADEMY.supportEmail}
          </a>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheckIcon className="size-4 text-success" />
            {dict.home.footer.secure}
          </span>
        </div>
      </div>
    </footer>
  );
}
