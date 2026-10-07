import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { BrandTile } from "@/shared/ui/brand-mark";
import { Container } from "@/shared/ui/container";

/**
 * The `web.auth` shell (route-architecture §8): minimal chrome without
 * product navigation for /login, /signup and their steps, /sponsor/login and
 * /admin/login. The designed auth shell (WA1, O02w) is built by SF-24;
 * until then its header sits on the canonical site Container (SF-34).
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header>
        <Container className="flex h-19 items-center justify-between gap-4">
          <Link href={routeHref("web.root")} className="flex items-center gap-2.5 rounded-md">
            <BrandTile />
            <span className="type-title">{siteConfig.name}</span>
          </Link>
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
        </Container>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-4 py-10 outline-none"
      >
        {children}
      </main>
    </div>
  );
}

type AuthFrameProps = {
  title: string;
  description: string;
  /** The sign-in methods. */
  children: ReactNode;
  /** The link to the other auth page. */
  footer: ReactNode;
};

/**
 * The content column of /login and /signup (SF-22, SF-23): heading, the
 * sign-in methods and a link between the two pages. Renders inside
 * `AuthShell`; Server Component.
 */
export function AuthFrame({ title, description, children, footer }: AuthFrameProps) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="type-h1">{title}</h1>
      <p className="type-body-sm text-pretty text-muted-foreground">{description}</p>
      {children}
      <p className="type-body-sm text-faint-foreground">{footer}</p>
    </div>
  );
}
