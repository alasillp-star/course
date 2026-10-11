"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LaptopIcon, LogOutIcon, SmartphoneIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { Locale } from "@/i18n/config";
import { format, formatDateTime, formatRelative } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export type SessionView = {
  id: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

export function SessionsManager({
  locale,
  sessions,
  t,
  common,
  errors,
}: {
  locale: Locale;
  sessions: SessionView[];
  t: Dictionary["student"]["security"];
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const others = sessions.filter((session) => !session.current);

  async function run(key: string, action: () => Promise<unknown>, after?: () => void) {
    setBusy(key);
    try {
      await action();
      after?.();
      router.refresh();
    } catch (caught) {
      toast.error(errorMessage(caught, errors));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <ul className="divide-border border-border bg-card divide-y rounded-2xl border">
        {sessions.map((session) => {
          const mobile = /iPhone|iPad|Android/i.test(session.deviceLabel ?? "");
          const Icon = mobile ? SmartphoneIcon : LaptopIcon;
          return (
            <li key={session.id} className="flex items-center gap-4 p-4">
              <span className="bg-muted grid size-10 place-items-center rounded-xl">
                <Icon className="text-muted-foreground size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span dir="ltr">{session.deviceLabel ?? common.unknown}</span>
                  {session.current ? <Badge variant="success">{t.current}</Badge> : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t.lastActive}: {formatRelative(session.lastSeenAt, locale)} · {t.signedIn}:{" "}
                  {formatDateTime(session.createdAt, locale)}
                </p>
              </div>
              {!session.current ? (
                <Button
                  variant="outline"
                  size="sm"
                  loading={busy === session.id}
                  onClick={() =>
                    void run(session.id, () =>
                      api(`/api/v1/auth/sessions/${session.id}`, { method: "DELETE" }),
                    )
                  }
                >
                  {t.signOutDevice}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {others.length === 0 ? <p className="text-muted-foreground text-sm">{t.noOther}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <ConfirmButton
          disabled={others.length === 0}
          label={t.signOutOthers}
          description={t.confirmOthers}
          common={common}
          loading={busy === "others"}
          onConfirm={() =>
            void run("others", async () => {
              const result = await api<{ revoked: number }>("/api/v1/auth/sessions", {
                method: "DELETE",
              });
              toast.success(format(t.done, { count: result.revoked }));
            })
          }
        />
        <ConfirmButton
          destructive
          label={t.signOutEverywhere}
          description={t.confirmEverywhere}
          common={common}
          loading={busy === "all"}
          onConfirm={() =>
            void run(
              "all",
              () => api("/api/v1/auth/sessions?scope=all", { method: "DELETE" }),
              () => router.replace(`/${locale}/login`),
            )
          }
        />
      </div>
    </div>
  );
}

function ConfirmButton({
  label,
  description,
  onConfirm,
  common,
  destructive,
  disabled,
  loading,
}: {
  label: string;
  description: string;
  onConfirm: () => void;
  common: Dictionary["common"];
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={destructive ? "destructive" : "outline"}
          disabled={disabled}
          loading={loading}
        >
          <LogOutIcon />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{common.cancel}</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
              {common.confirm}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
