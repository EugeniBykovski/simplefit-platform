"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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

import { useCancelTrainingSession, type CancelOutcome } from "../model/cancel-session";

/**
 * "Cancel session" and its confirmation (WCT2, Claude Design
 * 1792490047-d551). The session is cancelled only when the coach confirms
 * and the backend has answered; while it runs the dialog cannot be
 * dismissed or confirmed twice. A failure keeps the dialog open with the
 * reason; any backend answer closes it and is passed on.
 */
export function CancelSessionDialog({
  sessionId,
  fighter,
  onDone,
}: {
  sessionId: string;
  /** The fighter's name, when the relationship discloses it. */
  fighter: string | null;
  onDone: (outcome: CancelOutcome) => void;
}) {
  const t = useTranslations("coachSessions");
  const [open, setOpen] = useState(false);
  const cancel = useCancelTrainingSession(sessionId);
  const pending = cancel.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) cancel.reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive-subtle">{t("detail.cancel")}</Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cancelDialog.title")}</DialogTitle>
          <DialogDescription>
            {fighter === null
              ? t("cancelDialog.bodyUnnamed")
              : t("cancelDialog.body", { name: fighter })}
          </DialogDescription>
        </DialogHeader>
        {cancel.isError && (
          <Notice tone="coral" role="alert">
            {t("cancelDialog.failed")}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="quiet" disabled={pending} onClick={() => setOpen(false)}>
            {t("cancelDialog.keep")}
          </Button>
          <Button
            variant="destructive-subtle"
            aria-busy={pending}
            disabled={pending}
            onClick={() =>
              cancel.mutate(undefined, {
                onSuccess: (outcome) => {
                  setOpen(false);
                  onDone(outcome);
                },
              })
            }
          >
            {pending && <Spinner />}
            {pending ? t("cancelDialog.pending") : t("cancelDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
