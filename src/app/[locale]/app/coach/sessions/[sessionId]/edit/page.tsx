import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachSessionEdit } from "@/widgets/coach-sessions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/coach/sessions/[sessionId]/edit">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachSessions" });
  return {
    title: t("meta.editTitle"),
    description: t("meta.editDescription"),
    robots: { index: false },
  };
}

/** `web.app.coach.sessions._session-id.edit` (WCT3, SF-64): edits a planned session. */
export default async function EditCoachSessionPage({
  params,
}: PageProps<"/[locale]/app/coach/sessions/[sessionId]/edit">) {
  await resolveLocaleParam(params);
  const { sessionId } = await params;
  return <CoachSessionEdit sessionId={sessionId} />;
}
