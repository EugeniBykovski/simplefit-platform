"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import type { StaffProblem } from "../model/staff-problem";

/** The sentence for a refused or unconfirmed staff action. */
export function useProblemText() {
  const t = useTranslations("gymConsole.staff.problems");
  return useCallback(
    (problem: StaffProblem) =>
      problem.kind === "limited"
        ? problem.minutes === null
          ? t("limitedLater")
          : t("limited", { minutes: problem.minutes })
        : t(problem.kind),
    [t],
  );
}
