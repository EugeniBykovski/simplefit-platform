import type { SponsorApplication, SponsorApplicationPolicy } from "@/entities/sponsor-application";
import type { SponsorApplicationMissingFieldsItem } from "@/shared/api/generated/model";

/**
 * The eight steps of the sponsor application (Claude Design SPA1, the one
 * form source for SP1–SP7 and review, canvas 1794214317-c2e0), in the
 * designed order. The six answer steps are the backend policy's steps
 * (`ApplicationPolicy` `steps`); `uploads` (SP7, SF-114 evidence) and
 * `review` hold no answers.
 */
export const STEPS = [
  "company",
  "contact",
  "interests",
  "markets",
  "budget",
  "goals",
  "uploads",
  "review",
] as const;

export type StepKey = (typeof STEPS)[number];
export type AnswerField = SponsorApplicationMissingFieldsItem;
export type AnswerStep = Exclude<StepKey, "uploads" | "review">;

/** The answers of each step, as the policy (`sponsor-application-2026-11.v1`) groups them. */
export const STEP_FIELDS: Record<AnswerStep, readonly AnswerField[]> = {
  company: ["company_name", "website", "country_code", "industry"],
  contact: ["contact_full_name", "contact_position", "contact_email", "contact_phone"],
  interests: ["interests"],
  markets: ["market_scope", "market_countries", "market_cities"],
  budget: ["budget_band"],
  goals: ["goals"],
};

export function isStep(value: unknown): value is StepKey {
  return typeof value === "string" && (STEPS as readonly string[]).includes(value);
}

/** The fields of `step`, from the backend policy when it names the step, else the designed set. */
export function fieldsOf(
  step: StepKey,
  policy?: Pick<SponsorApplicationPolicy, "steps">,
): readonly AnswerField[] {
  if (step === "uploads" || step === "review") return [];
  const fromPolicy = policy?.steps.find((entry) => entry.step === step)?.fields;
  return (fromPolicy as AnswerField[] | undefined) ?? STEP_FIELDS[step];
}

/** The step an answer belongs to (`review` for one this client does not know). */
export function stepOfField(
  field: string,
  policy?: Pick<SponsorApplicationPolicy, "steps">,
): StepKey {
  for (const step of STEPS) {
    if ((fieldsOf(step, policy) as readonly string[]).includes(field)) return step;
  }
  return "review";
}

/** Whether the backend lets the viewer change the answers now. */
export const isEditable = (application: SponsorApplication | null) =>
  application === null || application.allowed_actions.includes("edit");

/**
 * The answers the viewer may change: every answer of a draft; after a change
 * request only the requested ones (ADR 0032 rule 4). A UX hint: the backend
 * refuses the rest (`not_requested`).
 */
export function changeableFields(
  application: SponsorApplication | null,
): ReadonlySet<string> | null {
  if (application?.status === "changes_requested" && application.change_request !== null) {
    return new Set(application.change_request.fields);
  }
  return null;
}

/**
 * Where a returning applicant continues: the first step with a requested
 * change, else the first step the backend still reports answers missing for,
 * else review. The backend stores no position, so this is derived, never
 * remembered.
 */
export function resumeStep(
  application: SponsorApplication,
  policy?: Pick<SponsorApplicationPolicy, "steps">,
): StepKey {
  const requested = application.change_request?.fields[0];
  if (application.status === "changes_requested" && requested !== undefined) {
    return stepOfField(requested, policy);
  }
  const missing = application.missing_fields[0];
  return missing === undefined ? "review" : stepOfField(missing, policy);
}
