"use client";

import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { currentMemberships, useMyGymMemberships } from "@/entities/gym-booking";
import { readProblem, BookingProblemNotice } from "@/features/gym-class-booking";
import { initialsOf } from "@/features/session-gate";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ChoiceAvatar } from "@/shared/ui/choice-row";
import { PageBody } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { MemberHeader, MemberState } from "./shared";

/**
 * The viewer's gyms as a member (`web.app.me.gyms`, F16's "My gyms" without
 * its pass, plan, credits or visit counts, which have no contract): every
 * active membership opens its classes, a pending request says it is waiting
 * for the gym. Every row is the backend's (SF-95 `GET /me/gym-memberships`,
 * every page); ended memberships are history and book nothing, so they are
 * not offered. A membership needs no Fighter or Coach profile.
 */
export function MemberGyms() {
  const t = useTranslations("gymBooking.member.gyms");
  const list = useMyGymMemberships();
  const current = currentMemberships(list.memberships);

  return (
    <>
      <MemberHeader eyebrow={t("eyebrow")} title={t("title")} />
      <PageBody inset="site" className="flex flex-col gap-4">
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
        ) : current.length === 0 ? (
          <MemberState marker="no-membership" title={t("empty.title")} body={t("empty.body")} />
        ) : (
          <ul className="flex flex-col gap-2.5" data-member-gyms>
            {current.map((membership) => {
              const name = membership.gym.name ?? t("unnamedGym");
              const active = membership.status === "active";
              const content = (
                <>
                  <ChoiceAvatar tone="gym">{initialsOf(name)}</ChoiceAvatar>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate type-body font-extrabold">{name}</span>
                    <span className="type-caption text-muted-foreground">
                      {active ? t("activeLine") : t("requestedLine")}
                    </span>
                  </span>
                  <Badge variant={active ? "accent" : "warning"}>
                    {t(active ? "status.active" : "status.requested")}
                  </Badge>
                  {active && (
                    <ChevronRightIcon aria-hidden className="size-4.5 text-faint-foreground" />
                  )}
                </>
              );
              return (
                <li
                  key={membership.gym_member_id}
                  data-member-gym={membership.gym.gym_id}
                  data-membership-status={membership.status}
                >
                  {active ? (
                    <Link
                      href={routeHref("web.app.me.gyms._gym-id.classes", {
                        gymId: membership.gym.gym_id,
                      })}
                      aria-label={t("open", { gym: name })}
                      className="flex min-h-16 items-center gap-3 rounded-3xl border bg-surface px-4 py-3 outline-none hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex min-h-16 items-center gap-3 rounded-3xl border bg-surface px-4 py-3">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="type-caption text-faint-foreground">{t("note")}</p>
      </PageBody>
    </>
  );
}
