import { noteBody } from "@/modules/content/content.schemas";
import { requireApiActor } from "@/modules/identity/current";
import { createNote, listLessonNotes } from "@/modules/learning/lesson.service";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const GET = withApi<{ lessonId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor();
  return ok(await listLessonNotes(actor, parseIdParam((await params).lessonId)));
});

export const POST = withApi<{ lessonId: string }>(async (request, { params }) => {
  const actor = await requireApiActor();
  const input = await parseJsonBody(request, noteBody);
  return ok(await createNote(actor, parseIdParam((await params).lessonId), input), {
    status: 201,
  });
});
