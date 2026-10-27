import type { GymSetup } from "@/entities/gym-setup";

/**
 * The current Gym owner web registration (SF-86; route registry
 * `web.app.onboarding.gym`, Claude Design GYM 5e with the approved SF-86
 * differences): OG1 `?step=type`, OG2 `?step=location`, OG3
 * `?step=branding`, OG6b `?step=complete`. OG4–OG6 and OG7–OG14 (`size`,
 * `features`, `plan`, `verify` … `launch`) are FUTURE and never part of the
 * flow: their sizing, entitlement, billing, verification, staff, member,
 * timetable and publishing domains do not exist.
 *
 * The step query is navigation only. SF-85 persists the gym, not a UI
 * cursor, so where a visitor lands is derived from the backend state alone.
 */
export const STEPS = ["type", "location", "branding", "complete"] as const;
export type Step = (typeof STEPS)[number];
export type FormStep = Exclude<Step, "complete">;

/** The designed steps after OG3, shown as "coming later" and never reachable. */
export const LATER_STEPS = [
  "size",
  "features",
  "plan",
  "verify",
  "memberships",
  "payments",
  "timetable",
  "team",
  "import",
  "community",
  "launch",
] as const;
export type LaterStep = (typeof LATER_STEPS)[number];

type Requirement = GymSetup["missing_requirements"][number];

/** The step that asks for each completion requirement (`missing_requirements`). */
export const REQUIREMENT_STEP: Record<Requirement, FormStep> = {
  name: "type",
  gym_type: "type",
  primary_location: "location",
};

/** The earliest step with a missing requirement; Branding once only optional fields remain. */
export function resumeStep(setup: GymSetup | null): FormStep {
  if (setup === null) return "type";
  const steps = setup.missing_requirements.map((requirement) => REQUIREMENT_STEP[requirement]);
  if (steps.includes("type")) return "type";
  if (steps.includes("location")) return "location";
  return "branding";
}

export type StepDecision = { kind: "step"; step: Step } | { kind: "exit" };

const FORM_STEPS: readonly string[] = ["type", "location", "branding"];

/**
 * What the route shows for the backend `setup` (`null`: no draft yet) and the
 * requested `?step=`:
 *
 * - No draft: OG1 only, which creates it; any other step resolves there.
 * - A completed gym shows OG6b only right after this tab completed it
 *   (`justCompleted`); otherwise the visitor leaves through the application
 *   entry, so neither a deep link nor `?step=complete` fakes a completion.
 * - A draft shows a requested form step (all three stay editable), and
 *   otherwise, including `?step=complete`, a FUTURE step or garbage, the
 *   earliest step with a missing requirement.
 */
export function decideStep(
  setup: GymSetup | null,
  requested: string | null,
  justCompleted: boolean,
): StepDecision {
  if (setup === null) return { kind: "step", step: "type" };
  if (setup.setup_status === "completed") {
    return justCompleted ? { kind: "step", step: "complete" } : { kind: "exit" };
  }
  if (requested !== null && FORM_STEPS.includes(requested)) {
    return { kind: "step", step: requested as FormStep };
  }
  return { kind: "step", step: resumeStep(setup) };
}
