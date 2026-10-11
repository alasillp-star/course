import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getCurrentActor } from "@/modules/identity/current";
import { getI18n } from "@/i18n/server";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader() {
  const { locale, dict } = await getI18n();
  const actor = await getCurrentActor();
  const nav = [
    { href: `/${locale}#how`, label: dict.nav.howItWorks },
    { href: `/${locale}#curriculum`, label: dict.nav.course },
    { href: `/${locale}#faq`, label: dict.nav.faq },
  ];
  const home = actor ? (actor.isStaff ? `/${locale}/admin` : `/${locale}/app`) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[oklch(0.18_0.045_268/0.97)] text-white backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo href={`/${locale}`} inverted />
        <nav className="ms-6 hidden items-center gap-1 md:flex" aria-label="Main">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <LocaleSwitcher
            locale={locale}
            label={dict.common.language}
            variant="glass"
            className="hidden sm:inline-flex"
          />
          <ThemeToggle
            labels={dict.common.theme}
            variant="glass"
            className="hidden sm:inline-flex"
          />
          {home ? (
            <Button asChild variant="gold" size="sm" className="ms-1">
              <Link href={home}>{actor?.isStaff ? dict.common.admin : dict.common.dashboard}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="glass" size="sm" className="hidden sm:inline-flex">
                <Link href={`/${locale}/login`}>{dict.common.signIn}</Link>
              </Button>
              <Button asChild variant="gold" size="sm">
                <Link href={`/${locale}/activate`}>{dict.common.activateCard}</Link>
              </Button>
            </>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="glass"
                size="icon"
                className="md:hidden"
                aria-label={dict.common.menu}
              >
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent closeLabel={dict.common.close}>
              <SheetTitle className="sr-only">{dict.common.menu}</SheetTitle>
              <Logo href={`/${locale}`} />
              <nav className="mt-4 grid gap-1">
                {nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="hover:bg-muted rounded-lg px-3 py-3 text-[15px] font-medium"
                  >
                    {item.label}
                  </a>
                ))}
                {!home ? (
                  <Link
                    href={`/${locale}/login`}
                    className="hover:bg-muted rounded-lg px-3 py-3 text-[15px] font-medium"
                  >
                    {dict.common.signIn}
                  </Link>
                ) : null}
              </nav>
              <div className="mt-auto flex items-center gap-2">
                <LocaleSwitcher locale={locale} label={dict.common.language} />
                <ThemeToggle labels={dict.common.theme} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
