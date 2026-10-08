import type { FighterProfile, FighterProfilePatch } from "@/entities/fighter-profile";
import {
  FighterProfileUpdateRequestExperienceLevel,
  FighterProfileUpdateRequestGoalsItem,
  FighterProfileUpdateRequestStance,
  FighterProfileUpdateRequestWeightClass,
  type FighterProfileUpdateRequestExperienceLevel as ExperienceLevel,
  type FighterProfileUpdateRequestGoalsItem as Goal,
  type FighterProfileUpdateRequestStance as Stance,
  type FighterProfileUpdateRequestWeightClass as WeightClass,
} from "@/shared/api/generated/model";

import type { FieldMessage } from "./errors";

/*
 * The form values of WF0 and WF1 and their translation to and from the SF-25
 * profile. The vocabularies are the generated OpenAPI enums, in their contract
 * order: no web-only values. Numbers stay text while typed and are parsed only
 * to be sent; nothing is rounded, so a weight with more than one decimal goes
 * to the API as typed and comes back as `invalid_format`.
 */

export const EXPERIENCE_LEVELS = Object.values(FighterProfileUpdateRequestExperienceLevel);
export const STANCES = Object.values(FighterProfileUpdateRequestStance);
export const GOALS = Object.values(FighterProfileUpdateRequestGoalsItem);
export const WEIGHT_CLASSES = Object.values(FighterProfileUpdateRequestWeightClass);

export type BasicsValues = {
  display_name: string;
  username: string;
  country_code: string | null;
  city: string;
};

export type ProfileValues = {
  experience_level: ExperienceLevel | null;
  stance: Stance | null;
  amateur_bout_count: string;
  goals: Goal[];
  weight_class: WeightClass | null;
  current_weight_kg: string;
  height_cm: string;
  next_fight_on: string;
  next_fight_name: string;
};

const text = (value: string | null | undefined) => value ?? "";
const number = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

export function basicsFrom(profile: FighterProfile): BasicsValues {
  return {
    display_name: text(profile.display_name),
    username: text(profile.username),
    country_code: profile.country_code ?? null,
    city: text(profile.city),
  };
}

export function profileFrom(profile: FighterProfile): ProfileValues {
  return {
    experience_level: profile.experience_level ?? null,
    stance: profile.stance ?? null,
    amateur_bout_count: number(profile.amateur_bout_count),
    goals: [...(profile.goals ?? [])],
    weight_class: profile.weight_class ?? null,
    current_weight_kg: number(profile.current_weight_kg),
    height_cm: number(profile.height_cm),
    next_fight_on: text(profile.next_fight_on),
    next_fight_name: text(profile.next_fight_name),
  };
}

/** Trimmed text, or `null` (the API's "clear this field") when empty. */
const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function basicsPatch(values: BasicsValues): FighterProfilePatch {
  return {
    display_name: orNull(values.display_name),
    username: orNull(values.username),
    country_code: values.country_code,
    city: orNull(values.city),
  };
}

type Parsed = {
  patch: FighterProfilePatch;
  errors: Partial<Record<keyof ProfileValues, FieldMessage>>;
};

/**
 * The WF1 patch, or the fields that cannot be sent as numbers at all. A
 * decimal comma is read as a point; anything else is sent exactly as typed.
 */
export function profilePatch(values: ProfileValues): Parsed {
  const errors: Parsed["errors"] = {};
  const whole = (field: "amateur_bout_count" | "height_cm", message: FieldMessage) => {
    const raw = values[field].trim();
    if (raw === "") return null;
    if (/^\d+$/.test(raw)) return Number(raw);
    errors[field] = message;
    return undefined;
  };
  const weight = (() => {
    const raw = values.current_weight_kg.trim().replace(",", ".");
    if (raw === "") return null;
    if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
    errors.current_weight_kg = "invalid";
    return undefined;
  })();
  const amateur_bout_count = whole("amateur_bout_count", "wholeNumber");
  const height_cm = whole("height_cm", "invalid");

  return {
    patch: {
      experience_level: values.experience_level,
      stance: values.stance,
      goals: values.goals,
      weight_class: values.weight_class,
      next_fight_on: orNull(values.next_fight_on),
      next_fight_name: orNull(values.next_fight_name),
      ...(amateur_bout_count === undefined ? {} : { amateur_bout_count }),
      ...(height_cm === undefined ? {} : { height_cm }),
      ...(weight === undefined ? {} : { current_weight_kg: weight }),
    },
    errors,
  };
}

/** The backend's username rule (SF-25), mirrored for immediate feedback only. */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_]{1,28}[A-Za-z0-9]$/;

/**
 * WF0's Continue checks before saving: the completion requirements of the
 * step and the username shape, as the API would report them. The API stays
 * the authority: its answer replaces these.
 */
export function basicsErrors(
  values: BasicsValues,
): Partial<Record<keyof BasicsValues, FieldMessage>> {
  const errors: Partial<Record<keyof BasicsValues, FieldMessage>> = {};
  if (values.display_name.trim() === "") errors.display_name = "required.display_name";
  if (values.username.trim() === "") errors.username = "required.username";
  else if (!USERNAME_PATTERN.test(values.username.trim())) errors.username = "usernameFormat";
  if (values.country_code === null) errors.country_code = "required.country_code";
  if (values.city.trim() === "") errors.city = "required.city";
  return errors;
}

/**
 * The part of `patch` this page changed (`dirty`: React Hook Form's
 * `dirtyFields`). A save sends only these, so a value another client saved
 * meanwhile (the mobile app, another tab) is never written back with this
 * page's older copy. SF-25 merges a partial PATCH; omitted fields are kept.
 */
export function changedOnly(
  patch: FighterProfilePatch,
  dirty: Partial<Record<string, unknown>>,
): FighterProfilePatch {
  const isDirty = (value: unknown) => (Array.isArray(value) ? value.some(Boolean) : Boolean(value));
  return Object.fromEntries(
    Object.entries(patch).filter(([field]) => isDirty(dirty[field])),
  ) as FighterProfilePatch;
}
