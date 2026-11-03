"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { gymQueryKey } from "@/entities/gym";
import { classRosterKey } from "@/entities/gym-booking";
import { gymFirstRunQueryKey } from "@/entities/gym-first-run";
import { callWithSession } from "@/entities/session";
import { checkInGymClassBooking } from "@/shared/api/generated/endpoints/gym-bookings/gym-bookings";

/**
 * Records a member's arrival at one class, by staff (`POST
 * /gyms/{id}/class-bookings/{id}/check-in`, manual). The backend decides
 * whether it may be recorded (a confirmed booking of a scheduled class, on
 * the class's own local day) and records at most one per booking: asking
 * again returns the same arrival (`200`), so a retry after a lost answer is
 * safe and never counts anyone twice. Afterwards the roster, the gym and the
 * owner's checklist (`first_check_in`, completed by the backend only) are
 * read again.
 */
export function useCheckIn(gymId: string, occurrenceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      callWithSession((init) => checkInGymClassBooking(gymId, bookingId, init)),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: classRosterKey(gymId, occurrenceId) }),
        client.invalidateQueries({ queryKey: gymQueryKey(gymId) }),
        client.invalidateQueries({ queryKey: gymFirstRunQueryKey(gymId) }),
      ]),
  });
}
