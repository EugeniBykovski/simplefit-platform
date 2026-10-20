import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachSessions } from "@/widgets/coach-sessions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/coach/sessions">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachSessions" });
  return { title: t("meta.title"), description: t("meta.description"), robots: { index: false } };
}

/**
 * `web.app.coach.sessions` (WCT1, SF-64): the coach's training sessions.
 * `?view=history` shows History, narrowed by `?status=completed|cancelled`;
 * any other value is Upcoming. The Coach layout's gate has already run.
 */
export default async function CoachSessionsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/app/coach/sessions">) {
  await resolveLocaleParam(params);
  const { view, status } = await searchParams;
  const history = view === "history";
  return (
    <CoachSessions
      view={history ? "history" : "upcoming"}
      filter={history && (status === "completed" || status === "cancelled") ? status : "all"}
    />
  );
}
