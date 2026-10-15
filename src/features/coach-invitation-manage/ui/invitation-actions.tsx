"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { CoachInvitation } from "@/entities/coach-invitation";
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

import {
  actionProblem,
  useInvitationActions,
  type ActionProblem,
} from "../model/invitation-actions";

/**
 * Resend and Cancel for one pending invitation (WC7, Claude Design
 * 1792056621-3707). Shown only while the backend reports it pending; what
 * happened is announced once the backend has answered, and the list is
 * refetched in every case.
 */
export function InvitationActions({ invitation }: { invitation: CoachInvitation }) {
  const t = useTranslations("coachFighters");
  const { resend, cancel } = useInvitationActions();
  const email = invitation.recipient_email;

  const problemText = (problem: ActionProblem) =>
    problem.kind === "cooldown"
      ? t("results.cooldown", { seconds: problem.seconds })
      : t(`results.${problem.kind}`);

  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {invitation.resends_remaining > 0 && (
        <Button
          size="sm"
          variant="quiet"
          aria-label={t("invitations.resendLabel", { email })}
          aria-busy={resend.isPending}
          disabled={resend.isPending || cancel.isPending}
          onClick={() =>
            resend.mutate(invitation.invitation_id, {
              onSuccess: () => toast.success(t("results.resent", { email })),
              onError: (error) => toast.error(problemText(actionProblem(error))),
            })
          }
        >
          {resend.isPending && <Spinner />}
          {resend.isPending
            ? t("invitations.resending")
            : t("invitations.resend", { count: invitation.resends_remaining })}
        </Button>
      )}
      <CancelInvitation
        email={email}
        busy={resend.isPending}
        pending={cancel.isPending}
        failed={cancel.isError}
        onReset={() => cancel.reset()}
        onConfirm={(close) =>
          cancel.mutate(invitation.invitation_id, {
            onSuccess: () => {
              close();
              toast.success(t("results.cancelled", { email }));
            },
            onError: (error) => {
              const problem = actionProblem(error);
              if (problem.kind === "failed") return;
              close();
              toast.error(problemText(problem));
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
  failed,
  onReset,
  onConfirm,
}: {
  email: string;
  busy: boolean;
  pending: boolean;
  failed: boolean;
  onReset: () => void;
  onConfirm: (close: () => void) => void;
}) {
  const t = useTranslations("coachFighters");
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
          aria-label={t("invitations.cancelLabel", { email })}
          disabled={busy}
        >
          {t("invitations.cancel")}
        </Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cancelInvitation.title")}</DialogTitle>
          <DialogDescription>{t("cancelInvitation.body", { email })}</DialogDescription>
        </DialogHeader>
        {failed && (
          <Notice tone="coral" role="alert">
            {t("cancelInvitation.failed")}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            {t("cancelInvitation.keep")}
          </Button>
          <Button
            variant="destructive-subtle"
            aria-busy={pending}
            disabled={pending}
            onClick={() => onConfirm(() => setOpen(false))}
          >
            {pending && <Spinner />}
            {pending ? t("cancelInvitation.pending") : t("cancelInvitation.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
