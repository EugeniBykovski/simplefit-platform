"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { allMemberClassesKey, memberClassesKey, myClassBookingsKey } from "@/entities/gym-booking";
import { callWithSession } from "@/entities/session";
import {
  bookMyGymClass,
  cancelMyGymClassBooking,
} from "@/shared/api/generated/endpoints/gym-bookings/gym-bookings";

import { bookingProblem } from "./booking-problem";

/**
 * After any booking answer (success or refusal) the member's views are read
 * again from the backend: the classes of the membership (places left, the
 * member's own booking) and the member's bookings. Nothing is decremented
 * or reserved on the client.
 */
export function useBookingRefresh() {
  const client = useQueryClient();
  return useCallback(
    (gymMemberId?: string) =>
      Promise.all([
        gymMemberId === undefined
          ? client.invalidateQueries({ queryKey: allMemberClassesKey })
          : client.invalidateQueries({ queryKey: memberClassesKey(gymMemberId) }),
        client.invalidateQueries({ queryKey: myClassBookingsKey }),
      ]),
    [client],
  );
}

/**
 * The idempotency keys of booking attempts (SF-99 `client_request_id`): one
 * UUID per logical attempt to book one class. Booking the same class again
 * after a lost or failed answer reuses the key, so the backend returns the
 * booking it may already have made (`200`) instead of making a second one.
 * Once the backend has answered for certain (a booking, or a refusal) the
 * attempt is over and the next one gets a new key: a key names one booking
 * for ever, and the backend never lets an old key take a new place.
 */
function useAttemptKeys() {
  const keys = useRef(new Map<string, string>());
  return {
    for(occurrenceId: string): string {
      const existing = keys.current.get(occurrenceId);
      if (existing !== undefined) return existing;
      const key = crypto.randomUUID();
      keys.current.set(occurrenceId, key);
      return key;
    },
    settle(occurrenceId: string) {
      keys.current.delete(occurrenceId);
    },
  };
}

/**
 * Books one class for the member (`POST /me/gym-memberships/{id}/class-bookings`).
 * Success is shown only from the backend's answer; afterwards the classes
 * and bookings are read again. A lost answer keeps the attempt's key, so
 * "Try again" sends the very same request; the re-read also shows a booking
 * that was made although its answer was lost.
 */
export function useBookClass(gymMemberId: string) {
  const keys = useAttemptKeys();
  const refresh = useBookingRefresh();
  return useMutation({
    mutationFn: (occurrenceId: string) =>
      callWithSession((init) =>
        bookMyGymClass(
          gymMemberId,
          { occurrence_id: occurrenceId, client_request_id: keys.for(occurrenceId) },
          init,
        ),
      ),
    onSuccess: (_answer, occurrenceId) => keys.settle(occurrenceId),
    onError: (error, occurrenceId) => {
      if (bookingProblem(error).kind !== "unknown") keys.settle(occurrenceId);
    },
    onSettled: () => refresh(gymMemberId),
  });
}

/**
 * Cancels one of the member's own bookings (`POST /me/class-bookings/{id}/cancel`).
 * The booking stays on screen until the backend answers; cancelling again
 * after a lost answer is safe (the backend returns the cancelled booking)
 * and never books anything.
 */
export function useCancelMyBooking() {
  const refresh = useBookingRefresh();
  return useMutation({
    mutationFn: (bookingId: string) =>
      callWithSession((init) => cancelMyGymClassBooking(bookingId, init)),
    onSettled: () => refresh(),
  });
}
