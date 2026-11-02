import { isApiError } from "@/shared/api/http/api-error";

/**
 * Why a timetable write did not happen, in the staff's terms (SF-97 error
 * contract). The backend decides every write; this only names its answer.
 * A dropped connection or a timeout is `unknown`: the write may or may not
 * have been applied, so the timetable is read again and nothing is claimed.
 * Field errors (`422`) are the forms' own: they land on the fields.
 *
 * - `stale`: someone changed the record since it was read (`revision:
 *   stale`); nothing was written.
 * - `venueTaken`: another class of this gym is in the venue then (for a
 *   series, the wall dates in the way).
 * - `instructorBusy`: the instructor teaches another class then. It may be
 *   at another gym, so nothing about that class is known or said.
 * - `venueHasClasses` / `venueCapacity`: the venue still has classes to come
 *   (or ones bigger than the new capacity), with the backend's count.
 */
export type TimetableProblem =
  | { kind: "limited"; minutes: number | null }
  | { kind: "stale" }
  | { kind: "venueTaken"; dates: string[] }
  | { kind: "instructorBusy" }
  | { kind: "venueHasClasses"; count: number | null }
  | { kind: "venueCapacity"; count: number | null }
  | { kind: "venueInactive" }
  | { kind: "templateArchived" }
  | { kind: "occurrenceCancelled" }
  | { kind: "occurrenceStarted" }
  | { kind: "seriesCancelled" }
  | { kind: "draft" }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "unknown" }
  | { kind: "failed" };

const count = (value: unknown) => (typeof value === "number" ? value : null);
const dates = (value: unknown) =>
  Array.isArray(value) ? value.filter((date): date is string => typeof date === "string") : [];

export function timetableProblem(error: unknown): TimetableProblem {
  if (!isApiError(error)) return { kind: "unknown" };
  const details = error.details;
  if (error.code === "rate_limited") {
    // The delay only when the browser can read `retry-after`; never a guess.
    const seconds = error.retryAfterSeconds;
    return {
      kind: "limited",
      minutes: seconds === null ? null : Math.max(1, Math.ceil(seconds / 60)),
    };
  }
  if (error.code === "conflict") {
    if (details["revision"] === "stale") return { kind: "stale" };
    const schedule = details["schedule"];
    if (schedule === "venue_unavailable")
      return { kind: "venueTaken", dates: dates(details["local_dates"]) };
    if (schedule === "instructor_unavailable") return { kind: "instructorBusy" };
    const venue = details["venue"];
    if (venue === "has_upcoming_classes")
      return { kind: "venueHasClasses", count: count(details["upcoming_classes"]) };
    if (venue === "capacity_below_upcoming_class")
      return { kind: "venueCapacity", count: count(details["upcoming_classes"]) };
    if (venue === "inactive") return { kind: "venueInactive" };
    if (details["class_template"] === "archived") return { kind: "templateArchived" };
    if (details["class_occurrence"] === "cancelled") return { kind: "occurrenceCancelled" };
    if (details["class_occurrence"] === "started") return { kind: "occurrenceStarted" };
    if (details["class_series"] === "cancelled") return { kind: "seriesCancelled" };
    if (details["setup_status"] === "draft") return { kind: "draft" };
    return { kind: "failed" };
  }
  if (error.status === 403) return { kind: "forbidden" };
  if (error.status === 404) return { kind: "gone" };
  if (error.status >= 500 || error.status === 0) return { kind: "unknown" };
  return { kind: "failed" };
}

/** Whether a problem is a failure (coral) rather than an expected refusal (amber). */
export const isFailure = (problem: TimetableProblem) =>
  problem.kind === "failed" || problem.kind === "unknown";

/** Whether the record changed or ended meanwhile, so the dialog must show the latest one. */
export const isOutdated = (problem: TimetableProblem) =>
  problem.kind === "stale" ||
  problem.kind === "occurrenceCancelled" ||
  problem.kind === "occurrenceStarted" ||
  problem.kind === "seriesCancelled" ||
  problem.kind === "venueInactive" ||
  problem.kind === "templateArchived";
