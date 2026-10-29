"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { GymStaffMember } from "@/entities/gym-staff";
import { callWithSession } from "@/entities/session";
import { endGymStaffMembership } from "@/shared/api/generated/endpoints/gym-staff/gym-staff";
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

import { useDialogRefresh } from "../model/refresh";
import { staffProblem } from "../model/staff-problem";
import { useProblemText } from "./problem-text";

/**
 * "Remove from team" for another member, or "Leave this gym" for the
 * viewer's own membership (SF-93 `endGymStaffMembership`). Always asked
 * first, naming the person and the gym, and saying exactly what happens:
 * access to this gym ends at once; the person's SimpleFit account and any
 * other gym are not touched. Nothing changes on screen until the backend
 * answers. After leaving, the gym is read again and the console shows that
 * it is no longer available.
 */
export function EndMembershipDialog({
  gymId,
  gymName,
  member,
}: {
  gymId: string;
  gymName: string;
  member: GymStaffMember;
}) {
  const own = member.is_viewer;
  const t = useTranslations(own ? "gymConsole.staff.leave" : "gymConsole.staff.remove");
  const refresh = useDialogRefresh(gymId);
  const problemText = useProblemText();
  const [open, setOpen] = useState(false);
  const name = member.name ?? t("someone");

  const end = useMutation({
    mutationFn: () =>
      callWithSession((init) => endGymStaffMembership(gymId, member.staff_membership_id, init)),
    onSuccess: () => {
      setOpen(false);
      toast.success(t("done", { name, gym: gymName }));
      void refresh.now();
    },
    onError: refresh.later,
  });
  const pending = end.isPending;
  const problem = end.isError ? staffProblem(end.error) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          end.reset();
          refresh.onClose();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive-subtle" size="sm" data-staff-end={own ? "leave" : "remove"}>
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name, gym: gymName })}</DialogTitle>
          <DialogDescription>{t("body", { name, gym: gymName })}</DialogDescription>
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
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              end.reset();
              refresh.onClose();
            }}
          >
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
