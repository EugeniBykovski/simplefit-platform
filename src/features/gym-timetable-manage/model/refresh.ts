"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { gymQueryKey } from "@/entities/gym";
import { gymFirstRunQueryKey } from "@/entities/gym-first-run";
import { gymTimetableKey } from "@/entities/gym-timetable";

/**
 * After any timetable answer (success or refusal), everything of this gym
 * that it can change is read again from the backend: every timetable read
 * (classes, series, templates, venues), the gym (the viewer's role and
 * permissions may have changed, or the gym may now be gone: the console
 * then shows that) and the owner's checklist (`add_class`). Only this gym's
 * keys; never another's.
 */
export function useTimetableRefresh(gymId: string) {
  const client = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: gymTimetableKey(gymId) }),
        client.invalidateQueries({ queryKey: gymQueryKey(gymId) }),
        client.invalidateQueries({ queryKey: gymFirstRunQueryKey(gymId) }),
      ]),
    [client, gymId],
  );
}

/**
 * For a dialog's action: after a success the page is read again at once;
 * after a refusal only once the dialog closes, so the refusal stays on
 * screen (a re-read may no longer offer the action, which would remove the
 * dialog before it could be read).
 */
export function useDialogRefresh(gymId: string) {
  const refresh = useTimetableRefresh(gymId);
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

/**
 * The idempotency key of a create (SF-97 `client_request_id`): one UUID per
 * logical attempt. Sending the same body again (a retry after a failure or a
 * lost response) reuses it, so the backend returns what it may already have
 * created (`200`) instead of creating it twice. Any change to the body is a
 * new attempt with a new key.
 */
export function useRequestKey() {
  const last = useRef<{ body: string; key: string } | null>(null);
  return {
    for(body: object): string {
      const serialized = JSON.stringify(body);
      if (last.current?.body !== serialized) {
        last.current = { body: serialized, key: crypto.randomUUID() };
      }
      return last.current.key;
    },
    reset() {
      last.current = null;
    },
  };
}
