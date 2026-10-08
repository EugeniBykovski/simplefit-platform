import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { FighterOnboarding } from "@/widgets/fighter-onboarding";
import { LaunchScreen } from "@/widgets/system-states";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/onboarding/fighter">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "fighterOnboarding" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Fighter web registration (SF-38): WF0 → WF1 → WF6 on the SF-25 profile.
 * The step comes from `?step=` and the backend state (client side), so the
 * page suspends on the search params while the launch screen shows.
 */
export default async function FighterOnboardingPage({
  params,
}: PageProps<"/[locale]/app/onboarding/fighter">) {
  await resolveLocaleParam(params);
  return (
    <Suspense fallback={<LaunchScreen />}>
      <FighterOnboarding />
    </Suspense>
  );
}
