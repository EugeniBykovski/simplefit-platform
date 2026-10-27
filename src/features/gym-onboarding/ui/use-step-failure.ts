"use client";

import { useCallback, useState } from "react";

import { outcomeOf, type FieldMessage } from "../model/errors";
import type { StepAction, StepProblem } from "./step-notice";

/**
 * A step's failure handling, shared by OG1–OG3: turns a rejected setup call
 * into the notice to show, marks rejected fields (`showErrors`), and on a
 * stale revision or a completion elsewhere re-reads the setup (`reload`) so
 * the form shows the latest saved values while keeping the visitor's edits.
 * Nothing is retried on its own: every retry is the visitor's choice.
 */
export function useStepFailure({
  reload,
  accountHref,
  showErrors,
}: {
  /** Re-reads the setup into the cache; `undefined` before the gym exists. */
  reload?: () => Promise<unknown>;
  accountHref: string;
  showErrors: (errors: Partial<Record<string, FieldMessage>>) => void;
}) {
  const [problem, setProblem] = useState<StepProblem>();

  const fail = useCallback(
    async (error: unknown, action: StepAction) => {
      const outcome = outcomeOf(error);
      switch (outcome.kind) {
        case "invalid":
          if (outcome.accountRegistration) {
            setProblem({ kind: "account", href: accountHref });
          } else if (action === "finish" && outcome.missing.length > 0) {
            setProblem({ kind: "rejected", missing: outcome.missing });
          } else {
            showErrors(outcome.fields);
            setProblem({ kind: "invalid" });
          }
          return;
        case "stale":
        case "completed":
          try {
            await reload?.();
          } catch {
            // The notice still applies; the next focus or Retry reloads.
          }
          setProblem(outcome.kind === "stale" ? { kind: "stale" } : undefined);
          return;
        case "unconfirmed":
          setProblem({ kind: "unconfirmed", action });
          return;
        case "rateLimited": {
          const at = Date.now();
          setProblem({
            kind: "rateLimited",
            at,
            until: outcome.retryAfter === null ? null : at + outcome.retryAfter * 1000,
          });
          return;
        }
        default:
          setProblem(outcome);
      }
    },
    [accountHref, reload, showErrors],
  );

  return { problem, setProblem, fail };
}
