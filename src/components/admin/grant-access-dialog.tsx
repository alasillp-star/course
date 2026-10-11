"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";

export function GrantAccessDialog({
  userId,
  courses,
  label,
  noteLabel,
  courseLabel,
  common,
  errors,
}: {
  userId: string;
  courses: Array<{ id: string; title: string }>;
  label: string;
  noteLabel: string;
  courseLabel: string;
  common: Dictionary["common"];
  errors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/v1/admin/users/${userId}/entitlements`, { body: { courseId, note } });
      toast.success(label);
      setOpen(false);
      setNote("");
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
        <Button size="sm" variant="outline">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={common.close}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={courseLabel} htmlFor="grant-course">
            <NativeSelect
              id="grant-course"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={noteLabel} htmlFor="grant-note">
            <Textarea
              id="grant-note"
              required
              minLength={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground col-start-1">{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" loading={pending}>
            {common.confirm}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
