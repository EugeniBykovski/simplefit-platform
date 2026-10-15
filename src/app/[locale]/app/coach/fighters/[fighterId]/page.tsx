import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachFighterDetail } from "@/widgets/coach-fighters";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/coach/fighters/[fighterId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachFighters" });
  return { title: t("detailMetaTitle"), robots: { index: false } };
}

/**
 * `web.app.coach.fighters._fighter-id` (WC4, SF-58): one fighter the coach
 * works with. The segment is the SF-56 relationship id; the backend decides
 * whether it is this coach's and still active.
 */
export default async function CoachFighterPage({
  params,
}: PageProps<"/[locale]/app/coach/fighters/[fighterId]">) {
  await resolveLocaleParam(params);
  const { fighterId } = await params;
  return <CoachFighterDetail relationshipId={fighterId} />;
}
