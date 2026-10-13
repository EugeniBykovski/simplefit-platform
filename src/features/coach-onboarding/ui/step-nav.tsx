"use client";

import { useTranslations } from "next-intl";

import { OnboardingStepCard, type OnboardingStep } from "@/shared/ui/onboarding-frame";

import type { FormStep, Step } from "../model/steps";

/**
 * The WCR step card: Account (always finished here: the onboarding gate keeps
 * this route behind account registration), the current step on the olive
 * well, the other form step as a button that saves and moves, and Complete,
 * which only the backend reaches.
 */
export function StepNav({
  current,
  profileDone,
  onNavigate,
}: {
  current: Step;
  /** Every Coach profile requirement is saved (none in `missing_requirements`). */
  profileDone: boolean;
  onNavigate: (step: FormStep) => void;
}) {
  const t = useTranslations("coachOnboarding.nav");
  const formStep = (step: FormStep): OnboardingStep => {
    if (step === current) return { key: step, label: t(`steps.${step}`), state: "current" };
    const done = step === "profile" && profileDone;
    return {
      key: step,
      label: t(`steps.${step}`),
      state: done ? "done" : "todo",
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
        { key: "account", label: t("steps.account"), state: "done", hint: t("done") },
        formStep("profile"),
        formStep("type"),
        current === "complete"
          ? { key: "complete", label: t("steps.complete"), state: "current" }
          : { key: "complete", label: t("steps.complete"), state: "later", hint: t("unavailable") },
      ]}
    />
  );
}
