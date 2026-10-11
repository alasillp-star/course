"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

/**
 * Confirmation dialog that calls one API endpoint (optionally with a reason)
 * and refreshes the server-rendered page. Props are serialisable so server
 * components can render it directly.
 */
export function ApiActionDialog({
  label,
  title,
  description,
  endpoint,
  method = "POST",
  body,
  reason,
  successMessage,
  redirectTo,
  variant = "outline",
  size = "sm",
  common,
  errors,
}: {
  label: string;
  title: string;
  description?: string;
  endpoint: string;
  method?: "POST" | "DELETE";
  body?: Record<string, unknown>;
  reason?: { label: string; placeholder?: string; field?: string };
  successMessage?: string;
  redirectTo?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      await api(endpoint, {
        method,
        body: { ...(body ?? {}), ...(reason ? { [reason.field ?? "reason"]: text.trim() } : {}) },
      });
      if (successMessage) toast.success(successMessage);
      setOpen(false);
      setText("");
      if (redirectTo) router.replace(redirectTo);
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
        <Button variant={variant} size={size}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          {reason ? (
            <Field label={reason.label} htmlFor="action-reason">
              <Textarea
                id="action-reason"
                required
                minLength={3}
                maxLength={500}
                placeholder={reason.placeholder}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
          ) : null}
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
            <Button
              type="submit"
              variant={variant === "destructive" ? "destructive" : "default"}
              loading={pending}
            >
              {common.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
