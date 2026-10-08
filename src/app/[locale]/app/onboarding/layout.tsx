import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { OnboardingGate } from "@/features/session-gate";
import { AppFrame } from "@/widgets/app-frame";
import { EntryFailure, LaunchScreen } from "@/widgets/system-states";

/**
 * `web.app.onboarding`: account registration, role choice and the role
 * registration wizards, without product navigation. Account registration
 * comes first (SF-45, `OnboardingGate`).
 */
export default async function OnboardingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <AppFrame>
      <OnboardingGate pending={<LaunchScreen />} failure={<EntryFailure />}>
        {children}
      </OnboardingGate>
    </AppFrame>
  );
}
