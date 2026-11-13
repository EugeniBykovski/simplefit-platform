import { SponsorPartnershipProposalStatus } from "@/shared/api/generated/model";

const STATUSES: readonly string[] = Object.values(SponsorPartnershipProposalStatus);

/**
 * `?status=` of the request list: a status the API documents, else all (never a
 * guessed one). Plain module: the server page reads it from the URL.
 */
export function requestFilter(
  value: string | string[] | undefined,
): SponsorPartnershipProposalStatus | undefined {
  return typeof value === "string" && STATUSES.includes(value)
    ? (value as SponsorPartnershipProposalStatus)
    : undefined;
}
