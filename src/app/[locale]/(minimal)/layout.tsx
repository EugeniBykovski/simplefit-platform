import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { AuthMinimalFrame } from "@/widgets/auth-screens";

/**
 * `web.minimal`: public pages the design draws outside the public website,
 * with only the 72 px auth header and no site navigation or footer (WA4b,
 * the E01 email-link result). PUBLIC: no session gate.
 */
export default async function MinimalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return <AuthMinimalFrame>{children}</AuthMinimalFrame>;
}
