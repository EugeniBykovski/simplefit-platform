"use client";

import { ChevronRightIcon, MailIcon, PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { useMyGymMemberships, type GymMembership } from "@/entities/gym-booking";
import { readProblem, BookingProblemNotice } from "@/features/gym-class-booking";
import {
  membershipProblem,
  useCancelJoinRequest,
  useLeaveGym,
  useMyGymInvitations,
} from "@/features/gym-membership-manage";
import { initialsOf } from "@/features/session-gate";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ChoiceAvatar } from "@/shared/ui/choice-row";
import { PageBody } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { ConfirmAction, useMembershipProblemText } from "./membership-shared";
import { MemberHeader, MemberState } from "./shared";

/**
 * The viewer's gyms as a member (`web.app.me.gyms`, F16's "My gyms" without its
 * pass, plan, credits or visit counts, which have no contract). Every row and
 * status is the backend's (SF-95 `GET /me/gym-memberships`, every page), in the
 * contract's own lifecycle: `active` opens its classes and can be left,
 * `requested` waits for the gym and can be cancelled, and `rejected`, `cancelled`
 * and `ended` are history. A membership needs no Fighter or Coach profile and
 * gives no gym workspace; the staff console of a gym is another domain.
 */
export function MemberGyms() {
  const t = useTranslations("gymBooking.member.gyms");
  const m = useTranslations("gymMembership");
  const list = useMyGymMemberships();
  const inbox = useMyGymInvitations();
  const by = (status: GymMembership["status"]) =>
    list.memberships.filter((membership) => membership.status === status);
  const active = by("active");
  const requested = by("requested");
  const history = list.memberships.filter(
    (membership) => membership.status !== "active" && membership.status !== "requested",
  );
  const count = inbox.invitations.length;

  return (
    <>
      <MemberHeader eyebrow={t("eyebrow")} title={t("title")} />
      <PageBody inset="site" className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2.5">
          <Button asChild>
            <Link href={routeHref("web.app.me.gyms.join")} data-member-join-link>
              <PlusIcon aria-hidden />
              {m("actions.join")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={routeHref("web.app.me.gyms.invitations")} data-member-inbox-link>
              <MailIcon aria-hidden />
              {count > 0 ? m("actions.invitationsCount", { count }) : m("actions.invitations")}
            </Link>
          </Button>
        </div>
        {list.query.isError ? (
          <div className="flex flex-col gap-2">
            <BookingProblemNotice problem={readProblem(list.query.error)} />
            <Button variant="quiet" className="w-fit" onClick={() => void list.query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : !list.complete ? (
          <div className="flex flex-col gap-2.5" aria-busy="true">
            <span className="sr-only" role="status">
              {t("loading")}
            </span>
            <Skeleton className="h-16 rounded-3xl" />
            <Skeleton className="h-16 rounded-3xl" />
          </div>
        ) : list.memberships.length === 0 ? (
          <MemberState marker="no-membership" title={t("empty.title")} body={t("empty.body")} />
        ) : (
          <div className="flex flex-col gap-5" data-member-gyms>
            <Section title={m("sections.active")} items={active} />
            <Section title={m("sections.requests")} items={requested} />
            <Section title={m("sections.history")} items={history} />
            {active.length === 0 && requested.length === 0 && (
              <MemberState marker="no-membership" title={t("empty.title")} body={t("empty.body")} />
            )}
          </div>
        )}
        <p className="type-caption text-faint-foreground">{t("note")}</p>
      </PageBody>
    </>
  );
}

function Section({ title, items }: { title: string; items: GymMembership[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="type-label font-mono text-faint-foreground uppercase">{title}</h2>
      <ul className="flex flex-col gap-2.5">
        {items.map((membership) => (
          <MembershipRow key={membership.gym_member_id} membership={membership} />
        ))}
      </ul>
    </section>
  );
}

function MembershipRow({ membership }: { membership: GymMembership }) {
  const t = useTranslations("gymBooking.member.gyms");
  const m = useTranslations("gymMembership");
  const format = useFormatter();
  const name = membership.gym.name ?? t("unnamedGym");
  const identity = (line: string) => (
    <>
      <ChoiceAvatar tone="gym">{initialsOf(name)}</ChoiceAvatar>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate type-body font-extrabold">{name}</span>
        <span className="type-caption text-muted-foreground">{line}</span>
      </span>
    </>
  );
  const row = "flex min-h-16 items-center gap-3 rounded-3xl border bg-surface px-4 py-3";
  const attributes = {
    "data-member-gym": membership.gym.gym_id,
    "data-membership-status": membership.status,
  };

  if (membership.status === "active") {
    return (
      <li {...attributes} className={`${row} flex-wrap`}>
        <Link
          href={routeHref("web.app.me.gyms._gym-id.classes", { gymId: membership.gym.gym_id })}
          aria-label={t("open", { gym: name })}
          className="flex min-w-0 flex-[1_1_14rem] items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {identity(t("activeLine"))}
          <Badge variant="accent">{t("status.active")}</Badge>
          <ChevronRightIcon aria-hidden className="size-4.5 text-faint-foreground" />
        </Link>
        <LeaveAction gymMemberId={membership.gym_member_id} gym={name} />
      </li>
    );
  }
  if (membership.status === "requested") {
    return (
      <li {...attributes} className={`${row} flex-wrap`}>
        <span className="flex min-w-0 flex-[1_1_14rem] items-center gap-3">
          {identity(t("requestedLine"))}
          <Badge variant="warning">{t("status.requested")}</Badge>
        </span>
        <CancelRequestAction gymMemberId={membership.gym_member_id} gym={name} />
      </li>
    );
  }

  const status = membership.status as "rejected" | "cancelled" | "ended";
  const when = membership.ended_at ?? membership.responded_at ?? membership.requested_at;
  const date = when === null ? "" : ` · ${format.dateTime(new Date(when), "date")}`;
  const line =
    status === "ended"
      ? m(`history.ended.${membership.ended_reason ?? "unknown"}`)
      : m(`history.${status}`);
  return (
    <li {...attributes} className={row}>
      {identity(`${line}${date}`)}
      <Badge variant="neutral">{m(`history.status.${status}`)}</Badge>
    </li>
  );
}

function CancelRequestAction({ gymMemberId, gym }: { gymMemberId: string; gym: string }) {
  const t = useTranslations("gymMembership.cancelRequest");
  const text = useMembershipProblemText();
  const cancel = useCancelJoinRequest();
  return (
    <ConfirmAction
      marker="cancel-request"
      title={t("title")}
      body={t("body", { gym })}
      keep={t("keep")}
      confirm={t("confirm")}
      pendingLabel={t("pending")}
      isPending={cancel.isPending}
      problem={cancel.isError ? text(membershipProblem(cancel.error)) : null}
      onOpen={() => cancel.reset()}
      onConfirm={(close) => cancel.mutate(gymMemberId, { onSuccess: close })}
      trigger={
        <Button variant="quiet" aria-label={t("label", { gym })}>
          {t("action")}
        </Button>
      }
    />
  );
}

function LeaveAction({ gymMemberId, gym }: { gymMemberId: string; gym: string }) {
  const t = useTranslations("gymMembership.leave");
  const text = useMembershipProblemText();
  const leave = useLeaveGym();
  return (
    <ConfirmAction
      marker="leave"
      title={t("title", { gym })}
      body={t("body")}
      keep={t("keep")}
      confirm={t("confirm")}
      pendingLabel={t("pending")}
      isPending={leave.isPending}
      problem={leave.isError ? text(membershipProblem(leave.error)) : null}
      onOpen={() => leave.reset()}
      onConfirm={(close) => leave.mutate(gymMemberId, { onSuccess: close })}
      trigger={
        <Button variant="quiet" aria-label={t("label", { gym })}>
          {t("action")}
        </Button>
      }
    />
  );
}
