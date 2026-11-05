"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import {
  membershipProblem,
  useAnswerInboxInvitation,
  useMyGymInvitations,
  type GymInboxInvitation,
} from "@/features/gym-membership-manage";
import { Link } from "@/shared/i18n/navigation";
import { withContinuation } from "@/shared/routes/continuation";
import { routeHref, webGuards } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

import { ConfirmAction, useMembershipProblemText } from "./membership-shared";
import { MemberHeader, MemberState } from "./shared";

/**
 * The member invitation inbox (`web.app.me.gyms.invitations`, SF-134; no board,
 * D-WEB-GYM-MEMBER-JOIN): what the backend matched to this account's verified
 * addresses, token-free and pending only. Opening it accepts nothing, and nothing
 * here decides who may answer: a refusal reads the list again. Staff invitations
 * are another domain, and an inbox answer never confuses the two.
 */
type Done = { kind: "accepted"; gym: string; gymId: string } | { kind: "declined"; gym: string };

export function MemberInvitations() {
  const t = useTranslations("gymMembership.invitations");
  const problemText = useMembershipProblemText();
  const inbox = useMyGymInvitations();
  const [done, setDone] = useState<Done | null>(null);

  return (
    <>
      <MemberHeader eyebrow={t("eyebrow")} title={t("title")} />
      <PageBody inset="site" className="flex flex-col gap-4">
        <p className="type-body text-muted-foreground">{t("lead")}</p>
        {done !== null && (
          <Notice
            tone="olive"
            role="status"
            data-inbox-done={done.kind}
            action={
              done.kind === "accepted" ? (
                <Link
                  href={routeHref("web.app.me.gyms._gym-id.classes", { gymId: done.gymId })}
                  className="rounded-xs type-caption font-extrabold whitespace-nowrap underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t("accepted.action")}
                </Link>
              ) : undefined
            }
          >
            {done.kind === "accepted"
              ? t("accepted.text", { gym: done.gym })
              : t("declined", { gym: done.gym })}
          </Notice>
        )}
        {inbox.query.isError ? (
          <div className="flex flex-col items-start gap-2" data-inbox-state="failed">
            <Notice tone="coral" role="alert">
              {problemText(membershipProblem(inbox.query.error))}
            </Notice>
            <Button variant="quiet" onClick={() => void inbox.query.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : !inbox.complete ? (
          <div className="flex flex-col gap-2.5" aria-busy="true">
            <span className="sr-only" role="status">
              {t("loading")}
            </span>
            <Skeleton className="h-28 rounded-3xl" />
          </div>
        ) : inbox.invitations.length === 0 ? (
          <MemberState
            marker="no-invitations"
            title={t("empty.title")}
            body={t("empty.body")}
            action={
              <Button asChild>
                <Link href={routeHref("web.app.me.gyms.join")}>{t("empty.action")}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2.5" data-member-invitations>
            {inbox.invitations.map((invitation) => (
              <InvitationRow
                key={invitation.invitation_id}
                invitation={invitation}
                onDone={setDone}
              />
            ))}
          </ul>
        )}
        <Button asChild variant="quiet" className="self-start">
          <Link href={routeHref("web.app.me.gyms")}>{t("back")}</Link>
        </Button>
      </PageBody>
    </>
  );
}

function InvitationRow({
  invitation,
  onDone,
}: {
  invitation: GymInboxInvitation;
  onDone: (done: Done) => void;
}) {
  const t = useTranslations("gymMembership.invitations");
  const format = useFormatter();
  const text = useMembershipProblemText();
  const { accept, decline } = useAnswerInboxInvitation();
  const id = invitation.invitation_id;
  const gym = invitation.gym.name ?? t("unnamedGym");
  const pending = accept.isPending || decline.isPending;
  const problem = accept.isError ? membershipProblem(accept.error) : null;
  const inviter = invitation.invited_by.first_name;

  return (
    <li
      className="flex flex-col gap-3 rounded-3xl border bg-surface px-5 py-4"
      data-member-invitation={id}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="type-title font-display break-words">{gym}</h2>
        {inviter !== null && inviter !== undefined && (
          <p className="type-body-sm text-muted-foreground">{t("invitedBy", { name: inviter })}</p>
        )}
        <p className="type-caption break-words text-faint-foreground">
          {t("sentTo", { address: invitation.sent_to })} ·{" "}
          {t("expires", { date: format.dateTime(new Date(invitation.expires_at), "date") })}
        </p>
      </div>
      {problem !== null &&
        (problem.kind === "registration" ? (
          <Notice tone="amber" role="alert">
            <Link
              href={withContinuation(webGuards.entry, { returnTo: "/app/me/gyms/invitations" })}
              className="underline"
            >
              {text(problem)}
            </Link>
          </Notice>
        ) : (
          <Notice tone={problem.kind === "limited" ? "amber" : "coral"} role="alert">
            {text(problem)}
          </Notice>
        ))}
      <div className="flex flex-wrap gap-2.5">
        <Button
          aria-label={t("acceptLabel", { gym })}
          aria-busy={accept.isPending || undefined}
          disabled={pending}
          onClick={() =>
            accept.mutate(id, {
              onSuccess: (answer) => onDone({ kind: "accepted", gym, gymId: answer.gym_id }),
            })
          }
        >
          {accept.isPending && <Spinner />}
          {accept.isPending ? t("accepting") : t("accept")}
        </Button>
        <ConfirmAction
          marker="decline-invitation"
          title={t("decline.title")}
          body={t("decline.body", { gym })}
          keep={t("decline.keep")}
          confirm={t("decline.confirm")}
          pendingLabel={t("decline.pending")}
          isPending={decline.isPending}
          problem={decline.isError ? text(membershipProblem(decline.error)) : null}
          onOpen={() => decline.reset()}
          onConfirm={(close) =>
            decline.mutate(id, {
              onSuccess: () => {
                close();
                onDone({ kind: "declined", gym });
              },
            })
          }
          trigger={
            <Button variant="outline" disabled={pending} aria-label={t("decline.label", { gym })}>
              {t("decline.action")}
            </Button>
          }
        />
      </div>
    </li>
  );
}
