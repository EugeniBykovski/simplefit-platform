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
      <BrandWordmark size={size} />
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
 * WA1 / WA1b (WebLogin, WebSignInCode): a full-viewport split. The frame
 * spans the whole window (x 0 to the viewport width, no outer container or
 * margin) and is two equal halves, so the split line is always at the
 * viewport's centre and both panel backgrounds reach the viewport edges. The
 * artboard's measured widths apply only inside each half.
 *
 * - Left: the gradient brand panel, 56 × 64 px padding, 20 px rhythm: the
 *   brand at the top, flexible space, then the bottom-anchored "Welcome
 *   back." headline and the `panel` card ("After sign-in"). The artboard's
 *   line between them ("You land in your last workspace") describes a
 *   runtime fact the API cannot provide yet and is not rendered (SF-25+);
 *   its 24 px line and 20 px gap stay reserved, so nothing above it moves.
 * - Right: the 440 px auth column (`children`), centred in its half.
 *
 * The artboard is a fixed 1440 × 900 composition. At desktop both halves lay
 * out inside that 900 px box, so a taller window never spreads the panel and
 * the form apart; the panel itself (the gradient owner, as in the artboard)
 * still runs the full height of the window. Below lg the form fills the
 * viewport.
 */
export function AuthSplitFrame({
  hero,
  panel,
  column = "sign-in",
  children,
}: {
  hero: string;
  panel: ReactNode;
  /** WA1 draws a 440 px auth column, WA1b a 446 px one (the code row). */
  column?: "sign-in" | "code";
  children: ReactNode;
}) {
  return (
    <div data-auth-frame="split" className="grid min-h-dvh w-full lg:grid-cols-2">
      <div
        data-auth-panel
        className="hidden bg-linear-160 from-accent to-background to-70% lg:block"
      >
        <div className="flex h-225 flex-col gap-5 px-16 py-14">
          <AuthBrand size="lg" />
          <span className="flex-1" />
          <p data-auth-hero className="type-auth-hero text-balance">
            {hero}
          </p>
          {/* The omitted "last workspace" line's 24 px row (see above). */}
          <span data-auth-hero-reserve className="h-6 flex-none" />
          {panel}
        </div>
      </div>
      <main id="main" tabIndex={-1} className="relative flex flex-col outline-none">
        {/* Below lg the brand panel is hidden; the brand heads the form instead. */}
        <div className="flex items-center px-4 pt-4 sm:px-6 lg:hidden">
          <AuthBrand size="sm" />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:h-225 lg:flex-none lg:p-12">
          <div
            data-auth-column
            className={cn("w-full", column === "code" ? "max-w-[446px]" : "max-w-110")}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
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
  /**
   * `panel`: translucent on the WA1 gradient (14 × 18 px); `card`: the surface
   * card of WA3 (16 / 14 × 20 px); `compact`: the surface card of WA4 (14 × 20 px).
   */
  variant?: "panel" | "card" | "compact";
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      data-auth-info-list
      className={cn(
        "flex flex-col gap-0.5 rounded-3xl border",
        // WA1's max-width (460 px) applies to the content box: 460 + 2 × 18 + 2 = 498.
        variant === "panel" && "max-w-[498px] bg-background/60 px-4.5 py-3.5",
        // 14 px at the bottom: the 14 px label line is 1 px over the artboard's.
        variant === "card" && "bg-surface px-5 pt-4 pb-3.5",
        variant === "compact" && "bg-surface px-5 py-3.5",
        className,
      )}
    >
      <p className="type-label text-faint-foreground">{title}</p>
      <ul className="flex flex-col gap-0.5">
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
 * The 72 px auth header (WA3, WA4, WA4b): the brand on 56 px gutters inside
 * the canonical 1440 px frame, the hairline inside the 72 px. `action` sits
 * at the right ("Already a member? Sign in"). `controls` adds the language
 * and theme switchers the sign-in and sign-up steps carry as production
 * additions; WA4b draws none.
 */
export function AuthHeader({
  action,
  controls = false,
}: {
  action?: ReactNode;
  controls?: boolean;
}) {
  return (
    <header className="h-18 border-b border-border-subtle">
      <Container
        size="frame"
        className="flex h-full items-center gap-4 px-4 sm:px-6 md:px-8 lg:px-14"
      >
        <AuthBrand size="sm" />
        <span className="flex-1" />
        {/* Production addition, kept off the designed right-edge anchor. */}
        {controls && <AuthControls />}
        {action && (
          <div
            data-auth-header-action
            className="hidden type-body-sm text-muted-foreground sm:block"
          >
            {action}
          </div>
        )}
      </Container>
    </header>
  );
}

/**
 * The minimal public frame (`web.minimal`, WA4b WebEmailVerified): the auth
 * header and the page, no site navigation and no footer. The page centres
 * its column in the space below the header, as the artboard does.
 */
export function AuthMinimalFrame({ children }: { children: ReactNode }) {
  return (
    <div data-minimal-frame className="flex min-h-dvh flex-col">
      <AuthHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
    </div>
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
      <AuthHeader action={action} controls />
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
    // 16 px row: the artboard's 17 px divider within 1 px (the caption line is 18).
    <div className="flex h-4 items-center gap-3 type-caption text-faint-foreground">
      <span aria-hidden className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
