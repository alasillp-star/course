import { cn } from "@/lib/utils";

/** Accessible progress bar (server-renderable). */
export function Progress({
  value,
  className,
  indicatorClassName,
  label,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
      className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-full", className)}
    >
      <div
        className={cn(
          "from-gold-strong to-gold h-full rounded-full bg-gradient-to-r transition-[width] duration-700 rtl:bg-gradient-to-l",
          indicatorClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
