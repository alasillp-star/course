"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { OtpField } from "@/components/auth/otp-field";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export function EmailChangeForm({
  t,
  errors,
}: {
  t: Dictionary["student"]["settings"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ challengeId: string }>("/api/v1/me/email/start", {
        body: { newEmail },
      });
      setChallengeId(result.challengeId);
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  async function confirm(value: string) {
    if (!challengeId || value.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      await api("/api/v1/me/email/confirm", { body: { challengeId, code: value } });
      toast.success(t.emailChanged);
      setChallengeId(null);
      setNewEmail("");
      setCode("");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, errors));
      setCode("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      {!challengeId ? (
        <form
          className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <Field label={t.newEmail} htmlFor="new-email">
            <Input
              id="new-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={pending}>
            {t.sendCode}
          </Button>
        </form>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm(code);
          }}
        >
          <p className="text-muted-foreground text-sm">{t.codeSent}</p>
          <OtpField
            label={t.newEmail}
            value={code}
            onChange={setCode}
            onComplete={(value) => void confirm(value)}
            disabled={pending}
          />
          <Button type="submit" loading={pending} disabled={code.length !== 6}>
            {t.changeEmail}
          </Button>
        </form>
      )}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
