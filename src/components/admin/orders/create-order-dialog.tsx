"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

const EMPTY = {
  fullName: "",
  phone: "",
  email: "",
  region: "",
  city: "",
  address: "",
  quantity: "1",
  total: "",
  product: "",
  notes: "",
  carrier: "",
  trackingNumber: "",
};

export function CreateOrderDialog({
  locale,
  t,
  detail,
  triggerLabel,
  common,
  errors,
}: {
  locale: string;
  t: Dictionary["admin"]["orders"]["form"];
  detail: Dictionary["admin"]["orders"]["detail"];
  triggerLabel: string;
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ orderId: string; orderNumber: string }>("/api/v1/admin/orders", {
        body: { ...values, quantity: Number(values.quantity) || 1 },
      });
      toast.success(format(t.created, { number: result.orderNumber }));
      setOpen(false);
      setValues(EMPTY);
      router.push(`/${locale}/admin/orders/${result.orderId}`);
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t.fullName} htmlFor="order-name">
            <Input
              id="order-name"
              required
              minLength={2}
              maxLength={200}
              value={values.fullName}
              onChange={set("fullName")}
            />
          </Field>
          <Field label={t.phone} htmlFor="order-phone">
            <Input
              id="order-phone"
              type="tel"
              dir="ltr"
              maxLength={40}
              value={values.phone}
              onChange={set("phone")}
            />
          </Field>
          <Field label={t.region} htmlFor="order-region">
            <Input
              id="order-region"
              maxLength={120}
              value={values.region}
              onChange={set("region")}
            />
          </Field>
          <Field label={t.city} htmlFor="order-city">
            <Input id="order-city" maxLength={120} value={values.city} onChange={set("city")} />
          </Field>
          <Field label={t.address} htmlFor="order-address" className="sm:col-span-2">
            <Input
              id="order-address"
              maxLength={500}
              value={values.address}
              onChange={set("address")}
            />
          </Field>
          <Field label={t.quantity} htmlFor="order-quantity">
            <Input
              id="order-quantity"
              type="number"
              min={1}
              max={20}
              required
              value={values.quantity}
              onChange={set("quantity")}
            />
          </Field>
          <Field label={t.total} htmlFor="order-total">
            <Input
              id="order-total"
              inputMode="decimal"
              dir="ltr"
              maxLength={20}
              value={values.total}
              onChange={set("total")}
            />
          </Field>
          <Field label={detail.carrier} htmlFor="order-carrier">
            <Input
              id="order-carrier"
              maxLength={60}
              placeholder={detail.carrierPlaceholder}
              value={values.carrier}
              onChange={set("carrier")}
            />
          </Field>
          <Field label={detail.tracking} htmlFor="order-tracking">
            <Input
              id="order-tracking"
              dir="ltr"
              className="font-mono uppercase"
              maxLength={80}
              value={values.trackingNumber}
              onChange={set("trackingNumber")}
            />
          </Field>
          <Field label={t.email} htmlFor="order-email">
            <Input
              id="order-email"
              type="email"
              dir="ltr"
              maxLength={254}
              value={values.email}
              onChange={set("email")}
            />
          </Field>
          <Field label={t.product} htmlFor="order-product">
            <Input
              id="order-product"
              maxLength={200}
              value={values.product}
              onChange={set("product")}
            />
          </Field>
          <Field label={t.notes} htmlFor="order-notes" className="sm:col-span-2">
            <Textarea
              id="order-notes"
              maxLength={1000}
              value={values.notes}
              onChange={set("notes")}
            />
          </Field>
          {error ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" loading={pending} className="sm:col-span-2">
            {t.submit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
