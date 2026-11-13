"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/shared/ui/badge";

import { isKnownStatus, type ProposalStatus } from "../model/sponsor-partnership";

const VARIANT = {
  draft: "neutral",
  submitted: "info",
  under_review: "info",
  changes_requested: "warning",
  accepted: "success",
  declined: "outline",
  withdrawn: "outline",
} as const satisfies Record<ProposalStatus, string>;

/** The words for a request status; a status this client doesn't know is said to be unknown. */
export function useProposalStatusLabel() {
  const t = useTranslations("sponsorPartnerships.statuses");
  return (status: string) => (isKnownStatus(status) ? t(status) : t("unknown"));
}

/**
 * A request's backend status as a badge (text, never colour alone). An unknown
 * status is shown as unknown: never mapped to accepted or declined.
 */
export function ProposalStatusBadge({ status }: { status: string }) {
  const label = useProposalStatusLabel();
  return (
    <Badge
      variant={isKnownStatus(status) ? VARIANT[status] : "outline"}
      data-proposal-status={status}
    >
      {label(status)}
    </Badge>
  );
}
