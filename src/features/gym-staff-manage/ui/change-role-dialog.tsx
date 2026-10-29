"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { AssignableRole, GymStaffMember } from "@/entities/gym-staff";
import { callWithSession } from "@/entities/session";
import { changeGymStaffRole } from "@/shared/api/generated/endpoints/gym-staff/gym-staff";
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
import { RoleChoice } from "./role-choice";

/**
 * "Change role" for one active member (SF-93 `changeGymStaffRole`), with
 * the roles the viewer's permission projection allows instead of the
 * current one. Nothing changes on screen until the backend answers; then
 * the roster (and the viewer's own gym, whose permissions may have changed)
 * is read again. A refusal (`403`, the member gone, the owner's row) is
 * said in the dialog and the page is refreshed.
 */
export function ChangeRoleDialog({
  gymId,
  gymName,
  member,
  targets,
}: {
  gymId: string;
  gymName: string;
  member: GymStaffMember;
  targets: readonly AssignableRole[];
}) {
  const t = useTranslations("gymConsole.staff.roleChange");
  const roleName = useTranslations("gymConsole.switcher.roles");
  const refresh = useDialogRefresh(gymId);
  const problemText = useProblemText();
  const legend = useId();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AssignableRole | undefined>(undefined);
  const name = member.name ?? t("someone");

  const change = useMutation({
    mutationFn: (next: AssignableRole) =>
      callWithSession((init) =>
        changeGymStaffRole(gymId, member.staff_membership_id, { role: next }, init),
      ),
    onSuccess: ({ staff_member }) => {
      setOpen(false);
      toast.success(t("done", { name, role: roleName(staff_member.role) }));
      void refresh.now();
    },
    onError: refresh.later,
  });
  const pending = change.isPending;
  const close = () => {
    setOpen(false);
    change.reset();
    setRole(undefined);
    refresh.onClose();
  };
  const problem = change.isError ? staffProblem(change.error) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          change.reset();
          setRole(undefined);
          refresh.onClose();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="quiet" size="sm" data-staff-change-role>
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("close")} className="sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (role !== undefined) change.mutate(role);
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("title", { name })}</DialogTitle>
            <DialogDescription>
              {t("lead", { name, gym: gymName, role: roleName(member.role) })}
            </DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend id={legend} className="pb-1 type-label text-muted-foreground">
              {t("label")}
            </legend>
            <RoleChoice
              roles={targets}
              value={role}
              onChange={setRole}
              disabled={pending}
              labelledBy={legend}
            />
          </fieldset>
          {problem && (
            <Notice
              tone={problem.kind === "failed" || problem.kind === "unknown" ? "coral" : "amber"}
              role="alert"
            >
              {problemText(problem)}
            </Notice>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              {t("cancel")}
            </Button>
            <Button type="submit" aria-busy={pending} disabled={pending || role === undefined}>
              {pending && <Spinner />}
              {pending ? t("pending") : t("confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
