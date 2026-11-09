import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { callWithSession } from "@/entities/session";
import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import { getLegalDocumentVersion } from "@/shared/api/generated/endpoints/legal/legal";
import {
  addMySponsorApplicationEvidence,
  confirmMySponsorApplicationEvidence,
  getGetMySponsorApplicationQueryKey,
  getGetSponsorApplicationPolicyQueryKey,
  getMySponsorApplication,
  getSponsorApplicationPolicy,
  removeMySponsorApplicationEvidence,
  saveMySponsorApplication,
  submitMySponsorApplication,
} from "@/shared/api/generated/endpoints/sponsor-applications/sponsor-applications";
import {
  getListMySponsorOrganizationsQueryKey,
  listMySponsorOrganizations,
} from "@/shared/api/generated/endpoints/sponsors/sponsors";
import type {
  LegalDocumentRef,
  SponsorApplication as SponsorApplicationModel,
  SponsorApplicationEvidenceRequest,
  SponsorApplicationPolicyResponsePolicy,
  SponsorApplicationSaveRequest,
  SponsorApplicationSubmitRequest,
  SponsorApplicationUpload,
  SponsorApplicationEvidence as SponsorEvidenceModel,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * The viewer's sponsor application (SF-113 / SF-114; ADR 0031 and 0032 in
 * simplefit-api): the only authority on its answers, revision, status,
 * documents and what may happen next (`allowed_actions`, `submit_blockers`,
 * `missing_fields`). The cache holds the backend's latest answer only:
 * nothing is written optimistically and no answer is kept in browser
 * storage. Every write resolves with the application the backend now has,
 * which replaces the cache; a rejected write changes nothing here.
 *
 * Nothing here grants anything: an application in any status creates no
 * Sponsor organization, membership, workspace or capability.
 */
export type SponsorApplication = SponsorApplicationModel;
export type SponsorEvidence = SponsorEvidenceModel;
export type SponsorApplicationPolicy = SponsorApplicationPolicyResponsePolicy;
export type SponsorAnswersPatch = Omit<
  SponsorApplicationSaveRequest,
  "expected_revision" | "client_request_id"
>;
export type SponsorEvidenceInput = Omit<SponsorApplicationEvidenceRequest, "expected_revision">;
export type SponsorSubmitInput = Omit<SponsorApplicationSubmitRequest, "expected_revision">;
/**
 * The presigned operation of one upload: a short-lived credential for one
 * object. Kept in the caller's memory for that upload only; never cached,
 * stored, logged or put in a URL.
 */
export type SponsorUpload = SponsorApplicationUpload;

export const sponsorApplicationQueryKey = getGetMySponsorApplicationQueryKey();
export const sponsorPolicyQueryKey = getGetSponsorApplicationPolicyQueryKey();

/** `GET /api/v1/me/sponsor-application`: the viewer's application, or `null` when none exists. */
export async function fetchSponsorApplication(
  signal?: AbortSignal,
): Promise<SponsorApplication | null> {
  try {
    const { application } = await callWithSession((init) =>
      getMySponsorApplication({ ...init, signal }),
    );
    return application;
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/**
 * The viewer's application, read when the page opens and again on focus,
 * so a change made in another tab or by a reviewer is seen before the next
 * write (which would otherwise be refused as stale).
 */
export function useSponsorApplication(enabled = true) {
  return useQuery({
    queryKey: sponsorApplicationQueryKey,
    queryFn: ({ signal }) => fetchSponsorApplication(signal),
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** What the backend accepts and what a submission needs (`GET /api/v1/sponsor-application-policy`). */
export function useSponsorApplicationPolicy(enabled = true) {
  return useQuery({
    queryKey: sponsorPolicyQueryKey,
    queryFn: async ({ signal }) =>
      (await callWithSession((init) => getSponsorApplicationPolicy({ ...init, signal }))).policy,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Whether the viewer already belongs to a Sponsor organization (SF-112): a routing hint only. */
export function useSponsorMemberships(enabled = true) {
  return useQuery({
    queryKey: getListMySponsorOrganizationsQueryKey(),
    queryFn: async ({ signal }) =>
      (await callWithSession((init) => listMySponsorOrganizations({ ...init, signal })))
        .organizations.length,
    enabled,
    retry: false,
    staleTime: 0,
  });
}

/**
 * The published declaration a submission accepts, in `language` when an
 * approved text exists in exactly that language (ADR 0022): the checkbox
 * label comes from the legal registry, never from this client.
 */
export function useSponsorDeclaration(
  declaration: { version: string | null; document_id: string } | undefined,
  language: string | undefined,
) {
  const version = declaration?.version ?? null;
  return useQuery({
    queryKey: ["sponsor-application-declaration", version, language] as const,
    queryFn: async ({ signal }): Promise<LegalDocumentRef> =>
      (
        await callWithSession((init) =>
          getLegalDocumentVersion(
            "sponsor-application-declaration",
            version as string,
            language === undefined ? undefined : { language },
            { ...init, signal },
          ),
        )
      ).document,
    enabled: version !== null && language !== undefined,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** The application writes. Each settles the cache with the backend's answer. */
export function useSponsorApplicationActions() {
  const client = useQueryClient();
  const settle = useCallback(
    (application: SponsorApplication) => {
      client.setQueryData(sponsorApplicationQueryKey, application);
      return application;
    },
    [client],
  );

  /**
   * `PATCH /me/sponsor-application`: only the sent answers change. The first
   * save creates the draft with the caller's `client_request_id` (a retry
   * with the same key answers the same draft); every later save names the
   * revision it was based on, so an older copy answers `409` instead of
   * overwriting.
   */
  const save = useCallback(
    async (
      base: SponsorApplication | null,
      patch: SponsorAnswersPatch,
      clientRequestId: () => string,
    ) => {
      const body: SponsorApplicationSaveRequest =
        base === null
          ? { ...patch, client_request_id: clientRequestId() }
          : { ...patch, expected_revision: base.revision };
      const { application } = await callWithSession((init) => saveMySponsorApplication(body, init));
      return settle(application);
    },
    [settle],
  );

  /**
   * `POST …/submit`, idempotent per `client_request_id`: a repeat of the same
   * request answers the same submission. Success drops the cached entry
   * resolutions, which now resolve to the application's status.
   */
  const submit = useCallback(
    async (base: SponsorApplication, input: SponsorSubmitInput) => {
      const { application } = await callWithSession((init) =>
        submitMySponsorApplication({ ...input, expected_revision: base.revision }, init),
      );
      settle(application);
      await client.invalidateQueries({ queryKey: getResolveMyEntryQueryKey().slice(0, 1) });
      return application;
    },
    [client, settle],
  );

  /** `POST …/evidence`: records a pending document and returns its presigned upload. */
  const addEvidence = useCallback(
    async (base: SponsorApplication, input: SponsorEvidenceInput) => {
      const { application, evidence, upload } = await callWithSession((init) =>
        addMySponsorApplicationEvidence({ ...input, expected_revision: base.revision }, init),
      );
      settle(application);
      return { evidence, upload };
    },
    [settle],
  );

  /** `POST …/evidence/{id}/confirm`: the backend checks the stored object; repeats answer the same. */
  const confirmEvidence = useCallback(
    async (evidenceId: string) =>
      settle(
        (await callWithSession((init) => confirmMySponsorApplicationEvidence(evidenceId, init)))
          .application,
      ),
    [settle],
  );

  /** `POST …/evidence/{id}/remove` (idempotent) at the application's revision. */
  const removeEvidence = useCallback(
    async (base: SponsorApplication, evidenceId: string) =>
      settle(
        (
          await callWithSession((init) =>
            removeMySponsorApplicationEvidence(
              evidenceId,
              { expected_revision: base.revision },
              init,
            ),
          )
        ).application,
      ),
    [settle],
  );

  /** Re-reads the application (after a conflict or an unconfirmed write). */
  const reload = useCallback(async () => {
    const application = await fetchSponsorApplication();
    client.setQueryData(sponsorApplicationQueryKey, application);
    return application;
  }, [client]);

  return { save, submit, addEvidence, confirmEvidence, removeEvidence, reload };
}

/**
 * Sends a file's bytes to its presigned upload, exactly as the backend said
 * (method, URL, headers). The URL is used here only: it is never logged,
 * stored or reported. Resolves `true` when storage accepted the bytes;
 * that is not verification, which only `confirmEvidence` gives.
 */
export async function putToStorage(
  upload: SponsorUpload,
  file: Blob,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: file,
      credentials: "omit",
      signal,
    });
    return response.ok;
  } catch {
    return false;
  }
}
