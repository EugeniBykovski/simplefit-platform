import type { ReactNode } from "react";

import { AppFrame } from "@/widgets/app-frame";

/**
 * The onboarding steps that render in the header-only `AppFrame` until their
 * tickets design their own frame: role choice (WA6) and the Coach and Gym
 * registration entries.
 */
export default function OnboardingAppFrameLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
