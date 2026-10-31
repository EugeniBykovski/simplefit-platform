"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { GymMember } from "@/entities/gym-member";
import { callWithSession } from "@/entities/session";
import {
  approveGymJoinRequest,
  rejectGymJoinRequest,
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

import { isFailure, memberProblem } from "../model/member-problem";
import { useDialogRefresh, useMemberRefresh } from "../model/refresh";
import { useProblemText } from "./problem-text";

/**
 * Approve and Reject for one pending join request (SF-95
 * `approveGymJoinRequest`, `rejectGymJoinRequest`). Approve is one explicit
 * click; Reject asks first. Nothing changes on screen before the backend
 * answers: the person becomes a member only once the roster, read again,
 * lists them. A request someone else answered meanwhile, or that the
 * requester cancelled, is said as such and the lists are read again.
 */
export function JoinRequestActions({
  gymId,
  gymName,
  request,
}: {
  gymId: string;
  gymName: string;
  request: GymMember;
}) {
  const t = useTranslations("gymConsole.members.requests");
  const refresh = useMemberRefresh(gymId);
  const problemText = useProblemText();
  const name = request.name ?? t("someone");

  const approve = useMutation({
    mutationFn: () =>
      callWithSession((init) => approveGymJoinRequest(gymId, request.gym_member_id, init)),
    onSuccess: ({ member }) =>
      member.status === "active"
        ? toast.success(t("approved", { name, gym: gymName }))
        : toast.error(problemText({ kind: "decided", status: member.status })),
    onError: (error) => toast.error(problemText(memberProblem(error))),
    onSettled: () => void refresh(),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        aria-label={t("approveLabel", { name })}
        aria-busy={approve.isPending}
        disabled={approve.isPending}
        onClick={() => approve.mutate()}
        data-member-approve={request.gym_member_id}
      >
        {approve.isPending && <Spinner />}
        {approve.isPending ? t("approving") : t("approve")}
      </Button>
      <RejectDialog gymId={gymId} gymName={gymName} request={request} busy={approve.isPending} />
    </div>
  );
}

function RejectDialog({
  gymId,
  gymName,
  request,
  busy,
}: {
  gymId: string;
  gymName: string;
  request: GymMember;
  busy: boolean;
}) {
  const t = useTranslations("gymConsole.members.reject");
  const labels = useTranslations("gymConsole.members.requests");
  const refresh = useDialogRefresh(gymId);
  const problemText = useProblemText();
  const [open, setOpen] = useState(false);
  const name = request.name ?? labels("someone");

  const reject = useMutation({
    mutationFn: () =>
      callWithSession((init) => rejectGymJoinRequest(gymId, request.gym_member_id, init)),
    onSuccess: ({ member }) => {
      setOpen(false);
      if (member.status === "rejected") toast.success(t("done", { name, gym: gymName }));
      else toast.error(problemText({ kind: "decided", status: member.status }));
      void refresh.now();
    },
    onError: refresh.later,
  });
  const pending = reject.isPending;
  const problem = reject.isError ? memberProblem(reject.error) : null;
  const close = () => {
    setOpen(false);
    reject.reset();
    refresh.onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="destructive-subtle"
          aria-label={labels("rejectLabel", { name })}
          disabled={busy}
          data-member-reject={request.gym_member_id}
        >
          {labels("reject")}
        </Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name, gym: gymName })}</DialogTitle>
          <DialogDescription>{t("body", { name, gym: gymName })}</DialogDescription>
        </DialogHeader>
        {problem && (
          <Notice tone={isFailure(problem) ? "coral" : "amber"} role="alert">
            {problemText(problem)}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={close}>
            {t("keep")}
          </Button>
          <Button
            variant="destructive"
            aria-busy={pending}
            disabled={pending}
            onClick={() => reject.mutate()}
          >
            {pending && <Spinner />}
            {pending ? t("pending") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
