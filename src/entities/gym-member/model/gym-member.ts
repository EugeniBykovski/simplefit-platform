"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetGymEnrollmentSettingsQueryKey,
  getGymEnrollmentSettings,
  getListGymJoinRequestsQueryKey,
  getListGymMemberInvitationsQueryKey,
  getListGymMembersQueryKey,
  listGymJoinRequests,
  listGymMemberInvitations,
  listGymMembers,
} from "@/shared/api/generated/endpoints/gym-members/gym-members";
import type {
  GymEnrollmentSettings as EnrollmentSettings,
  GymMember as Member,
  GymMemberInvitation as Invitation,
  GymMemberInvitationStatus as InvitationStatus,
  GymMemberStatus as MemberStatus,
  ListGymMembersStatus,
} from "@/shared/api/generated/model";

/**
 * A gym membership as the gym's staff read it (SF-95
 * `GET /api/v1/gyms/{gym_id}/members`, `…/join-requests`): the membership
 * id, a short name ("Marta K."), the backend's status, how and when the
 * person joined (or asked to) and how it ended. Nothing else about the
 * person exists in the contract (no email, user id, profile, other gym or
 * training data), so nothing else is ever shown. A membership is gym
 * participation, never a paid plan or subscription (D-G09, D-G10).
 */
export type GymMember = Member;
export type GymMemberStatus = MemberStatus;
/** The roster views: `active` (current members) and `ended` (left or removed). */
export type GymMemberView = ListGymMembersStatus;

/**
 * A member invitation of one gym as its staff see it (SF-95 E07): the
 * address masked by the backend, the backend's effective status (`expired`
 * derived by the backend), resends left. Never a token. An invitation is not
 * a membership: an accepted one appears in the roster once the backend lists
 * the membership.
 */
export type GymMemberInvitation = Invitation;
export type GymMemberInvitationStatus = InvitationStatus;

/**
 * The gym's enrollment settings (SF-95): the current join code (`null` when
 * joining by code is off), auto-approval, and whether the viewer may change
 * them (`can_manage`, the backend's own answer for this viewer).
 */
export type GymEnrollmentSettings = EnrollmentSettings;

const PAGE_SIZE = 50;

/**
 * Every cache key of one gym's member reads (all views and pages). Always
 * the gym named by the caller, never "the current gym": a late answer for
 * one gym can only land under its own key, and the session boundary clears
 * the cache.
 */
export const gymMembersKey = (gymId: string) => [getListGymMembersQueryKey(gymId)[0]] as const;
export const gymJoinRequestsKey = (gymId: string) =>
  [getListGymJoinRequestsQueryKey(gymId)[0]] as const;
export const gymMemberInvitationsKey = (gymId: string) =>
  [getListGymMemberInvitationsQueryKey(gymId)[0]] as const;
export const gymEnrollmentSettingsKey = (gymId: string) =>
  getGetGymEnrollmentSettingsQueryKey(gymId);

/** One roster view of a gym's members, oldest first, page by page. */
export function useGymMembers(gymId: string, view: GymMemberView, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: [...gymMembersKey(gymId), view, "pages"],
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listGymMembers(
          gymId,
          { status: view, limit: PAGE_SIZE, ...(pageParam === null ? {} : { cursor: pageParam }) },
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

/** A gym's pending join requests, oldest first, page by page. */
export function useGymJoinRequests(gymId: string, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: [...gymJoinRequestsKey(gymId), "pages"],
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listGymJoinRequests(
          gymId,
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

/** A gym's member invitations, newest first, page by page. */
export function useGymMemberInvitations(gymId: string, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: [...gymMemberInvitationsKey(gymId), "pages"],
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listGymMemberInvitations(
          gymId,
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
 * The gym's enrollment settings. The join code is an enrollment credential:
 * it lives only in memory, only while the page shows it (`gcTime: 0`), never
 * in a URL, storage or a log.
 */
export function useGymEnrollmentSettings(gymId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: gymEnrollmentSettingsKey(gymId),
    queryFn: ({ signal }) =>
      callWithSession((init) => getGymEnrollmentSettings(gymId, { ...init, signal })),
    select: (response) => response.enrollment,
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });
}

/** The viewer's permission projection of `GET /api/v1/gyms/{gym_id}` (read-only). */
type Viewer = { permissions: readonly string[] };

/**
 * What the members page offers the viewer, derived only from the backend's
 * permission projection (SF-83/SF-95). These are hints for what to show:
 * the backend decides every request, and a refusal is shown as such.
 *
 * - `manage_member_enrollment` (owner, managers, front desk): join requests
 *   and their answers, member invitations, the join code as it stands, and
 *   the member-list preview.
 * - `change_member_status` (owner, managers): ending a membership.
 * - The roster itself is read with `view_members`; a coach holds it only for
 *   their own classes, which do not exist yet, so the backend refuses a
 *   coach (403) and the page says so rather than guessing from the role.
 * - Who may rotate or disable the code and switch auto-approval is the
 *   settings' own `can_manage`, the backend's answer for this viewer.
 */
export function memberCapabilities(viewer: Viewer) {
  const has = (permission: string) => viewer.permissions.includes(permission);
  return {
    canEnroll: has("manage_member_enrollment"),
    canEnd: has("change_member_status"),
  };
}

export type MemberCapabilities = ReturnType<typeof memberCapabilities>;
