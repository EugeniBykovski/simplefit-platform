"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { callWithSession } from "@/entities/session";
import {
  getGetMyCoachDataRulesQueryKey,
  getListMyCoachInvitationsQueryKey,
  getMyCoachDataRules,
  listMyCoachInvitations,
} from "@/shared/api/generated/endpoints/coaching/coaching";
import type {
  CoachDataRulesResponseDataRules,
  CoachInvitation as Invitation,
  CoachInvitationStatus,
} from "@/shared/api/generated/model";

/**
 * A coach's invitation as the backend shows it to its coach (SF-57): the
 * recipient address masked, the backend's status (`expired` derived by the
 * backend from its expiry), the resends left. Never a token. An invitation is
 * not a relationship: an accepted one shows up in the roster once the backend
 * reports the relationship.
 */
export type CoachInvitation = Invitation;
export type InvitationStatus = CoachInvitationStatus;
export type CoachDataRules = CoachDataRulesResponseDataRules;

const PAGE_SIZE = 50;

/** The key of the coach's invitation list, paged by cursor. */
export const coachInvitationsKey = [...getListMyCoachInvitationsQueryKey(), "pages"] as const;
export const coachDataRulesKey = getGetMyCoachDataRulesQueryKey();

/** The coach's invitations, newest first, one cursor page at a time. */
export function useCoachInvitations({ enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: coachInvitationsKey,
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listMyCoachInvitations(
          { limit: PAGE_SIZE, ...(pageParam === null ? {} : { cursor: pageParam }) },
          { ...init, signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * The coach data-rules version, the coach's acknowledgement (SF-57) and the
 * approved text in the page language (`document`, SF-72: no text when that
 * language has no approved variant, never another language instead).
 * Inviting needs a published version that the coach acknowledged.
 */
export function useCoachDataRules({ enabled = true }: { enabled?: boolean } = {}) {
  const language = useLocale();
  return useQuery({
    queryKey: getGetMyCoachDataRulesQueryKey({ language }),
    queryFn: ({ signal }) =>
      callWithSession((init) => getMyCoachDataRules({ language }, { ...init, signal })).then(
        (response) => response.data_rules,
      ),
    enabled,
    staleTime: 0,
  });
}

/**
 * Whether the API runs in LOCAL DEVELOPMENT coaching mode (simplefit-api
 * ADR 0025): no legal documents exist, so there is nothing to show,
 * acknowledge or tick. The backend decides; production never says so.
 */
export function isLocalDevelopment(rules: CoachDataRules | undefined): boolean {
  return rules?.legal_mode === "local_development";
}

/** Whether the coach may invite now as far as the data rules go. */
export function dataRulesAllowInviting(rules: CoachDataRules | undefined): boolean {
  if (isLocalDevelopment(rules)) return true;
  return rules?.document_version != null && rules.acknowledged_at != null;
}
