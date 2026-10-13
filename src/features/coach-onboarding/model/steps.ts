import type { CoachProfile } from "@/entities/coach-profile";

/**
 * The current Coach web registration steps (Claude Design COACH 5d, version
 * 1791896379-65b7; route registry `web.app.onboarding.coach`): WCR1
 * `?step=profile`, WCR2 `?step=type`, WCR7 `?step=complete`. WCR3–WCR6
 * (`credentials`, `size`, `gym`, `plan`) are FUTURE and never part of the
 * flow: their verification, gym and billing domains do not exist.
 *
 * The step query is navigation only. SF-50 persists the profile, not a UI
 * cursor, so where a visitor lands is derived from the backend state alone.
 */
export const STEPS = ["profile", "type", "complete"] as const;
export type Step = (typeof STEPS)[number];
export type FormStep = Exclude<Step, "complete">;

type Requirement = CoachProfile["onboarding"]["missing_requirements"][number];

/** The step that asks for each completion requirement (`missing_requirements`). */
export const REQUIREMENT_STEP: Record<Requirement, FormStep> = {
  display_name: "profile",
  country_code: "profile",
  city: "profile",
  coaching_formats: "type",
};

/** The earliest step with a missing requirement; Coaching type when only it remains. */
export function resumeStep(profile: CoachProfile): FormStep {
  return profile.onboarding.missing_requirements.some(
    (requirement) => REQUIREMENT_STEP[requirement] === "profile",
  )
    ? "profile"
    : "type";
}

export type StepDecision = { kind: "step"; step: Step } | { kind: "exit" };

/**
 * What the route shows for the backend `profile` and the requested `?step=`:
 *
 * - A completed profile shows WCR7 only right after this tab completed it
 *   (`justCompleted`); otherwise the visitor leaves for the application
 *   entry, so neither a deep link nor `?step=complete` restarts or fakes
 *   anything.
 * - An unfinished profile shows a requested form step (both stay editable),
 *   and otherwise, including `?step=complete`, a FUTURE step or garbage, the
 *   earliest step with a missing requirement.
 */
export function decideStep(
  profile: CoachProfile,
  requested: string | null,
  justCompleted: boolean,
): StepDecision {
  if (profile.onboarding.status === "completed") {
    return justCompleted ? { kind: "step", step: "complete" } : { kind: "exit" };
  }
  if (requested === "profile" || requested === "type") return { kind: "step", step: requested };
  return { kind: "step", step: resumeStep(profile) };
}
