import type { ReactNode } from "react";

import { RequireSession } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { signInRouteFor } from "@/shared/routes/routes";
import { AppFrame } from "@/widgets/app-frame";

/**
 * `web.account`: restricted-account and recovery pages, outside /app and
 * every workspace (AUTHENTICATED). Sending suspended or pending-deletion
 * accounts here needs the account state from the API (identity ticket).
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <RequireSession signIn={signInRouteFor("web")}>
      <AppFrame>{children}</AppFrame>
    </RequireSession>
  );
}
