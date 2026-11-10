"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { GuidedTour, type TourCopy, type TourStep } from "@/features/product-tour";

import { SPONSOR_TOUR_STEPS, SPONSOR_TOUR_TARGETS, type SponsorTourStepId } from "../model/tour";

const STEPS: readonly TourStep<SponsorTourStepId>[] = SPONSOR_TOUR_STEPS.map((step) => ({
  id: step.id,
  selector: SPONSOR_TOUR_TARGETS[step.target],
  placement: step.placement,
  spot: step.spot,
}));

/**
 * SRW2, the partner portal tour (SF-119; Claude Design `FirstRunSponsorTour`, MVP):
 * six coach marks on real portal elements, then the done card, rendered by the shared
 * `GuidedTour` (SF-120). This wrapper only supplies the sponsor steps and copy; the
 * Organization step names contacts only for members who can view them.
 */
export function SponsorTour({
  viewsContacts,
  ...props
}: {
  open: boolean;
  viewsContacts: boolean;
  onComplete: () => Promise<unknown>;
  onDismiss: () => Promise<unknown>;
  onClose: () => void;
  onClosed: () => void;
}) {
  const t = useTranslations("sponsorPortal.firstRun.tour");
  const copy = useMemo<TourCopy<SponsorTourStepId>>(
    () => ({
      step: (id) => ({
        title: t(`steps.${id}.title`),
        body:
          id === "organization" && viewsContacts
            ? t("steps.organization.bodyContacts")
            : t(`steps.${id}.body`),
      }),
      progress: (step, total) => t("step", { step, total }),
      complete: t("complete"),
      done: { title: t("steps.done.title"), body: t("steps.done.body") },
      confirm: {
        label: t("confirm.label"),
        title: t("confirm.title"),
        body: t("confirm.body"),
        keep: t("confirm.keep"),
        end: t("confirm.end"),
      },
      finishing: {
        title: t("finishing.title"),
        body: t("finishing.body"),
        button: t("finishing.button"),
      },
      finishFailed: { title: t("finishFailed.title"), body: t("finishFailed.body") },
      failed: t("failed"),
      end: t("end"),
      back: t("back"),
      next: t("next"),
      finish: t("finish"),
      close: t("close"),
      tryAgain: t("tryAgain"),
    }),
    [t, viewsContacts],
  );
  return <GuidedTour steps={STEPS} copy={copy} {...props} />;
}
