"use client";

import { CircleAlertIcon, ClockIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { primaryLocation, type Gym } from "@/entities/gym";
import { useGymSetup, type GymSetup } from "@/entities/gym-setup";
import { initialsOf } from "@/features/session-gate";
import { isApiError } from "@/shared/api/http/api-error";
import { countryName } from "@/shared/lib/countries";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

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
const LATER = ["members", "schedule", "attendance", "staff"] as const;

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

  return (
    <div data-gym-dashboard data-gym-id={gym.id} className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate type-label text-faint-foreground">
            {t("eyebrow", { date: today, where })}
          </p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
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
    </div>
  );
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
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
    <Section id="gym-access-heading" title={t("title")}>
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
