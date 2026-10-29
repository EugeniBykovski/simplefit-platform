"use client";

import { CircleAlertIcon, ClockIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { gymQueryKey, primaryLocation, type Gym } from "@/entities/gym";
import {
  FIRST_RUN_PERMISSION,
  isFirstRunConflict,
  useGymFirstRun,
  useGymFirstRunActions,
  type GymFirstRunAction,
} from "@/entities/gym-first-run";
import { useGymSetup, type GymSetup } from "@/entities/gym-setup";
import { initialsOf } from "@/features/session-gate";
import { isApiError } from "@/shared/api/http/api-error";
import { countryName } from "@/shared/lib/countries";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import {
  FirstRunIntro,
  FirstRunIntroLoading,
  FirstRunUnavailable,
  GymChecklist,
  GymChecklistLoading,
  SkipDialog,
  type IntroAction,
} from "./gym-first-run";
import { GymTour } from "./gym-tour";
import { useGymWorkspace } from "./gym-workspace";

type AccentName = "olive" | "amber" | "coral" | "sky" | "bone" | "moss";

/** The OG3 swatches (`GymSetup.accent_color`), by their names in `gymOnboarding`. */
const ACCENTS: Record<string, AccentName> = {
  "#aeb95a": "olive",
  "#e3a24f": "amber",
  "#e07a5f": "coral",
  "#7fa7c9": "sky",
  "#edefe7": "bone",
  "#8d9840": "moss",
};

/**
 * The console areas whose domains do not exist yet (SF-82 R5/C7): listed as
 * coming later, never as tiles with numbers, because no backend counts them.
 */
// Coaches & staff has its page since SF-94.
const LATER = ["members", "schedule", "attendance"] as const;

/**
 * WG1, the gym dashboard (`web.app.gyms._gym-id`, SF-88), inside the gym
 * console of the gym in the path. Only real data is shown:
 *
 * - the gym (`GET /api/v1/gyms/{gym_id}`): name, type, primary location,
 *   setup status and the viewer's own role;
 * - for the owner, the saved setup (`GET /api/v1/gyms/{gym_id}/setup`):
 *   address, contact, tagline and accent colour, a section of its own whose
 *   failure leaves the rest of the page in place.
 *
 * Every WG1 tile whose domain does not exist yet (members, classes,
 * bookings, check-ins, revenue, leads, incidents, community, shifts) is
 * hidden, never shown as zero (SF-82 R5). Other roles see the gym, their
 * access and a limited-access notice until their dashboards are designed.
 */
export function GymDashboard() {
  const gym = useGymWorkspace();
  return <GymDashboardView gym={gym} />;
}

export function GymDashboardView({ gym }: { gym: Gym }) {
  const t = useTranslations("gymConsole.dashboard");
  const format = useFormatter();
  const owner = gym.viewer.role === "owner";
  const location = primaryLocation(gym);
  const where = gym.locations.length === 1 && location !== null ? location.name : t("allLocations");
  const today = format.dateTime(new Date(), { weekday: "short", month: "short", day: "numeric" });
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRun = useOwnerFirstRun(gym, heading);

  return (
    <div
      data-gym-dashboard
      data-gym-id={gym.id}
      data-first-run={firstRun.mode}
      className="flex min-h-full flex-col"
    >
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate type-label text-faint-foreground">
            {t("eyebrow", { date: today, where })}
          </p>
          <h1 ref={heading} tabIndex={-1} className="type-h3 font-display outline-none">
            {t("title")}
          </h1>
        </div>
      </PageHeader>
      {firstRun.mode === "off" ? (
        <PageBody className="grid content-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <GymSummary gym={gym} owner={owner} />
            {owner ? <GymDetails gymId={gym.id} /> : <LimitedAccess gym={gym} />}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <YourAccess gym={gym} />
            <ComingLater />
          </div>
        </PageBody>
      ) : (
        // GRW1: the introduction and the checklist beside the gym and its access.
        <PageBody className="grid content-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">{firstRun.panel}</div>
          <div className="flex min-w-0 flex-col gap-4">
            <GymSummary gym={gym} owner={owner} />
            <YourAccess gym={gym} />
          </div>
        </PageBody>
      )}
      {firstRun.overlays}
    </div>
  );
}

/**
 * The owner's first run on this gym (SF-90 lifecycle, SF-91 UI), read only
 * with the `manage_first_run` permission (owner): managers, coaches and front
 * desk never call it and keep WG1. Modes:
 *
 * - `off`: no permission, a 403, or an outcome kept before this page was
 *   opened (completed and dismissed never reopen; WG1 shows).
 * - `loading`, `unavailable` (the read failed; the console works without it).
 * - `offer`: `not_started` or `in_progress` (started on another device).
 * - `kept`: an outcome kept on this page, said once until the next visit.
 *
 * A 404 means the gym itself is gone for this user: the gym is re-read so the
 * console shows "not available". A 409 (the other outcome was kept elsewhere)
 * re-reads the state, closes the tour if it is open and shows what the
 * backend kept.
 */
function useOwnerFirstRun(gym: Gym, heading: RefObject<HTMLHeadingElement | null>) {
  const enabled = gym.viewer.permissions.includes(FIRST_RUN_PERMISSION);
  const query = useGymFirstRun(gym.id, enabled);
  const transition = useGymFirstRunActions(gym.id);
  const client = useQueryClient();
  const [keptHere, setKeptHere] = useState(false);
  const [pending, setPending] = useState<IntroAction>();
  const [failed, setFailed] = useState<IntroAction>();
  const [skipping, setSkipping] = useState(false);
  const [touring, setTouring] = useState(false);

  const data = query.data?.gym_id === gym.id ? query.data : undefined;
  const status = isApiError(query.error) ? query.error.status : undefined;
  // The gym is gone for this user (revoked meanwhile): the console re-reads it and shows "not available".
  useEffect(() => {
    if (status === 404) void client.invalidateQueries({ queryKey: gymQueryKey(gym.id) });
  }, [client, gym.id, status]);

  const act = useCallback(
    async (action: GymFirstRunAction) => {
      try {
        const kept = await transition(action);
        if (kept.status === "completed" || kept.status === "dismissed") setKeptHere(true);
        return kept;
      } catch (error) {
        // The other outcome was kept elsewhere: the tour closes and the page shows the backend's answer.
        if (isFirstRunConflict(error)) {
          setKeptHere(true);
          setTouring(false);
        }
        if (isApiError(error) && error.status === 404) {
          void client.invalidateQueries({ queryKey: gymQueryKey(gym.id) });
        }
        throw error;
      }
    },
    [client, gym.id, transition],
  );

  const start = async () => {
    setPending("start");
    setFailed(undefined);
    try {
      const kept = await act("start");
      if (kept.status === "in_progress") setTouring(true);
    } catch {
      setFailed("start");
    } finally {
      setPending(undefined);
    }
  };

  const skip = async () => {
    setPending("dismiss");
    setFailed(undefined);
    try {
      await act("dismiss");
      setSkipping(false);
    } catch (error) {
      if (isFirstRunConflict(error)) setSkipping(false);
      else setFailed("dismiss");
    } finally {
      setPending(undefined);
    }
  };

  let mode: "off" | "loading" | "unavailable" | "offer" | "kept" = "off";
  if (!enabled || status === 403 || status === 404) mode = "off";
  else if (data === undefined) mode = query.isError ? "unavailable" : "loading";
  else if (data.status === "not_started" || data.status === "in_progress") mode = "offer";
  else if (keptHere && (data.status === "completed" || data.status === "dismissed")) mode = "kept";

  let panel: ReactNode = null;
  if (mode === "loading") {
    panel = (
      <>
        <FirstRunIntroLoading />
        <GymChecklistLoading />
      </>
    );
  } else if (mode === "unavailable") {
    panel = <FirstRunUnavailable onRetry={() => void query.refetch()} />;
  } else if (data !== undefined && (mode === "offer" || mode === "kept")) {
    panel = (
      <>
        <FirstRunIntro
          firstRun={data}
          pending={pending}
          failed={failed === "start"}
          onStart={() => void start()}
          onSkip={() => {
            setFailed(undefined);
            setSkipping(true);
          }}
        />
        <GymChecklist
          items={data.checklist}
          staffHref={
            gym.viewer.permissions.includes("invite_staff")
              ? routeHref("web.app.gyms._gym-id.staff", { gymId: gym.id })
              : undefined
          }
        />
      </>
    );
  }

  const overlays =
    !enabled || mode === "off" ? null : (
      <>
        <SkipDialog
          open={skipping}
          pending={pending === "dismiss"}
          failed={failed === "dismiss"}
          onConfirm={() => void skip()}
          onCancel={() => setSkipping(false)}
          onClosed={() => {
            // Back to "Skip introduction" when it is still there; the page otherwise.
            const skip = document.querySelector<HTMLElement>("[data-first-run-skip]");
            (skip ?? heading.current)?.focus();
          }}
        />
        <GymTour
          open={touring}
          gymName={gym.name}
          onComplete={() => act("complete")}
          onDismiss={() => act("dismiss")}
          onClose={() => setTouring(false)}
          onClosed={() => heading.current?.focus()}
        />
      </>
    );

  return { mode, panel, overlays };
}

function Section({
  id,
  title,
  aside,
  tourTarget,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  /** The GRW2 anchor of this card (SF-91). */
  tourTarget?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-tour-target={tourTarget}
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="type-label text-faint-foreground">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * OG1's "How members see you" card with the gym's real name, type and
 * primary location; the tile carries the saved accent colour once the setup
 * is read (owner) and the plain olive tile otherwise.
 */
function GymSummary({ gym, owner }: { gym: Gym; owner: boolean }) {
  const t = useTranslations("gymConsole.dashboard");
  const types = useTranslations("gymOnboarding.gymTypes");
  const locale = useLocale();
  const location = primaryLocation(gym);
  const place =
    location === null
      ? null
      : [location.city, countryName(location.country_code, locale)].join(", ");
  const setup = useGymSetup(owner ? gym.id : null);
  const accent = setup.data?.gym_id === gym.id ? setup.data.accent_color : null;

  return (
    <Section
      id="gym-summary-heading"
      title={t("summary.title")}
      tourTarget="gym-summary"
      aside={<Badge variant="accent">{t("summary.completed")}</Badge>}
    >
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden
          className={cn(
            "flex size-14 flex-none items-center justify-center rounded-2xl type-body font-display font-semibold",
            accent === null && "bg-accent text-highlight",
          )}
          style={
            accent === null ? undefined : { backgroundColor: accent, color: "var(--graphite-950)" }
          }
        >
          {initialsOf(gym.name)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-title font-display break-words" data-gym-name>
            {gym.name}
          </p>
          <p className="type-body-sm text-muted-foreground">
            {[types(gym.gym_type), place].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    </Section>
  );
}

/**
 * The owner's saved setup: its own read, so a failure here (offline, 5xx,
 * 403) keeps the gym summary and the access card on screen with a retry.
 */
function GymDetails({ gymId }: { gymId: string }) {
  const t = useTranslations("gymConsole.dashboard");
  const setup = useGymSetup(gymId);
  const data = setup.data?.gym_id === gymId ? setup.data : undefined;

  let body: ReactNode;
  if (data !== undefined) body = <DetailRows setup={data} />;
  else if (setup.isError) {
    const restricted = isApiError(setup.error) && setup.error.status === 403;
    body = (
      <Notice
        tone="amber"
        role="alert"
        icon={CircleAlertIcon}
        action={
          restricted ? undefined : (
            <Button variant="quiet" size="sm" onClick={() => void setup.refetch()}>
              {t("details.retry")}
            </Button>
          )
        }
      >
        {restricted ? t("details.restricted") : t("details.failed")}
      </Notice>
    );
  } else {
    body = (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("details.loading")}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  return (
    <Section id="gym-details-heading" title={t("details.title")}>
      {body}
    </Section>
  );
}

function DetailRows({ setup }: { setup: GymSetup }) {
  const t = useTranslations("gymConsole.dashboard.details");
  const colors = useTranslations("gymOnboarding.branding.accent.colors");
  const locale = useLocale();
  const location = setup.primary_location;
  const none = <span className="text-faint-foreground">{t("none")}</span>;
  const accent = setup.accent_color === null ? undefined : ACCENTS[setup.accent_color];

  const rows: [string, ReactNode][] = [
    [
      t("address"),
      location === null
        ? none
        : [
            location.address_line,
            `${location.city}, ${countryName(location.country_code, locale)}`,
            location.entrance_note,
          ]
            .filter(Boolean)
            .join("\n"),
    ],
    [t("phone"), setup.phone ?? none],
    [t("website"), setup.website ?? none],
    [t("tagline"), setup.tagline ?? none],
    [
      t("accent"),
      accent === undefined || setup.accent_color === null ? (
        none
      ) : (
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-4 rounded-full border"
            style={{ backgroundColor: setup.accent_color }}
          />
          {colors(accent)}
        </span>
      ),
    ],
  ];

  return (
    <dl className="flex flex-col">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex min-h-12 flex-col gap-1 border-t py-2 sm:flex-row sm:items-center sm:gap-3"
        >
          <dt className="type-caption font-bold text-faint-foreground sm:w-35 sm:flex-none">
            {label}
          </dt>
          <dd className="min-w-0 flex-1 type-body-sm font-bold break-words whitespace-pre-line">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Non-owner staff: the gym is theirs to open, its dashboard is not designed for their role yet. */
function LimitedAccess({ gym }: { gym: Gym }) {
  const t = useTranslations("gymConsole.dashboard.limited");
  const roles = useTranslations("gymConsole.switcher.roles");
  return (
    <Section id="gym-limited-heading" title={t("title")}>
      <Notice tone="amber" icon={CircleAlertIcon} data-gym-limited>
        {t("body", { role: roles(gym.viewer.role) })}
      </Notice>
    </Section>
  );
}

/** The viewer's own staff membership here: the backend's role, described by the approved matrix. */
function YourAccess({ gym }: { gym: Gym }) {
  const t = useTranslations("gymConsole.dashboard.access");
  const roles = useTranslations("gymConsole.switcher.roles");
  return (
    <Section id="gym-access-heading" title={t("title")} tourTarget="gym-access">
      <div className="flex flex-col gap-1">
        <p className="type-title font-extrabold" data-gym-role={gym.viewer.role}>
          {roles(gym.viewer.role)}
        </p>
        <p className="type-body-sm text-muted-foreground">{t(`roles.${gym.viewer.role}`)}</p>
      </div>
      <p className="type-caption text-faint-foreground">{t("note")}</p>
    </Section>
  );
}

function ComingLater() {
  const t = useTranslations("gymConsole.dashboard.later");
  return (
    <Section id="gym-later-heading" title={t("title")}>
      <ul className="flex flex-col">
        {LATER.map((area) => (
          <li key={area} className="flex items-center gap-3 border-t py-2.5 first:border-t-0">
            <ClockIcon aria-hidden className="size-4 flex-none text-faint-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-body-sm font-extrabold">{t(`${area}.title`)}</span>
              <span className="type-caption text-muted-foreground">{t(`${area}.body`)}</span>
            </span>
            <Badge variant="neutral">{t("badge")}</Badge>
          </li>
        ))}
      </ul>
    </Section>
  );
}
