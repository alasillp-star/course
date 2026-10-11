import Link from "next/link";
import { ACADEMY } from "@/config/academy";
import { cn } from "@/lib/utils";

/** Monogram mark. Replace with the official artwork when available (src/config/academy.ts). */
export function LogoMark({ className }: { className?: string }) {
  // Solid fills only: SVG gradients referenced by id break when the same mark
  // is rendered twice and one copy is hidden (display:none).
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#0b132b" />
      <circle cx="20" cy="20" r="10.5" fill="none" stroke="#d9b45f" strokeWidth="3.2" />
      <path d="M20 6.5v6" stroke="#0b132b" strokeWidth="3.4" />
      <circle cx="20" cy="9.6" r="2.1" fill="#f0d58c" />
    </svg>
  );
}

export function Logo({ href, className, inverted }: { href: string; className?: string; inverted?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label={ACADEMY.shortName}>
      <LogoMark className="transition-transform duration-300 group-hover:rotate-[8deg]" />
      <span
        dir="ltr"
        className={cn("text-[15px] font-semibold tracking-tight", inverted ? "text-white" : "text-foreground")}
      >
        {ACADEMY.shortName.split(" ")[0]}
        <span className="text-gold-strong dark:text-gold"> {ACADEMY.shortName.split(" ").slice(1).join(" ")}</span>
      </span>
    </Link>
  );
}
