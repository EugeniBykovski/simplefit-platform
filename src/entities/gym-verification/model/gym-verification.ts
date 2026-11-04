"use client";

import { useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetGymBusinessVerificationQueryKey,
  getGetGymGoLiveQueryKey,
  getGymBusinessVerification,
  getGymGoLive,
} from "@/shared/api/generated/endpoints/gym-verification/gym-verification";
import type {
  GymBusinessVerification as Verification,
  GymGoLive as GoLive,
  GymGoLiveCheck as GoLiveCheck,
  GymVerificationEvidence as Evidence,
  GymViewer,
} from "@/shared/api/generated/model";

/**
 * A gym's business verification and go-live readiness (SF-103) as the web
 * reads them. The backend owns every rule and every state:
 *
 * - **Verification** is the gym's current application (or the latest
 *   rejected or revoked one), its documents and the latest decision. Only a
 *   SimpleFit operator decides, outside the API; nothing the owner sends,
 *   and no gym setup, plan, payment or Stripe state, is a verification.
 *   `missing`, `can_edit` and `can_submit` are the backend's answers.
 * - **Go-live** is the readiness checklist the backend derives on every
 *   read. `prerequisites_met` is its answer; publication is always
 *   `unavailable` (no public gym surface exists).
 *
 * Both are read again whenever the page regains focus, so returning to the
 * page never shows a stale state (an approval revoked meanwhile).
 */
export type GymVerification = Verification;
export type GymVerificationDocument = Evidence;
export type GymGoLive = GoLive;
export type GymGoLiveCheck = GoLiveCheck;

/**
 * Whether the viewer acts on the verification (`manage_business_verification`,
 * the owner's alone). A display hint only: the backend checks every call.
 */
export const canManageVerification = (viewer: GymViewer) =>
  viewer.permissions.includes("manage_business_verification");

/** Whether the viewer reads the go-live checklist (`view_go_live`: owner and managers). */
export const canViewGoLive = (viewer: GymViewer) => viewer.permissions.includes("view_go_live");

/** Every verification read of one gym, named by the gym. */
export const gymVerificationKey = (gymId: string) => ["gym-verification", gymId] as const;
export const gymVerificationStateKey = (gymId: string) =>
  [...gymVerificationKey(gymId), ...getGetGymBusinessVerificationQueryKey(gymId)] as const;
export const gymGoLiveKey = (gymId: string) =>
  [...gymVerificationKey(gymId), ...getGetGymGoLiveQueryKey(gymId)] as const;

/** The gym's verification, read again on focus. */
export function useGymVerification(gymId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: gymVerificationStateKey(gymId),
    queryFn: ({ signal }) =>
      callWithSession((init) => getGymBusinessVerification(gymId, { ...init, signal })),
    select: (answer) => answer.verification,
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** The gym's go-live readiness, read again on focus. */
export function useGymGoLive(gymId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: gymGoLiveKey(gymId),
    queryFn: ({ signal }) => callWithSession((init) => getGymGoLive(gymId, { ...init, signal })),
    select: (answer) => answer.go_live,
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
