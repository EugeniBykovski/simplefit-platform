import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { callWithSession, onSessionBoundary, SessionChangedError } from "@/entities/session";
import {
  confirmMyEmailIdentityLink,
  getListMyEmailIdentitiesQueryKey,
  listMyEmailIdentities,
  requestMyEmailIdentityLink,
} from "@/shared/api/generated/endpoints/account/account";
import { CODE_LENGTH } from "@/shared/ui/code-input";

import {
  canonicalEmail,
  confirmFailureOf,
  EDITABLE,
  looksLikeEmail,
  requestFailureOf,
  type CodeStatus,
  type EmailStatus,
  type LinkOutcome,
} from "./link";

// Without a retry-after header, a throttled step unlocks after a minute.
const DEFAULT_THROTTLE_SECONDS = 60;

export type LinkStep =
  | { step: "email"; status: EmailStatus }
  | { step: "code"; status: CodeStatus }
  | { step: "linked"; outcome: LinkOutcome; email: string };

/** The current time, re-rendered every second while `active` (resend countdown). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * The email identity link flow (SF-78 on SF-77): email → code → linked.
 *
 * - Everything is decided by the API; this keeps the form inputs, the step and
 *   the resend countdown (`resend_after_seconds`), nothing else.
 * - The code lives only in this hook's state: never in storage, a URL, the
 *   query cache, a log or telemetry. It is cleared after success, on cancel,
 *   on a new code and at any session boundary.
 * - A 202 is not a link: the step only says a code was sent. Only a confirmed
 *   `linked` / `already_linked`, or the address found in the user's own
 *   identity list after an answer was lost, shows as verified.
 * - Requests go through `callWithSession`: a refreshed access token keeps the
 *   same server session, which the challenge is bound to; another signed-in
 *   identity ends the flow (the old challenge cannot be completed by it).
 */
export function useEmailIdentityLink() {
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<LinkStep>({ step: "email", status: "idle" });
  const [resendAt, setResendAt] = useState(0);
  const [expiresInMinutes, setExpiresInMinutes] = useState(10);
  const [throttledUntil, setThrottledUntil] = useState<number | undefined>();
  // The address the current code was sent to (what is shown and confirmed).
  const [sentTo, setSentTo] = useState("");
  const busy = useRef(false);
  const lastAction = useRef<"confirm" | "resend">("confirm");
  const now = useNow(state.step === "code");

  const reset = useCallback(() => {
    setSentTo("");
    busy.current = false;
    setCode("");
    setEmail("");
    setThrottledUntil(undefined);
    setState({ step: "email", status: "idle" });
  }, []);

  // A session boundary (sign-out, expiry, another account) clears the flow:
  // a challenge is bound to the session that requested it.
  useEffect(() => onSessionBoundary(reset), [reset]);

  const throttle = useCallback((seconds: number | undefined) => {
    setThrottledUntil(Date.now() + (seconds ?? DEFAULT_THROTTLE_SECONDS) * 1000);
    setState({ step: "code", status: "throttled" });
  }, []);

  /** Sends a code to `address`; resolves with whether it was accepted (202). */
  const sendCode = useCallback(async (address: string) => {
    const accepted = await callWithSession((init) =>
      requestMyEmailIdentityLink({ email: address }, init),
    );
    setSentTo(address);
    setResendAt(Date.now() + accepted.resend_after_seconds * 1000);
    setExpiresInMinutes(Math.max(1, Math.round(accepted.expires_in_seconds / 60)));
    setCode("");
  }, []);

  const request = useCallback(async () => {
    if (busy.current) return;
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setState({ step: "email", status: "invalid" });
      return;
    }
    busy.current = true;
    setState({ step: "email", status: "sending" });
    try {
      await sendCode(address);
      setState({ step: "code", status: "sent" });
    } catch (error) {
      if (error instanceof SessionChangedError) return;
      const { failure } = requestFailureOf(error);
      setState(
        failure === "session"
          ? { step: "code", status: "session" }
          : { step: "email", status: failure },
      );
    } finally {
      busy.current = false;
    }
  }, [email, sendCode]);

  const resend = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    lastAction.current = "resend";
    try {
      await sendCode(sentTo);
      // The new code supersedes the previous one (ADR 0024).
      setState({ step: "code", status: "resent" });
    } catch (error) {
      if (error instanceof SessionChangedError) return;
      const { failure, retryAfterSeconds } = requestFailureOf(error);
      if (failure === "limited") throttle(retryAfterSeconds);
      else setState({ step: "code", status: failure === "session" ? "session" : "error" });
    } finally {
      busy.current = false;
    }
  }, [sendCode, sentTo, throttle]);

  const linked = useCallback(
    (outcome: LinkOutcome, address: string) => {
      setCode("");
      void client.invalidateQueries({ queryKey: getListMyEmailIdentitiesQueryKey() });
      setState({ step: "linked", outcome, email: address });
    },
    [client],
  );

  /**
   * After an answer that says nothing about the outcome (network failure,
   * 5xx): the user's own identity list decides. Found → linked; not found →
   * the code may be tried again; unreadable → stay uncertain (`error`).
   */
  const reconcile = useCallback(async (): Promise<boolean> => {
    const target = canonicalEmail(sentTo);
    try {
      const { email_identities } = await callWithSession((init) => listMyEmailIdentities(init));
      if (email_identities.some((identity) => identity.email === target)) {
        linked("linked", target);
        return true;
      }
      setState({ step: "code", status: "error" });
    } catch (error) {
      if (error instanceof SessionChangedError) return true;
      setState({ step: "code", status: "error" });
    }
    return false;
  }, [linked, sentTo]);

  const confirm = useCallback(
    async (value: string) => {
      if (busy.current || value.length !== CODE_LENGTH) return;
      busy.current = true;
      lastAction.current = "confirm";
      setState({ step: "code", status: "submitting" });
      try {
        const result = await callWithSession((init) =>
          confirmMyEmailIdentityLink({ email: sentTo, code: value }, init),
        );
        linked(result.outcome, result.email_identity.email);
      } catch (error) {
        if (error instanceof SessionChangedError) return;
        const failure = confirmFailureOf(error);
        if (failure.status === "uncertain") await reconcile();
        else if (failure.status === "throttled") throttle(failure.retryAfterSeconds);
        else {
          if (failure.status !== "invalid") setCode("");
          setState({ step: "code", status: failure.status });
        }
      } finally {
        busy.current = false;
      }
    },
    [linked, reconcile, sentTo, throttle],
  );

  /**
   * "Try again" repeats what failed. After an uncertain confirmation it first
   * re-reads the identity list, so a link that did commit is never submitted
   * twice.
   */
  const retry = useCallback(async () => {
    if (lastAction.current === "resend") return resend();
    if (await reconcile()) return;
    return confirm(code);
  }, [resend, reconcile, confirm, code]);

  const changeEmail = useCallback((value: string) => {
    setEmail(value);
    setState((current) =>
      current.step === "email" && current.status === "invalid"
        ? { step: "email", status: "idle" }
        : current,
    );
  }, []);

  const changeCode = useCallback((value: string) => {
    setCode(value);
    setState((current) =>
      current.step === "code" && EDITABLE.has(current.status) && current.status !== "typing"
        ? { step: "code", status: "typing" }
        : current,
    );
  }, []);

  /** Back to the email step for another address (the old code stops being shown). */
  const chooseDifferentEmail = useCallback(() => {
    setCode("");
    setState({ step: "email", status: "idle" });
  }, []);

  // A throttle ends by itself once its delay has passed.
  const effective: LinkStep =
    state.step === "code" &&
    state.status === "throttled" &&
    throttledUntil !== undefined &&
    now >= throttledUntil
      ? { step: "code", status: "typing" }
      : state;
  const secondsUntilResend = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const codeStatus = effective.step === "code" ? effective.status : undefined;

  return {
    state: effective,
    email,
    sentTo,
    expiresInMinutes,
    code: codeStatus === "throttled" || codeStatus === "session" ? "" : code,
    changeEmail,
    changeCode,
    request,
    confirm,
    resend,
    retry,
    reset,
    chooseDifferentEmail,
    secondsUntilResend,
    canResend:
      secondsUntilResend === 0 &&
      codeStatus !== undefined &&
      !["throttled", "submitting", "session", "conflict"].includes(codeStatus),
  };
}
