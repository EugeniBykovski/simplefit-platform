import type { FighterProfile } from "@/entities/fighter-profile";

/**
 * The current Fighter web registration steps (Claude Design FIGHTER 5c, route
 * registry `web.app.onboarding.fighter`): WF0 `?step=basics`, WF1
 * `?step=profile`, WF6 `?step=complete`. WF2–WF5 (`gym`, `coach`, `privacy`,
 * `notifications`) are DEFERRED and never part of the flow.
 *
 * The step query is navigation only. SF-25 persists the profile, not a UI
 * cursor, so where a visitor lands is derived from the backend state alone.
 */
export const STEPS = ["basics", "profile", "complete"] as const;
export type Step = (typeof STEPS)[number];
export type FormStep = Exclude<Step, "complete">;

type Requirement = FighterProfile["onboarding"]["missing_requirements"][number];

/** The step that asks for each completion requirement (`missing_requirements`). */
export const REQUIREMENT_STEP: Record<Requirement, FormStep> = {
  display_name: "basics",
  username: "basics",
  country_code: "basics",
  city: "basics",
  experience_level: "profile",
  stance: "profile",
};

/** The earliest step with a missing requirement; Boxing profile when only it remains. */
export function resumeStep(profile: FighterProfile): FormStep {
  return profile.onboarding.missing_requirements.some(
    (requirement) => REQUIREMENT_STEP[requirement] === "basics",
  )
    ? "basics"
    : "profile";
}

export type StepDecision = { kind: "step"; step: Step } | { kind: "exit" };

/**
 * What the route shows for the backend `profile` and the requested `?step=`:
 *
 * - A completed profile shows WF6 only right after this tab completed it
 *   (`justCompleted`); otherwise the visitor leaves for the application entry,
 *   so neither a deep link nor `?step=complete` restarts or fakes anything.
 * - An unfinished profile shows a requested form step (both stay editable),
 *   and otherwise, including `?step=complete`, a deferred step or garbage,
 *   the earliest step with a missing requirement.
 */
export function decideStep(
  profile: FighterProfile,
  requested: string | null,
  justCompleted: boolean,
): StepDecision {
  if (profile.onboarding.status === "completed") {
    return justCompleted ? { kind: "step", step: "complete" } : { kind: "exit" };
  }
  if (requested === "basics" || requested === "profile") return { kind: "step", step: requested };
  return { kind: "step", step: resumeStep(profile) };
}
