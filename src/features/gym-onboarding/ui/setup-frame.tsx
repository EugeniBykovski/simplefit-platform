"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";

import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { BrandTile } from "@/shared/ui/brand-mark";

import { LATER_STEPS, type FormStep, type Step } from "../model/steps";

/*
 * The Gym setup frame (Claude Design GYM 5e, OG1–OG3 and OG6b at 1440 × 900;
 * component GymSetupSteps): the 300 px setup rail on the surface well at the
 * left, then the step: its header, the form beside the 360 px aside, and the
 * 84 px action bar. Below the desktop range the rail becomes a top bar with
 * the progress and the three steps. Presentation only: what each step shows
 * and does comes from the flow.
 */

export function GymSetupFrame({
  sidebar,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { sidebar: ReactNode }) {
  return (
    <div
      className={cn("flex min-h-dvh w-full flex-col bg-background desktop:flex-row", className)}
      {...props}
    >
      {sidebar}
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
        {children}
      </main>
    </div>
  );
}

const FORM_STEPS = ["type", "location", "branding"] as const satisfies readonly FormStep[];

export type RailStepState = "current" | "done" | "todo" | "locked";

/**
 * The setup rail (GymSetupSteps, reduced by the approved SF-86 differences):
 * the three registration steps, numbered and selectable once the gym exists,
 * then the designed later steps as "coming later", never links. The progress
 * counts the three steps only.
 */
export function SetupSidebar({
  gymName,
  current,
  states,
  onSelect,
}: {
  /** The saved gym name; `null` before the draft exists. */
  gymName: string | null;
  current: Step;
  states: Record<FormStep, RailStepState>;
  onSelect: (step: FormStep) => void;
}) {
  const t = useTranslations("gymOnboarding.rail");
  const position = current === "complete" ? 3 : FORM_STEPS.indexOf(current) + 1;
  const percent = current === "complete" ? 100 : Math.round(((position - 1) / 3) * 100);
  const progress =
    current === "complete" ? t("progressDone") : t("progress", { step: position, total: 3 });

  return (
    <aside
      data-setup-rail
      className="flex-none border-b border-border-subtle bg-surface desktop:sticky desktop:top-0 desktop:flex desktop:h-dvh desktop:w-75 desktop:flex-col desktop:border-b-0"
    >
      <div className="flex flex-col gap-1 px-4 py-4 sm:px-6 md:px-8 desktop:h-full desktop:overflow-y-auto desktop:px-5 desktop:py-6.5">
        <Link
          href={routeHref("web.root")}
          className="flex w-fit items-center gap-2.5 rounded-md px-1.5 pb-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandTile size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="type-brand">{t("title")}</span>
            <span className="truncate type-caption text-muted-foreground">
              {gymName ?? t("newGym")}
            </span>
          </span>
        </Link>
        <p className="px-1.5 type-label text-faint-foreground" id="setup-progress">
          {progress}
        </p>
        <span
          role="progressbar"
          aria-labelledby="setup-progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mx-1.5 mt-2 mb-3 block h-1.5 flex-none overflow-hidden rounded-full bg-border"
        >
          <span
            className="block h-full rounded-full bg-highlight transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </span>
        <nav aria-label={t("label")} className="flex-none">
          <p className="hidden px-2.5 pt-2.5 pb-1 type-label text-faint-foreground desktop:block">
            {t("groupCreate")}
          </p>
          <ol className="grid grid-cols-3 gap-1 desktop:flex desktop:flex-col">
            {FORM_STEPS.map((step, index) => (
              <li key={step} className="min-w-0">
                <RailRow
                  number={index + 1}
                  label={t(`steps.${step}.title`)}
                  sub={t(`steps.${step}.sub`)}
                  state={current === step ? "current" : states[step]}
                  hint={t(`hints.${current === step ? "current" : states[step]}`)}
                  onSelect={() => onSelect(step)}
                />
              </li>
            ))}
          </ol>
          <p className="hidden px-2.5 pt-2.5 pb-1 type-label text-faint-foreground desktop:block">
            {t("groupLater")}
          </p>
          <ol className="hidden flex-col gap-1 desktop:flex" aria-label={t("groupLater")}>
            {LATER_STEPS.map((step) => (
              <li key={step}>
                <span className="flex h-8.5 items-center gap-3 rounded-md px-2.5 text-faint-foreground">
                  <span
                    aria-hidden
                    className="size-5 flex-none rounded-full border-[1.5px] border-dashed border-border-strong"
                  />
                  <span className="truncate type-body-sm font-bold">
                    {t(`later.${step}`)}
                    <span className="sr-only"> ({t("hints.later")})</span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="px-1.5 pt-2 type-caption text-faint-foreground desktop:hidden">
            {t("laterCount", { count: LATER_STEPS.length })}
          </p>
        </nav>
      </div>
    </aside>
  );
}

const dot =
  "flex size-6.5 flex-none items-center justify-center rounded-full type-micro font-mono font-semibold";

function RailRow({
  number,
  label,
  sub,
  state,
  hint,
  onSelect,
}: {
  number: number;
  label: string;
  sub: string;
  state: RailStepState;
  hint: string;
  onSelect: () => void;
}) {
  const marker =
    state === "done" ? (
      <span aria-hidden className={cn(dot, "bg-highlight text-highlight-foreground")}>
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </span>
    ) : (
      <span
        aria-hidden
        className={cn(
          dot,
          state === "current"
            ? "border-2 border-highlight text-accent-foreground"
            : "border-[1.5px] border-border-strong text-faint-foreground",
        )}
      >
        {number}
      </span>
    );
  const text = (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span
        className={cn(
          "truncate type-body-sm font-extrabold",
          state === "current"
            ? "text-accent-foreground"
            : state === "done"
              ? "text-muted-foreground"
              : "text-faint-foreground",
        )}
      >
        {label}
        <span className="sr-only"> ({hint})</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "hidden truncate type-micro desktop:block",
          state === "current" ? "text-accent-muted-foreground" : "text-faint-foreground",
        )}
      >
        {sub}
      </span>
    </span>
  );
  const rowClass =
    "flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-1.5 text-left max-desktop:flex-col max-desktop:items-start max-desktop:gap-1.5 max-desktop:px-1.5";

  if (state === "current") {
    return (
      <span aria-current="step" className={cn(rowClass, "bg-accent")}>
        {marker}
        {text}
      </span>
    );
  }
  if (state === "locked") {
    return (
      <span className={rowClass}>
        {marker}
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        rowClass,
        "outline-none hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {marker}
      {text}
    </button>
  );
}

/** The step header: the mono eyebrow, the 30 px title, the lead and the save status. */
export function StepHeader({
  eyebrow,
  title,
  lead,
  status,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  status?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-4 px-4 pt-8 pb-5.5 sm:px-6 md:px-8 desktop:px-12">
      <hgroup className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
        <p className="type-label text-highlight">{eyebrow}</p>
        <h1 tabIndex={-1} className="type-setup-title text-balance outline-none">
          {title}
        </h1>
        <p className="max-w-160 type-body text-pretty text-muted-foreground">{lead}</p>
      </hgroup>
      {status}
    </header>
  );
}

/** "Saved" once the step matches the backend; "Unsaved changes" while edited. */
export function SaveStatus({ state }: { state: "saved" | "unsaved" | "none" }) {
  const t = useTranslations("gymOnboarding.status");
  if (state === "none") return null;
  return (
    <p className="flex items-center gap-2 type-caption text-faint-foreground" data-save-status>
      {state === "saved" && (
        <CheckIcon aria-hidden className="size-3.5 text-primary-muted" strokeWidth={2.5} />
      )}
      {t(state)}
    </p>
  );
}

/** The form beside the 360 px aside (stacked below the desktop range). */
export function StepBody({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid flex-1 content-start items-start gap-6.5 px-4 pt-1.5 pb-5 sm:px-6 md:px-8 desktop:grid-cols-[minmax(0,1fr)_360px] desktop:px-12">
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
      {aside && <div className="flex min-w-0 flex-col gap-4">{aside}</div>}
    </div>
  );
}

/** The 84 px action bar: Back, the note, Save & exit and the primary action. */
export function StepFooter({
  back,
  note,
  actions,
}: {
  back?: ReactNode;
  note?: string;
  actions: ReactNode;
}) {
  return (
    <footer
      data-step-footer
      className="sticky bottom-0 z-10 flex min-h-21 flex-wrap items-center gap-3 border-t border-border-subtle bg-background px-4 py-4 sm:px-6 md:px-8 desktop:flex-nowrap desktop:px-12"
    >
      {back}
      <span className="hidden flex-1 type-caption text-faint-foreground md:block">{note}</span>
      <span className="flex-1 md:hidden" />
      <div className="flex flex-wrap items-center justify-end gap-3">{actions}</div>
    </footer>
  );
}
