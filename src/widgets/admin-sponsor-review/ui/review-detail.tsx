"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, DownloadIcon, SearchXIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  documentDownload,
  reviewQueryKey,
  reviewQueuePrefix,
  useReviewApplication,
  type ReviewAction,
  type ReviewApplication,
} from "@/entities/admin-sponsor-review";
import { grants, needsEnrollment, useOperator, useOperatorKeys } from "@/entities/operator";
import { AnswerSummary, useSponsorApplicationPolicy } from "@/entities/sponsor-application";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { ReviewActionDialog } from "./review-action-dialog";
import { OrganizationBadge, Restricted, StatusBadge } from "./review-parts";

/** The actions an application's state allows, before permissions (the backend decides). */
const BY_STATUS: Record<ReviewApplication["status"], readonly ReviewAction[]> = {
  submitted: ["claim"],
  under_review: ["request_changes", "reject", "approve"],
  changes_requested: [],
  approved: [],
  rejected: [],
  withdrawn: [],
};

/**
 * AS2, one sponsor application (SF-124; Claude Design `AdminSponsorDetail`, MVP): exactly
 * what was last submitted, read only; the documents of a submission, each downloaded on
 * request through a short-lived link; the history; and the review actions the state and
 * the operator's permissions allow, each through the SF-111 framework. An approved
 * application shows its organization and, with `sponsors.restrict`, suspension or
 * reinstatement. The backend re-checks everything; a party to the application can't act.
 */
export function ReviewDetail({ applicationId }: { applicationId: string }) {
  const t = useTranslations("controlPlane.sponsorReview");
  const common = useTranslations("controlPlane.users");
  const read = useReviewApplication(applicationId);
  const operator = useOperator().data;
  const revoked = operator != null && !grants(operator, "sponsors.applications.read");

  let body: ReactNode;
  if (revoked || (isApiError(read.error) && read.error.status === 403)) {
    body = <Restricted />;
  } else if (isApiError(read.error) && read.error.status === 404) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-2.5 rounded-3xl border bg-surface p-6.5">
        <Badge variant="neutral" className="gap-1.5 uppercase">
          <SearchXIcon aria-hidden className="size-3.5" />
          {t("detail.notFound.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("detail.notFound.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("detail.notFound.body")}</p>
      </section>
    );
  } else if (read.isError) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5">
        <Badge variant="destructive" className="gap-1.5 uppercase">
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {common("error.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{common("error.title")}</h2>
        <p role="alert" className="type-body-sm text-muted-foreground">
          {common("error.body")}
        </p>
        <Button onClick={() => void read.refetch()}>{common("error.retry")}</Button>
      </section>
    );
  } else if (read.data === undefined) {
    body = (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("detail.loading")}
        className="grid gap-4 lg:grid-cols-3"
      >
        <Skeleton className="h-64 rounded-lg lg:col-span-2" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  } else {
    body = <Application application={read.data} />;
  }

  const name = read.data?.latest_submission?.answers.company_name;
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">
              <Link
                href={routeHref("web.admin.sponsors")}
                className="underline-offset-4 hover:underline"
              >
                {t("title")}
              </Link>
              {name ? ` / ${name}` : ""}
            </p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("detail.title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">{body}</PageBody>
    </div>
  );
}

function Application({ application }: { application: ReviewApplication }) {
  const t = useTranslations("controlPlane.sponsorReview");
  const format = useFormatter();
  const client = useQueryClient();
  const operator = useOperator().data;
  const policy = useSponsorApplicationPolicy().data;
  // The dialog stays mounted after it closes, so focus returns to the button that opened it.
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const submission = application.latest_submission;
  const label = submission?.answers.company_name ?? t("noName");
  const date = (value: string) => format.dateTime(new Date(value), "dateTime");
  const may = (permission: string) => (operator ? grants(operator, permission) : false);
  const party = application.viewer_is_party === true;

  const actions: ReviewAction[] = [...BY_STATUS[application.status]];
  if (application.status === "approved" && application.organization?.status === "active")
    actions.push("suspend_organization");
  if (application.status === "approved" && application.organization?.status === "suspended")
    actions.push("reinstate_organization");
  const permitted = actions.filter((item) =>
    may(
      {
        claim: "sponsors.applications.claim",
        request_changes: "sponsors.applications.request_changes",
        approve: "sponsors.applications.approve",
        reject: "sponsors.applications.reject",
        suspend_organization: "sponsors.restrict",
        reinstate_organization: "sponsors.restrict",
      }[item],
    ),
  );

  const settle = () => {
    void client.invalidateQueries({ queryKey: reviewQueryKey(application.application_id) });
    void client.invalidateQueries({ queryKey: reviewQueuePrefix });
  };

  return (
    <div
      data-review-application={application.application_id}
      data-application-status={application.status}
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-3 rounded-3xl border bg-surface p-5">
        <h2 className="type-h3 font-display">{t("detail.heading", { organization: label })}</h2>
        <dl className="grid gap-3 sm:grid-cols-4" data-review-badges>
          <Chip label={t("chips.application")}>
            <StatusBadge status={application.status} />
          </Chip>
          <Chip label={t("chips.organization")}>
            <OrganizationBadge organization={application.organization} />
          </Chip>
          <Chip label={t("chips.verification")}>
            <Badge variant="neutral" className="uppercase">
              {t("chips.notOffered")}
            </Badge>
          </Chip>
          <Chip label={t("chips.commercial")}>
            <Badge variant="neutral" className="uppercase">
              {t("chips.none")}
            </Badge>
          </Chip>
        </dl>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Section
            id="answers"
            title={t("detail.answers.title")}
            meta={t("detail.answers.meta", { revision: application.revision })}
          >
            {submission === null ? (
              <p className="type-body-sm text-muted-foreground">{t("detail.answers.none")}</p>
            ) : (
              <>
                <AnswerSummary answers={submission.answers} policy={policy} detailed />
                <dl className="flex flex-col">
                  <Fact label={t("detail.answers.website")}>
                    {submission.answers.website ?? "—"}
                  </Fact>
                  <Fact label={t("detail.answers.email")}>
                    {submission.answers.contact_email ?? "—"}{" "}
                    <span className="type-caption text-muted-foreground">
                      {submission.contact_email_verified
                        ? t("detail.answers.verified")
                        : t("detail.answers.notVerified")}
                    </span>
                  </Fact>
                  <Fact label={t("detail.answers.phone")}>
                    {submission.answers.contact_phone ?? "—"}
                  </Fact>
                  <Fact label={t("detail.answers.submitted")}>
                    {t("detail.answers.submission", {
                      sequence: submission.sequence,
                      date: date(submission.submitted_at),
                    })}
                  </Fact>
                  <Fact label={t("detail.answers.declaration")}>
                    {t("detail.answers.declarationValue", {
                      version: submission.declaration_version,
                      language: submission.declaration_language,
                    })}
                  </Fact>
                </dl>
                <p className="type-caption text-faint-foreground">{t("detail.answers.note")}</p>
              </>
            )}
          </Section>

          <Documents
            application={application}
            canDownload={may("sponsors.applications.read_files") && !party}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Section id="review" title={t("detail.review.title")}>
            <div className="flex flex-col gap-3" data-review-actions>
              {party ? (
                <p role="status" className="type-body-sm font-bold">
                  {t("detail.review.party")}
                </p>
              ) : (
                <>
                  <p className="type-body-sm text-muted-foreground">
                    {t(`detail.review.state.${application.status}`)}
                  </p>
                  {application.change_request && (
                    <div className="flex flex-col gap-1 rounded-xl border p-3" data-change-request>
                      <p className="type-label text-faint-foreground uppercase">
                        {t("detail.review.changeRequest")}
                      </p>
                      <p className="type-body-sm">{application.change_request.message}</p>
                    </div>
                  )}
                  {permitted.length > 0 && (
                    <>
                      <p className="type-caption text-muted-foreground sm:hidden">
                        {t("detail.review.smallScreen")}
                      </p>
                      <div className="hidden flex-wrap gap-2 sm:flex">
                        {permitted.map((item) => (
                          <Button
                            key={item}
                            variant={
                              item === "approve"
                                ? "primary"
                                : item === "reject" || item === "suspend_organization"
                                  ? "destructive"
                                  : "quiet"
                            }
                            onClick={(event) => {
                              setTrigger(event.currentTarget);
                              setAction(item);
                              setDialogOpen(true);
                            }}
                          >
                            {t(`detail.review.actions.${item}`)}
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                  {actions.length > permitted.length && (
                    <p className="type-caption text-faint-foreground">
                      {t("detail.review.notPermitted")}
                    </p>
                  )}
                </>
              )}
              <p className="type-caption text-faint-foreground">
                {t("detail.review.approvalNote")}
              </p>
            </div>
          </Section>

          {application.organization && (
            <Section id="organization" title={t("detail.organization.title")}>
              <dl className="flex flex-col">
                <Fact label={t("detail.organization.status")}>
                  <OrganizationBadge organization={application.organization} />
                </Fact>
                {application.decided_at && (
                  <Fact label={t("detail.organization.approved")}>
                    {date(application.decided_at)}
                  </Fact>
                )}
              </dl>
              <p className="type-caption text-faint-foreground">
                {t(`detail.organization.notes.${application.organization.status}`)}
              </p>
            </Section>
          )}

          <Section id="history" title={t("detail.history.title")}>
            <ol className="flex flex-col gap-2" data-review-history>
              {application.history.map((entry) => (
                <li key={`${entry.event}-${entry.occurred_at}`} className="flex flex-col gap-0.5">
                  <span className="type-body-sm font-bold">{historyName(t, entry.event)}</span>
                  <span className="type-caption text-faint-foreground">
                    {[
                      t(`detail.history.actor.${entry.actor}`),
                      date(entry.occurred_at),
                      entry.reason_code ? reasonName(t, entry.reason_code) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
            <p className="type-caption text-faint-foreground">{t("detail.history.note")}</p>
          </Section>
        </div>
      </div>

      {action && (
        <ReviewActionDialog
          key={action}
          action={action}
          applicationId={application.application_id}
          label={label}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSettled={settle}
          returnFocusTo={trigger}
        />
      )}
    </div>
  );
}

type T = ReturnType<typeof useTranslations<"controlPlane.sponsorReview">>;

const historyName = (t: T, event: string) => {
  const key = `detail.history.events.${event.replace("sponsor_application.", "")}`;
  return t.has(key as Parameters<T["has"]>[0]) ? t(key as Parameters<T>[0]) : event;
};

const reasonName = (t: T, code: string) =>
  t.has(`reasons.${code}` as Parameters<T["has"]>[0])
    ? t(`reasons.${code}` as Parameters<T>[0])
    : code;

function Documents({
  application,
  canDownload,
}: {
  application: ReviewApplication;
  canDownload: boolean;
}) {
  const t = useTranslations("controlPlane.sponsorReview.detail.documents");
  const keys = useOperatorKeys();
  const format = useFormatter();
  const [state, setState] = useState<Record<string, "busy" | "step_up" | "failed" | "denied">>({});

  const download = async (evidenceId: string, retried = false): Promise<void> => {
    setState((current) => ({ ...current, [evidenceId]: "busy" }));
    try {
      const url = await documentDownload(application.application_id, evidenceId);
      // Used once, at once; never kept in state, storage or logs.
      window.location.assign(url);
      setState(({ [evidenceId]: _done, ...rest }) => rest);
    } catch (error) {
      // SF-157: without keys the gate shows key registration instead.
      if (needsEnrollment(error)) {
        setState(({ [evidenceId]: _done, ...rest }) => rest);
        return;
      }
      if (isApiError(error) && error.code === "step_up_required" && !retried) {
        try {
          await keys.verifyKey();
          return download(evidenceId, true);
        } catch {
          setState((current) => ({ ...current, [evidenceId]: "step_up" }));
          return;
        }
      }
      const denied = isApiError(error) && (error.status === 403 || error.status === 404);
      setState((current) => ({ ...current, [evidenceId]: denied ? "denied" : "failed" }));
    }
  };

  return (
    <Section id="documents" title={t("title")}>
      {application.evidence.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="flex flex-col divide-y" data-review-documents>
          {application.evidence.map((document) => (
            <li
              key={document.evidence_id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="flex flex-col">
                <span className="type-body-sm font-bold">
                  {t.has(`kinds.${document.kind}` as Parameters<typeof t.has>[0])
                    ? t(`kinds.${document.kind}` as Parameters<typeof t>[0])
                    : document.kind}
                </span>
                <span className="type-caption text-faint-foreground">
                  {t("meta", {
                    type: document.content_type,
                    size: format.number(document.byte_size / 1024, { maximumFractionDigits: 0 }),
                  })}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                {canDownload ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    loading={state[document.evidence_id] === "busy"}
                    onClick={() => void download(document.evidence_id)}
                  >
                    <DownloadIcon aria-hidden />
                    {t("download")}
                  </Button>
                ) : (
                  <span className="type-caption text-faint-foreground">{t("noAccess")}</span>
                )}
                {state[document.evidence_id] && state[document.evidence_id] !== "busy" && (
                  <span role="alert" className="type-caption text-destructive">
                    {t(`errors.${state[document.evidence_id] as "failed"}`)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="type-caption text-faint-foreground">{t("note")}</p>
    </Section>
  );
}

function Section({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`review-${id}`}
      className="flex flex-col gap-3 rounded-3xl border bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`review-${id}`} className="type-title font-display">
          {title}
        </h2>
        {meta && <span className="type-label text-faint-foreground uppercase">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border-subtle py-2.5 type-body-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-bold break-words">{children}</dd>
    </div>
  );
}

function Chip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="type-label text-faint-foreground uppercase">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
