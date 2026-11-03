import { isApiError } from "@/shared/api/http/api-error";

/**
 * Why a booking, cancellation or check-in did not happen, from the SF-99
 * error contract's machine-readable `details` (never from a message). The
 * backend decides every one of them; this only names its answer.
 *
 * - `unknown`: the connection dropped or the server failed; the request may
 *   or may not have been applied, so the data is read again and nothing is
 *   claimed. Booking again reuses the same request key, and cancelling or
 *   checking in again is safe, so a retry never creates a second booking or
 *   a second arrival.
 * - `full`: no place left (with the class's capacity); no booking was
 *   created and there is no waitlist.
 * - `classCancelled` / `started` / `notToday`: the class is cancelled, has
 *   started, or (check-in) is not on its own local day.
 * - `alreadyBooked`: the member already holds a place in this class.
 * - `bookingCancelled`: the booking is already cancelled (with the reason).
 * - `checkedIn`: the member's arrival is recorded; the booking stays.
 * - `membership`: the gym membership is not active (with its status).
 * - `keyReused`: the request key named another booking (a client fault).
 * - `forbidden` (403): the staff role may not do this; `gone` (404): not
 *   available to the viewer, existence never implied.
 */
export type BookingProblem =
  | { kind: "unknown" }
  | { kind: "loadFailed" }
  | { kind: "limited"; minutes: number | null }
  | { kind: "full"; capacity: number | null }
  | { kind: "classCancelled" }
  | { kind: "started" }
  | { kind: "notToday" }
  | { kind: "alreadyBooked" }
  | { kind: "bookingCancelled"; reason: string | null }
  | { kind: "checkedIn" }
  | { kind: "membership"; status: string | null }
  | { kind: "keyReused" }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "session" }
  | { kind: "failed" };

const text = (value: unknown) => (typeof value === "string" ? value : null);

export function bookingProblem(error: unknown): BookingProblem {
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
    const occurrence = details["class_occurrence"];
    if (occurrence === "full") {
      const capacity = details["capacity"];
      return { kind: "full", capacity: typeof capacity === "number" ? capacity : null };
    }
    if (occurrence === "cancelled") return { kind: "classCancelled" };
    if (occurrence === "started") return { kind: "started" };
    if (occurrence === "not_today") return { kind: "notToday" };
    const booking = details["class_booking"];
    if (booking === "already_booked") return { kind: "alreadyBooked" };
    if (booking === "cancelled")
      return { kind: "bookingCancelled", reason: text(details["cancel_reason"]) };
    if (booking === "checked_in") return { kind: "checkedIn" };
    if ("gym_member" in details) return { kind: "membership", status: text(details["gym_member"]) };
    if (details["client_request_id"] === "reused") return { kind: "keyReused" };
    return { kind: "failed" };
  }
  if (error.status === 401) return { kind: "session" };
  if (error.status === 403) return { kind: "forbidden" };
  if (error.status === 404) return { kind: "gone" };
  if (error.status >= 500 || error.status === 0) return { kind: "unknown" };
  return { kind: "failed" };
}

/**
 * Why a read (memberships, classes, bookings, a roster) failed: the same
 * answers, except that a dropped connection or a server error is
 * `loadFailed`; a read changes nothing, so no outcome is in doubt.
 */
export function readProblem(error: unknown): BookingProblem {
  const problem = bookingProblem(error);
  return problem.kind === "unknown" ? { kind: "loadFailed" } : problem;
}

/** Whether a problem is a failure (coral) rather than an expected refusal (amber). */
export const isBookingFailure = (problem: BookingProblem) =>
  problem.kind === "failed" ||
  problem.kind === "unknown" ||
  problem.kind === "loadFailed" ||
  problem.kind === "keyReused";
