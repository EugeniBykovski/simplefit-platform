"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useMyClassBookings, type GymClassBooking } from "@/entities/gym-booking";
import { wallClock } from "@/entities/gym-timetable";
import { BookingProblemNotice, readProblem } from "@/features/gym-class-booking";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { CancelBookingDialog, MemberHeader, MemberState } from "./shared";

/** The clock, read now and every half minute. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

type Group = "upcoming" | "past" | "cancelled";

/**
 * Which list a booking belongs to, from the backend's facts: a confirmed
 * booking of a class still to come is upcoming, one whose class has started
 * is past, a cancelled one is history with the backend's reason. Attendance
 * is its own fact (`checked_in_at`): a past booking is never called
 * attended, or missed, without it.
 */
function groupOf(booking: GymClassBooking, now: number): Group {
  if (booking.status === "cancelled") return "cancelled";
  return new Date(booking.class.starts_at).getTime() > now ? "upcoming" : "past";
}

/**
 * The member's bookings at every gym (`web.app.me.bookings`; interim web
 * composition, D-WEB-GYM-MEMBER-BOOKING; no artboard). Every booking is the
 * backend's (`GET /me/class-bookings`, every page) and the lists are only
 * drawn once the last page has arrived, so nothing is split or counted from
 * part of them. Upcoming classes come first (soonest first), then past ones
 * and cancelled ones (latest first).
 */
export function MemberBookings() {
  const t = useTranslations("gymBooking.member.bookings");
  const list = useMyClassBookings();
  const now = useNow();
  const by = (group: Group) => list.bookings.filter((booking) => groupOf(booking, now) === group);
  const soonest = (a: GymClassBooking, b: GymClassBooking) =>
    a.class.starts_at.localeCompare(b.class.starts_at);
  const groups: { key: Group; items: GymClassBooking[] }[] = [
    { key: "upcoming", items: by("upcoming").sort(soonest) },
    { key: "past", items: by("past").sort((a, b) => soonest(b, a)) },
    { key: "cancelled", items: by("cancelled").sort((a, b) => soonest(b, a)) },
  ];

  return (
    <>
      <MemberHeader eyebrow={t("eyebrow")} title={t("title")} />
      <PageBody inset="site" className="flex flex-col gap-5">
        {list.query.isError ? (
          <div className="flex flex-col gap-2">
            <BookingProblemNotice problem={readProblem(list.query.error)} />
            <Button variant="quiet" className="w-fit" onClick={() => void list.query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : !list.complete ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <span className="sr-only" role="status">
              {t("loading")}
            </span>
            <Skeleton className="h-20 rounded-3xl" />
            <Skeleton className="h-20 rounded-3xl" />
          </div>
        ) : list.bookings.length === 0 ? (
          <MemberState
            marker="no-bookings"
            title={t("empty.title")}
            body={t("empty.body")}
            action={
              <Button asChild variant="quiet">
                <Link href={routeHref("web.app.me.gyms")}>{t("empty.action")}</Link>
              </Button>
            }
          />
        ) : (
          groups.map(({ key, items }) => (
            <section
              key={key}
              aria-labelledby={`member-bookings-${key}`}
              className="flex flex-col gap-2.5"
              data-member-bookings={key}
            >
              <h2 id={`member-bookings-${key}`} className="type-label text-faint-foreground">
                {t(`groups.${key}`, { count: items.length })}
              </h2>
              {items.length === 0 ? (
                <p className="type-body-sm text-muted-foreground">{t(`none.${key}`)}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((booking) => (
                    <BookingRow key={booking.booking_id} booking={booking} group={key} />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
        <p className="type-caption text-faint-foreground">{t("note")}</p>
      </PageBody>
    </>
  );
}

function BookingRow({ booking, group }: { booking: GymClassBooking; group: Group }) {
  const t = useTranslations("gymBooking.member.bookings");
  const format = useFormatter();
  const item = booking.class;
  const start = new Date(item.starts_at);
  const when = `${format.dateTime(start, { dateStyle: "full", timeZone: item.time_zone })} · ${wallClock(item.local_starts_at)}`;
  return (
    <li
      className="flex flex-col gap-3 rounded-3xl border bg-surface px-4 py-3.5 sm:flex-row sm:items-center"
      data-member-booking={booking.booking_id}
      data-booking-status={booking.status}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body-sm font-extrabold break-words">{item.title}</span>
        <span className="type-caption text-muted-foreground">
          {t("line", {
            when,
            to: wallClock(item.local_ends_at),
            venue: item.venue.name ?? "",
            gym: item.gym.name ?? t("unnamedGym"),
          })}
        </span>
        <span className="type-caption text-faint-foreground">
          {t("zone", { zone: item.time_zone })}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {booking.status === "cancelled" ? (
          <Badge variant="neutral" data-cancel-reason={booking.cancel_reason}>
            {t(`reasons.${booking.cancel_reason ?? "member_cancelled"}`)}
          </Badge>
        ) : booking.checked_in_at !== null ? (
          <Badge variant="success" data-checked-in-at={booking.checked_in_at}>
            {t("checkedIn", {
              time: format.dateTime(new Date(booking.checked_in_at), {
                timeStyle: "short",
                timeZone: item.time_zone,
              }),
            })}
          </Badge>
        ) : group === "upcoming" ? (
          <Badge variant="accent">{t("booked")}</Badge>
        ) : null}
        {group === "upcoming" && booking.checked_in_at === null && (
          <CancelBookingDialog
            bookingId={booking.booking_id}
            title={item.title}
            when={when}
            trigger={
              <Button
                size="sm"
                variant="destructive-subtle"
                data-cancel-booking={booking.booking_id}
              >
                {t("cancel")}
              </Button>
            }
          />
        )}
      </span>
    </li>
  );
}
