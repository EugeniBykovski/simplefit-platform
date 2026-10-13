import { isApiError } from "@/shared/api/http/api-error";

/**
 * Backend validation outcomes (`validation_error` with `details.field_codes`)
 * as message keys of the `coachOnboarding.errors` namespace. Branches on the
 * stable SF-50 codes only, never on the API's English messages.
 */
export type FieldMessage =
  | `required.${"display_name" | "country_code" | "city" | "coaching_formats"}`
  | "tooLong"
  | "invalidChoice"
  | "invalidFormat"
  | "invalid";

const REQUIRED = new Set(["display_name", "country_code", "city", "coaching_formats"]);

/** The message for the first reason code of `field`. */
export function messageFor(field: string, code: string): FieldMessage {
  if (code === "required" && REQUIRED.has(field)) return `required.${field}` as FieldMessage;
  if (code === "too_long") return "tooLong";
  if (code === "invalid_choice") return "invalidChoice";
  if (code === "invalid_format") return "invalidFormat";
  return "invalid";
}

export type Rejection = {
  /** Field → message key. */
  fields: Record<string, FieldMessage>;
  /** Fields of the profile with a `required` code (completion), in API order. */
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
    if (field === "account_registration") {
      accountRegistration = true;
      continue;
    }
    fields[field] = messageFor(field, codes[0] ?? "invalid");
    if (codes.includes("required")) missing.push(field);
  }
  return { fields, missing, accountRegistration };
}
