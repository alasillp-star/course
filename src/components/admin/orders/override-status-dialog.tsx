"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { api, ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { SHIPMENT_STATUSES, type ShipmentStatus } from "@/shared/enums";
import { orderErrorMessage } from "./errors";

export function OverrideStatusDialog({
  orderId,
  current,
  t,
  statusLabels,
  assignErrors,
  common,
  errors,
}: {
  orderId: string;
  current: ShipmentStatus;
  t: Dictionary["admin"]["orders"]["detail"];
  statusLabels: Record<ShipmentStatus, string>;
  assignErrors: Dictionary["admin"]["orders"]["assignErrors"];
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const options = SHIPMENT_STATUSES.filter((status) => status !== current);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ShipmentStatus>(options[0]!);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ cardsRelocked: number; cardsAlreadyActivated: number }>(
        `/api/v1/admin/orders/${orderId}/delivery-status`,
        { body: { status, reason: reason.trim() } },
      );
      toast.success(t.overrideDone);
      if (result.cardsRelocked > 0) toast.info(format(t.relocked, { count: result.cardsRelocked }));
      if (result.cardsAlreadyActivated > 0) {
        toast.warning(format(t.alreadyActivated, { count: result.cardsAlreadyActivated }));
      }
      setOpen(false);
      setReason("");
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ShieldAlertIcon />
          {t.override}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{t.overrideTitle}</DialogTitle>
          <DialogDescription>{t.overrideBody}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t.newStatus} htmlFor="override-status">
            <NativeSelect
              id="override-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as ShipmentStatus)}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {statusLabels[option]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t.reason} htmlFor="override-reason">
            <Textarea
              id="override-reason"
              required
              minLength={3}
              maxLength={500}
              placeholder={t.reasonPlaceholder}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {common.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
