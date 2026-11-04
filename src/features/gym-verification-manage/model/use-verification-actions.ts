"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  gymVerificationKey,
  gymVerificationStateKey,
  type GymVerification,
} from "@/entities/gym-verification";
import { callWithSession } from "@/entities/session";
import {
  confirmGymVerificationEvidence,
  createGymVerificationEvidence,
  removeGymVerificationEvidence,
  saveGymBusinessVerification,
  submitGymBusinessVerification,
} from "@/shared/api/generated/endpoints/gym-verification/gym-verification";
import type {
  GymBusinessVerificationRequest,
  GymBusinessVerificationResponse,
  GymVerificationEvidenceRequestContentType,
  GymVerificationEvidenceRequestKind,
} from "@/shared/api/generated/model";

import { UploadFailedError } from "./verification-problem";

/**
 * The owner's verification actions (SF-103). Each names the revision the
 * page shows; the backend answers the whole new state, which replaces the
 * cached one, and the gym's verification and go-live reads are read again
 * after every answer (a refusal included), so nothing stale stays shown.
 * None of them can approve: only a SimpleFit operator decides.
 */
function useVerificationAnswer(gymId: string) {
  const client = useQueryClient();
  const accept = useCallback(
    (answer: GymBusinessVerificationResponse) =>
      client.setQueryData(gymVerificationStateKey(gymId), answer),
    [client, gymId],
  );
  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: gymVerificationKey(gymId) }),
    [client, gymId],
  );
  return { accept, refresh };
}

const revisionOf = (verification: GymVerification) => verification.application?.revision;

/**
 * Saves business details: starts an application when there is none (or the
 * latest was rejected or revoked: no revision), else changes the current one.
 */
export function useSaveVerification(gymId: string) {
  const { accept, refresh } = useVerificationAnswer(gymId);
  return useMutation({
    mutationFn: ({
      verification,
      details,
    }: {
      verification: GymVerification;
      details: Omit<GymBusinessVerificationRequest, "revision">;
    }) => {
      const current = ["draft", "submitted", "changes_requested", "approved"].includes(
        verification.status,
      );
      const revision = current ? revisionOf(verification) : undefined;
      return callWithSession((init) =>
        saveGymBusinessVerification(
          gymId,
          revision === undefined ? details : { ...details, revision },
          init,
        ),
      );
    },
    onSuccess: accept,
    onSettled: () => refresh(),
  });
}

/** Submits the application shown for review (never an approval). */
export function useSubmitVerification(gymId: string) {
  const { accept, refresh } = useVerificationAnswer(gymId);
  return useMutation({
    mutationFn: (verification: GymVerification) =>
      callWithSession((init) =>
        submitGymBusinessVerification(gymId, { revision: revisionOf(verification) ?? 0 }, init),
      ),
    onSuccess: accept,
    onSettled: () => refresh(),
  });
}

/**
 * Adds a document in three steps: the backend announces it and answers a
 * presigned upload for exactly this file's type and size; the browser sends
 * the bytes directly to private storage (never through SimpleFit, and the
 * signed URL is used once and never stored); the backend then reads the
 * stored object itself and attaches it only if it matches. A file that did
 * not reach storage stays "uploading" until removed.
 */
export function useAddDocument(
  gymId: string,
  upload: (url: string, headers: Record<string, string>, file: File) => Promise<Response> = put,
) {
  const { accept, refresh } = useVerificationAnswer(gymId);
  return useMutation({
    mutationFn: async ({
      verification,
      file,
      kind,
    }: {
      verification: GymVerification;
      file: File;
      kind: GymVerificationEvidenceRequestKind;
    }) => {
      const announced = await callWithSession((init) =>
        createGymVerificationEvidence(
          gymId,
          {
            revision: revisionOf(verification) ?? 0,
            kind,
            file_name: file.name,
            content_type: file.type as GymVerificationEvidenceRequestContentType,
            byte_size: file.size,
          },
          init,
        ),
      );
      accept({ verification: announced.verification });
      const response = await upload(announced.upload.url, announced.upload.headers, file).catch(
        () => {
          throw new UploadFailedError();
        },
      );
      if (!response.ok) throw new UploadFailedError();
      return callWithSession((init) =>
        confirmGymVerificationEvidence(gymId, announced.evidence.id, init),
      );
    },
    onSuccess: accept,
    onSettled: () => refresh(),
  });
}

/** Confirms a document whose upload finished earlier (or was interrupted). */
export function useConfirmDocument(gymId: string) {
  const { accept, refresh } = useVerificationAnswer(gymId);
  return useMutation({
    mutationFn: (evidenceId: string) =>
      callWithSession((init) => confirmGymVerificationEvidence(gymId, evidenceId, init)),
    onSuccess: accept,
    onSettled: () => refresh(),
  });
}

/** Removes a document that was never submitted. */
export function useRemoveDocument(gymId: string) {
  const { accept, refresh } = useVerificationAnswer(gymId);
  return useMutation({
    mutationFn: ({
      verification,
      evidenceId,
    }: {
      verification: GymVerification;
      evidenceId: string;
    }) =>
      callWithSession((init) =>
        removeGymVerificationEvidence(
          gymId,
          evidenceId,
          { revision: revisionOf(verification) ?? 0 },
          init,
        ),
      ),
    onSuccess: accept,
    onSettled: () => refresh(),
  });
}

/**
 * The direct upload: only an `https:` URL (or the local development
 * storage on loopback) is followed. `content-length` is set by the browser
 * from the file itself (it is a forbidden request header).
 */
function put(url: string, headers: Record<string, string>, file: File) {
  const target = new URL(url);
  const loopback = ["localhost", "127.0.0.1"].includes(target.hostname);
  if (target.protocol !== "https:" && !(loopback && target.protocol === "http:"))
    return Promise.reject(new UploadFailedError());
  const sent = Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== "content-length"),
  );
  return fetch(target, { method: "PUT", headers: sent, body: file, credentials: "omit" });
}
