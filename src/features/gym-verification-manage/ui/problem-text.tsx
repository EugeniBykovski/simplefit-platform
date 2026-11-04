"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { Notice } from "@/shared/ui/notice";

import { isVerificationFailure, type VerificationProblem } from "../model/verification-problem";

/** The sentence for a refused or unconfirmed verification action or read. */
export function useVerificationProblemText() {
  const t = useTranslations("gymVerification.problems");
  return useCallback(
    (problem: VerificationProblem) =>
      problem.kind === "limited"
        ? problem.minutes === null
          ? t("limitedLater")
          : t("limited", { minutes: problem.minutes })
        : t(problem.kind),
    [t],
  );
}

/** A refusal (amber) or failure (coral), announced to assistive technology. */
export function VerificationProblemNotice({
  problem,
  className,
}: {
  problem: VerificationProblem;
  className?: string;
}) {
  const text = useVerificationProblemText();
  return (
    <Notice
      tone={isVerificationFailure(problem) ? "coral" : "amber"}
      role="alert"
      className={className}
      data-verification-problem={problem.kind}
    >
      {text(problem)}
    </Notice>
  );
}
