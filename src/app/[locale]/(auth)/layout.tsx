import type { ReactNode } from "react";

import { GuestOnly } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { SessionFailure } from "@/widgets/system-states";

/**
 * `web.auth`: sign-in and sign-up surfaces (GUEST_ONLY routes). Each page
 * renders its designed frame (WA1/WA1b split, WA3/WA4 step header, O02w site
 * chrome). An authenticated viewer enters the application from here: the
 * valid `returnTo`, otherwise `/app` (SF-24).
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return <GuestOnly unavailable={<SessionFailure />}>{children}</GuestOnly>;
}
