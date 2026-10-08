import type { AccountProfile, AccountProfilePatch } from "@/entities/account-profile";
import { isApiError } from "@/shared/api/http/api-error";

/*
 * WA5 form values and their translation to and from the SF-44 account
 * registration. The backend owns every rule (age, consent versions,
 * completion); the checks here only give immediate feedback and mirror the
 * published contract (`AccountProfileUpdateRequest`).
 */

export type AccountValues = {
  full_name: string;
  /** `YYYY-MM-DD` as the date input gives it: a calendar date, never a time. */
  date_of_birth: string;
  accept_terms: boolean;
  accept_privacy: boolean;
  product_news: boolean;
};

/**
 * The form from the backend state. A required consent is checked only when
 * the current document version is accepted (`current`); an acceptance of an
 * older version leaves it unchecked, so the visitor accepts the version in
 * force. Product news shows the recorded subscription; missing means no.
 */
export function valuesFrom(profile: AccountProfile): AccountValues {
  return {
    full_name: profile.full_name ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    accept_terms: profile.consents.terms.current,
    accept_privacy: profile.consents.privacy.current,
    product_news: profile.product_news.subscribed,
  };
}

export type FieldMessage =
  | "fullNameRequired"
  | "dateOfBirthRequired"
  | "tooYoung"
  | "invalidDate"
  | "immutable"
  | "tooLong"
  | "terms"
  | "privacy"
  | "invalid";

type Errors = Partial<Record<keyof AccountValues, FieldMessage>>;

/** Today as a calendar date in the visitor's own time zone (`YYYY-MM-DD`). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A real calendar date in `YYYY-MM-DD` (29 February only in leap years). */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * At least 16 by calendar date, compared as dates, never as instants, so no
 * time zone can move a birthday. The API applies the same rule and decides.
 */
export function isAtLeast16(dateOfBirth: string, today = todayIso()): boolean {
  const sixteenth = `${String(Number(dateOfBirth.slice(0, 4)) + 16).padStart(4, "0")}${dateOfBirth.slice(4)}`;
  return sixteenth <= today;
}

/** WA5's checks before saving: every completion requirement, as the API reports them. */
export function clientErrors(values: AccountValues, today = todayIso()): Errors {
  const errors: Errors = {};
  if (values.full_name.trim() === "") errors.full_name = "fullNameRequired";
  else if (values.full_name.trim().length > 200) errors.full_name = "tooLong";
  const dob = values.date_of_birth;
  if (dob === "") errors.date_of_birth = "dateOfBirthRequired";
  else if (!isCalendarDate(dob) || dob > today) errors.date_of_birth = "invalidDate";
  else if (!isAtLeast16(dob, today)) errors.date_of_birth = "tooYoung";
  if (!values.accept_terms) errors.accept_terms = "terms";
  if (!values.accept_privacy) errors.accept_privacy = "privacy";
  return errors;
}

/**
 * The PATCH for the fields this form changed (`dirty`), minus any field that
 * failed the checks (an invalid request changes nothing, so it would block
 * the valid ones). A required consent is sent only as an explicit `true`
 * the visitor ticked; product news is sent only when toggled; a date of
 * birth is never cleared (the contract has no `null` for it).
 */
export function patchFrom(
  values: AccountValues,
  dirty: Partial<Record<keyof AccountValues, boolean>>,
  errors: Errors,
): AccountProfilePatch {
  const patch: AccountProfilePatch = {};
  const send = (field: keyof AccountValues) => dirty[field] === true && errors[field] === undefined;
  if (send("full_name")) {
    const name = values.full_name.trim();
    patch.full_name = name === "" ? null : name;
  }
  if (send("date_of_birth") && values.date_of_birth !== "")
    patch.date_of_birth = values.date_of_birth;
  if (send("accept_terms") && values.accept_terms) patch.accept_terms = true;
  if (send("accept_privacy") && values.accept_privacy) patch.accept_privacy = true;
  if (dirty.product_news === true) patch.product_news = values.product_news;
  return patch;
}

const FIELD_OF: Record<string, keyof AccountValues> = {
  full_name: "full_name",
  date_of_birth: "date_of_birth",
  accept_terms: "accept_terms",
  terms: "accept_terms",
  accept_privacy: "accept_privacy",
  privacy: "accept_privacy",
  product_news: "product_news",
};

/** A field code of the API as WA5's message for that control. */
export function messageFor(field: keyof AccountValues, code: string): FieldMessage {
  if (field === "accept_terms") return "terms";
  if (field === "accept_privacy") return "privacy";
  if (field === "full_name")
    return code === "required" ? "fullNameRequired" : code === "too_long" ? "tooLong" : "invalid";
  if (field === "date_of_birth") {
    if (code === "required") return "dateOfBirthRequired";
    if (code === "too_young") return "tooYoung";
    if (code === "immutable") return "immutable";
    return "invalidDate";
  }
  return "invalid";
}

/**
 * A backend `validation_error` (PATCH field codes, or completion's `required`
 * per missing item: `full_name`, `date_of_birth`, `terms`, `privacy`) as
 * messages on WA5's controls; `undefined` for any other failure.
 */
export function rejectionOf(error: unknown): Errors | undefined {
  if (!isApiError(error) || error.code !== "validation_error") return undefined;
  const errors: Errors = {};
  for (const [key, codes] of Object.entries(error.fieldCodes)) {
    const field = FIELD_OF[key];
    if (field !== undefined) errors[field] = messageFor(field, codes[0] ?? "invalid");
  }
  return errors;
}
