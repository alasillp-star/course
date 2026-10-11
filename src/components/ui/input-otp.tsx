"use client";

import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { cn } from "@/lib/utils";

/**
 * Six-cell one-time-code input. Always laid out left-to-right (digits), with
 * `autocomplete="one-time-code"` so iOS/Android can autofill from the e-mail.
 */
export function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput>) {
  return (
    <OTPInput
      autoComplete="one-time-code"
      inputMode="numeric"
      containerClassName={cn(
        "flex items-center justify-center gap-2 has-[:disabled]:opacity-50",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

export function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div dir="ltr" className={cn("flex items-center gap-2", className)} {...props} />;
}

export function InputOTPSlot({ index, className }: { index: number; className?: string }) {
  const context = React.useContext(OTPInputContext);
  const slot = context?.slots[index];
  return (
    <div
      data-active={slot?.isActive}
      className={cn(
        "border-input bg-card tabular relative flex size-12 items-center justify-center rounded-xl border text-xl font-semibold shadow-xs transition-all sm:size-14",
        "data-[active=true]:border-ring data-[active=true]:ring-ring/25 data-[active=true]:ring-[3px]",
        className,
      )}
    >
      {slot?.char}
      {slot?.hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="bg-foreground h-6 w-px animate-pulse" />
        </div>
      ) : null}
    </div>
  );
}
