"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export function GrantRoleForm({
  roles,
  t,
  errors,
}: {
  roles: Array<{ key: string; label: string }>;
  t: Dictionary["admin"]["staff"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState(roles[0]?.key ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await api("/api/v1/admin/staff/roles", { body: { email, roleKey } });
      toast.success(t.grant);
      setEmail("");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught, errors));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t.email} htmlFor="staff-email">
        <Input
          id="staff-email"
          type="email"
          dir="ltr"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label={t.role} htmlFor="staff-role">
        <NativeSelect
          id="staff-role"
          value={roleKey}
          onChange={(event) => setRoleKey(event.target.value)}
        >
          {roles.map((role) => (
            <option key={role.key} value={role.key}>
              {role.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" loading={pending}>
        {t.grant}
      </Button>
      {error ? (
        <Alert variant="destructive" className="sm:col-span-3">
          <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
