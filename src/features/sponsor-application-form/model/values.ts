import { z } from "zod";

import type { SponsorAnswersPatch } from "@/entities/sponsor-application";
import type {
  SponsorApplicationAnswers,
  SponsorApplicationSaveRequestBudgetBand,
  SponsorApplicationSaveRequestIndustry,
  SponsorApplicationSaveRequestInterestsItem,
  SponsorApplicationSaveRequestMarketScope,
} from "@/shared/api/generated/model";

import type { AnswerField } from "./steps";

/**
 * The form's copy of the answers. Text answers are strings ("" for none),
 * choices `""` until chosen, lists arrays. It is converted to the backend's
 * shape only for a save (`patchFor`), sending exactly the fields given.
 */
export type ApplicationValues = {
  company_name: string;
  website: string;
  country_code: string;
  industry: string;
  contact_full_name: string;
  contact_position: string;
  contact_email: string;
  contact_phone: string;
  interests: string[];
  market_scope: string;
  market_countries: string[];
  market_cities: string[];
  budget_band: string;
  goals: string;
};

export const EMPTY_VALUES: ApplicationValues = {
  company_name: "",
  website: "",
  country_code: "",
  industry: "",
  contact_full_name: "",
  contact_position: "",
  contact_email: "",
  contact_phone: "",
  interests: [],
  market_scope: "",
  market_countries: [],
  market_cities: [],
  budget_band: "",
  goals: "",
};

/** The form values of the backend's answers (`null` and `[]` where not answered). */
export function valuesFrom(
  answers: SponsorApplicationAnswers | null | undefined,
): ApplicationValues {
  if (answers == null) return EMPTY_VALUES;
  return {
    company_name: answers.company_name ?? "",
    website: answers.website ?? "",
    country_code: answers.country_code ?? "",
    industry: answers.industry ?? "",
    contact_full_name: answers.contact_full_name ?? "",
    contact_position: answers.contact_position ?? "",
    contact_email: answers.contact_email ?? "",
    contact_phone: answers.contact_phone ?? "",
    interests: [...answers.interests],
    market_scope: answers.market_scope ?? "",
    market_countries: [...answers.market_countries],
    market_cities: [...answers.market_cities],
    budget_band: answers.budget_band ?? "",
    goals: answers.goals ?? "",
  };
}

const text = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * The save body for `fields`: blank text and unchosen choices are `null`
 * (which clears a saved answer), lists are sent whole. Values are passed
 * through as typed; the backend validates every one (an invalid save
 * changes nothing).
 */
export function patchFor(
  values: ApplicationValues,
  fields: readonly AnswerField[],
): SponsorAnswersPatch {
  const patch: SponsorAnswersPatch = {};
  for (const field of fields) {
    switch (field) {
      case "industry":
        patch.industry = (text(values.industry) as SponsorApplicationSaveRequestIndustry) ?? null;
        break;
      case "market_scope":
        patch.market_scope =
          (text(values.market_scope) as SponsorApplicationSaveRequestMarketScope) ?? null;
        break;
      case "budget_band":
        patch.budget_band =
          (text(values.budget_band) as SponsorApplicationSaveRequestBudgetBand) ?? null;
        break;
      case "interests":
        patch.interests = values.interests as SponsorApplicationSaveRequestInterestsItem[];
        break;
      case "market_countries":
        patch.market_countries = [...values.market_countries];
        break;
      case "market_cities":
        patch.market_cities = [...values.market_cities];
        break;
      default:
        patch[field] = text(values[field]);
    }
  }
  return patch;
}

/** Whether any of `patch`'s answers is non-blank (a first save needs one, ADR 0031 rule 3). */
export function hasAnswer(patch: SponsorAnswersPatch): boolean {
  return Object.values(patch).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined,
  );
}

/**
 * The formats of the OpenAPI contract (`SponsorApplicationSaveRequest`),
 * checked before a save so a typo is said at once. UX only: the backend is
 * authoritative and its `422` reason codes are shown the same way. No
 * requiredness here: what a submission still needs is the backend's
 * `missing_fields`.
 */
export type FormatIssue = "tooLong" | "invalidEmail" | "invalidPhone" | "invalidWebsite";

const formats = {
  company_name: z.string().max(200),
  website: z.union([
    z.literal(""),
    z
      .string()
      .regex(/^https:\/\/\S+$/)
      .max(200),
  ]),
  contact_full_name: z.string().max(120),
  contact_position: z.string().max(120),
  contact_email: z.union([z.literal(""), z.email().max(254)]),
  contact_phone: z.union([z.literal(""), z.string().regex(/^\+[1-9][0-9]{6,14}$/)]),
  goals: z.string().max(2000),
} as const;

const ISSUE: Partial<Record<keyof typeof formats, FormatIssue>> = {
  website: "invalidWebsite",
  contact_email: "invalidEmail",
  contact_phone: "invalidPhone",
};

export const GOALS_MAX = 2000;
export const CITY_MAX = 80;

/** The format issue of each of `fields` whose value breaks the contract. */
export function formatIssues(
  values: ApplicationValues,
  fields: readonly AnswerField[],
): Partial<Record<AnswerField, FormatIssue>> {
  const issues: Partial<Record<AnswerField, FormatIssue>> = {};
  for (const field of fields) {
    if (!(field in formats)) continue;
    const key = field as keyof typeof formats;
    const value = values[key].trim();
    if (!formats[key].safeParse(value).success) {
      issues[field] = ISSUE[key] ?? "tooLong";
    }
  }
  return issues;
}
