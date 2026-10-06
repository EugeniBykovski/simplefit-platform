import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { WorkspaceShell } from "@/widgets/workspace-shell";

/** `web.app.coach`: Coach workspace sidebar. */
export default async function CoachLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return <WorkspaceShell shell="web.app.coach">{children}</WorkspaceShell>;
}
