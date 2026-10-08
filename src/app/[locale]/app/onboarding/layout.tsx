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
 * basics (WA5, SF-46), role choice (WA6, SF-47) and the Fighter registration
 * (SF-38) the designed onboarding frame, the other steps `AppFrame` (the
 * `(app-frame)` group).
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
