import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-card text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex h-11 w-full min-w-0 rounded-lg border px-3.5 text-[15px] shadow-xs transition-[border-color,box-shadow] outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive flex min-h-24 w-full rounded-lg border px-3.5 py-2.5 text-[15px] shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/25 flex h-11 w-full rounded-lg border px-3 text-[15px] shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
