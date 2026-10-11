"use client";

import type * as React from "react";
import { Direction } from "radix-ui";
import { Toaster } from "@/components/ui/toaster";

/** Client-side providers: reading direction for Radix primitives + toasts. */
export function Providers({ dir, children }: { dir: "rtl" | "ltr"; children: React.ReactNode }) {
  return (
    <Direction.Provider dir={dir}>
      {children}
      <Toaster dir={dir} />
    </Direction.Provider>
  );
}
