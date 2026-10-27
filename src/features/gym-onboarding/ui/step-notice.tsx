"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Notice } from "@/shared/ui/notice";

import type { Requirement } from "../model/errors";

/** What a step tried when it failed. */
export type StepAction = "create" | "save" | "finish";

export type StepProblem =
  | { kind: "unconfirmed"; action: StepAction }
  | { kind: "invalid" }
  | { kind: "rejected"; missing: Requirement[] }
  | { kind: "account"; href: string }
  | { kind: "stale" }
  | { kind: "resumed" }
  | { kind: "discarded" }
  | { kind: "reused" }
  | { kind: "rateLimited"; at: number; until: number | null }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "session" }
  | { kind: "conflict" }
  | undefined;

export const noticeActionClass =
  "rounded-xs type-caption font-extrabold underline outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The step's status notices (OG1–OG3 states). Amber: something to act on
 * where nothing was lost; coral: something the visitor must change.
 *
 * - `unconfirmed`: no answer arrived, so the outcome is unknown; nothing typed
 *   is lost and Retry is safe (creation is idempotent, every save carries
 *   its revision);
 * - `stale`: the gym changed elsewhere; the latest saved version is loaded,
 *   the visitor's edits are kept, and only an explicit Reapply saves them;
 * - `resumed`: a create answered with the draft this account already had;
 * - `discarded` / `reused`: the create key's gym is gone or no longer the
 *   visitor's; Continue starts a new gym with what is typed;
 * - `rejected`: completion found requirements missing, with a way to them.
 *
 * Announced politely, so a screen reader hears the outcome of the action.
 */
export function StepNotice({
  problem,
  onRetry,
  onReapply,
  onGoTo,
  onRestart,
}: {
  problem: StepProblem;
  onRetry?: () => void;
  onReapply?: () => void;
  onGoTo?: (requirement: Requirement) => void;
  onRestart?: () => void;
}) {
  const t = useTranslations("gymOnboarding.notices");
  const format = useFormatter();
  if (problem === undefined) return <div role="status" aria-live="polite" className="sr-only" />;

  const action = (label: string, onClick?: () => void) =>
    onClick && (
      <button type="button" onClick={onClick} className={noticeActionClass}>
        {label}
      </button>
    );
  const body = (title: string, text: string) => (
    <span className="flex flex-col gap-0.5">
      <b>{title}</b>
      <span>{text}</span>
    </span>
  );

  let notice: ReactNode;
  switch (problem.kind) {
    case "unconfirmed":
      notice = (
        <Notice tone="amber" action={action(t("unconfirmed.retry"), onRetry)}>
          {body(t(`unconfirmed.${problem.action}`), t(`unconfirmed.${problem.action}Body`))}
        </Notice>
      );
      break;
    case "invalid":
      notice = <Notice tone="coral">{body(t("invalid.title"), t("invalid.body"))}</Notice>;
      break;
    case "rejected": {
      const fields = format.list(
        problem.missing.map((field) => t(`rejected.fields.${field}`)),
        { type: "conjunction" },
      );
      const first = problem.missing[0];
      notice = (
        <Notice
          tone="coral"
          action={
            first !== undefined &&
            action(t(`rejected.goTo.${first}`), onGoTo && (() => onGoTo(first)))
          }
        >
          {body(t("rejected.title"), t("rejected.body", { fields }))}
        </Notice>
      );
      break;
    }
    case "account":
      notice = (
        <Notice
          tone="amber"
          action={
            <Link href={problem.href} className={noticeActionClass}>
              {t("account.action")}
            </Link>
          }
        >
          {body(t("account.title"), t("account.body"))}
        </Notice>
      );
      break;
    case "stale":
      notice = (
        <Notice tone="amber" action={action(t("stale.reapply"), onReapply)}>
          {body(t("stale.title"), t("stale.body"))}
        </Notice>
      );
      break;
    case "resumed":
      notice = <Notice tone="amber">{body(t("resumed.title"), t("resumed.body"))}</Notice>;
      break;
    case "discarded":
    case "reused":
      notice = (
        <Notice tone="amber">{body(t(`${problem.kind}.title`), t(`${problem.kind}.body`))}</Notice>
      );
      break;
    case "rateLimited":
      notice = (
        <Notice tone="amber">
          {body(
            t("rateLimited.title"),
            problem.until === null
              ? t("rateLimited.body")
              : t("rateLimited.bodyAfter", {
                  time: format.relativeTime(problem.until, problem.at),
                }),
          )}
        </Notice>
      );
      break;
    case "forbidden":
      notice = <Notice tone="coral">{body(t("forbidden.title"), t("forbidden.body"))}</Notice>;
      break;
    case "gone":
      notice = (
        <Notice tone="amber" action={action(t("gone.restart"), onRestart)}>
          {body(t("gone.title"), t("gone.body"))}
        </Notice>
      );
      break;
    case "session":
      notice = (
        <Notice
          tone="amber"
          action={
            <Link href={routeHref("web.login")} className={noticeActionClass}>
              {t("session.action")}
            </Link>
          }
        >
          {body(t("session.title"), t("session.body"))}
        </Notice>
      );
      break;
    case "conflict":
      notice = (
        <Notice tone="amber" action={action(t("unconfirmed.retry"), onRetry)}>
          {body(t("conflict.title"), t("conflict.body"))}
        </Notice>
      );
      break;
  }

  return (
    <div role="status" aria-live="polite" data-step-notice={problem.kind}>
      {notice}
    </div>
  );
}
