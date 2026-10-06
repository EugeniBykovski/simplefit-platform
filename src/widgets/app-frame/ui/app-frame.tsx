import type { ReactNode } from "react";

import { SessionControl } from "@/features/sign-out";
import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";

/**
 * Header-only frame for signed-in surfaces without product navigation
 * (route-architecture §8): the /app entry, account-level /app pages until the
 * active workspace's sidebar can be resolved (`web.app.active`), the
 * registration wizards (`web.app.onboarding`) and the /account pages
 * (`web.account`). Server Component.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Link href={routeHref("web.root")} className="rounded-md type-title">
            {siteConfig.name}
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <SessionControl />
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:py-10">
        {children}
      </main>
    </div>
  );
}
