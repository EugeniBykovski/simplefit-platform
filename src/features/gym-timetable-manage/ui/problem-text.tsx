"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback } from "react";

import { printable } from "@/entities/gym-timetable";
import { Notice } from "@/shared/ui/notice";

import { isFailure, type TimetableProblem } from "../model/timetable-problem";

/** The sentence for a refused or unconfirmed timetable write. */
export function useProblemText() {
  const t = useTranslations("gymConsole.timetable.problems");
  const format = useFormatter();
  return useCallback(
    (problem: TimetableProblem) => {
      switch (problem.kind) {
        case "limited":
          return problem.minutes === null
            ? t("limitedLater")
            : t("limited", { minutes: problem.minutes });
        case "venueTaken":
          return problem.dates.length === 0
            ? t("venueTaken")
            : t("venueTakenOn", {
                dates: format.list(
                  problem.dates
                    .slice(0, 5)
                    .map((date) =>
                      format.dateTime(printable(date), { dateStyle: "medium", timeZone: "UTC" }),
                    ),
                ),
                count: problem.dates.length,
              });
        case "venueHasClasses":
        case "venueCapacity":
          return problem.count === null
            ? t(`${problem.kind}Some`)
            : t(problem.kind, { count: problem.count });
        default:
          return t(problem.kind);
      }
    },
    [t, format],
  );
}

/** A refusal (amber) or failure (coral) under a form or confirmation. */
export function ProblemNotice({ problem }: { problem: TimetableProblem }) {
  const text = useProblemText();
  return (
    <Notice
      tone={isFailure(problem) ? "coral" : "amber"}
      role="alert"
      data-timetable-problem={problem.kind}
    >
      {text(problem)}
    </Notice>
  );
}
