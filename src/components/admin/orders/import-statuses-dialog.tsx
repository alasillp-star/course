"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUpIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

type Outcome = keyof Dictionary["admin"]["orders"]["import"]["outcomes"];
type Summary = {
  rows: number;
  counts: Record<string, number>;
  issues: Array<{ trackingNumber?: string; outcome: string; orderNumber?: string }>;
};

export function ImportStatusesDialog({
  t,
  triggerLabel,
  common,
  errors,
}: {
  t: Dictionary["admin"]["orders"]["import"];
  triggerLabel: string;
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function submit() {
    if (!file) return;
    setPending(true);
    setError(null);
    setSummary(null);
    try {
      const response = await fetch("/api/v1/admin/orders/delivery-import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: await file.text(),
        credentials: "same-origin",
        cache: "no-store",
      }).catch(() => {
        throw new ApiError("NETWORK_ERROR", 0);
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: Summary;
        error?: { code?: string; details?: Record<string, unknown> };
      } | null;
      if (!response.ok || !payload?.data) {
        throw new ApiError(
          payload?.error?.code ?? "INTERNAL_ERROR",
          response.status,
          payload?.error?.details ?? {},
        );
      }
      const data = payload.data;
      setSummary(data);
      toast.success(
        format(t.result, {
          rows: data.rows,
          delivered: data.counts.delivered ?? 0,
          applied: data.counts.applied ?? 0,
          unchanged: data.counts.unchanged ?? 0,
        }),
      );
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSummary(null);
          setError(null);
          setFile(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUpIcon />
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
          <Field label={t.file} htmlFor="import-file">
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          {summary ? (
            <Alert variant={summary.issues.length ? "warning" : "success"}>
              <AlertDescription className="text-foreground col-start-1">
                <p>
                  {format(t.result, {
                    rows: summary.rows,
                    delivered: summary.counts.delivered ?? 0,
                    applied: summary.counts.applied ?? 0,
                    unchanged: summary.counts.unchanged ?? 0,
                  })}
                </p>
                {summary.issues.length ? (
                  <>
                    <p className="mt-2 font-semibold">{t.issues}</p>
                    <ul className="mt-1 grid gap-0.5 text-xs">
                      {summary.issues.slice(0, 30).map((issue, index) => (
                        <li key={`${issue.trackingNumber}-${index}`}>
                          <span dir="ltr" className="font-mono">
                            {issue.trackingNumber ?? "—"}
                          </span>{" "}
                          — {t.outcomes[issue.outcome as Outcome] ?? issue.outcome}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" loading={pending} disabled={!file}>
            {t.submit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
