"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import { useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";

import type { ProfileContext } from "../model/contexts";
import { entryHref, fetchEntry, isKnownEntry } from "../model/entry";
import { chooseEntryContext } from "./entry-context";

/**
 * What a move opens: a profile context, a gym workspace (`gym:<id>`) or the
 * setup of the user's own draft gym (`gym-setup`). Rows compare it with
 * their own target to show which one is opening or failed.
 */
export type SwitchTarget = ProfileContext | `gym:${string}` | "gym-setup";

export const gymTarget = (gymId: string): SwitchTarget => `gym:${gymId}`;

export type ContextSwitchState =
  | { status: "idle" }
  | { status: "pending"; target: SwitchTarget; kind: SwitchKind }
  | { status: "failed"; target: SwitchTarget; kind: SwitchKind };

/** `open`: a completed context or gym (recorded); `continue`: an unfinished journey or draft. */
export type SwitchKind = "open" | "continue";

class UnexpectedDestination extends Error {}

/**
 * Moving between the contexts of one account (SF-51, SF-54, SF-88), the same
 * session and identity throughout:
 *
 * - **open** a completed profile context: the choice is recorded with the
 *   backend (`PUT /api/v1/me/entry/context`), then the entry is resolved
 *   again and the browser goes where it answers (that context's home);
 * - **open** a gym workspace: the choice (`context: gym` with the gym id) is
 *   recorded, which the backend accepts only for a completed gym where the
 *   user is active staff, then the browser opens that gym's console, whose
 *   URL names the gym. The record is a landing preference for `/app`, never
 *   authority: every console request is authorized for the gym in its path,
 *   so another tab keeps the gym its own URL names;
 * - **continue** an unfinished journey: the entry is resolved with that
 *   journey's explicit intent and the browser goes to its onboarding;
 *   continuing the user's draft gym opens Gym setup, which resumes it.
 *   Nothing is recorded: an incomplete profile or a draft is never a context.
 *
 * One move at a time. While the next page loads the state stays `pending`;
 * a failure keeps the user where they are, in their current context, to
 * retry, and refreshes the entry, so a gym revoked meanwhile disappears from
 * every list. The client decides no destination of its own.
 */
export function useContextSwitch() {
  const router = useRouter();
  const client = useQueryClient();
  const [state, setState] = useState<ContextSwitchState>({ status: "idle" });
  const busy = useRef(false);

  const run = useCallback(
    async (target: SwitchTarget, kind: SwitchKind, move: () => Promise<string>) => {
      if (busy.current) return;
      busy.current = true;
      setState({ status: "pending", target, kind });
      try {
        router.push(await move());
      } catch {
        busy.current = false;
        setState({ status: "failed", target, kind });
        void client.invalidateQueries({ queryKey: getResolveMyEntryQueryKey() });
      }
    },
    [router, client],
  );

  const profile = useCallback(
    (context: ProfileContext, kind: SwitchKind) =>
      run(context, kind, async () => {
        const continuation = kind === "continue" ? { intent: context } : {};
        if (kind === "open") await chooseEntryContext(context);
        const entry = await fetchEntry(continuation);
        const destination: string = entry.destination;
        if (!isKnownEntry(entry)) {
          // A newer API than this client: observable, never guessed around.
          console.error(`Unknown entry destination "${destination}"`);
          throw new UnexpectedDestination();
        }
        return entryHref(entry, continuation);
      }),
    [run],
  );

  return {
    state,
    open: (context: ProfileContext) => profile(context, "open"),
    continueJourney: (context: ProfileContext) => profile(context, "continue"),
    openGym: (gymId: string) =>
      run(gymTarget(gymId), "open", async () => {
        await chooseEntryContext("gym", gymId);
        return routeHref("web.app.gyms._gym-id", { gymId });
      }),
    continueGymSetup: () =>
      run("gym-setup", "continue", () =>
        Promise.resolve(routeHref("web.app.onboarding.gym", {}, { intent: "gym" })),
      ),
  };
}
