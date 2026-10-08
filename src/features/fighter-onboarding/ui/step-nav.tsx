"use client";

import { useTranslations } from "next-intl";

import { OnboardingStepCard } from "@/shared/ui/onboarding-frame";

import type { FormStep, Step } from "../model/steps";

/**
 * The WF step card: the current step on the olive well, a finished Profile
 * basics with its check, the other form step as a button that saves and
 * moves, and Complete, which only the backend reaches.
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
  const formStep = (step: FormStep) => {
    if (step === current)
      return { key: step, label: t(`steps.${step}`), state: "current" as const };
    const done = step === "basics" && basicsDone;
    return {
      key: step,
      label: t(`steps.${step}`),
      state: done ? ("done" as const) : ("todo" as const),
      hint: done ? t("done") : undefined,
      onSelect: () => onNavigate(step),
    };
  };
  return (
    <OnboardingStepCard
      label={t("label")}
      title={t("title")}
      note={t("note")}
      steps={[
        formStep("basics"),
        formStep("profile"),
        current === "complete"
          ? { key: "complete", label: t("steps.complete"), state: "current" }
          : { key: "complete", label: t("steps.complete"), state: "later", hint: t("unavailable") },
      ]}
    />
  );
}
