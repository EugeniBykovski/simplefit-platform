import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";

type AuthFrameProps = {
  title: string;
  description: string;
  /** The sign-in methods. */
  children: ReactNode;
  /** The link to the other auth page. */
  footer: ReactNode;
};

/**
 * The smallest frame for /login and /signup (SF-22): brand, heading, the
 * sign-in methods and a link between the two pages. The designed web auth
 * shell (WA1, O02w, `web.auth`) is built by SF-24; Server Component.
 */
export function AuthFrame({ title, description, children, footer }: AuthFrameProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-md type-title">
          {siteConfig.name}
        </Link>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-4 py-10 outline-none"
      >
        <div className="flex w-full max-w-sm flex-col gap-4">
          <h1 className="type-h1">{title}</h1>
          <p className="type-body-sm text-pretty text-muted-foreground">{description}</p>
          {children}
          <p className="type-body-sm text-faint-foreground">{footer}</p>
        </div>
      </main>
    </div>
  );
}
