import type * as React from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-border bg-card shadow-soft rounded-2xl border p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-[13px] font-medium">{label}</p>
        {icon ? (
          <span className="bg-muted text-foreground/80 rounded-lg p-2 [&_svg]:size-4">{icon}</span>
        ) : null}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">{value}</p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="bg-muted text-muted-foreground mb-3 rounded-2xl p-3 [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <p className="font-semibold">{title}</p>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
