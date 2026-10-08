import { CheckIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";

import { Badge } from "./badge";
import { BrandTile, BrandWordmark } from "./brand-mark";
import { Container } from "./container";

/*
 * The onboarding frame of the signed-in setup steps (Claude Design V78:
 * WA5 Account basics, WF0 / WF1 / WF6 Fighter registration): a 72 px header
 * (the brand on the 56 px gutter; a badge and an action at the right), then
 * the step's content; a form step lays out as the 250 px step card, the
 * fluid form and the 320 px aside on the site Container (64 px gutters,
 * 48 px above). Full-bleed, fluid in width (docs/design-system.md,
 * "Responsive composition"). Presentation only: the steps, actions and
 * content come from each flow.
 */

export function OnboardingFrame({
  badge,
  badgeVariant = "accent",
  actions,
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  badge: ReactNode;
  /** WF draws its badge on the olive accent, WA5 on the neutral well. */
  badgeVariant?: "accent" | "neutral";
  actions?: ReactNode;
}) {
  return (
    <div className={cn("flex min-h-dvh w-full flex-col bg-background", className)} {...props}>
      <header className="h-18 flex-none border-b border-border-subtle">
        <Container
          size="frame"
          className="flex h-full items-center gap-4 px-4 sm:px-6 md:px-8 desktop:px-14"
        >
          <Link href={routeHref("web.root")} className="flex w-fit items-center gap-2.5 rounded-md">
            <BrandTile size="sm" />
            <BrandWordmark size="sm" />
          </Link>
          <span className="flex-1" />
          <div className="flex items-center gap-4">
            <Badge variant={badgeVariant}>{badge}</Badge>
            {actions}
          </div>
        </Container>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
    </div>
  );
}

/** The header's text action ("Save & exit", "Sign out"): 13 px 800 on the muted foreground. */
export const onboardingActionClass =
  "h-auto rounded-xs px-0 type-body-sm font-extrabold text-muted-foreground outline-none hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

/** A form step: the step card, the form column and the aside, top-aligned. */
export function OnboardingGrid({ className, ...props }: ComponentProps<"div">) {
  return (
    <Container className="py-12">
      <div
        data-onboarding-grid
        className={cn(
          "grid items-start gap-10 desktop:grid-cols-[250px_minmax(0,1fr)_320px]",
          className,
        )}
        {...props}
      />
    </Container>
  );
}

export type OnboardingStep = {
  key: string;
  label: string;
  /**
   * `current`: the step on screen; `done`: finished (a check); `todo`: a later
   * step of this flow; `later`: after the flow, never reachable from here.
   */
  state: "current" | "done" | "todo" | "later";
  /** Makes a `done` / `todo` step a button (the flow saves before moving). */
  onSelect?: () => void;
  /** What a screen reader hears after the label ("done", "after you finish"). */
  hint?: string;
};

const circle = "flex size-6.5 flex-none items-center justify-center rounded-full";

/**
 * The step card (250 px): the mono title, the note, one 40 px row per step
 * (4 px apart) and an optional footnote, on the `surface` well.
 */
export function OnboardingStepCard({
  label,
  title,
  note,
  footnote,
  steps,
}: {
  label: string;
  title: string;
  note: string;
  footnote?: string;
  steps: readonly OnboardingStep[];
}) {
  return (
    <nav
      aria-label={label}
      data-step-nav
      className="flex flex-col gap-1 rounded-3xl border bg-surface p-4.5"
    >
      <p className="type-label text-highlight">{title}</p>
      <p className="pt-1 pb-2.5 type-caption text-faint-foreground">{note}</p>
      <ol className="flex flex-col gap-1">
        {steps.map((step, index) => (
          <li key={step.key}>
            <StepRow step={step} number={index + 1} />
          </li>
        ))}
      </ol>
      {footnote && <p className="px-2.5 pt-2.5 type-micro text-faint-foreground">{footnote}</p>}
    </nav>
  );
}

function StepRow({ step, number }: { step: OnboardingStep; number: number }) {
  const label = (
    <span className="type-body-sm font-extrabold">
      {step.label}
      {step.hint && <span className="sr-only"> ({step.hint})</span>}
    </span>
  );
  if (step.state === "current") {
    return (
      <span
        aria-current="step"
        className="flex h-10 items-center gap-3 rounded-md bg-accent px-2.5 text-accent-foreground"
      >
        <span className={cn(circle, "border-2 border-highlight type-micro font-mono")}>
          {number}
        </span>
        {label}
      </span>
    );
  }
  if (step.state === "later") {
    return (
      <span className="flex h-10 items-center gap-3 px-2.5 text-faint-foreground">
        <span
          aria-hidden
          className="size-6.5 flex-none rounded-full border-[1.5px] border-dashed border-border-strong"
        />
        {label}
      </span>
    );
  }
  const marker =
    step.state === "done" ? (
      <span className={cn(circle, "bg-highlight text-highlight-foreground")}>
        <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
      </span>
    ) : (
      <span className={cn(circle, "border-[1.5px] border-border-strong type-micro font-mono")}>
        {number}
      </span>
    );
  const rowClass = cn(
    "flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-left",
    step.state === "done" ? "text-muted-foreground" : "text-faint-foreground",
  );
  return step.onSelect ? (
    <button
      type="button"
      onClick={step.onSelect}
      className={cn(
        rowClass,
        "outline-none hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {marker}
      {label}
    </button>
  ) : (
    <span className={rowClass}>
      {marker}
      {label}
    </span>
  );
}
