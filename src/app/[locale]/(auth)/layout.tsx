import type { ReactNode } from "react";

import { GuestOnly } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { AuthShell } from "@/widgets/auth-frame";

/** `web.auth`: sign-in and sign-up surfaces (GUEST_ONLY routes). */
export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <GuestOnly>
      <AuthShell>{children}</AuthShell>
    </GuestOnly>
  );
}
