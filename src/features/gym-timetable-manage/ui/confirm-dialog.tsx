"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

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
import { Spinner } from "@/shared/ui/spinner";

import { useDialogRefresh } from "../model/refresh";
import { timetableProblem, type TimetableProblem } from "../model/timetable-problem";
import { ProblemNotice } from "./problem-text";

/**
 * A destructive timetable action, always asked first (an alert dialog that
 * names what it affects). Nothing changes on screen until the backend
 * answers; a refusal stays in the dialog, and `onProblem` may read the
 * latest record so the next confirmation is about what is there now (never
 * a silent retry). `ready` holds the action back until a stronger
 * confirmation is given (a series).
 */
export function ConfirmDialog({
  gymId,
  trigger,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  keepLabel,
  run,
  onDone,
  onProblem,
  ready = true,
  marker,
}: {
  gymId: string;
  trigger: ReactNode;
  title: string;
  description: string;
  children?: (state: { problem: TimetableProblem | null; pending: boolean }) => ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  keepLabel: string;
  run: () => Promise<unknown>;
  onDone: () => void;
  onProblem?: (problem: TimetableProblem) => Promise<void> | void;
  ready?: boolean;
  /** `data-*` attribute naming the dialog for tests. */
  marker: Record<string, string>;
}) {
  const t = useTranslations("gymConsole.timetable");
  const [open, setOpen] = useState(false);
  const refresh = useDialogRefresh(gymId);
  const action = useMutation({
    mutationFn: run,
    onSuccess: () => {
      setOpen(false);
      onDone();
      void refresh.now();
    },
    onError: async (error) => {
      refresh.later();
      await onProblem?.(timetableProblem(error));
    },
  });
  const pending = action.isPending;
  const problem = action.isError ? timetableProblem(action.error) : null;
  const close = () => {
    setOpen(false);
    action.reset();
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md" {...marker}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children?.({ problem, pending })}
        {problem && <ProblemNotice problem={problem} />}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={close}>
            {keepLabel}
          </Button>
          <Button
            variant="destructive"
            aria-busy={pending || undefined}
            disabled={pending || !ready}
            onClick={() => action.mutate()}
            data-confirm
          >
            {pending && <Spinner />}
            {pending ? pendingLabel : problem?.kind === "stale" ? t("confirmAgain") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
