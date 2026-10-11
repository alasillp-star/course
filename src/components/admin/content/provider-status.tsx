"use client";

import { useState } from "react";
import { PlugZapIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { format } from "@/i18n/format";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

type Check = { provider: string; ok: boolean; detail?: string } | null;

/** "Test connection" for the configured video and file providers. */
export function ProviderTestButton({
  labels,
  errors,
}: {
  labels: Dictionary["admin"]["content"]["providers"];
  errors: Dictionary["errors"];
}) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          const result = await api<{ video: Check; storage: Check }>(
            "/api/v1/admin/media/providers",
          );
          for (const [name, check] of [
            [labels.video, result.video],
            [labels.storage, result.storage],
          ] as const) {
            if (!check) toast(`${name}: ${labels.notConfigured}`);
            else if (check.ok) toast.success(`${name} (${check.provider}): ${labels.ok}`);
            else toast.error(`${name}: ${format(labels.failed, { detail: check.detail ?? "" })}`);
          }
        } catch (caught) {
          toast.error(errorMessage(caught, errors));
        } finally {
          setPending(false);
        }
      }}
    >
      <PlugZapIcon />
      {labels.test}
    </Button>
  );
}
