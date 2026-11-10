import type { ReactNode } from "react";

import { RequireSession } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { signInRouteFor } from "@/shared/routes/routes";
import { AdminWorkspace } from "@/widgets/admin-workspace";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/**
 * `web.admin`: the Control Plane. Admin is a backend-granted operator capability
 * on the same User (D-ADMIN-IDENTITY, simplefit-api ADR 0028). After sign-in,
 * AdminWorkspace asks the backend (`GET /api/v1/admin/me`) and shows AD0 (key
 * enrolment, key check, unavailable) until it reports an active operator with a
 * key check for this session (SF-120); the frontend never holds that state.
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
      <AdminWorkspace>{children}</AdminWorkspace>
    </RequireSession>
  );
}
