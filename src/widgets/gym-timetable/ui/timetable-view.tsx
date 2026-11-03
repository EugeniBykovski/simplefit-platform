"use client";

import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";

import type { Gym } from "@/entities/gym";
import { rosterCapabilities } from "@/entities/gym-booking";
import {
  addDays,
  datesFrom,
  firstDayOfWeek,
  isWallDate,
  layoutDay,
  printable,
  useGymClassOccurrences,
  wallClock,
  wallDate,
  wallMinutes,
  weekStart,
  windowFor,
  type GymClassOccurrence,
  type GymClassTemplate,
  type GymInstructor,
  type GymVenue,
  type TimetableCapabilities,
} from "@/entities/gym-timetable";
import {
  ClassDialog,
  TemplateDialog,
  VenueDialog,
  type CreatedClass,
} from "@/features/gym-timetable-manage";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";

import { OccurrenceDetails } from "./occurrence-details";
import { ReadState, Segmented, useGoneGym } from "./shared";

export type TimetableView = "week" | "day" | "list";

/** Everything the timetable shows, lifted so a new class can bring the user to it. */
export type TimetableState = {
  anchor: string;
  view: TimetableView;
  venueId: string;
  instructorId: string;
  includeCancelled: boolean;
  selectedId: string | null;
};

const ALL = "all";
/** Height of one hour in the week grid (px). */
const HOUR = 52;

/**
 * The timetable (WG5, reconciled): the gym's classes as the backend lists
 * them for the dates on screen, never one built on the client. A week (or a
 * day, or the same week as a list) is read as one window, every page of it;
 * until the last page arrives the timetable says it is loading rather than
 * showing part of it as the whole. Each class sits on its own wall date at
 * its own wall time, in its venue's zone (the same for every viewer,
 * whatever their device's zone). Filters are the backend's (venue,
 * instructor, cancelled classes).
 */
export function TimetableTab({
  gym,
  can,
  state,
  onState,
  venues,
  templates,
  instructors,
  catalogReady,
  onCreated,
  onSeries,
  onTab,
}: {
  gym: Gym;
  can: TimetableCapabilities;
  state: TimetableState;
  onState: (next: Partial<TimetableState>) => void;
  venues: readonly GymVenue[];
  templates: readonly GymClassTemplate[];
  instructors: readonly GymInstructor[];
  catalogReady: boolean;
  onCreated: (created: CreatedClass) => void;
  onSeries: (seriesId: string) => void;
  onTab: (tab: "venues" | "templates") => void;
}) {
  const t = useTranslations("gymConsole.timetable");
  const locale = useLocale();
  const format = useFormatter();
  const firstDay = firstDayOfWeek(locale);
  const start = state.view === "day" ? state.anchor : weekStart(state.anchor, firstDay);
  const dates = state.view === "day" ? [state.anchor] : datesFrom(start, 7);
  const first = dates[0] ?? state.anchor;
  const last = dates.at(-1) ?? state.anchor;
  const bounds = windowFor(first, last);
  const read = useGymClassOccurrences(gym.id, {
    ...bounds,
    venueId: state.venueId === ALL ? undefined : state.venueId,
    instructorId: state.instructorId === ALL ? undefined : state.instructorId,
    includeCancelled: state.includeCancelled,
  });
  useGoneGym(gym.id, read.query.error);

  const shown = new Set(dates);
  const byDate = useMemo(() => {
    const map = new Map<string, GymClassOccurrence[]>();
    for (const occurrence of read.occurrences) {
      const date = wallDate(occurrence.local_starts_at);
      if (!shown.has(date)) continue;
      map.set(date, [...(map.get(date) ?? []), occurrence]);
    }
    return map;
    // `shown` is derived from `dates`, keyed by its first and last date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read.occurrences, first, last]);
  const visible = [...byDate.values()].flat();
  const selected = visible.find((item) => item.occurrence_id === state.selectedId) ?? null;
  const today = todayIn(venues[0]?.time_zone);

  const details = useRef<HTMLHeadingElement>(null);
  const select = (id: string) => {
    onState({ selectedId: id });
    // Below the two-column layout the details follow the timetable: move there.
    if (matches("(max-width: 1279px)")) {
      requestAnimationFrame(() => {
        details.current?.focus();
        details.current?.scrollIntoView({
          block: "start",
          behavior: reducedMotion() ? "auto" : "smooth",
        });
      });
    }
  };

  const step = state.view === "day" ? 1 : 7;
  const range =
    state.view === "day"
      ? format.dateTime(printable(first), {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : format.dateTimeRange(printable(first), printable(last), {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  const zones = [...new Set(venues.map((venue) => venue.time_zone))];

  const empty = read.complete && visible.length === 0;

  return (
    <div className="grid content-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section
        aria-labelledby="timetable-range"
        data-timetable={state.view}
        data-timetable-from={first}
        data-timetable-to={last}
        data-timetable-complete={read.complete}
        className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-4 py-4 sm:px-5"
      >
        <Toolbar
          state={state}
          onState={onState}
          range={range}
          step={step}
          today={today}
          venues={venues}
          instructors={instructors}
        />
        <p className="type-caption text-faint-foreground" data-timetable-zones>
          {zones.length === 0
            ? t("zones.none")
            : zones.length === 1
              ? t("zones.one", { zone: zones[0] ?? "" })
              : t("zones.many", { zones: format.list(zones) })}
        </p>
        <ReadState
          error={read.query.isError ? read.query.error : null}
          loading={read.query.isPending}
          ready={read.complete}
          label={t("loading")}
          onRetry={() => void read.query.refetch()}
        >
          {empty ? (
            <Empty
              gym={gym}
              can={can}
              venues={venues}
              templates={templates}
              instructors={instructors}
              catalogReady={catalogReady}
              anchor={state.anchor}
              filtered={state.venueId !== ALL || state.instructorId !== ALL}
              onCreated={onCreated}
              onTab={onTab}
            />
          ) : state.view === "list" ? (
            <ListView
              dates={dates}
              byDate={byDate}
              selectedId={state.selectedId}
              onSelect={select}
              today={today}
            />
          ) : state.view === "day" ? (
            <DayAgenda
              date={first}
              items={byDate.get(first) ?? []}
              selectedId={state.selectedId}
              onSelect={select}
            />
          ) : (
            <>
              <WeekGrid
                dates={dates}
                byDate={byDate}
                selectedId={state.selectedId}
                onSelect={select}
                onDay={(date) => onState({ anchor: date, view: "day" })}
                today={today}
              />
              {/* Below md the week is a day strip and that day's classes: no tiny grid. */}
              <div className="flex flex-col gap-3 md:hidden">
                <DayStrip
                  dates={dates}
                  current={state.anchor}
                  today={today}
                  counts={byDate}
                  onPick={(date) => onState({ anchor: date })}
                />
                <DayAgenda
                  date={shown.has(state.anchor) ? state.anchor : first}
                  items={byDate.get(shown.has(state.anchor) ? state.anchor : first) ?? []}
                  selectedId={state.selectedId}
                  onSelect={select}
                />
              </div>
            </>
          )}
        </ReadState>
      </section>
      <div className="flex min-w-0 flex-col gap-4">
        {selected ? (
          <OccurrenceDetails
            gymId={gym.id}
            occurrence={selected}
            can={can}
            roster={rosterCapabilities(gym.viewer)}
            venues={venues}
            instructors={instructors}
            onSeries={onSeries}
            headingRef={details}
          />
        ) : (
          <section
            aria-labelledby="timetable-hint-heading"
            className="flex flex-col gap-1.5 rounded-3xl border border-dashed bg-surface px-5 py-4.5"
          >
            <h2 id="timetable-hint-heading" className="type-label text-faint-foreground">
              {t("hint.heading")}
            </h2>
            <p className="type-caption text-muted-foreground">{t("hint.body")}</p>
            <p className="type-caption text-faint-foreground">{t("hint.capacity")}</p>
          </section>
        )}
      </div>
    </div>
  );
}

function matches(query: string) {
  return typeof window !== "undefined" && window.matchMedia?.(query).matches === true;
}
const reducedMotion = () => matches("(prefers-reduced-motion: reduce)");

/** Today's wall date where the gym's venues are (or the browser's, before any venue). */
function todayIn(zone: string | undefined): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

function Toolbar({
  state,
  onState,
  range,
  step,
  today,
  venues,
  instructors,
}: {
  state: TimetableState;
  onState: (next: Partial<TimetableState>) => void;
  range: string;
  step: number;
  today: string;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
}) {
  const t = useTranslations("gymConsole.timetable.toolbar");
  const ids = { date: useId(), venue: useId(), instructor: useId(), cancelled: useId() };
  const unit = state.view === "day" ? "day" : "week";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={t(`previous.${unit}`)}
            onClick={() => onState({ anchor: addDays(state.anchor, -step), selectedId: null })}
            data-timetable-previous
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => onState({ anchor: today, selectedId: null })}
            data-timetable-today
          >
            {t("today")}
          </Button>
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={t(`next.${unit}`)}
            onClick={() => onState({ anchor: addDays(state.anchor, step), selectedId: null })}
            data-timetable-next
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
        <h2
          id="timetable-range"
          aria-live="polite"
          className="order-first min-w-0 basis-full type-body font-extrabold sm:order-none sm:flex-1 sm:basis-auto"
          data-timetable-range
        >
          {range}
        </h2>
        <Segmented
          label={t("view")}
          marker="view"
          value={state.view}
          onChange={(view) => onState({ view })}
          options={[
            { value: "week", label: t("views.week") },
            { value: "day", label: t("views.day") },
            { value: "list", label: t("views.list") },
          ]}
        />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.date} className="type-caption font-bold text-muted-foreground">
            {t("goTo")}
          </Label>
          <Input
            id={ids.date}
            type="date"
            value={state.anchor}
            onChange={(event) => {
              if (isWallDate(event.target.value))
                onState({ anchor: event.target.value, selectedId: null });
            }}
            className="h-10"
            data-timetable-date
          />
        </div>
        <FilterSelect
          id={ids.venue}
          label={t("venue")}
          value={state.venueId}
          onChange={(venueId) => onState({ venueId, selectedId: null })}
          all={t("allVenues")}
          options={venues.map((venue) => ({ value: venue.venue_id, label: venue.name }))}
          marker="venue"
        />
        <FilterSelect
          id={ids.instructor}
          label={t("instructor")}
          value={state.instructorId}
          onChange={(instructorId) => onState({ instructorId, selectedId: null })}
          all={t("allInstructors")}
          options={instructors.map((person) => ({
            value: person.staffMembershipId,
            label: person.name ?? t("unnamed"),
          }))}
          marker="instructor"
        />
        <div className="flex h-10 items-center gap-2.5">
          <Switch
            id={ids.cancelled}
            checked={state.includeCancelled}
            onCheckedChange={(includeCancelled) => onState({ includeCancelled })}
            data-timetable-cancelled
          />
          <Label htmlFor={ids.cancelled} className="type-body-sm font-bold">
            {t("showCancelled")}
          </Label>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  all,
  options,
  marker,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  all: string;
  options: readonly { value: string; label: string }[];
  marker: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="type-caption font-bold text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" data-timetable-filter={marker}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{all}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The accessible name of a class: everything the card shows, in words. */
function useClassLabel() {
  const t = useTranslations("gymConsole.timetable.card");
  return (occurrence: GymClassOccurrence) =>
    t("label", {
      title: occurrence.title,
      from: wallClock(occurrence.local_starts_at),
      to: wallClock(occurrence.local_ends_at),
      venue: occurrence.venue.name,
      instructor:
        occurrence.instructor === null
          ? occurrence.needs_instructor
            ? t("instructorNeeded")
            : t("noInstructor")
          : (occurrence.instructor.name ?? t("unnamed")),
      capacity: occurrence.capacity,
      status: occurrence.status === "cancelled" ? `, ${t("cancelled")}` : "",
    });
}

function useDayName() {
  const format = useFormatter();
  return (date: string, width: "short" | "long" = "short") =>
    width === "short"
      ? format.dateTime(printable(date), { weekday: "short", day: "numeric", timeZone: "UTC" })
      : format.dateTime(printable(date), {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        });
}

/** The visible hours: the classes' own span, at least 07:00–22:00 when there are few. */
function hourRange(items: readonly GymClassOccurrence[]): [number, number] {
  let from = 7;
  let to = 22;
  for (const item of items) {
    const start = wallMinutes(item.local_starts_at);
    const sameDay = wallDate(item.local_ends_at) === wallDate(item.local_starts_at);
    const end = sameDay ? wallMinutes(item.local_ends_at) : 24 * 60;
    from = Math.min(from, Math.floor(start / 60));
    to = Math.max(to, Math.ceil(end / 60));
  }
  return [from, Math.min(24, to)];
}

function WeekGrid({
  dates,
  byDate,
  selectedId,
  onSelect,
  onDay,
  today,
}: {
  dates: readonly string[];
  byDate: Map<string, GymClassOccurrence[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDay: (date: string) => void;
  today: string;
}) {
  const t = useTranslations("gymConsole.timetable");
  const dayName = useDayName();
  const label = useClassLabel();
  const [from, to] = hourRange([...byDate.values()].flat());
  const hours = Array.from({ length: to - from }, (_, index) => from + index);
  const height = (to - from) * HOUR;
  // The grid opens at the day's first class, not at 07:00 with the evening out of view.
  const scroller = useRef<HTMLDivElement>(null);
  const items = [...byDate.values()].flat();
  const earliest =
    items.length === 0 ? null : Math.min(...items.map((item) => wallMinutes(item.local_starts_at)));
  useEffect(() => {
    if (scroller.current && earliest !== null)
      scroller.current.scrollTop = Math.max(0, ((earliest - from * 60) / 60) * HOUR - HOUR / 2);
  }, [earliest, from]);

  return (
    <div className="hidden flex-col gap-1.5 md:flex" data-week-grid>
      <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-1.5">
        <span aria-hidden />
        {dates.map((date) => (
          <button
            key={date}
            type="button"
            onClick={() => onDay(date)}
            aria-current={date === today ? "date" : undefined}
            aria-label={t("grid.openDay", { day: dayName(date, "long") })}
            className={cn(
              "flex h-8 items-center justify-center rounded-sm type-caption font-extrabold uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              date === today
                ? "bg-highlight text-highlight-foreground"
                : "bg-surface-elevated text-muted-foreground hover:text-foreground",
            )}
            data-day-header={date}
          >
            {dayName(date)}
          </button>
        ))}
      </div>
      <div ref={scroller} className="max-h-[640px] overflow-y-auto rounded-2xl">
        <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-1.5" style={{ height }}>
          <div aria-hidden className="relative">
            {hours.map((hour, index) => (
              <span
                key={hour}
                className={cn(
                  "absolute right-1 type-micro font-mono text-faint-foreground",
                  // Each label sits on its hour line; the first one below it, inside the grid.
                  index > 0 && "-translate-y-1/2",
                )}
                style={{ top: index * HOUR }}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {dates.map((date) => {
            const items = byDate.get(date) ?? [];
            const placed = layoutDay(items, (item) => ({
              start: wallMinutes(item.local_starts_at),
              end:
                wallDate(item.local_ends_at) === date ? wallMinutes(item.local_ends_at) : 24 * 60,
            }));
            const headingId = `timetable-day-${date}`;
            return (
              <section
                key={date}
                aria-labelledby={headingId}
                className="relative rounded-md-lg bg-background/40"
                style={{
                  backgroundImage: `repeating-linear-gradient(180deg, transparent 0, transparent ${HOUR - 1}px, var(--border) ${HOUR - 1}px, var(--border) ${HOUR}px)`,
                }}
                data-day={date}
              >
                <h3 id={headingId} className="sr-only">
                  {dayName(date, "long")}
                </h3>
                {items.length === 0 ? (
                  <p className="sr-only">{t("grid.noClasses")}</p>
                ) : (
                  <ol>
                    {placed.map(({ item, start, end, lane, lanes }) => (
                      <li
                        key={item.occurrence_id}
                        className="absolute px-0.5"
                        style={{
                          top: ((start - from * 60) / 60) * HOUR,
                          height: Math.max(((end - start) / 60) * HOUR - 3, 24),
                          left: `${(lane / lanes) * 100}%`,
                          width: `${100 / lanes}%`,
                        }}
                      >
                        <ClassChip
                          occurrence={item}
                          selected={item.occurrence_id === selectedId}
                          label={label(item)}
                          onSelect={onSelect}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ClassChip({
  occurrence,
  selected,
  label,
  onSelect,
}: {
  occurrence: GymClassOccurrence;
  selected: boolean;
  label: string;
  onSelect: (id: string) => void;
}) {
  const cancelled = occurrence.status === "cancelled";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(occurrence.occurrence_id)}
      data-occurrence={occurrence.occurrence_id}
      data-occurrence-status={occurrence.status}
      data-local-start={occurrence.local_starts_at}
      className={cn(
        "flex size-full flex-col gap-px overflow-hidden rounded-sm px-2 py-1.5 text-left type-micro outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
        selected
          ? "bg-highlight text-highlight-foreground"
          : cancelled
            ? "border border-dashed border-border bg-surface text-faint-foreground line-through"
            : occurrence.needs_instructor || occurrence.instructor === null
              ? "border border-warning-border bg-warning-subtle text-warning-subtle-foreground"
              : "bg-accent text-accent-foreground hover:brightness-110",
      )}
    >
      <b className="line-clamp-2 font-extrabold break-words">{occurrence.title}</b>
      <span aria-hidden className="truncate font-mono">
        {wallClock(occurrence.local_starts_at)}–{wallClock(occurrence.local_ends_at)}
      </span>
      <span aria-hidden className="truncate">
        {occurrence.venue.name}
      </span>
    </button>
  );
}

function DayStrip({
  dates,
  current,
  today,
  counts,
  onPick,
}: {
  dates: readonly string[];
  current: string;
  today: string;
  counts: Map<string, GymClassOccurrence[]>;
  onPick: (date: string) => void;
}) {
  const t = useTranslations("gymConsole.timetable.grid");
  const dayName = useDayName();
  return (
    <div role="group" aria-label={t("days")} className="grid grid-cols-7 gap-1" data-day-strip>
      {dates.map((date) => (
        <button
          key={date}
          type="button"
          aria-pressed={date === current}
          aria-current={date === today ? "date" : undefined}
          aria-label={t("dayWithCount", {
            day: dayName(date, "long"),
            count: counts.get(date)?.length ?? 0,
          })}
          onClick={() => onPick(date)}
          className={cn(
            "flex min-h-11 flex-col items-center justify-center rounded-xl type-caption font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            date === current
              ? "bg-foreground text-background"
              : date === today
                ? "bg-highlight/20 text-foreground"
                : "bg-surface-elevated text-muted-foreground",
          )}
        >
          <span aria-hidden>{dayName(date)}</span>
          {(counts.get(date)?.length ?? 0) > 0 && (
            <span aria-hidden className="mt-0.5 size-1.5 rounded-full bg-highlight" />
          )}
        </button>
      ))}
    </div>
  );
}

/** One day's classes as cards, in the order they start (the backend's instants). */
function DayAgenda({
  date,
  items,
  selectedId,
  onSelect,
}: {
  date: string;
  items: readonly GymClassOccurrence[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("gymConsole.timetable");
  const dayName = useDayName();
  return (
    <section aria-labelledby={`timetable-agenda-${date}`} data-day-agenda={date}>
      <h3 id={`timetable-agenda-${date}`} className="mb-2 type-label text-faint-foreground">
        {dayName(date, "long")}
      </h3>
      {items.length === 0 ? (
        <p className="px-1 py-4 type-body-sm text-muted-foreground" data-day-empty>
          {t("grid.noClassesDay")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.occurrence_id}>
              <ClassCard
                occurrence={item}
                selected={item.occurrence_id === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClassCard({
  occurrence,
  selected,
  onSelect,
}: {
  occurrence: GymClassOccurrence;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("gymConsole.timetable.card");
  const label = useClassLabel();
  const cancelled = occurrence.status === "cancelled";
  const unstaffed = occurrence.instructor === null;
  return (
    <button
      type="button"
      aria-label={label(occurrence)}
      aria-pressed={selected}
      onClick={() => onSelect(occurrence.occurrence_id)}
      data-occurrence={occurrence.occurrence_id}
      data-occurrence-status={occurrence.status}
      data-local-start={occurrence.local_starts_at}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-accent-border bg-accent" : "bg-surface-elevated hover:bg-muted",
        cancelled && "opacity-70",
      )}
    >
      <span
        aria-hidden
        className={cn("w-14 flex-none type-metric-sm", cancelled && "line-through")}
      >
        {wallClock(occurrence.local_starts_at)}
      </span>
      <span aria-hidden className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <b className={cn("truncate type-body-sm font-extrabold", cancelled && "line-through")}>
            {occurrence.title}
          </b>
          {cancelled ? (
            <span className="rounded-sm bg-destructive-subtle px-2 py-0.5 type-badge text-destructive-subtle-foreground">
              {t("cancelled")}
            </span>
          ) : unstaffed ? (
            <span className="flex items-center gap-1 rounded-sm bg-warning-subtle px-2 py-0.5 type-badge text-warning-subtle-foreground">
              <TriangleAlertIcon className="size-3" />
              {occurrence.needs_instructor ? t("instructorNeeded") : t("noInstructor")}
            </span>
          ) : null}
        </span>
        <span className="truncate type-caption text-muted-foreground">
          {[
            occurrence.instructor?.name ?? null,
            occurrence.venue.name,
            t("minutes", { count: occurrence.duration_minutes }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="type-caption font-mono text-muted-foreground">
          {t("max", { count: occurrence.capacity })}
        </span>
      </span>
    </button>
  );
}

function ListView({
  dates,
  byDate,
  selectedId,
  onSelect,
  today,
}: {
  dates: readonly string[];
  byDate: Map<string, GymClassOccurrence[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  today: string;
}) {
  const t = useTranslations("gymConsole.timetable");
  const dayName = useDayName();
  return (
    <div className="flex flex-col gap-4" data-list-view>
      {dates.map((date) => {
        const items = byDate.get(date) ?? [];
        return (
          <section key={date} aria-labelledby={`timetable-list-${date}`} data-list-day={date}>
            <h3
              id={`timetable-list-${date}`}
              className={cn(
                "mb-2 flex items-center gap-2 type-label",
                date === today ? "text-highlight" : "text-faint-foreground",
              )}
            >
              {dayName(date, "long")}
              {date === today && <span className="type-badge">{t("list.today")}</span>}
            </h3>
            {items.length === 0 ? (
              <p className="px-1 type-caption text-faint-foreground">{t("grid.noClassesDay")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.occurrence_id}>
                    <ClassCard
                      occurrence={item}
                      selected={item.occurrence_id === selectedId}
                      onSelect={onSelect}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Nothing on these dates: what is missing before a class can exist (a
 * venue, then a template), offered only to who may add it; otherwise that
 * the dates are free. Never a sample class.
 */
function Empty({
  gym,
  can,
  venues,
  templates,
  instructors,
  catalogReady,
  anchor,
  filtered,
  onCreated,
  onTab,
}: {
  gym: Gym;
  can: TimetableCapabilities;
  venues: readonly GymVenue[];
  templates: readonly GymClassTemplate[];
  instructors: readonly GymInstructor[];
  catalogReady: boolean;
  anchor: string;
  filtered: boolean;
  onCreated: (created: CreatedClass) => void;
  onTab: (tab: "venues" | "templates") => void;
}) {
  const t = useTranslations("gymConsole.timetable.empty");
  let key: "venue" | "template" | "filtered" | "free" = "free";
  let action: ReactNode = null;
  if (catalogReady && venues.length === 0) {
    key = "venue";
    action = can.canManage ? (
      <VenueDialog
        gym={gym}
        trigger={
          <Button data-empty-add-venue>
            <PlusIcon aria-hidden />
            {t("addVenue")}
          </Button>
        }
      />
    ) : null;
  } else if (catalogReady && templates.length === 0) {
    key = "template";
    action = can.canManage ? (
      <TemplateDialog
        gymId={gym.id}
        venues={venues}
        instructors={instructors}
        trigger={
          <Button data-empty-add-template>
            <PlusIcon aria-hidden />
            {t("addTemplate")}
          </Button>
        }
      />
    ) : null;
  } else if (filtered) {
    key = "filtered";
  } else if (can.canManage) {
    action = (
      <ClassDialog
        gymId={gym.id}
        venues={venues}
        templates={templates}
        instructors={instructors}
        initialDate={anchor}
        onCreated={onCreated}
        trigger={
          <Button data-empty-add-class>
            <PlusIcon aria-hidden />
            {t("addClass")}
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col items-start gap-2.5 px-2 py-8" data-timetable-empty={key}>
      <p className="type-title font-display">{t(`${key}.title`)}</p>
      <p className="max-w-130 type-body-sm text-muted-foreground">
        {can.canManage || key === "free" || key === "filtered"
          ? t(`${key}.body`)
          : t(`${key}.readonly`)}
      </p>
      {action}
      {(key === "venue" || key === "template") && (
        <Button
          variant="link"
          size="sm"
          onClick={() => onTab(key === "venue" ? "venues" : "templates")}
        >
          {t(key === "venue" ? "toVenues" : "toTemplates")}
        </Button>
      )}
    </div>
  );
}
