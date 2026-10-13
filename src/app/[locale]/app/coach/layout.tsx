import type { ReactNode } from "react";

import { CoachGate } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { EntryFailure, LaunchScreen } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

/**
 * `web.app.coach`: Coach workspace sidebar. Its pages need a completed Coach
 * onboarding (capability COACH, phase ACTIVE): the gate sends anyone else
 * where the entry resolver says (SF-52).
 */
export default async function CoachLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <CoachGate pending={<LaunchScreen />} failure={<EntryFailure />}>
      <WorkspaceShell shell="web.app.coach">{children}</WorkspaceShell>
    </CoachGate>
  );
}
