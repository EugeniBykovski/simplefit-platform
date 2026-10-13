import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachOnboarding } from "@/widgets/coach-onboarding";
import { LaunchScreen } from "@/widgets/system-states";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/onboarding/coach">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachOnboarding" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Coach web registration (SF-52): WCR1 → WCR2 → WCR7 on the SF-50 profile.
 * The step comes from `?step=` and the backend state (client side), so the
 * page suspends on the search params while the launch screen shows.
 */
export default async function CoachOnboardingPage({
  params,
}: PageProps<"/[locale]/app/onboarding/coach">) {
  await resolveLocaleParam(params);
  return (
    <Suspense fallback={<LaunchScreen />}>
      <CoachOnboarding />
    </Suspense>
  );
}
