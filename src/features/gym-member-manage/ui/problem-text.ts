"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import type { MemberProblem } from "../model/member-problem";

/** The sentence for a refused or unconfirmed member action. */
export function useProblemText() {
  const t = useTranslations("gymConsole.members.problems");
  return useCallback(
    (problem: MemberProblem) => {
      if (problem.kind === "limited") {
        return problem.minutes === null
          ? t("limitedLater")
          : t("limited", { minutes: problem.minutes });
      }
      if (problem.kind === "decided") return t(`decided.${problem.status}`);
      return t(problem.kind);
    },
    [t],
  );
}
