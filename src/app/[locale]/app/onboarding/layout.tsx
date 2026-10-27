import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { OnboardingGate } from "@/features/session-gate";
import { EntryFailure, LaunchScreen } from "@/widgets/system-states";

/**
 * `web.app.onboarding`: account registration, role choice and the role
 * registration wizards, without product navigation. Account registration
 * comes first (SF-45, `OnboardingGate`); its pending and failure states are
 * full-viewport system screens; role choice (WA6) shows only when the
 * resolver answers `role_selection`. Each step brings its frame: account
 * basics (WA5, SF-46), role choice (WA6, SF-47), the Fighter (SF-38) and
 * Coach (SF-52) registrations the designed onboarding frame, the Gym owner
 * registration (SF-86) its setup frame (GymSetupSteps).
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
    <OnboardingGate pending={<LaunchScreen />} failure={<EntryFailure />}>
      {children}
    </OnboardingGate>
  );
}
