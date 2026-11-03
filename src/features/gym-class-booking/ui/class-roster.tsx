"use client";

import { CheckIcon, UsersIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  useClassRoster,
  type GymClassRosterEntry,
  type GymClassRosterView,
  type RosterCapabilities,
} from "@/entities/gym-booking";
import { wallClock } from "@/entities/gym-timetable";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import { bookingProblem, readProblem, type BookingProblem } from "../model/booking-problem";
import { useCheckIn } from "../model/use-check-in";
import { BookingProblemNotice } from "./problem-text";

/** The class a roster belongs to, as the timetable lists it. */
export type RosterClass = {
  occurrence_id: string;
  title: string;
  status: string;
  time_zone: string;
  starts_at: string;
  local_starts_at: string;
  local_ends_at: string;
  venue: { name: string };
};

/**
 * One class's roster for its staff (G03 ClassRoster in the web console,
 * reconciled with SF-99): the class's counts from the backend (capacity,
 * confirmed, places left, arrivals), then each booking with the member's
 * short name, how and when it was made, and the arrival the staff recorded.
 * Confirmed and cancelled bookings are separate views; nothing else about
 * anyone exists in the contract, so nothing else is shown (no email,
 * profile, plan, payment, waitlist or trial).
 *
 * Check-in is manual and the backend's: a member is shown as checked in
 * only from its answer, a repeat records nothing new, and a refusal (not
 * the class's day, a cancelled booking or class) is said as such. The
 * roster is read when it opens and again after every answer.
 */
export function ClassRosterSheet({
  gymId,
  occurrence,
  can,
  trigger,
}: {
  gymId: string;
  occurrence: RosterClass;
  can: RosterCapabilities;
  trigger: ReactNode;
}) {
  const t = useTranslations("gymBooking.roster");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const eyebrow = t("eyebrow", {
    day: format.dateTime(new Date(occurrence.starts_at), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: occurrence.time_zone,
    }),
    from: wallClock(occurrence.local_starts_at),
    to: wallClock(occurrence.local_ends_at),
    venue: occurrence.venue.name,
  });
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        closeLabel={t("close")}
        className="w-full gap-0 overflow-y-auto sm:max-w-lg data-[side=right]:sm:max-w-lg"
        data-class-roster={occurrence.occurrence_id}
      >
        <SheetHeader className="gap-1.5 border-b px-5 py-4">
          <p className="type-label font-mono text-highlight uppercase" aria-hidden>
            {eyebrow}
          </p>
          <SheetTitle className="type-title font-display break-words">
            {occurrence.title}
          </SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        {open && <RosterBody gymId={gymId} occurrence={occurrence} can={can} />}
      </SheetContent>
    </Sheet>
  );
}

function RosterBody({
  gymId,
  occurrence,
  can,
}: {
  gymId: string;
  occurrence: RosterClass;
  can: RosterCapabilities;
}) {
  const t = useTranslations("gymBooking.roster");
  const [view, setView] = useState<GymClassRosterView>("confirmed");
  const roster = useClassRoster(gymId, occurrence.occurrence_id, view);
  const checkIn = useCheckIn(gymId, occurrence.occurrence_id);
  const [outcome, setOutcome] = useState<
    { bookingId: string; problem: BookingProblem } | { bookingId: string; done: true } | null
  >(null);
  const problem = roster.query.isError ? readProblem(roster.query.error) : null;
  const scheduled = occurrence.status === "scheduled";

  const record = (entry: GymClassRosterEntry) => {
    setOutcome(null);
    checkIn.mutate(entry.booking_id, {
      onSuccess: () => setOutcome({ bookingId: entry.booking_id, done: true }),
      onError: (error) =>
        setOutcome({ bookingId: entry.booking_id, problem: bookingProblem(error) }),
    });
  };

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <Summary summary={roster.summary} />
      {!scheduled && (
        <Notice tone="amber" data-roster-class-cancelled>
          {t("classCancelled")}
        </Notice>
      )}
      <Tabs value={view} onValueChange={(next) => setView(next as GymClassRosterView)}>
        <TabsList aria-label={t("views.label")}>
          <TabsTrigger value="confirmed">{t("views.confirmed")}</TabsTrigger>
          <TabsTrigger value="cancelled">{t("views.cancelled")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "confirmed" && can.canCheckIn && scheduled && (
        <p className="type-caption text-faint-foreground">{t("checkInNote")}</p>
      )}
      {problem !== null ? (
        <div className="flex flex-col gap-2">
          <BookingProblemNotice problem={problem} />
          <Button variant="quiet" className="w-fit" onClick={() => void roster.query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : !roster.complete ? (
        <div className="flex flex-col gap-2" aria-busy="true" data-roster-loading>
          <span className="sr-only" role="status">
            {t("loading")}
          </span>
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
        </div>
      ) : roster.entries.length === 0 ? (
        <p
          className="rounded-2xl border border-dashed px-4 py-6 text-center type-body-sm text-muted-foreground"
          data-roster-empty={view}
        >
          {t(`empty.${view}`)}
        </p>
      ) : (
        <ul className="flex flex-col" data-roster-entries={view}>
          {roster.entries.map((entry) => (
            <RosterRow
              key={entry.booking_id}
              entry={entry}
              canCheckIn={can.canCheckIn && scheduled && view === "confirmed"}
              pending={checkIn.isPending && checkIn.variables === entry.booking_id}
              busy={checkIn.isPending}
              onCheckIn={() => record(entry)}
              outcome={outcome?.bookingId === entry.booking_id ? outcome : null}
            />
          ))}
        </ul>
      )}
      <p className="type-caption text-faint-foreground">{t("privacy")}</p>
    </div>
  );
}

function Summary({ summary }: { summary: ReturnType<typeof useClassRoster>["summary"] }) {
  const t = useTranslations("gymBooking.roster.summary");
  if (summary === null) return null;
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2" data-roster-summary>
      <p className="flex items-baseline gap-2">
        <span className="type-h3 font-display" data-roster-confirmed>
          {t("booked", { confirmed: summary.confirmed_count, capacity: summary.capacity })}
        </span>
        <span className="type-caption text-muted-foreground">{t("bookedLabel")}</span>
      </p>
      <p className="type-body-sm text-muted-foreground" data-roster-remaining>
        {t("remaining", { count: summary.remaining_capacity })}
      </p>
      <p className="type-body-sm text-muted-foreground" data-roster-checked-in>
        {t("checkedIn", { count: summary.checked_in_count })}
      </p>
    </div>
  );
}

function RosterRow({
  entry,
  canCheckIn,
  pending,
  busy,
  onCheckIn,
  outcome,
}: {
  entry: GymClassRosterEntry;
  canCheckIn: boolean;
  pending: boolean;
  busy: boolean;
  onCheckIn: () => void;
  outcome: { problem: BookingProblem } | { done: true } | null;
}) {
  const t = useTranslations("gymBooking.roster");
  const format = useFormatter();
  const name = entry.name ?? t("unnamed");
  const time = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  return (
    <li
      className="flex flex-col gap-2 border-t py-3 first:border-t-0"
      data-roster-entry={entry.booking_id}
      data-booking-status={entry.status}
      data-checked-in={entry.checked_in_at !== null || undefined}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 flex-none items-center justify-center rounded-full bg-muted type-label font-display"
        >
          {initials(name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate type-body-sm font-extrabold">{name}</span>
          <span className="type-caption text-muted-foreground">
            {entry.status === "cancelled" && entry.cancelled_at !== null
              ? t("cancelledAt", { time: time(entry.cancelled_at) })
              : t(`bookedVia.${entry.booked_via}`, { time: time(entry.confirmed_at) })}
          </span>
        </span>
        {entry.status === "cancelled" ? (
          <Badge variant="neutral">
            {t(`reasons.${entry.cancel_reason ?? "member_cancelled"}`)}
          </Badge>
        ) : entry.checked_in_at !== null ? (
          <Badge variant="success" data-checked-in-at={entry.checked_in_at}>
            <CheckIcon aria-hidden />
            {t("checkedInAt", {
              time: format.dateTime(new Date(entry.checked_in_at), { timeStyle: "short" }),
            })}
          </Badge>
        ) : canCheckIn ? (
          <Button
            size="sm"
            variant="outline"
            aria-busy={pending || undefined}
            disabled={busy}
            onClick={onCheckIn}
            aria-label={t("checkInFor", { name })}
            data-check-in={entry.booking_id}
          >
            {pending ? <Spinner /> : <UsersIcon aria-hidden />}
            {pending ? t("checkingIn") : t("checkIn")}
          </Button>
        ) : (
          <Badge variant="outline">{t("booked")}</Badge>
        )}
      </div>
      {outcome !== null &&
        ("problem" in outcome ? (
          <BookingProblemNotice problem={outcome.problem} />
        ) : (
          <p role="status" className="type-caption text-success" data-check-in-done>
            {t("checkedInDone", { name })}
          </p>
        ))}
    </li>
  );
}

/** Initials of a short name ("Marta K." → "MK"). */
function initials(name: string): string {
  const parts = name.replace(/\./g, "").trim().split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] ?? "")[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts.at(-1) ?? "")[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
