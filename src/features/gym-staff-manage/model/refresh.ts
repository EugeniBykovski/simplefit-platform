"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { gymQueryKey } from "@/entities/gym";
import { gymFirstRunQueryKey } from "@/entities/gym-first-run";
import { gymStaffInvitationsKey, gymStaffKey } from "@/entities/gym-staff";

/**
 * After any staff answer (success or refusal), everything of this gym that
 * it can change is read again from the backend: the roster views, the
 * invitations, the gym (the viewer's own role and permissions may have
 * changed, or the gym may now be gone: the console then shows that) and the
 * owner's checklist (`invite_staff`). Only this gym's keys; never another's.
 */
export function useStaffRefresh(gymId: string) {
  const client = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: gymStaffKey(gymId) }),
        client.invalidateQueries({ queryKey: gymStaffInvitationsKey(gymId) }),
        client.invalidateQueries({ queryKey: gymQueryKey(gymId) }),
        client.invalidateQueries({ queryKey: gymFirstRunQueryKey(gymId) }),
      ]),
    [client, gymId],
  );
}

/**
 * For a dialog's action: after a success the page is read again at once;
 * after a refusal only once the dialog closes, so the refusal stays on
 * screen (a re-read gym may no longer offer the action, which would remove
 * the dialog before it could be read).
 */
export function useDialogRefresh(gymId: string) {
  const refresh = useStaffRefresh(gymId);
  const owed = useRef(false);
  return {
    now: refresh,
    later: () => {
      owed.current = true;
    },
    onClose: () => {
      if (!owed.current) return;
      owed.current = false;
      void refresh();
    },
  };
}
