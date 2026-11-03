"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { Notice } from "@/shared/ui/notice";

import { isBillingFailure, type BillingProblem } from "../model/billing-problem";

/** The sentence for a refused or unconfirmed billing action or read. */
export function useBillingProblemText() {
  const t = useTranslations("gymBilling.problems");
  return useCallback(
    (problem: BillingProblem) =>
      problem.kind === "limited"
        ? problem.minutes === null
          ? t("limitedLater")
          : t("limited", { minutes: problem.minutes })
        : t(problem.kind),
    [t],
  );
}

/** A refusal (amber) or failure (coral), announced to assistive technology. */
export function BillingProblemNotice({
  problem,
  className,
}: {
  problem: BillingProblem;
  className?: string;
}) {
  const text = useBillingProblemText();
  return (
    <Notice
      tone={isBillingFailure(problem) ? "coral" : "amber"}
      role="alert"
      className={className}
      data-billing-problem={problem.kind}
    >
      {text(problem)}
    </Notice>
  );
}
