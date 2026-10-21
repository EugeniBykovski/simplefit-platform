"use client";

import { CheckIcon } from "lucide-react";
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

import { useCompleteTrainingSession, type CompleteOutcome } from "../model/complete-session";

/**
 * "Mark as completed" and its confirmation (WFT2 dialog=confirm|pending|
 * failed, Claude Design 1792573853-9116). The fighter's explicit action: one
 * request, only after they confirm, never on a timer. While it runs the
 * dialog cannot be dismissed or confirmed twice. Without an answer it says
 * the session may already be saved and stays open: trying again is safe,
 * the backend completes a session once. Any backend answer closes it and is
 * passed on.
 */
export function CompleteSessionDialog({
  sessionId,
  coachName,
  onDone,
}: {
  sessionId: string;
  /** The coach's disclosed name, or `null` when there is none to show. */
  coachName: string | null;
  onDone: (outcome: CompleteOutcome) => void;
}) {
  const t = useTranslations("fighterTraining.complete");
  const [open, setOpen] = useState(false);
  const complete = useCompleteTrainingSession(sessionId);
  const pending = complete.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) complete.reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <CheckIcon aria-hidden />
          {t("action")}
        </Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {coachName === null ? t("bodyUnnamed") : t("body", { name: coachName })}
          </DialogDescription>
        </DialogHeader>
        {complete.isError && (
          <Notice tone="coral" role="alert">
            {t("failed")}
          </Notice>
        )}
        <DialogFooter>
          <Button
            variant="quiet"
            disabled={pending}
            onClick={() => {
              complete.reset();
              setOpen(false);
            }}
          >
            {t("keep")}
          </Button>
          <Button
            aria-busy={pending}
            disabled={pending}
            onClick={() =>
              complete.mutate(undefined, {
                onSuccess: (outcome) => {
                  setOpen(false);
                  onDone(outcome);
                },
              })
            }
          >
            {pending && <Spinner />}
            {pending ? t("pending") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
