import { createLessonBody } from "@/modules/content/content.schemas";
import { createLesson } from "@/modules/content/content.service";
import { requireApiActor } from "@/modules/identity/current";
import { ok, parseJsonBody, withApi } from "@/server/http/api";

export const POST = withApi(async (request, { meta }) => {
  const actor = await requireApiActor({ adminArea: true, permission: "content.manage" });
  const input = await parseJsonBody(request, createLessonBody);
  return ok(await createLesson(actor, input, meta), { status: 201 });
});
