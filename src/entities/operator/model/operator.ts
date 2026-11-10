import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { callWithSession } from "@/entities/session";
import {
  createOperatorCredentialOptions,
  createOperatorStepUpOptions,
  endOperatorStepUp,
  getCurrentOperator,
  getGetCurrentOperatorQueryKey,
  registerOperatorCredential,
  verifyOperatorStepUp,
} from "@/shared/api/generated/endpoints/platform-operators/platform-operators";
import type { OperatorSelf } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
import { createCredential, getAssertion } from "@/shared/lib/webauthn";

/**
 * The viewer's platform operator state (SF-120; simplefit-api ADR 0028,
 * `GET /api/v1/admin/me`). The backend decides everything: whether the account
 * is an operator, its permissions, its security keys and this session's key
 * check. A 404 is the one answer for "not an operator", a suspended and a
 * revoked operator, so this module never tells them apart either: it is `null`.
 *
 * Nothing is stored in the browser. The cache is per session (it is dropped at
 * every session boundary, SF-28) and is re-read on focus and when the key check
 * lapses, so a revocation or a check ended in another tab shows on the next read.
 */
export type Operator = OperatorSelf;

export const operatorQueryKey = getGetCurrentOperatorQueryKey();

/** `GET /api/v1/admin/me`: the operator, or `null` (not an operator, suspended or revoked). */
export async function fetchOperator(signal?: AbortSignal): Promise<Operator | null> {
  try {
    const { operator } = await callWithSession((init) => getCurrentOperator({ ...init, signal }));
    return operator;
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** Milliseconds until this session's key check lapses; `undefined` without one. */
export function keyCheckRemaining(operator: Operator, now = Date.now()): number | undefined {
  if (operator.step_up === null) return undefined;
  return Math.max(Date.parse(operator.step_up.expires_at) - now, 0);
}

/** Whether this session holds a key check that hasn't lapsed (presentation only). */
export function hasKeyCheck(operator: Operator, now = Date.now()): boolean {
  const remaining = keyCheckRemaining(operator, now);
  return remaining !== undefined && remaining > 0;
}

/** Whether the operator holds `permission` (the backend's list; presentation only). */
export function grants(operator: Operator, permission: string): boolean {
  return operator.permissions.includes(permission);
}

/** Re-read slightly after the key check lapses, so the gate shows "check expired". */
const LAPSE_MARGIN_MS = 1_000;

export function useOperator() {
  return useQuery({
    queryKey: operatorQueryKey,
    queryFn: ({ signal }) => fetchOperator(signal),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const operator = query.state.data;
      if (!operator) return false;
      const remaining = keyCheckRemaining(operator);
      return remaining === undefined || remaining === 0 ? false : remaining + LAPSE_MARGIN_MS;
    },
  });
}

/**
 * The key ceremonies. Each asks the backend for a one-time challenge, runs it in
 * the browser (`shared/lib/webauthn`), sends the answer back and keeps only the
 * backend's resulting state. Errors are `ApiError` (branch on `code`) or
 * `WebAuthnError` (the browser refused or the person cancelled).
 */
export function useOperatorKeys() {
  const client = useQueryClient();

  const reread = useCallback(
    () => client.invalidateQueries({ queryKey: operatorQueryKey }),
    [client],
  );

  /** Registers a security key under `label` (1–60 characters, shown in key lists); `signal` cancels the prompt. */
  const registerKey = useCallback(
    async (label: string, signal?: AbortSignal) => {
      const { challenge_id, public_key } = await callWithSession((init) =>
        createOperatorCredentialOptions(init),
      );
      const answer = await createCredential(public_key, signal);
      const result = await callWithSession((init) =>
        registerOperatorCredential({ challenge_id, label, ...answer }, init),
      );
      await reread();
      return result;
    },
    [reread],
  );

  /** The key check for this session (step-up). */
  const verifyKey = useCallback(
    async (signal?: AbortSignal) => {
      const { challenge_id, public_key } = await callWithSession((init) =>
        createOperatorStepUpOptions(init),
      );
      const answer = await getAssertion(public_key, signal);
      const { step_up } = await callWithSession((init) =>
        verifyOperatorStepUp({ challenge_id, ...answer }, init),
      );
      client.setQueryData<Operator | null>(operatorQueryKey, (current) =>
        current ? { ...current, step_up } : current,
      );
      await reread();
      return step_up;
    },
    [client, reread],
  );

  /** Ends this session's key check ("Exit control plane"); the session stays signed in. */
  const endKeyCheck = useCallback(async () => {
    await callWithSession((init) => endOperatorStepUp(init));
    client.setQueryData<Operator | null>(operatorQueryKey, (current) =>
      current ? { ...current, step_up: null } : current,
    );
    await reread();
  }, [client, reread]);

  return { registerKey, verifyKey, endKeyCheck, reread };
}

const TICK_MS = 15_000;

/**
 * The current time for key-check display, re-rendered every few seconds and at
 * the moment the check lapses, so "n min left" and the switch to "check expired"
 * follow the clock without waiting for the next read.
 */
export function useKeyCheckClock(operator: Operator | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = operator?.step_up?.expires_at;
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, TICK_MS);
    const remaining = expiresAt === undefined ? undefined : Date.parse(expiresAt) - Date.now();
    const lapse =
      remaining === undefined || remaining <= 0
        ? undefined
        : window.setTimeout(tick, remaining + 50);
    return () => {
      window.clearInterval(interval);
      if (lapse !== undefined) window.clearTimeout(lapse);
    };
  }, [expiresAt]);
  return now;
}
