import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { callWithSession } from "@/entities/session";
import {
  getGetOperatorQueryKey,
  getListOperatorAuditEventsQueryKey,
  getListOperatorCredentialsQueryKey,
  getListOperatorPermissionsQueryKey,
  getListOperatorsQueryKey,
  getOperator,
  grantOperatorPermission,
  listOperatorAuditEvents,
  listOperatorCredentials,
  listOperatorPermissions,
  listOperators,
  previewGrantOperatorPermission,
  previewReinstateOperator,
  previewRevokeOperator,
  previewRevokeOperatorPermission,
  previewSuspendOperator,
  provisionOperator,
  reinstateOperator,
  revokeOperator,
  revokeOperatorCredential,
  revokeOperatorPermission,
  suspendOperator,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import {
  GrantOperatorPermissionRequestReasonCode,
  ReinstateOperatorRequestReasonCode,
  RevokeOperatorPermissionRequestReasonCode,
  RevokeOperatorRequestReasonCode,
  SuspendOperatorRequestReasonCode,
  type GrantOperatorPermissionRequestPermission,
  type OperatorActionPreviewResponsePreview,
  type OperatorAuditEvent,
  type OperatorCredential,
  type OperatorSummary,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Operator governance (SF-129; simplefit-api SF-110/SF-111, ADR 0028/0029). The backend
 * owns every operator, permission and rule: who may act, that nobody acts on themselves,
 * that the last manager stays, and the one-time confirmations. Every change goes through
 * the SF-111 actions (preview, reason, fresh key check, confirmation, expected revision,
 * operation id); nothing here grants anything or shows a change before the backend
 * confirms it. A refusal drops every operator answer from the cache.
 */
export type GovernedOperator = OperatorSummary;
export type OperatorPreview = OperatorActionPreviewResponsePreview;
export type GovernanceEvent = OperatorAuditEvent;
export type SecurityKey = OperatorCredential;
export type OperatorAction = "grant" | "revoke_permission" | "suspend" | "reinstate" | "revoke";

export const ACTION_REASONS: Record<OperatorAction, readonly string[]> = {
  grant: Object.values(GrantOperatorPermissionRequestReasonCode),
  revoke_permission: Object.values(RevokeOperatorPermissionRequestReasonCode),
  suspend: Object.values(SuspendOperatorRequestReasonCode),
  reinstate: Object.values(ReinstateOperatorRequestReasonCode),
  revoke: Object.values(RevokeOperatorRequestReasonCode),
};

/** Provisioning takes the grant's reasons: it is a first grant. */
export const PROVISION_REASONS = ACTION_REASONS.grant;

const OPERATOR_KEYS = ["/api/v1/admin/operators", "/api/v1/admin/operator-permissions"];
const reads = { retry: false, staleTime: 0, refetchOnWindowFocus: true } as const;

/** Drops every operator governance answer from the cache (a refusal, a revoked operator). */
export function useForgetOperatorsOnRefusal(error: unknown) {
  const client = useQueryClient();
  const refused = isApiError(error) && (error.status === 403 || error.status === 404);
  useEffect(() => {
    if (!refused) return;
    client.removeQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        OPERATOR_KEYS.some((prefix) => (query.queryKey[0] as string).startsWith(prefix)),
    });
  }, [client, refused]);
}

export function useOperators(enabled: boolean) {
  return useQuery({
    queryKey: getListOperatorsQueryKey(),
    queryFn: ({ signal }) =>
      callWithSession((init) => listOperators({ ...init, signal })).then((a) => a.operators),
    enabled,
    ...reads,
  });
}

/** One operator; each read is recorded by the backend (`operator.viewed`). */
export function useOperatorDetail(id: string | null) {
  return useQuery({
    queryKey: getGetOperatorQueryKey(id ?? ""),
    queryFn: ({ signal }) =>
      callWithSession((init) => getOperator(id ?? "", { ...init, signal })).then((a) => a.operator),
    enabled: id !== null,
    ...reads,
  });
}

export function usePermissionCatalog(enabled: boolean) {
  return useQuery({
    queryKey: getListOperatorPermissionsQueryKey(),
    queryFn: ({ signal }) =>
      callWithSession((init) => listOperatorPermissions({ ...init, signal })).then(
        (a) => a.permissions,
      ),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * An operator's governance history (changes to them) or recent actions (by them), from
 * the immutable audit log: only for viewers who also hold `audit.read`.
 */
export function useOperatorEvents(id: string | null, side: "target" | "actor", enabled: boolean) {
  const params =
    side === "target"
      ? { target_id: id ?? "", limit: 20 }
      : { actor_operator_id: id ?? "", limit: 20 };
  return useQuery({
    queryKey: getListOperatorAuditEventsQueryKey(params),
    queryFn: ({ signal }) =>
      callWithSession((init) => listOperatorAuditEvents(params, { ...init, signal })).then(
        (a) => a.events,
      ),
    enabled: enabled && id !== null,
    ...reads,
  });
}

/** The viewer's own security keys (metadata only). */
export function useOwnKeys(enabled: boolean) {
  return useQuery({
    queryKey: getListOperatorCredentialsQueryKey(),
    queryFn: ({ signal }) =>
      callWithSession((init) => listOperatorCredentials({ ...init, signal })).then(
        (a) => a.credentials,
      ),
    enabled,
    ...reads,
  });
}

/** Revokes one of the viewer's own keys; the backend refuses to go below the minimum. */
export async function revokeOwnKey(id: string) {
  return callWithSession((init) => revokeOperatorCredential(id, init));
}

/**
 * Previews an operator action on `target` at the revision the viewer saw: changes
 * nothing; returns the state change, impact and (for widening actions) a one-time
 * confirmation. `permission` names the grant for grant and revoke_permission.
 */
export async function previewOperatorAction(
  action: OperatorAction,
  target: GovernedOperator,
  reason: string,
  permission?: string,
): Promise<OperatorPreview> {
  const base = { reason_code: reason, expected_revision: target.revision };
  const answer = await callWithSession((init) => {
    switch (action) {
      case "grant":
        return previewGrantOperatorPermission(
          target.id,
          {
            ...base,
            reason_code: reason as GrantOperatorPermissionRequestReasonCode,
            permission: (permission ?? "") as GrantOperatorPermissionRequestPermission,
          },
          init,
        );
      case "revoke_permission":
        return previewRevokeOperatorPermission(
          target.id,
          permission ?? "",
          { ...base, reason_code: reason as RevokeOperatorPermissionRequestReasonCode },
          init,
        );
      case "suspend":
        return previewSuspendOperator(
          target.id,
          { ...base, reason_code: reason as SuspendOperatorRequestReasonCode },
          init,
        );
      case "reinstate":
        return previewReinstateOperator(
          target.id,
          { ...base, reason_code: reason as ReinstateOperatorRequestReasonCode },
          init,
        );
      case "revoke":
        return previewRevokeOperator(
          target.id,
          { ...base, reason_code: reason as RevokeOperatorRequestReasonCode },
          init,
        );
    }
  });
  return answer.preview;
}

/**
 * Executes a previewed action exactly as previewed (revision, reason, confirmation)
 * under `operationId`: a retry with the same id changes nothing twice.
 */
export async function executeOperatorAction(
  action: OperatorAction,
  target: GovernedOperator,
  preview: OperatorPreview,
  operationId: string,
  permission?: string,
): Promise<GovernedOperator> {
  // Widening and ending actions carry the preview's one-time confirmation; removing a
  // permission needs none (the backend says which in `confirmation.required`).
  const body = {
    expected_revision: preview.expected_revision,
    operation_id: operationId,
    confirmation_token: preview.confirmation.token ?? "",
  };
  const answer = await callWithSession((init) => {
    switch (action) {
      case "grant":
        return grantOperatorPermission(
          target.id,
          {
            ...body,
            reason_code: preview.reason_code as GrantOperatorPermissionRequestReasonCode,
            permission: (permission ?? "") as GrantOperatorPermissionRequestPermission,
          },
          init,
        );
      case "revoke_permission":
        return revokeOperatorPermission(
          target.id,
          permission ?? "",
          {
            expected_revision: body.expected_revision,
            operation_id: body.operation_id,
            ...(preview.confirmation.token
              ? { confirmation_token: preview.confirmation.token }
              : {}),
            reason_code: preview.reason_code as RevokeOperatorPermissionRequestReasonCode,
          },
          init,
        );
      case "suspend":
        return suspendOperator(
          target.id,
          { ...body, reason_code: preview.reason_code as SuspendOperatorRequestReasonCode },
          init,
        );
      case "reinstate":
        return reinstateOperator(
          target.id,
          { ...body, reason_code: preview.reason_code as ReinstateOperatorRequestReasonCode },
          init,
        );
      case "revoke":
        return revokeOperator(
          target.id,
          { ...body, reason_code: preview.reason_code as RevokeOperatorRequestReasonCode },
          init,
        );
    }
  });
  return answer.operator;
}

/**
 * Provisions an operator for an existing account named by exactly one exact reference (a
 * user id or an email address), with the listed permissions. The new operator is
 * `pending_enrollment`: they hold nothing usable until they register their own keys.
 */
export async function provision(
  reference: { user_id: string } | { email: string },
  permissions: string[],
  reason: string,
  operationId: string,
): Promise<GovernedOperator> {
  const answer = await callWithSession((init) =>
    provisionOperator(
      { ...reference, permissions, reason_code: reason, operation_id: operationId },
      init,
    ),
  );
  return answer.operator;
}
