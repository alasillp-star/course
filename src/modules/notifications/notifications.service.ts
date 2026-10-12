import "server-only";
import { and, count, desc, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import { courseEntitlements, notifications } from "@/server/db/schema";
import type { NotificationType } from "@/shared/enums";
import type { Actor } from "../access/actor";
import { activeEntitlementCondition } from "../entitlements/entitlements.service";

/**
 * In-app notifications. A notification stores a type and template data, never
 * rendered text: the UI renders it in the reader's language (dictionary
 * "notifications"). Links are relative paths without the locale prefix, e.g.
 * "/app/community/post/<id>"; the UI prefixes the current locale.
 */
export type NewNotification = {
  type: NotificationType;
  data?: Record<string, string | number | boolean | null>;
  link?: string;
};

const MAX_RECIPIENTS_PER_INSERT = 1000;

function assertRelativeLink(link: string | undefined): void {
  if (link !== undefined && !/^\/(?!\/)[\w\-./?=&%#]*$/.test(link)) {
    throw new Error(`Notification links must be relative paths: ${link}`);
  }
}

/** Notifies the given users (duplicates removed). Pass the transaction executor when inside one. */
export async function notifyUsers(
  executor: Executor,
  userIds: readonly string[],
  notification: NewNotification,
): Promise<number> {
  assertRelativeLink(notification.link);
  const unique = [...new Set(userIds)];
  for (let index = 0; index < unique.length; index += MAX_RECIPIENTS_PER_INSERT) {
    await executor.insert(notifications).values(
      unique.slice(index, index + MAX_RECIPIENTS_PER_INSERT).map((userId) => ({
        userId,
        type: notification.type,
        data: notification.data ?? {},
        link: notification.link ?? null,
      })),
    );
  }
  return unique.length;
}

/** Notifies every student with active access to the course (e.g. a new live session). */
export async function notifyCourseMembers(
  executor: Executor,
  courseId: string,
  notification: NewNotification,
  options: { excludeUserId?: string } = {},
): Promise<number> {
  const rows = await executor
    .selectDistinct({ userId: courseEntitlements.userId })
    .from(courseEntitlements)
    .where(
      and(
        eq(courseEntitlements.courseId, courseId),
        activeEntitlementCondition(),
        options.excludeUserId ? ne(courseEntitlements.userId, options.excludeUserId) : undefined,
      ),
    );
  return notifyUsers(
    executor,
    rows.map((row) => row.userId),
    notification,
  );
}

export async function listNotifications(
  actor: Pick<Actor, "userId">,
  options: { limit?: number; before?: Date } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  return getDb()
    .select({
      id: notifications.id,
      type: notifications.type,
      data: notifications.data,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, actor.userId),
        options.before ? lt(notifications.createdAt, options.before) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications(actor: Pick<Actor, "userId">): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

/** Marks the given notifications (or all of them) as read; only the actor's own. */
export async function markNotificationsRead(
  actor: Pick<Actor, "userId">,
  ids: readonly string[] | "all",
): Promise<number> {
  if (ids !== "all" && ids.length === 0) return 0;
  const updated = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, actor.userId),
        isNull(notifications.readAt),
        ids === "all" ? undefined : inArray(notifications.id, [...ids]),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length;
}
