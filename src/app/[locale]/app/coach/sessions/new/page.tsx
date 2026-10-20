import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachSessionCreate } from "@/widgets/coach-sessions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/coach/sessions/new">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachSessions" });
  return {
    title: t("meta.newTitle"),
    description: t("meta.newDescription"),
    robots: { index: false },
  };
}

/**
 * `web.app.coach.sessions.new` (WC3 as reconciled for SF-64): plans one
 * session for one of the coach's fighters. CRW2 (`?tour=2`) is deferred with
 * the Coach first run and not shown.
 */
export default async function NewCoachSessionPage({
  params,
}: PageProps<"/[locale]/app/coach/sessions/new">) {
  await resolveLocaleParam(params);
  return <CoachSessionCreate />;
}
