import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { BrandTile, BrandWordmark } from "@/shared/ui/brand-mark";
import { Container } from "@/shared/ui/container";

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

/**
 * WA1 / WA1b (WebLogin, WebSignInCode): two equal columns inside the
 * canonical 1440 px frame (SF-34 Container `frame`), centred beyond it.
 *
 * - Left: the gradient brand panel, 56 × 64 px padding, 20 px rhythm: the
 *   brand at the top, flexible space, then the bottom-anchored "Welcome
 *   back." headline and the `panel` card ("After sign-in"). The artboard's
 *   line between them ("You land in your last workspace") describes a
 *   runtime fact the API cannot provide yet and is not rendered (SF-25+).
 * - Right: the 440 px auth column (`children`), centred in its half.
 */
export function AuthSplitFrame({
  hero,
  panel,
  children,
}: {
  hero: string;
  panel: ReactNode;
  children: ReactNode;
}) {
  return (
    <Container size="frame" data-auth-frame="split" className="grid min-h-dvh lg:grid-cols-2">
      <div
        data-auth-panel
        className="hidden flex-col gap-5 bg-linear-160 from-accent to-background to-70% px-16 py-14 lg:flex"
      >
        <AuthBrand size="lg" />
        <span className="flex-1" />
        <p data-auth-hero className="type-auth-hero text-balance">
          {hero}
        </p>
        {panel}
      </div>
      <main id="main" tabIndex={-1} className="relative flex flex-col outline-none">
        <div className="flex items-center justify-between gap-4 px-4 pt-4 sm:px-6 lg:absolute lg:inset-x-0 lg:top-0 lg:justify-end lg:px-12 lg:pt-6">
          <AuthBrand size="sm" className="lg:hidden" />
          <AuthControls />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:p-12">
          <div data-auth-column className="w-full max-w-110">
            {children}
          </div>
        </div>
      </main>
    </Container>
  );
}

/**
 * The titled row lists of the auth panels (WA1 "After sign-in", WA3 "What
 * happens next", WA4 "After verifying"): a mono label over 60 px rows with
 * a title and a detail line, hairlines between rows, radius `3xl`. A static
 * overview: no row is a link or a resolved runtime fact. The artboards'
 * internal screen codes (W01, WF1, …) are not user copy and are omitted.
 */
export function AuthInfoList({
  title,
  rows,
  variant = "card",
  className,
}: {
  title: string;
  rows: readonly { key: string; title: string; detail: string }[];
  /** `panel`: translucent on the WA1 gradient (14 × 18 px); `card`: the surface card (16 × 20 px). */
  variant?: "panel" | "card";
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      data-auth-info-list
      className={cn(
        "flex flex-col gap-0.5 rounded-3xl border",
        variant === "panel" ? "max-w-115 bg-background/60 px-4.5 py-3.5" : "bg-surface px-5 py-4",
        className,
      )}
    >
      <p className="type-label text-faint-foreground">{title}</p>
      <ul>
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex min-h-15 flex-col justify-center gap-0.5 border-b py-2 last:border-b-0"
          >
            <span className="type-body font-extrabold">{row.title}</span>
            <span className="type-caption text-muted-foreground">{row.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * WA3 / WA4: a 72 px header (56 px gutters) and the step beside an optional
 * 420 px aside (56 px gap, 64 px gutters), both inside the canonical 1440 px
 * frame. `action` sits at the right of the header ("Already a member? Sign in").
 */
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
        <Container
          size="frame"
          className="flex h-18 items-center gap-4 px-4 sm:px-6 md:px-8 lg:px-14"
        >
          <AuthBrand size="sm" />
          <span className="flex-1" />
          {action && (
            <div className="hidden type-body-sm text-muted-foreground sm:block">{action}</div>
          )}
          <AuthControls />
        </Container>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Container
          data-auth-frame="step"
          className={cn(
            "grid gap-14 py-10 lg:py-12",
            aside !== undefined && "lg:grid-cols-[minmax(0,1fr)_420px]",
          )}
        >
          <div className="min-w-0">{children}</div>
          {aside !== undefined && <aside className="flex min-w-0 flex-col gap-3.5">{aside}</aside>}
        </Container>
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
