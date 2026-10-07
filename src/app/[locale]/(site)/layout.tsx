import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { SiteFrame } from "@/widgets/site-header";

/** `web.site`: the public website (PUBLIC routes). */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return <SiteFrame>{children}</SiteFrame>;
}
