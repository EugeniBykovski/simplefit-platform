"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { GymMember } from "@/entities/gym-member";
import { callWithSession } from "@/entities/session";
import { removeGymMember } from "@/shared/api/generated/endpoints/gym-members/gym-members";
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
import { useDialogRefresh } from "../model/refresh";
import { useProblemText } from "./problem-text";

/**
 * "End membership" for an active member (SF-95 `removeGymMember`, owner and
 * managers). Always asked first, naming the person and the gym, and saying
 * exactly what happens: their participation in this gym ends (the row stays
 * as history); their SimpleFit account, profiles, coaches and other gyms are
 * not touched. Nothing changes on screen until the backend answers. This is
 * the gym's decision; a member leaving on their own is a different action
 * that only they can take.
 */
export function RemoveMemberDialog({
  gymId,
  gymName,
  member,
}: {
  gymId: string;
  gymName: string;
  member: GymMember;
}) {
  const t = useTranslations("gymConsole.members.remove");
  const refresh = useDialogRefresh(gymId);
  const problemText = useProblemText();
  const [open, setOpen] = useState(false);
  const name = member.name ?? t("someone");

  const end = useMutation({
    mutationFn: () => callWithSession((init) => removeGymMember(gymId, member.gym_member_id, init)),
    onSuccess: ({ member: ended }) => {
      setOpen(false);
      if (ended.status === "ended") toast.success(t("done", { name, gym: gymName }));
      else toast.error(problemText({ kind: "decided", status: ended.status }));
      void refresh.now();
    },
    onError: refresh.later,
  });
  const pending = end.isPending;
  const problem = end.isError ? memberProblem(end.error) : null;
  const close = () => {
    setOpen(false);
    end.reset();
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
        <Button variant="destructive-subtle" size="sm" data-member-remove={member.gym_member_id}>
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name, gym: gymName })}</DialogTitle>
          <DialogDescription>{t("body", { name, gym: gymName })}</DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-muted-foreground">
          <li>{t("keeps.account")}</li>
          <li>{t("keeps.profiles")}</li>
          <li>{t("keeps.coaches")}</li>
          <li>{t("keeps.gyms")}</li>
        </ul>
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
            onClick={() => end.mutate()}
          >
            {pending && <Spinner />}
            {pending ? t("pending") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
