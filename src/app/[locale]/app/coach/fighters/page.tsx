import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachFighters } from "@/widgets/coach-fighters";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/coach/fighters">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachFighters" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.coach.fighters` (WC7, SF-58): the coach's fighters and
 * invitations. `?view=ended` shows the ended relationships; any other value
 * is the active roster. The Coach layout's gate has already run.
 */
export default async function CoachFightersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/app/coach/fighters">) {
  await resolveLocaleParam(params);
  const { view } = await searchParams;
  return <CoachFighters view={view === "ended" ? "ended" : "active"} />;
}
