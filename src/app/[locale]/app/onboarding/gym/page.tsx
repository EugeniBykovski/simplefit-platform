import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { GymOnboarding } from "@/widgets/gym-onboarding";
import { LaunchScreen } from "@/widgets/system-states";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/onboarding/gym">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymOnboarding" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.onboarding.gym` (SF-86): the Gym owner registration. The
 * onboarding layout keeps it behind the account registration; the step
 * reads `?step=`, so it renders on the client inside a Suspense boundary.
 */
export default async function GymOnboardingPage({
  params,
}: PageProps<"/[locale]/app/onboarding/gym">) {
  await resolveLocaleParam(params);
  return (
    <Suspense fallback={<LaunchScreen />}>
      <GymOnboarding />
    </Suspense>
  );
}
