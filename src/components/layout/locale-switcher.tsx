"use client";

import { LanguagesIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ENABLED_LOCALES, LOCALE_COOKIE, LOCALE_LABELS, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({
  locale,
  label,
  className,
  variant = "ghost",
}: {
  locale: Locale;
  label: string;
  className?: string;
  variant?: "ghost" | "glass";
}) {
  const pathname = usePathname();
  const switchTo = (next: Locale) => switchLocale(next, pathname);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="icon" className={className} aria-label={label}>
          <LanguagesIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {ENABLED_LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => code !== locale && switchTo(code)}
            className={cn(code === locale && "font-semibold")}
            lang={code}
          >
            {LOCALE_LABELS[code]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Remembers the choice and performs a full navigation so <html lang/dir>,
 * fonts and server-rendered content all switch together.
 */
function switchLocale(next: Locale, pathname: string) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  const rest = pathname.replace(/^\/(ar|fr|en)(?=\/|$)/, "");
  const target = new URL(
    `/${next}${rest}${window.location.search}${window.location.hash}`,
    window.location.origin,
  );
  window.location.href = target.toString();
}
