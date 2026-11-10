import type { ReactNode } from "react";

import { RequireSession } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { signInRouteFor } from "@/shared/routes/routes";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/**
 * `/sponsor`: the partner portal needs a session. Its shell (`web.sponsor`)
 * belongs to one organization and renders in `[sponsorId]/layout.tsx`
 * (SF-117, D-SA26).
 */
export default async function SponsorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <RequireSession
      signIn={signInRouteFor("web.sponsor")}
      pending={<LaunchScreen />}
      unavailable={<SessionFailure />}
    >
      {children}
    </RequireSession>
  );
}
