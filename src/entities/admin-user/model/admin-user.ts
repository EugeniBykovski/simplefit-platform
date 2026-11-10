import { useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getAdminUser,
  getGetAdminUserQueryKey,
  getSearchAdminUsersQueryKey,
  liftSuspensionAdminUser,
  previewLiftSuspensionAdminUser,
  previewSignOutEverywhereAdminUser,
  previewSuspendAdminUser,
  revealAdminUserEmail,
  searchAdminUsers,
  signOutEverywhereAdminUser,
  suspendAdminUser,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import {
  AdminUserReadRequestReasonCode,
  LiftUserSuspensionRequestReasonCode,
  SignOutUserEverywhereRequestReasonCode,
  SuspendUserRequestReasonCode,
  type AdminUser,
  type AdminUserSummary,
  type OperatorActionPreviewResponsePreview,
} from "@/shared/api/generated/model";

/**
 * Operator account administration (SF-122; simplefit-api `/api/v1/admin/users`). The
 * backend decides everything: who may search or act, what an account shows (masked
 * addresses, counts), and every action's effect. Every read carries a reason code the
 * backend records. Nothing is kept outside the query cache, which is dropped at every
 * session boundary (SF-28); queries are keyed by account and reason, never shared.
 */
export type AdminAccount = AdminUser;
export type AdminAccountSummary = AdminUserSummary;
export type ReadReason = AdminUserReadRequestReasonCode;
export type ActionPreview = OperatorActionPreviewResponsePreview;

export const READ_REASONS: readonly ReadReason[] = Object.values(AdminUserReadRequestReasonCode);
const DEFAULT_REASON: ReadReason = AdminUserReadRequestReasonCode.support_request;

export type AccountAction = "suspend" | "lift_suspension" | "sign_out_everywhere";

export const ACTION_REASONS: Record<AccountAction, readonly string[]> = {
  suspend: Object.values(SuspendUserRequestReasonCode),
  lift_suspension: Object.values(LiftUserSuspensionRequestReasonCode),
  sign_out_everywhere: Object.values(SignOutUserEverywhereRequestReasonCode),
};

/** Exact search (one account at most). Runs only for a submitted query. */
export function useAccountSearch(search: { query: string; reason: ReadReason } | null) {
  return useQuery({
    queryKey: getSearchAdminUsersQueryKey({
      query: search?.query ?? "",
      reason_code: search?.reason ?? DEFAULT_REASON,
    }),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        searchAdminUsers(
          { query: search?.query ?? "", reason_code: search?.reason ?? DEFAULT_REASON },
          { ...init, signal },
        ),
      ).then((answer) => answer.users),
    enabled: search !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export const accountQueryKey = (id: string, reason: ReadReason) =>
  getGetAdminUserQueryKey(id, { reason_code: reason });

/** One account, read with `reason` (recorded by the backend each time it's read). */
export function useAccount(id: string, reason: ReadReason | null) {
  return useQuery({
    queryKey: accountQueryKey(id, reason ?? DEFAULT_REASON),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        getAdminUser(id, { reason_code: reason ?? DEFAULT_REASON }, { ...init, signal }),
      ).then((answer) => answer.user),
    enabled: reason !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** The account's full addresses (`users.reveal_email`, fresh key check); recorded first. */
export async function revealEmail(id: string, reason: ReadReason): Promise<string[]> {
  const answer = await callWithSession((init) =>
    revealAdminUserEmail(id, { reason_code: reason }, init),
  );
  return answer.email_addresses;
}

/** Previews `action` with `reason`: changes nothing; returns the impact and a confirmation. */
export async function previewAction(
  action: AccountAction,
  id: string,
  reason: string,
): Promise<ActionPreview> {
  const answer = await callWithSession((init) => {
    switch (action) {
      case "suspend":
        return previewSuspendAdminUser(
          id,
          { reason_code: reason as SuspendUserRequestReasonCode },
          init,
        );
      case "lift_suspension":
        return previewLiftSuspensionAdminUser(
          id,
          { reason_code: reason as LiftUserSuspensionRequestReasonCode },
          init,
        );
      case "sign_out_everywhere":
        return previewSignOutEverywhereAdminUser(
          id,
          { reason_code: reason as SignOutUserEverywhereRequestReasonCode },
          init,
        );
    }
  });
  return answer.preview;
}

/**
 * Executes a previewed action exactly as previewed: its revision, reason and one-time
 * confirmation, under `operationId` (a retry with the same id changes nothing twice).
 */
export async function executeAction(
  action: AccountAction,
  id: string,
  preview: ActionPreview,
  operationId: string,
) {
  const body = {
    expected_revision: preview.expected_revision,
    operation_id: operationId,
    ...(preview.confirmation.token ? { confirmation_token: preview.confirmation.token } : {}),
  };
  const answer = await callWithSession((init) => {
    switch (action) {
      case "suspend":
        return suspendAdminUser(
          id,
          { ...body, reason_code: preview.reason_code as SuspendUserRequestReasonCode },
          init,
        );
      case "lift_suspension":
        return liftSuspensionAdminUser(
          id,
          { ...body, reason_code: preview.reason_code as LiftUserSuspensionRequestReasonCode },
          init,
        );
      case "sign_out_everywhere":
        return signOutEverywhereAdminUser(
          id,
          { ...body, reason_code: preview.reason_code as SignOutUserEverywhereRequestReasonCode },
          init,
        );
    }
  });
  return answer.user;
}
