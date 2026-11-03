"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import type { GymSaasSubscription } from "@/entities/gym-billing";
import type { SubscriptionCancelRequestMode } from "@/shared/api/generated/model";
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
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { Spinner } from "@/shared/ui/spinner";

import { billingProblem } from "../model/billing-problem";
import { useCancelPlan } from "../model/use-billing-actions";

import { BillingProblemNotice } from "./problem-text";

/**
 * Cancels the gym's SimpleFit plan (`cancelGymSaasSubscription`). An active
 * plan ends at the end of its paid period (default) or now; a pending
 * request is withdrawn at once. The backend cancels at Stripe first and
 * answers 503 if Stripe cannot confirm (nothing changes). Cancelling never
 * implies a refund. The dialog closes only on the backend's answer.
 */
export function CancelPlanDialog({
  gymId,
  subscription,
}: {
  gymId: string;
  subscription: GymSaasSubscription;
}) {
  const t = useTranslations("gymBilling.cancel");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const pendingIntent = subscription.status === "pending_activation";
  const [mode, setMode] = useState<SubscriptionCancelRequestMode>(
    pendingIntent ? "immediate" : "period_end",
  );
  const cancel = useCancelPlan(gymId);
  const busy = cancel.isPending;
  const problem = cancel.isError ? billingProblem(cancel.error) : null;
  const periodEnd = subscription.current_period_end;

  const close = () => {
    setOpen(false);
    cancel.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-billing-cancel>
          {pendingIntent ? t("withdraw") : t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pendingIntent ? t("withdrawTitle") : t("title")}</DialogTitle>
          <DialogDescription>{pendingIntent ? t("withdrawBody") : t("body")}</DialogDescription>
        </DialogHeader>
        {!pendingIntent && (
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as SubscriptionCancelRequestMode)}
            aria-label={t("modeLabel")}
            className="gap-3"
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="period_end" id="cancel-period-end" className="mt-0.5" />
              <Label htmlFor="cancel-period-end" className="flex flex-col items-start gap-0.5">
                <span>
                  {periodEnd
                    ? t("periodEnd", { date: format.dateTime(new Date(periodEnd), "date") })
                    : t("periodEndUnknown")}
                </span>
                <span className="type-caption text-muted-foreground">{t("periodEndHint")}</span>
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="immediate" id="cancel-immediate" className="mt-0.5" />
              <Label htmlFor="cancel-immediate" className="flex flex-col items-start gap-0.5">
                <span>{t("immediate")}</span>
                <span className="type-caption text-muted-foreground">{t("immediateHint")}</span>
              </Label>
            </div>
          </RadioGroup>
        )}
        {problem && <BillingProblemNotice problem={problem} />}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            {t("keep")}
          </Button>
          <Button
            variant="destructive"
            aria-busy={busy}
            disabled={busy}
            data-billing-cancel-confirm
            onClick={() =>
              cancel.mutate(
                { subscriptionId: subscription.subscription_id, mode },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            {busy && <Spinner />}
            {busy ? t("pending") : pendingIntent ? t("withdrawConfirm") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
