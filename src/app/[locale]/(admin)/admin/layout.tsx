import type { ReactNode } from "react";

import { RequireSession } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { signInRouteFor } from "@/shared/routes/routes";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

/**
 * `web.admin`: the internal admin control plane. Admin is a backend-granted
 * staff capability on the same User (D-ADMIN-IDENTITY); its check (and any
 * step-up) arrives with the admin identity work, never as frontend state.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <RequireSession
      signIn={signInRouteFor("web.admin")}
      pending={<LaunchScreen />}
      unavailable={<SessionFailure />}
    >
      <WorkspaceShell shell="web.admin">{children}</WorkspaceShell>
    </RequireSession>
  );
}
