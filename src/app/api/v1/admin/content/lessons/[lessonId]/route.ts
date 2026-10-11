import { updateLessonBody } from "@/modules/content/content.schemas";
import { deleteLesson, getEditorLesson, updateLesson } from "@/modules/content/content.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";
import { parseIdParam } from "@/server/http/schemas";

export const GET = withApi<{ lessonId: string }>(async (_request, { params }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.read" });
  return ok(await getEditorLesson(actor, parseIdParam((await params).lessonId)));
});

export const PATCH = withApi<{ lessonId: string }>(async (request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const input = await parseJsonBody(request, updateLessonBody);
  return ok(await updateLesson(actor, parseIdParam((await params).lessonId), input, meta));
});

export const DELETE = withApi<{ lessonId: string }>(async (_request, { params, meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  await deleteLesson(actor, parseIdParam((await params).lessonId), meta);
  return ok({ deleted: true });
});
