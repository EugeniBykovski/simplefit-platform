import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { callWithSession } from "@/entities/session";
import {
  createSponsorPartnershipProposal,
  getGetSponsorPartnershipPolicyQueryKey,
  getGetSponsorPartnershipPreferencesQueryKey,
  getGetSponsorPartnershipProposalQueryKey,
  getListSponsorPartnershipOpportunitiesQueryKey,
  getListSponsorPartnershipProposalsQueryKey,
  getSponsorPartnershipPolicy,
  getSponsorPartnershipPreferences,
  getSponsorPartnershipProposal,
  listSponsorPartnershipOpportunities,
  listSponsorPartnershipProposals,
  submitSponsorPartnershipProposal,
  updateSponsorPartnershipPreferences,
  updateSponsorPartnershipProposal,
  withdrawSponsorPartnershipProposal,
} from "@/shared/api/generated/endpoints/sponsors/sponsors";
import type {
  CreateSponsorPartnershipProposalRequest,
  SponsorPartnershipOpportunitiesResponse,
  SponsorPartnershipPolicyResponsePolicy,
  SponsorPartnershipPreferencesResponse,
  SponsorPartnershipProposal,
  SponsorPartnershipProposalListResponse,
  SponsorPartnershipProposalStatus,
  SponsorPartnershipProposalSummary,
  UpdateSponsorPartnershipPreferencesRequest,
  UpdateSponsorPartnershipProposalRequest,
} from "@/shared/api/generated/model";

/**
 * A sponsor organization's partnership data (SF-130 API, SF-131 web): its
 * preferences, the opportunities answer and its nonbinding partnership
 * requests ("proposals" in the API). Every key names the organization, so one
 * organization's data can never be read from, or land in, another's cache.
 * The backend owns every rule: who may write, which status allows what, the
 * lifecycle and its transitions. The client only shows its answers and sends
 * the revision it read, so an older copy answers `409` instead of overwriting.
 */
export type PartnershipPolicy = SponsorPartnershipPolicyResponsePolicy;
export type PartnershipPreferencesView = SponsorPartnershipPreferencesResponse;
export type PartnershipOpportunities = SponsorPartnershipOpportunitiesResponse;
export type PartnershipProposal = SponsorPartnershipProposal;
export type PartnershipProposalSummary = SponsorPartnershipProposalSummary;
export type ProposalStatus = SponsorPartnershipProposalStatus;
export type PreferencesPatch = Omit<
  UpdateSponsorPartnershipPreferencesRequest,
  "expected_revision"
>;
export type ProposalAnswersPatch = Omit<
  UpdateSponsorPartnershipProposalRequest,
  "expected_revision"
>;
export type ProposalDraftInput = Omit<CreateSponsorPartnershipProposalRequest, "client_request_id">;

/** Statuses the API documents today; anything else is shown as unknown, never guessed. */
export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "accepted",
  "declined",
  "withdrawn",
];

export const isKnownStatus = (status: string): status is ProposalStatus =>
  (PROPOSAL_STATUSES as readonly string[]).includes(status);

/** A page of requests (the API allows 1..100). */
const PROPOSALS_PAGE = 20;

/** `GET /api/v1/sponsor-partnership-policy`: vocabularies, requiredness, the open limit. */
export function usePartnershipPolicy() {
  return useQuery({
    queryKey: getGetSponsorPartnershipPolicyQueryKey(),
    queryFn: async ({ signal }) =>
      (await callWithSession((init) => getSponsorPartnershipPolicy({ ...init, signal }))).policy,
    staleTime: 5 * 60_000,
  });
}

export const preferencesQueryKey = (sponsorId: string) =>
  getGetSponsorPartnershipPreferencesQueryKey(sponsorId);

/** `GET …/partnership-preferences`: current preferences beside the application's submitted answers. */
export function usePartnershipPreferences(sponsorId: string) {
  return useQuery({
    queryKey: preferencesQueryKey(sponsorId),
    queryFn: ({ signal }) =>
      callWithSession((init) => getSponsorPartnershipPreferences(sponsorId, { ...init, signal })),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** `GET …/partnership-opportunities`: the backend's availability answer (no inventory exists, D-SA21). */
export function usePartnershipOpportunities(sponsorId: string) {
  return useQuery({
    queryKey: getListSponsorPartnershipOpportunitiesQueryKey(sponsorId),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        listSponsorPartnershipOpportunities(sponsorId, { ...init, signal }),
      ),
    staleTime: 0,
  });
}

/** The prefix of every request list of one organization (all filters). */
const proposalListsKey = (sponsorId: string) =>
  getListSponsorPartnershipProposalsQueryKey(sponsorId).slice(0, 1);

/**
 * The organization's requests, newest first, page by page; `status` filters
 * by one backend status. `can_create` comes with every page.
 */
export function usePartnershipProposals(sponsorId: string, status: ProposalStatus | undefined) {
  const params = status === undefined ? {} : { status };
  return useInfiniteQuery({
    queryKey: [...getListSponsorPartnershipProposalsQueryKey(sponsorId, params), "pages"],
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listSponsorPartnershipProposals(
          sponsorId,
          {
            ...params,
            limit: PROPOSALS_PAGE,
            ...(pageParam === null ? {} : { cursor: pageParam }),
          },
          { ...init, signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: SponsorPartnershipProposalListResponse) => last.next_cursor,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export const proposalQueryKey = (sponsorId: string, proposalId: string) =>
  getGetSponsorPartnershipProposalQueryKey(sponsorId, proposalId);

/** `GET …/partnership-proposals/{id}`: one request of this organization (404 for any other). */
export function usePartnershipProposal(sponsorId: string, proposalId: string) {
  return useQuery({
    queryKey: proposalQueryKey(sponsorId, proposalId),
    queryFn: async ({ signal }) =>
      (
        await callWithSession((init) =>
          getSponsorPartnershipProposal(sponsorId, proposalId, { ...init, signal }),
        )
      ).proposal,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * The writes of one organization. Each answer replaces the cached request (or
 * preferences) it returns and drops that organization's request lists, which
 * re-read. Creation, submission and withdrawal carry the caller's
 * `client_request_id`: a retry with the same key after a lost answer gets the
 * same result instead of a second one.
 */
export function usePartnershipActions(sponsorId: string) {
  const client = useQueryClient();

  const settle = useCallback(
    (proposal: SponsorPartnershipProposal) => {
      client.setQueryData(proposalQueryKey(sponsorId, proposal.proposal_id), proposal);
      void client.invalidateQueries({ queryKey: proposalListsKey(sponsorId) });
      return proposal;
    },
    [client, sponsorId],
  );

  /** `PATCH …/partnership-preferences` at `revision` (`0` creates them); only the sent fields change. */
  const savePreferences = useCallback(
    async (revision: number, patch: PreferencesPatch) => {
      const view = await callWithSession((init) =>
        updateSponsorPartnershipPreferences(
          sponsorId,
          { ...patch, expected_revision: revision },
          init,
        ),
      );
      client.setQueryData(preferencesQueryKey(sponsorId), view);
      return view;
    },
    [client, sponsorId],
  );

  /** `POST …/partnership-proposals`: a draft; the same key and answers answer the same draft. */
  const create = useCallback(
    async (clientRequestId: string, input: ProposalDraftInput) =>
      settle(
        (
          await callWithSession((init) =>
            createSponsorPartnershipProposal(
              sponsorId,
              { ...input, client_request_id: clientRequestId },
              init,
            ),
          )
        ).proposal,
      ),
    [settle, sponsorId],
  );

  /** `PATCH …/partnership-proposals/{id}` at the revision read. */
  const update = useCallback(
    async (base: SponsorPartnershipProposal, patch: ProposalAnswersPatch) =>
      settle(
        (
          await callWithSession((init) =>
            updateSponsorPartnershipProposal(
              sponsorId,
              base.proposal_id,
              { ...patch, expected_revision: base.revision },
              init,
            ),
          )
        ).proposal,
      ),
    [settle, sponsorId],
  );

  /** `POST …/submit` at the revision read, idempotent per key. */
  const submit = useCallback(
    async (base: SponsorPartnershipProposal, clientRequestId: string) =>
      settle(
        (
          await callWithSession((init) =>
            submitSponsorPartnershipProposal(
              sponsorId,
              base.proposal_id,
              { expected_revision: base.revision, client_request_id: clientRequestId },
              init,
            ),
          )
        ).proposal,
      ),
    [settle, sponsorId],
  );

  /** `POST …/withdraw` at the revision read, idempotent per key. Final. */
  const withdraw = useCallback(
    async (base: SponsorPartnershipProposal, clientRequestId: string) =>
      settle(
        (
          await callWithSession((init) =>
            withdrawSponsorPartnershipProposal(
              sponsorId,
              base.proposal_id,
              { expected_revision: base.revision, client_request_id: clientRequestId },
              init,
            ),
          )
        ).proposal,
      ),
    [settle, sponsorId],
  );

  /** Reads the request again (after a stale or conflicting write). */
  const refresh = useCallback(
    (proposalId: string) =>
      client.invalidateQueries({ queryKey: proposalQueryKey(sponsorId, proposalId) }),
    [client, sponsorId],
  );

  return { savePreferences, create, update, submit, withdraw, refresh };
}
