"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyIcon } from "lucide-react";
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
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

type Replacement = { serial: string; code: string; pin: string | null; url: string };

export function ReplaceCardDialog({
  codeId,
  t,
  common,
  errors,
}: {
  codeId: string;
  t: Dictionary["admin"]["card"];
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Replacement | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      setResult(await api<Replacement>(`/api/v1/admin/activation/codes/${codeId}/replace`, { body: { reason } }));
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
        if (!next && result) {
          setResult(null);
          router.refresh();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t.replace}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{result ? t.replacementTitle : t.replace}</DialogTitle>
          {result ? <DialogDescription>{t.replacementBody}</DialogDescription> : null}
        </DialogHeader>
        {result ? (
          <div className="grid gap-3">
            <dl className="grid gap-2 rounded-xl border border-border bg-muted/50 p-4 font-mono text-sm" dir="ltr">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Serial</dt>
                <dd className="font-semibold">{result.serial}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Code</dt>
                <dd className="font-semibold">{result.code}</dd>
              </div>
              {result.pin ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">PIN</dt>
                  <dd className="font-semibold">{result.pin}</dd>
                </div>
              ) : null}
              <div className="grid gap-1">
                <dt className="text-muted-foreground">QR URL</dt>
                <dd className="text-xs break-all">{result.url}</dd>
              </div>
            </dl>
            <Button
              variant="outline"
              onClick={() => {
                const lines = [result.serial, result.code, result.pin ?? "", result.url].filter(Boolean);
                void navigator.clipboard.writeText(lines.join("\n")).then(() => toast.success(common.copied));
              }}
            >
              <CopyIcon />
              {common.copy}
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field label={t.reason} htmlFor="replace-reason">
              <Textarea id="replace-reason" required minLength={3} maxLength={500} placeholder={t.reasonPlaceholder} value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription className="col-start-1 text-foreground">{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" loading={pending}>
              {common.confirm}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
