import {
  AwardIcon,
  BookOpenIcon,
  HomeIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
  RadioIcon,
  SettingsIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { BottomNavLink, SidebarLink, type NavItem } from "@/components/layout/nav-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { getI18n } from "@/i18n/server";
import { requirePageActor } from "@/modules/identity/current";

export default async function StudentLayout({ children }: LayoutProps<"/[locale]/app">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { next: `/${locale}/app` });
  const t = dict.student.nav;
  const base = `/${locale}/app`;
  const items: NavItem[] = [
    { href: base, label: t.dashboard, icon: <HomeIcon />, exact: true },
    { href: `${base}/course`, label: t.course, icon: <BookOpenIcon /> },
    { href: `${base}/notes`, label: t.notes, icon: <NotebookPenIcon /> },
    {
      href: `${base}/community`,
      label: t.community,
      icon: <MessagesSquareIcon />,
      soonLabel: dict.common.soon,
    },
    { href: `${base}/live`, label: t.live, icon: <RadioIcon />, soonLabel: dict.common.soon },
    {
      href: `${base}/certificates`,
      label: t.certificates,
      icon: <AwardIcon />,
      soonLabel: dict.common.soon,
    },
    { href: `${base}/settings`, label: t.settings, icon: <SettingsIcon /> },
  ];
  const mobile = items.filter((item) => !item.soonLabel);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="border-border bg-card/70 sticky top-0 hidden h-dvh flex-col border-e p-4 backdrop-blur lg:flex">
        <Logo href={base} className="px-2 py-1" />
        <nav className="mt-6 grid gap-1" aria-label={dict.common.menu}>
          {items.map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </nav>
        <div className="border-border bg-background/60 mt-auto flex items-center justify-between gap-2 rounded-xl border p-2">
          <UserMenu
            locale={locale}
            email={actor.email}
            isStaff={actor.isStaff}
            labels={{
              settings: t.settings,
              security: t.security,
              admin: dict.common.admin,
              signOut: dict.common.signOut,
            }}
          />
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs" dir="ltr">
            {actor.email}
          </span>
        </div>
      </aside>
      <div className="flex min-h-dvh flex-col pb-20 lg:pb-0">
        <header className="border-border bg-background/80 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur-xl sm:px-6">
          <Logo href={base} className="lg:hidden" />
          <div className="ms-auto flex items-center gap-1">
            <LocaleSwitcher locale={locale} label={dict.common.language} />
            <ThemeToggle labels={dict.common.theme} />
            <div className="lg:hidden">
              <UserMenu
                locale={locale}
                email={actor.email}
                isStaff={actor.isStaff}
                labels={{
                  settings: t.settings,
                  security: t.security,
                  admin: dict.common.admin,
                  signOut: dict.common.signOut,
                }}
              />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
      <nav
        className="border-border bg-background/90 fixed inset-x-0 bottom-0 z-30 flex border-t px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label={dict.common.menu}
      >
        {mobile.map((item) => (
          <BottomNavLink key={item.href} item={item} />
        ))}
      </nav>
    </div>
  );
}
