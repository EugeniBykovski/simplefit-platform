"use client";

import {
  CheckIcon,
  CircleDotIcon,
  ClockIcon,
  InfoIcon,
  MailIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  AnswerSummary,
  SummaryRow,
  type SponsorApplication,
  type SponsorApplicationPolicy,
} from "@/entities/sponsor-application";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Notice } from "@/shared/ui/notice";

/*
 * SPA0 (SponsorEntry), SP9 (SponsorSubmitted) and SPX5's applicant states
 * (SponsorApp, MVP): presentation of states the flow decides from the
 * session and the backend's application. Nothing here creates anything.
 */

export type EntryState =
  "signed_out" | "registration" | "ready" | "resume" | "exists" | "member" | "expired" | "error";

const card = "flex min-w-0 flex-col gap-3 rounded-3xl border border-border bg-surface p-5";

/** SPA0's "How this works" card: what an application is and isn't. */
function HowItWorks() {
  const t = useTranslations("sponsorApplication.entry.how");
  return (
    <div className={card}>
      <h2 className="type-label text-faint-foreground">{t("title")}</h2>
      <dl>
        {(["account", "application", "review", "approval"] as const).map((key) => (
          <SummaryRow key={key} label={t(`${key}.label`)}>
            {t(`${key}.value`)}
          </SummaryRow>
        ))}
      </dl>
      <p className="type-body-sm text-muted-foreground">{t("note")}</p>
    </div>
  );
}

/**
 * SPA0 · entry and account continuation. `actions` are the state's buttons
 * and links, rendered by the flow (sign-in methods, links with the
 * continuation).
 */
export function EntryPanel({ state, actions }: { state: EntryState; actions: ReactNode }) {
  const t = useTranslations("sponsorApplication.entry");
  return (
    <div className="mx-auto grid w-full max-w-[1100px] items-start gap-14 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex max-w-130 flex-col gap-4" data-entry-state={state}>
        <h1
          id="sa-entry-title"
          tabIndex={-1}
          className="type-site-section-sm outline-none md:type-site-section"
        >
          {t(`${state}.title`)}
        </h1>
        <p className="type-body-lg text-muted-foreground">{t(`${state}.body`)}</p>
        <div className="flex flex-col gap-2.5">{actions}</div>
      </div>
      <HowItWorks />
    </div>
  );
}

/** SP9 · Submitted: shown only once the backend confirmed the submission. */
export function SubmittedPanel({
  application,
  actions,
}: {
  application: SponsorApplication;
  actions: ReactNode;
}) {
  const t = useTranslations("sponsorApplication.submitted");
  const format = useFormatter();
  const at = application.submitted_at;
  return (
    <div className="mx-auto grid w-full max-w-[1200px] items-start gap-12 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex flex-col gap-5">
        <span role="status" className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-11 items-center justify-center rounded-md-lg bg-accent"
          >
            <CheckIcon className="size-5.5 text-highlight" />
          </span>
          <Badge variant="accent">
            <CheckIcon aria-hidden />
            {t("badge")}
          </Badge>
        </span>
        <h1
          id="sa-submitted-title"
          tabIndex={-1}
          className="type-site-section outline-none md:type-onboarding-done"
        >
          {t("title")}
        </h1>
        <p className="type-site-body text-muted-foreground">{t("body")}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actions}</div>
      </div>
      <div className={card}>
        <h2 className="type-label text-faint-foreground">{t("cardTitle")}</h2>
        <dl>
          <SummaryRow label={t("company")}>{application.answers.company_name ?? "—"}</SummaryRow>
          <SummaryRow label={t("submittedAt")}>
            {at === null
              ? "—"
              : format.dateTime(new Date(at), { dateStyle: "long", timeStyle: "short" })}
          </SummaryRow>
          <SummaryRow label={t("status")}>{t("statusValue")}</SummaryRow>
        </dl>
        <p className="type-body-sm text-muted-foreground">{t("note")}</p>
      </div>
    </div>
  );
}

/** The applicant states this client knows; any other status is shown as unknown, never guessed. */
const KNOWN = [
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
] as const;
type KnownStatus = (typeof KNOWN)[number];
const isKnown = (status: string): status is KnownStatus =>
  (KNOWN as readonly string[]).includes(status);

type Mark = "done" | "now" | "later";

function progressOf(status: KnownStatus): [Mark, Mark, Mark] {
  switch (status) {
    case "submitted":
      return ["done", "later", "later"];
    case "under_review":
    case "changes_requested":
      return ["done", "now", "later"];
    case "approved":
    case "rejected":
      return ["done", "done", "done"];
    default:
      return ["later", "later", "later"];
  }
}

/**
 * SPX5 · the application's status, as the backend reports it, without
 * portal navigation (an applicant is not a member). Only real data: the
 * submitted answers, the backend's submissions and the open change request.
 * There is no review time, reviewer, reason or withdrawal here: none exists
 * in the API.
 */
export function StatusPanel({
  application,
  policy,
  actions,
}: {
  application: SponsorApplication;
  policy?: SponsorApplicationPolicy;
  actions: ReactNode;
}) {
  const t = useTranslations("sponsorApplication.status");
  const format = useFormatter();
  const status = application.status;
  const known = isKnown(status) ? status : undefined;
  const key = known ?? "unknown";
  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });

  const history: { label: string; at: string }[] = [
    ...application.submissions.map((submission) => ({
      label: submission.sequence === 1 ? t("history.submitted") : t("history.resubmitted"),
      at: submission.submitted_at,
    })),
    ...(application.change_request === null
      ? []
      : [{ label: t("history.changesRequested"), at: application.change_request.requested_at }]),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const marks = known === undefined ? undefined : progressOf(known);
  const tone =
    known === "approved"
      ? "accent"
      : known === "changes_requested"
        ? "warning"
        : known === "rejected"
          ? "destructive"
          : "neutral";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-labelledby="sa-status-title" className={card}>
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant={tone} data-status={status}>
              {known === "approved" ? (
                <CheckIcon aria-hidden />
              ) : known === "changes_requested" ? (
                <MailIcon aria-hidden />
              ) : known === "rejected" ? (
                <TriangleAlertIcon aria-hidden />
              ) : (
                <ClockIcon aria-hidden />
              )}
              {t(`${key}.badge`)}
            </Badge>
          </div>
          <h1
            id="sa-status-title"
            tabIndex={-1}
            className="type-site-section-sm outline-none md:type-h1"
          >
            {t(`${key}.title`)}
          </h1>
          <p className="type-body text-muted-foreground">{t(`${key}.body`)}</p>
          {known === "changes_requested" && application.change_request !== null ? (
            <Notice tone="amber" icon={MailIcon}>
              <b>{t("fromSimpleFit")}</b> {application.change_request.message}
            </Notice>
          ) : null}
          {known === "approved" ? (
            <Notice tone="muted" icon={InfoIcon}>
              {t("approved.note")}
            </Notice>
          ) : null}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">{actions}</div>
        </section>
        {known !== "draft" ? (
          <section aria-labelledby="sa-status-answers" className={card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="sa-status-answers" className="type-title font-display">
                {t("answersTitle")}
              </h2>
              <Badge variant="neutral">{t("readOnly")}</Badge>
            </div>
            <AnswerSummary answers={application.answers} policy={policy} detailed />
          </section>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {marks !== undefined && known !== "draft" ? (
          <section aria-labelledby="sa-status-progress" className={card}>
            <h2 id="sa-status-progress" className="type-title font-display">
              {t("progress.title")}
            </h2>
            <ol aria-label={t("progress.label")} className="flex flex-col gap-2.5">
              {(["submitted", "reviewed", "decision"] as const).map((step, index) => {
                const mark = marks[index] ?? "later";
                return (
                  <li key={step} className="flex items-center gap-2.5 type-body-sm font-bold">
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-7 flex-none items-center justify-center rounded-full bg-surface-elevated",
                        mark === "done" && "text-highlight",
                        mark === "now" && "text-warning",
                        mark === "later" && "text-faint-foreground",
                      )}
                    >
                      {mark === "done" ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <CircleDotIcon className="size-3.5" />
                      )}
                    </span>
                    <span className="flex-1">{t(`progress.${step}`)}</span>
                    <span className="type-caption font-semibold text-muted-foreground">
                      {t(`progress.${mark}`)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
        {history.length > 0 ? (
          <section aria-labelledby="sa-status-history" className={card}>
            <h2 id="sa-status-history" className="type-title font-display">
              {t("history.title")}
            </h2>
            <ol className="flex flex-col">
              {history.map((entry) => (
                <li
                  key={`${entry.label}-${entry.at}`}
                  className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border-subtle py-2.5 type-body-sm"
                >
                  <span className="font-bold">{entry.label}</span>
                  <span className="text-muted-foreground">{date(entry.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </div>
  );
}
