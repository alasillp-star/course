import Link from "next/link";
import { ACADEMY } from "@/config/academy";
import { cn } from "@/lib/utils";

/*
 * Abdou Academy identity (brand pack "direction 02"). The symbol uses the
 * official paths and stroke from abdou_academy_logo_primary.svg; the wordmark
 * is live text in Inter 900 / 800, exactly as the official SVGs specify.
 * Colours: purple + lime loop with ink wordmark on light backgrounds; the
 * official inverse (white + lime, lime "ACADEMY") on purple and in dark mode.
 * Do not recolour or redraw — use these components or the files in /public/brand.
 */

const LOOP_A = "M 36 129 V 78 C 36 53 53 36 78 36 H 136";
const LOOP_B = "M 144 45 V 96 C 144 121 127 138 102 138 H 44";

/** The "learning loop" symbol alone. */
export function LogoMark({
  className,
  inverse,
}: {
  className?: string;
  /** White + lime (for purple or dark backgrounds). */
  inverse?: boolean;
}) {
  return (
    <svg viewBox="21 21 138 132" className={cn("size-8", className)} aria-hidden="true">
      <path
        d={LOOP_A}
        fill="none"
        strokeWidth="29"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={inverse ? "stroke-white" : "stroke-[#4b2af0] dark:stroke-white"}
      />
      <path
        d={LOOP_B}
        fill="none"
        stroke="#d6ff46"
        strokeWidth="29"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** App-icon tile (purple square with the inverse symbol), as in the avatar file. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <span
      className={cn("grid size-10 place-items-center rounded-[28%] bg-[#4b2af0]", className)}
      aria-hidden="true"
    >
      <LogoMark inverse className="size-[58%]" />
    </span>
  );
}

/** Primary lockup: symbol + "abdou" + letter-spaced "ACADEMY". */
export function Logo({
  href,
  className,
  inverted,
  size = "md",
}: {
  href: string;
  className?: string;
  /** On purple / dark surfaces. */
  inverted?: boolean;
  size?: "md" | "lg";
}) {
  const large = size === "lg";
  return (
    <Link
      href={href}
      dir="ltr"
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label={ACADEMY.shortName}
    >
      <LogoMark
        inverse={inverted}
        className={cn(
          "transition-transform duration-300 group-hover:-rotate-6",
          large ? "size-11" : "size-8",
        )}
      />
      <span className="grid leading-none">
        <span
          className={cn(
            "font-[family-name:var(--font-latin)] font-black tracking-[-0.05em]",
            large ? "text-[34px]" : "text-[23px]",
            inverted ? "text-white" : "text-[#1c1734] dark:text-white",
          )}
        >
          abdou
        </span>
        <span
          className={cn(
            "font-[family-name:var(--font-latin)] font-extrabold tracking-[0.42em] uppercase",
            large ? "mt-1 text-[10px]" : "mt-0.5 text-[7.5px]",
            inverted ? "text-[#d6ff46]" : "text-[#4b2af0] dark:text-[#d6ff46]",
          )}
        >
          Academy
        </span>
      </span>
    </Link>
  );
}
