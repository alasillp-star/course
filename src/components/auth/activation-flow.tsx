"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  LockKeyholeIcon,
  MailIcon,
  PartyPopperIcon,
  QrCodeIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, Spinner } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { Locale } from "@/i18n/config";
import { format, pickLocalized, type LocalizedValue } from "@/i18n/format";
import { api, ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { OtpField } from "./otp-field";

type BlockingCode = keyof Dictionary["activation"]["statuses"];
const BLOCKING: ReadonlySet<string> = new Set<BlockingCode>([
  "ACTIVATION_CODE_INVALID",
  "ACTIVATION_CODE_ALREADY_USED",
  "ACTIVATION_CODE_REVOKED",
  "ACTIVATION_CODE_NOT_SOLD",
  "ACTIVATION_CODE_EXPIRED",
  "ACTIVATION_CODE_LOCKED",
]);

type State =
  | { step: "init" }
  | { step: "manual" }
  | { step: "checking" }
  | { step: "details"; requiresPin: boolean; courseTitle: LocalizedValue }
  | { step: "otp"; challengeId: string; emailMasked: string }
  | { step: "success"; redirectTo: string }
  | { step: "blocked"; code: BlockingCode };

/**
 * QR activation, entirely client-driven so the card code never appears in a
 * URL the server sees: it is read from location.hash, removed from the
 * address bar immediately, and sent only in POST bodies.
 */
export function ActivationFlow({
  locale,
  t,
  errors,
  supportEmail,
  signInLabel,
}: {
  locale: Locale;
  t: Dictionary["activation"];
  errors: Dictionary["errors"];
  supportEmail: string;
  signInLabel: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "init" });
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function check(rawCode: string) {
    setState({ step: "checking" });
    setError(null);
    try {
      const result = await api<{ requiresPin: boolean; course: { title: LocalizedValue } }>(
        "/api/v1/activation/check",
        { body: { code: rawCode } },
      );
      setState({
        step: "details",
        requiresPin: result.requiresPin,
        courseTitle: result.course.title,
      });
    } catch (caught) {
      if (caught instanceof ApiError && BLOCKING.has(caught.code)) {
        setState({ step: "blocked", code: caught.code as BlockingCode });
      } else {
        setError(errorMessage(caught, errors));
        setState({ step: "manual" });
      }
    }
  }

  // The URL fragment only exists in the browser, so it is read once after
  // hydration (an external system → state synchronisation).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fromHash = readAndClearFragment();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL fragment */
    if (fromHash) {
      setCode(fromHash);
      void check(fromHash);
    } else {
      setState({ step: "manual" });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ challengeId: string; emailMasked: string }>(
        "/api/v1/activation/start",
        {
          body: { code, pin: pin || null, email, locale },
        },
      );
      setOtp("");
      setState({ step: "otp", challengeId: result.challengeId, emailMasked: result.emailMasked });
    } catch (caught) {
      if (caught instanceof ApiError && BLOCKING.has(caught.code)) {
        setState({ step: "blocked", code: caught.code as BlockingCode });
      } else {
        setError(errorMessage(caught, errors));
      }
    } finally {
      setPending(false);
    }
  }

  async function complete(value: string) {
    if (state.step !== "otp" || value.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      const result = await api<{ redirectTo: string }>("/api/v1/activation/complete", {
        body: { challengeId: state.challengeId, otp: value, locale },
      });
      setState({ step: "success", redirectTo: result.redirectTo });
      setCode("");
      setPin("");
    } catch (caught) {
      if (caught instanceof ApiError && BLOCKING.has(caught.code)) {
        setState({ step: "blocked", code: caught.code as BlockingCode });
      } else {
        setError(errorMessage(caught, errors));
        setOtp("");
      }
    } finally {
      setPending(false);
    }
  }

  const stepIndex =
    state.step === "otp" ? 2 : state.step === "details" ? 1 : state.step === "success" ? 3 : 0;

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="bg-primary text-primary-foreground dark:bg-lime/15 dark:text-lime grid size-11 place-items-center rounded-xl">
          <QrCodeIcon className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.subtitle}</p>
        </div>
      </div>

      {state.step !== "blocked" ? (
        <ol className="mt-7 grid grid-cols-3 gap-2" aria-label={t.title}>
          {[t.steps.card, t.steps.email, t.steps.verify].map((label, index) => (
            <li key={label} className="grid gap-1.5">
              <span
                className={cn(
                  "bg-muted h-1.5 rounded-full transition-colors duration-500",
                  index < stepIndex && "bg-lime",
                  index === stepIndex && "bg-primary",
                )}
              />
              <span
                className={cn(
                  "text-muted-foreground text-xs",
                  index <= stepIndex && "text-foreground font-medium",
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-7">
        {state.step === "init" || state.step === "checking" ? (
          <div
            className="border-border bg-card flex items-center gap-3 rounded-2xl border p-5 text-sm"
            role="status"
          >
            <Spinner />
            {t.checking}
          </div>
        ) : null}

        {state.step === "manual" ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void check(code);
            }}
          >
            <div>
              <p className="font-semibold">{t.manualTitle}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t.manualBody}</p>
            </div>
            <Field label={t.codeLabel} htmlFor="card-code">
              <Input
                id="card-code"
                dir="ltr"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={t.codePlaceholder}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="text-center font-mono tracking-widest"
                required
              />
            </Field>
            {error ? <ErrorAlert message={error} /> : null}
            <Button
              type="submit"
              size="lg"
              disabled={code.replace(/[^0-9A-Za-z]/g, "").length < 16}
            >
              {t.checkCode}
              <ArrowRightIcon className="rtl:rotate-180" />
            </Button>
          </form>
        ) : null}

        {state.step === "details" ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void start();
            }}
          >
            <div className="border-success/25 bg-success/8 rounded-2xl border p-4">
              <p className="text-success inline-flex items-center gap-2 font-semibold">
                <CheckCircle2Icon className="size-4" />
                {t.validTitle}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">{t.validBody}</p>
              <p className="mt-1 font-semibold">{pickLocalized(state.courseTitle, locale)}</p>
            </div>
            {state.requiresPin ? (
              <Field label={t.pinLabel} htmlFor="card-pin" hint={t.pinHint}>
                <div className="relative">
                  <KeyRoundIcon className="text-muted-foreground pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2" />
                  <Input
                    id="card-pin"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={9}
                    placeholder="0000 0000"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/[^\d ]/g, ""))}
                    className="ps-10 font-mono tracking-[0.3em]"
                    required
                  />
                </div>
              </Field>
            ) : null}
            <Field label={t.emailLabel} htmlFor="activation-email" hint={t.emailHint}>
              <div className="relative">
                <MailIcon className="text-muted-foreground pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  id="activation-email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="ps-10"
                  required
                />
              </div>
            </Field>
            {error ? <ErrorAlert message={error} /> : null}
            <Button type="submit" size="lg" loading={pending}>
              {t.sendCode}
              <ArrowRightIcon className="rtl:rotate-180" />
            </Button>
            <p className="text-muted-foreground inline-flex items-center gap-2 text-xs">
              <LockKeyholeIcon className="size-3.5" />
              {t.securityNote}
            </p>
          </form>
        ) : null}

        {state.step === "otp" ? (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void complete(otp);
            }}
          >
            <div>
              <p className="font-semibold">{t.otpTitle}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {format(t.otpBody, { email: "⁨" + state.emailMasked + "⁩" })}
              </p>
            </div>
            <OtpField
              label={t.otpLabel}
              value={otp}
              onChange={setOtp}
              onComplete={(value) => void complete(value)}
              disabled={pending}
            />
            {error ? <ErrorAlert message={error} /> : null}
            <Button type="submit" size="lg" loading={pending} disabled={otp.length !== 6}>
              <ShieldCheckIcon />
              {t.confirm}
            </Button>
          </form>
        ) : null}

        {state.step === "success" ? (
          <div className="border-border bg-card shadow-soft rounded-2xl border p-6 text-center">
            <PartyPopperIcon className="text-highlight mx-auto size-10" />
            <p className="mt-4 text-xl font-bold">{t.successTitle}</p>
            <p className="text-muted-foreground mt-2 text-sm">{t.successBody}</p>
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={() => {
                router.replace(state.redirectTo);
                router.refresh();
              }}
            >
              {t.goToDashboard}
              <ArrowRightIcon className="rtl:rotate-180" />
            </Button>
          </div>
        ) : null}

        {state.step === "blocked" ? (
          <div className="border-border bg-card shadow-soft rounded-2xl border p-6" role="alert">
            <AlertTriangleIcon className="text-warning size-8" />
            <p className="mt-4 text-lg font-bold">{t.statuses[state.code].title}</p>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {t.statuses[state.code].body}
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCode("");
                  setError(null);
                  setState({ step: "manual" });
                }}
              >
                {t.useAnotherCard}
              </Button>
              {state.code === "ACTIVATION_CODE_ALREADY_USED" ? (
                <Button asChild>
                  <Link href={`/${locale}/login`}>{signInLabel}</Link>
                </Button>
              ) : (
                <Button asChild variant="secondary">
                  <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Reads the card code from #fragment and removes it from the address bar and history. */
function readAndClearFragment(): string {
  const value = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  if (value)
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return value;
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="text-foreground col-start-1">{message}</AlertDescription>
    </Alert>
  );
}
