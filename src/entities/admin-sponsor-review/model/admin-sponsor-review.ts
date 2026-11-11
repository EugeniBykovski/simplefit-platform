import { useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  approveSponsorApplication,
  claimSponsorApplication,
  downloadSponsorApplicationDocument,
  getGetSponsorApplicationForReviewQueryKey,
  getListSponsorApplicationsForReviewQueryKey,
  getSponsorApplicationForReview,
  listSponsorApplicationsForReview,
  previewApproveSponsorApplication,
  previewClaimSponsorApplication,
  previewReinstateSponsorApplicationOrganization,
  previewRejectSponsorApplication,
  previewRequestSponsorApplicationChanges,
  previewSuspendSponsorApplicationOrganization,
  reinstateSponsorApplicationOrganization,
  rejectSponsorApplication,
  requestSponsorApplicationChanges,
  suspendSponsorApplicationOrganization,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import {
  ApproveSponsorApplicationRequestReasonCode,
  ClaimSponsorApplicationRequestReasonCode,
  ListSponsorApplicationsForReviewStatus,
  ReinstateSponsorOrganizationRequestReasonCode,
  RejectSponsorApplicationRequestReasonCode,
  RequestSponsorApplicationChangesRequestFieldsItem,
  RequestSponsorApplicationChangesRequestReasonCode,
  SuspendSponsorOrganizationRequestReasonCode,
  type ListSponsorApplicationsForReviewParams,
  type OperatorActionPreviewResponsePreview,
  type SponsorApplicationQueueResponse,
  type SponsorApplicationReviewResponseApplication,
} from "@/shared/api/generated/model";

/**
 * Sponsor application review (SF-124 on SF-114/SF-116; simplefit-api
 * `/api/v1/admin/sponsor-applications`). The backend owns everything: the queue, what
 * a reviewer sees, who may act, each decision and what it creates. Every action is an
 * SF-111 command with its own permission, reason, revision and (for decisions) a
 * one-time confirmation from a preview of exactly that request. Nothing is kept outside
 * the query cache, which is dropped at every session boundary (SF-28).
 */
export type ReviewApplication = SponsorApplicationReviewResponseApplication;
export type ReviewQueuePage = SponsorApplicationQueueResponse;
export type ReviewQueueRow = SponsorApplicationQueueResponse["applications"][number];
export type ReviewStatus = ListSponsorApplicationsForReviewStatus;
export type ReviewPreview = OperatorActionPreviewResponsePreview;
export type ChangeField = RequestSponsorApplicationChangesRequestFieldsItem;

export const REVIEW_STATUSES: readonly ReviewStatus[] = Object.values(
  ListSponsorApplicationsForReviewStatus,
);
export const CHANGE_FIELDS: readonly ChangeField[] = Object.values(
  RequestSponsorApplicationChangesRequestFieldsItem,
);

export type ReviewAction =
  | "claim"
  | "request_changes"
  | "approve"
  | "reject"
  | "suspend_organization"
  | "reinstate_organization";

/** Each action's permission and reason codes, as the backend declares them. */
export const REVIEW_ACTIONS: Record<
  ReviewAction,
  { permission: string; reasons: readonly string[] }
> = {
  claim: {
    permission: "sponsors.applications.claim",
    reasons: Object.values(ClaimSponsorApplicationRequestReasonCode),
  },
  request_changes: {
    permission: "sponsors.applications.request_changes",
    reasons: Object.values(RequestSponsorApplicationChangesRequestReasonCode),
  },
  approve: {
    permission: "sponsors.applications.approve",
    reasons: Object.values(ApproveSponsorApplicationRequestReasonCode),
  },
  reject: {
    permission: "sponsors.applications.reject",
    reasons: Object.values(RejectSponsorApplicationRequestReasonCode),
  },
  suspend_organization: {
    permission: "sponsors.restrict",
    reasons: Object.values(SuspendSponsorOrganizationRequestReasonCode),
  },
  reinstate_organization: {
    permission: "sponsors.restrict",
    reasons: Object.values(ReinstateSponsorOrganizationRequestReasonCode),
  },
};

export const REVIEW_PAGE_SIZE = 25;

export type ReviewFilters = Pick<
  ListSponsorApplicationsForReviewParams,
  "status" | "submitted_after" | "submitted_before"
>;

const read = { retry: false, staleTime: 0, refetchOnWindowFocus: true } as const;

/** One page of the queue for `filters`, after `cursor` (`undefined`: the first page). */
export function useReviewQueue(filters: ReviewFilters, cursor: string | undefined) {
  const params: ListSponsorApplicationsForReviewParams = {
    ...filters,
    limit: REVIEW_PAGE_SIZE,
    cursor,
  };
  return useQuery({
    queryKey: getListSponsorApplicationsForReviewQueryKey(params),
    queryFn: ({ signal }) =>
      callWithSession((init) => listSponsorApplicationsForReview(params, { ...init, signal })),
    ...read,
  });
}

export const reviewQueryKey = (id: string) => getGetSponsorApplicationForReviewQueryKey(id);
export const reviewQueuePrefix = getListSponsorApplicationsForReviewQueryKey();

/** One application as the reviewer sees it; re-read on focus, so a decision elsewhere shows. */
export function useReviewApplication(id: string) {
  return useQuery({
    queryKey: reviewQueryKey(id),
    queryFn: ({ signal }) =>
      callWithSession((init) => getSponsorApplicationForReview(id, { ...init, signal })).then(
        (answer) => answer.application,
      ),
    ...read,
  });
}

/**
 * A 5-minute attachment download of one submitted document (`read_files`, fresh key
 * check, audited before it's issued). The URL is a credential: it's used once, at
 * once, and never stored, logged or cached.
 */
export async function documentDownload(id: string, evidenceId: string): Promise<string> {
  const answer = await callWithSession((init) =>
    downloadSponsorApplicationDocument(id, evidenceId, init),
  );
  return answer.download.url;
}

export type ActionInput = {
  reason: string;
  fields?: ChangeField[];
  message?: string;
};

/** Previews `action` exactly as it would run: changes nothing; returns impact and confirmation. */
export async function previewReviewAction(
  action: ReviewAction,
  id: string,
  input: ActionInput,
): Promise<ReviewPreview> {
  const answer = await callWithSession((init) => {
    switch (action) {
      case "claim":
        return previewClaimSponsorApplication(
          id,
          { reason_code: input.reason as ClaimSponsorApplicationRequestReasonCode },
          init,
        );
      case "request_changes":
        return previewRequestSponsorApplicationChanges(
          id,
          {
            reason_code: input.reason as RequestSponsorApplicationChangesRequestReasonCode,
            fields: input.fields ?? [],
            message: input.message ?? "",
          },
          init,
        );
      case "approve":
        return previewApproveSponsorApplication(
          id,
          { reason_code: input.reason as ApproveSponsorApplicationRequestReasonCode },
          init,
        );
      case "reject":
        return previewRejectSponsorApplication(
          id,
          { reason_code: input.reason as RejectSponsorApplicationRequestReasonCode },
          init,
        );
      case "suspend_organization":
        return previewSuspendSponsorApplicationOrganization(
          id,
          { reason_code: input.reason as SuspendSponsorOrganizationRequestReasonCode },
          init,
        );
      case "reinstate_organization":
        return previewReinstateSponsorApplicationOrganization(
          id,
          { reason_code: input.reason as ReinstateSponsorOrganizationRequestReasonCode },
          init,
        );
    }
  });
  return answer.preview;
}

/**
 * Executes a previewed action exactly as previewed (its revision, reason, input and
 * one-time confirmation) under `operationId`. Sending the same call again with the same
 * id is how an unanswered request is reconciled: the backend returns the current state
 * if it already committed, and never applies it twice.
 */
export async function executeReviewAction(
  action: ReviewAction,
  id: string,
  input: ActionInput,
  preview: ReviewPreview,
  operationId: string,
): Promise<ReviewApplication> {
  const base = {
    expected_revision: preview.expected_revision,
    operation_id: operationId,
    ...(preview.confirmation.token ? { confirmation_token: preview.confirmation.token } : {}),
  };
  const answer = await callWithSession((init) => {
    switch (action) {
      case "claim":
        return claimSponsorApplication(
          id,
          { ...base, reason_code: input.reason as ClaimSponsorApplicationRequestReasonCode },
          init,
        );
      case "request_changes":
        return requestSponsorApplicationChanges(
          id,
          {
            expected_revision: base.expected_revision,
            operation_id: base.operation_id,
            reason_code: input.reason as RequestSponsorApplicationChangesRequestReasonCode,
            fields: input.fields ?? [],
            message: input.message ?? "",
          },
          init,
        );
      case "approve":
        return approveSponsorApplication(
          id,
          { ...base, reason_code: input.reason as ApproveSponsorApplicationRequestReasonCode },
          init,
        );
      case "reject":
        return rejectSponsorApplication(
          id,
          { ...base, reason_code: input.reason as RejectSponsorApplicationRequestReasonCode },
          init,
        );
      case "suspend_organization":
        return suspendSponsorApplicationOrganization(
          id,
          { ...base, reason_code: input.reason as SuspendSponsorOrganizationRequestReasonCode },
          init,
        );
      case "reinstate_organization":
        return reinstateSponsorApplicationOrganization(
          id,
          { ...base, reason_code: input.reason as ReinstateSponsorOrganizationRequestReasonCode },
          init,
        );
    }
  });
  return answer.application;
}
