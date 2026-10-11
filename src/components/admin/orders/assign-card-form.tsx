"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { api, ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { orderErrorMessage } from "./errors";

/** Serial field for packing a card: works with a USB/Bluetooth barcode scanner (types + Enter). */
export function AssignCardForm({
  orderId,
  t,
  assignErrors,
  errors,
}: {
  orderId: string;
  t: Dictionary["admin"]["orders"]["detail"];
  assignErrors: Dictionary["admin"]["orders"]["assignErrors"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [serial, setSerial] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ serial: string; unlocked: boolean }>(
        `/api/v1/admin/orders/${orderId}/cards`,
        { body: { serial: serial.trim() } },
      );
      toast.success(
        format(result.unlocked ? t.unlockedNow : t.assigned, { serial: result.serial }),
      );
      setSerial("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? orderErrorMessage(caught, assignErrors, errors)
          : errorMessage(caught, errors),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (serial.trim()) void submit();
      }}
    >
      <label htmlFor="assign-serial" className="text-sm font-medium">
        {t.serial}
      </label>
      <div className="flex gap-2">
        <Input
          id="assign-serial"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          className="h-10 font-mono uppercase"
          placeholder="B0001-00042"
          value={serial}
          onChange={(event) => setSerial(event.target.value.toUpperCase())}
          aria-invalid={!!error}
          aria-describedby={error ? "assign-serial-error" : undefined}
        />
        <Button type="submit" className="h-10 shrink-0" loading={pending} disabled={!serial.trim()}>
          <PackagePlusIcon />
          {t.assign}
        </Button>
      </div>
      {error ? (
        <p
          id="assign-serial-error"
          className="text-destructive text-[13px] font-medium"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
