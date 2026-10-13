import type { CoachProfile, CoachProfilePatch } from "@/entities/coach-profile";
import {
  CoachProfileUpdateRequestCoachingFormatsItem,
  CoachProfileUpdateRequestCompetitionLevelsItem,
  CoachProfileUpdateRequestLanguagesItem,
  type CoachProfileUpdateRequestCoachingFormatsItem as CoachingFormat,
  type CoachProfileUpdateRequestCompetitionLevelsItem as CompetitionLevel,
  type CoachProfileUpdateRequestLanguagesItem as Language,
} from "@/shared/api/generated/model";

import type { FieldMessage } from "./errors";

/*
 * The form values of WCR1 and WCR2 and their translation to and from the
 * SF-50 profile. The vocabularies are the generated OpenAPI enums, in their
 * contract order: no web-only values. The lengths below mirror the contract
 * for immediate feedback only; the API stays the authority.
 */

export const COACHING_FORMATS = Object.values(CoachProfileUpdateRequestCoachingFormatsItem);
export const COMPETITION_LEVELS = Object.values(CoachProfileUpdateRequestCompetitionLevelsItem);
export const LANGUAGES = Object.values(CoachProfileUpdateRequestLanguagesItem);

export const LIMITS = { display_name: 60, brand_name: 80, city: 80, bio: 500 } as const;

/** Characters as the API counts them (code points, not UTF-16 units), after trimming. */
export const lengthOf = (value: string) => Array.from(value.trim()).length;

export type ProfileValues = {
  display_name: string;
  brand_name: string;
  country_code: string | null;
  city: string;
  bio: string;
  languages: Language[];
};

export type TypeValues = {
  coaching_formats: CoachingFormat[];
  competition_levels: CompetitionLevel[];
};

const text = (value: string | null | undefined) => value ?? "";

export function profileFrom(profile: CoachProfile): ProfileValues {
  return {
    display_name: text(profile.display_name),
    brand_name: text(profile.brand_name),
    country_code: profile.country_code ?? null,
    city: text(profile.city),
    bio: text(profile.bio),
    languages: [...profile.languages],
  };
}

export function typeFrom(profile: CoachProfile): TypeValues {
  return {
    coaching_formats: [...profile.coaching_formats],
    competition_levels: [...profile.competition_levels],
  };
}

/** Trimmed text, or `null` (the API's "clear this field") when empty. */
const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function profilePatch(values: ProfileValues): CoachProfilePatch {
  return {
    display_name: orNull(values.display_name),
    brand_name: orNull(values.brand_name),
    country_code: values.country_code,
    city: orNull(values.city),
    bio: orNull(values.bio),
    languages: values.languages,
  };
}

export function typePatch(values: TypeValues): CoachProfilePatch {
  return {
    coaching_formats: values.coaching_formats,
    competition_levels: values.competition_levels,
  };
}

/**
 * WCR1's Continue checks before saving: the step's completion requirements
 * and the contract lengths, as the API would report them. Its answer
 * replaces these.
 */
export function profileErrors(
  values: ProfileValues,
): Partial<Record<keyof ProfileValues, FieldMessage>> {
  const errors: Partial<Record<keyof ProfileValues, FieldMessage>> = {};
  if (values.display_name.trim() === "") errors.display_name = "required.display_name";
  if (values.country_code === null) errors.country_code = "required.country_code";
  if (values.city.trim() === "") errors.city = "required.city";
  for (const field of ["display_name", "brand_name", "city", "bio"] as const) {
    if (errors[field] === undefined && lengthOf(values[field]) > LIMITS[field])
      errors[field] = "tooLong";
  }
  return errors;
}

/** WCR2's Finish check: at least one coaching format. */
export function typeErrors(values: TypeValues): Partial<Record<keyof TypeValues, FieldMessage>> {
  return values.coaching_formats.length === 0
    ? { coaching_formats: "required.coaching_formats" }
    : {};
}

/**
 * The editable coach-name suggestion for a new, unsaved profile: the
 * account's full name, offered in the field and saved only when the visitor
 * continues with it. Never for a profile with a saved name, never past the
 * contract length, and never written to the account.
 */
export function nameSuggestion(
  profile: CoachProfile,
  fullName: string | null | undefined,
): string | undefined {
  if (profile.onboarding.status !== "not_started" || profile.display_name !== null)
    return undefined;
  const name = fullName?.trim() ?? "";
  return name === "" || lengthOf(name) > LIMITS.display_name ? undefined : name;
}
