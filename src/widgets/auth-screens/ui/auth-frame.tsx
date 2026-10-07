import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { BrandTile, BrandWordmark } from "@/shared/ui/brand-mark";

/*
 * The `web.auth` frames (route-architecture §8; Claude Design onboarding
 * page, 1440 frames). Minimal chrome without product navigation:
 *
 * - `AuthSplitFrame`: WA1 sign in and WA1b sign-in code. Brand panel on the
 *   left half, the form column (440 px) centred in the right half.
 * - `AuthStepFrame`: WA3 / WA4 registration steps (and the sponsor and admin
 *   sign-in placeholders): a 72 px header with the brand, then the step
 *   beside an optional 420 px aside.
 *
 * O02w sign-up renders inside the public site header and footer instead.
 * The language and theme switchers are production additions the design does
 * not draw; they sit where they do not move the designed geometry. Below
 * `lg` (the design draws only 1440) the brand panel and the aside stack.
 */

function AuthBrand({ size, className }: { size: "sm" | "lg"; className?: string }) {
  return (
    <Link
      href={routeHref("web.root")}
      className={cn(
        "flex w-fit items-center rounded-md",
        size === "lg" ? "gap-3" : "gap-2.5",
        className,
      )}
    >
      <BrandTile size={size} />
      <BrandWordmark />
    </Link>
  );
}

function AuthControls() {
  return (
    <div className="flex items-center gap-1">
      <LocaleSwitcher />
      <ThemeSwitcher />
    </div>
  );
}

/** WA1 / WA1b. `hero` is the panel's display line ("Welcome back."). */
export function AuthSplitFrame({ hero, children }: { hero: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col gap-5 bg-linear-160 from-accent to-background to-70% px-16 py-14 lg:flex">
        <AuthBrand size="lg" />
        <span className="flex-1" />
        <p className="type-auth-hero text-balance">{hero}</p>
      </div>
      <main id="main" tabIndex={-1} className="relative flex flex-col outline-none">
        <div className="flex items-center justify-between gap-4 px-4 pt-4 sm:px-6 lg:absolute lg:inset-x-0 lg:top-0 lg:justify-end lg:px-12 lg:pt-6">
          <AuthBrand size="sm" className="lg:hidden" />
          <AuthControls />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:p-12">
          <div className="w-full max-w-110">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** WA3 / WA4. `action` sits at the right of the header ("Already a member? Sign in"). */
export function AuthStepFrame({
  action,
  aside,
  children,
}: {
  action?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="flex h-18 items-center gap-4 px-4 sm:px-6 md:px-8 lg:px-14">
          <AuthBrand size="sm" />
          <span className="flex-1" />
          {action && (
            <div className="hidden type-body-sm text-muted-foreground sm:block">{action}</div>
          )}
          <AuthControls />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <div
          className={cn(
            "grid gap-14 px-4 py-10 sm:px-6 md:px-8 lg:px-16 lg:py-12",
            aside !== undefined && "lg:grid-cols-[minmax(0,1fr)_420px]",
          )}
        >
          <div className="min-w-0">{children}</div>
          {aside !== undefined && <aside className="flex min-w-0 flex-col gap-3.5">{aside}</aside>}
        </div>
      </main>
    </div>
  );
}

/** "or with email" between the provider buttons and the email form (WA1). */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 type-caption text-faint-foreground">
      <span aria-hidden className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
