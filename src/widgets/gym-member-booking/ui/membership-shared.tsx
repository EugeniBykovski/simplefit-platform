"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState, type ReactNode } from "react";

import type { MembershipProblem } from "@/features/gym-membership-manage";
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

/** The sentence for a refused or unconfirmed membership action. */
export function useMembershipProblemText() {
  const t = useTranslations("gymMembership.problems");
  return useCallback(
    (problem: MembershipProblem) => {
      if (problem.kind !== "limited") return t(problem.kind);
      return problem.minutes === null
        ? t("limitedLater")
        : t("limited", { minutes: problem.minutes });
    },
    [t],
  );
}

/**
 * A membership action that is always asked first. Nothing changes until the
 * backend answers; a refusal stays in the dialog, so the person sees why.
 */
export function ConfirmAction({
  title,
  body,
  keep,
  confirm,
  pendingLabel,
  trigger,
  isPending,
  problem,
  marker,
  onConfirm,
  onOpen,
}: {
  title: string;
  body: string;
  keep: string;
  confirm: string;
  pendingLabel: string;
  trigger: ReactNode;
  isPending: boolean;
  problem: string | null;
  marker: string;
  onConfirm: (close: () => void) => void;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (next) onOpen?.();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="sm:max-w-md"
        data-membership-dialog={marker}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {problem !== null && (
          <Notice tone="coral" role="alert">
            {problem}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            {keep}
          </Button>
          <Button
            variant="destructive"
            aria-busy={isPending || undefined}
            disabled={isPending}
            onClick={() => onConfirm(() => setOpen(false))}
          >
            {isPending && <Spinner />}
            {isPending ? pendingLabel : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
