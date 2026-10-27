import type { GymLocationInput, GymSetup, GymSetupPatch } from "@/entities/gym-setup";
import {
  GymSetupGymType,
  GymSetupUpdateRequestAccentColor,
  type GymSetupGymType as GymType,
} from "@/shared/api/generated/model";

import type { FieldMessage } from "./errors";

/*
 * The form values of OG1, OG2 and OG3 and their translation to and from the
 * SF-85 setup. The vocabularies are the generated OpenAPI enums, in their
 * contract order: no web-only values. The limits mirror the contract for
 * immediate feedback only; the API stays the authority.
 */

export const GYM_TYPES = Object.values(GymSetupGymType);
/** OG3's six contrast-checked swatches (lowercase hex, contract order). */
export const ACCENT_COLORS = Object.values(GymSetupUpdateRequestAccentColor).filter(
  (color): color is NonNullable<typeof color> => color !== null,
);
export type AccentColor = (typeof ACCENT_COLORS)[number];

export const LIMITS = {
  name: 80,
  website: 200,
  tagline: 120,
  city: 80,
  address_line: 200,
  entrance_note: 200,
} as const;

/** The contract's phone shape: digits, spaces, `( ) -`, an optional leading `+`; 5–31 characters. */
const PHONE = /^\+?[0-9][0-9 ()-]{4,30}$/;

/** Characters as the API counts them (code points, not UTF-16 units), after trimming. */
export const lengthOf = (value: string) => Array.from(value.trim()).length;

export type GymValues = {
  name: string;
  gym_type: GymType | null;
  phone: string;
  website: string;
};

export type LocationValues = {
  country_code: string | null;
  city: string;
  address_line: string;
  entrance_note: string;
};

export type BrandValues = {
  tagline: string;
  accent_color: AccentColor | null;
};

const text = (value: string | null | undefined) => value ?? "";

/** Trimmed text, or `null` (the API's "clear this field") when empty. */
const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export const EMPTY_GYM: GymValues = { name: "", gym_type: null, phone: "", website: "" };

export function gymFrom(setup: GymSetup | null): GymValues {
  if (setup === null) return EMPTY_GYM;
  return {
    name: setup.name,
    gym_type: setup.gym_type,
    phone: text(setup.phone),
    website: text(setup.website),
  };
}

export function locationFrom(setup: GymSetup): LocationValues {
  const location = setup.primary_location;
  return {
    country_code: location?.country_code ?? null,
    city: text(location?.city),
    address_line: text(location?.address_line),
    entrance_note: text(location?.entrance_note),
  };
}

export function brandFrom(setup: GymSetup): BrandValues {
  return {
    tagline: text(setup.tagline),
    accent_color: (setup.accent_color as AccentColor | null) ?? null,
  };
}

/**
 * A website as the API stores it: an address typed without a scheme
 * ("simpleboxing.pl") gets `https://`; anything else is sent as typed and
 * the API decides.
 */
export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function gymPatch(values: GymValues): GymSetupPatch {
  return {
    name: values.name.trim(),
    ...(values.gym_type !== null ? { gym_type: values.gym_type } : {}),
    phone: orNull(values.phone),
    website: normalizeWebsite(values.website),
  };
}

export function locationInput(values: LocationValues): GymLocationInput {
  return {
    country_code: values.country_code ?? "",
    city: values.city.trim(),
    address_line: values.address_line.trim(),
    entrance_note: orNull(values.entrance_note),
  };
}

export function brandPatch(values: BrandValues): GymSetupPatch {
  return { tagline: orNull(values.tagline), accent_color: values.accent_color };
}

type Errors<T> = Partial<Record<keyof T, FieldMessage>>;

/** OG1's checks before saving: the requirements and the contract shapes, as the API would report them. */
export function gymErrors(values: GymValues): Errors<GymValues> {
  const errors: Errors<GymValues> = {};
  if (values.name.trim() === "") errors.name = "required.name";
  else if (lengthOf(values.name) > LIMITS.name) errors.name = "tooLong";
  if (values.gym_type === null) errors.gym_type = "required.gym_type";
  if (values.phone.trim() !== "" && !PHONE.test(values.phone.trim()))
    errors.phone = "invalidFormat";
  const website = normalizeWebsite(values.website);
  if (website !== null) {
    if (lengthOf(website) > LIMITS.website) errors.website = "tooLong";
    else if (!isWebAddress(website)) errors.website = "invalidFormat";
  }
  return errors;
}

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/** OG2's checks: country, city and address are required; the note is optional. */
export function locationErrors(values: LocationValues): Errors<LocationValues> {
  const errors: Errors<LocationValues> = {};
  if (values.country_code === null) errors.country_code = "required.country_code";
  if (values.city.trim() === "") errors.city = "required.city";
  else if (lengthOf(values.city) > LIMITS.city) errors.city = "tooLong";
  if (values.address_line.trim() === "") errors.address_line = "required.address_line";
  else if (lengthOf(values.address_line) > LIMITS.address_line) errors.address_line = "tooLong";
  if (lengthOf(values.entrance_note) > LIMITS.entrance_note) errors.entrance_note = "tooLong";
  return errors;
}

/** OG3's check: the tagline's length (everything on OG3 is optional). */
export function brandErrors(values: BrandValues): Errors<BrandValues> {
  return lengthOf(values.tagline) > LIMITS.tagline ? { tagline: "tooLong" } : {};
}

/** Whether OG2's values differ from the saved location (the location is written whole). */
export function locationChanged(setup: GymSetup, values: LocationValues): boolean {
  const saved = locationFrom(setup);
  const next = locationInput(values);
  return (
    setup.primary_location === null ||
    saved.country_code !== next.country_code ||
    saved.city.trim() !== next.city ||
    saved.address_line.trim() !== next.address_line ||
    orNull(saved.entrance_note) !== next.entrance_note
  );
}
