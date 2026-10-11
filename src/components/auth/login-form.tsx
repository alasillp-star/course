"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRightIcon, MailIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { OtpField } from "./otp-field";

const RESEND_COOLDOWN_SECONDS = 60;

export function LoginForm({
  locale,
  next,
  t,
  errors,
}: {
  locale: Locale;
  next?: string;
  t: Dictionary["auth"]["login"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestCode() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ challengeId: string }>("/api/v1/auth/otp/request", {
        body: { email, locale },
      });
      setChallengeId(result.challengeId);
      setCode("");
      setStep("code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  async function verify(value: string) {
    if (!challengeId || value.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      const result = await api<{ redirectTo: string }>("/api/v1/auth/otp/verify", {
        body: { challengeId, code: value, locale, next },
      });
      router.replace(result.redirectTo);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, errors));
      setCode("");
      setPending(false);
    }
  }

  if (step === "email") {
    return (
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void requestCode();
        }}
      >
        <Field label={t.emailLabel} htmlFor="email">
          <div className="relative">
            <MailIcon className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              required
              placeholder={t.emailPlaceholder}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="ps-10 text-start"
              autoFocus
            />
          </div>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="col-start-1 text-foreground">{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" size="lg" loading={pending}>
          {t.submit}
          <ArrowRightIcon className="rtl:rotate-180" />
        </Button>
      </form>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
    >
      <p className="text-sm text-muted-foreground">
        {format(t.codeSent, { email: "⁨" + email + "⁩" })}
      </p>
      <OtpField label={t.codeLabel} value={code} onChange={setCode} onComplete={(value) => void verify(value)} disabled={pending} />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="col-start-1 text-foreground">{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" loading={pending} disabled={code.length !== 6}>
        {t.verify}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" className="font-medium text-muted-foreground hover:text-foreground" onClick={() => setStep("email")}>
          {t.changeEmail}
        </button>
        <button
          type="button"
          className="font-medium text-foreground underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
          disabled={cooldown > 0 || pending}
          onClick={() => void requestCode()}
        >
          {cooldown > 0 ? format(t.resendIn, { seconds: cooldown }) : t.resend}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{t.checkSpam}</p>
      <p className="text-xs text-muted-foreground">
        <Link href={`/${locale}/recover`} className="underline underline-offset-4">
          {t.recoverLink}
        </Link>
      </p>
    </form>
  );
}
