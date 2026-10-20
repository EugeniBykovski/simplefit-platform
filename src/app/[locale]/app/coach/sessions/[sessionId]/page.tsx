import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachSessionDetail } from "@/widgets/coach-sessions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/coach/sessions/[sessionId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachSessions" });
  return {
    title: t("meta.sessionTitle"),
    description: t("meta.sessionDescription"),
    robots: { index: false },
  };
}

/**
 * `web.app.coach.sessions._session-id` (WCT2, SF-64): one session the coach
 * planned. The backend decides whether it is this coach's and reachable.
 */
export default async function CoachSessionPage({
  params,
}: PageProps<"/[locale]/app/coach/sessions/[sessionId]">) {
  await resolveLocaleParam(params);
  const { sessionId } = await params;
  return <CoachSessionDetail sessionId={sessionId} />;
}
