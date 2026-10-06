import type { ReactNode } from "react";

import { RequireSession } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { signInRouteFor } from "@/shared/routes/routes";
import { WorkspaceShell } from "@/widgets/workspace-shell";

/** `web.sponsor`: the partner portal. */
export default async function SponsorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <RequireSession signIn={signInRouteFor("web.sponsor")}>
      <WorkspaceShell shell="web.sponsor">{children}</WorkspaceShell>
    </RequireSession>
  );
}
