import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { GuestOnly } from "@/features/session-gate";
import { EntryFailure, SessionFailure } from "@/widgets/system-states";

/**
 * `web.auth`: sign-in and sign-up surfaces (GUEST_ONLY routes). Each page
 * renders its designed frame (WA1/WA1b split, WA3/WA4 step header, O02w site
 * chrome). An authenticated viewer enters the application from here,
 * through the backend entry resolution with the page's `returnTo` and
 * `intent` continuation (SF-45).
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <GuestOnly unavailable={<SessionFailure />} entryFailure={<EntryFailure />}>
      {children}
    </GuestOnly>
  );
}
