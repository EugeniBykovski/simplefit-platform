"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { Notice } from "@/shared/ui/notice";

export type StepProblem =
  | "failure"
  | "invalid"
  | { kind: "rejected"; basics: string[]; profile: string[] }
  | { kind: "account"; href: string }
  | undefined;

const actionClass =
  "rounded-xs type-caption font-extrabold underline outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The step's status notices (WF0 / WF1 state tables):
 *
 * - `failure` (amber): the request did not reach the API; nothing typed is
 *   lost, Retry repeats the action;
 * - `invalid` (coral): the API, or the step's own check, flagged fields;
 * - `rejected` (coral): completion found missing requirements, listed per
 *   step, with a way back to Profile basics when some are there;
 * - `account` (amber): completion needs the shared account registration first.
 *
 * Announced politely, so a screen reader hears the outcome of the action.
 */
export function StepNotice({
  problem,
  draft,
  onRetry,
  onGoBasics,
}: {
  problem: StepProblem;
  draft: "typed" | "selected";
  onRetry?: () => void;
  onGoBasics?: () => void;
}) {
  const t = useTranslations("fighterOnboarding.notices");
  if (problem === undefined) return <div role="status" aria-live="polite" className="sr-only" />;

  let notice;
  if (problem === "failure") {
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
          <b>{t("failure.title")}</b>
          <span>{t(`failure.${draft}`)}</span>
        </span>
      </Notice>
    );
  } else if (problem === "invalid") {
    notice = (
      <Notice tone="coral">
        <span className="flex flex-col gap-0.5">
          <b>{t("invalid.title")}</b>
          <span>{t("invalid.body")}</span>
        </span>
      </Notice>
    );
  } else if (problem.kind === "rejected") {
    const lines = [
      problem.basics.length > 0
        ? t("rejected.basics", { fields: problem.basics.join(", ") })
        : undefined,
      problem.profile.length > 0
        ? t("rejected.profile", { fields: problem.profile.join(", ") })
        : undefined,
    ].filter((line) => line !== undefined);
    notice = (
      <Notice
        tone="coral"
        action={
          problem.basics.length > 0 &&
          onGoBasics && (
            <button type="button" onClick={onGoBasics} className={actionClass}>
              {t("rejected.goBasics")}
            </button>
          )
        }
      >
        <span className="flex flex-col gap-0.5">
          <b>{t("rejected.title")}</b>
          <span>{lines.join(" · ")}</span>
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
