"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOutIcon, SettingsIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "@/i18n/config";
import { api } from "@/lib/api-client";

export function initialsFrom(nameOrEmail: string): string {
  const base = nameOrEmail.split("@")[0] ?? nameOrEmail;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}

export function Avatar({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`from-gold-strong to-gold text-gold-foreground ring-background grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[13px] font-bold ring-2 ${className ?? ""}`}
      aria-hidden="true"
    >
      {initialsFrom(label)}
    </span>
  );
}

export function UserMenu({
  locale,
  email,
  isStaff,
  labels,
}: {
  locale: Locale;
  email: string;
  isStaff: boolean;
  labels: { settings: string; security: string; admin: string; signOut: string };
}) {
  const router = useRouter();
  async function signOut() {
    await api("/api/v1/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    router.replace(`/${locale}/login`);
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-visible:ring-ring/40 rounded-full outline-none focus-visible:ring-[3px]"
        aria-label={email}
      >
        <Avatar label={email} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate" dir="ltr">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/app/settings`}>
            <SettingsIcon />
            {labels.settings}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/${locale}/app/settings/security`}>
            <ShieldIcon />
            {labels.security}
          </Link>
        </DropdownMenuItem>
        {isStaff ? (
          <DropdownMenuItem asChild>
            <Link href={`/${locale}/admin`}>
              <ShieldCheckIcon />
              {labels.admin}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOutIcon />
          {labels.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
