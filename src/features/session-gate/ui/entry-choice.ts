"use client";

import { useCallback, useRef, useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { parseIntent, type EntryIntent } from "@/shared/routes/continuation";

import { entryHref, fetchEntry, knowsDestination } from "../model/entry";
import { useUrlContinuation } from "./entry-redirect";

export type EntryChoiceState =
  | { status: "idle" }
  | { status: "resolving"; intent: EntryIntent }
  | { status: "failed"; intent: EntryIntent; reason: "unavailable" | "unexpected" };

class UnexpectedDestination extends Error {}

/**
 * An explicit journey choice (WA6, SF-47): the backend resolver (SF-45) is
 * asked again with the chosen intent and the URL's `returnTo`, and the
 * browser goes where it answers, through the same mapping and precedence as
 * every other entry (`entryHref`). The choice is navigation only: nothing is
 * stored, created or granted, and the client decides no destination itself.
 *
 * One resolution at a time; while the next page loads the state stays
 * `resolving`. A failure keeps the visitor here with the choice, to retry.
 */
export function useEntryChoice() {
  const router = useRouter();
  const continuation = useUrlContinuation();
  const [state, setState] = useState<EntryChoiceState>({ status: "idle" });
  const busy = useRef(false);

  const choose = useCallback(
    async (value: EntryIntent) => {
      const intent = parseIntent(value);
      if (intent === undefined || busy.current) return;
      busy.current = true;
      setState({ status: "resolving", intent });
      const chosen = { ...continuation, intent };
      try {
        const entry = await fetchEntry(chosen);
        if (!knowsDestination(entry.destination)) {
          // A newer API than this client: observable, never guessed around.
          console.error(`Unknown entry destination "${entry.destination}"`);
          throw new UnexpectedDestination();
        }
        router.push(entryHref(entry, chosen));
      } catch (error) {
        busy.current = false;
        setState({
          status: "failed",
          intent,
          reason: error instanceof UnexpectedDestination ? "unexpected" : "unavailable",
        });
      }
    },
    [continuation, router],
  );

  return { state, choose };
}
