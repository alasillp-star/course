import { ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getI18n } from "@/i18n/server";

export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const { locale, dict } = await getI18n();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="surface-hero relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <Logo href={`/${locale}`} inverted className="relative" />
        <div className="relative mt-auto max-w-md">
          <SparklesIcon className="text-lime size-6" />
          <p className="mt-4 text-3xl leading-snug font-bold">{dict.auth.sideTitle}</p>
          <p className="mt-3 text-white/70">{dict.auth.sideBody}</p>
          <p className="mt-10 inline-flex items-center gap-2 text-sm text-white/60">
            <ShieldCheckIcon className="text-lime size-4" />
            {dict.home.footer.secure}
          </p>
        </div>
      </aside>
      <div className="flex min-h-dvh flex-col">
        <div className="flex items-center justify-between px-4 py-4 sm:px-8">
          <Logo href={`/${locale}`} className="lg:invisible" />
          <div className="flex items-center gap-1">
            <LocaleSwitcher locale={locale} label={dict.common.language} />
            <ThemeToggle labels={dict.common.theme} />
          </div>
        </div>
        <main
          id="main"
          className="flex flex-1 items-start justify-center px-4 pt-4 pb-12 sm:items-center sm:px-8"
        >
          <div className="animate-fade-up w-full max-w-[440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
