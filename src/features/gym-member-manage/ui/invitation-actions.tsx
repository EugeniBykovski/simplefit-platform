"use client";

import { useMutation } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { GymMemberInvitation } from "@/entities/gym-member";
import { callWithSession } from "@/entities/session";
import {
  cancelGymMemberInvitation,
  resendGymMemberInvitation,
} from "@/shared/api/generated/endpoints/gym-members/gym-members";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";

import { isFailure, memberProblem, type MemberProblem } from "../model/member-problem";
import { useMemberRefresh } from "../model/refresh";
import { useProblemText } from "./problem-text";

/**
 * Resend and Cancel for one pending member invitation (SF-95). Resend gives
 * a new link and a new 7-day expiry (the old link stops working); the new
 * expiry is said only from the backend's answer, and it is refused like a
 * new invitation while member invitations are off on this server
 * (`onUnavailable`). Cancel asks first. After any answer the gym's member
 * data is read again, so the list shows the backend's state, never a guess.
 */
export function MemberInvitationActions({
  gymId,
  invitation,
  canResend,
  onUnavailable,
}: {
  gymId: string;
  invitation: GymMemberInvitation;
  canResend: boolean;
  onUnavailable: () => void;
}) {
  const t = useTranslations("gymConsole.members.invitations");
  const format = useFormatter();
  const refresh = useMemberRefresh(gymId);
  const problemText = useProblemText();
  const email = invitation.recipient_email;

  const resend = useMutation({
    mutationFn: () =>
      callWithSession((init) => resendGymMemberInvitation(gymId, invitation.invitation_id, init)),
    onSuccess: ({ invitation: resent }) =>
      toast.success(
        t("resent", { email, expires: format.dateTime(new Date(resent.expires_at), "date") }),
      ),
    onError: (error) => {
      const problem = memberProblem(error);
      if (problem.kind === "invitationsUnavailable") onUnavailable();
      toast.error(problemText(problem));
    },
    onSettled: () => void refresh(),
  });

  const cancel = useMutation({
    mutationFn: () =>
      callWithSession((init) => cancelGymMemberInvitation(gymId, invitation.invitation_id, init)),
    onSettled: () => void refresh(),
  });

  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {canResend && invitation.resends_remaining > 0 && (
        <Button
          size="sm"
          variant="quiet"
          aria-label={t("resendLabel", { email })}
          aria-busy={resend.isPending}
          disabled={resend.isPending || cancel.isPending}
          onClick={() => resend.mutate()}
        >
          {resend.isPending && <Spinner />}
          {resend.isPending ? t("resending") : t("resend", { count: invitation.resends_remaining })}
        </Button>
      )}
      <CancelInvitation
        email={email}
        busy={resend.isPending}
        pending={cancel.isPending}
        problem={cancel.isError ? memberProblem(cancel.error) : null}
        problemText={problemText}
        onReset={() => cancel.reset()}
        onConfirm={(close) =>
          cancel.mutate(undefined, {
            onSuccess: () => {
              close();
              toast.success(t("cancelled", { email }));
            },
          })
        }
      />
    </div>
  );
}

function CancelInvitation({
  email,
  busy,
  pending,
  problem,
  problemText,
  onReset,
  onConfirm,
}: {
  email: string;
  busy: boolean;
  pending: boolean;
  problem: MemberProblem | null;
  problemText: (problem: MemberProblem) => string;
  onReset: () => void;
  onConfirm: (close: () => void) => void;
}) {
  const t = useTranslations("gymConsole.members.cancelInvitation");
  const labels = useTranslations("gymConsole.members.invitations");
  const [open, setOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) onReset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="destructive-subtle"
          aria-label={labels("cancelLabel", { email })}
          disabled={busy}
        >
          {labels("cancel")}
        </Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body", { email })}</DialogDescription>
        </DialogHeader>
        {problem && (
          <Notice tone={isFailure(problem) ? "coral" : "amber"} role="alert">
            {problemText(problem)}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            {t("keep")}
          </Button>
          <Button
            variant="destructive-subtle"
            aria-busy={pending}
            disabled={pending}
            onClick={() => onConfirm(() => setOpen(false))}
          >
            {pending && <Spinner />}
            {pending ? t("pending") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
