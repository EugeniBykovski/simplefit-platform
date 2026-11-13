"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { usePartnershipActions, type PartnershipProposal } from "@/entities/sponsor-partnership";
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

import { keepKey, outcomeOf, type Outcome } from "../model/outcome";
import { OutcomeNotice } from "./form-parts";

/**
 * Submit and withdraw for one request (SF-130 `POST …/submit`, `…/withdraw`),
 * offered only where the backend's `allowed_actions` says so; the API checks
 * again. Each attempt carries one `client_request_id`, kept across a retry of
 * an unconfirmed answer so a repeat gets the same result. Submit is disabled
 * while the backend reports `missing_fields`; withdrawal is final and asks
 * first. A refused or unconfirmed command says so and claims nothing.
 */
export function ProposalCommands({
  sponsorId,
  proposal,
  onReload,
}: {
  sponsorId: string;
  proposal: PartnershipProposal;
  onReload: () => void;
}) {
  const t = useTranslations("sponsorPartnerships.commands");
  const actions = usePartnershipActions(sponsorId);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<"submit" | "withdraw" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const submitKey = useRef<string | null>(null);
  const withdrawKey = useRef<string | null>(null);
  const allowed = proposal.allowed_actions;
  const incomplete = proposal.missing_fields.length > 0;

  if (!allowed.submit && !allowed.withdraw) return null;

  const run = async (command: "submit" | "withdraw", key: React.RefObject<string | null>) => {
    setBusy(command);
    setOutcome(null);
    key.current ??= crypto.randomUUID();
    try {
      await (command === "submit"
        ? actions.submit(proposal, key.current)
        : actions.withdraw(proposal, key.current));
      key.current = null;
      setConfirming(false);
    } catch (failure) {
      const next = outcomeOf(failure);
      if (!keepKey(next)) key.current = null;
      setOutcome(next);
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-proposal-commands>
      {outcome !== null && <OutcomeNotice outcome={outcome} />}
      <div className="flex flex-wrap gap-2">
        {allowed.submit && (
          <Button
            type="button"
            disabled={busy !== null || incomplete}
            aria-describedby={incomplete ? "proposal-missing" : undefined}
            onClick={() => void run("submit", submitKey)}
          >
            {busy === "submit"
              ? t("submitting")
              : proposal.status === "changes_requested"
                ? t("resubmit")
                : t("submit")}
          </Button>
        )}
        <Dialog open={confirming} onOpenChange={(open) => busy === null && setConfirming(open)}>
          {allowed.withdraw && (
            // The trigger, so closing the dialog returns focus to it.
            <DialogTrigger asChild>
              <Button type="button" variant="quiet" disabled={busy !== null}>
                {t("withdraw")}
              </Button>
            </DialogTrigger>
          )}
          <DialogContent closeLabel={t("close")} className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("withdrawTitle")}</DialogTitle>
              <DialogDescription>{t("withdrawBody")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="quiet"
                disabled={busy !== null}
                onClick={() => setConfirming(false)}
              >
                {t("keep")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => void run("withdraw", withdrawKey)}
              >
                {busy === "withdraw" ? t("withdrawing") : t("withdrawConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {outcome !== null &&
          ["stale", "moved", "conflict", "unconfirmed"].includes(outcome.kind) && (
            <Button type="button" variant="quiet" onClick={onReload}>
              {t("reload")}
            </Button>
          )}
      </div>
    </div>
  );
}
