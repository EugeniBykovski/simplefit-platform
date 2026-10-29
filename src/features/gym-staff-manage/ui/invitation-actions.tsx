"use client";

import { useMutation } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { GymStaffInvitation } from "@/entities/gym-staff";
import { callWithSession } from "@/entities/session";
import {
  cancelGymStaffInvitation,
  resendGymStaffInvitation,
} from "@/shared/api/generated/endpoints/gym-staff/gym-staff";
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

import { useStaffRefresh } from "../model/refresh";
import { staffProblem, type StaffProblem } from "../model/staff-problem";
import { useProblemText } from "./problem-text";

/**
 * Resend and Cancel for one pending invitation (SF-93), for a viewer whose
 * permission covers its role. Resend gives a new link and a new 7-day
 * expiry (the old link stops working); the new expiry is said only from the
 * backend's answer. Cancel asks first. After any answer, success or
 * refusal, this gym's staff data is read again, so the list shows the
 * backend's state, never a guess.
 */
export function StaffInvitationActions({
  gymId,
  invitation,
}: {
  gymId: string;
  invitation: GymStaffInvitation;
}) {
  const t = useTranslations("gymConsole.staff.invitations");
  const format = useFormatter();
  const refresh = useStaffRefresh(gymId);
  const problemText = useProblemText();
  const email = invitation.recipient_email;

  const resend = useMutation({
    mutationFn: () =>
      callWithSession((init) => resendGymStaffInvitation(gymId, invitation.invitation_id, init)),
    onSuccess: ({ invitation: resent }) =>
      toast.success(
        t("resent", {
          email,
          expires: format.dateTime(new Date(resent.expires_at), "date"),
        }),
      ),
    onError: (error) => toast.error(problemText(staffProblem(error))),
    onSettled: () => void refresh(),
  });

  const cancel = useMutation({
    mutationFn: () =>
      callWithSession((init) => cancelGymStaffInvitation(gymId, invitation.invitation_id, init)),
    onSettled: () => void refresh(),
  });

  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {invitation.resends_remaining > 0 && (
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
        problem={cancel.isError ? staffProblem(cancel.error) : null}
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
  problem: StaffProblem | null;
  problemText: (problem: StaffProblem) => string;
  onReset: () => void;
  onConfirm: (close: () => void) => void;
}) {
  const t = useTranslations("gymConsole.staff.cancelInvitation");
  const labels = useTranslations("gymConsole.staff.invitations");
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
          <Notice
            tone={problem.kind === "failed" || problem.kind === "unknown" ? "coral" : "amber"}
            role="alert"
          >
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
