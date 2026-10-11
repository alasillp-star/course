"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api, ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { orderErrorMessage } from "./errors";

export function ShipmentForm({
  orderId,
  initial,
  t,
  assignErrors,
  errors,
}: {
  orderId: string;
  initial: { carrier: string; trackingNumber: string } | null;
  t: Dictionary["admin"]["orders"]["detail"];
  assignErrors: Dictionary["admin"]["orders"]["assignErrors"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [carrier, setCarrier] = useState(
    initial?.carrier && initial.carrier !== "unknown" ? initial.carrier : "",
  );
  const [trackingNumber, setTrackingNumber] = useState(initial?.trackingNumber ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/v1/admin/orders/${orderId}/shipment`, {
        method: "PUT",
        body: { carrier, trackingNumber },
      });
      toast.success(t.shipmentSaved);
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
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t.carrier} htmlFor="shipment-carrier">
        <Input
          id="shipment-carrier"
          className="h-10"
          placeholder={t.carrierPlaceholder}
          value={carrier}
          onChange={(event) => setCarrier(event.target.value)}
          required
          minLength={2}
          maxLength={60}
        />
      </Field>
      <Field label={t.tracking} htmlFor="shipment-tracking">
        <Input
          id="shipment-tracking"
          dir="ltr"
          className="h-10 font-mono uppercase"
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value.toUpperCase())}
          required
          minLength={3}
          maxLength={80}
        />
      </Field>
      <Button type="submit" variant="secondary" className="h-10" loading={pending}>
        {t.saveShipment}
      </Button>
      {error ? (
        <p className="text-destructive text-[13px] font-medium sm:col-span-3" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
