import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { AppFrame } from "@/widgets/app-frame";

/**
 * `web.app.active`: account-level /app pages (billing, checkout, payments,
 * settings, marketplace, calendar, messages). The registry renders them in
 * the sidebar of the active workspace; until the API exposes the active
 * workspace (D-WEB-WORKSPACE-SWITCHER), they render in the header-only frame
 * rather than in a guessed workspace.
 */
export default async function ActiveLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return <AppFrame>{children}</AppFrame>;
}
