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

import { useEndMyCoach, type EndOutcome } from "../model/end-relationship";

/**
 * "End relationship" and its confirmation (WFC1, Claude Design
 * 1792151007-1d70). The relationship ends only when the fighter confirms and
 * the backend has answered; while it runs the dialog cannot be dismissed or
 * confirmed twice. A failure keeps the dialog open and changes nothing.
 */
export function EndRelationshipDialog({
  relationshipId,
  coachName,
  onDone,
}: {
  relationshipId: string;
  coachName: string;
  onDone: (outcome: EndOutcome) => void;
}) {
  const t = useTranslations("fighterCoaches.end");
  const [open, setOpen] = useState(false);
  const end = useEndMyCoach();
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
        <Button size="sm" variant="destructive-subtle">
          {t("action")}
        </Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name: coachName })}</DialogTitle>
          <DialogDescription>{t("body", { name: coachName })}</DialogDescription>
        </DialogHeader>
        {end.isError && (
          <Notice tone="coral" role="alert">
            {t("failed")}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            {t("keep")}
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
            {pending ? t("pending") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
