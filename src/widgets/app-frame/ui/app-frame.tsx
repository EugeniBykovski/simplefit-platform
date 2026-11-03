import type { ReactNode } from "react";

import { SessionControl } from "@/features/sign-out";
import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { BrandTile } from "@/shared/ui/brand-mark";
import { Container } from "@/shared/ui/container";

/**
 * Header-only frame for signed-in surfaces without product navigation
 * (route-architecture §8): the /app entry, account-level /app pages until the
 * active workspace's sidebar can be resolved (`web.app.active`), the
 * registration wizards (`web.app.onboarding`) and the /account pages
 * (`web.account`). Server Component. A 76 px brand bar on the site
 * Container (SF-34); `<main>` has no padding, pages compose PageHeader and
 * PageBody.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <Container className="flex h-19 items-center gap-2">
          {/* The name gives way on phones so the session, language and theme controls fit (SF-100). */}
          <Link
            href={routeHref("web.root")}
            className="flex min-w-0 items-center gap-2.5 rounded-md"
          >
            <BrandTile />
            <span className="truncate type-title">{siteConfig.name}</span>
          </Link>
          <div className="ml-auto flex flex-none items-center gap-1">
            <SessionControl />
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
        </Container>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
    </div>
  );
}
