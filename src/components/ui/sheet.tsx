"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;

/** Side panel that opens from the inline-start edge (right in Arabic, left in French). */
export function SheetContent({
  className,
  children,
  closeLabel = "Close",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { closeLabel?: string }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-black/45" />
      <SheetPrimitive.Content
        className={cn(
          "border-border bg-background shadow-lifted fixed inset-y-0 start-0 z-50 flex w-[86%] max-w-xs flex-col gap-4 border-e p-5 outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out ltr:data-[state=open]:slide-in-from-left rtl:data-[state=open]:slide-in-from-right ltr:data-[state=closed]:slide-out-to-left rtl:data-[state=closed]:slide-out-to-right",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="text-muted-foreground hover:bg-muted absolute end-3 top-3 rounded-md p-1.5">
          <XIcon className="size-4" />
          <span className="sr-only">{closeLabel}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
