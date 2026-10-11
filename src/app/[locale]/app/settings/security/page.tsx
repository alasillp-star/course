import type { Metadata } from "next";
import { SessionsManager } from "@/components/student/sessions-manager";
import { format } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { getCurrentActor } from "@/modules/identity/current";
import { listActiveSessions } from "@/modules/identity/session.service";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getI18n();
  return { title: dict.student.security.title };
}

export default async function SecurityPage() {
  const { locale, dict } = await getI18n();
  const actor = (await getCurrentActor())!;
  const sessions = await listActiveSessions(getDb(), actor.userId);
  const t = dict.student.security;
  const limit = getEnv().MAX_ACTIVE_SESSIONS_PER_USER;
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-muted-foreground">{t.subtitle}</p>
        {limit > 0 ? <p className="mt-1 text-xs text-muted-foreground">{format(t.deviceLimit, { count: limit })}</p> : null}
      </div>
      <SessionsManager
        locale={locale}
        t={t}
        common={dict.common}
        errors={dict.errors}
        sessions={sessions.map((session) => ({
          id: session.id,
          deviceLabel: session.deviceLabel,
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt.toISOString(),
          current: session.id === actor.sessionId,
        }))}
      />
    </div>
  );
}
