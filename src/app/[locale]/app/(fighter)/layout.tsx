import type { ReactNode } from "react";

import { FighterGate } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { EntryFailure, LaunchScreen } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

/**
 * `web.app.fighter`: Fighter workspace sidebar. Its pages need a completed
 * Fighter onboarding (capability FIGHTER, phase ACTIVE): the gate sends
 * anyone else where the entry resolver says (SF-40).
 */
export default async function FighterLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <FighterGate pending={<LaunchScreen />} failure={<EntryFailure />}>
      <WorkspaceShell shell="web.app.fighter">{children}</WorkspaceShell>
    </FighterGate>
  );
}
