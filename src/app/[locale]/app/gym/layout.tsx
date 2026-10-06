import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { WorkspaceShell } from "@/widgets/workspace-shell";

/** `web.app.gym`: Gym workspace (console) sidebar. */
export default async function GymLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return <WorkspaceShell shell="web.app.gym">{children}</WorkspaceShell>;
}
