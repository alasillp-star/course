"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyIcon, KeyRoundIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpField } from "@/components/auth/otp-field";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export function MfaFlow({
  enrolled,
  redirectTo,
  t,
  common,
  errors,
}: {
  enrolled: boolean;
  redirectTo: string;
  t: Dictionary["admin"]["mfa"];
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    router.replace(redirectTo);
    router.refresh();
  };

  async function call<T>(path: string, body: unknown): Promise<T | null> {
    setPending(true);
    setError(null);
    try {
      return await api<T>(path, { body });
    } catch (caught) {
      setError(errorMessage(caught, errors));
      setCode("");
      return null;
    } finally {
      setPending(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div className="grid gap-5">
        <div>
          <h2 className="text-lg font-semibold">{t.recoveryTitle}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t.recoveryBody}</p>
        </div>
        <ul
          className="border-border bg-muted/50 grid grid-cols-2 gap-2 rounded-2xl border p-4 font-mono text-sm"
          dir="ltr"
        >
          {recoveryCodes.map((value) => (
            <li key={value} className="bg-card rounded-lg px-3 py-2 text-center tracking-wider">
              {value}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(recoveryCodes.join("\n"))
                .then(() => toast.success(common.copied));
            }}
          >
            <CopyIcon />
            {common.copy}
          </Button>
          <Button variant="gold" onClick={finish}>
            {t.recoverySaved}
          </Button>
        </div>
      </div>
    );
  }

  if (!enrolled) {
    if (!enrollment) {
      return (
        <div className="grid gap-5">
          <p className="text-muted-foreground text-sm leading-relaxed">{t.enrollBody}</p>
          {error ? <ErrorAlert message={error} /> : null}
          <Button
            size="lg"
            loading={pending}
            onClick={async () => {
              const result = await call<{ secret: string; qrDataUrl: string }>(
                "/api/v1/auth/mfa/totp/enroll",
                {},
              );
              if (result) setEnrollment(result);
            }}
          >
            <ShieldCheckIcon />
            {t.start}
          </Button>
        </div>
      );
    }
    return (
      <form
        className="grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await call<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/totp/confirm", {
            code,
          });
          if (result) setRecoveryCodes(result.recoveryCodes);
        }}
      >
        <div className="border-border grid justify-items-center gap-3 rounded-2xl border bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrDataUrl} alt="" width={200} height={200} className="size-48" />
        </div>
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">{t.manualKey}</summary>
          <code
            className="bg-muted mt-2 block rounded-lg px-3 py-2 font-mono text-xs break-all"
            dir="ltr"
          >
            {enrollment.secret}
          </code>
        </details>
        <OtpField label={t.codeLabel} value={code} onChange={setCode} disabled={pending} />
        {error ? <ErrorAlert message={error} /> : null}
        <Button type="submit" size="lg" loading={pending} disabled={code.length !== 6}>
          {t.confirm}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = recovery.trim() || code;
        const result = await call<{ verified: boolean }>("/api/v1/auth/mfa/verify", {
          code: value,
        });
        if (result) finish();
      }}
    >
      <p className="text-muted-foreground text-sm">{t.verifyBody}</p>
      <OtpField label={t.codeLabel} value={code} onChange={setCode} disabled={pending} />
      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer">{t.recoveryTitle}</summary>
        <div className="relative mt-2">
          <KeyRoundIcon className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            dir="ltr"
            value={recovery}
            onChange={(event) => setRecovery(event.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            className="ps-9 font-mono tracking-wider"
            autoComplete="off"
          />
        </div>
      </details>
      {error ? <ErrorAlert message={error} /> : null}
      <Button
        type="submit"
        size="lg"
        loading={pending}
        disabled={code.length !== 6 && recovery.trim().length < 10}
      >
        {t.verify}
      </Button>
    </form>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="text-foreground col-start-1">{message}</AlertDescription>
    </Alert>
  );
}
