"use client";

import { ChevronRightIcon, LockIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { Gym } from "@/entities/gym";
import {
  canViewGoLive,
  useGymGoLive,
  type GymGoLive as Readiness,
  type GymGoLiveCheck,
} from "@/entities/gym-verification";
import {
  VerificationProblemNotice,
  verificationReadProblem,
} from "@/features/gym-verification-manage";
import { Link } from "@/shared/i18n/navigation";
import { routeHref, type WebRouteId } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

/*
 * OG14 "Go live" (`web.app.gyms._gym-id.settings.go-live`; Claude Design
 * 1793198527-a0fc, WebSetupLaunch, a FUTURE board built on the SF-103
 * readiness API with adaptations): every check, its status and whether it
 * is required come from the backend's evaluation (`getGymGoLive`), never
 * from the client. The design's "Publish gym" button, "Everything is
 * ready", Discover, the member invites "tomorrow 10:00" and the E05 email
 * have no approved publishing surface or policy: publication is shown as
 * not available, and nothing here publishes.
 */

/** Where an action key leads: only screens that exist are linked. */
const ACTION_ROUTES: Partial<Record<NonNullable<GymGoLiveCheck["action"]>, WebRouteId>> = {
  open_verification: "web.app.gyms._gym-id.settings.verification",
  open_timetable: "web.app.gyms._gym-id.timetable",
  open_staff: "web.app.gyms._gym-id.staff",
  open_members: "web.app.gyms._gym-id.members",
};

/** The reason codes this client words; another code is shown without a reason line. */
const REASONS = [
  "setup_completed",
  "setup_incomplete",
  "location_set",
  "location_missing",
  "approved",
  "in_review",
  "not_started",
  "draft",
  "changes_requested",
  "rejected",
  "revoked",
  "class_scheduled",
  "no_upcoming_class",
  "staff_active",
  "no_active_staff",
  "members_active",
  "no_active_members",
  "product_published",
  "no_published_product",
  "decisions_not_approved",
  "public_surface_not_available",
  "community_features_not_available",
] as const;
type Reason = (typeof REASONS)[number];
const known = (code: string): code is Reason => (REASONS as readonly string[]).includes(code);

const statusTone = {
  passed: "success",
  failed: "neutral",
  pending: "warning",
  blocked: "outline",
  unavailable: "outline",
} as const;

export function GymGoLive({ gym }: { gym: Gym }) {
  return <GoLivePage key={gym.id} gym={gym} />;
}

function GoLivePage({ gym }: { gym: Gym }) {
  const t = useTranslations("gymGoLive");
  const allowed = canViewGoLive(gym.viewer);
  const query = useGymGoLive(gym.id, { enabled: allowed });

  if (!allowed)
    return (
      <PageBody className="pt-5.5" data-gym-go-live data-go-live-restricted>
        <Notice tone="muted" icon={LockIcon}>
          <span className="flex flex-col gap-1">
            <strong className="type-body-sm font-semibold text-foreground">
              {t("restricted.title")}
            </strong>
            <span>{t("restricted.body")}</span>
          </span>
        </Notice>
      </PageBody>
    );

  if (query.isError)
    return (
      <PageBody className="flex flex-col gap-3 pt-5.5" data-gym-go-live>
        <VerificationProblemNotice problem={verificationReadProblem(query.error)} />
        <div>
          <Button variant="quiet" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      </PageBody>
    );

  if (query.data === undefined)
    return (
      <PageBody className="pt-5.5" data-gym-go-live aria-busy>
        <Skeleton className="h-96 max-w-3xl rounded-3xl" />
      </PageBody>
    );

  return <GoLiveContent gymId={gym.id} readiness={query.data} />;
}

function GoLiveContent({ gymId, readiness }: { gymId: string; readiness: Readiness }) {
  const t = useTranslations("gymGoLive");
  const format = useFormatter();
  const groups = (["required", "recommended", "optional", "future"] as const)
    .map((requiredness) => ({
      requiredness,
      checks: readiness.checks.filter((check) => check.requiredness === requiredness),
    }))
    .filter((group) => group.checks.length > 0);

  return (
    <PageBody
      className="grid items-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
      data-gym-go-live
      data-prerequisites-met={readiness.prerequisites_met}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Notice
          tone={readiness.prerequisites_met ? "olive" : "muted"}
          role="status"
          data-go-live-summary
        >
          {readiness.prerequisites_met ? t("summary.met") : t("summary.notMet")}
        </Notice>
        {groups.map((group) => (
          <section
            key={group.requiredness}
            aria-labelledby={`go-live-${group.requiredness}`}
            className="flex flex-col gap-2"
          >
            <h2
              id={`go-live-${group.requiredness}`}
              className="px-1 type-label text-faint-foreground"
            >
              {t(`groups.${group.requiredness}`)}
            </h2>
            <ul className="flex flex-col divide-y divide-border rounded-3xl border border-border bg-card px-4">
              {group.checks.map((check) => (
                <CheckRow key={check.key} gymId={gymId} check={check} />
              ))}
            </ul>
          </section>
        ))}
        <p className="type-caption text-faint-foreground">
          {t("evaluated", {
            date: format.dateTime(new Date(readiness.evaluated_at), "dateTime"),
            policy: readiness.policy_version,
          })}
        </p>
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <section
          aria-labelledby="go-live-publication"
          className="flex flex-col gap-2.5 rounded-3xl border border-border bg-card px-5 py-5"
          data-publication={readiness.publication.status}
        >
          <h2 id="go-live-publication" className="type-label text-faint-foreground">
            {t("publication.title")}
          </h2>
          <p className="type-body-sm font-extrabold">{t("publication.unavailable")}</p>
          <p className="type-body-sm text-muted-foreground">{t("publication.body")}</p>
        </section>
      </aside>
    </PageBody>
  );
}

function CheckRow({ gymId, check }: { gymId: string; check: GymGoLiveCheck }) {
  const t = useTranslations("gymGoLive");
  const route = check.action === null ? undefined : ACTION_ROUTES[check.action];
  const actionable = route !== undefined && check.status !== "passed";

  return (
    <li
      className="flex flex-wrap items-center gap-3 py-3.5"
      data-check={check.key}
      data-check-status={check.status}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body-sm font-extrabold">{t(`checks.${check.key}.title`)}</span>
        {known(check.reason_code) && (
          <span className="type-caption text-muted-foreground">
            {t(`reasons.${check.reason_code}`)}
          </span>
        )}
      </span>
      <Badge variant={statusTone[check.status]}>{t(`status.${check.status}`)}</Badge>
      {actionable && (
        <Link
          href={routeHref(route, { gymId })}
          className="inline-flex items-center gap-1 type-caption font-extrabold text-highlight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={t("open", { check: t(`checks.${check.key}.title`) })}
        >
          {t("openShort")}
          <ChevronRightIcon aria-hidden className="size-3.5" />
        </Link>
      )}
    </li>
  );
}
