"use client";

import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { Notice } from "@/shared/ui/notice";

/** A Coach profile requirement WCR2 can list (its own coaching formats are marked in place). */
export type ProfileRequirement = "display_name" | "country_code" | "city";

export type StepProblem =
  | { kind: "failure"; action: "save" | "finish" }
  | { kind: "invalid" }
  | { kind: "rejected"; profile: ProfileRequirement[] }
  | { kind: "account"; href: string }
  | undefined;

const actionClass =
  "rounded-xs type-caption font-extrabold underline outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The step's status notices (WCR1 / WCR2 state tables):
 *
 * - `failure` (amber): the request did not reach the API; nothing typed or
 *   chosen is lost, Retry repeats the action;
 * - `invalid` (coral): the API, or the step's own check, flagged fields;
 * - `rejected` (coral): completion found Coach profile requirements missing,
 *   with a way back to WCR1;
 * - `account` (amber): completion needs the shared account registration first.
 *
 * Announced politely, so a screen reader hears the outcome of the action.
 */
export function StepNotice({
  problem,
  draft,
  onRetry,
  onGoProfile,
}: {
  problem: StepProblem;
  draft: "typed" | "selected";
  onRetry?: () => void;
  onGoProfile?: () => void;
}) {
  const t = useTranslations("coachOnboarding.notices");
  const format = useFormatter();
  if (problem === undefined) return <div role="status" aria-live="polite" className="sr-only" />;

  let notice;
  if (problem.kind === "failure") {
    notice = (
      <Notice
        tone="amber"
        action={
          onRetry && (
            <button type="button" onClick={onRetry} className={actionClass}>
              {t("failure.retry")}
            </button>
          )
        }
      >
        <span className="flex flex-col gap-0.5">
          <b>{t(`failure.${problem.action}`)}</b>
          <span>{t(`failure.${draft}`)}</span>
        </span>
      </Notice>
    );
  } else if (problem.kind === "invalid") {
    notice = (
      <Notice tone="coral">
        <span className="flex flex-col gap-0.5">
          <b>{t("invalid.title")}</b>
          <span>{t("invalid.body")}</span>
        </span>
      </Notice>
    );
  } else if (problem.kind === "rejected") {
    const fields = format.list(
      problem.profile.map((field) => t(`rejected.fields.${field}`)),
      { type: "conjunction" },
    );
    notice = (
      <Notice
        tone="coral"
        action={
          onGoProfile && (
            <button type="button" onClick={onGoProfile} className={actionClass}>
              {t("rejected.goProfile")}
            </button>
          )
        }
      >
        <span className="flex flex-col gap-0.5">
          <b>{t("rejected.title")}</b>
          <span>{t("rejected.body", { fields })}</span>
        </span>
      </Notice>
    );
  } else {
    notice = (
      <Notice
        tone="amber"
        action={
          <Link href={problem.href} className={actionClass}>
            {t("account.action")}
          </Link>
        }
      >
        <span className="flex flex-col gap-0.5">
          <b>{t("account.title")}</b>
          <span>{t("account.body")}</span>
        </span>
      </Notice>
    );
  }

  return (
    <div role="status" aria-live="polite" data-step-notice>
      {notice}
    </div>
  );
}
