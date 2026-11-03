"use client";

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import {
  membershipOf,
  useMemberClasses,
  useMyGymMemberships,
  type GymMemberClass,
  type GymMembership,
} from "@/entities/gym-booking";
import {
  addDays,
  datesFrom,
  printable,
  wallClock,
  wallDate,
  windowFor,
} from "@/entities/gym-timetable";
import {
  BookingProblemNotice,
  bookingProblem,
  readProblem,
  useBookClass,
} from "@/features/gym-class-booking";
import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

import { CancelBookingDialog, MemberHeader, MemberState } from "./shared";

/** The viewer's own calendar date (`YYYY-MM-DD`), the first day offered. */
const today = () =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

/** The clock, read now and every half minute: a class that starts meanwhile stops being offered. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The classes of one gym for its member (`web.app.me.gyms._gym-id.classes`;
 * F13 BookClass in an interim web composition, D-WEB-GYM-MEMBER-BOOKING).
 * Which membership applies is the viewer's own list (SF-95): only an active
 * one shows classes; a pending request, an ended membership or none at all
 * is said as such, and the gym id in the URL reveals nothing beyond what
 * that list already holds.
 */
export function MemberClasses({ gymId }: { gymId: string }) {
  const t = useTranslations("gymBooking.member.classes");
  const list = useMyGymMemberships();
  const membership = list.complete ? membershipOf(list.memberships, gymId) : undefined;
  const gymName = membership?.gym.name ?? null;

  return (
    <>
      <MemberHeader eyebrow={gymName ?? t("eyebrow")} title={t("title")} />
      <PageBody inset="site" className="flex flex-col gap-4">
        {list.query.isError ? (
          <div className="flex flex-col gap-2">
            <BookingProblemNotice problem={readProblem(list.query.error)} />
            <Button variant="quiet" className="w-fit" onClick={() => void list.query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : membership === undefined ? (
          <LoadingList label={t("loading")} />
        ) : membership === null ? (
          <MemberState
            marker="not-member"
            title={t("notMember.title")}
            body={t("notMember.body")}
            action={<BackToGyms />}
          />
        ) : membership.status === "requested" ? (
          <MemberState
            marker="requested"
            title={t("requested.title")}
            body={t("requested.body", { gym: gymName ?? t("thisGym") })}
            action={<BackToGyms />}
          />
        ) : membership.status !== "active" ? (
          <MemberState
            marker="ended"
            title={t("ended.title")}
            body={t("ended.body", { gym: gymName ?? t("thisGym") })}
            action={<BackToGyms />}
          />
        ) : (
          <ClassesView key={membership.gym_member_id} membership={membership} />
        )}
      </PageBody>
    </>
  );
}

function BackToGyms() {
  const t = useTranslations("gymBooking.member.classes");
  return (
    <Button asChild variant="quiet">
      <Link href={routeHref("web.app.me.gyms")}>{t("backToGyms")}</Link>
    </Button>
  );
}

function LoadingList({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" data-member-loading>
      <span className="sr-only" role="status">
        {label}
      </span>
      <Skeleton className="h-16 rounded-3xl" />
      <Skeleton className="h-16 rounded-3xl" />
      <Skeleton className="h-16 rounded-3xl" />
    </div>
  );
}

/**
 * A week of the gym's classes from the backend: seven days from today (or a
 * later week), read as one window with every page. Each class sits on its
 * own wall date and time in its venue's zone. Places left and the member's
 * own booking are the backend's; nothing is counted or reserved here.
 */
function ClassesView({ membership }: { membership: GymMembership }) {
  const t = useTranslations("gymBooking.member.classes");
  const format = useFormatter();
  const first = today();
  const [start, setStart] = useState(first);
  const dates = useMemo(() => datesFrom(start, 7), [start]);
  const [day, setDay] = useState(start);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const window = useMemo(() => windowFor(dates[0] ?? start, dates[6] ?? start), [dates, start]);
  const classes = useMemberClasses(membership.gym_member_id, window);
  const now = useNow();

  const ofDay = classes.classes.filter((item) => wallDate(item.local_starts_at) === day);
  const selected = classes.classes.find((item) => item.occurrence_id === selectedId) ?? null;
  const zone = classes.classes[0]?.time_zone ?? null;
  const notActive = classes.query.isError && readProblem(classes.query.error).kind === "membership";

  const moveWeek = (days: number) => {
    const next = addDays(start, days);
    setStart(next);
    setDay(next);
    setSelectedId(null);
  };

  if (notActive) {
    return (
      <MemberState
        marker="ended"
        title={t("ended.title")}
        body={t("ended.body", { gym: membership.gym.name ?? t("thisGym") })}
        action={<BackToGyms />}
      />
    );
  }

  return (
    <div className="grid content-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section aria-labelledby="member-classes-heading" className="flex min-w-0 flex-col gap-3">
        <h2 id="member-classes-heading" className="sr-only">
          {t("listHeading")}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="quiet"
            aria-label={t("previousWeek")}
            disabled={start <= first}
            onClick={() => moveWeek(-7)}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <div
            role="tablist"
            aria-label={t("days")}
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1"
          >
            {dates.map((date) => (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={date === day}
                onClick={() => {
                  setDay(date);
                  setSelectedId(null);
                }}
                className={cn(
                  "flex h-10 flex-none items-center rounded-full border px-3.5 type-caption font-bold whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  date === day && "border-foreground bg-foreground text-background",
                )}
                data-member-day={date}
              >
                {date === first
                  ? t("today")
                  : format.dateTime(printable(date), {
                      weekday: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
              </button>
            ))}
          </div>
          <Button
            size="icon"
            variant="quiet"
            aria-label={t("nextWeek")}
            onClick={() => moveWeek(7)}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
        {zone !== null && (
          <p className="type-caption text-faint-foreground" data-member-zone>
            {t("zone", { zone })}
          </p>
        )}
        {classes.query.isError ? (
          <div className="flex flex-col gap-2">
            <BookingProblemNotice problem={readProblem(classes.query.error)} />
            <Button variant="quiet" className="w-fit" onClick={() => void classes.query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : !classes.complete ? (
          <LoadingList label={t("loading")} />
        ) : ofDay.length === 0 ? (
          <p
            className="rounded-3xl border border-dashed px-4 py-8 text-center type-body-sm text-muted-foreground"
            data-member-empty-day={day}
          >
            {t("emptyDay")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-member-classes={day}>
            {ofDay.map((item) => (
              <li key={item.occurrence_id}>
                <ClassRow
                  item={item}
                  now={now}
                  selected={item.occurrence_id === selectedId}
                  onSelect={() => setSelectedId(item.occurrence_id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex min-w-0 flex-col gap-4">
        {selected ? (
          <ClassDetails
            key={selected.occurrence_id}
            item={selected}
            now={now}
            gymMemberId={membership.gym_member_id}
          />
        ) : (
          <section className="rounded-3xl border border-dashed px-5 py-6" data-member-hint>
            <p className="type-body-sm text-muted-foreground">{t("hint")}</p>
          </section>
        )}
        <p className="type-caption text-faint-foreground">{t("note")}</p>
      </div>
    </div>
  );
}

type ClassState = "booked" | "checkedIn" | "cancelled" | "started" | "full" | "open";

/** What the member can see about a class, from the backend's facts (and the clock for "started"). */
function classState(item: GymMemberClass, now: number): ClassState {
  if (item.booking?.status === "confirmed")
    return item.booking.checked_in_at !== null ? "checkedIn" : "booked";
  if (item.status === "cancelled") return "cancelled";
  if (new Date(item.starts_at).getTime() <= now) return "started";
  if (item.remaining_capacity <= 0) return "full";
  return "open";
}

function placesText(
  t: ReturnType<typeof useTranslations<"gymBooking.member.classes">>,
  item: GymMemberClass,
) {
  if (item.status === "cancelled") return t("places.cancelled");
  if (item.remaining_capacity <= 0) return t("places.full", { capacity: item.capacity });
  return t("places.left", { left: item.remaining_capacity, capacity: item.capacity });
}

function ClassRow({
  item,
  now,
  selected,
  onSelect,
}: {
  item: GymMemberClass;
  now: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("gymBooking.member.classes");
  const state = classState(item, now);
  const who = item.instructor?.name ?? null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-3xl border bg-surface px-4 py-3 text-left outline-none hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-surface-elevated",
      )}
      data-member-class={item.occurrence_id}
      data-class-state={state}
    >
      <span className="w-14 flex-none type-title font-display">
        {wallClock(item.local_starts_at)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body-sm font-extrabold break-words">{item.title}</span>
        <span className="type-caption text-muted-foreground">
          {[who, item.venue.name, placesText(t, item)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <StateBadge state={state} />
    </button>
  );
}

function StateBadge({ state }: { state: ClassState }) {
  const t = useTranslations("gymBooking.member.classes.states");
  switch (state) {
    case "booked":
      return (
        <Badge variant="accent">
          <CheckIcon aria-hidden />
          {t("booked")}
        </Badge>
      );
    case "checkedIn":
      return <Badge variant="success">{t("checkedIn")}</Badge>;
    case "cancelled":
      return <Badge variant="destructive">{t("cancelled")}</Badge>;
    case "started":
      return <Badge variant="neutral">{t("started")}</Badge>;
    case "full":
      return <Badge variant="warning">{t("full")}</Badge>;
    default:
      return <Badge variant="outline">{t("open")}</Badge>;
  }
}

/**
 * The chosen class and what the member can do with it (F13's sheet): book a
 * place, or cancel their booking. Success is said only from the backend's
 * answer, after which the classes are read again; a lost answer says the
 * outcome is unknown and "Try again" sends the same request (same key), so
 * at most one booking can ever result.
 */
function ClassDetails({
  item,
  now,
  gymMemberId,
}: {
  item: GymMemberClass;
  now: number;
  gymMemberId: string;
}) {
  const t = useTranslations("gymBooking.member.classes");
  const format = useFormatter();
  const book = useBookClass(gymMemberId);
  const [confirmed, setConfirmed] = useState(false);
  const state = classState(item, now);
  const failed = book.isError ? bookingProblem(book.error) : null;
  // A lost answer whose booking the re-read shows: the outcome is known now.
  const reconciled = failed?.kind === "unknown" && state === "booked";
  const problem = reconciled ? null : failed;
  const start = new Date(item.starts_at);
  const upcoming = start.getTime() > now;
  const day = format.dateTime(start, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: item.time_zone,
  });
  const when = `${format.dateTime(start, { dateStyle: "full", timeZone: item.time_zone })} · ${wallClock(item.local_starts_at)}`;
  const submit = () => {
    setConfirmed(false);
    book.mutate(item.occurrence_id, { onSuccess: () => setConfirmed(true) });
  };

  return (
    <section
      aria-labelledby="member-class-heading"
      className="flex flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
      data-member-class-details={item.occurrence_id}
      data-class-state={state}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-label font-mono text-highlight uppercase">
            {t("detailsEyebrow", {
              day,
              minutes: item.duration_minutes,
              venue: item.venue.name ?? "",
            })}
          </p>
          <h3 id="member-class-heading" className="type-title font-display break-words">
            {item.title}
          </h3>
        </div>
        <span className="type-h3 font-display text-highlight">
          {wallClock(item.local_starts_at)}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        <li className="rounded-xl bg-muted px-2.5 py-1.5 type-caption font-bold" data-member-places>
          {placesText(t, item)}
        </li>
        {item.instructor?.name && (
          <li className="rounded-xl bg-muted px-2.5 py-1.5 type-caption font-bold">
            {t("instructor", { name: item.instructor.name })}
          </li>
        )}
        <li className="rounded-xl bg-muted px-2.5 py-1.5 type-caption font-bold">
          {t("until", { time: wallClock(item.local_ends_at) })}
        </li>
      </ul>

      {(confirmed || reconciled) && state === "booked" && (
        <p role="status" className="type-body-sm font-bold text-success" data-booking-confirmed>
          {t("confirmedNotice")}
        </p>
      )}
      {problem && <BookingProblemNotice problem={problem} />}
      {item.booking?.status === "cancelled" && state === "open" && (
        <p className="type-caption text-muted-foreground">{t("cancelledBefore")}</p>
      )}

      {state === "open" && (
        <Button
          size="lg"
          aria-busy={book.isPending || undefined}
          disabled={book.isPending}
          onClick={submit}
          data-book-class={item.occurrence_id}
        >
          {book.isPending && <Spinner />}
          {book.isPending
            ? t("booking")
            : problem?.kind === "unknown"
              ? t("tryAgain")
              : t("confirm")}
        </Button>
      )}
      {state === "booked" && upcoming && item.booking !== null && (
        <CancelBookingDialog
          bookingId={item.booking.booking_id}
          title={item.title}
          when={when}
          trigger={
            <Button variant="destructive-subtle" data-cancel-booking={item.booking.booking_id}>
              {t("cancelBooking")}
            </Button>
          }
        />
      )}
      {state === "checkedIn" && item.booking?.checked_in_at && (
        <Notice tone="olive" data-member-checked-in>
          {t("checkedInNotice", {
            time: format.dateTime(new Date(item.booking.checked_in_at), {
              timeStyle: "short",
              timeZone: item.time_zone,
            }),
          })}
        </Notice>
      )}
      {state === "full" && <Notice tone="amber">{t("fullNotice")}</Notice>}
      {state === "started" && <Notice tone="muted">{t("startedNotice")}</Notice>}
      {state === "cancelled" && <Notice tone="amber">{t("cancelledNotice")}</Notice>}
      {state === "booked" &&
        (upcoming ? (
          <p className="type-caption text-faint-foreground">{t("cancelNote")}</p>
        ) : (
          <Notice tone="muted">{t("startedBooked")}</Notice>
        ))}
    </section>
  );
}
