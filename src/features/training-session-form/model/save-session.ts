"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { coachRelationshipsRootKey } from "@/entities/coach-relationship";
import { callWithSession } from "@/entities/session";
import {
  coachTrainingSessionKey,
  coachTrainingSessionsRootKey,
  type CoachTrainingSession,
} from "@/entities/training-session";
import {
  createMyCoachTrainingSession,
  updateMyCoachTrainingSession,
} from "@/shared/api/generated/endpoints/training/training";
import type {
  TrainingSessionCreateRequest,
  TrainingSessionUpdateRequest,
} from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

export type CreateBody = Omit<TrainingSessionCreateRequest, "client_request_id">;

/**
 * The idempotency key of a create (SF-62): one UUID per logical attempt.
 * Sending the same body again (a retry after a failure or a lost response)
 * reuses it, so the backend returns the session it may already have created
 * (`200`) instead of creating a second one. Any change to the body is a new
 * attempt with a new key: reusing a key for another body could only replay
 * the old session or conflict.
 */
export function useRequestKey() {
  const last = useRef<{ body: string; key: string } | null>(null);
  return {
    for(body: CreateBody): string {
      const serialized = JSON.stringify(body);
      if (last.current?.body !== serialized) {
        last.current = { body: serialized, key: crypto.randomUUID() };
      }
      return last.current.key;
    },
    reset() {
      last.current = null;
    },
  };
}

async function settle(client: ReturnType<typeof useQueryClient>, session: CoachTrainingSession) {
  client.setQueryData(coachTrainingSessionKey(session.id), session);
  await client.invalidateQueries({ queryKey: coachTrainingSessionsRootKey });
}

/** Creates one session; the caller supplies the body and its request key. */
export function useCreateTrainingSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, key }: { body: CreateBody; key: string }) =>
      callWithSession((init) =>
        createMyCoachTrainingSession({ ...body, client_request_id: key }, init),
      ).then((response) => response.training_session),
    onSuccess: (session) => settle(client, session),
    onError: async (error) => {
      // The relationship is not one the coach can plan for any more: the
      // fighter list is stale.
      if (isApiError(error) && error.status === 404)
        await client.invalidateQueries({ queryKey: coachRelationshipsRootKey });
    },
  });
}

/** Changes a planned session; `changes` holds only the fields the coach changed. */
export function useUpdateTrainingSession(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (changes: TrainingSessionUpdateRequest) =>
      callWithSession((init) => updateMyCoachTrainingSession(sessionId, changes, init)).then(
        (response) => response.training_session,
      ),
    onSuccess: (session) => settle(client, session),
    onError: async (error) => {
      // Completed or cancelled meanwhile (409), or no longer reachable (404):
      // the cached session is stale either way.
      if (isApiError(error) && (error.status === 409 || error.status === 404)) {
        await client.invalidateQueries({ queryKey: coachTrainingSessionKey(sessionId) });
        await client.invalidateQueries({ queryKey: coachTrainingSessionsRootKey });
      }
    },
  });
}
