"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getListGymStaffInvitationsQueryKey,
  getListGymStaffQueryKey,
  listGymStaff,
  listGymStaffInvitations,
} from "@/shared/api/generated/endpoints/gym-staff/gym-staff";
import type {
  GymStaffInvitation as Invitation,
  GymStaffInvitationRole,
  GymStaffInvitationStatus as InvitationStatus,
  GymStaffMember as Member,
  GymStaffMemberRole,
  ListGymStaffStatus,
} from "@/shared/api/generated/model";

/**
 * A staff membership of one gym as the backend lists it (SF-93
 * `GET /api/v1/gyms/{gym_id}/staff`): the membership id, the gym role, the
 * status, a short name ("Natalia W.") and whether it is the viewer's own.
 * Nothing else about the person (no email, profile or other gym) exists in
 * the contract, so nothing else is ever shown.
 */
export type GymStaffMember = Member;
export type GymStaffRole = GymStaffMemberRole;
export type GymStaffView = ListGymStaffStatus;

/**
 * A staff invitation of one gym as its administrators see it (SF-93): the
 * address masked by the backend, the backend's effective status (`expired`
 * derived by the backend), resends left. Never a token. An invitation is
 * not a membership: an accepted one appears in the roster once the backend
 * lists the membership.
 */
export type GymStaffInvitation = Invitation;
export type GymStaffInvitationStatus = InvitationStatus;
/** The roles an invitation or a role change can give: never `owner` (D-G04). */
export type AssignableRole = GymStaffInvitationRole;

const PAGE_SIZE = 50;

/**
 * Every cache key of one gym's staff reads (all views and pages). Always
 * the gym named by the caller, never "the current gym": a late answer for
 * one gym can only land under its own key, and the session boundary clears
 * the cache.
 */
export const gymStaffKey = (gymId: string) => [getListGymStaffQueryKey(gymId)[0]] as const;
export const gymStaffInvitationsKey = (gymId: string) =>
  [getListGymStaffInvitationsQueryKey(gymId)[0]] as const;

/** One view (`active`, or `ended` for the owner and managers) of a gym's staff, page by page. */
export function useGymStaff(gymId: string, view: GymStaffView, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: [...gymStaffKey(gymId), view, "pages"],
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listGymStaff(
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

/** A gym's staff invitations, newest first, page by page (owner and managers). */
export function useGymStaffInvitations(gymId: string, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: [...gymStaffInvitationsKey(gymId), "pages"],
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listGymStaffInvitations(
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

/** The viewer's permission projection of `GET /api/v1/gyms/{gym_id}` (read-only). */
type Viewer = { role: GymStaffRole; permissions: readonly string[]; staff_membership_id: string };

/**
 * What the staff screen offers the viewer, derived only from the backend's
 * permission projection (SF-83/SF-93). These are hints for what to show:
 * the backend decides every request, and a refusal is shown as such.
 *
 * - `invite_staff` / `invite_manager`: who may be invited.
 * - `view_staff_records`: invitations and ended staff.
 * - `change_staff_role` / `remove_staff`: role changes and removal. The
 *   matrix limits a manager to coaches and front desk; the projection
 *   expresses that limit as the absence of `invite_manager` (only who may
 *   manage managers may invite one), so manager rows offer no action then.
 * - `leave_gym`: leaving one's own membership (never the owner).
 */
export function staffCapabilities(viewer: Viewer) {
  const has = (permission: string) => viewer.permissions.includes(permission);
  const managesManagers = has("invite_manager");
  const assignable: AssignableRole[] = managesManagers
    ? ["manager", "coach", "front_desk"]
    : ["coach", "front_desk"];
  return {
    canInvite: has("invite_staff"),
    inviteRoles: has("invite_staff") ? assignable : [],
    canViewRecords: has("view_staff_records"),
    /** The roles this viewer may give `member` instead of its current one (none: no action). */
    roleTargets(member: GymStaffMember): AssignableRole[] {
      if (!has("change_staff_role") || member.status !== "active" || member.is_viewer) return [];
      if (member.role === "owner") return [];
      if (member.role === "manager" && !managesManagers) return [];
      return assignable.filter((role) => role !== member.role);
    },
    /** Whether this viewer may end `member`'s membership (removal, or leaving their own). */
    canEnd(member: GymStaffMember): boolean {
      if (member.status !== "active" || member.role === "owner") return false;
      if (member.is_viewer) return has("leave_gym");
      if (!has("remove_staff")) return false;
      return member.role !== "manager" || managesManagers;
    },
    /** Whether this viewer may resend or cancel `invitation` (the permission of inviting its role). */
    managesInvitation(invitation: GymStaffInvitation): boolean {
      return has("invite_staff") && (invitation.role !== "manager" || managesManagers);
    },
  };
}

export type StaffCapabilities = ReturnType<typeof staffCapabilities>;
