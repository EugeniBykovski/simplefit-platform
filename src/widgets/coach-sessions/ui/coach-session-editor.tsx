"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useCoachTrainingSession, type CoachTrainingSession } from "@/entities/training-session";
import {
  CreateTrainingSessionForm,
  EditTrainingSessionForm,
} from "@/features/training-session-form";
import { isApiError } from "@/shared/api/http/api-error";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

import { Card, SessionsPage, StateMessage } from "./parts";

/*
 * The session form pages (Claude Design 1792490047-d551, SF-64): a new
 * session (`web.app.coach.sessions.new`, WC3) and a planned session's edit
 * (`web.app.coach.sessions._session-id.edit`, WCT3). A saved session opens
 * its page (WCT2), as the backend returned it.
 */

export function CoachSessionCreate() {
  const t = useTranslations("coachSessions");
  const router = useRouter();
  return (
    <SessionsPage eyebrow={t("eyebrow")} title={t("form.newTitle")} back aside={t("form.aside")}>
      <Card>
        <CreateTrainingSessionForm
          onSaved={(session) => {
            toast.success(t("form.saved.created"));
            router.push(sessionHref(session));
          }}
        />
      </Card>
    </SessionsPage>
  );
}

export function CoachSessionEdit({ sessionId }: { sessionId: string }) {
  const t = useTranslations("coachSessions");
  const router = useRouter();
  const query = useCoachTrainingSession(sessionId);

  return (
    <SessionsPage eyebrow={t("eyebrow")} title={t("form.editTitle")} back aside={t("form.aside")}>
      <Card>
        {query.isError ? (
          isApiError(query.error) && query.error.status === 404 ? (
            <StateMessage
              role="status"
              title={t("detail.missing.title")}
              body={t("detail.missing.body")}
              action={
                <Button asChild variant="quiet">
                  <Link href={routeHref("web.app.coach.sessions")}>{t("back")}</Link>
                </Button>
              }
            />
          ) : (
            <StateMessage
              role="alert"
              title={t("detail.failed.title")}
              body={t("detail.failed.body")}
              action={
                <Button variant="quiet" onClick={() => void query.refetch()}>
                  {t("failed.retry")}
                </Button>
              }
            />
          )
        ) : query.data === undefined ? (
          <div role="status" aria-label={t("form.loading")} className="flex flex-col gap-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <EditTrainingSessionForm
            // A session read again (after a refused save) starts the form afresh.
            key={query.data.updated_at}
            session={query.data}
            onSaved={(session) => {
              // The form hands back the session it was given when nothing changed
              // (no request was sent): nothing to report as saved.
              if (session !== query.data) toast.success(t("form.saved.updated"));
              router.push(sessionHref(session));
            }}
          />
        )}
      </Card>
    </SessionsPage>
  );
}

const sessionHref = (session: CoachTrainingSession) =>
  routeHref("web.app.coach.sessions._session-id", { sessionId: session.id });
