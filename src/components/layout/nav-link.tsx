"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Exact match only (for index routes such as /app). */
  exact?: boolean;
  soonLabel?: string;
};

export function SidebarLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  if (item.soonLabel) {
    return (
      <span className="text-muted-foreground/60 flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium [&_svg]:size-[18px]">
        {item.icon}
        <span className="flex-1">{item.label}</span>
        <span className="bg-muted rounded-full px-2 py-0.5 text-[10px] font-semibold">
          {item.soonLabel}
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition [&_svg]:size-[18px]",
        active &&
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary hover:text-primary-foreground dark:bg-gold/15 dark:text-gold",
      )}
    >
      {item.icon}
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

export function BottomNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-muted-foreground flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium [&_svg]:size-5",
        active && "text-foreground [&_svg]:text-gold-strong dark:[&_svg]:text-gold",
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}
