"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

/** Completion for lessons without video (video lessons complete by watching). */
export function CompleteLessonButton({
  lessonId,
  completed,
  labels,
  errors,
}: {
  lessonId: string;
  completed: boolean;
  labels: { markComplete: string; completed: string; completedToast: string };
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (completed) {
    return (
      <span className="text-success inline-flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2Icon className="size-4" />
        {labels.completed}
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant="gold"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api(`/api/v1/lessons/${lessonId}/complete`, { body: {} });
          toast.success(labels.completedToast);
          router.refresh();
        } catch (error) {
          toast.error(errorMessage(error, errors));
        } finally {
          setPending(false);
        }
      }}
    >
      <CheckCircle2Icon />
      {labels.markComplete}
    </Button>
  );
}
