import { ShieldCheckIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ACADEMY } from "@/config/academy";
import { getI18n } from "@/i18n/server";

export async function SiteFooter() {
  const { locale, dict } = await getI18n();
  return (
    <footer className="border-border bg-card border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-2">
          <Logo href={`/${locale}`} />
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} {ACADEMY.name[locale]}. {dict.home.footer.rights}
          </p>
        </div>
        <div className="text-muted-foreground flex flex-col gap-2 text-sm sm:items-end">
          <a
            href={`mailto:${ACADEMY.supportEmail}`}
            className="text-foreground font-medium hover:underline"
          >
            {ACADEMY.supportEmail}
          </a>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheckIcon className="text-success size-4" />
            {dict.home.footer.secure}
          </span>
        </div>
      </div>
    </footer>
  );
}
