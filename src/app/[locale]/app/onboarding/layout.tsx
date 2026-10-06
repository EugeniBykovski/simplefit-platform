import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { AppFrame } from "@/widgets/app-frame";

/** `web.app.onboarding`: registration wizards, without product navigation. */
export default async function OnboardingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return <AppFrame>{children}</AppFrame>;
}
