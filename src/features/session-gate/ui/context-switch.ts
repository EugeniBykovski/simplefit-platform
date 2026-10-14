"use client";

import { useCallback, useRef, useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";

import type { ProfileContext } from "../model/contexts";
import { entryHref, fetchEntry, isKnownEntry } from "../model/entry";
import { chooseEntryContext } from "./entry-context";

export type ContextSwitchState =
  | { status: "idle" }
  | { status: "pending"; context: ProfileContext; kind: SwitchKind }
  | { status: "failed"; context: ProfileContext; kind: SwitchKind };

/** `open`: a completed context (recorded); `continue`: an unfinished journey (intent only). */
export type SwitchKind = "open" | "continue";

class UnexpectedDestination extends Error {}

/**
 * Moving between the profile contexts of one account (SF-51, SF-54), the
 * same session and identity throughout:
 *
 * - **open** a completed context: the choice is recorded with the backend
 *   (`PUT /api/v1/me/entry/context`), then the entry is resolved again and
 *   the browser goes where it answers (that context's home). The choice is
 *   the backend's last explicit context; nothing is kept in the browser.
 * - **continue** an unfinished journey: the entry is resolved with that
 *   journey's explicit intent and the browser goes to its onboarding.
 *   Nothing is recorded: an incomplete profile is never a context.
 *
 * One move at a time. While the next page loads the state stays `pending`;
 * a failure keeps the user where they are, in their current context, to
 * retry. The client decides no destination of its own.
 */
export function useContextSwitch() {
  const router = useRouter();
  const [state, setState] = useState<ContextSwitchState>({ status: "idle" });
  const busy = useRef(false);

  const go = useCallback(
    async (context: ProfileContext, kind: SwitchKind) => {
      if (busy.current) return;
      busy.current = true;
      setState({ status: "pending", context, kind });
      const continuation = kind === "continue" ? { intent: context } : {};
      try {
        if (kind === "open") await chooseEntryContext(context);
        const entry = await fetchEntry(continuation);
        const destination: string = entry.destination;
        if (!isKnownEntry(entry)) {
          // A newer API than this client: observable, never guessed around.
          console.error(`Unknown entry destination "${destination}"`);
          throw new UnexpectedDestination();
        }
        router.push(entryHref(entry, continuation));
      } catch {
        busy.current = false;
        setState({ status: "failed", context, kind });
      }
    },
    [router],
  );

  return {
    state,
    open: (context: ProfileContext) => go(context, "open"),
    continueJourney: (context: ProfileContext) => go(context, "continue"),
  };
}
