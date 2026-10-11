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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export function CreateBatchDialog({
  locale,
  courses,
  t,
  triggerLabel,
  common,
  errors,
  defaultOpen,
}: {
  locale: Locale;
  courses: Array<{ id: string; title: string }>;
  t: Dictionary["admin"]["batches"]["form"];
  triggerLabel: string;
  common: Dictionary["common"];
  errors: Dictionary["errors"];
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!defaultOpen);
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [quantity, setQuantity] = useState(100);
  // Cards are QR-only: the scratch-off PIN stays available in the API for legacy print runs.
  const requiresPin = false;
  const [requiresSale, setRequiresSale] = useState(true);
  const [redeemBy, setRedeemBy] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const batch = await api<{ id: string; quantity: number }>(
        "/api/v1/admin/activation/batches",
        {
          body: {
            name,
            courseId,
            quantity,
            requiresPin,
            requiresSale,
            redeemBy: redeemBy ? new Date(`${redeemBy}T23:59:59`).toISOString() : null,
            notes: notes || null,
          },
        },
      );
      toast.success(format(t.created, { count: batch.quantity }));
      setOpen(false);
      router.push(`/${locale}/admin/activation/${batch.id}`);
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
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.requiresSaleHint}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t.name} htmlFor="batch-name">
            <Input
              id="batch-name"
              required
              minLength={2}
              maxLength={120}
              placeholder={t.namePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.course} htmlFor="batch-course">
              <NativeSelect
                id="batch-course"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                required
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t.quantity} htmlFor="batch-quantity" hint={t.quantityHint}>
              <Input
                id="batch-quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                required
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                dir="ltr"
              />
            </Field>
          </div>
          <label className="border-border flex items-start justify-between gap-4 rounded-xl border p-3">
            <span>
              <span className="block text-sm font-medium">{t.requiresSale}</span>
              <span className="text-muted-foreground block text-xs">{t.requiresSaleHint}</span>
            </span>
            <Switch
              checked={requiresSale}
              onCheckedChange={setRequiresSale}
              aria-label={t.requiresSale}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.redeemBy} htmlFor="batch-redeem-by">
              <Input
                id="batch-redeem-by"
                type="date"
                value={redeemBy}
                onChange={(event) => setRedeemBy(event.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label={t.notes} htmlFor="batch-notes">
              <Textarea
                id="batch-notes"
                className="min-h-11"
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" size="lg" loading={pending} disabled={!courseId}>
            {t.submit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
