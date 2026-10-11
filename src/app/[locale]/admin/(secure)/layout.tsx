import {
  BarChart3Icon,
  BookOpenIcon,
  CreditCardIcon,
  FileClockIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MessagesSquareIcon,
  RadioIcon,
  SettingsIcon,
  ShoppingBagIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { SidebarLink, type NavItem } from "@/components/layout/nav-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getI18n } from "@/i18n/server";
import { can, canAny } from "@/modules/access/actor";
import { requirePageActor } from "@/modules/identity/current";

export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const { locale, dict } = await getI18n();
  const actor = await requirePageActor(locale, { adminArea: true, next: `/${locale}/admin` });
  const t = dict.admin.nav;
  const soon = dict.common.soon;
  const base = `/${locale}/admin`;

  const items: Array<NavItem & { visible: boolean }> = [
    { href: base, label: t.overview, icon: <LayoutDashboardIcon />, exact: true, visible: true },
    {
      href: `${base}/students`,
      label: t.students,
      icon: <UsersIcon />,
      visible: can(actor, "users.read"),
    },
    {
      href: `${base}/activation`,
      label: t.activation,
      icon: <CreditCardIcon />,
      visible: canAny(actor, ["activation.batches.read", "activation.codes.read"]),
    },
    {
      href: `${base}/orders`,
      label: t.sales,
      icon: <ShoppingBagIcon />,
      visible: can(actor, "orders.read"),
    },
    {
      href: `${base}/content`,
      label: t.content,
      icon: <BookOpenIcon />,
      visible: can(actor, "content.read"),
    },
    {
      href: `${base}/community`,
      label: t.community,
      icon: <MessagesSquareIcon />,
      soonLabel: soon,
      visible: can(actor, "community.moderate"),
    },
    {
      href: `${base}/live`,
      label: t.live,
      icon: <RadioIcon />,
      soonLabel: soon,
      visible: can(actor, "live.manage"),
    },
    {
      href: `${base}/reports`,
      label: t.reports,
      icon: <BarChart3Icon />,
      soonLabel: soon,
      visible: can(actor, "reports.read"),
    },
    {
      href: `${base}/staff`,
      label: t.staff,
      icon: <UserCogIcon />,
      visible: can(actor, "staff.read"),
    },
    {
      href: `${base}/audit`,
      label: t.audit,
      icon: <FileClockIcon />,
      visible: can(actor, "audit.read"),
    },
    {
      href: `${base}/settings`,
      label: t.settings,
      icon: <SettingsIcon />,
      soonLabel: soon,
      visible: can(actor, "settings.read"),
    },
  ];
  const nav = items.filter((item) => item.visible);
  const roleLabels = actor.roles
    .filter((role) => role !== "student")
    .map((role) => dict.roles[role as keyof typeof dict.roles] ?? role);

  const navList = (
    <nav className="grid gap-1" aria-label={dict.admin.title}>
      {nav.map((item) => (
        <SidebarLink key={item.href} item={item} />
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="border-border bg-card/70 sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-e p-4 backdrop-blur lg:flex">
        <div className="px-2 pt-1">
          <Logo href={base} />
          <p className="text-muted-foreground mt-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
            {dict.admin.title}
          </p>
        </div>
        {navList}
        <Link
          href={`/${locale}`}
          className="text-muted-foreground hover:text-foreground mt-auto px-3 text-xs"
        >
          {t.backToSite}
        </Link>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="border-border bg-background/80 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur-xl sm:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={dict.common.menu}
              >
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent closeLabel={dict.common.close}>
              <SheetTitle className="sr-only">{dict.admin.title}</SheetTitle>
              <Logo href={base} />
              <div className="mt-2">{navList}</div>
            </SheetContent>
          </Sheet>
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            {roleLabels.map((label) => (
              <Badge key={label} variant="brand">
                {label}
              </Badge>
            ))}
          </div>
          <div className="ms-auto flex items-center gap-1">
            <LocaleSwitcher locale={locale} label={dict.common.language} />
            <ThemeToggle labels={dict.common.theme} />
            <UserMenu
              locale={locale}
              email={actor.email}
              isStaff
              labels={{
                settings: dict.student.nav.settings,
                security: dict.student.nav.security,
                admin: dict.common.admin,
                signOut: dict.common.signOut,
              }}
            />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
