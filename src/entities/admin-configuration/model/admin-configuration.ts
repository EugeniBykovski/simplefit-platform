import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { callWithSession } from "@/entities/session";
import {
  getAdminConfiguration,
  getGetAdminConfigurationQueryKey,
  previewRestoreRuntimeFlag,
  previewSuspendRuntimeFlag,
  restoreRuntimeFlag,
  suspendRuntimeFlag,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import {
  RestoreRuntimeFlagRequestReasonCode,
  SuspendRuntimeFlagRequestReasonCode,
  type AdminConfigurationChange,
  type AdminConfigurationFlag,
  type AdminConfigurationResponseConfiguration,
  type OperatorActionPreviewResponsePreview,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Configuration governance (SF-128; simplefit-api `/api/v1/admin/configuration`). The
 * backend owns the registry, every value and what may change: the only change is
 * suspending or restoring one of its allowlisted switches, through the SF-111 actions
 * (preview, one-time confirmation, expected revision, operation id). Nothing here
 * decides whether a feature is on, and a refusal drops the configuration from the cache.
 */
export type Configuration = AdminConfigurationResponseConfiguration;
export type ConfigurationFlag = AdminConfigurationFlag;
export type ConfigurationChange = AdminConfigurationChange;
export type FlagPreview = OperatorActionPreviewResponsePreview;
export type FlagAction = "suspend" | "restore";

export const FLAG_REASONS: Record<FlagAction, readonly string[]> = {
  suspend: Object.values(SuspendRuntimeFlagRequestReasonCode),
  restore: Object.values(RestoreRuntimeFlagRequestReasonCode),
};

export const configurationQueryKey = getGetAdminConfigurationQueryKey();

export function useConfiguration(enabled: boolean) {
  return useQuery({
    queryKey: configurationQueryKey,
    queryFn: ({ signal }) =>
      callWithSession((init) => getAdminConfiguration({ ...init, signal })).then(
        (answer) => answer.configuration,
      ),
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** Drops the configuration from the cache once the backend refuses it (revoked operator). */
export function useForgetConfigurationOnRefusal(error: unknown) {
  const client = useQueryClient();
  const refused = isApiError(error) && (error.status === 403 || error.status === 404);
  useEffect(() => {
    if (refused) client.removeQueries({ queryKey: configurationQueryKey });
  }, [client, refused]);
}

/**
 * Previews suspending or restoring `flag` at the revision the operator saw, with
 * `reason`: changes nothing; returns the state change, impact and a one-time
 * confirmation. A newer revision answers `revision_conflict`.
 */
export async function previewFlagAction(
  action: FlagAction,
  flag: ConfigurationFlag,
  reason: string,
): Promise<FlagPreview> {
  const id = flag.flag_id ?? "";
  const answer = await callWithSession((init) =>
    action === "suspend"
      ? previewSuspendRuntimeFlag(
          id,
          {
            reason_code: reason as SuspendRuntimeFlagRequestReasonCode,
            expected_revision: flag.revision ?? undefined,
          },
          init,
        )
      : previewRestoreRuntimeFlag(
          id,
          {
            reason_code: reason as RestoreRuntimeFlagRequestReasonCode,
            expected_revision: flag.revision ?? undefined,
          },
          init,
        ),
  );
  return answer.preview;
}

/**
 * Executes a previewed action exactly as previewed (revision, reason, confirmation) under
 * `operationId`: a retry with the same id changes nothing twice. Never re-previews.
 */
export async function executeFlagAction(
  action: FlagAction,
  flag: ConfigurationFlag,
  preview: FlagPreview,
  operationId: string,
): Promise<ConfigurationFlag> {
  const id = flag.flag_id ?? "";
  const body = {
    expected_revision: preview.expected_revision,
    operation_id: operationId,
    ...(preview.confirmation.token ? { confirmation_token: preview.confirmation.token } : {}),
  };
  const answer = await callWithSession((init) =>
    action === "suspend"
      ? suspendRuntimeFlag(
          id,
          { ...body, reason_code: preview.reason_code as SuspendRuntimeFlagRequestReasonCode },
          init,
        )
      : restoreRuntimeFlag(
          id,
          { ...body, reason_code: preview.reason_code as RestoreRuntimeFlagRequestReasonCode },
          init,
        ),
  );
  return answer.flag;
}
