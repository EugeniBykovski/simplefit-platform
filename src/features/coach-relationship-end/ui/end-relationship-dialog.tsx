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

import { useEndCoachRelationship, type EndOutcome } from "../model/end-relationship";

/**
 * "End relationship" and its confirmation (WC4, Claude Design
 * 1792056621-3707). The relationship ends only when the coach confirms and
 * the backend has answered; while it runs the dialog cannot be dismissed or
 * submitted twice. A failure keeps the dialog open with the reason; either
 * backend answer (ended, or no longer available) closes it and is passed on.
 */
export function EndRelationshipDialog({
  relationshipId,
  name,
  onDone,
}: {
  relationshipId: string;
  name: string;
  onDone: (outcome: EndOutcome) => void;
}) {
  const t = useTranslations("coachFighters");
  const [open, setOpen] = useState(false);
  const end = useEndCoachRelationship();
  const pending = end.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) end.reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive-subtle">{t("detail.end")}</Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("endDialog.title", { name })}</DialogTitle>
          <DialogDescription>{t("endDialog.body", { name })}</DialogDescription>
        </DialogHeader>
        {end.isError && (
          <Notice tone="coral" role="alert">
            {t("endDialog.failed")}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            {t("endDialog.keep")}
          </Button>
          <Button
            variant="destructive-subtle"
            aria-busy={pending}
            disabled={pending}
            onClick={() =>
              end.mutate(relationshipId, {
                onSuccess: (outcome) => {
                  setOpen(false);
                  onDone(outcome);
                },
              })
            }
          >
            {pending && <Spinner />}
            {pending ? t("endDialog.pending") : t("endDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
