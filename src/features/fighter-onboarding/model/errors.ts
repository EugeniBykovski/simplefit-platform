import { isApiError } from "@/shared/api/http/api-error";

/**
 * Backend validation outcomes (`validation_error` with `details.field_codes`)
 * as message keys of the `fighterOnboarding.errors` namespace. Branches on the
 * stable codes only, never on the API's English messages.
 */
export type FieldMessage =
  | `required.${
      "display_name" | "username" | "country_code" | "city" | "experience_level" | "stance"}`
  | "usernameFormat"
  | "usernameTaken"
  | "weightPrecision"
  | "wholeNumber"
  | "tooLong"
  | "outOfRange"
  | "invalidChoice"
  | "invalidDate"
  | "invalid";

const REQUIRED = new Set([
  "display_name",
  "username",
  "country_code",
  "city",
  "experience_level",
  "stance",
]);
const WHOLE_NUMBERS = new Set(["amateur_bout_count", "height_cm"]);

/** The message for the first reason code of `field`. */
export function messageFor(field: string, code: string): FieldMessage {
  if (code === "required" && REQUIRED.has(field)) return `required.${field}` as FieldMessage;
  if (field === "username" && code === "already_exists") return "usernameTaken";
  if (
    field === "username" &&
    (code === "invalid_format" || code === "too_short" || code === "too_long")
  ) {
    return "usernameFormat";
  }
  if (field === "current_weight_kg" && code === "invalid_format") return "weightPrecision";
  if (WHOLE_NUMBERS.has(field) && (code === "invalid_type" || code === "out_of_range")) {
    return field === "amateur_bout_count" ? "wholeNumber" : "outOfRange";
  }
  if (field === "next_fight_on") return "invalidDate";
  if (code === "too_long") return "tooLong";
  if (code === "out_of_range") return "outOfRange";
  if (code === "invalid_choice") return "invalidChoice";
  return "invalid";
}

export type Rejection = {
  /** Field → message key, for the fields this form owns. */
  fields: Record<string, FieldMessage>;
  /** Fields of the profile with a `required` code (completion), in step order. */
  missing: string[];
  /** Completion needs the shared account registration first (SF-44). */
  accountRegistration: boolean;
};

/** A backend validation error as field messages, or `undefined` for any other error. */
export function rejectionOf(error: unknown): Rejection | undefined {
  if (!isApiError(error) || error.code !== "validation_error") return undefined;
  const fields: Record<string, FieldMessage> = {};
  const missing: string[] = [];
  let accountRegistration = false;
  for (const [field, codes] of Object.entries(error.fieldCodes)) {
    const code = codes[0] ?? "invalid";
    if (field === "account_registration") {
      accountRegistration = true;
      continue;
    }
    fields[field] = messageFor(field, code);
    if (codes.includes("required")) missing.push(field);
  }
  return { fields, missing, accountRegistration };
}
