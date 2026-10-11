import "server-only";
import type { Executor } from "@/server/db/client";
import { activationEvents } from "@/server/db/schema";
import type { RequestMeta } from "@/server/http/request-meta";
import { redact } from "@/server/logger";
import type { ActivationEventType } from "@/shared/enums";

export type ActivationEventInput = {
  type: ActivationEventType;
  batchId: string;
  codeId?: string | null;
  actorUserId?: string | null;
  meta?: RequestMeta;
  metadata?: Record<string, unknown>;
};

/** Appends lifecycle events (bulk-capable). Never pass secrets in metadata. */
export async function recordActivationEvents(
  executor: Executor,
  events: ActivationEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  for (let i = 0; i < events.length; i += 1000) {
    await executor.insert(activationEvents).values(
      events.slice(i, i + 1000).map((event) => ({
        type: event.type,
        batchId: event.batchId,
        codeId: event.codeId ?? null,
        actorUserId: event.actorUserId ?? null,
        ipAddress: event.meta?.ip ?? null,
        userAgent: event.meta?.userAgent ?? null,
        metadata: redact(event.metadata ?? {}) as Record<string, unknown>,
      })),
    );
  }
}
