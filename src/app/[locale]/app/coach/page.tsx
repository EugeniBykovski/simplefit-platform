import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachHome } from "@/widgets/coach-home";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/coach">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachHome" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.coach` (WC1, SF-54): the Coach dashboard. The Coach layout's gate
 * has already established that the entry reports COACH (a completed Coach
 * onboarding).
 */
export default async function CoachHomePage({ params }: PageProps<"/[locale]/app/coach">) {
  await resolveLocaleParam(params);
  return <CoachHome />;
}
