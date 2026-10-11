"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShoppingCartIcon } from "lucide-react";
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
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export function SellCardsDialog({
  t,
  triggerLabel,
  common,
  errors,
  defaultOpen,
  initialSerials = "",
  variant = "outline",
}: {
  t: Dictionary["admin"]["batches"]["sell"];
  triggerLabel: string;
  common: Dictionary["common"];
  errors: Dictionary["errors"];
  defaultOpen?: boolean;
  initialSerials?: string;
  variant?: "outline" | "default" | "gold";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!defaultOpen);
  const [serials, setSerials] = useState(initialSerials);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Array<{ serial: string; reason: string }>>([]);

  async function submit() {
    setPending(true);
    setError(null);
    setSkipped([]);
    try {
      const list = serials.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
      const result = await api<{ sold: string[]; skipped: Array<{ serial: string; reason: string }> }>(
        "/api/v1/admin/activation/codes/sell",
        { body: { serials: list } },
      );
      toast.success(format(t.result, { count: result.sold.length }));
      setSkipped(result.skipped);
      if (result.skipped.length === 0) {
        setOpen(false);
        setSerials("");
      }
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <ShoppingCartIcon />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.body}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t.serials} htmlFor="sell-serials">
            <Textarea
              id="sell-serials"
              dir="ltr"
              className="min-h-36 font-mono text-sm"
              placeholder={"B0001-00001\nB0001-00002"}
              value={serials}
              onChange={(event) => setSerials(event.target.value.toUpperCase())}
              required
            />
          </Field>
          {skipped.length > 0 ? (
            <Alert variant="warning">
              <AlertDescription className="col-start-1 text-foreground">
                <p>{format(t.skipped, { count: skipped.length })}</p>
                <ul className="mt-1 font-mono text-xs" dir="ltr">
                  {skipped.slice(0, 20).map((item) => (
                    <li key={item.serial}>
                      {item.serial} — {item.reason}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="col-start-1 text-foreground">{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" size="lg" loading={pending}>
            {t.submit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
