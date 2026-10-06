import type { ReactNode } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { SiteFooter, SiteHeader } from "@/widgets/site-header";

/** `web.site`: the public website (PUBLIC routes). */
export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await resolveLocaleParam(params);
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
