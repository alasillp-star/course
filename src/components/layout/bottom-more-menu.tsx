"use client";

import { EllipsisIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SidebarLink, type NavItem } from "./nav-link";

/** Last slot of the mobile bottom bar: the sections that do not fit, in a side sheet. */
export function BottomMoreMenu({
  items,
  label,
  closeLabel,
}: {
  items: NavItem[];
  label: string;
  closeLabel: string;
}) {
  const pathname = usePathname();
  const active = items.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-muted-foreground flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium [&_svg]:size-5",
            active && "text-foreground [&_svg]:text-highlight",
          )}
        >
          <EllipsisIcon />
          {label}
        </button>
      </SheetTrigger>
      <SheetContent closeLabel={closeLabel}>
        <SheetTitle className="px-3 text-base font-semibold">{label}</SheetTitle>
        <nav className="mt-2 grid gap-1" aria-label={label}>
          {items.map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
