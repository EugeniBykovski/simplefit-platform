"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";

import type { FormStep, Step } from "../model/steps";

/**
 * The WF step card (250 px column of WF0 / WF1): the current step on the
 * olive well, a finished step with its check, the other form step as a
 * button that saves and moves, and Complete, which only the backend reaches.
 */
export function StepNav({
  current,
  basicsDone,
  onNavigate,
}: {
  current: Step;
  /** Every Profile basics requirement is saved (no basics field in `missing_requirements`). */
  basicsDone: boolean;
  onNavigate: (step: FormStep) => void;
}) {
  const t = useTranslations("fighterOnboarding.nav");
  const items: { step: Step; index: number }[] = [
    { step: "basics", index: 1 },
    { step: "profile", index: 2 },
    { step: "complete", index: 3 },
  ];

  return (
    <nav
      aria-label={t("label")}
      data-step-nav
      className="flex flex-col gap-1 rounded-3xl border bg-surface p-4.5"
    >
      <p className="type-label text-highlight">{t("title")}</p>
      <p className="pt-1 pb-2.5 type-caption text-faint-foreground">{t("note")}</p>
      <ol className="flex flex-col gap-1">
        {items.map(({ step, index }) => {
          const label = t(`steps.${step}`);
          if (step === current) {
            return (
              <li key={step}>
                <span
                  aria-current="step"
                  className="flex h-10 items-center gap-3 rounded-md bg-accent px-2.5 text-accent-foreground"
                >
                  <span className="flex size-6.5 flex-none items-center justify-center rounded-full border-2 border-highlight type-micro font-mono">
                    {index}
                  </span>
                  <span className="type-body-sm font-extrabold">{label}</span>
                </span>
              </li>
            );
          }
          if (step === "complete") {
            return (
              <li key={step}>
                <span className="flex h-10 items-center gap-3 px-2.5 text-faint-foreground">
                  <span
                    aria-hidden
                    className="size-6.5 flex-none rounded-full border-[1.5px] border-dashed border-border-strong"
                  />
                  <span className="type-body-sm font-extrabold">
                    {label}
                    <span className="sr-only"> ({t("unavailable")})</span>
                  </span>
                </span>
              </li>
            );
          }
          const done = step === "basics" && basicsDone;
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => onNavigate(step)}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-left outline-none hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring",
                  done ? "text-muted-foreground" : "text-faint-foreground",
                )}
              >
                {done ? (
                  <span className="flex size-6.5 flex-none items-center justify-center rounded-full bg-highlight text-highlight-foreground">
                    <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="flex size-6.5 flex-none items-center justify-center rounded-full border-[1.5px] border-border-strong type-micro font-mono">
                    {index}
                  </span>
                )}
                <span className="type-body-sm font-extrabold">
                  {label}
                  {done && <span className="sr-only"> ({t("done")})</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
