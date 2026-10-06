import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { WorkspaceShell } from "@/widgets/workspace-shell";

/** `web.app.fighter`: Fighter workspace sidebar. */
export default async function FighterLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return <WorkspaceShell shell="web.app.fighter">{children}</WorkspaceShell>;
}
