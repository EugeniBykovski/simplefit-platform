"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import type { Gym } from "@/entities/gym";
import {
  useGymClassSeries,
  useGymClassSeriesList,
  useGymClassTemplates,
  useGymVenues,
  type GymClassSeries,
  type GymClassSeriesView,
  type GymClassTemplateView,
  type GymInstructor,
  type GymVenue,
  type GymVenueView,
  type TimetableCapabilities,
} from "@/entities/gym-timetable";
import {
  ArchiveTemplateDialog,
  CancelSeriesDialog,
  DeactivateVenueDialog,
  EditSeriesDialog,
  RepairSeriesButton,
  SkippedDates,
  TemplateDialog,
  useSeriesPeriod,
  useSeriesRule,
  VenueDialog,
} from "@/features/gym-timetable-manage";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";

import { Fact, ReadState, Segmented, useGoneGym } from "./shared";

/** A card with a heading, a view switch and an action. */
function Panel({
  id,
  title,
  lead,
  views,
  action,
  marker,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  views?: ReactNode;
  action?: ReactNode;
  marker: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
      {...marker}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="type-title font-display">
            {title}
          </h2>
          {lead && <p className="type-caption text-muted-foreground">{lead}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {views}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A row of a catalog list: one control per row, its button stretched over the row. */
function Row({
  title,
  lines,
  badge,
  selected,
  onSelect,
  actions,
  marker,
}: {
  title: string;
  lines: readonly string[];
  badge?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  actions?: ReactNode;
  marker: Record<string, string>;
}) {
  return (
    <li
      className={cn(
        "relative flex flex-wrap items-center gap-3 border-t py-3 first:border-t-0",
        selected && "rounded-xl bg-accent px-3",
      )}
      {...marker}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          {onSelect ? (
            <button
              type="button"
              aria-pressed={selected}
              onClick={onSelect}
              className="min-w-0 truncate text-left type-body-sm font-extrabold outline-none focus-visible:underline"
            >
              {title}
            </button>
          ) : (
            <span className="min-w-0 truncate type-body-sm font-extrabold">{title}</span>
          )}
          {badge}
        </span>
        {lines.map((line) => (
          <span key={line} className="type-caption text-muted-foreground">
            {line}
          </span>
        ))}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </li>
  );
}

function Incomplete() {
  const t = useTranslations("gymConsole.timetable.read");
  return <Notice tone="muted">{t("first100")}</Notice>;
}

/**
 * The gym's weekly series (active or cancelled) and one series' details:
 * its rule and period in its zone, venue, instructor, capacity, the
 * backend's counts and skipped dates, and its actions.
 */
export function SeriesTab({
  gym,
  can,
  venues,
  instructors,
  selectedId,
  onSelect,
  onShow,
}: {
  gym: Gym;
  can: TimetableCapabilities;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onShow: (series: GymClassSeries) => void;
}) {
  const t = useTranslations("gymConsole.timetable.series");
  const rule = useSeriesRule();
  const period = useSeriesPeriod();
  const [view, setView] = useState<GymClassSeriesView>("active");
  const list = useGymClassSeriesList(gym.id, view);
  useGoneGym(gym.id, list.error);
  const rows = list.data?.series ?? [];

  return (
    <div className="grid content-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Panel
        id="timetable-series-heading"
        title={t("heading")}
        lead={t("lead")}
        marker={{ "data-series-list": view }}
        views={
          <Segmented
            label={t("views")}
            marker="series"
            value={view}
            onChange={(next) => {
              setView(next);
              onSelect(null);
            }}
            options={[
              { value: "active", label: t("active") },
              { value: "cancelled", label: t("cancelled") },
            ]}
          />
        }
      >
        <ReadState
          error={list.error}
          loading={list.isPending}
          ready={list.data !== undefined}
          label={t("loading")}
          onRetry={() => void list.refetch()}
        >
          {rows.length === 0 ? (
            <p className="px-1 py-6 type-body-sm text-muted-foreground" data-series-empty>
              {t(`empty.${view}`)}
            </p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((series) => (
                <Row
                  key={series.series_id}
                  marker={{ "data-series": series.series_id }}
                  title={series.title}
                  lines={[rule(series), `${period(series)} · ${series.venue.name}`]}
                  selected={series.series_id === selectedId}
                  onSelect={() => onSelect(series.series_id)}
                  badge={
                    series.status === "cancelled" ? (
                      <Badge variant="destructive">{t("cancelledBadge")}</Badge>
                    ) : null
                  }
                />
              ))}
            </ul>
          )}
          {list.data && !list.data.complete && <Incomplete />}
        </ReadState>
      </Panel>
      {selectedId && (
        <SeriesDetails
          gym={gym}
          can={can}
          seriesId={selectedId}
          venues={venues}
          instructors={instructors}
          onShow={onShow}
        />
      )}
    </div>
  );
}

function SeriesDetails({
  gym,
  can,
  seriesId,
  venues,
  instructors,
  onShow,
}: {
  gym: Gym;
  can: TimetableCapabilities;
  seriesId: string;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  onShow: (series: GymClassSeries) => void;
}) {
  const t = useTranslations("gymConsole.timetable.series");
  const rule = useSeriesRule();
  const period = useSeriesPeriod();
  const detail = useGymClassSeries(gym.id, seriesId);
  useGoneGym(gym.id, detail.error);
  const series = detail.data;

  return (
    <section
      aria-labelledby="timetable-series-detail-heading"
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
      data-series-details={seriesId}
    >
      <ReadState
        error={detail.error}
        loading={detail.isPending}
        ready={series !== undefined}
        label={t("loading")}
        onRetry={() => void detail.refetch()}
        rows={3}
      >
        {series && (
          <>
            <h2 id="timetable-series-detail-heading" className="type-title font-display">
              {series.title}
            </h2>
            <p className="type-body-sm text-muted-foreground">{rule(series)}</p>
            <dl className="flex flex-col rounded-2xl border px-3.5">
              <Fact label={t("period")} field="period">
                {period(series)}
              </Fact>
              <Fact label={t("venue")} field="venue">
                {series.venue.name}
              </Fact>
              <Fact
                label={t("instructor")}
                field="instructor"
                tone={series.instructor === null ? "warning" : undefined}
              >
                {series.instructor?.name ?? t("noInstructor")}
              </Fact>
              <Fact label={t("duration")} field="duration">
                {t("minutes", { count: series.duration_minutes })}
              </Fact>
              <Fact label={t("capacity")} field="capacity">
                {t("max", { count: series.capacity })}
              </Fact>
              {series.scheduled_count !== undefined && (
                <Fact label={t("scheduled")} field="scheduled_count">
                  {series.scheduled_count}
                </Fact>
              )}
              {series.cancelled_count !== undefined && (
                <Fact label={t("cancelledCount")} field="cancelled_count">
                  {series.cancelled_count}
                </Fact>
              )}
              <Fact label={t("status")} field="status">
                {series.status === "active" ? t("active") : t("cancelledBadge")}
              </Fact>
            </dl>
            {(series.skipped_dates ?? []).length > 0 && (
              <SkippedDates dates={series.skipped_dates ?? []} zone={series.time_zone} />
            )}
            <p className="type-caption text-faint-foreground">{t("countsNote")}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="quiet" onClick={() => onShow(series)} data-series-show>
                {t("show")}
              </Button>
              {can.canManage && series.status === "active" && (
                <>
                  <EditSeriesDialog
                    gymId={gym.id}
                    series={series}
                    venues={venues}
                    instructors={instructors}
                    trigger={
                      <Button size="sm" data-series-edit={series.series_id}>
                        {t("edit")}
                      </Button>
                    }
                  />
                  <CancelSeriesDialog
                    gymId={gym.id}
                    series={series}
                    trigger={
                      <Button
                        size="sm"
                        variant="destructive-subtle"
                        data-series-cancel={series.series_id}
                      >
                        {t("cancel")}
                      </Button>
                    }
                  />
                </>
              )}
            </div>
            {can.canManage && series.status === "active" && (
              <RepairSeriesButton gymId={gym.id} seriesId={series.series_id} />
            )}
          </>
        )}
      </ReadState>
    </section>
  );
}

/** The gym's class templates (active or archived) with their defaults. */
export function TemplatesTab({
  gym,
  can,
  venues,
  instructors,
}: {
  gym: Gym;
  can: TimetableCapabilities;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
}) {
  const t = useTranslations("gymConsole.timetable.templates");
  const [view, setView] = useState<GymClassTemplateView>("active");
  const list = useGymClassTemplates(gym.id, view);
  useGoneGym(gym.id, list.error);
  const rows = list.data?.templates ?? [];
  const venueName = (id: string | null) => venues.find((venue) => venue.venue_id === id)?.name;

  return (
    <Panel
      id="timetable-templates-heading"
      title={t("heading")}
      lead={t("lead")}
      marker={{ "data-template-list": view }}
      views={
        <Segmented
          label={t("views")}
          marker="templates"
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: t("active") },
            { value: "archived", label: t("archived") },
          ]}
        />
      }
      action={
        can.canManage ? (
          <TemplateDialog
            gymId={gym.id}
            venues={venues}
            instructors={instructors}
            trigger={
              <Button size="sm" data-template-create>
                <PlusIcon aria-hidden />
                {t("create")}
              </Button>
            }
          />
        ) : null
      }
    >
      <ReadState
        error={list.error}
        loading={list.isPending}
        ready={list.data !== undefined}
        label={t("loading")}
        onRetry={() => void list.refetch()}
      >
        {rows.length === 0 ? (
          <p className="px-1 py-6 type-body-sm text-muted-foreground" data-templates-empty>
            {t(`empty.${view}`)}
          </p>
        ) : (
          <ul className="flex flex-col">
            {rows.map((template) => (
              <Row
                key={template.template_id}
                marker={{ "data-template": template.template_id }}
                title={template.title}
                lines={[
                  [
                    t("minutes", { count: template.default_duration_minutes }),
                    t("max", { count: template.default_capacity }),
                    venueName(template.default_venue_id) ?? null,
                    template.default_instructor?.name ?? null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  ...(template.description ? [template.description] : []),
                ]}
                badge={
                  template.status === "archived" ? (
                    <Badge variant="neutral">{t("archivedBadge")}</Badge>
                  ) : null
                }
                actions={
                  can.canManage && template.status === "active" ? (
                    <>
                      <TemplateDialog
                        gymId={gym.id}
                        template={template}
                        venues={venues}
                        instructors={instructors}
                        trigger={
                          <Button
                            size="sm"
                            variant="quiet"
                            data-template-edit={template.template_id}
                          >
                            {t("edit")}
                          </Button>
                        }
                      />
                      <ArchiveTemplateDialog
                        gymId={gym.id}
                        template={template}
                        trigger={
                          <Button
                            size="sm"
                            variant="ghost"
                            data-template-archive={template.template_id}
                          >
                            {t("archive")}
                          </Button>
                        }
                      />
                    </>
                  ) : null
                }
              />
            ))}
          </ul>
        )}
        {list.data && !list.data.complete && <Incomplete />}
      </ReadState>
      <p className="type-caption text-faint-foreground">{t("note")}</p>
    </Panel>
  );
}

/** The gym's venues (active or inactive): location, zone and capacity. */
export function VenuesTab({ gym, can }: { gym: Gym; can: TimetableCapabilities }) {
  const t = useTranslations("gymConsole.timetable.venues");
  const [view, setView] = useState<GymVenueView>("active");
  const list = useGymVenues(gym.id, view);
  useGoneGym(gym.id, list.error);
  const rows = list.data?.venues ?? [];
  const location = (id: string) => gym.locations.find((item) => item.id === id);
  const zoneHint = rows[0]?.time_zone;

  return (
    <Panel
      id="timetable-venues-heading"
      title={t("heading")}
      lead={t("lead")}
      marker={{ "data-venue-list": view }}
      views={
        <Segmented
          label={t("views")}
          marker="venues"
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: t("active") },
            { value: "inactive", label: t("inactive") },
          ]}
        />
      }
      action={
        can.canManage ? (
          <VenueDialog
            gym={gym}
            zoneHint={zoneHint}
            trigger={
              <Button size="sm" data-venue-create>
                <PlusIcon aria-hidden />
                {t("create")}
              </Button>
            }
          />
        ) : null
      }
    >
      <ReadState
        error={list.error}
        loading={list.isPending}
        ready={list.data !== undefined}
        label={t("loading")}
        onRetry={() => void list.refetch()}
      >
        {rows.length === 0 ? (
          <p className="px-1 py-6 type-body-sm text-muted-foreground" data-venues-empty>
            {view === "active" && !can.canManage ? t("empty.readonly") : t(`empty.${view}`)}
          </p>
        ) : (
          <ul className="flex flex-col">
            {rows.map((venue) => {
              const place = location(venue.gym_location_id);
              return (
                <Row
                  key={venue.venue_id}
                  marker={{ "data-venue": venue.venue_id }}
                  title={venue.name}
                  lines={[
                    [
                      place ? `${place.name} · ${place.city}` : t("locationUnavailable"),
                      venue.time_zone,
                      venue.capacity === null ? t("noLimit") : t("max", { count: venue.capacity }),
                    ].join(" · "),
                    ...(venue.description ? [venue.description] : []),
                  ]}
                  badge={
                    venue.status === "inactive" ? (
                      <Badge variant="neutral">{t("inactiveBadge")}</Badge>
                    ) : null
                  }
                  actions={
                    can.canManage && venue.status === "active" ? (
                      <>
                        <VenueDialog
                          gym={gym}
                          venue={venue}
                          trigger={
                            <Button size="sm" variant="quiet" data-venue-edit={venue.venue_id}>
                              {t("edit")}
                            </Button>
                          }
                        />
                        <DeactivateVenueDialog
                          gymId={gym.id}
                          venue={venue}
                          trigger={
                            <Button
                              size="sm"
                              variant="ghost"
                              data-venue-deactivate={venue.venue_id}
                            >
                              {t("deactivate")}
                            </Button>
                          }
                        />
                      </>
                    ) : null
                  }
                />
              );
            })}
          </ul>
        )}
        {list.data && !list.data.complete && <Incomplete />}
      </ReadState>
      <p className="type-caption text-faint-foreground">{t("note")}</p>
    </Panel>
  );
}
