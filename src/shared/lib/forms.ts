import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { isApiError } from "@/shared/api/http/api-error";

/**
 * Maps a backend `validation_error` onto a React Hook Form instance.
 *
 * The backend is the canonical owner of validation; client-side Zod schemas
 * only improve UX. Call this from a submit handler's catch block so backend
 * decisions are shown next to the fields they concern.
 *
 * - Errors for fields listed in `fields` are set on those fields.
 * - Any other field errors are combined into `root.server`.
 *
 * Returns true when the error was a validation error and has been applied.
 */
export function applyApiFieldErrors<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  fields: readonly Path<TValues>[],
): boolean {
  if (!isApiError(error) || error.code !== "validation_error") return false;

  const unmatched: string[] = [];
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const message = messages.join(" ");
    if ((fields as readonly string[]).includes(field)) {
      setError(field as Path<TValues>, { type: "server", message });
    } else {
      unmatched.push(`${field}: ${message}`);
    }
  }

  if (unmatched.length > 0 || Object.keys(error.fieldErrors).length === 0) {
    setError("root.server", {
      type: "server",
      message: unmatched.length > 0 ? unmatched.join("; ") : error.message,
    });
  }

  return true;
}
